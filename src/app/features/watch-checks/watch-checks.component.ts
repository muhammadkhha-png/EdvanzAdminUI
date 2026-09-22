import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  AdminInsightsService,
  WatchCheckRow,
  WatchCheckSummary,
} from '../../core/services/admin-insights.service';
import { formatDateTime, timeAgo } from '../../shared/utils/time-format';

const PAGE_SIZE = 25;

/** Windows offered along the top. 0 is all time, and it is the default. */
const WINDOWS: { days: number; label: string }[] = [
  { days: 0, label: 'All time' },
  { days: 90, label: '90 days' },
  { days: 30, label: '30 days' },
  { days: 7, label: '7 days' },
];

/**
 * WATCH CHECKS.
 *
 * Video watch records whose own numbers disagree with each other: the lesson share
 * the record says was covered is more than the playback speed the player reported
 * could have covered in the time the student spent.
 *
 * THIS SCREEN ANSWERS ONE QUESTION, and it is not "who is cheating". The teacher
 * already sees such a record on that student's row in their own analytics and can
 * talk to them; one record under one teacher is a classroom matter and needs nothing
 * from here. What no single account can see is the SAME impossible arithmetic under
 * MANY teachers at once — which is what a modified app build in circulation looks
 * like, rather than one student. So the lead figure is teachers affected against
 * teachers measured, the verdict is stated in words above the table, and the records
 * underneath exist to be checked, not to be counted.
 *
 * COPY DISCIPLINE: every string here reports that numbers do not add up. None of
 * them says a person did anything. A broken player, a weak network or a phone with
 * jumpy position reporting produces the same arithmetic, the note at the foot of the
 * page says so, and the next step is always to look at the app build before looking
 * at the student.
 */
