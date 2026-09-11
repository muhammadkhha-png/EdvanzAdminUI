import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  AdminInsightsService,
  AdminNote,
  SalesRep,
  TeacherUsageDetail,
} from '../../core/services/admin-insights.service';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import { DayStripComponent } from '../../shared/components/day-strip/day-strip.component';
import { UsageBadgeComponent } from '../../shared/components/usage-badge/usage-badge.component';
import { ToastService } from '../../core/services/toast.service';
import { formatDate, formatDateTime, timeAgo } from '../../shared/utils/time-format';

/**
 * TEACHER 360 — the usage tab.
 *
 * Everything an admin needs to answer "what is going on with this account?" in
 * one place: the three axes, the 90-day shape, what is actually configured, the
 * PEOPLE who work it, who sold it, and the notes anyone has left.
 *
 * Diagnosing a complaint used to mean hopping across Teachers, Assistants,
 * Students, Activity and Subscription, and still not seeing whether the account
 * was set up correctly.
 */
@Component({
  selector: 'app-teacher-usage-tab',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, DayStripComponent, UsageBadgeComponent],
  template: `
    @if (detail(); as d) {
      <!-- ── The three axes, stated plainly ──────────────────────────── -->
      <section class="panel verdict">
        <div class="verdict-bands">
          <div>
            <span class="axis-label">How often</span>
            <app-usage-badge [value]="d.summary.cadence" axis="cadence" />
            <span class="axis-sub tnum">
              {{ d.summary.activeDays30 }} of the last 30 days ·
              {{ d.summary.totalWrites30 }} actions
            </span>
          </div>
          <div>
            <span class="axis-label">What they use</span>
            <span class="chips">
              @if (d.summary.modules.length) {
                @for (m of d.summary.modules; track m) {
                  <app-usage-badge [value]="m" axis="module" />
                }
              } @else {
                <span class="axis-sub">Nothing in the last 30 days</span>
              }
            </span>
            @if (lapsedModules().length) {
              <span class="axis-sub">
                Stopped using: {{ lapsedModules().join(', ') }}
              </span>
            }
          </div>
          <div>
            <span class="axis-label">Who works it</span>
            <app-usage-badge [value]="d.summary.operators" axis="operators" />
            <span class="axis-sub">
              {{ d.summary.activeAssistantCount }}
              {{ d.summary.activeAssistantCount === 1 ? 'assistant' : 'assistants' }}
            </span>
          </div>
        </div>

        <div class="verdict-strip">
          <app-day-strip
            [values]="series()"
            [teacherValues]="teacherSeries()"
            [assistantValues]="assistantSeries()"
            [gap]="1"
          />
          <div class="strip-legend">
            <span><i class="sw teacher"></i>Teacher</span>
            <span><i class="sw assistant"></i>Assistant</span>
            <span class="right">
              Last 90 days ·
              {{
                d.summary.computedAt
                  ? 'updated ' + timeAgo(d.summary.computedAt)
                  : 'never computed'
              }}
              <button type="button" class="link-btn" (click)="recompute()" [disabled]="busy()">
                Recompute now
              </button>
            </span>
          </div>
        </div>
      </section>

      <div class="two-col">
        <!-- ── Is this account actually set up? ─────────────────────── -->
        <section class="panel">
          <div class="panel-head">
            <h3>Is it set up?</h3>
            <app-usage-badge
              [value]="d.summary.hasRealData ? 'Active' : 'Expired'"
              axis="subscription"
            />
          </div>
          <div class="panel-body">
            <!-- Each pair is (total, the part that works). The GAP is the story:
                 a roster nobody put in a session shows students an empty app. -->
            <dl class="pairs">
              <div [class.gap]="d.summary.studentCount > 0 && d.summary.studentsAssignedToSession === 0">
                <dt>Students in a session</dt>
                <dd class="tnum">
                  {{ d.summary.studentsAssignedToSession }} / {{ d.summary.studentCount }}
                </dd>
                @if (d.summary.studentCount > 0 && d.summary.studentsAssignedToSession === 0) {
                  <p>None of these students is assigned to a session, so every one of them
                     opens an empty app.</p>
                }
              </div>
              <div [class.gap]="d.summary.sessionCount > 0 && d.summary.sessionsWithOccurrences === 0">
                <dt>Sessions with class days</dt>
                <dd class="tnum">
                  {{ d.summary.sessionsWithOccurrences }} / {{ d.summary.sessionCount }}
                </dd>
                @if (d.summary.sessionCount > 0 && d.summary.sessionsWithOccurrences === 0) {
                  <p>No session has generated a class day, so attendance cannot be taken.</p>
                }
              </div>
              <div [class.gap]="d.summary.linkedAccountCount > d.summary.boundAccountCount">
                <dt>Student accounts linked</dt>
                <dd class="tnum">
                  {{ d.summary.boundAccountCount }} / {{ d.summary.linkedAccountCount }}
                </dd>
                @if (d.summary.linkedAccountCount > d.summary.boundAccountCount) {
                  <p>
                    {{ d.summary.linkedAccountCount - d.summary.boundAccountCount }}
                    connected but not linked to a student record, so they see nothing.
                  </p>
                }
              </div>
              <div>
                <dt>Has ever</dt>
                <dd class="ever">
                  <span [class.yes]="d.summary.hasEverMarkedAttendance">
                    {{ d.summary.hasEverMarkedAttendance ? 'Marked attendance' : 'Never marked attendance' }}
                  </span>
                  <span [class.yes]="d.summary.hasEverCollectedPayment">
                    {{ d.summary.hasEverCollectedPayment ? 'Collected money' : 'Never collected money' }}
                  </span>
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <!-- ── The people ───────────────────────────────────────────── -->
        <section class="panel">
          <div class="panel-head"><h3>Who is on this account</h3></div>
          <div class="panel-body">
            <ul class="people">
              @for (p of d.operators; track p.userId) {
                <li [class.inactive]="!p.isActive">
                  <span class="p-name">
                    {{ p.fullName }}
                    @if (!p.isActive) {
                      <span class="removed">Removed</span>
                    }
                  </span>
                  <span class="p-meta">
                    {{ p.role }}
                    @if (p.username) {
                      · <span class="code">{{ p.username }}</span>
                    }
                  </span>
                  <span class="p-seen">{{ seen(p.lastActivityAt, p.lastLoginAt) }}</span>
                </li>
              }
            </ul>
          </div>
        </section>
      </div>

      <div class="two-col">
        <!-- ── Sales attribution ────────────────────────────────────── -->
        <section class="panel">
          <div class="panel-head"><h3>Who sold this account</h3></div>
          <div class="panel-body">
            <div class="field">
              <label class="form-label" for="rep">Sales rep</label>
              <select id="rep" class="form-select" [formControl]="repControl">
                <option value="">Not assigned</option>
                @for (rep of reps(); track rep.id) {
                  <option [value]="rep.id">{{ rep.name }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label class="form-label" for="source">How it was acquired</label>
              <input
                id="source"
                class="form-control"
                placeholder="Field visit, referral, inbound…"
                [formControl]="sourceControl"
              />
            </div>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              (click)="saveSales()"
              [disabled]="busy()"
            >
              Save attribution
            </button>
          </div>
        </section>

        <!-- ── Notes ────────────────────────────────────────────────── -->
        <section class="panel">
          <div class="panel-head">
            <h3>Notes</h3>
            <span class="small muted">{{ notes().length }}</span>
          </div>
          <div class="panel-body">
            <textarea
              class="form-control note-input"
              rows="3"
              placeholder="What happened when you called? What did they ask for?"
              [formControl]="noteBody"
            ></textarea>
            <div class="note-actions">
              <label class="pin">
                <input type="checkbox" [(ngModel)]="notePinned" [ngModelOptions]="{ standalone: true }" />
                Keep at the top
              </label>
              <input
                type="date"
                class="form-control follow-up"
                [formControl]="noteFollowUp"
                aria-label="Follow up on"
              />
              <button
                type="button"
                class="btn btn-primary btn-sm"
                (click)="addNote()"
                [disabled]="busy() || !noteBody.value.trim()"
              >
                Save note
              </button>
            </div>

            @if (notes().length) {
              <ul class="notes">
                @for (n of notes(); track n.id) {
                  <li [class.pinned]="n.isPinned">
                    <p class="n-body">{{ n.body }}</p>
                    <p class="n-meta">
                      {{ n.authorName }} · {{ formatDateTime(n.createdAt) }}
                      @if (n.followUpDate) {
                        · follow up {{ formatDate(n.followUpDate) }}
                      }
                      <button type="button" class="link-btn danger" (click)="removeNote(n)">
                        Delete
                      </button>
                    </p>
                  </li>
                }
              </ul>
            } @else {
              <p class="small muted no-notes">
                Nothing recorded yet. The first note is usually the reason someone called.
              </p>
            }
          </div>
        </section>
      </div>
    } @else if (loading()) {
      <div class="skeleton-block"></div>
    } @else {
      <section class="panel empty-state">
        <h3>Could not load this teacher's usage</h3>
        <p>Try again in a moment, or recompute the figures from the list.</p>
      </section>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* ── The verdict panel ───────────────────────────────────────── */
      .verdict {
        padding: var(--s-4);
        margin-bottom: var(--s-4);
      }
      .verdict-bands {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: var(--s-4);
        padding-bottom: var(--s-4);
        border-bottom: 1px solid var(--rule);
      }
      .verdict-bands > div {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: var(--s-1);
        min-width: 0;
      }
      .axis-label {
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      .axis-sub {
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 3px;
      }

      .verdict-strip {
        padding-top: var(--s-4);
      }
      .strip-legend {
        display: flex;
        align-items: center;
        gap: var(--s-3);
        margin-top: var(--s-2);
        font-size: var(--t-xs);
        color: var(--ink-3);
        flex-wrap: wrap;
      }
      .strip-legend .right {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: var(--s-2);
      }
      .sw {
        display: inline-block;
        width: 9px;
        height: 9px;
        border-radius: 2px;
        margin-right: 4px;
        vertical-align: -1px;
      }
      .sw.teacher {
        background: var(--accent);
      }
      .sw.assistant {
        background: var(--live);
      }

      .link-btn {
        border: 0;
        background: none;
        padding: 0;
        color: var(--accent);
        font-size: inherit;
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      .link-btn.danger {
        color: var(--gone);
        margin-left: var(--s-2);
      }
      .link-btn:disabled {
        color: var(--ink-4);
        cursor: default;
      }

      /* ── Two-column body ─────────────────────────────────────────── */
      .two-col {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
        gap: var(--s-4);
        margin-bottom: var(--s-4);
      }

      /* ── Setup pairs ─────────────────────────────────────────────── */
      .pairs {
        margin: 0;
      }
      .pairs > div {
        padding: var(--s-2) 0;
        border-bottom: 1px solid var(--rule);
      }
      .pairs > div:last-child {
        border-bottom: 0;
      }
      .pairs dt {
        font-size: var(--t-sm);
        font-weight: 500;
        color: var(--ink-2);
      }
      .pairs dd {
        margin: 2px 0 0;
        font-size: var(--t-md);
        font-weight: 600;
      }
      /* A gap between the pair is a real misconfiguration, so it is the one thing
         on this panel that earns colour. */
      .pairs > div.gap dd {
        color: var(--risk);
      }
      .pairs p {
        margin: var(--s-1) 0 0;
        font-size: var(--t-xs);
        color: var(--risk);
        line-height: 1.45;
      }
      .ever {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: var(--t-sm);
        font-weight: 400;
        color: var(--ink-3);
      }
      .ever .yes {
        color: var(--live);
      }

      /* ── People ──────────────────────────────────────────────────── */
      .people {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .people li {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 2px var(--s-3);
        padding: var(--s-2) 0;
        border-bottom: 1px solid var(--rule);
      }
      .people li:last-child {
        border-bottom: 0;
      }
      .people li.inactive {
        opacity: 0.62;
      }
      .p-name {
        font-size: var(--t-sm);
        font-weight: 500;
      }
      .removed {
        font-size: var(--t-xs);
        color: var(--ink-3);
        font-weight: 400;
        margin-left: var(--s-1);
      }
      .p-meta {
        grid-column: 1;
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      .p-seen {
        grid-row: 1 / span 2;
        grid-column: 2;
        align-self: center;
        font-size: var(--t-xs);
        color: var(--ink-3);
        white-space: nowrap;
      }

      /* ── Sales + notes ───────────────────────────────────────────── */
      .field {
        margin-bottom: var(--s-3);
      }
      .note-input {
        font-size: var(--t-sm);
      }
      .note-actions {
        display: flex;
        align-items: center;
        gap: var(--s-3);
        margin: var(--s-2) 0 var(--s-4);
        flex-wrap: wrap;
      }
      .pin {
        display: flex;
        align-items: center;
        gap: var(--s-1);
        font-size: var(--t-sm);
        color: var(--ink-2);
      }
      .follow-up {
        width: auto;
        font-size: var(--t-sm);
      }
      .notes {
        list-style: none;
        margin: 0;
        padding: 0;
        border-top: 1px solid var(--rule);
      }
      .notes li {
        padding: var(--s-3) 0;
        border-bottom: 1px solid var(--rule);
      }
      .notes li.pinned {
        border-left: 2px solid var(--accent);
        padding-left: var(--s-3);
      }
      .n-body {
        margin: 0;
        font-size: var(--t-sm);
        white-space: pre-wrap;
        line-height: 1.55;
      }
      .n-meta {
        margin: var(--s-1) 0 0;
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      .no-notes {
        margin: 0;
      }

      .empty-state {
        padding: var(--s-6);
        text-align: center;
      }
      .empty-state h3 {
        margin: 0 0 var(--s-2);
        font-size: var(--t-md);
      }
      .empty-state p {
        margin: 0;
        color: var(--ink-3);
        font-size: var(--t-sm);
      }
      .skeleton-block {
        height: 320px;
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
    `,
  ],
})
export class TeacherUsageTabComponent implements OnInit {
  private readonly insights = inject(AdminInsightsService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);

