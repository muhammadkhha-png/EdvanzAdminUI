import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import {
  AdminInsightsService,
  SalesRep,
  TeacherUsage,
  UsageQuery,
} from '../../core/services/admin-insights.service';
import { InfiniteScrollDirective } from '../../shared/directives/infinite-scroll.directive';
import { DayStripComponent } from '../../shared/components/day-strip/day-strip.component';
import { UsageBadgeComponent } from '../../shared/components/usage-badge/usage-badge.component';
import { TeacherPanelComponent } from '../../shared/components/teacher-panel/teacher-panel.component';
import { ToastService } from '../../core/services/toast.service';
import { timeAgo } from '../../shared/utils/time-format';

const PAGE_SIZE = 25;

/**
 * THE REGISTER — every teacher, the three axes, and the setup-health gaps.
 *
 * Replaces the old Activity Monitor, which could only report last-login. A login
 * proves nothing about whether someone is running their business on the product.
 *
 * LAYOUT: ruled rows on desktop, stacked blocks on phones. Not a horizontally
 * scrolling table — the previous screens put eleven columns in an overflow box,
 * which on a phone means the reader sees a name and has to drag sideways to learn
 * anything about it. Here the phone layout keeps name, bands and the day strip in
 * the same glance and puts the phone number under the thumb.
 */
