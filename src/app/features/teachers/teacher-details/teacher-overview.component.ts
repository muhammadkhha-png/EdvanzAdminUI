import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  AdminInsightsService,
  AdminNote,
  TeacherModuleUsage,
  TeacherUsageDetail,
} from '../../../core/services/admin-insights.service';
import { TeacherService } from '../../../core/services/teacher.service';
import { TeacherProfile } from '../../../core/models/teacher.model';
import { ToastService } from '../../../core/services/toast.service';
import { DayStripComponent } from '../../../shared/components/day-strip/day-strip.component';
import { FEATURE_LABELS } from '../../../shared/utils/feature-labels';
import { formatDate, timeAgo } from '../../../shared/utils/time-format';

/**
 * OVERVIEW — the state of the account on one screen.
 *
 * Ordered by what a support call needs first: what they pay for and whether the
 * limits they pay for are anywhere near what they use, then whether the account is
 * SET UP (as a checklist in plain words, because "HasRealData: false" is not an
 * answer anyone can act on), then whether it is being worked and by whom, then the
 * notes the team has left about them.
 */
@Component({
  selector: 'app-teacher-overview',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, DayStripComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (detail(); as d) {
      <div class="grid">
        <!-- ── What they pay for, against what they use ─────────────────── -->
        <section class="panel">
          <h2>Plan and limits</h2>
          <dl>
            <div>
              <dt>Plan</dt>
              <dd>{{ planLabel() }}</dd>
            </div>
            <div>
              <dt>Subscription</dt>
              <dd [attr.data-tone]="subTone()">{{ subLine() }}</dd>
            </div>
            <div>
              <dt>Subscribed on</dt>
              <dd>{{ d.summary.subscriptionStartDate ? day(d.summary.subscriptionStartDate) : '—' }}</dd>
            </div>
            @if (profile(); as p) {
              <div>
                <dt>Students on the account</dt>
                <dd [attr.data-tone]="capacityTone(d.summary.studentCount, p.studentCapacity)">
                  {{ d.summary.studentCount }} of {{ p.studentCapacity || '—' }}
                </dd>
              </div>
              <div>
                <dt>Student app accounts</dt>
                <dd [attr.data-tone]="capacityTone(d.summary.boundAccountCount, p.linkedStudentCapacity ?? 0)">
                  {{ d.summary.boundAccountCount }} of {{ p.linkedStudentCapacity || '—' }}
                  <span class="note-inline">the plan is priced on this</span>
                </dd>
              </div>
            }
          </dl>
          <a class="link" [routerLink]="['/teacher', teacherId(), 'subscription']">
            Change the subscription →
          </a>
        </section>

        <!-- ── Is it set up? In words. ──────────────────────────────────── -->
        <section class="panel">
          <h2>Is it set up</h2>
          <ul class="check">
            <li [attr.data-ok]="d.summary.studentCount > 0">
              {{
                d.summary.studentCount > 0
                  ? d.summary.studentCount + ' students uploaded'
                  : 'No students uploaded yet'
              }}
            </li>
            <li [attr.data-ok]="d.summary.studentsAssignedToSession > 0">
              {{
                d.summary.studentsAssignedToSession > 0
                  ? d.summary.studentsAssignedToSession + ' of them are in a class'
                  : 'No student is in a class — those students open an empty app'
              }}
            </li>
            <li [attr.data-ok]="d.summary.sessionsWithOccurrences > 0">
              {{
                d.summary.sessionsWithOccurrences > 0
                  ? d.summary.sessionsWithOccurrences + ' classes have class days'
                  : 'No class has any class days yet'
              }}
            </li>
            <li [attr.data-ok]="d.summary.hasEverMarkedAttendance">
              {{
                d.summary.hasEverMarkedAttendance
                  ? 'Attendance has been marked'
                  : 'Attendance has never been marked'
              }}
            </li>
            <li [attr.data-ok]="d.summary.hasEverCollectedPayment">
              {{
                d.summary.hasEverCollectedPayment
                  ? 'Money has been collected'
                  : 'No money has ever been collected'
              }}
            </li>
            <li [attr.data-ok]="d.summary.boundAccountCount > 0">
              {{
                d.summary.boundAccountCount > 0
                  ? d.summary.boundAccountCount + ' students have the app linked'
                  : 'No student has the app linked'
              }}
            </li>
          </ul>
        </section>

        <!-- ── Is it being worked, and by whom ──────────────────────────── -->
        <section class="panel wide">
          <h2>Using it</h2>
          <p class="pair">
            <b class="tnum" [attr.data-tone]="d.summary.activeDays7 ? 'live' : 'gone'">
              {{ d.summary.activeDays7 }}
            </b>
            of the last 7 days ·
            <b class="tnum" [attr.data-tone]="d.summary.activeDays30 ? 'live' : 'gone'">
              {{ d.summary.activeDays30 }}
            </b>
            of the last 30 ·
            <b class="tnum">{{ d.summary.activeDays90 }}</b> of the last 90
          </p>

          <app-day-strip [values]="strip90()" [teacherValues]="teacher90()" [assistantValues]="assistant90()" />
          <p class="cap">Ninety days, oldest first. Teacher and assistant work are shaded apart.</p>

          <p class="pair">
            Teacher last did something
            <b>{{ d.summary.lastTeacherActivityAt ? ago(d.summary.lastTeacherActivityAt) : 'never' }}</b>
            @if (d.summary.activeAssistantCount > 0) {
              · assistants
              <b>{{ d.summary.lastAssistantActivityAt ? ago(d.summary.lastAssistantActivityAt) : 'never' }}</b>
            }
          </p>

          <p class="feat">
            Uses <b>{{ d.summary.featuresAdoptedCount }} of {{ d.summary.featuresEntitledCount }}</b>
            features they pay for. Every one of them is listed below.
          </p>
        </section>

        <!-- ── Module by module ───────────────────────────────────────────
             Listed, not counted. "4 of 10" does not say which four, and a tick
             does not separate someone who opened Payments once from someone who
             collects money every week — so each row carries the date and the
             volume that do. -->
        <section class="panel wide">
          <h2>Module by module</h2>
          <p class="cap">
            What they have, what they actually do in it, and when they last did it.
            Worst first — what they are not using is why you are here.
          </p>

          <div class="m-scroll">
            <table class="modules">
              <thead>
                <tr>
                  <th scope="col">Module</th>
                  <th scope="col">State</th>
                  <th scope="col">Last used</th>
                  <th scope="col">In 30 days</th>
                  <th scope="col">Ever</th>
                  <th scope="col">Days used</th>
                </tr>
              </thead>
              <tbody>
                @for (m of d.moduleUsage; track m.module) {
                  <tr [attr.data-state]="m.state">
                    <th scope="row">{{ featureLabel(m.module) }}</th>
                    <td><span class="state">{{ stateLabel(m) }}</span></td>
                    <td class="txt-s">{{ m.lastUsedOn ? day(m.lastUsedOn) : '—' }}</td>
                    <td class="tnum">{{ m.writes30 || '—' }}</td>
                    <td class="tnum">{{ m.writesAllTime || '—' }}</td>
                    <td class="tnum">
                      {{ m.daysUsedAllTime ? m.daysUsedAllTime + (m.daysUsedAllTime === 1 ? ' day' : ' days') : '—' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <p class="cap legend">
            <b>Live</b> — used in the last 30 days ·
            <b>Gave up on it</b> — used before, nothing recently ·
            <b>Never opened</b> — pays for it, has never once used it ·
            <b>Not on their plan</b> — they do not have it, so it is not a gap.
          </p>
        </section>

        <!-- ── Notes ────────────────────────────────────────────────────── -->
        <section class="panel wide">
          <h2>Notes</h2>
          <p class="cap">Internal. Never shown to the teacher.</p>

          @if (notes().length === 0) {
            <p class="muted">Nobody has left a note yet.</p>
          } @else {
            <ul class="notes">
              @for (n of notes(); track n.id) {
                <li>
                  @if (n.isPinned) {
                    <span class="pin">Pinned</span>
                  }
                  <span class="n-body">{{ n.body }}</span>
                  <span class="n-meta">
                    {{ n.authorName }} · {{ day(n.createdAt) }}
                    @if (n.followUpDate) {
                      · follow up {{ n.followUpDate }}
                    }
                  </span>
                  <button type="button" class="n-del" (click)="removeNote(n)" [attr.aria-label]="'Delete note'">
                    Delete
                  </button>
                </li>
              }
            </ul>
          }

          <div class="add">
            <input type="text" [formControl]="body" placeholder="Add a note" aria-label="Note" />
            <label class="pin-toggle">
              <input type="checkbox" [formControl]="pinned" />
              Pin it
            </label>
            <label class="follow">
              Follow up
              <input type="date" [formControl]="followUp" aria-label="Follow up on" />
            </label>
            <button type="button" class="btn" [disabled]="busy() || !body.value.trim()" (click)="add()">
              Add note
            </button>
          </div>
        </section>
      </div>
    } @else {
      <div class="sk"></div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: var(--s-4);
      }
      .panel {
        padding: var(--s-4);
        background: var(--surface);
        border-radius: var(--r-md);
      }
      .wide {
        grid-column: 1 / -1;
      }
      h2 {
        margin: 0 0 var(--s-3);
        font-size: var(--t-base);
        font-weight: 650;
        color: var(--ink);
      }

      dl {
        margin: 0 0 var(--s-3);
        display: grid;
        gap: var(--s-3);
      }
      dt {
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      dd {
        margin: 0;
        font-size: var(--t-sm);
        font-weight: 600;
        color: var(--ink);
      }
      .note-inline {
        display: block;
        font-size: var(--t-xs);
        font-weight: 400;
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

      /* The checklist carries a word, not only a colour: "no student is in a class"
         says what is wrong; a red dot says only that something is. */
      .check {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: var(--s-2);
      }
      .check li {
        position: relative;
        padding-left: 22px;
        font-size: var(--t-sm);
        color: var(--ink-2);
      }
      .check li::before {
        position: absolute;
        left: 0;
        font-weight: 700;
      }
      .check li[data-ok='true']::before {
        content: '✓';
        color: var(--live);
      }
      .check li[data-ok='false']::before {
        content: '✕';
        color: var(--gone);
      }
      .check li[data-ok='false'] {
        color: var(--gone);
      }

      .pair,
      .feat,
      .never,
      .cap,
      .muted {
        margin: 0 0 var(--s-2);
        font-size: var(--t-sm);
        color: var(--ink-2);
      }
      .cap,
      .muted {
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      .never {
        color: var(--risk);
      }

      .link {
        font-size: var(--t-sm);
        font-weight: 600;
        color: var(--accent);
        text-decoration: none;
      }
      .link:hover {
        text-decoration: underline;
      }

      .notes {
        margin: 0 0 var(--s-3);
        padding: 0;
        list-style: none;
        display: grid;
        gap: var(--s-3);
      }
      .notes li {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--s-2);
        padding-bottom: var(--s-2);
        border-bottom: 1px solid var(--rule);
        font-size: var(--t-sm);
      }
      .pin {
        font-size: var(--t-xs);
        font-weight: 700;
        color: var(--risk);
      }
      .n-body {
        flex: 1 1 240px;
        color: var(--ink);
      }
      .n-meta {
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      .n-del {
        border: 0;
        background: none;
        font: inherit;
        font-size: var(--t-xs);
        color: var(--ink-3);
        cursor: pointer;
        text-decoration: underline;
      }
      .n-del:hover {
        color: var(--gone);
      }

      .add {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--s-2);
      }
      .add input[type='text'] {
        flex: 1 1 240px;
        min-height: 40px;
        padding: 0 var(--s-3);
        border: 1px solid var(--rule-strong);
        border-radius: var(--r-sm);
        font: inherit;
        font-size: var(--t-sm);
      }
      .pin-toggle,
      .follow {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      .follow input {
        min-height: 40px;
        padding: 0 var(--s-2);
        border: 1px solid var(--rule-strong);
        border-radius: var(--r-sm);
        font: inherit;
        font-size: var(--t-sm);
      }
      .btn {
        min-height: 40px;
        padding: 0 var(--s-4);
        border: 0;
        border-radius: var(--r-sm);
        background: var(--accent);
        font: inherit;
        font-size: var(--t-sm);
        font-weight: 600;
        color: #fff;
        cursor: pointer;
      }
      .btn:disabled {
        opacity: 0.55;
        cursor: default;
      }

      /* Wide content scrolls inside its own box; the page never scrolls sideways. */
      .m-scroll {
        overflow-x: auto;
      }
      .modules {
        width: 100%;
        min-width: 560px;
        border-collapse: collapse;
        font-size: var(--t-sm);
      }
      .modules thead th {
        padding: var(--s-2) var(--s-3);
        text-align: left;
        font-size: var(--t-xs);
        font-weight: 600;
        color: var(--ink-3);
        white-space: nowrap;
      }
      .modules tbody th,
      .modules tbody td {
        padding: var(--s-2) var(--s-3);
        text-align: left;
      }
      .modules tbody th {
        font-weight: 650;
        color: var(--ink);
      }
      .modules tbody tr:nth-child(odd) {
        background: var(--surface-2);
      }
      .modules td.tnum {
        text-align: right;
      }

      /* The state carries a word AND a colour; the word is never dropped, so the
         table reads the same without colour. */
      .state {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: var(--t-xs);
        font-weight: 650;
        white-space: nowrap;
      }
      tr[data-state='Live'] .state {
        background: var(--live-soft);
        color: var(--live);
      }
      tr[data-state='Lapsed'] .state {
        background: var(--risk-soft);
        color: var(--risk);
      }
      tr[data-state='NeverOpened'] .state {
        background: var(--gone-soft);
        color: var(--gone);
      }
      tr[data-state='NotOnTheirPlan'] .state {
        background: var(--quiet-soft);
        color: var(--ink-3);
      }
      /* A module they do not have is not a failing, so it recedes. */
      tr[data-state='NotOnTheirPlan'] {
        opacity: 0.62;
      }
      .legend b {
        color: var(--ink-2);
      }
      .txt-s {
        font-size: var(--t-xs);
        color: var(--ink-2);
      }

      .sk {
        height: 320px;
        border-radius: var(--r-md);
        background: var(--quiet-soft);
      }
    `,
  ],
})
export class TeacherOverviewComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly insights = inject(AdminInsightsService);
  private readonly teachers = inject(TeacherService);
  private readonly toast = inject(ToastService);

  protected readonly detail = signal<TeacherUsageDetail | null>(null);
  protected readonly profile = signal<TeacherProfile | null>(null);
  protected readonly notes = signal<AdminNote[]>([]);
  protected readonly busy = signal(false);

  protected readonly body = new FormControl('', { nonNullable: true });
  protected readonly pinned = new FormControl(false, { nonNullable: true });
  protected readonly followUp = new FormControl('', { nonNullable: true });

  protected readonly teacherId = signal(0);

  constructor() {
    // The id lives on the PARENT route — this is a child of the teacher shell.
    const id = Number(this.route.parent?.snapshot.paramMap.get('id') ?? 0);
    this.teacherId.set(id);
    if (!id) return;

    this.insights.getTeacher(id).subscribe((d) => this.detail.set(d));
    this.teachers.getTeacherById(id).subscribe((p) => this.profile.set(p));
    this.insights.getNotes(id).subscribe((n) => this.notes.set(n));
  }

  protected readonly planLabel = computed(() => {
    const p = this.detail()?.summary.planType;
    if (!p) return 'No plan';
    return p === 'ManagerialPlus' ? 'Managerial + Parents' : p;
  });

  protected readonly subLine = computed(() => {
    const d = this.detail()?.summary.subscriptionEndsInDays;
    if (d === undefined || d === null) return 'never subscribed';
    if (d < 0) return `ended ${Math.abs(d)} days ago`;
    if (d === 0) return 'ends today';
    return `${d} day${d === 1 ? '' : 's'} left`;
  });

  protected readonly subTone = computed(() => {
    const d = this.detail()?.summary.subscriptionEndsInDays;
    if (d === undefined || d === null || d < 0) return 'gone';
    return d <= 7 ? 'risk' : 'live';
  });

  /** Amber as the limit is approached, red once it is reached — a teacher at their
   *  ceiling cannot add the student they are on the phone about. */
  protected capacityTone(used: number, limit: number): string {
    if (!limit) return '';
    if (used >= limit) return 'gone';
    return used / limit >= 0.85 ? 'risk' : '';
  }

  protected readonly strip90 = computed(() => this.detail()?.dailySeries.map((p) => p.totalWrites) ?? []);
  protected readonly teacher90 = computed(() => this.detail()?.dailySeries.map((p) => p.teacherWrites) ?? []);
  protected readonly assistant90 = computed(() => this.detail()?.dailySeries.map((p) => p.assistantWrites) ?? []);

  protected readonly neverOpened = computed(() => {
    const list = this.detail()?.summary.featuresNeverUsed ?? [];
    return list.length ? list.map((f) => FEATURE_LABELS[f] ?? f).join(', ') : null;
  });

  protected readonly lapsed = computed(() => {
    const list = this.detail()?.summary.featuresLapsed ?? [];
    return list.length ? list.map((f) => FEATURE_LABELS[f] ?? f).join(', ') : null;
  });

  /**
   * The state in words, with the number that justifies it. "Gave up on it" is a
   * different conversation from "never opened", and a date is what tells them apart.
   */
  protected stateLabel(m: TeacherModuleUsage): string {
    switch (m.state) {
      case 'Live':
        return 'Live';
      case 'Lapsed':
        return 'Gave up on it';
      case 'NeverOpened':
        return 'Never opened';
      default:
        return 'Not on their plan';
    }
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

  protected add(): void {
    const text = this.body.value.trim();
    if (!text || this.busy()) return;

    this.busy.set(true);
    this.insights
      .createNote(this.teacherId(), {
        body: text,
        isPinned: this.pinned.value,
        followUpDate: this.followUp.value || null,
      })
      .subscribe({
        next: (n) => {
          this.notes.update((list) => [n, ...list]);
          this.body.setValue('');
          this.pinned.setValue(false);
          this.followUp.setValue('');
          this.busy.set(false);
          this.toast.success('Note added.');
        },
        error: () => this.busy.set(false),
      });
  }

  protected removeNote(note: AdminNote): void {
    this.insights.deleteNote(this.teacherId(), note.id).subscribe({
      next: () => {
        this.notes.update((list) => list.filter((n) => n.id !== note.id));
        this.toast.success('Note deleted.');
      },
    });
  }
}
