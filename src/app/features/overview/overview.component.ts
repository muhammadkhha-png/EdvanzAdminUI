import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AdminInsightsService,
  AdminOverview,
  BandCount,
  CallList,
} from '../../core/services/admin-insights.service';
import { TeacherPanelComponent } from '../../shared/components/teacher-panel/teacher-panel.component';
import { timeAgo } from '../../shared/utils/time-format';

/**
 * THE CALL LIST — the landing page, and the whole point of the console.
 *
 * This replaced nine insight cards shown side by side. Across 171 teachers they
 * held 241 entries, the same teacher sat on several of them, nothing said which
 * to work first, and no card said what to DO. The person using it called it busy
 * and hard to act on, and they were right: it was a report, not a list.
 *
 * What it is now: ONE ranked list. Each teacher appears exactly once, numbered,
 * with the evidence in plain words, an instruction, and a phone number. You work
 * it from the top and stop when you run out of time.
 *
 * Everything that is not a call was pushed out of the way. The distributions
 * still exist one tap down, because they answer a real question about once a
 * month and were crowding out the daily one.
 */
@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [RouterLink, TeacherPanelComponent],
  template: `
    <div class="page-header">
      <div>
        <h2>Call these teachers</h2>
        <p>Worked from the top. Each teacher appears once, under the thing that matters most.</p>
      </div>
    </div>

    @if (data(); as d) {
      <p class="context">
        <strong class="tnum">{{ d.totalNeedingContact }}</strong> need a call ·
        <span class="tnum">{{ d.live }}</span> of {{ d.totalTeachers }} active in the last 30 days
        <a routerLink="/usage" class="ctx-link">See everyone</a>
      </p>

      @if (d.reasonCounts.length > 1) {
        <div class="chips" role="group" aria-label="Filter by reason">
          <button type="button" class="chip" [class.on]="!reason()" (click)="pick(null)">
            Everything <span class="n tnum">{{ d.totalNeedingContact }}</span>
          </button>
          @for (r of d.reasonCounts; track r.key) {
            <button
              type="button"
              class="chip"
              [class.on]="reason() === r.key"
              (click)="pick(r.key)"
            >
              {{ label(r.key) }} <span class="n tnum">{{ r.count }}</span>
            </button>
          }
        </div>
      }

      @if (d.items.length === 0) {
        <section class="panel done">
          <h3>Nobody needs a call</h3>
          <p>No teacher is stalled, quiet or misconfigured right now.</p>
        </section>
      } @else {
        <ol class="calls panel">
          @for (c of d.items; track c.teacherId; let i = $index) {
            <li class="call" [attr.data-severity]="c.severity">
              <span class="rank tnum">{{ i + 1 }}</span>

              <div class="body">
                <div class="line1">
                  <button type="button" class="name" (click)="open(c.teacherId)">
                    {{ c.fullName }}
                  </button>
                  <span class="reason">{{ c.reasonLabel }}</span>
                </div>

                <p class="why">{{ c.why }}</p>
                <p class="do">{{ c.action }}</p>

                <div class="meta">
                  @if (c.salesRepName) {
                    <span>{{ c.salesRepName }}</span>
                  }
                  @if (c.noteCount > 0) {
                    <span class="notes">
                      {{ c.noteCount }} {{ c.noteCount === 1 ? 'note' : 'notes' }}
                    </span>
                  }
                  @if (c.lastActivityAt) {
                    <span>active {{ timeAgo(c.lastActivityAt) }}</span>
                  }
                </div>
              </div>

              @if (c.phoneNumber) {
                <a class="call-btn" [href]="'tel:' + c.phoneNumber">{{ c.phoneNumber }}</a>
              } @else {
                <span class="no-phone">No phone</span>
              }
            </li>
          }
        </ol>

        @if (d.totalNeedingContact > d.items.length) {
          <button type="button" class="btn btn-outline-secondary more" (click)="showMore()">
            Show more ({{ d.totalNeedingContact - d.items.length }} left)
          </button>
        }
      }

      <button type="button" class="numbers-toggle" (click)="toggleNumbers()">
        {{ showNumbers() ? 'Hide' : 'Show' }} platform numbers
      </button>

      @if (showNumbers()) {
        @if (numbers(); as n) {
          <div class="charts">
            <section class="panel">
              <div class="panel-head"><h3>How often they work</h3></div>
              <div class="panel-body">
                @for (b of n.cadenceBreakdown; track b.key) {
                  <div class="bar-row">
                    <span class="bar-label">{{ band(b.key) }}</span>
                    <div class="bar-track">
                      <span class="bar-fill" [style.width.%]="pct(b, n.cadenceBreakdown)"></span>
                    </div>
                    <span class="bar-num tnum">{{ b.count }}</span>
                  </div>
                }
              </div>
            </section>

            <section class="panel">
              <div class="panel-head"><h3>What they actually use</h3></div>
              <div class="panel-body">
                @for (b of n.moduleAdoption; track b.key) {
                  <div class="bar-row">
                    <span class="bar-label">{{ band(b.key) }}</span>
                    <div class="bar-track">
                      <span class="bar-fill" [style.width.%]="pct(b, n.moduleAdoption)"></span>
                    </div>
                    <span class="bar-num tnum">{{ b.count }}</span>
                  </div>
                }
              </div>
            </section>
          </div>
        }
      }
      <!-- Same panel as the teacher list: everything about this teacher opens
           HERE, so the call list never has to be left to look something up. -->
      @if (selected(); as id) {
        <app-teacher-panel [teacherId]="id" (closed)="selected.set(null)" />
      }
    } @else if (loading()) {
      @for (i of [1, 2, 3, 4, 5]; track i) {
        <div class="skeleton-call"></div>
      }
    } @else {
      <section class="panel done">
        <h3>Could not load the list</h3>
        <p>Something went wrong fetching it.</p>
        <button type="button" class="btn btn-outline-secondary btn-sm" (click)="reload()">
          Try again
        </button>
      </section>
    }
  `,
  styles: [
    `
      .context {
        margin: 0 0 var(--s-4);
        color: var(--ink-2);
        font-size: var(--t-base);
      }
      .context strong {
        font-size: var(--t-md);
      }
      .ctx-link {
        margin-left: var(--s-3);
        font-size: var(--t-sm);
      }

      /* ── Reason chips: one row of filters, not nine panels ──────────── */
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-2);
        margin-bottom: var(--s-4);
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: var(--s-2);
        padding: 0.3rem 0.65rem;
        border: 1px solid var(--rule-strong);
        border-radius: 999px;
        background: var(--surface);
        color: var(--ink-2);
        font-size: var(--t-sm);
        cursor: pointer;
      }
      .chip:hover {
        border-color: var(--ink-4);
        color: var(--ink);
      }
      .chip.on {
        background: var(--ink);
        border-color: var(--ink);
        color: #fff;
      }
      .chip .n {
        font-weight: 600;
        opacity: 0.75;
      }

      /* ── The list ──────────────────────────────────────────────────── */
      .calls {
        list-style: none;
        margin: 0;
        padding: 0;
        overflow: hidden;
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
      /* Severity is a thin edge, not a filled card — it ranks the row without
         turning the page into a traffic light. */
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
      .body {
        min-width: 0;
      }
      .line1 {
        display: flex;
        align-items: baseline;
        gap: var(--s-2);
        flex-wrap: wrap;
      }
      .name {
        font-size: var(--t-md);
        font-weight: 600;
        color: var(--ink);
        text-decoration: none;
        border: 0;
        background: none;
        padding: 0;
        font-family: inherit;
        cursor: pointer;
      }
      .name:hover {
        color: var(--accent);
      }
      .reason {
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      .why {
        margin: var(--s-1) 0 0;
        font-size: var(--t-sm);
        color: var(--ink-2);
        line-height: 1.5;
      }
      /* The instruction is the point of the row, so it is the only thing here
         that carries weight and the accent. */
      .do {
        margin: var(--s-1) 0 0;
        font-size: var(--t-sm);
        font-weight: 500;
        color: var(--accent-ink);
        line-height: 1.5;
      }
      .meta {
        display: flex;
        gap: var(--s-3);
        flex-wrap: wrap;
        margin-top: var(--s-2);
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      .notes {
        color: var(--ink-3);
      }

      .call-btn {
        font-family: var(--font-mono);
        font-size: var(--t-sm);
        white-space: nowrap;
        padding: 0.4rem 0.7rem;
        border: 1px solid var(--rule-strong);
        border-radius: var(--r-sm);
        color: var(--accent);
        text-decoration: none;
      }
      .call-btn:hover {
        border-color: var(--accent);
        background: var(--accent-soft);
      }
      .no-phone {
        font-size: var(--t-xs);
        color: var(--ink-4);
        white-space: nowrap;
      }

      .more {
        margin-top: var(--s-4);
      }

      .done {
        padding: var(--s-6);
        text-align: center;
      }
      .done h3 {
        margin: 0 0 var(--s-2);
        font-size: var(--t-md);
      }
      .done p {
        margin: 0 auto var(--s-3);
        max-width: 46ch;
        color: var(--ink-3);
        font-size: var(--t-sm);
      }

      /* ── Secondary numbers, deliberately quiet ─────────────────────── */
      .numbers-toggle {
        display: block;
        margin: var(--s-6) 0 var(--s-3);
        border: 0;
        background: none;
        padding: 0;
        color: var(--ink-3);
        font-size: var(--t-sm);
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 3px;
      }
      .numbers-toggle:hover {
        color: var(--ink);
      }
      .charts {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: var(--s-4);
        margin-bottom: var(--s-5);
      }
      .bar-row {
        display: grid;
        grid-template-columns: 8rem 1fr 2.5rem;
        align-items: center;
        gap: var(--s-3);
        padding: var(--s-1) 0;
      }
      .bar-label {
        font-size: var(--t-xs);
        color: var(--ink-2);
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

      .skeleton-call {
        height: 116px;
        margin-bottom: 2px;
        border-radius: var(--r-md);
        background: linear-gradient(90deg, var(--quiet-soft) 25%, #f3f4f7 50%, var(--quiet-soft) 75%);
        background-size: 200% 100%;
        animation: shimmer 1.4s infinite;
      }
      @keyframes shimmer {
        to {
          background-position: -200% 0;
        }
      }

      /* Phones: the number drops under the instruction, so the row never
         squeezes the name and the tap target sits under the thumb. */
      @media (max-width: 575.98px) {
        .call {
          grid-template-columns: 1.75rem 1fr;
          gap: var(--s-2);
        }
        .call-btn,
        .no-phone {
          grid-column: 2;
          justify-self: start;
          margin-top: var(--s-2);
        }
        .bar-row {
          grid-template-columns: 7rem 1fr 2rem;
        }
      }
    `,
  ],
})
export class OverviewComponent implements OnInit {
  private readonly insights = inject(AdminInsightsService);

