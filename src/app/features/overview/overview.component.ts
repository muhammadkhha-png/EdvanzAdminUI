import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AdminInsightsService,
  AdminOverview,
  BandCount,
} from '../../core/services/admin-insights.service';
import { UsageBadgeComponent } from '../../shared/components/usage-badge/usage-badge.component';
import { formatDate, timeAgo } from '../../shared/utils/time-format';

/**
 * THE WORKLIST — the landing page.
 *
 * Its job is not to be admired; it is to answer "who do I call today?". So it
 * opens with one sentence of plain numbers rather than a row of identical KPI
 * tiles, and everything below it is a NAMED LIST. A count nobody can act on is
 * not an insight.
 *
 * The old dashboard showed four counts fetched by four `pageSize=1` calls read
 * for their totals. It could not distinguish a teacher running their whole
 * business on Edvanz from one who logged in once and marked nothing.
 */
@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [RouterLink, UsageBadgeComponent],
  template: `
    <div class="page-header">
      <div>
        <h2>Who needs a call</h2>
        <p>
          Real usage, measured from what people actually did — not from logins or
          row counts.
        </p>
      </div>
      @if (generatedAt(); as at) {
        <span class="freshness" [title]="'Oldest figure computed ' + formatDate(oldestAt())">
          Updated {{ timeAgo(at) }}
        </span>
      }
    </div>

    @if (data(); as d) {
      <!-- ── The headline, as a sentence rather than a tile rack ───────── -->
      <section class="headline panel">
        <div class="headline-main">
          <span class="big tnum">{{ d.totals.live }}</span>
          <span class="of tnum">of {{ d.totals.teachers }}</span>
          <span class="headline-label">
            teachers did something real in the last 30 days
          </span>
        </div>

        <div class="headline-meta">
          @if (delta() !== null) {
            <span class="delta" [attr.data-dir]="delta()! >= 0 ? 'up' : 'down'">
              {{ delta()! >= 0 ? '+' : '' }}{{ delta() }} vs the month before
            </span>
          }
          <a routerLink="/usage" class="see-grid">See all teachers</a>
        </div>

        <dl class="headline-figures">
          <div>
            <dt>Set up properly</dt>
            <dd class="tnum">{{ d.totals.withRealData }}</dd>
            <p>Students assigned to a session that has class days</p>
          </div>
          <div>
            <dt>Went quiet</dt>
            <dd class="tnum">{{ d.totals.dormant }}</dd>
            <p>Worked before, nothing in the last 30 days</p>
          </div>
          <div>
            <dt>Never started</dt>
            <dd class="tnum">{{ d.totals.neverStarted }}</dd>
            <p>Registered, no real activity ever recorded</p>
          </div>
          <div>
            <dt>Assistants only</dt>
            <dd class="tnum">{{ d.totals.assistantOnly }}</dd>
            <p>Staff are working, the teacher has stopped</p>
          </div>
        </dl>
      </section>

      <!-- ── The named lists ───────────────────────────────────────────── -->
      @if (d.insights.length) {
        <div class="cards">
          @for (card of d.insights; track card.key) {
            <section class="card panel" [attr.data-severity]="card.severity">
              <header class="card-head">
                <h3>{{ title(card.key) }}</h3>
                <span class="count tnum">{{ card.totalCount }}</span>
              </header>
              <p class="card-why">{{ card.description }}</p>

              <ul class="people">
                @for (t of card.teachers; track t.teacherId) {
                  <li>
                    <a class="person" [routerLink]="['/teachers', t.teacherId]">
                      <span class="name">{{ t.fullName }}</span>
                      @if (t.detail) {
                        <span class="reason">{{ t.detail }}</span>
                      }
                    </a>
                    @if (t.phoneNumber) {
                      <a class="call" [href]="'tel:' + t.phoneNumber" [title]="'Call ' + t.phoneNumber">
                        {{ t.phoneNumber }}
                      </a>
                    }
                  </li>
                }
              </ul>

              @if (card.totalCount > card.teachers.length) {
                <a class="see-all" [routerLink]="['/usage']" [queryParams]="{ card: card.key }">
                  See all {{ card.totalCount }}
                </a>
              }
            </section>
          }
        </div>
      } @else {
        <section class="panel empty">
          <h3>Nothing needs attention</h3>
          <p>
            No teacher is currently quiet, stalled or misconfigured. If that seems
            wrong, the nightly figures may not have run yet.
          </p>
        </section>
      }

      <!-- ── Distributions ─────────────────────────────────────────────── -->
      <div class="charts">
        <section class="panel">
          <div class="panel-head"><h3>How often they work</h3></div>
          <div class="panel-body">
            @for (b of cadenceBands(); track b.key) {
              <div class="bar-row">
                <app-usage-badge [value]="b.key" axis="cadence" />
                <div class="bar-track">
                  <span class="bar-fill" [style.width.%]="pct(b, cadenceBands())"></span>
                </div>
                <span class="bar-num tnum">{{ b.count }}</span>
              </div>
            }
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h3>Who works the account</h3></div>
          <div class="panel-body">
            @for (b of operatorBands(); track b.key) {
              <div class="bar-row">
                <app-usage-badge [value]="b.key" axis="operators" />
                <div class="bar-track">
                  <span class="bar-fill" [style.width.%]="pct(b, operatorBands())"></span>
                </div>
                <span class="bar-num tnum">{{ b.count }}</span>
              </div>
            }
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h3>What they actually use</h3>
          </div>
          <div class="panel-body">
            @for (b of moduleBands(); track b.key) {
              <div class="bar-row">
                <app-usage-badge [value]="b.key" axis="module" />
                <div class="bar-track">
                  <span class="bar-fill" [style.width.%]="pct(b, moduleBands())"></span>
                </div>
                <span class="bar-num tnum">{{ b.count }}</span>
              </div>
            }
          </div>
        </section>
      </div>
    } @else if (loading()) {
      <div class="skeleton-line"></div>
      <div class="skeleton-grid">
        @for (i of [1, 2, 3, 4, 5, 6]; track i) {
          <div class="skeleton-card"></div>
        }
      </div>
    } @else {
      <!-- The error interceptor has already said what went wrong; this is the
           way back, so the page is never a blank rectangle. -->
      <section class="panel empty">
        <h3>Could not load the figures</h3>
        <p>Something went wrong fetching them. Try again in a moment.</p>
        <button type="button" class="btn btn-outline-secondary btn-sm" (click)="reload()">
          Try again
        </button>
      </section>
    }
  `,
  styles: [
    `
      .freshness {
        font-size: var(--t-sm);
        color: var(--ink-3);
        white-space: nowrap;
      }

      /* ── Headline ──────────────────────────────────────────────────── */
      .headline {
        padding: var(--s-5);
        margin-bottom: var(--s-5);
      }
      .headline-main {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: var(--s-2);
      }
      .big {
        font-size: var(--t-num);
        font-weight: 650;
        line-height: 1;
        letter-spacing: -0.02em;
      }
      .of {
        font-size: var(--t-md);
        color: var(--ink-3);
      }
      .headline-label {
        font-size: var(--t-md);
        color: var(--ink-2);
      }
      .headline-meta {
        display: flex;
        align-items: center;
        gap: var(--s-4);
        flex-wrap: wrap;
        margin-top: var(--s-2);
      }
      .delta {
        font-size: var(--t-sm);
        font-weight: 500;
      }
      .delta[data-dir='up'] {
        color: var(--live);
      }
      .delta[data-dir='down'] {
        color: var(--gone);
      }
      .see-grid {
        font-size: var(--t-sm);
      }

      .headline-figures {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: var(--s-4);
        margin: var(--s-5) 0 0;
        padding-top: var(--s-4);
        border-top: 1px solid var(--rule);
      }
      .headline-figures div {
        min-width: 0;
      }
      .headline-figures dt {
        font-size: var(--t-sm);
        font-weight: 500;
        color: var(--ink-2);
      }
      .headline-figures dd {
        margin: var(--s-1) 0 0;
        font-size: var(--t-lg);
        font-weight: 650;
        line-height: 1;
      }
      .headline-figures p {
        margin: var(--s-1) 0 0;
        font-size: var(--t-xs);
        color: var(--ink-3);
        line-height: 1.4;
      }

      /* ── Insight cards ─────────────────────────────────────────────── */
      .cards {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: var(--s-4);
        margin-bottom: var(--s-5);
      }
      .card {
        display: flex;
        flex-direction: column;
        padding: var(--s-4);
        /* The severity stripe is the only decoration on the page, and it encodes
           real information: how soon this list needs working. */
        border-top: 3px solid var(--rule-strong);
      }
      .card[data-severity='attention'] {
        border-top-color: var(--gone);
      }
      .card[data-severity='warning'] {
        border-top-color: var(--risk);
      }
      .card[data-severity='info'] {
        border-top-color: var(--accent);
      }
      .card-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--s-2);
      }
      .card-head h3 {
        margin: 0;
        font-size: var(--t-base);
        font-weight: 600;
      }
      .count {
        font-size: var(--t-lg);
        font-weight: 650;
        line-height: 1;
      }
      .card-why {
        margin: var(--s-2) 0 var(--s-3);
        font-size: var(--t-xs);
        color: var(--ink-3);
        line-height: 1.5;
      }

      .people {
        list-style: none;
        margin: 0;
        padding: 0;
        border-top: 1px solid var(--rule);
      }
      .people li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s-3);
        padding: var(--s-2) 0;
        border-bottom: 1px solid var(--rule);
      }
      .person {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
        text-decoration: none;
        color: inherit;
      }
      .person:hover .name {
        color: var(--accent);
      }
      .name {
        font-size: var(--t-sm);
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .reason {
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      /* On a phone this is a rep standing outside a tutoring centre. The number
         is a tap target, not a label. */
      .call {
        font-size: var(--t-xs);
        font-family: var(--font-mono);
        color: var(--accent);
        text-decoration: none;
        white-space: nowrap;
      }
      .see-all {
        margin-top: var(--s-3);
        font-size: var(--t-sm);
        align-self: flex-start;
      }

      .empty {
        padding: var(--s-6);
        text-align: center;
        margin-bottom: var(--s-5);
      }
      .empty h3 {
        margin: 0 0 var(--s-2);
        font-size: var(--t-md);
      }
      .empty p {
        margin: 0 auto;
        max-width: 46ch;
        color: var(--ink-3);
        font-size: var(--t-sm);
      }

      /* ── Distributions ─────────────────────────────────────────────── */
      .charts {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: var(--s-4);
      }
      .bar-row {
        display: grid;
        grid-template-columns: 8.5rem 1fr 2.5rem;
        align-items: center;
        gap: var(--s-3);
        padding: var(--s-1) 0;
      }
      .bar-track {
        height: 6px;
        background: var(--quiet-soft);
        border-radius: 3px;
        overflow: hidden;
      }
      .bar-fill {
        display: block;
        height: 100%;
        background: var(--accent);
        border-radius: 3px;
      }
      .bar-num {
        font-size: var(--t-sm);
        color: var(--ink-2);
        text-align: right;
      }

      /* ── Loading ───────────────────────────────────────────────────── */
      .skeleton-line,
      .skeleton-card {
        background: linear-gradient(90deg, var(--quiet-soft) 25%, #f3f4f7 50%, var(--quiet-soft) 75%);
        background-size: 200% 100%;
        animation: shimmer 1.4s infinite;
        border-radius: var(--r-md);
      }
      .skeleton-line {
        height: 160px;
        margin-bottom: var(--s-5);
      }
      .skeleton-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: var(--s-4);
      }
      .skeleton-card {
        height: 210px;
      }
      @keyframes shimmer {
        to {
          background-position: -200% 0;
        }
      }

      @media (max-width: 575.98px) {
        .bar-row {
          grid-template-columns: 7rem 1fr 2rem;
          gap: var(--s-2);
        }
        .headline {
          padding: var(--s-4);
        }
      }
    `,
  ],
})
export class OverviewComponent implements OnInit {
  private readonly insights = inject(AdminInsightsService);

