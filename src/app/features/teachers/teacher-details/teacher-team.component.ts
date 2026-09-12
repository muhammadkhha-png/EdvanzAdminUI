import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AssistantService } from '../../../core/services/assistant.service';
import { AssistantAdminListItem } from '../../../core/models/assistant.model';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.service';
import { AdminConsoleService, ConsoleLogins } from '../../../core/services/admin-console.service';
import { timeAgo, formatDateTime } from '../../../shared/utils/time-format';

/**
 * TEAM — the people who work this account besides the teacher.
 *
 * Assistants are the usual answer to "the teacher says they did not do that": the
 * account's work is often somebody else's. Each row carries their own last sign-in
 * and last activity, and their sign-in history opens in place with device and address.
 */
@Component({
  selector: 'app-teacher-team',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <div class="sk"></div>
    } @else if (rows().length === 0) {
      <p class="empty">
        No assistants. This teacher works the account alone.
        <a routerLink="/assistants/new">Add an assistant</a>
      </p>
    } @else {
      <div class="t-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Assistant</th>
              <th scope="col">Username</th>
              <th scope="col">Phone</th>
              <th scope="col">Status</th>
              <th scope="col">Last login</th>
              <th scope="col">Last activity</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (a of rows(); track a.id) {
              <tr>
                <th scope="row">{{ a.fullName }}</th>
                <td class="small">{{ a.username }}</td>
                <td class="small tnum">
                  @if (a.phoneNumber) {
                    <a [href]="'tel:' + a.phoneNumber">{{ a.phoneNumber }}</a>
                  } @else {
                    <span class="muted">none</span>
                  }
                </td>
                <td>
                  @if (a.deletedAt) {
                    <span class="bad">removed</span>
                  } @else if (a.isActive) {
                    <span class="ok">working</span>
                  } @else {
                    <span class="bad">deactivated</span>
                  }
                </td>
                <td class="small">{{ a.lastLoginAt ? ago(a.lastLoginAt) : 'never' }}</td>
                <td class="small">{{ a.lastActivityAt ? ago(a.lastActivityAt) : 'never' }}</td>
                <td class="acts">
                  <button type="button" class="mini" (click)="toggleHistory(a.userId)">
                    {{ openHistory() === a.userId ? 'Hide' : 'History' }}
                  </button>
                  <button type="button" class="mini" (click)="openReset(a)">Reset</button>
                </td>
              </tr>

              @if (openHistory() === a.userId) {
                <tr>
                  <td colspan="7" class="drawer">
                    @if (eventsFor(a.userId); as events) {
                      @if (events.length === 0) {
                        <p class="muted">
                          No sign-in on record.
                          @if (recordedSince(); as since) {
                            Sign-ins have only been recorded since {{ stamp(since) }}.
                          }
                        </p>
                      } @else {
                        <ul class="events">
                          @for (e of events; track e.occurredAt) {
                            <li>
                              <span class="e-action">{{ e.action === 'logOut' ? 'Signed out' : 'Signed in' }}</span>
                              <span class="e-when">{{ stamp(e.occurredAt) }}</span>
                              <span class="e-dev">{{ e.deviceOrBrowser || 'unknown device' }}</span>
                              <span class="e-ip tnum">{{ e.ipAddress || '—' }}</span>
                            </li>
                          }
                        </ul>
                      }
                    } @else {
                      <div class="sk small-sk"></div>
                    }
                  </td>
                </tr>
              }

              @if (resetFor()?.id === a.id) {
                <tr>
                  <td colspan="7" class="reset-cell">
                    <label [attr.for]="'apw-' + a.id">New password for {{ a.fullName }}</label>
                    <p class="hint">Signs them out of every device. At least 8 characters.</p>
                    <div class="reset-row">
                      <input [id]="'apw-' + a.id" type="text" [formControl]="newPassword" autocomplete="off" />
                      <button
                        type="button"
                        class="mini primary"
                        [disabled]="busy() || newPassword.value.trim().length < 8"
                        (click)="confirmReset(a)"
                      >
                        Set password
                      </button>
                      <button type="button" class="mini" (click)="resetFor.set(null)">Cancel</button>
                    </div>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .t-scroll {
        overflow-x: auto;
        background: var(--surface);
        border-radius: var(--r-md);
      }
      table {
        width: 100%;
        min-width: 820px;
        border-collapse: collapse;
        font-size: var(--t-sm);
      }
      thead th {
        padding: var(--s-3);
        text-align: left;
        font-size: var(--t-xs);
        font-weight: 600;
        color: var(--ink-3);
        white-space: nowrap;
      }
      tbody th,
      tbody td {
        padding: var(--s-3);
        text-align: left;
        vertical-align: top;
      }
      tbody th {
        font-weight: 650;
        color: var(--ink);
      }
      .small {
        font-size: var(--t-xs);
        color: var(--ink-2);
      }
      .muted {
        color: var(--ink-3);
      }
      .ok {
        color: var(--live);
        font-weight: 600;
      }
      .bad {
        color: var(--gone);
        font-weight: 600;
      }
      a {
        color: var(--accent);
        text-decoration: none;
      }
      a:hover {
        text-decoration: underline;
      }

      .acts {
        display: flex;
        gap: var(--s-2);
      }
      .mini {
        min-height: 34px;
        padding: 0 var(--s-3);
        border: 0;
        border-radius: var(--r-sm);
        background: var(--quiet-soft);
        font: inherit;
        font-size: var(--t-xs);
        font-weight: 600;
        color: var(--ink-2);
        cursor: pointer;
      }
      .mini:hover:not(:disabled) {
        background: var(--rule);
        color: var(--ink);
      }
      .mini.primary {
        background: var(--accent);
        color: #fff;
      }
      .mini:disabled {
        opacity: 0.55;
        cursor: default;
      }

      .drawer,
      .reset-cell {
        background: var(--accent-soft);
      }
      .events {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: var(--s-2);
      }
      .events li {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-2) var(--s-4);
        font-size: var(--t-xs);
        color: var(--ink-2);
      }
      .e-action {
        font-weight: 650;
        color: var(--ink);
        min-width: 84px;
      }
      .e-dev,
      .e-ip {
        color: var(--ink-3);
      }

      .reset-cell label {
        display: block;
        font-weight: 600;
        font-size: var(--t-sm);
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
      .reset-row input {
        flex: 1 1 200px;
        min-height: 34px;
        padding: 0 var(--s-3);
        border: 1px solid var(--rule-strong);
        border-radius: var(--r-sm);
        font: inherit;
        font-size: var(--t-sm);
      }

      .empty {
        padding: var(--s-6) 0;
        text-align: center;
        color: var(--ink-3);
        font-size: var(--t-sm);
      }
      .sk {
        height: 200px;
        border-radius: var(--r-md);
        background: var(--quiet-soft);
      }
      .small-sk {
        height: 48px;
      }
    `,
  ],
})
export class TeacherTeamComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly assistants = inject(AssistantService);
  private readonly console = inject(AdminConsoleService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly rows = signal<AssistantAdminListItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly openHistory = signal<number | null>(null);
  protected readonly resetFor = signal<AssistantAdminListItem | null>(null);
  protected readonly newPassword = new FormControl('', { nonNullable: true });

  /** One call carries the whole account's sign-in history, so opening a second
   *  drawer costs nothing. */
  private readonly logins = signal<ConsoleLogins | null>(null);

  private readonly teacherId = Number(this.route.parent?.snapshot.paramMap.get('id') ?? 0);

  constructor() {
    this.assistants
      .getAllAssistants({ teacherId: this.teacherId, page: 1, pageSize: 100 })
      .subscribe({
        next: (res) => {
          this.rows.set(res.data);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  protected toggleHistory(userId: number): void {
    this.openHistory.set(this.openHistory() === userId ? null : userId);
    if (this.logins() === null) {
      this.console.getLogins(this.teacherId).subscribe({ next: (l) => this.logins.set(l) });
    }
  }

  protected eventsFor(userId: number) {
    const l = this.logins();
    if (!l) return null;
    return l.assistants.find((a) => a.userId === userId)?.events ?? [];
  }

  protected recordedSince(): string | null {
    return this.logins()?.recordedSince ?? null;
  }

  protected openReset(a: AssistantAdminListItem): void {
    this.newPassword.setValue('');
    this.resetFor.set(a);
  }

  /** Takes the assistant's USER id — the admin reset endpoint targets the login
   *  account, not the Assistant entity. */
  protected confirmReset(a: AssistantAdminListItem): void {
    const pw = this.newPassword.value.trim();
    if (pw.length < 8 || this.busy()) return;

    this.busy.set(true);
    this.auth.forceChangePassword({ userId: a.userId, newPassword: pw, confirmPassword: pw }).subscribe({
      next: () => {
        this.busy.set(false);
        this.resetFor.set(null);
        this.newPassword.setValue('');
        this.toast.success('Password reset. They are signed out everywhere.');
      },
      error: () => this.busy.set(false),
    });
  }

  protected ago(iso?: string | null): string {
    return timeAgo(iso);
  }
  protected stamp(iso?: string | null): string {
    return formatDateTime(iso);
  }
}
