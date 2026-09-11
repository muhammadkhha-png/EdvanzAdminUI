import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  AdminInsightsService,
  AdminNote,
  TeacherUsageDetail,
} from '../../../core/services/admin-insights.service';
import { ToastService } from '../../../core/services/toast.service';
import { DayStripComponent } from '../day-strip/day-strip.component';
import { UsageBadgeComponent } from '../usage-badge/usage-badge.component';
import { formatDate, formatDateTime, timeAgo } from '../../utils/time-format';

/**
 * THE TEACHER PANEL — everything about one teacher, opened in place.
 *
 * WHY A PANEL AND NOT A PAGE. The console used to split a teacher across screens:
 * usage on one, contact details on another, assistants on a third, notes on a
 * fourth. So you would filter a list down to the teachers you cared about, then
 * have to leave that list to learn anything real about one of them — losing the
 * filter, the scroll position and your place in the work. Being told "I can see
 * one piece of information and have to go elsewhere for the others" is exactly
 * that failure.
 *
 * This is the master-detail pattern every serious admin tool converges on
 * (Stripe, Linear, HubSpot, Intercom): the list stays put and owns the filtering,
 * the panel slides over it and owns the depth. Close it and you are exactly where
 * you were.
 *
 * ORDER OF THE SECTIONS is the order someone needs them in on a call: who they
 * are and how to reach them, then the verdict, then who is actually doing the
 * work, then what they use, then whether it is even set up, then the commercial
 * position, then what has been said to them before.
 */