  protected readonly data = signal<CallList | null>(null);
  protected readonly numbers = signal<AdminOverview | null>(null);
  protected readonly loading = signal(true);
  protected readonly reason = signal<string | null>(null);
  protected readonly showNumbers = signal(false);
  /** Which teacher's panel is open over the list. */
  protected readonly selected = signal<number | null>(null);

  private take = DEFAULT_TAKE;

  protected readonly timeAgo = timeAgo;

  ngOnInit(): void {
    this.reload();
  }

  protected open(teacherId: number): void {
    this.selected.set(teacherId);
  }

  protected reload(): void {
    this.loading.set(true);
    this.insights.getCallList(this.reason(), this.take).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Filtering resets the page size — a filtered list is a fresh piece of work. */
  protected pick(key: string | null): void {
    this.reason.set(key);
    this.take = DEFAULT_TAKE;
    this.reload();
  }

  protected showMore(): void {
    this.take += 50;
    this.reload();
  }

  /** The distributions are only fetched if someone actually asks for them. */
  protected toggleNumbers(): void {
    this.showNumbers.update((v) => !v);
    if (this.showNumbers() && !this.numbers()) {
      this.insights.getOverview().subscribe((n) => this.numbers.set(n));
    }
  }

  protected pct(band: BandCount, all: BandCount[]): number {
    const peak = Math.max(...all.map((b) => b.count), 1);
    return band.count === 0 ? 0 : Math.max(3, (band.count / peak) * 100);
  }

  /** Chip fallback only — each row carries its own localized label from the API. */
  protected label(key: string): string {
    return CHIP_LABELS[key] ?? key;
  }

  protected band(key: string): string {
    return BAND_LABELS[key] ?? key;
  }
}

/** How many calls to show before "show more". A list of 241 is not a day's work. */
const DEFAULT_TAKE = 25;

const CHIP_LABELS: Record<string, string> = {
  PaidNotStarted: 'Paid, not started',
  ExpiringWhileWorking: 'Working, expiring',
  OwnerStopped: 'Teacher stopped',
  WentQuiet: 'Went quiet',
  StudentsStranded: 'Students stranded',
  SetUpNotRunning: 'Ready, not running',
  NeverStarted: 'Never started',
  OneModuleOnly: 'Using one thing',
};

const BAND_LABELS: Record<string, string> = {
  Daily: 'Daily',
  MostDays: 'Most days',
  Weekly: 'Weekly',
  Rarely: 'Rarely',
  Dormant: 'Went quiet',
  Never: 'Never started',
  None: 'Nothing used',
  Attendance: 'Attendance',
  Payments: 'Payments',
  Students: 'Students',
  Sessions: 'Sessions',
  Videos: 'Videos',
  OnlineExams: 'Online exams',
  ExamsHomework: 'Exams & homework',
  Messaging: 'Messaging',
  ParentPortal: 'Parent portal',
};
