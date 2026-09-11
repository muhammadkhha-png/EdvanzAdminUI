import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import {
  AdminInsightsService,
  CallListItem,
  SalesRep,
  TeacherUsage,
  UsageQuery,
} from '../../core/services/admin-insights.service';
import { InfiniteScrollDirective } from '../../shared/directives/infinite-scroll.directive';
import { DayStripComponent } from '../../shared/components/day-strip/day-strip.component';
import { TeacherPanelComponent } from '../../shared/components/teacher-panel/teacher-panel.component';
import { ToastService } from '../../core/services/toast.service';
import { CADENCE_LABELS, FEATURE_LABELS, OPERATOR_LABELS } from '../../shared/utils/feature-labels';
import { timeAgo } from '../../shared/utils/time-format';

const PAGE_SIZE = 25;

/**
 * THE TEACHER LIST — one screen, several views.
 *
 * This replaced FOUR screens that each listed teachers (`/overview`, `/usage`,
 * `/teachers`, `/activity`), every one showing a different slice of the same facts
 * with a different click behaviour. You could not tell which was "the" list, and
 * answering one question about a teacher meant visiting several of them.
 *
 * Now there is one list and one detail panel. A view is a preset filter over the
 * same rows, so switching view never changes the columns or where a click goes —
 * the pattern every CRM converges on (Stripe, Intercom, HubSpot).
 *
 * "To contact" is the exception that earns its shape: it is ranked and each row
 * carries a reason and an instruction, because working a call list is a different
 * act from looking someone up.
 */