@Component({
  selector: 'app-teacher-panel',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule, DayStripComponent, UsageBadgeComponent],
  template: `
    <div class="scrim" (click)="closed.emit()"></div>

    <aside class="panel-sheet" role="dialog" aria-modal="true" [attr.aria-label]="title()">
      @if (detail(); as d) {
        <!-- ── Header: who, and how to reach them ──────────────────────── -->
        <header class="head">
          <div class="head-main">
            <h2>{{ d.summary.fullName }}</h2>
            <p class="head-sub">
              <span class="code">{{ d.summary.teacherCode }}</span>
              @if (d.summary.username) {
                <span class="code">{{ d.summary.username }}</span>
              }
              <span>{{ d.summary.accountStatus }}</span>
            </p>
          </div>
          <button type="button" class="close" (click)="closed.emit()" aria-label="Close">&times;</button>
        </header>

        <div class="body">
          <!-- Contact first: the panel exists to make a call possible. -->
          <div class="contact">
            @if (d.summary.phoneNumber) {
              <a class="contact-btn primary" [href]="'tel:' + d.summary.phoneNumber">
                {{ d.summary.phoneNumber }}
              </a>
              <button type="button" class="contact-btn" (click)="copy(d.summary.phoneNumber!)">
                Copy
              </button>
              <a
                class="contact-btn"
                [href]="'https://wa.me/2' + d.summary.phoneNumber"
                target="_blank"
                rel="noopener"
              >
                WhatsApp
              </a>
            } @else {
              <span class="no-contact">No phone number on file</span>
            }
          </div>
          @if (d.summary.email) {
            <p class="email">{{ d.summary.email }}</p>
          }

          <!-- ── The verdict: all three axes, side by side ──────────────── -->
          <section class="sec">
            <div class="axes">
              <div>
                <span class="k">How often</span>
                <app-usage-badge [value]="d.summary.cadence" axis="cadence" />
                <span class="v tnum">{{ d.summary.activeDays30 }} of 30 days</span>
              </div>
              <div>
                <span class="k">Who works it</span>
                <app-usage-badge [value]="d.summary.operators" axis="operators" />
                <span class="v tnum">{{ d.summary.totalWrites30 }} actions</span>
              </div>
              <div>
                <span class="k">Set up</span>
                <app-usage-badge
                  [value]="d.summary.hasRealData ? 'Active' : 'Expired'"
                  axis="subscription"
                />
                <span class="v">{{ d.summary.hasRealData ? 'Ready to teach' : 'Not usable yet' }}</span>
              </div>
            </div>

            <div class="strip-wrap">
              <app-day-strip
                [values]="series()"
                [teacherValues]="teacherSeries()"
                [assistantValues]="assistantSeries()"
                [gap]="1"
              />
              <div class="legend">
                <span><i class="sw t"></i>Teacher</span>
                <span><i class="sw a"></i>Assistant</span>
                <span class="right">
                  90 days · {{ d.summary.activeDays7 }} active this week
                </span>
              </div>
            </div>
          </section>

          <!-- ── Who is actually doing the work ─────────────────────────── -->
          <section class="sec">
            <h3>Who is on this account</h3>
            <ul class="people">
              @for (p of d.operators; track p.userId) {
                <li [class.gone]="!p.isActive">
                  <span class="p-n">
                    {{ p.fullName }}
                    <span class="p-r">{{ p.role }}</span>
                    @if (!p.isActive) {
                      <span class="p-r">removed</span>
                    }
                  </span>
                  <span class="p-s">{{ seen(p.lastActivityAt, p.lastLoginAt) }}</span>
                </li>
              }
            </ul>
          </section>

          <!-- ── What they use ──────────────────────────────────────────── -->
          <section class="sec">
            <h3>What they use</h3>
            @if (d.moduleBreakdown30.length) {
              @for (m of d.moduleBreakdown30; track m.key) {
                <div class="bar-row">
                  <span class="bar-label">{{ moduleName(m.key) }}</span>
                  <div class="bar-track">
                    <span class="bar-fill" [style.width.%]="pct(m.count)"></span>
                  </div>
                  <span class="bar-num tnum">{{ m.count }}</span>
                </div>
              }
            } @else {
              <p class="none">Nothing used in the last 30 days.</p>
            }
            @if (lapsed().length) {
              <p class="lapsed">Stopped using: {{ lapsed().join(', ') }}</p>
            }
          </section>

          <!-- ── Is it set up? Each pair, gap highlighted ───────────────── -->
          <section class="sec">
            <h3>Is it set up</h3>
            <dl class="pairs">
              <div [class.gap]="d.summary.studentCount > 0 && d.summary.studentsAssignedToSession === 0">
                <dt>Students in a session</dt>
                <dd class="tnum">
                  {{ d.summary.studentsAssignedToSession }} / {{ d.summary.studentCount }}
                </dd>
              </div>
              <div [class.gap]="d.summary.sessionCount > 0 && d.summary.sessionsWithOccurrences === 0">
                <dt>Sessions with class days</dt>
                <dd class="tnum">
                  {{ d.summary.sessionsWithOccurrences }} / {{ d.summary.sessionCount }}
                </dd>
              </div>
              <div [class.gap]="d.summary.linkedAccountCount > d.summary.boundAccountCount">
                <dt>Student accounts linked</dt>
                <dd class="tnum">
                  {{ d.summary.boundAccountCount }} / {{ d.summary.linkedAccountCount }}
                </dd>
              </div>
              <div>
                <dt>Has ever</dt>
                <dd class="ever">
                  <span [class.yes]="d.summary.hasEverMarkedAttendance">attendance</span>
                  <span [class.yes]="d.summary.hasEverCollectedPayment">payments</span>
                </dd>
              </div>
            </dl>
          </section>

          <!-- ── Commercial ─────────────────────────────────────────────── -->
          <section class="sec">
            <h3>Subscription and sales</h3>
            <dl class="facts">
              <div><dt>Plan</dt><dd>{{ d.summary.planType ?? '—' }}</dd></div>
              <div><dt>Status</dt><dd>{{ d.summary.subscriptionStatus ?? '—' }}</dd></div>
              <div><dt>Subscribed</dt><dd>{{ formatDate(d.summary.subscriptionStartDate) || '—' }}</dd></div>
              <div><dt>Expires</dt><dd>{{ formatDate(d.summary.subscriptionEndDate) || '—' }}</dd></div>
              <div><dt>Sales rep</dt><dd>{{ d.summary.salesRepName ?? 'Not assigned' }}</dd></div>
              <div><dt>Registered</dt><dd>{{ formatDate(d.summary.registeredAt) }}</dd></div>
            </dl>
          </section>

          <!-- ── Notes ──────────────────────────────────────────────────── -->
          <section class="sec">
            <h3>Notes</h3>
            <textarea
              class="form-control note-in"
              rows="2"
              placeholder="What happened on the call?"
              [formControl]="noteBody"
            ></textarea>
            <button
              type="button"
              class="btn btn-primary btn-sm note-save"
              (click)="addNote()"
              [disabled]="busy() || !noteBody.value.trim()"
            >
              Save note
            </button>

            @if (notes().length) {
              <ul class="notes">
                @for (n of notes(); track n.id) {
                  <li>
                    <p class="n-b">{{ n.body }}</p>
                    <p class="n-m">{{ n.authorName }} · {{ formatDateTime(n.createdAt) }}</p>
                  </li>
                }
              </ul>
            } @else {
              <p class="none">Nothing recorded yet.</p>
            }
          </section>

          <footer class="foot">
            <a class="btn btn-outline-secondary btn-sm" [routerLink]="['/teachers', teacherId()]">
              Open full record
            </a>
            <button
              type="button"
              class="btn btn-outline-secondary btn-sm"
              (click)="recompute()"
              [disabled]="busy()"
            >
              Refresh figures
            </button>
            <span class="computed">
              {{ d.summary.computedAt ? 'updated ' + timeAgo(d.summary.computedAt) : 'never computed' }}
            </span>
          </footer>
        </div>
      } @else if (loading()) {
        <div class="loading"><span class="spinner-sm"></span> Loading</div>
      } @else {
        <div class="loading">
          Could not load this teacher.
          <button type="button" class="close" (click)="closed.emit()" aria-label="Close">&times;</button>
        </div>
      }
    </aside>
  `,
  styles: [
    `
      :host {
        position: fixed;
        inset: 0;
        z-index: var(--z-drawer);
        display: block;
      }
      .scrim {
        position: absolute;
        inset: 0;
        background: rgba(18, 22, 31, 0.35);
      }
      .panel-sheet {
        position: absolute;
        top: 0;
        right: 0;
        height: 100%;
        width: min(560px, 100%);
        background: var(--surface);
        border-left: 1px solid var(--rule);
        box-shadow: var(--lift-modal);
        display: flex;
        flex-direction: column;
        animation: slide-in 0.18s ease-out;
      }
      @keyframes slide-in {
        from {
          transform: translateX(24px);
          opacity: 0.4;
        }
      }

      .head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--s-3);
        padding: var(--s-4);
        border-bottom: 1px solid var(--rule);
      }
      .head h2 {
        margin: 0;
        font-size: var(--t-lg);
        line-height: 1.2;
      }
      .head-sub {
        display: flex;
        gap: var(--s-3);
        flex-wrap: wrap;
        margin: var(--s-1) 0 0;
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      .close {
        border: 0;
        background: none;
        font-size: 1.7rem;
        line-height: 1;
        color: var(--ink-3);
        cursor: pointer;
        padding: 0 var(--s-1);
      }
      .close:hover {
        color: var(--ink);
      }

      .body {
        overflow-y: auto;
        padding: var(--s-4);
      }

      /* Contact sits above everything: the panel exists to enable a call. */
      .contact {
        display: flex;
        gap: var(--s-2);
        flex-wrap: wrap;
      }
      .contact-btn {
        padding: 0.4rem 0.75rem;
        border: 1px solid var(--rule-strong);
        border-radius: var(--r-sm);
        background: var(--surface);
        color: var(--ink-2);
        font-size: var(--t-sm);
        text-decoration: none;
        cursor: pointer;
      }
      .contact-btn.primary {
        font-family: var(--font-mono);
        border-color: var(--accent);
        background: var(--accent-soft);
        color: var(--accent-ink);
        font-weight: 500;
      }
      .contact-btn:hover {
        border-color: var(--ink-4);
      }
      .no-contact {
        font-size: var(--t-sm);
        color: var(--risk);
      }
      .email {
        margin: var(--s-2) 0 0;
        font-size: var(--t-sm);
        color: var(--ink-3);
      }

      .sec {
        margin-top: var(--s-5);
        padding-top: var(--s-4);
        border-top: 1px solid var(--rule);
      }
      .sec h3 {
        margin: 0 0 var(--s-3);
        font-size: var(--t-sm);
        font-weight: 600;
        color: var(--ink-2);
      }

      .axes {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: var(--s-3);
      }
      .axes > div {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 3px;
      }
      .k {
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      .v {
        font-size: var(--t-xs);
        color: var(--ink-3);
      }

      .strip-wrap {
        margin-top: var(--s-4);
      }
      .legend {
        display: flex;
        gap: var(--s-3);
        align-items: center;
        margin-top: var(--s-2);
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      .legend .right {
        margin-left: auto;
      }
      .sw {
        display: inline-block;
        width: 9px;
        height: 9px;
        border-radius: 2px;
        margin-right: 4px;
        vertical-align: -1px;
      }
      .sw.t {
        background: var(--accent);
      }
      .sw.a {
        background: var(--live);
      }

      .people {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .people li {
        display: flex;
        justify-content: space-between;
        gap: var(--s-3);
        padding: var(--s-2) 0;
        border-bottom: 1px solid var(--rule);
        font-size: var(--t-sm);
      }
      .people li:last-child {
        border-bottom: 0;
      }
      .people li.gone {
        opacity: 0.6;
      }
      .p-r {
        font-size: var(--t-xs);
        color: var(--ink-3);
        margin-left: var(--s-2);
      }
      .p-s {
        font-size: var(--t-xs);
        color: var(--ink-3);
        white-space: nowrap;
      }

      .bar-row {
        display: grid;
        grid-template-columns: 8rem 1fr 2.5rem;
        align-items: center;
        gap: var(--s-3);
        padding: 2px 0;
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
        font-size: var(--t-xs);
        text-align: right;
        color: var(--ink-2);
      }
      .lapsed {
        margin: var(--s-2) 0 0;
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      .none {
        margin: 0;
        font-size: var(--t-sm);
        color: var(--ink-3);
      }

      .pairs,
      .facts {
        margin: 0;
      }
      .pairs > div,
      .facts > div {
        display: flex;
        justify-content: space-between;
        gap: var(--s-3);
        padding: var(--s-2) 0;
        border-bottom: 1px solid var(--rule);
      }
      .pairs > div:last-child,
      .facts > div:last-child {
        border-bottom: 0;
      }
      dt {
        font-size: var(--t-sm);
        color: var(--ink-2);
        font-weight: 400;
      }
      dd {
        margin: 0;
        font-size: var(--t-sm);
        font-weight: 500;
      }
      /* A gap between the pair is a real misconfiguration — the one thing in
         these lists that earns colour. */
      .pairs > div.gap dd {
        color: var(--risk);
        font-weight: 600;
      }
      .ever span {
        color: var(--ink-4);
        margin-left: var(--s-2);
        text-decoration: line-through;
      }
      .ever span.yes {
        color: var(--live);
        text-decoration: none;
      }

      .note-in {
        font-size: var(--t-sm);
      }
      .note-save {
        margin-top: var(--s-2);
      }
      .notes {
        list-style: none;
        margin: var(--s-3) 0 0;
        padding: 0;
      }
      .notes li {
        padding: var(--s-2) 0;
        border-top: 1px solid var(--rule);
      }
      .n-b {
        margin: 0;
        font-size: var(--t-sm);
        white-space: pre-wrap;
      }
      .n-m {
        margin: 2px 0 0;
        font-size: var(--t-xs);
        color: var(--ink-3);
      }

      .foot {
        display: flex;
        align-items: center;
        gap: var(--s-2);
        flex-wrap: wrap;
        margin-top: var(--s-5);
        padding-top: var(--s-4);
        border-top: 1px solid var(--rule);
      }
      .computed {
        font-size: var(--t-xs);
        color: var(--ink-3);
      }

      .loading {
        display: flex;
        align-items: center;
        gap: var(--s-2);
        padding: var(--s-6);
        color: var(--ink-3);
        font-size: var(--t-sm);
      }

      /* Phones: a full-height sheet rather than a narrow column. */
      @media (max-width: 575.98px) {
        .panel-sheet {
          width: 100%;
          border-left: 0;
        }
        .bar-row {
          grid-template-columns: 6.5rem 1fr 2rem;
        }
      }
    `,
  ],
  host: {
    '(document:keydown.escape)': 'closed.emit()',
  },
})
export class TeacherPanelComponent {
  private readonly insights = inject(AdminInsightsService);
  private readonly toast = inject(ToastService);