  protected readonly data = signal<AdminOverview | null>(null);
  protected readonly loading = signal(true);

  protected readonly formatDate = formatDate;
  protected readonly timeAgo = timeAgo;

  // The distribution charts read these rather than the template's `as` alias:
  // Angular 17.3 does not reliably carry an @else-if alias into every nested
  // block, and a silently-undefined binding there would render empty charts.
  protected readonly cadenceBands = computed(() => this.data()?.cadenceBreakdown ?? []);
  protected readonly operatorBands = computed(() => this.data()?.operatorBreakdown ?? []);
  protected readonly moduleBands = computed(() => this.data()?.moduleAdoption ?? []);
  protected readonly generatedAt = computed(() => this.data()?.generatedAt ?? null);
  protected readonly oldestAt = computed(() => this.data()?.oldestSnapshotAt ?? null);

  ngOnInit(): void {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.insights.getOverview().subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      // The error interceptor already toasts the message; just stop the shimmer
      // so the page does not pretend to still be loading.
      error: () => this.loading.set(false),
    });
  }

  /** Change in live teachers against the previous 30 days, or null with no baseline. */
  protected delta(): number | null {
    const d = this.data();
    if (!d || d.totals.livePrevious === 0) return null;
    return d.totals.live - d.totals.livePrevious;
  }

  /** Bar width as a share of the largest band, so small bands stay visible. */
  protected pct(band: BandCount, all: BandCount[]): number {
    const peak = Math.max(...all.map((b) => b.count), 1);
    return band.count === 0 ? 0 : Math.max(3, (band.count / peak) * 100);
  }

  /** Card headings, written for the reader rather than taken from the enum. */
  protected title(key: string): string {
    return CARD_TITLES[key] ?? key;
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