@Component({
  selector: 'app-teachers-list',
  standalone: true,
  imports: [ReactiveFormsModule, InfiniteScrollDirective, DayStripComponent, TeacherPanelComponent],
  template: `
    <div class="page-header">
      <div>
        <h2>{{ viewTitle() }}</h2>
        <p>{{ viewBlurb() }}</p>
      </div>
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        (click)="exportCsv()"
        [disabled]="exporting()"
        title="Downloads every teacher in this view, with contact details and notes"
      >
        {{ exporting() ? 'Preparing…' : 'Export CSV' }}
      </button>
    </div>

    <!-- ── Views ───────────────────────────────────────────────────────── -->
    <div class="views" role="group" aria-label="Views">
      @for (v of views; track v.key) {
        <button
          type="button"
          class="view"
          [class.on]="view() === v.key"
          (click)="pickView(v.key)"
        >
          {{ v.label }}
        </button>
      }
    </div>

    <!-- ── Filters (hidden while working the call list) ────────────────── -->
    @if (view() !== 'to-contact') {
      <div class="filters panel">
        <input
          type="search"
          class="form-control search"
          placeholder="Search name, code, username or phone"
          [formControl]="search"
          aria-label="Search teachers"
        />
        <select class="form-select" [formControl]="cadence" aria-label="How often">
          <option value="">Any activity</option>
          <option value="Daily">Daily</option>
          <option value="MostDays">Most days</option>
          <option value="Weekly">Weekly</option>
          <option value="Rarely">Rarely</option>
          <option value="Dormant">Stopped</option>
          <option value="Never">Never used it</option>
        </select>
        <select class="form-select" [formControl]="operators" aria-label="Who works it">
          <option value="">Anyone working it</option>
          <option value="TeacherOnly">Teacher only</option>
          <option value="AssistantsOnly">Assistants only</option>
          <option value="TeacherAndAssistants">Teacher + assistants</option>
          <option value="Nobody">Nobody</option>
        </select>
        <select class="form-select" [formControl]="neverUsed" aria-label="Never opened">
          <option value="">Any feature</option>
          @for (f of featureKeys; track f) {
            <option [value]="f">Never opened {{ featureLabel(f) }}</option>
          }
        </select>
        <select class="form-select" [formControl]="salesRepId" aria-label="Sales rep">
          <option value="">Any sales rep</option>
          <option value="none">No rep assigned</option>
          @for (rep of reps(); track rep.id) {
            <option [value]="rep.id">{{ rep.name }}</option>
          }
        </select>
      </div>
    }

    <!-- ── The rows ────────────────────────────────────────────────────── -->
    <div class="panel list">
      @if (loading() && rows().length === 0 && calls().length === 0) {
        @for (i of skeletonRows; track i) {
          <div class="skeleton-row"></div>
        }
      } @else if (view() === 'to-contact') {
        @if (calls().length === 0) {
          <div class="empty">
            <h3>Nobody needs a call</h3>
            <p>No teacher is stalled, quiet or misconfigured right now.</p>
          </div>
        } @else {
          <ol class="calls">
            @for (c of calls(); track c.teacherId; let i = $index) {
              <li class="call" [attr.data-severity]="c.severity">
                <span class="rank tnum">{{ i + 1 }}</span>
                <div class="c-body">
                  <div class="c-line1">
                    <button type="button" class="c-name" (click)="open(c.teacherId)">
                      {{ c.fullName }}
                    </button>
                    <span class="c-reason">{{ c.reasonLabel }}</span>
                  </div>
                  <p class="c-why">{{ c.why }}</p>
                  <p class="c-do">{{ c.action }}</p>
                </div>
                @if (c.phoneNumber) {
                  <a class="c-call" [href]="'tel:' + c.phoneNumber">{{ c.phoneNumber }}</a>
                }
              </li>
            }
          </ol>
        }
      } @else if (rows().length === 0) {
        <div class="empty">
          <h3>No teacher matches this</h3>
          <p>Widen the filters, or pick another view.</p>
        </div>
      } @else {
        <div class="row-head" aria-hidden="true">
          <span>Teacher</span>
          <span>Plan</span>
          <span>Features used</span>
          <span>How often</span>
          <span>Who works it</span>
          <span>Last 30 days</span>
        </div>

        @for (t of rows(); track t.teacherId) {
          <button type="button" class="row" (click)="open(t.teacherId)">
            <span class="cell who">
              <span class="t-name">{{ t.fullName }}</span>
              <span class="t-meta">
                @if (t.phoneNumber) {
                  <span class="code">{{ t.phoneNumber }}</span>
                }
                <span class="code">{{ t.teacherCode }}</span>
              </span>
            </span>

            <span class="cell plan">
              <span class="p-name">{{ t.planType ?? '—' }}</span>
              <span class="sub">{{ t.subscriptionStatus }}</span>
            </span>

            <!-- The answer to "is he using all the features or not", per row. -->
            <span class="cell feats">
              <span class="f-count tnum" [class.low]="isLowAdoption(t)">
                {{ t.featuresAdoptedCount }} of {{ t.featuresEntitledCount }}
              </span>
              @if (t.featuresNeverUsed.length) {
                <span class="sub warn">
                  never: {{ featureList(t.featuresNeverUsed) }}
                </span>
              }
            </span>

            <span class="cell cadence">
              <span class="band">{{ cadenceLabel(t.cadence) }}</span>
              <span class="sub tnum">{{ t.activeDays30 }}/30 days</span>
            </span>

            <span class="cell ops">
              <span class="band">{{ operatorLabel(t.operators) }}</span>
              <span class="sub">{{ t.studentsAssignedToSession }}/{{ t.studentCount }} in a class</span>
            </span>

            <span class="cell strip">
              <app-day-strip [values]="t.sparkline30" />
              <span class="sub">{{ lastSeen(t) }}</span>
            </span>
          </button>
        }
      }

      @if (hasMore()) {
        <div
          appInfiniteScroll
          [appInfiniteScrollDisabled]="loading()"
          (scrolled)="loadMore()"
          class="infinite-scroll-sentinel"
        ></div>
        <div class="list-footer"><span class="spinner-sm"></span> Loading more</div>
      }
    </div>

    @if (shownCount() > 0) {
      <p class="list-count">Showing {{ shownCount() }} of {{ total() }} teachers</p>
    }

    @if (selected(); as id) {
      <app-teacher-panel [teacherId]="id" (closed)="close()" />
    }
  `,
  styles: [
    `
      /* ── Views ────────────────────────────────────────────────────── */
      .views {
        display: flex;
        gap: var(--s-2);
        flex-wrap: wrap;
        margin-bottom: var(--s-4);
      }
      .view {
        padding: 0.35rem 0.75rem;
        border: 1px solid var(--rule-strong);
        border-radius: 999px;
        background: var(--surface);
        color: var(--ink-2);
        font-size: var(--t-sm);
        cursor: pointer;
      }
      .view:hover {
        border-color: var(--ink-4);
        color: var(--ink);
      }
      .view.on {
        background: var(--ink);
        border-color: var(--ink);
        color: #fff;
        font-weight: 500;
      }

      .filters {
        display: grid;
        grid-template-columns: minmax(200px, 1.8fr) repeat(4, minmax(140px, 1fr));
        gap: var(--s-2);
        padding: var(--s-3);
        margin-bottom: var(--s-4);
      }
      .filters .form-select,
      .filters .form-control {
        font-size: var(--t-sm);
      }

      /* ── Grid rows ────────────────────────────────────────────────── */
      .list {
        overflow: hidden;
      }
      .row-head,
      .row {
        display: grid;
        grid-template-columns:
          minmax(170px, 1.5fr) 8rem minmax(150px, 1.4fr)
          8.5rem minmax(130px, 1fr) minmax(130px, 1fr);
        gap: var(--s-3);
        align-items: center;
        padding: var(--s-3) var(--s-4);
      }
      .row-head {
        font-size: var(--t-xs);
        font-weight: 600;
        color: var(--ink-3);
        background: var(--surface-2);
        border-bottom: 1px solid var(--rule-strong);
      }
      .row {
        border-bottom: 1px solid var(--rule);
        width: 100%;
        background: none;
        border-left: 0;
        border-right: 0;
        border-top: 0;
        text-align: left;
        font: inherit;
        color: inherit;
        cursor: pointer;
      }
      .row:hover {
        background: var(--surface-2);
      }
      .cell {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .t-name {
        font-weight: 500;
        font-size: var(--t-base);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .t-meta {
        display: flex;
        gap: var(--s-2);
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      .p-name,
      .band {
        font-size: var(--t-sm);
      }
      .sub {
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      .sub.warn {
        color: var(--risk);
      }
      .f-count {
        font-size: var(--t-sm);
        font-weight: 600;
      }
      /* Under half their features adopted — the upsell and onboarding surface. */
      .f-count.low {
        color: var(--risk);
      }

      /* ── Call rows ────────────────────────────────────────────────── */
      .calls {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .call {
        display: grid;
        grid-template-columns: 2.25rem 1fr auto;
        align-items: start;
        gap: var(--s-3);
        padding: var(--s-4);
        border-bottom: 1px solid var(--rule);
      }
      .call:last-child {
        border-bottom: 0;
      }
      .call[data-severity='attention'] {
        box-shadow: inset 3px 0 0 var(--gone);
      }
      .call[data-severity='warning'] {
        box-shadow: inset 3px 0 0 var(--risk);
      }
      .call[data-severity='info'] {
        box-shadow: inset 3px 0 0 var(--rule-strong);
      }
      .rank {
        font-size: var(--t-md);
        font-weight: 600;
        color: var(--ink-4);
        line-height: 1.35;
      }
      .c-body {
        min-width: 0;
      }
      .c-line1 {
        display: flex;
        align-items: baseline;
        gap: var(--s-2);
        flex-wrap: wrap;
      }
      .c-name {
        font-size: var(--t-md);
        font-weight: 600;
        color: var(--ink);
        border: 0;
        background: none;
        padding: 0;
        font-family: inherit;
        cursor: pointer;
      }
      .c-name:hover {
        color: var(--accent);
      }
      .c-reason {
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      .c-why {
        margin: var(--s-1) 0 0;
        font-size: var(--t-sm);
        color: var(--ink-2);
        line-height: 1.5;
      }
      /* The instruction is the point of the row — the only thing here with weight. */
      .c-do {
        margin: var(--s-1) 0 0;
        font-size: var(--t-sm);
        font-weight: 500;
        color: var(--accent-ink);
        line-height: 1.5;
      }
      .c-call {
        font-family: var(--font-mono);
        font-size: var(--t-sm);
        white-space: nowrap;
        padding: 0.4rem 0.7rem;
        border: 1px solid var(--rule-strong);
        border-radius: var(--r-sm);
        color: var(--accent);
        text-decoration: none;
      }
      .c-call:hover {
        border-color: var(--accent);
        background: var(--accent-soft);
      }

      .empty {
        padding: var(--s-7) var(--s-4);
        text-align: center;
      }
      .empty h3 {
        margin: 0 0 var(--s-2);
        font-size: var(--t-md);
      }
      .empty p {
        margin: 0;
        color: var(--ink-3);
        font-size: var(--t-sm);
      }
      .skeleton-row {
        height: 64px;
        border-bottom: 1px solid var(--rule);
        background: linear-gradient(90deg, var(--surface) 25%, var(--surface-2) 50%, var(--surface) 75%);
        background-size: 200% 100%;
        animation: shimmer 1.4s infinite;
      }
      @keyframes shimmer {
        to {
          background-position: -200% 0;
        }
      }

      @media (max-width: 1199.98px) {
        .filters {
          grid-template-columns: repeat(2, 1fr);
        }
        .filters .search {
          grid-column: 1 / -1;
        }
        .row-head,
        .row {
          grid-template-columns: minmax(150px, 1.4fr) minmax(140px, 1.3fr) 8rem minmax(120px, 1fr);
        }
        .row-head span:nth-child(2),
        .row-head span:nth-child(5),
        .plan,
        .ops {
          display: none;
        }
      }

      /* Phones: stacked ruled blocks, never a table read sideways. */
      @media (max-width: 767.98px) {
        .row-head {
          display: none;
        }
        .row {
          grid-template-columns: 1fr auto;
          grid-template-areas: 'who cadence' 'feats feats' 'strip strip';
          gap: var(--s-2);
        }
        .who {
          grid-area: who;
        }
        .cadence {
          grid-area: cadence;
          align-items: flex-end;
        }
        .feats {
          grid-area: feats;
          flex-direction: row;
          align-items: baseline;
          gap: var(--s-2);
          flex-wrap: wrap;
        }
        .strip {
          grid-area: strip;
        }
        .plan,
        .ops {
          display: none;
        }
        .call {
          grid-template-columns: 1.75rem 1fr;
        }
        .c-call {
          grid-column: 2;
          justify-self: start;
          margin-top: var(--s-2);
        }
      }
    `,
  ],
})
export class TeachersListComponent implements OnInit {
  private readonly insights = inject(AdminInsightsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly rows = signal<TeacherUsage[]>([]);
  protected readonly calls = signal<CallListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly reps = signal<SalesRep[]>([]);
  protected readonly exporting = signal(false);
  protected readonly selected = signal<number | null>(null);
  protected readonly view = signal<string>('to-contact');
  protected readonly skeletonRows = [1, 2, 3, 4, 5, 6, 7, 8];

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly cadence = new FormControl('', { nonNullable: true });
  protected readonly operators = new FormControl('', { nonNullable: true });
  protected readonly neverUsed = new FormControl('', { nonNullable: true });
  protected readonly salesRepId = new FormControl('', { nonNullable: true });

  protected readonly featureKeys = Object.keys(FEATURE_LABELS);

  private page = 1;
  private hydrated = false;

  /**
   * The views. Each is a preset filter over the same rows — switching one never
   * changes the columns or where a click goes.
   */
  protected readonly views = [
    { key: 'to-contact', label: 'To contact' },
    { key: 'not-using', label: 'Not using it' },
    { key: 'never-set-up', label: 'Never set up' },
    { key: 'never-used', label: 'Unused features' },
    { key: 'ending-soon', label: 'Ending soon' },
    { key: 'set-up', label: 'Properly set up' },
    { key: 'all', label: 'Everyone' },
  ];

  protected readonly shownCount = computed(() =>
    this.view() === 'to-contact' ? this.calls().length : this.rows().length,
  );
  protected readonly hasMore = computed(() => this.shownCount() < this.total());

  protected readonly viewTitle = computed(
    () => this.views.find((v) => v.key === this.view())?.label ?? 'Teachers',
  );

  protected readonly viewBlurb = computed(() => VIEW_BLURBS[this.view()] ?? '');

  ngOnInit(): void {
    this.insights.getSalesReps().subscribe((r) => this.reps.set(r));

    this.route.queryParamMap.subscribe((params) => {
      const teacher = params.get('teacher');
      this.selected.set(teacher ? Number(teacher) : null);

      const nextView = params.get('view') ?? 'to-contact';

      // Hydrate the filters from the URL once, so a link from the Numbers page
      // arrives already filtered rather than silently showing everything.
      if (!this.hydrated) {
        const feature = params.get('feature');
        if (feature) this.neverUsed.setValue(feature, { emitEvent: false });
        const rep = params.get('salesRepId');
        if (rep) this.salesRepId.setValue(rep, { emitEvent: false });
      }

      // Opening or closing the panel must NOT refetch — that would rebuild the
      // rows under the reader and throw away their scroll position.
      if (nextView !== this.view() || !this.hydrated) {
        this.view.set(nextView);
        this.hydrated = true;
        this.reload();
      }
    });

    for (const control of [this.search, this.cadence, this.operators, this.neverUsed, this.salesRepId]) {
      control.valueChanges
        .pipe(debounceTime(control === this.search ? 350 : 0), distinctUntilChanged())
        .subscribe(() => this.reload());
    }
  }

  protected pickView(key: string): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: key, teacher: null },
      queryParamsHandling: 'merge',
    });
  }

  private reload(): void {
    this.page = 1;
    this.rows.set([]);
    this.calls.set([]);
    this.total.set(0);
    this.fetch();
  }

  protected loadMore(): void {
    if (this.loading() || !this.hasMore()) return;
    this.page += 1;
    this.fetch();
  }

  private fetch(): void {
    this.loading.set(true);

    if (this.view() === 'to-contact') {
      this.insights.getCallList(null, this.page * PAGE_SIZE).subscribe({
        next: (d) => {
          this.calls.set(d.items);
          this.total.set(d.totalInView);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
      return;
    }

    this.insights.getTeachers(this.buildQuery()).subscribe({
      next: (res) => {
        this.rows.update((current) => [...current, ...res.data]);
        this.total.set(res.totalCount);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** The view's preset, then anything the reader added on top. */
  private buildQuery(): UsageQuery {
    const q: UsageQuery = { page: this.page, pageSize: PAGE_SIZE, subscribedOnly: true };

    switch (this.view()) {
      case 'not-using':
        q.isActive = false;
        break;
      case 'never-set-up':
        q.hasRealData = false;
        break;
      case 'ending-soon':
        q.subscriptionStatus = 'ExpiringSoon';
        break;
      case 'set-up':
        q.hasRealData = true;
        break;
      case 'all':
        // Everyone means everyone — including the free and expired base.
        delete q.subscribedOnly;
        break;
    }

    if (this.search.value.trim()) q.search = this.search.value.trim();
    if (this.cadence.value) q.cadence = this.cadence.value as UsageQuery['cadence'];
    if (this.operators.value) q.operators = this.operators.value as UsageQuery['operators'];
    if (this.neverUsed.value) q.neverUsedFeature = this.neverUsed.value as UsageQuery['neverUsedFeature'];
    if (this.salesRepId.value === 'none') q.unassignedSalesRep = true;
    else if (this.salesRepId.value) q.salesRepId = Number(this.salesRepId.value);

    return q;
  }

  protected open(teacherId: number): void {
    this.selected.set(teacherId);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { teacher: teacherId },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected close(): void {
    this.selected.set(null);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { teacher: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected exportCsv(): void {
    this.exporting.set(true);
    const q = this.buildQuery();
    delete q.page;
    delete q.pageSize;

    this.insights.exportTeachers(q).subscribe({
      next: ({ blob, filename }) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        this.exporting.set(false);
        this.toast.success('Export ready.');
      },
      error: () => this.exporting.set(false),
    });
  }

  /** Fewer than half their features adopted. */
  protected isLowAdoption(t: TeacherUsage): boolean {
    return t.featuresEntitledCount > 0 && t.featuresAdoptedCount * 2 < t.featuresEntitledCount;
  }

  protected featureList(keys: string[]): string {
    return keys.map((k) => FEATURE_LABELS[k] ?? k).join(', ');
  }

  protected featureLabel(key: string): string {
    return FEATURE_LABELS[key] ?? key;
  }

  protected cadenceLabel(key: string): string {
    return CADENCE_LABELS[key] ?? key;
  }

  protected operatorLabel(key: string): string {
    return OPERATOR_LABELS[key] ?? key;
  }

  protected lastSeen(t: TeacherUsage): string {
    return t.lastActivityAt ? `last active ${timeAgo(t.lastActivityAt)}` : 'never active';
  }
}

/** One line under each view title, saying plainly what the list contains. */
const VIEW_BLURBS: Record<string, string> = {
  'to-contact': 'Worked from the top. Each teacher appears once, under the thing that matters most.',
  'not-using': 'Subscribed, but nothing at all in the last 30 days.',
  'never-set-up': 'Subscribed and never set anything up that would work.',
  'never-used': 'Paying for features they have never opened. Pick a feature to narrow it.',
  'ending-soon': 'Subscriptions ending within the next few days.',
  'set-up': 'Students in a class that has class days.',
  all: 'Every teacher, including free and expired accounts.',
};
