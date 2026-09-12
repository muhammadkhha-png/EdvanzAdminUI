import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import {
  AdminInsightsService,
  SalesRep,
  TeacherUsage,
  UsageQuery,
} from '../../core/services/admin-insights.service';
import { ToastService } from '../../core/services/toast.service';
import { TeacherRowDetailComponent } from './teacher-row-detail.component';
import { FEATURE_LABELS } from '../../shared/utils/feature-labels';
import { formatDate, timeAgo } from '../../shared/utils/time-format';

const PAGE_SIZE = 25;

/**
 * THE TEACHER LIST.
 *
 * One table. The views along the top are presets over the same rows — switching one
 * never changes the columns, never changes where a click goes, and never hides the
 * toolbar. That last point is why this exists: the previous version hid the entire
 * filter bar on the view it opened with, so the default state of the only teacher
 * list had no way to look anybody up.
 *
 * Every row carries the state of the account, and clicking it opens the rest of that
 * account plus every action an admin can take on it — including the destructive ones,
 * which a previous merge of these screens quietly dropped.
 */
@Component({
  selector: 'app-teachers-list',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TeacherRowDetailComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <div>
        <h1>Teachers</h1>
        <p class="sub">{{ viewBlurb() }}</p>
      </div>
      <div class="head-acts">
        <button type="button" class="btn" [disabled]="exporting()" (click)="exportCsv()">
          {{ exporting() ? 'Preparing…' : 'Export CSV' }}
        </button>
        <a class="btn primary" routerLink="/teacher/new">New teacher</a>
      </div>
    </header>

    <!-- ── Views: presets over the same table ─────────────────────────────── -->
    <div class="views" role="group" aria-label="Views">
      @for (v of views; track v.key) {
        <button type="button" class="view" [class.on]="view() === v.key" (click)="pickView(v.key)">
          {{ v.label }}
        </button>
      }
    </div>

    <!-- ── The toolbar. ALWAYS visible, on every view. ────────────────────── -->
    <div class="bar">
      <input
        type="search"
        class="search"
        placeholder="Search name, code, username or phone"
        aria-label="Search teachers"
        [formControl]="search"
      />

      <select [formControl]="subscription" aria-label="Subscription">
        <option value="">Any subscription</option>
        <option value="Active">Paying</option>
        <option value="ExpiringSoon">Ending soon</option>
        <option value="Expired">Not paying</option>
      </select>

      <select [formControl]="plan" aria-label="Plan">
        <option value="">Any plan</option>
        <option value="Full">Full</option>
        <option value="Managerial">Managerial</option>
        <option value="ManagerialPlus">Managerial + Parents</option>
      </select>

      <select [formControl]="activity" aria-label="Using it">
        <option value="">Using it or not</option>
        <option value="yes">Used it in 30 days</option>
        <option value="no">Nothing in 30 days</option>
      </select>

      <select [formControl]="neverUsed" aria-label="Never opened a feature">
        <option value="">Any feature</option>
        @for (f of featureKeys; track f) {
          <option [value]="f">Never opened {{ featureLabel(f) }}</option>
        }
      </select>

      <select [formControl]="salesRepId" aria-label="Sales rep">
        <option value="">Any sales rep</option>
        <option value="none">No rep assigned</option>
        @for (rep of reps(); track rep.id) {
          <option [value]="rep.id">{{ rep.name }}</option>
        }
      </select>

      <label class="date">
        Registered from
        <input type="date" [formControl]="registeredFrom" />
      </label>
      <label class="date">
        to
        <input type="date" [formControl]="registeredTo" />
      </label>

      <select [formControl]="sortBy" aria-label="Sort by">
        <option value="LastActivity">Last activity</option>
        <option value="SubscribedAt">Subscribed on</option>
        <option value="RegisteredAt">Registered</option>
        <option value="StudentCount">Students</option>
        <option value="Name">Name</option>
      </select>

      <label class="toggle">
        <input type="checkbox" [formControl]="incompleteFirst" />
        Incomplete first
      </label>

      @if (anyFilter()) {
        <button type="button" class="clear" (click)="clearFilters()">Clear filters</button>
      }
    </div>

    <!-- ── The rows ───────────────────────────────────────────────────────── -->
    @if (loading() && rows().length === 0) {
      @for (i of skeleton; track i) {
        <div class="sk-row"></div>
      }
    } @else if (rows().length === 0) {
      <div class="empty">
        <h2>No teacher matches this</h2>
        <p>Widen the filters, or pick another view.</p>
        @if (anyFilter()) {
          <button type="button" class="btn" (click)="clearFilters()">Clear filters</button>
        }
      </div>
    } @else {
      <div class="t-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Teacher</th>
              <th scope="col">Subscription</th>
              <th scope="col">Subscribed</th>
              <th scope="col">Registered</th>
              <th scope="col">Students</th>
              <th scope="col">Classes</th>
              <th scope="col">Team</th>
              <th scope="col">Last login</th>
              <th scope="col">Last activity</th>
              <th scope="col"><span class="sr">Open</span></th>
            </tr>
          </thead>
          <tbody>
            @for (t of rows(); track t.teacherId) {
              <tr
                class="row"
                [class.on]="openId() === t.teacherId"
                (click)="toggleRow(t.teacherId)"
                [attr.aria-expanded]="openId() === t.teacherId"
              >
                <td class="who">
                  <span class="name">{{ t.fullName }}</span>
                  <span class="meta">
                    <span class="tnum">{{ t.teacherCode }}</span>
                    @if (t.phoneNumber) {
                      <span class="tnum phone">{{ t.phoneNumber }}</span>
                    } @else {
                      <span class="nophone">no phone</span>
                    }
                  </span>
                  @if (flags(t); as fl) {
                    @if (fl.length) {
                      <span class="flags">
                        @for (f of fl; track f.text) {
                          <span class="flag" [attr.data-tone]="f.tone">{{ f.text }}</span>
                        }
                      </span>
                    }
                  }
                </td>

                <td>
                  <span class="plan">{{ planLabel(t.planType) }}</span>
                  <!-- The DAY COUNT, never the status band: the band uses a different
                       threshold from the console and the two read as a contradiction. -->
                  <span class="sub-days" [attr.data-tone]="subTone(t)">{{ subDays(t) }}</span>
                </td>

                <td class="tnum">{{ t.subscriptionStartDate ? day(t.subscriptionStartDate) : '—' }}</td>
                <td class="tnum">{{ day(t.registeredAt) }}</td>

                <td>
                  <span class="tnum">{{ t.studentCount }}</span>
                  <span class="sub2" [attr.data-tone]="studentTone(t)">
                    {{ t.studentsAssignedToSession }} in a class
                  </span>
                </td>

                <td class="tnum">{{ t.sessionCount }}</td>
                <td class="tnum">{{ t.activeAssistantCount }}</td>
                <td class="tnum small">{{ t.lastLoginAt ? ago(t.lastLoginAt) : 'never' }}</td>

                <td class="small">
                  <span [attr.data-tone]="t.activeDays30 === 0 ? 'gone' : ''">
                    {{ t.lastActivityAt ? ago(t.lastActivityAt) : 'never' }}
                  </span>
                  @if (assistantLed(t)) {
                    <span class="sub2">· assistant</span>
                  }
                </td>

                <td class="chev" aria-hidden="true">{{ openId() === t.teacherId ? '▴' : '▾' }}</td>
              </tr>

              @if (openId() === t.teacherId) {
                <tr class="detail-row">
                  <td colspan="10">
                    <app-teacher-row-detail [row]="t" />
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>

      <div class="foot">
        <span>Showing {{ rows().length }} of {{ total() }}</span>
        @if (rows().length < total()) {
          <button type="button" class="btn" [disabled]="loading()" (click)="loadMore()">
            {{ loading() ? 'Loading…' : 'Show more' }}
          </button>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        padding: var(--s-5);
        overflow-x: hidden;
      }

      .head {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--s-4);
        margin-bottom: var(--s-4);
      }
      h1 {
        margin: 0;
        font-size: var(--t-xl);
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      .sub {
        margin: var(--s-2) 0 0;
        font-size: var(--t-sm);
        color: var(--ink-3);
        max-width: 72ch;
      }
      .head-acts {
        display: flex;
        gap: var(--s-2);
      }
      .btn {
        display: inline-flex;
        align-items: center;
        min-height: 40px;
        padding: 0 var(--s-4);
        border: 0;
        border-radius: var(--r-sm);
        background: var(--quiet-soft);
        font: inherit;
        font-size: var(--t-sm);
        font-weight: 600;
        color: var(--ink-2);
        text-decoration: none;
        cursor: pointer;
      }
      .btn:hover:not(:disabled) {
        background: var(--rule);
        color: var(--ink);
      }
      .btn.primary {
        background: var(--accent);
        color: #fff;
      }
      .btn.primary:hover {
        background: var(--accent-hover);
        color: #fff;
      }
      .btn:disabled {
        opacity: 0.55;
        cursor: default;
      }

      .views {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-2);
        margin-bottom: var(--s-3);
      }
      .view {
        min-height: 36px;
        padding: 0 var(--s-3);
        border: 0;
        border-radius: 999px;
        background: var(--quiet-soft);
        font: inherit;
        font-size: var(--t-sm);
        color: var(--ink-2);
        cursor: pointer;
      }
      .view.on {
        background: var(--ink);
        color: #fff;
        font-weight: 600;
      }

      /* Always visible. Never hidden by a view — that was the bug. */
      .bar {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-2);
        align-items: center;
        margin-bottom: var(--s-4);
      }
      .bar input[type='search'],
      .bar select,
      .bar input[type='date'] {
        min-height: 40px;
        padding: 0 var(--s-3);
        border: 1px solid var(--rule-strong);
        border-radius: var(--r-sm);
        background: var(--surface);
        font: inherit;
        font-size: var(--t-sm);
        color: var(--ink);
      }
      .search {
        flex: 1 1 260px;
        min-width: 200px;
      }
      .date {
        display: inline-flex;
        align-items: center;
        gap: var(--s-2);
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      .toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 40px;
        padding: 0 var(--s-3);
        border-radius: var(--r-sm);
        background: var(--quiet-soft);
        font-size: var(--t-sm);
        color: var(--ink-2);
        cursor: pointer;
      }
      .clear {
        min-height: 40px;
        padding: 0 var(--s-3);
        border: 0;
        border-radius: var(--r-sm);
        background: transparent;
        font: inherit;
        font-size: var(--t-sm);
        color: var(--accent);
        cursor: pointer;
        text-decoration: underline;
      }
      .bar :focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 1px;
      }

      /* The table scrolls inside its own box; the page never scrolls sideways. */
      .t-scroll {
        overflow-x: auto;
        background: var(--surface);
        border-radius: var(--r-md);
      }
      table {
        width: 100%;
        min-width: 1040px;
        border-collapse: collapse;
        font-size: var(--t-sm);
      }
      thead th {
        position: sticky;
        top: 0;
        z-index: var(--z-sticky);
        padding: var(--s-3);
        background: var(--surface);
        text-align: left;
        font-size: var(--t-xs);
        font-weight: 600;
        color: var(--ink-3);
        white-space: nowrap;
      }
      tbody td {
        padding: var(--s-3);
        vertical-align: top;
      }
      .row {
        cursor: pointer;
      }
      .row:nth-child(4n + 1) {
        background: var(--surface-2);
      }
      .row:hover {
        background: var(--accent-soft);
      }
      .row.on {
        background: var(--accent-soft);
      }

      .who {
        min-width: 220px;
      }
      .name {
        display: block;
        font-weight: 650;
        color: var(--ink);
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-2);
        margin-top: 2px;
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      .phone {
        color: var(--ink-2);
        font-weight: 600;
      }
      .nophone {
        color: var(--gone);
        font-weight: 600;
      }

      /* Flags name the missing step in words. Colour is never the only signal. */
      .flags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: var(--s-2);
      }
      .flag {
        padding: 2px 7px;
        border-radius: 999px;
        font-size: var(--t-xs);
        font-weight: 600;
        white-space: nowrap;
      }
      .flag[data-tone='risk'] {
        background: var(--risk-soft);
        color: var(--risk);
      }
      .flag[data-tone='gone'] {
        background: var(--gone-soft);
        color: var(--gone);
      }

      .plan {
        display: block;
        font-weight: 600;
        color: var(--ink-2);
      }
      .sub-days,
      .sub2 {
        display: block;
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      [data-tone='live'] {
        color: var(--live);
      }
      [data-tone='risk'] {
        color: var(--risk);
      }
      [data-tone='gone'] {
        color: var(--gone);
      }
      .small {
        font-size: var(--t-xs);
        color: var(--ink-2);
      }
      .chev {
        color: var(--ink-4);
        text-align: right;
      }

      .detail-row td {
        padding: 0 var(--s-3) var(--s-3);
        background: var(--accent-soft);
      }

      .foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s-3);
        margin-top: var(--s-3);
        font-size: var(--t-xs);
        color: var(--ink-3);
      }

      .sk-row {
        height: 64px;
        margin-bottom: 2px;
        border-radius: var(--r-sm);
        background: var(--quiet-soft);
      }
      .empty {
        padding: var(--s-7) 0;
        text-align: center;
      }
      .empty h2 {
        margin-bottom: var(--s-2);
      }
      .empty p {
        color: var(--ink-3);
        margin-bottom: var(--s-4);
      }
      .sr {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
      }

      @media (max-width: 640px) {
        :host {
          padding: var(--s-4) var(--s-3);
        }
      }
    `,
  ],
})
export class TeachersListComponent {
  private readonly insights = inject(AdminInsightsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly rows = signal<TeacherUsage[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly reps = signal<SalesRep[]>([]);
  protected readonly exporting = signal(false);
  protected readonly openId = signal<number | null>(null);
  protected readonly view = signal<string>('all');
  protected readonly skeleton = [1, 2, 3, 4, 5, 6, 7, 8];
  protected readonly featureKeys = Object.keys(FEATURE_LABELS);

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly subscription = new FormControl('', { nonNullable: true });
  protected readonly plan = new FormControl('', { nonNullable: true });
  protected readonly activity = new FormControl('', { nonNullable: true });
  protected readonly neverUsed = new FormControl('', { nonNullable: true });
  protected readonly salesRepId = new FormControl('', { nonNullable: true });
  protected readonly registeredFrom = new FormControl('', { nonNullable: true });
  protected readonly registeredTo = new FormControl('', { nonNullable: true });
  protected readonly sortBy = new FormControl('LastActivity', { nonNullable: true });
  protected readonly incompleteFirst = new FormControl(false, { nonNullable: true });

  private page = 1;
  private hydrated = false;

  /** Presets over the same rows. The columns and the click target never change. */
  protected readonly views = [
    { key: 'all', label: 'Everyone' },
    { key: 'newly-subscribed', label: 'Newly subscribed' },
    { key: 'newly-registered', label: 'Newly registered' },
    { key: 'not-using', label: 'Not using it' },
    { key: 'incomplete', label: 'Incomplete setup' },
    { key: 'ending-soon', label: 'Ending soon' },
  ];

  protected readonly viewBlurb = computed(() => VIEW_BLURBS[this.view()] ?? '');

  protected readonly anyFilter = computed(
    () =>
      !!this.search.value ||
      !!this.subscription.value ||
      !!this.plan.value ||
      !!this.activity.value ||
      !!this.neverUsed.value ||
      !!this.salesRepId.value ||
      !!this.registeredFrom.value ||
      !!this.registeredTo.value,
  );

  constructor() {
    this.insights.getSalesReps().subscribe((r) => this.reps.set(r));

    this.route.queryParamMap.subscribe((params) => {
      const nextView = params.get('view') ?? 'all';
      const teacher = params.get('teacher');
      this.openId.set(teacher ? Number(teacher) : null);

      // Hydrated ONCE, with emitEvent:false — writing these back through the controls
      // would fire valueChanges and trigger a second fetch for every param.
      if (!this.hydrated) {
        const set = (c: FormControl<string>, key: string) => {
          const v = params.get(key);
          if (v) c.setValue(v, { emitEvent: false });
        };
        set(this.search, 'q');
        set(this.subscription, 'subscription');
        set(this.plan, 'plan');
        set(this.activity, 'activity');
        set(this.neverUsed, 'feature');
        set(this.salesRepId, 'salesRepId');
        set(this.registeredFrom, 'from');
        set(this.registeredTo, 'to');
        set(this.sortBy, 'sort');
        if (params.get('incomplete') === '1') {
          this.incompleteFirst.setValue(true, { emitEvent: false });
        }
      }

      // Opening a row must NOT refetch — that would rebuild the list under the reader
      // and throw away their scroll position.
      if (nextView !== this.view() || !this.hydrated) {
        this.view.set(nextView);
        this.hydrated = true;
        this.reload();
      }
    });

    // Typed as AbstractControl because the toggle is a boolean control and the rest
    // are strings — a mixed array makes valueChanges a union that .pipe() cannot
    // resolve, and the fix is the declared type rather than casting at each call.
    const filters: AbstractControl<unknown>[] = [
      this.search,
      this.subscription,
      this.plan,
      this.activity,
      this.neverUsed,
      this.salesRepId,
      this.registeredFrom,
      this.registeredTo,
      this.sortBy,
      this.incompleteFirst,
    ];

    for (const control of filters) {
      control.valueChanges
        .pipe(debounceTime(control === this.search ? 350 : 0), distinctUntilChanged())
        .subscribe(() => {
          this.syncUrl();
          this.reload();
        });
    }
  }

  protected pickView(key: string): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: key, teacher: null },
      queryParamsHandling: 'merge',
    });
  }

  /** Mirrors the filters into the URL so a filtered list can be refreshed or sent to someone. */
  private syncUrl(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.search.value || null,
        subscription: this.subscription.value || null,
        plan: this.plan.value || null,
        activity: this.activity.value || null,
        feature: this.neverUsed.value || null,
        salesRepId: this.salesRepId.value || null,
        from: this.registeredFrom.value || null,
        to: this.registeredTo.value || null,
        sort: this.sortBy.value === 'LastActivity' ? null : this.sortBy.value,
        incomplete: this.incompleteFirst.value ? '1' : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected toggleRow(id: number): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { teacher: this.openId() === id ? null : id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private reload(): void {
    this.page = 1;
    this.rows.set([]);
    this.total.set(0);
    this.fetch();
  }

  protected loadMore(): void {
    if (this.loading()) return;
    this.page += 1;
    this.fetch();
  }

  private fetch(): void {
    this.loading.set(true);
    this.insights.getTeachers(this.buildQuery()).subscribe({
      next: (res) => {
        this.rows.update((current) => [...current, ...res.data]);
        this.total.set(res.totalCount);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** The view's preset, then whatever the reader added on top of it. */
  private buildQuery(): UsageQuery {
    const q: UsageQuery = { page: this.page, pageSize: PAGE_SIZE };

    switch (this.view()) {
      case 'newly-subscribed':
        q.subscribedWithinDays = 30;
        break;
      case 'newly-registered':
        q.sortBy = 'RegisteredAt';
        q.sortDirection = 'Desc';
        break;
      case 'not-using':
        q.isActive = false;
        q.subscribedOnly = true;
        break;
      case 'incomplete':
        q.incompleteFirst = true;
        q.subscribedOnly = true;
        break;
      case 'ending-soon':
        q.subscriptionStatus = 'ExpiringSoon';
        break;
    }

    if (this.search.value.trim()) q.search = this.search.value.trim();
    if (this.subscription.value) q.subscriptionStatus = this.subscription.value;
    if (this.plan.value) q.planType = this.plan.value;
    if (this.activity.value) q.isActive = this.activity.value === 'yes';
    if (this.neverUsed.value) q.neverUsedFeature = this.neverUsed.value as UsageQuery['neverUsedFeature'];
    if (this.salesRepId.value === 'none') q.unassignedSalesRep = true;
    else if (this.salesRepId.value) q.salesRepId = Number(this.salesRepId.value);
    if (this.registeredFrom.value) q.registeredFrom = this.registeredFrom.value;
    if (this.registeredTo.value) q.registeredTo = this.registeredTo.value;
    if (this.incompleteFirst.value) q.incompleteFirst = true;
    if (this.sortBy.value !== 'LastActivity') {
      q.sortBy = this.sortBy.value as UsageQuery['sortBy'];
      q.sortDirection = this.sortBy.value === 'Name' ? 'Asc' : 'Desc';
    }

    return q;
  }

  protected exportCsv(): void {
    this.exporting.set(true);
    const q = this.buildQuery();
    delete q.page;
    delete q.pageSize;

    this.insights.exportTeachers(q).subscribe({
      next: ({ blob, filename }) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.exporting.set(false);
      },
      error: () => {
        this.exporting.set(false);
        this.toast.error('The export did not come back. Try again.');
      },
    });
  }

  protected clearFilters(): void {
    for (const c of [
      this.search,
      this.subscription,
      this.plan,
      this.activity,
      this.neverUsed,
      this.salesRepId,
      this.registeredFrom,
      this.registeredTo,
    ]) {
      c.setValue('', { emitEvent: false });
    }
    this.syncUrl();
    this.reload();
  }

  // ── Row rendering ─────────────────────────────────────────────────────────

  /**
   * What is missing on this account, in words. Never colour alone — each flag says
   * what the problem IS, so a colourblind reader and a screen reader get the same
   * information as everyone else.
   */
  protected flags(t: TeacherUsage): { text: string; tone: string }[] {
    const out: { text: string; tone: string }[] = [];
    if (t.studentCount === 0) out.push({ text: 'no students', tone: 'gone' });
    else if (t.studentsAssignedToSession === 0)
      out.push({ text: 'students not in a class', tone: 'risk' });
    if (t.sessionCount > 0 && t.sessionsWithOccurrences === 0)
      out.push({ text: 'classes have no class days', tone: 'risk' });
    if (!t.hasEverMarkedAttendance) out.push({ text: 'never marked attendance', tone: 'risk' });

    const days = t.subscriptionEndsInDays;
    if (days !== null && days >= 0 && days <= 7)
      out.push({ text: `ends in ${days} day${days === 1 ? '' : 's'}`, tone: 'risk' });

    return out;
  }

  protected planLabel(plan: string | null): string {
    if (!plan) return 'No plan';
    return plan === 'ManagerialPlus' ? 'Managerial + Parents' : plan;
  }

  protected subDays(t: TeacherUsage): string {
    const d = t.subscriptionEndsInDays;
    if (d === null) return 'never subscribed';
    if (d < 0) return `ended ${Math.abs(d)} days ago`;
    if (d === 0) return 'ends today';
    return `${d} day${d === 1 ? '' : 's'} left`;
  }

  protected subTone(t: TeacherUsage): string {
    const d = t.subscriptionEndsInDays;
    if (d === null || d < 0) return 'gone';
    return d <= 7 ? 'risk' : 'live';
  }

  protected studentTone(t: TeacherUsage): string {
    if (t.studentCount === 0) return 'gone';
    return t.studentsAssignedToSession === 0 ? 'risk' : '';
  }

  /** True when an assistant, not the teacher, was the last person to do anything. */
  protected assistantLed(t: TeacherUsage): boolean {
    if (!t.lastAssistantActivityAt) return false;
    if (!t.lastTeacherActivityAt) return true;
    return new Date(t.lastAssistantActivityAt) > new Date(t.lastTeacherActivityAt);
  }

  protected featureLabel(key: string): string {
    return FEATURE_LABELS[key] ?? key;
  }
  protected day(iso?: string | null): string {
    return formatDate(iso);
  }
  protected ago(iso?: string | null): string {
    return timeAgo(iso);
  }
}

const VIEW_BLURBS: Record<string, string> = {
  all: 'Everyone with their own account. Click a row for the rest of the account and everything you can do to it.',
  'newly-subscribed': 'Started paying in the last 30 days, newest first. The ones with nothing set up are the calls that prevent a refund.',
  'newly-registered': 'Newest accounts first, whether or not they pay.',
  'not-using': 'Paying, and did nothing at all in the last 30 days.',
  incomplete: 'Paying, with something missing — no students, students in no class, attendance never marked, or a subscription about to run out.',
  'ending-soon': 'Still paying, but not for much longer.',
};
