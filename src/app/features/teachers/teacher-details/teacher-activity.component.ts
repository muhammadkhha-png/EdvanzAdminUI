import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  AdminInsightsService,
  TeacherUsageDetail,
  UsageDayPoint,
} from '../../../core/services/admin-insights.service';
import { AdminConsoleService, ConsoleLogins } from '../../../core/services/admin-console.service';
import { FEATURE_LABELS } from '../../../shared/utils/feature-labels';
import { formatDate, formatDateTime } from '../../../shared/utils/time-format';

/**
 * ACTIVITY — what actually happened on this account, day by day, and who signed in.
 *
 * The daily series is rendered as SENTENCES rather than as a chart. A chart answers
 * "how much"; a support call asks "what did they do on Tuesday", and the answer has
 * to name the modules and say whether it was the teacher or an assistant.
 *
 * Quiet days are dropped from the timeline — ninety rows of "nothing" is not a
 * timeline — but the gap between entries is stated, so a silence is visible rather
 * than merely absent.
 */
@Component({
  selector: 'app-teacher-activity',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cols">
      <section class="pane">
        <h2>What they did</h2>
        <p class="cap">The last 90 days. Days with nothing on them are summarised, not listed.</p>

        @if (!detail()) {
          <div class="sk"></div>
        } @else if (timeline().length === 0) {
          <p class="empty">Nothing at all in the last 90 days.</p>
        } @else {
          <ol class="timeline">
            @for (e of timeline(); track e.key) {
              @if (e.kind === 'gap') {
                <li class="gap">{{ e.text }}</li>
              } @else {
                <li class="day">
                  <span class="d-date">{{ e.text }}</span>
                  <span class="d-what">{{ e.detail }}</span>
                  @if (e.who) {
                    <span class="d-who">{{ e.who }}</span>
                  }
                </li>
              }
            }
          </ol>
        }
      </section>

      <section class="pane">
        <h2>Who signed in</h2>

        @if (!logins()) {
          <div class="sk"></div>
        } @else {
          @if (logins()!.recordedSince; as since) {
            <p class="cap">Sign-ins have been recorded since {{ day(since) }}.</p>
          } @else {
            <p class="cap">No sign-in has been recorded on the platform yet.</p>
          }

          @for (p of people(); track p.userId) {
            <div class="person">
              <h3>
                {{ p.fullName }}
                <span class="role">{{ p.role }}</span>
                @if (!p.isActive) {
                  <span class="removed">removed</span>
                }
              </h3>
              <p class="last">
                Last signed in {{ p.lastLoginAt ? stamp(p.lastLoginAt) : 'never' }}
                @if (p.lastActivityAt) {
                  · last seen {{ stamp(p.lastActivityAt) }}
                }
              </p>

              @if (p.events.length === 0) {
                <p class="cap">
                  No individual sign-in on record
                  @if (logins()!.recordedSince) {
                    — they have not signed in since recording started
                  }.
                </p>
              } @else {
                <ul class="events">
                  @for (e of p.events; track e.occurredAt) {
                    <li>
                      <span class="e-action">{{ e.action === 'logOut' ? 'Signed out' : 'Signed in' }}</span>
                      <span class="e-when">{{ stamp(e.occurredAt) }}</span>
                      <span class="e-dev">{{ e.deviceOrBrowser || 'unknown device' }}</span>
                      <span class="e-ip tnum">{{ e.ipAddress || '—' }}</span>
                    </li>
                  }
                </ul>
              }
            </div>
          }
        }
      </section>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .cols {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
        gap: var(--s-4);
      }
      .pane {
        padding: var(--s-4);
        background: var(--surface);
        border-radius: var(--r-md);
        min-width: 0;
      }
      h2 {
        margin: 0 0 var(--s-2);
        font-size: var(--t-base);
        font-weight: 650;
      }
      h3 {
        margin: 0;
        font-size: var(--t-sm);
        font-weight: 650;
      }
      .cap,
      .empty,
      .last {
        margin: 0 0 var(--s-3);
        font-size: var(--t-xs);
        color: var(--ink-3);
      }

      .timeline {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: var(--s-2);
        max-height: 560px;
        overflow-y: auto;
      }
      .day {
        display: grid;
        gap: 2px;
        padding: var(--s-2) var(--s-3);
        background: var(--surface-2);
        border-radius: var(--r-sm);
        font-size: var(--t-sm);
      }
      .d-date {
        font-weight: 650;
        color: var(--ink);
      }
      .d-what {
        color: var(--ink-2);
      }
      .d-who {
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      /* A silence is stated rather than left as a blank gap nobody notices. */
      .gap {
        padding: var(--s-1) var(--s-3);
        font-size: var(--t-xs);
        color: var(--risk);
      }

      .person {
        padding-top: var(--s-3);
        margin-top: var(--s-3);
        border-top: 1px solid var(--rule);
      }
      .person:first-of-type {
        border-top: 0;
        margin-top: 0;
      }
      .role,
      .removed {
        margin-left: var(--s-2);
        font-size: var(--t-xs);
        font-weight: 600;
        color: var(--ink-3);
      }
      .removed {
        color: var(--gone);
      }

      .events {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: var(--s-2);
        max-height: 260px;
        overflow-y: auto;
      }
      .events li {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-2) var(--s-3);
        font-size: var(--t-xs);
        color: var(--ink-2);
      }
      .e-action {
        font-weight: 650;
        color: var(--ink);
        min-width: 80px;
      }
      .e-dev,
      .e-ip {
        color: var(--ink-3);
      }

      .sk {
        height: 240px;
        border-radius: var(--r-md);
        background: var(--quiet-soft);
      }
    `,
  ],
})
export class TeacherActivityComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly insights = inject(AdminInsightsService);
  private readonly console = inject(AdminConsoleService);

  protected readonly detail = signal<TeacherUsageDetail | null>(null);
  protected readonly logins = signal<ConsoleLogins | null>(null);

  constructor() {
    const id = Number(this.route.parent?.snapshot.paramMap.get('id') ?? 0);
    if (!id) return;
    this.insights.getTeacher(id).subscribe((d) => this.detail.set(d));
    this.console.getLogins(id).subscribe({
      next: (l) => this.logins.set(l),
      // A teacher with no operator rows 404s; an empty panel is a better answer
      // than a spinner that never stops.
      error: () => this.logins.set(null),
    });
  }

  /** The teacher first, then assistants — the order a call works through them. */
  protected readonly people = computed(() => {
    const l = this.logins();
    if (!l) return [];
    return [l.teacher, ...l.assistants];
  });

  /**
   * Days with something on them, newest first, with the silences between them
   * spelled out. Ninety rows of "nothing" is not a timeline — but a gap that is
   * merely absent is a gap nobody sees.
   */
  protected readonly timeline = computed(() => {
    const series = this.detail()?.dailySeries ?? [];
    const active = series.filter((p) => p.totalWrites > 0).reverse();
    if (active.length === 0) return [];

    const out: { key: string; kind: 'day' | 'gap'; text: string; detail?: string; who?: string }[] = [];

    active.forEach((p, i) => {
      const previous = active[i - 1];
      if (previous) {
        const gap = daysBetween(p.date, previous.date);
        if (gap > 1) {
          out.push({
            key: `gap-${p.date}`,
            kind: 'gap',
            text: `${gap - 1} quiet day${gap - 1 === 1 ? '' : 's'}`,
          });
        }
      }
      out.push({
        key: p.date,
        kind: 'day',
        text: formatDate(p.date),
        detail: describe(p),
        who: who(p),
      });
    });

    return out;
  });

  protected day(iso?: string | null): string {
    return formatDate(iso);
  }
  protected stamp(iso?: string | null): string {
    return formatDateTime(iso);
  }
}

/** "Marked attendance and collected payments" rather than "mask 6, 12 writes". */
function describe(p: UsageDayPoint): string {
  const names = (p.modules ?? []).map((m) => FEATURE_LABELS[m] ?? m);
  if (names.length === 0) return `${p.totalWrites} things done`;

  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${list} · ${p.totalWrites} thing${p.totalWrites === 1 ? '' : 's'} done`;
}

/** Who did it. Unattributed writes are never assumed to be the teacher's. */
function who(p: UsageDayPoint): string | undefined {
  if (p.teacherWrites > 0 && p.assistantWrites > 0) {
    return `${p.teacherWrites} by the teacher, ${p.assistantWrites} by an assistant`;
  }
  if (p.assistantWrites > 0) return 'all by an assistant';
  if (p.teacherWrites > 0) return 'all by the teacher';
  return undefined;
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
  return Math.abs(Math.round(ms / 86_400_000));
}