  readonly teacherId = input.required<number>();

  protected readonly detail = signal<TeacherUsageDetail | null>(null);
  protected readonly notes = signal<AdminNote[]>([]);
  protected readonly reps = signal<SalesRep[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);

  protected readonly repControl = new FormControl('', { nonNullable: true });
  protected readonly sourceControl = new FormControl('', { nonNullable: true });
  protected readonly noteBody = new FormControl('', { nonNullable: true });
  protected readonly noteFollowUp = new FormControl('', { nonNullable: true });
  protected notePinned = false;

  protected readonly formatDate = formatDate;
  protected readonly formatDateTime = formatDateTime;
  protected readonly timeAgo = timeAgo;

  protected readonly series = computed(() =>
    this.detail()?.dailySeries.map((p) => p.totalWrites) ?? [],
  );
  protected readonly teacherSeries = computed(() =>
    this.detail()?.dailySeries.map((p) => p.teacherWrites) ?? [],
  );
  protected readonly assistantSeries = computed(() =>
    this.detail()?.dailySeries.map((p) => p.assistantWrites) ?? [],
  );

  /**
   * Modules used at some point but not in the last 30 days. "Never adopted
   * payments" and "gave up on payments" are different conversations, and only
   * this difference tells them apart.
   */
  protected readonly lapsedModules = computed(() => {
    const s = this.detail()?.summary;
    if (!s) return [];
    return s.modulesAllTime.filter((m) => !s.modules.includes(m));
  });