  readonly teacherId = input.required<number>();
  readonly closed = output<void>();

  protected readonly detail = signal<TeacherUsageDetail | null>(null);
  protected readonly notes = signal<AdminNote[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly noteBody = new FormControl('', { nonNullable: true });

  protected readonly formatDate = formatDate;
  protected readonly formatDateTime = formatDateTime;
  protected readonly timeAgo = timeAgo;

  protected readonly title = computed(() => this.detail()?.summary.fullName ?? 'Teacher');
  protected readonly series = computed(() => this.detail()?.dailySeries.map((p) => p.totalWrites) ?? []);
  protected readonly teacherSeries = computed(() => this.detail()?.dailySeries.map((p) => p.teacherWrites) ?? []);
  protected readonly assistantSeries = computed(() => this.detail()?.dailySeries.map((p) => p.assistantWrites) ?? []);

  /** Used before but not in the last 30 days — "gave up on it" vs "never adopted it". */
  protected readonly lapsed = computed(() => {
    const s = this.detail()?.summary;
    if (!s) return [];
    return s.modulesAllTime.filter((m) => !s.modules.includes(m)).map((m) => MODULE_NAMES[m] ?? m);
  });

  constructor() {
    // Re-loads whenever the selected teacher changes, so moving between rows
    // keeps the panel open rather than closing and reopening it.
    effect(() => {
      const id = this.teacherId();
      this.detail.set(null);
      this.notes.set([]);
      this.loading.set(true);

      this.insights.getTeacher(id).subscribe({
        next: (d) => {
          this.detail.set(d);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
      this.insights.getNotes(id).subscribe((n) => this.notes.set(n));
    });

    // The page behind must not scroll while the panel is over it.
    effect((onCleanup) => {
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      onCleanup(() => {
        document.body.style.overflow = previous;
      });
    });
  }

  protected pct(count: number): number {
    const peak = Math.max(...(this.detail()?.moduleBreakdown30.map((m) => m.count) ?? [1]), 1);
    return count === 0 ? 0 : Math.max(4, (count / peak) * 100);
  }

  protected moduleName(key: string): string {
    return MODULE_NAMES[key] ?? key;
  }

  protected seen(lastActivityAt: string | null, lastLoginAt: string | null): string {
    const latest = [lastActivityAt, lastLoginAt].filter((v): v is string => !!v).sort().pop();
    return latest ? timeAgo(latest) : 'never seen';
  }

  protected copy(value: string): void {
    navigator.clipboard?.writeText(value).then(
      () => this.toast.success('Number copied.'),
      () => this.toast.error('Could not copy.'),
    );
  }

  protected addNote(): void {
    const body = this.noteBody.value.trim();
    if (!body) return;

    this.busy.set(true);
    this.insights.createNote(this.teacherId(), { body, isPinned: false }).subscribe({
      next: (n) => {
        this.notes.update((c) => [n, ...c]);
        this.noteBody.setValue('');
        this.busy.set(false);
        this.toast.success('Note saved.');
      },
      error: () => this.busy.set(false),
    });
  }

  protected recompute(): void {
    this.busy.set(true);
    this.insights.recomputeTeacher(this.teacherId()).subscribe({
      next: (d) => {
        this.detail.set(d);
        this.busy.set(false);
        this.toast.success('Figures refreshed.');
      },
      error: () => this.busy.set(false),
    });
  }
}

const MODULE_NAMES: Record<string, string> = {
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
