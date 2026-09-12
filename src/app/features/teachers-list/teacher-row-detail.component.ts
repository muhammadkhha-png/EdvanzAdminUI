import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminInsightsService, AdminNote, TeacherUsage, TeacherUsageDetail } from '../../core/services/admin-insights.service';
import { AuthService } from '../../core/services/auth.service';
import { TeacherService } from '../../core/services/teacher.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import { DayStripComponent } from '../../shared/components/day-strip/day-strip.component';
import { FEATURE_LABELS } from '../../shared/utils/feature-labels';
import { formatDate, timeAgo } from '../../shared/utils/time-format';

/**
 * What opens when a row is clicked: the rest of the account, and everything an admin
 * can DO to it.
 *
 * THE ACTIONS ARE THE POINT. A previous merge of the teacher screens lost them and
 * left a list you could only read — so every one of them lives here, reachable in two
 * clicks from any row: open, edit, subscription, modules, reset password,
 * activate/deactivate, delete, call, WhatsApp.
 *
 * The grid row is passed in rather than re-fetched. Only the three things it does not
 * carry — the people on the account, the 30-day shape, and the notes — cost a request,
 * and they are fetched once when the row opens rather than for every row in the page.
 */
@Component({
  selector: 'app-teacher-row-detail',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule, DayStripComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <!-- ── Facts, then the shape of the last month ────────────────────── -->
      <div class="cols">
        <section class="pane">
          <h4>Account</h4>
          <dl>
            <div>
              <dt>Subscription</dt>
              <dd [attr.data-tone]="subTone()">{{ subLine() }}</dd>
            </div>
            <div>
              <dt>Subscribed on</dt>
              <dd>{{ row().subscriptionStartDate ? day(row().subscriptionStartDate) : '—' }}</dd>
            </div>
            <div>
              <dt>Registered</dt>
              <dd>{{ day(row().registeredAt) }}</dd>
            </div>
            <div>
              <dt>Teacher last signed in</dt>
              <dd>{{ row().lastLoginAt ? ago(row().lastLoginAt) : 'never' }}</dd>
            </div>
            @if (row().salesRepName) {
              <div>
                <dt>Sold by</dt>
                <dd>{{ row().salesRepName }}</dd>
              </div>
            }
            @if (row().email) {
              <div>
                <dt>Email</dt>
                <dd class="wrapword">{{ row().email }}</dd>
              </div>
            }
          </dl>
        </section>

        <section class="pane">
          <h4>Set up</h4>
          <dl>
            <div>
              <dt>Students</dt>
              <dd [attr.data-tone]="studentTone()">
                {{ row().studentCount }} on the account, {{ row().studentsAssignedToSession }} in a class
              </dd>
            </div>
            <div>
              <dt>Classes</dt>
              <dd [attr.data-tone]="row().sessionsWithOccurrences === 0 && row().sessionCount > 0 ? 'risk' : ''">
                {{ row().sessionCount }} created, {{ row().sessionsWithOccurrences }} with class days
              </dd>
            </div>
            <div>
              <dt>Student app accounts</dt>
              <dd>{{ row().linkedAccountCount }} connected, {{ row().boundAccountCount }} linked to a student</dd>
            </div>
            <div>
              <dt>Has ever marked attendance</dt>
              <dd [attr.data-tone]="row().hasEverMarkedAttendance ? 'live' : 'gone'">
                {{ row().hasEverMarkedAttendance ? 'yes' : 'no' }}
              </dd>
            </div>
            <div>
              <dt>Has ever collected money</dt>
              <dd [attr.data-tone]="row().hasEverCollectedPayment ? 'live' : 'gone'">
                {{ row().hasEverCollectedPayment ? 'yes' : 'no' }}
              </dd>
            </div>
          </dl>
        </section>

        <section class="pane">
          <h4>Using it</h4>
          <p class="pair">
            <b class="tnum" [attr.data-tone]="row().activeDays7 === 0 ? 'gone' : 'live'">{{ row().activeDays7 }}</b>
            of the last 7 days ·
            <b class="tnum" [attr.data-tone]="row().activeDays30 === 0 ? 'gone' : 'live'">{{ row().activeDays30 }}</b>
            of the last 30
          </p>
          <app-day-strip [values]="row().sparkline30" />

          <p class="feat">
            Uses <b>{{ row().featuresAdoptedCount }} of {{ row().featuresEntitledCount }}</b> features they pay for.
          </p>
          @if (usingNow(); as using) {
            <p class="using">Used in the last 30 days: {{ using }}</p>
          }
          @if (everUsed(); as ever) {
            <p class="cap">Used at some point: {{ ever }}</p>
          }
          @if (neverOpened(); as never) {
            <p class="never">Never opened: {{ never }}</p>
          }
          <a class="link" [routerLink]="['/teacher', row().teacherId]">
            See what they did in each one →
          </a>
        </section>
      </div>

      <!-- ── The people on the account ──────────────────────────────────── -->
      <section class="people">
        <h4>Who works this account</h4>
        @if (loadingDetail()) {
          <div class="sk"></div>
        } @else if (operators().length === 0) {
          <p class="muted">Nobody else — the teacher works it alone.</p>
        } @else {
          <ul>
            @for (o of operators(); track o.userId) {
              <li>
                <span class="p-name">{{ o.fullName }}</span>
                <span class="p-role">{{ o.role }}</span>
                @if (!o.isActive) {
                  <span class="p-removed">removed</span>
                }
                <span class="p-seen">
                  last seen {{ o.lastActivityAt || o.lastLoginAt ? ago(o.lastActivityAt ?? o.lastLoginAt) : 'never' }}
                </span>
              </li>
            }
          </ul>
        }
      </section>

      <!-- ── Notes ──────────────────────────────────────────────────────── -->
      <section class="notes">
        <h4>Notes</h4>
        @if (notes().length === 0) {
          <p class="muted">No notes yet.</p>
        } @else {
          @for (n of notes().slice(0, 3); track n.id) {
            <p class="note">
              @if (n.isPinned) {
                <span class="pin">Pinned</span>
              }
              <span class="n-body">{{ n.body }}</span>
              <span class="n-meta">{{ n.authorName }} · {{ day(n.createdAt) }}</span>
            </p>
          }
        }
        <div class="add-note">
          <input
            type="text"
            [formControl]="noteBody"
            placeholder="Add a note about this teacher"
            aria-label="Add a note"
            (keydown.enter)="addNote()"
          />
          <button type="button" [disabled]="busy() || !noteBody.value.trim()" (click)="addNote()">Add</button>
        </div>
      </section>

      <!-- ── Every action, two clicks from the row ──────────────────────── -->
      <section class="actions">
        <h4>Actions</h4>
        <div class="acts">
          @if (row().phoneNumber; as phone) {
            <a class="act primary" [href]="'tel:' + phone">Call {{ phone }}</a>
            <a class="act primary" [href]="whatsAppLink(phone)" target="_blank" rel="noopener">WhatsApp</a>
          }
          <a class="act" [routerLink]="['/teacher', row().teacherId]">Open full page</a>
          <a class="act" [routerLink]="['/teacher', row().teacherId, 'subscription']">Subscription</a>
          <a class="act" [routerLink]="['/teacher', row().teacherId, 'modules']">Modules</a>
          <a class="act" [routerLink]="['/teacher', row().teacherId, 'edit']">Edit</a>
          <button type="button" class="act" (click)="openReset()">Reset password</button>
          @if (row().accountStatus === 'Active') {
            <button type="button" class="act" [disabled]="busy()" (click)="setActive(false)">Deactivate</button>
          } @else {
            <button type="button" class="act" [disabled]="busy()" (click)="setActive(true)">Activate</button>
          }
          <button type="button" class="act danger" [disabled]="busy()" (click)="remove()">Delete</button>
        </div>

        @if (resetting()) {
          <div class="reset">
            <label [attr.for]="'pw-' + row().teacherId">New password</label>
            <p class="hint">Signs them out of every device. At least 8 characters.</p>
            <div class="reset-row">
              <input
                [id]="'pw-' + row().teacherId"
                type="text"
                [formControl]="newPassword"
                autocomplete="off"
                placeholder="New password"
              />
              <button
                type="button"
                class="act primary"
                [disabled]="busy() || newPassword.value.trim().length < 8"
                (click)="confirmReset()"
              >
                Set password
              </button>
              <button type="button" class="act" (click)="resetting.set(false)">Cancel</button>
            </div>
          </div>
        }
      </section>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .wrap {
        padding: var(--s-4);
        background: var(--surface-2);
        border-radius: var(--r-md);
      }

      .cols {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: var(--s-5);
      }
      h4 {
        margin: 0 0 var(--s-2);
        font-size: var(--t-sm);
        font-weight: 650;
        color: var(--ink-3);
      }

      dl {
        margin: 0;
        display: grid;
        gap: var(--s-2);
      }
      dl > div {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 1px;
      }
      dt {
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      dd {
        margin: 0;
        font-size: var(--t-sm);
        color: var(--ink-2);
        font-weight: 600;
      }
      dd[data-tone='live'] {
        color: var(--live);
      }
      dd[data-tone='risk'] {
        color: var(--risk);
      }
      dd[data-tone='gone'] {
        color: var(--gone);
      }
      .wrapword {
        overflow-wrap: anywhere;
      }

      .pair,
      .feat,
      .never,
      .muted,
      .note {
        margin: 0 0 var(--s-2);
        font-size: var(--t-sm);
        color: var(--ink-2);
      }
      .pair b[data-tone='live'] {
        color: var(--live);
      }
      .pair b[data-tone='gone'] {
        color: var(--gone);
      }
      .using {
        color: var(--live);
        margin: var(--s-2) 0 0;
        font-size: var(--t-sm);
      }
      .link {
        display: inline-block;
        margin-top: var(--s-2);
        font-size: var(--t-sm);
        font-weight: 600;
        color: var(--accent);
        text-decoration: none;
      }
      .link:hover {
        text-decoration: underline;
      }
      .never {
        color: var(--risk);
      }
      .muted {
        color: var(--ink-3);
      }

      .people,
      .notes,
      .actions {
        margin-top: var(--s-5);
      }
      .people ul {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: var(--s-2);
      }
      .people li {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--s-2) var(--s-3);
        font-size: var(--t-sm);
      }
      .p-name {
        font-weight: 600;
        color: var(--ink);
      }
      .p-role,
      .p-seen {
        color: var(--ink-3);
        font-size: var(--t-xs);
      }
      .p-removed {
        color: var(--gone);
        font-size: var(--t-xs);
        font-weight: 600;
      }

      .note {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-2);
        align-items: baseline;
      }
      .pin {
        font-size: var(--t-xs);
        font-weight: 700;
        color: var(--risk);
      }
      .n-meta {
        font-size: var(--t-xs);
        color: var(--ink-3);
      }

      .add-note {
        display: flex;
        gap: var(--s-2);
        margin-top: var(--s-2);
      }
      .add-note input,
      .reset input {
        flex: 1;
        min-height: 40px;
        min-width: 0;
        padding: 0 var(--s-3);
        border: 1px solid var(--rule-strong);
        border-radius: var(--r-sm);
        background: var(--surface);
        font: inherit;
        font-size: var(--t-sm);
      }
      .add-note button {
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

      .acts {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-2);
      }
      .act {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        padding: 0 var(--s-3);
        border: 0;
        border-radius: var(--r-sm);
        background: var(--quiet-soft);
        font: inherit;
        font-size: var(--t-sm);
        font-weight: 600;
        color: var(--ink-2);
        text-decoration: none;
        cursor: pointer;
        white-space: nowrap;
      }
      .act:hover:not(:disabled) {
        background: var(--rule);
        color: var(--ink);
      }
      .act.primary {
        background: var(--accent-soft);
        color: var(--accent-ink);
      }
      .act.primary:hover {
        background: #dde7ff;
      }
      /* The irreversible one sits apart in its own colour rather than beside the
         navigational buttons wearing the same grey. */
      .act.danger {
        margin-left: auto;
        background: var(--gone-soft);
        color: var(--gone);
      }
      .act:disabled {
        opacity: 0.55;
        cursor: default;
      }
      .act:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }

      .reset {
        margin-top: var(--s-3);
        padding: var(--s-3);
        background: var(--surface);
        border-radius: var(--r-sm);
      }
      .reset label {
        display: block;
        font-size: var(--t-sm);
        font-weight: 600;
      }
      .hint {
        margin: 2px 0 var(--s-2);
        font-size: var(--t-xs);
        color: var(--ink-3);
      }
      .reset-row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-2);
      }

      .sk {
        height: 42px;
        border-radius: var(--r-sm);
        background: var(--quiet-soft);
      }

      @media (max-width: 640px) {
        .act.danger {
          margin-left: 0;
        }
      }
    `,
  ],
})
export class TeacherRowDetailComponent {
  readonly row = input.required<TeacherUsage>();

  private readonly insights = inject(AdminInsightsService);
  private readonly teachers = inject(TeacherService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  protected readonly detail = signal<TeacherUsageDetail | null>(null);
  protected readonly notes = signal<AdminNote[]>([]);
  protected readonly loadingDetail = signal(true);
  protected readonly busy = signal(false);
  protected readonly resetting = signal(false);

  protected readonly newPassword = new FormControl('', { nonNullable: true });
  protected readonly noteBody = new FormControl('', { nonNullable: true });

  protected readonly operators = computed(() => this.detail()?.operators ?? []);

  constructor() {
    // Fetched once when the row opens — the page does not pay for detail on rows
    // nobody has looked at.
    queueMicrotask(() => {
      const id = this.row().teacherId;
      this.insights.getTeacher(id).subscribe({
        next: (d) => {
          this.detail.set(d);
          this.loadingDetail.set(false);
        },
        error: () => this.loadingDetail.set(false),
      });
      this.insights.getNotes(id).subscribe({ next: (n) => this.notes.set(n) });
    });
  }

  protected readonly subLine = computed(() => {
    const r = this.row();
    const plan = r.planType === 'ManagerialPlus' ? 'Managerial + Parents' : (r.planType ?? 'No plan');
    const days = r.subscriptionEndsInDays;
    if (days === null) return `${plan} · never subscribed`;
    if (days < 0) return `${plan} · ended ${Math.abs(days)} days ago`;
    if (days === 0) return `${plan} · ends today`;
    return `${plan} · ${days} day${days === 1 ? '' : 's'} left`;
  });

  protected readonly subTone = computed(() => {
    const days = this.row().subscriptionEndsInDays;
    if (days === null || days < 0) return 'gone';
    return days <= 7 ? 'risk' : 'live';
  });

  protected readonly studentTone = computed(() => {
    const r = this.row();
    if (r.studentCount === 0) return 'gone';
    return r.studentsAssignedToSession === 0 ? 'risk' : 'live';
  });

  /** Which modules they are actually in, named — the half "4 of 10" leaves out. */
  protected readonly usingNow = computed(() => {
    const list = this.row().modules ?? [];
    return list.length ? list.map((f) => FEATURE_LABELS[f] ?? f).join(', ') : null;
  });

  /** Ever touched, so "gave up on it" is visible beside "never started". */
  protected readonly everUsed = computed(() => {
    const list = this.row().modulesAllTime ?? [];
    return list.length ? list.map((f) => FEATURE_LABELS[f] ?? f).join(', ') : null;
  });

  protected readonly neverOpened = computed(() => {
    const list = this.row().featuresNeverUsed ?? [];
    return list.length ? list.map((f) => FEATURE_LABELS[f] ?? f).join(', ') : null;
  });

  protected day(iso?: string | null): string {
    return formatDate(iso);
  }
  protected ago(iso?: string | null): string {
    return timeAgo(iso);
  }

  protected whatsAppLink(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('20')) return `https://wa.me/${digits}`;
    return `https://wa.me/20${digits.replace(/^0+/, '')}`;
  }

  protected addNote(): void {
    const body = this.noteBody.value.trim();
    if (!body || this.busy()) return;

    this.busy.set(true);
    this.insights.createNote(this.row().teacherId, { body, isPinned: false }).subscribe({
      next: (n) => {
        this.notes.update((list) => [n, ...list]);
        this.noteBody.setValue('');
        this.busy.set(false);
        this.toast.success('Note added.');
      },
      error: () => this.busy.set(false),
    });
  }

  protected openReset(): void {
    this.newPassword.setValue('');
    this.resetting.set(true);
    // The field is revealed by a signal, so it does not exist yet when this handler
    // finishes. Waiting for it rather than reading once is why the button visibly
    // does something instead of appearing to do nothing.
    this.focusReset();
  }

  private focusReset(attempt = 0): void {
    const el = this.host.nativeElement.querySelector<HTMLInputElement>('.reset input');
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.focus({ preventScroll: true });
      return;
    }
    if (attempt < 10) requestAnimationFrame(() => this.focusReset(attempt + 1));
  }

  /** Resets the LOGIN password. Takes the User id — the admin endpoint targets the
   *  login account, which is why the grid row carries userId beside teacherId. */
  protected confirmReset(): void {
    const pw = this.newPassword.value.trim();
    const userId = this.row().userId;
    if (!userId || pw.length < 8) return;

    this.busy.set(true);
    this.auth.forceChangePassword({ userId, newPassword: pw, confirmPassword: pw }).subscribe({
      next: () => {
        this.busy.set(false);
        this.resetting.set(false);
        this.newPassword.setValue('');
        this.toast.success('Password reset. They are signed out everywhere.');
      },
      error: () => this.busy.set(false),
    });
  }

  protected async setActive(active: boolean): Promise<void> {
    if (!active) {
      const ok = await this.confirm.open({
        title: 'Deactivate this teacher?',
        message: 'They will not be able to sign in until reactivated.',
        confirmText: 'Deactivate',
        danger: true,
      });
      if (!ok) return;
    }

    this.busy.set(true);
    const call = active
      ? this.teachers.activateTeacher(this.row().teacherId)
      : this.teachers.deactivateTeacher(this.row().teacherId);

    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success(active ? 'Teacher activated.' : 'Teacher deactivated.');
      },
      error: () => this.busy.set(false),
    });
  }

  protected async remove(): Promise<void> {
    const ok = await this.confirm.open({
      title: 'Delete this teacher?',
      message: `${this.row().fullName} will be removed from the platform. Their data stays for audit.`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;

    this.busy.set(true);
    this.teachers.softDeleteTeacher(this.row().teacherId).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success('Teacher deleted.');
      },
      error: () => this.busy.set(false),
    });
  }
}