  ngOnInit(): void {
    this.load();
    this.insights.getSalesReps().subscribe((r) => this.reps.set(r));
  }

  private load(): void {
    this.loading.set(true);
    this.insights.getTeacher(this.teacherId()).subscribe({
      next: (d) => {
        this.detail.set(d);
        this.repControl.setValue(d.summary.salesRepId ? String(d.summary.salesRepId) : '');
        this.sourceControl.setValue(d.summary.acquisitionSource ?? '');
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    this.insights.getNotes(this.teacherId()).subscribe((n) => this.notes.set(n));
  }

  protected recompute(): void {
    this.busy.set(true);
    this.insights.recomputeTeacher(this.teacherId()).subscribe({
      next: (d) => {
        this.detail.set(d);
        this.busy.set(false);
        this.toast.success('Usage recomputed.');
      },
      error: () => this.busy.set(false),
    });
  }

  protected saveSales(): void {
    this.busy.set(true);
    this.insights
      .assignSalesRep(this.teacherId(), {
        // An empty select clears the attribution — an explicit, supported action.
        salesRepId: this.repControl.value ? Number(this.repControl.value) : null,
        acquisitionSource: this.sourceControl.value.trim() || null,
      })
      .subscribe({
        next: (summary) => {
          this.detail.update((d) => (d ? { ...d, summary } : d));
          this.busy.set(false);
          this.toast.success('Attribution saved.');
        },
        error: () => this.busy.set(false),
      });
  }

  protected addNote(): void {
    const body = this.noteBody.value.trim();
    if (!body) return;

    this.busy.set(true);
    this.insights
      .createNote(this.teacherId(), {
        body,
        isPinned: this.notePinned,
        followUpDate: this.noteFollowUp.value || null,
      })
      .subscribe({
        next: (note) => {
          // Pinned first, then newest — mirrors the order the API returns.
          this.notes.update((current) =>
            [note, ...current].sort(
              (a, b) =>
                Number(b.isPinned) - Number(a.isPinned) ||
                b.createdAt.localeCompare(a.createdAt),
            ),
          );
          this.noteBody.setValue('');
          this.noteFollowUp.setValue('');
          this.notePinned = false;
          this.busy.set(false);
          this.toast.success('Note saved.');
        },
        error: () => this.busy.set(false),
      });
  }

  protected async removeNote(note: AdminNote): Promise<void> {
    const ok = await this.confirm.open({
      title: 'Delete this note?',
      message: 'It will stop showing here. The record is kept for audit.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;

    this.insights.deleteNote(this.teacherId(), note.id).subscribe(() => {
      this.notes.update((current) => current.filter((n) => n.id !== note.id));
      this.toast.success('Note deleted.');
    });
  }

  /** Last-seen for a person, preferring activity over login. */
  protected seen(lastActivityAt: string | null, lastLoginAt: string | null): string {
    const latest = [lastActivityAt, lastLoginAt]
      .filter((v): v is string => !!v)
      .sort()
      .pop();
    return latest ? timeAgo(latest) : 'never seen';
  }
}
