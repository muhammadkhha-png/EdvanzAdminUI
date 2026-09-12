import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AdminConsoleService, ConsoleSnapshot } from '../../../core/services/admin-console.service';
import { formatDate } from '../../../shared/utils/time-format';

/** Day index as the platform stores it: 0 = Saturday, the Egyptian week. */
const DAY_NAMES = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/**
 * WHAT THEY HAVE — the account's contents, read-only.
 *
 * This is "see what they see". When a teacher says a class is missing or a student
 * cannot find a video, the answer is usually visible here in one glance: a class with
 * NO CLASS DAYS produces nothing downstream, and a class with no students is not the
 * one they think they are looking at.
 *
 * Counted live rather than from the nightly rollup — a figure a day old is what sends
 * someone hunting a bug that was fixed this morning.
 */
@Component({
  selector: 'app-teacher-snapshot',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (snap(); as s) {
      <div class="tiles">
        <div class="tile">
          <span class="n tnum">{{ s.studentCount }}</span>
          <span class="l">students on the account</span>
          <span class="c" [attr.data-tone]="s.studentsInClasses < s.studentCount ? 'risk' : ''">
            {{ s.studentsInClasses }} are in a class
          </span>
        </div>
        <div class="tile">
          <span class="n tnum">{{ s.classes.length }}</span>
          <span class="l">classes</span>
          <span class="c" [attr.data-tone]="classesWithoutDays(s) ? 'risk' : ''">
            {{ classesWithoutDays(s) }} have no class days
          </span>
        </div>
        <div class="tile">
          <span class="n tnum">{{ s.studentAccounts.active }}</span>
          <span class="l">student app accounts</span>
          <span class="c" [attr.data-tone]="s.studentAccounts.bound < s.studentAccounts.active ? 'risk' : ''">
            {{ s.studentAccounts.bound }} linked to a student
          </span>
        </div>
        <div class="tile">
          <span class="n tnum">{{ s.videos.total }}</span>
          <span class="l">videos</span>
          <span class="c">{{ s.videos.latestAt ? 'newest ' + day(s.videos.latestAt) : 'none yet' }}</span>
        </div>
        <div class="tile">
          <span class="n tnum">{{ s.onlineExams.total }}</span>
          <span class="l">online exams</span>
          <span class="c">
            {{ s.onlineExams.latestAt ? 'newest ' + day(s.onlineExams.latestAt) : 'none yet' }}
          </span>
        </div>
        <div class="tile">
          <span class="n tnum">{{ s.examsAndHomework.total }}</span>
          <span class="l">exams &amp; homework</span>
          <span class="c">
            {{ s.examsAndHomework.latestAt ? 'newest ' + day(s.examsAndHomework.latestAt) : 'none yet' }}
          </span>
        </div>
      </div>

      <section class="panel">
        <h2>Classes</h2>
        @if (s.classes.length === 0) {
          <p class="empty">No classes. Nothing downstream of a class can work — no attendance, no
            videos, no online exams.</p>
        } @else {
          <div class="t-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Class</th>
                  <th scope="col">Group</th>
                  <th scope="col">Days</th>
                  <th scope="col">Time</th>
                  <th scope="col">Runs</th>
                  <th scope="col">Students</th>
                  <th scope="col">Class days</th>
                </tr>
              </thead>
              <tbody>
                @for (c of s.classes; track c.sessionId) {
                  <tr>
                    <th scope="row">{{ c.sessionName }}</th>
                    <td class="small">{{ c.groupName || '—' }}</td>
                    <td class="small">{{ dayNames(c.scheduleDays) }}</td>
                    <td class="small tnum">{{ time(c.startTime) }} · {{ c.durationMinutes }} min</td>
                    <td class="small">{{ day(c.startDate) }} → {{ day(c.endDate) }}</td>
                    <td class="tnum" [attr.data-tone]="c.studentCount === 0 ? 'risk' : ''">
                      {{ c.studentCount }}
                    </td>
                    <td class="tnum" [attr.data-tone]="c.occurrenceCount === 0 ? 'gone' : ''">
                      {{ c.occurrenceCount === 0 ? 'none — this class never happens' : c.occurrenceCount }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      @if (s.videos.latestTitles.length || s.onlineExams.latestTitles.length || s.examsAndHomework.latestTitles.length) {
        <section class="panel">
          <h2>Most recent content</h2>
          <div class="lists">
            @if (s.videos.latestTitles.length) {
              <div>
                <h3>Videos</h3>
                <ul>
                  @for (t of s.videos.latestTitles; track t) {
                    <li>{{ t }}</li>
                  }
                </ul>
              </div>
            }
            @if (s.onlineExams.latestTitles.length) {
              <div>
                <h3>Online exams</h3>
                <ul>
                  @for (t of s.onlineExams.latestTitles; track t) {
                    <li>{{ t }}</li>
                  }
                </ul>
              </div>
            }
            @if (s.examsAndHomework.latestTitles.length) {
              <div>
                <h3>Exams &amp; homework</h3>
                <ul>
                  @for (t of s.examsAndHomework.latestTitles; track t) {
                    <li>{{ t }}</li>
                  }
                </ul>
              </div>
            }
          </div>
        </section>
      }
    } @else {
      <div class="sk"></div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .tiles {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: var(--s-3);
        margin-bottom: var(--s-4);
      }
      .tile {
        display: grid;
        gap: 2px;
        padding: var(--s-4);
        background: var(--quiet-soft);
        border-radius: var(--r-md);
      }
      .n {
        font-size: var(--t-num);
        font-weight: 700;
        line-height: 1.05;
        letter-spacing: -0.03em;
        color: var(--ink);
      }
      .l {
        font-size: var(--t-sm);
        font-weight: 600;
        color: var(--ink);
      }
      .c {
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      [data-tone='risk'] {
        color: var(--risk);
      }
      [data-tone='gone'] {
        color: var(--gone);
        font-weight: 600;
      }

      .panel {
        padding: var(--s-4);
        background: var(--surface);
        border-radius: var(--r-md);
        margin-bottom: var(--s-4);
      }
      h2 {
        margin: 0 0 var(--s-3);
        font-size: var(--t-base);
        font-weight: 650;
      }
      h3 {
        margin: 0 0 var(--s-2);
        font-size: var(--t-sm);
        font-weight: 650;
        color: var(--ink-3);
      }

      .t-scroll {
        overflow-x: auto;
      }
      table {
        width: 100%;
        min-width: 780px;
        border-collapse: collapse;
        font-size: var(--t-sm);
      }
      thead th {
        padding: var(--s-2) var(--s-3);
        text-align: left;
        font-size: var(--t-xs);
        font-weight: 600;
        color: var(--ink-3);
        white-space: nowrap;
      }
      tbody th,
      tbody td {
        padding: var(--s-2) var(--s-3);
        text-align: left;
      }
      tbody th {
        font-weight: 650;
        color: var(--ink);
      }
      tbody tr:nth-child(odd) {
        background: var(--surface-2);
      }
      .small {
        font-size: var(--t-xs);
        color: var(--ink-2);
      }

      .lists {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: var(--s-4);
      }
      .lists ul {
        margin: 0;
        padding-left: var(--s-4);
        font-size: var(--t-sm);
        color: var(--ink-2);
      }
      .lists li {
        margin-bottom: 2px;
      }

      .empty {
        margin: 0;
        font-size: var(--t-sm);
        color: var(--gone);
      }
      .sk {
        height: 320px;
        border-radius: var(--r-md);
        background: var(--quiet-soft);
      }
    `,
  ],
})
export class TeacherSnapshotComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly console = inject(AdminConsoleService);

  protected readonly snap = signal<ConsoleSnapshot | null>(null);

  constructor() {
    const id = Number(this.route.parent?.snapshot.paramMap.get('id') ?? 0);
    if (id) this.console.getSnapshot(id).subscribe((s) => this.snap.set(s));
  }

  protected classesWithoutDays(s: ConsoleSnapshot): number {
    return s.classes.filter((c) => c.occurrenceCount === 0).length;
  }

  /** "0,6" is stored day INDEXES, and 0 is Saturday here, not Sunday. */
  protected dayNames(selected: string | null): string {
    if (!selected) return '—';
    return selected
      .split(',')
      .map((d) => DAY_NAMES[Number(d.trim())] ?? d.trim())
      .join(' ');
  }

  /** "16:00:00" → "16:00". The seconds are never meaningful on a class schedule. */
  protected time(value: string): string {
    return value?.slice(0, 5) ?? '—';
  }

  protected day(iso?: string | null): string {
    return formatDate(iso);
  }
}