@Component({
  selector: 'app-usage-grid',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    InfiniteScrollDirective,
    DayStripComponent,
    UsageBadgeComponent,
    TeacherPanelComponent,
  ],
  template: `
    <div class="page-header">
      <div>
        <h2>{{ heading() }}</h2>
        <p>{{ subheading() }}</p>
      </div>
      <div class="head-actions">
        @if (activeCard()) {
          <button type="button" class="btn btn-outline-secondary btn-sm" (click)="clearCard()">
            Show everyone
          </button>
        }
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm"
          (click)="exportCsv()"
          [disabled]="exporting() || rows().length === 0"
          title="Downloads every teacher matching these filters, with contact details and notes"
        >
          {{ exporting() ? 'Preparing…' : 'Export CSV' }}
        </button>
      </div>
    </div>

    <!-- ── Filters ─────────────────────────────────────────────────────── -->
    @if (!activeCard()) {
      <div class="filters panel">
        <input
          type="search"
          class="form-control search"
          placeholder="Search name, code, username or phone"
          [formControl]="search"
          aria-label="Search teachers"
        />

        <select class="form-select" [formControl]="cadence" aria-label="How often">
          <option value="">Any cadence</option>
          <option value="Daily">Daily</option>
          <option value="MostDays">Most days</option>
          <option value="Weekly">Weekly</option>
          <option value="Rarely">Rarely</option>
          <option value="Dormant">Went quiet</option>
          <option value="Never">Never started</option>
        </select>

        <select class="form-select" [formControl]="operators" aria-label="Who works it">
          <option value="">Anyone working it</option>
          <option value="TeacherOnly">Teacher only</option>
          <option value="AssistantsOnly">Assistants only</option>
          <option value="TeacherAndAssistants">Teacher + assistants</option>
          <option value="Nobody">Nobody</option>
        </select>

        <select class="form-select" [formControl]="usingModule" aria-label="Using module">
          <option value="">Any module</option>
          <option value="Attendance">Attendance</option>
          <option value="Payments">Payments</option>
          <option value="Students">Students</option>
          <option value="Sessions">Sessions</option>
          <option value="Videos">Videos</option>
          <option value="OnlineExams">Online exams</option>
          <option value="ExamsHomework">Exams &amp; homework</option>
          <option value="Messaging">Messaging</option>
          <option value="ParentPortal">Parent portal</option>
        </select>

        <select class="form-select" [formControl]="salesRepId" aria-label="Sales rep">
          <option value="">Any sales rep</option>
          <option value="none">No rep assigned</option>
          @for (rep of reps(); track rep.id) {
            <option [value]="rep.id">{{ rep.name }}</option>
          }
        </select>

        <select class="form-select" [formControl]="subscribed" aria-label="Subscribed">
          <option value="">Subscribed any time</option>
          <option value="7">Subscribed this week</option>
          <option value="30">Subscribed in 30 days</option>
          <option value="90">Subscribed in 90 days</option>
        </select>

        <select class="form-select" [formControl]="setup" aria-label="Setup">
          <option value="">Set up or not</option>
          <option value="true">Set up properly</option>
          <option value="false">Nothing that works</option>
        </select>
      </div>
    }

    <!-- ── Results ─────────────────────────────────────────────────────── -->
    <div class="panel list">
      <!-- Column heads exist only where there are columns: tablet and up. -->
      <div class="row-head" aria-hidden="true">
        <span>Teacher</span>
        <span>How often</span>
        <span>What they use</span>
        <span>Who</span>
        <span>Students</span>
        <span>Last 30 days</span>
      </div>

      @if (loading() && rows().length === 0) {
        @for (i of skeletonRows; track i) {
          <div class="skeleton-row"></div>
        }
      } @else if (rows().length === 0) {
        <div class="empty">
          <h3>No teacher matches this</h3>
          <p>Widen the filters, or clear the search to see everyone.</p>
        </div>
      } @else {
        @for (t of rows(); track t.teacherId) {
          <button type="button" class="row" (click)="open(t.teacherId)">
            <!-- Identity -->
            <span class="cell who">
              <span class="t-name">{{ t.fullName }}</span>
              <span class="t-meta">
                <span class="code">{{ t.teacherCode }}</span>
                @if (t.phoneNumber) {
                  <span class="code">{{ t.phoneNumber }}</span>
                }
                @if (t.salesRepName) {
                  <span class="rep">{{ t.salesRepName }}</span>
                }
              </span>
            </span>

            <!-- Axis 1 -->
            <span class="cell cadence">
              <app-usage-badge [value]="t.cadence" axis="cadence" />
              <span class="sub tnum">{{ t.activeDays30 }}/30 days</span>
            </span>

            <!-- Axis 2 — the module list, because the band alone is not enough -->
            <span class="cell modules">
              @if (t.modules.length) {
                @for (m of t.modules; track m) {
                  <app-usage-badge [value]="m" axis="module" />
                }
              } @else {
                <span class="sub">Nothing in 30 days</span>
              }
            </span>

            <!-- Axis 3 -->
            <span class="cell operators">
              <app-usage-badge [value]="t.operators" axis="operators" />
            </span>

            <!-- Setup health: the gap between the pair is the story -->
            <span class="cell setup">
              <span class="tnum">{{ t.studentsAssignedToSession }}/{{ t.studentCount }}</span>
              <span
                class="sub"
                [class.warn]="t.studentCount > 0 && t.studentsAssignedToSession === 0"
              >
                {{
                  t.studentCount === 0
                    ? 'no students'
                    : t.studentsAssignedToSession === 0
                      ? 'none in a session'
                      : 'in a session'
                }}
              </span>
            </span>

            <!-- The day strip carries cadence and operator mix at once -->
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
        <div class="list-footer">
          <span class="spinner-sm"></span>
          Loading more
        </div>
      }
    </div>

    @if (rows().length) {
      <p class="list-count">Showing {{ rows().length }} of {{ total() }} teachers</p>
    }

    <!-- The panel slides OVER the list. The filter, the scroll position and the
         page you were on all survive closing it. -->
    @if (selected(); as id) {
      <app-teacher-panel [teacherId]="id" (closed)="close()" />
    }
  `,
  styles: [
    `
      /* ── Filters ─────────────────────────────────────────────────────── */
      .head-actions {
        display: flex;
        gap: var(--s-2);
        flex-wrap: wrap;
      }
      .filters {
        display: grid;
        grid-template-columns: minmax(220px, 2fr) repeat(6, minmax(130px, 1fr));
        gap: var(--s-2);
        padding: var(--s-3);
        margin-bottom: var(--s-4);
      }
      .filters .form-select,
      .filters .form-control {
        font-size: var(--t-sm);
      }

      /* ── The register ────────────────────────────────────────────────── */
      .list {
        overflow: hidden;
      }
      .row-head,
      .row {
        display: grid;
        grid-template-columns:
          minmax(180px, 1.6fr) 8.5rem minmax(160px, 1.6fr)
          9.5rem 7rem minmax(140px, 1fr);
        gap: var(--s-3);
        align-items: center;
        padding: var(--s-3) var(--s-4);
      }
      .row-head {
        font-size: var(--t-xs);
        font-weight: 600;
        color: var(--ink-3);
        border-bottom: 1px solid var(--rule-strong);
        background: var(--surface-2);
        position: sticky;
        top: 0;
        z-index: var(--z-sticky);
      }
      .row {
        border-bottom: 1px solid var(--rule);
        text-decoration: none;
        color: inherit;
        /* It is a <button> now so it opens the panel rather than navigating —
           these reset the native chrome back to a plain row. */
        width: 100%;
        background: none;
        border-left: 0;
        border-right: 0;
        border-top: 0;
        text-align: left;
        font: inherit;
        cursor: pointer;
      }
      .row:last-of-type {
        border-bottom: 0;
      }
      .row:hover {
        background: var(--surface-2);
      }
      .cell {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
      }
      .modules {
        flex-direction: row;
        flex-wrap: wrap;
        gap: 3px;
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
        align-items: baseline;
        font-size: var(--t-xs);
        color: var(--ink-3);
        min-width: 0;
      }
      .rep {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .sub {
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      .sub.warn {
        color: var(--risk);
        font-weight: 500;
      }
      .setup .tnum {
        font-size: var(--t-sm);
        font-weight: 500;
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
        height: 62px;
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

      /* ── Tablet: drop the least load-bearing columns ─────────────────── */
      @media (max-width: 1199.98px) {
        .filters {
          grid-template-columns: repeat(3, 1fr);
        }
        .row-head,
        .row {
          grid-template-columns: minmax(150px, 1.6fr) 8rem minmax(140px, 1.4fr) 9rem minmax(120px, 1fr);
        }
        .row-head span:nth-child(5),
        .setup {
          display: none;
        }
      }

      /* ── Phone: stacked blocks, still ruled. Never a sideways table. ──── */
      @media (max-width: 767.98px) {
        .filters {
          grid-template-columns: 1fr 1fr;
        }
        .filters .search {
          grid-column: 1 / -1;
        }
        .row-head {
          display: none;
        }
        /* All three axes survive on the phone. An earlier pass dropped the
           operator chip and the students ratio here to save height, which threw
           away the two things a rep standing outside a centre most needs: that
           the teacher has stopped while staff carry on, and that the students
           are not in a session. */
        .row {
          grid-template-columns: 1fr auto;
          grid-template-areas:
            'who      cadence'
            'modules  modules'
            'setup    operators'
            'strip    strip';
          gap: var(--s-2);
          padding: var(--s-3) var(--s-4);
        }
        .who {
          grid-area: who;
        }
        .cadence {
          grid-area: cadence;
          align-items: flex-end;
        }
        .modules {
          grid-area: modules;
        }
        .setup {
          grid-area: setup;
          flex-direction: row;
          align-items: baseline;
          gap: var(--s-1);
        }
        .operators {
          grid-area: operators;
          align-items: flex-end;
        }
        .strip {
          grid-area: strip;
        }
      }
    `,
  ],
})
export class UsageGridComponent implements OnInit {
  private readonly insights = inject(AdminInsightsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly rows = signal<TeacherUsage[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly reps = signal<SalesRep[]>([]);
  protected readonly activeCard = signal<string | null>(null);
  protected readonly exporting = signal(false);
  /** Which teacher's panel is open. Null = list only. */
  protected readonly selected = signal<number | null>(null);
  protected readonly skeletonRows = [1, 2, 3, 4, 5, 6, 7, 8];

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly cadence = new FormControl('', { nonNullable: true });
  protected readonly operators = new FormControl('', { nonNullable: true });
  protected readonly usingModule = new FormControl('', { nonNullable: true });
  protected readonly salesRepId = new FormControl('', { nonNullable: true });
  protected readonly setup = new FormControl('', { nonNullable: true });
  protected readonly subscribed = new FormControl('', { nonNullable: true });

  private page = 1;
  private loadedOnce = false;

  protected readonly hasMore = computed(() => this.rows().length < this.total());

  protected readonly heading = computed(() =>
    this.activeCard() ? (CARD_TITLES[this.activeCard()!] ?? 'Teachers') : 'All teachers',
  );

  protected readonly subheading = computed(() =>
    this.activeCard()
      ? 'Everyone on this list, ordered by how much it matters.'
      : 'How often they work, what they use, and who does the work.',
  );

  ngOnInit(): void {
    this.insights.getSalesReps().subscribe((r) => this.reps.set(r));

    // Arriving from an insight card's "see all" pins the page to that list.
    this.route.queryParamMap.subscribe((params) => {
      const teacher = params.get('teacher');
      this.selected.set(teacher ? Number(teacher) : null);

      // Hydrate the filters FROM the URL on first load, so a shared or
      // deep-linked view actually shows what its query string says. Without
      // this the Sales page's "See teachers" link (/usage?salesRepId=N) landed
      // on an unfiltered list and quietly showed the wrong thing.
      if (!this.loadedOnce) {
        const set = (c: FormControl<string>, key: string) => {
          const v = params.get(key);
          if (v) c.setValue(v, { emitEvent: false });
        };
        set(this.search, 'search');
        set(this.cadence, 'cadence');
        set(this.operators, 'operators');
        set(this.usingModule, 'usingModule');
        set(this.setup, 'hasRealData');
        set(this.subscribed, 'subscribedWithinDays');
        // "No rep assigned" is its own sentinel rather than an id.
        if (params.get('unassignedSalesRep') === 'true') {
          this.salesRepId.setValue('none', { emitEvent: false });
        } else {
          set(this.salesRepId, 'salesRepId');
        }
      }

      // Opening or closing the panel must NOT refetch the list — that would
      // rebuild the rows under the reader and throw away their scroll position.
      const card = params.get('card');
      if (card !== this.activeCard() || !this.loadedOnce) {
        this.activeCard.set(card);
        this.loadedOnce = true;
        this.reload();
      }
    });

    for (const control of [
      this.search,
      this.cadence,
      this.operators,
      this.usingModule,
      this.salesRepId,
      this.setup,
      this.subscribed,
    ]) {
      control.valueChanges
        .pipe(debounceTime(control === this.search ? 350 : 0), distinctUntilChanged())
        .subscribe(() => this.reload());
    }
  }

  private reload(): void {
    this.page = 1;
    this.rows.set([]);
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

    const card = this.activeCard();
    const request$ = card
      ? this.insights.getInsightTeachers(card, this.page, PAGE_SIZE)
      : this.insights.getTeachers(this.buildQuery());

    request$.subscribe({
      next: (res) => {
        this.rows.update((current) => [...current, ...res.data]);
        this.total.set(res.totalCount);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private buildQuery(): UsageQuery {
    const query: UsageQuery = { page: this.page, pageSize: PAGE_SIZE };

    if (this.search.value.trim()) query.search = this.search.value.trim();
    if (this.cadence.value) query.cadence = this.cadence.value as UsageQuery['cadence'];
    if (this.operators.value) query.operators = this.operators.value as UsageQuery['operators'];
    if (this.usingModule.value) query.usingModule = this.usingModule.value as UsageQuery['usingModule'];

    // "No rep assigned" is its own filter, not a rep id — the attribution backlog
    // is a list someone works through, so it needs to be selectable.
    if (this.salesRepId.value === 'none') query.unassignedSalesRep = true;
    else if (this.salesRepId.value) query.salesRepId = Number(this.salesRepId.value);

    // `false` is a real filter here ("show me the accounts with nothing that
    // works"), so it must survive the falsy check that drops the empty string.
    if (this.setup.value) query.hasRealData = this.setup.value === 'true';
    if (this.subscribed.value) query.subscribedWithinDays = Number(this.subscribed.value);

    return query;
  }

  /**
   * Exports what the admin is currently looking at.
   *
   * Sends the filters WITHOUT paging, because the server exports the whole
   * filtered set — the button means "give me this list", not "give me this page".
   */
  protected exportCsv(): void {
    this.exporting.set(true);

    const query = this.buildQuery();
    delete query.page;
    delete query.pageSize;

    this.insights.exportTeachers(query).subscribe({
      next: ({ blob, filename }) => {
        // Anchor + object URL is the only way a browser saves a blob it fetched
        // with an auth header; the URL is revoked straight after so the blob is
        // not held in memory for the life of the tab.
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

  /** Opens the detail panel over the list, without touching the filters. */
  protected open(teacherId: number): void {
    this.selected.set(teacherId);
    // Reflected in the URL so the panel survives a refresh and can be shared —
    // merged, never replaced, so every active filter stays in the query string.
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

  protected clearCard(): void {
    this.activeCard.set(null);
    this.reload();
  }

  /** Last-seen line under the day strip; says who, not just when. */
  protected lastSeen(t: TeacherUsage): string {
    if (!t.lastActivityAt) return 'never active';
    return `last active ${timeAgo(t.lastActivityAt)}`;
  }
}

const CARD_TITLES: Record<string, string> = {
  WentQuiet: 'Went quiet',
  AssistantOnly: 'Teacher has stopped',
  NeverStarted: 'Never started',
  SetUpNotRunning: 'Set up, not running',
  SingleModule: 'Using one thing only',
  SessionLessRoster: 'Students with no session',
  NewlyLive: 'Just got going',
  ExpiringWhileActive: 'Working, but expiring',
  NewlySubscribed: 'Just subscribed',
};