@Component({
  selector: 'app-watch-checks',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <div>
        <h1>Watch checks</h1>
        <p class="sub">
          Video watch records where the numbers do not add up — more of the lesson covered than
          the reported playback speed could have covered in the time spent. It flags arithmetic,
          not people.
        </p>
      </div>
    </header>

    <div class="window" role="group" aria-label="Time window">
      @for (w of windows; track w.days) {
        <button
          type="button"
          [class.on]="windowDays() === w.days"
          [attr.aria-pressed]="windowDays() === w.days"
          (click)="pickWindow(w.days)"
        >
          {{ w.label }}
        </button>
      }
    </div>

    @if (loading() && !loaded()) {
      <div class="skeleton" aria-live="polite" aria-busy="true">
        <span class="sr">Loading watch checks</span>
        @for (i of skeletonTiles; track i) {
          <div class="sk-block"></div>
        }
      </div>
    } @else if (!loaded()) {
      <div class="empty">
        <h2>Could not load the checks</h2>
        <p>The request did not come back. Try again in a moment.</p>
        <button type="button" class="btn" (click)="reload()">Try again</button>
      </div>
    } @else {
      @if (!measuring()) {
        <div class="notice" data-tone="quiet">
          <h2>Nothing is being measured yet</h2>
          @if (measureOffReason() === 'measure') {
            <p>
              Watch coverage is switched off, so no record can disagree with itself. Turn on
              <span class="code">VideoWatchCoverage__Enabled</span> in App Service once the store
              build that reports coverage is out, and this page starts filling.
            </p>
          } @else {
            <p>
              Coverage is being collected, but the check is deliberately silenced. Turn on
              <span class="code">VideoWatchCoverage__IntegrityFlagVisible</span> in App Service to
              read it here and on teachers' own screens.
            </p>
          }
          <p class="fine">An empty page here means "not looking", not "nothing wrong".</p>
        </div>
      } @else {
        <div class="verdict" [attr.data-tone]="tone()">
          <h2>{{ verdictHeadline() }}</h2>
          <p>{{ verdictBody() }}</p>
        </div>

        <div class="grid">
          <div class="stat flat" [attr.data-tone]="tone()">
            <span class="n tnum">{{ counts().teachersAffected }}</span>
            <span class="label">Teachers affected</span>
            <span class="cap">{{ denominator() }}</span>
          </div>
          <div class="stat flat" data-tone="quiet">
            <span class="n tnum">{{ counts().studentsAffected }}</span>
            <span class="label">Students involved</span>
            <span class="cap">Across all affected accounts.</span>
          </div>
          <div class="stat flat" data-tone="quiet">
            <span class="n tnum">{{ counts().videosAffected }}</span>
            <span class="label">Lessons involved</span>
            <span class="cap">One lesson everywhere points at the lesson, not the app.</span>
          </div>
          <div class="stat flat" data-tone="quiet">
            <span class="n tnum">{{ counts().signalCount }}</span>
            <span class="label">Records</span>
            <span class="cap">{{ seenRange() }}</span>
          </div>
        </div>

        @if (loading() && rows().length === 0) {
          @for (i of skeletonRows; track i) {
            <div class="sk-row"></div>
          }
        } @else if (rows().length === 0) {
          <div class="empty">
            <h2>Nothing to look at</h2>
            <p>{{ emptyBlurb() }}</p>
          </div>
        } @else {
          <div class="t-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Teacher</th>
                  <th scope="col">Student</th>
                  <th scope="col">Lesson</th>
                  <th scope="col">Covered</th>
                  <th scope="col">Time spent</th>
                  <th scope="col">Speed: implied vs reported</th>
                  <th scope="col">Last seen</th>
                </tr>
              </thead>
              <tbody>
                @for (r of rows(); track rowKey(r)) {
                  <tr>
                    <td class="who">
                      <span class="name">{{ r.teacherName }}</span>
                      <span class="code">{{ r.teacherCode }}</span>
                    </td>
                    <td class="who">
                      <span class="name">{{ r.studentName }}</span>
                      <span class="code">{{ r.studentCode }}</span>
                    </td>
                    <td class="who">
                      <span class="name">{{ r.videoTitle }}</span>
                      <span class="cap">{{ duration(r.videoDurationSeconds) }}</span>
                    </td>
                    <td class="tnum">
                      <span class="name">{{ covered(r) }}</span>
                      <span class="cap">{{ duration(r.coveredSeconds) }} of lesson</span>
                    </td>
                    <td class="tnum">{{ duration(r.timeSpentSeconds) }}</td>
                    <td class="tnum rates">
                      <span class="implied">{{ rate(r.impliedRate) }}</span>
                      <span class="cap">{{ reported(r) }}</span>
                    </td>
                    <td class="tnum">
                      <span class="name">{{ ago(r.lastUpdatedAt) }}</span>
                      <span class="cap">{{ stamp(r.lastUpdatedAt) }}</span>
                    </td>
                  </tr>
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
      }
    }

    <section class="note">
      <h2>What this check is, and what it is not</h2>
      <p>
        Every watch record holds three numbers: how much of the lesson was played, how long the
        student spent in the player, and the playback speed the player itself reported. A record
        appears here when the first is larger than the other two could produce, with 25% slack.
      </p>
      <p>
        <strong>It is not proof of anything.</strong> A buggy player, a weak connection or a phone
        that reports its position erratically can produce the same disagreement, and so can a
        single student on a modified build. Read the teacher count first: one account is a
        classroom conversation its teacher can already have, several unrelated accounts at once is
        a build to go and find. Check which app version these students are on before treating them
        as separate problems, and never open a conversation with a student from this page.
      </p>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        padding: var(--s-5);
        max-width: 1180px;
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

      .window {
        display: inline-flex;
        gap: 2px;
        padding: 3px;
        margin-bottom: var(--s-5);
        background: var(--quiet-soft);
        border-radius: var(--r-sm);
      }
      .window button {
        min-height: 36px;
        padding: 0 var(--s-3);
        border: 0;
        border-radius: 3px;
        background: transparent;
        font: inherit;
        font-size: var(--t-sm);
        color: var(--ink-2);
        cursor: pointer;
      }
      .window button.on {
        background: var(--surface);
        color: var(--ink);
        font-weight: 600;
      }
      .window button:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }

      /* The verdict carries the finding IN WORDS. The tone colour repeats it; it
         never carries it alone. */
      .verdict,
      .notice {
        padding: var(--s-4);
        border-radius: var(--r-md);
        margin-bottom: var(--s-4);
        background: var(--tone-soft, var(--quiet-soft));
      }
      .verdict h2,
      .notice h2 {
        margin: 0 0 var(--s-2);
        font-size: var(--t-md);
        font-weight: 650;
        color: var(--tone-ink, var(--ink));
      }
      .verdict p,
      .notice p {
        margin: 0;
        font-size: var(--t-sm);
        color: var(--ink-2);
        max-width: 78ch;
      }
      .notice p + p {
        margin-top: var(--s-2);
      }
      .notice .fine {
        color: var(--ink-3);
        font-size: var(--t-xs);
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(215px, 1fr));
        gap: var(--s-3);
        margin-bottom: var(--s-5);
      }
      .stat {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        padding: var(--s-4);
        border: 0;
        border-radius: var(--r-md);
        background: var(--tone-soft, var(--quiet-soft));
        text-align: left;
      }
      .stat.flat {
        cursor: default;
      }
      .n {
        font-size: var(--t-num);
        font-weight: 700;
        line-height: 1.05;
        letter-spacing: -0.03em;
        color: var(--tone-ink, var(--ink));
      }
      .label {
        font-size: var(--t-base);
        font-weight: 600;
        color: var(--ink);
      }
      .cap {
        font-size: var(--t-xs);
        color: var(--ink-3);
        line-height: 1.4;
      }

      /* The console's own tone ramp, unchanged. */
      [data-tone='live'] {
        --tone-soft: var(--live-soft);
        --tone-ink: var(--live);
      }
      [data-tone='risk'] {
        --tone-soft: var(--risk-soft);
        --tone-ink: var(--risk);
      }
      [data-tone='gone'] {
        --tone-soft: var(--gone-soft);
        --tone-ink: var(--gone);
      }
      [data-tone='quiet'] {
        --tone-soft: var(--quiet-soft);
        --tone-ink: var(--ink-2);
      }

      .t-scroll {
        overflow-x: auto;
        background: var(--surface);
        border-radius: var(--r-md);
      }
      table {
        width: 100%;
        min-width: 980px;
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
      tbody tr:nth-child(odd) {
        background: var(--surface-2);
      }
      .name {
        display: block;
        color: var(--ink);
      }
      .code {
        display: block;
        font-family: var(--font-mono);
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      /* In prose the same class has to sit INSIDE the sentence, not break it. */
      .notice .code {
        display: inline;
        font-size: inherit;
        color: var(--ink);
      }
      .cap {
        display: block;
      }
      /* The implied speed is the thing that put the record here, so it reads first. */
      .rates .implied {
        display: block;
        font-weight: 650;
        color: var(--ink);
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
        cursor: pointer;
      }
      .btn:hover:not(:disabled) {
        background: var(--rule);
        color: var(--ink);
      }
      .btn:disabled {
        opacity: 0.55;
        cursor: default;
      }

      .empty {
        padding: var(--s-7) 0;
        text-align: center;
      }
      .empty h2 {
        margin-bottom: var(--s-2);
        font-size: var(--t-md);
      }
      .empty p {
        color: var(--ink-3);
        margin: 0 auto var(--s-4);
        max-width: 56ch;
      }

      .note {
        margin-top: var(--s-7);
        padding-top: var(--s-4);
        border-top: 1px solid var(--rule);
      }
      .note h2 {
        margin: 0 0 var(--s-2);
        font-size: var(--t-base);
        font-weight: 650;
        color: var(--ink-2);
      }
      .note p {
        margin: 0 0 var(--s-2);
        font-size: var(--t-xs);
        color: var(--ink-3);
        max-width: 84ch;
        line-height: 1.6;
      }

      .sk-block,
      .sk-row {
        border-radius: var(--r-md);
        background: linear-gradient(90deg, var(--quiet-soft), var(--rule), var(--quiet-soft));
        background-size: 200% 100%;
        animation: shimmer 1.4s linear infinite;
      }
      .skeleton {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(215px, 1fr));
        gap: var(--s-3);
      }
      .sk-block {
        height: 118px;
      }
      .sk-row {
        height: 56px;
        margin-bottom: var(--s-2);
      }
      @keyframes shimmer {
        to {
          background-position: -200% 0;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .sk-block,
        .sk-row {
          animation: none;
        }
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
export class WatchChecksComponent {
  private readonly insights = inject(AdminInsightsService);

  protected readonly windows = WINDOWS;
  protected readonly skeletonTiles = [1, 2, 3, 4];
  protected readonly skeletonRows = [1, 2, 3, 4, 5, 6];

  protected readonly windowDays = signal(0);
  protected readonly summary = signal<WatchCheckSummary | null>(null);
  protected readonly rows = signal<WatchCheckRow[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);

  private page = 1;

  constructor() {
    this.fetch();
  }

  /**
   * Has a response landed at all? The page has four states and they must not be
   * confusable: still loading, the request failed, nothing is being measured, and a
   * real answer. Only the last two are about the data.
   */
  protected readonly loaded = computed(() => this.summary() !== null);

  /** Both switches on — i.e. the numbers on this page are answering the question. */
  protected readonly measuring = computed(() => {
    const s = this.summary();
    return !!s && s.measureActive && s.signalVisible;
  });

  /** Which switch is holding it shut; they need different sentences and different fixes. */
  protected readonly measureOffReason = computed<'measure' | 'silenced' | null>(() => {
    const s = this.summary();
    if (!s || this.measuring()) return null;
    return s.measureActive ? 'silenced' : 'measure';
  });

  /**
   * The summary with zeroes standing in for "not loaded yet", so the template never
   * dereferences a nullable. Every branch that renders these is already behind
   * `loaded()`; the fallback exists for the type system, not for the screen.
   */
  protected readonly counts = computed<WatchCheckSummary>(() => this.summary() ?? EMPTY_SUMMARY);

  /**
   * The finding, as a colour. It is ALWAYS paired with the same finding in words —
   * one teacher and several teachers are different situations, and a reader who
   * cannot see the difference between amber and red must still get it.
   */
  protected readonly tone = computed(() => {
    const s = this.summary();
    if (!s || s.teachersAffected === 0) return 'quiet';
    return s.teachersAffected === 1 ? 'risk' : 'gone';
  });

  protected readonly verdictHeadline = computed(() => {
    const s = this.summary();
    if (!s) return '';
    if (s.teachersAffected === 0) return 'Nothing is disagreeing';
    if (s.teachersAffected === 1) return 'One account';
    return `${s.teachersAffected} accounts, not one`;
  });

  protected readonly verdictBody = computed(() => {
    const s = this.summary();
    if (!s) return '';

    if (s.teachersAffected === 0) {
      return s.teachersMeasured === 0
        ? 'No watching has been measured this way in this window yet, so there is nothing that could disagree. This is not a clean bill of health — it is an empty sample.'
        : `Every measured record in this window adds up, across ${s.teachersMeasured} ${plural(s.teachersMeasured, 'teacher', 'teachers')}.`;
    }

    if (s.teachersAffected === 1) {
      return 'All of these records sit under a single teacher, so this looks like a classroom matter rather than a platform one. That teacher already sees the same students marked on their own analytics screen and can follow it up there. Worth a second look if the count keeps climbing.';
    }

    return `The same impossible arithmetic is showing up under ${s.teachersAffected} unrelated ${plural(s.teachersAffected, 'account', 'accounts')} at once, which is what a modified app build in circulation looks like — not ${s.studentsAffected} separate students. Find the app version these students are on before treating them one by one.`;
  });

  /** The denominator that makes the headline count readable. */
  protected readonly denominator = computed(() => {
    const s = this.summary();
    if (!s) return '';
    if (s.teachersMeasured === 0) return 'Nothing measured in this window yet.';
    return `of ${s.teachersMeasured} ${plural(s.teachersMeasured, 'teacher', 'teachers')} whose watching is measured this way.`;
  });

  protected readonly seenRange = computed(() => {
    const s = this.summary();
    if (!s || !s.firstSignalAt || !s.lastSignalAt) return 'Nothing in this window.';
    if (s.firstSignalAt === s.lastSignalAt) return `Seen ${timeAgo(s.lastSignalAt)}.`;
    return `From ${formatDateTime(s.firstSignalAt)} to ${formatDateTime(s.lastSignalAt)}.`;
  });

  protected readonly emptyBlurb = computed(() => {
    const s = this.summary();
    if (s && s.teachersMeasured === 0) {
      return 'No watching has been measured this way in this window, so there is nothing to check. Widen the window, or wait for the store build that reports coverage to reach students.';
    }
    return 'No record in this window has numbers that disagree with each other. Widen the window if you are looking for something older.';
  });

  protected pickWindow(days: number): void {
    if (days === this.windowDays()) return;
    this.windowDays.set(days);
    this.reload();
  }

  protected reload(): void {
    this.page = 1;
    this.rows.set([]);
    this.total.set(0);
    // Dropped too, deliberately: keeping it would leave the previous window's tiles
    // and verdict standing under the new window's label until the reply lands, which
    // is a wrong answer rather than a stale one. loadMore() keeps it, being the same
    // window and the same figures.
    this.summary.set(null);
    this.fetch();
  }

  protected loadMore(): void {
    if (this.loading()) return;
    this.page += 1;
    this.fetch();
  }

  private fetch(): void {
    this.loading.set(true);
    this.insights.getWatchChecks(this.windowDays(), this.page, PAGE_SIZE).subscribe({
      next: (res) => {
        this.summary.set(res.data.summary);
        this.rows.update((current) => [...current, ...res.data.rows]);
        this.total.set(res.totalCount);
        this.loading.set(false);
      },
      // The error interceptor already raised a toast; this only clears the busy
      // state so the page can offer "Try again" instead of spinning forever.
      error: () => this.loading.set(false),
    });
  }

  /** A record is one (student, lesson) pair, which is exactly what the row is. */
  protected rowKey(r: WatchCheckRow): string {
    return `${r.teacherStudentId}:${r.videoAssetId}`;
  }

  protected covered(r: WatchCheckRow): string {
    // Null, not zero, when the lesson length is unknown — the server refuses to
    // invent a share of an unknown whole, and so does this cell.
    return r.coveredPercent === null ? 'Lesson length unknown' : `${r.coveredPercent}%`;
  }

  protected rate(value: number | null): string {
    return value === null ? '—' : `${value.toFixed(2)}×`;
  }

  protected reported(r: WatchCheckRow): string {
    return r.reportedRate === null
      ? 'player never reported a speed (1.00× assumed)'
      : `player reported ${r.reportedRate.toFixed(2)}×`;
  }

  protected duration(seconds: number): string {
    if (!seconds || seconds <= 0) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    if (mins < 60) return `${mins}m ${secs}s`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  protected ago(iso: string): string {
    return timeAgo(iso);
  }

  protected stamp(iso: string): string {
    return formatDateTime(iso);
  }
}

/** Stand-in used only while nothing has loaded; never rendered (see `counts`). */
const EMPTY_SUMMARY: WatchCheckSummary = {
  measureActive: false,
  signalVisible: false,
  signalCount: 0,
  teachersAffected: 0,
  studentsAffected: 0,
  videosAffected: 0,
  teachersMeasured: 0,
  firstSignalAt: null,
  lastSignalAt: null,
  windowDays: 0,
};

/** Counts are read out loud on this page; "1 teachers" undermines the whole thing. */
function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}
