import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  EMPTY,
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  switchMap,
} from 'rxjs';
import { StudentService } from '../../../core/services/student.service';
import { StudentAccountService } from '../../../core/services/student-account.service';
import { StudentAdminListItem } from '../../../core/models/student.model';
import {
  StudentAccountListItem,
  StudentAccountTeacherLink,
} from '../../../core/models/student-account.model';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { formatDate, timeAgo } from '../../../shared/utils/time-format';

const PAGE = 25;

/**
 * STUDENTS — the teacher's own roster, as their account holds it.
 *
 * The question this answers on a call is "which of my students is wrong?", so the
 * row leads with the two things that break: whether the student is in a class at all
 * (if not, that student opens an empty app), and whether their phone app is linked.
 */
@Component({
  selector: 'app-teacher-roster',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar">
      <input
        type="search"
        [formControl]="search"
        placeholder="Search this teacher's students by name, code or phone"
        aria-label="Search students"
      />
      <span class="count">{{ total() }} students</span>
    </div>

    @if (loading() && rows().length === 0) {
      <div class="sk"></div>
    } @else if (rows().length === 0) {
      <p class="empty">
        @if (search.value) {
          No student here matches "{{ search.value }}".
        } @else {
          This teacher has not uploaded any students.
        }
      </p>
    } @else {
      <div class="t-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th scope="col">Code</th>
              <th scope="col">Class</th>
              <th scope="col">Phones</th>
              <th scope="col">App account</th>
              <th scope="col">Added</th>
            </tr>
          </thead>
          <tbody>
            @for (s of rows(); track s.id) {
              <tr>
                <th scope="row">
                  <a [routerLink]="['/students', s.id]">{{ s.studentName }}</a>
                </th>
                <td class="tnum">{{ s.studentCode }}</td>
                <td>
                  @if (s.sessionName) {
                    {{ s.sessionName }}
                  } @else {
                    <span class="bad">Not in a class — sees an empty app</span>
                  }
                </td>
                <td class="tnum txt-s">
                  @if (s.studentPhoneNumber) {
                    <a [href]="'tel:' + s.studentPhoneNumber">{{ s.studentPhoneNumber }}</a>
                  }
                  @if (s.parentPhoneNumber) {
                    <span class="parent">parent {{ s.parentPhoneNumber }}</span>
                  }
                  @if (!s.studentPhoneNumber && !s.parentPhoneNumber) {
                    <span class="muted">none</span>
                  }
                </td>
                <td>
                  @if (s.linkId) {
                    <span class="ok">linked</span>
                  } @else {
                    <span class="muted">not linked</span>
                  }
                </td>
                <td class="txt-s">{{ day(s.createdAt) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      @if (rows().length < total()) {
        <button type="button" class="more" [disabled]="loading()" (click)="loadMore()">
          {{ loading() ? 'Loading…' : 'Show more' }}
        </button>
      }
    }
  `,
  styles: [SHARED_TAB_STYLES()],
})
export class TeacherRosterComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly students = inject(StudentService);

  protected readonly rows = signal<StudentAdminListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly search = new FormControl('', { nonNullable: true });

  private page = 1;
  private readonly teacherId = Number(this.route.parent?.snapshot.paramMap.get('id') ?? 0);
  private readonly requests = new Subject<number>();

  constructor() {
    // switchMap drops a response the moment a newer request starts, so two searches in
    // flight can never both land in the list (that showed every student twice).
    this.requests
      .pipe(
        switchMap((page) => {
          this.loading.set(true);
          return this.students
            .getAllStudents({
              teacherId: this.teacherId,
              page,
              pageSize: PAGE,
              search: this.search.value.trim() || undefined,
            })
            .pipe(
              map((res) => ({ page, res })),
              catchError(() => {
                this.loading.set(false);
                return EMPTY;
              }),
            );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ page, res }) => {
        this.rows.update((c) => mergePage(c, res.data, page, (s) => s.id));
        this.total.set(res.totalCount);
        this.loading.set(false);
      });

    this.requests.next(this.page);
    this.search.valueChanges
      .pipe(
        map((v) => v.trim()),
        debounceTime(350),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.page = 1;
        this.rows.set([]);
        this.requests.next(this.page);
      });
  }

  protected loadMore(): void {
    if (this.loading()) return;
    this.page += 1;
    this.requests.next(this.page);
  }

  protected day(iso?: string | null): string {
    return formatDate(iso);
  }
}

/**
 * STUDENT ACCOUNTS — the students' own logins against this teacher.
 *
 * Separate from the roster on purpose: a roster row is a record the teacher created,
 * an account is the student's own login on the platform, and conflating them is how
 * "the student cannot see anything" turns into an hour of confusion. An account that
 * is connected but not bound to a roster record sees NOTHING, so that state is called
 * out rather than shown as a tick.
 */
@Component({
  selector: 'app-teacher-student-accounts',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar">
      <input
        type="search"
        [formControl]="search"
        placeholder="Search accounts by name, username or code"
        aria-label="Search student accounts"
      />
      <span class="count">{{ total() }} accounts</span>
    </div>

    @if (loading() && rows().length === 0) {
      <div class="sk"></div>
    } @else if (rows().length === 0) {
      <p class="empty">No student has linked their app account to this teacher.</p>
    } @else {
      <div class="t-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th scope="col">Username</th>
              <th scope="col">Account code</th>
              <th scope="col">Linked to</th>
              <th scope="col">Last login</th>
              <th scope="col">Password</th>
            </tr>
          </thead>
          <tbody>
            @for (a of rows(); track a.studentAccountId) {
              <tr>
                <th scope="row">{{ a.fullName }}</th>
                <td class="tnum txt-s">{{ a.userName }}</td>
                <td class="tnum txt-s">{{ a.accountCode }}</td>
                <td>
                  @if (linkFor(a); as link) {
                    @if (link.studentCode) {
                      <span class="ok">{{ link.studentCode }}</span>
                    } @else {
                      <span class="bad">Connected but not linked — this student sees nothing</span>
                    }
                  } @else {
                    <span class="muted">—</span>
                  }
                </td>
                <td class="txt-s">{{ a.lastLoginAt ? ago(a.lastLoginAt) : 'never' }}</td>
                <td>
                  <button type="button" class="mini" (click)="openReset(a)">Reset</button>
                </td>
              </tr>
            }
            @if (resetFor(); as target) {
              <tr>
                <td colspan="6" class="reset-cell">
                  <label [attr.for]="'spw-' + target.studentAccountId">
                    New password for {{ target.fullName }}
                  </label>
                  <p class="hint">Signs them out of every device. At least 8 characters.</p>
                  <div class="reset-row">
                    <input
                      [id]="'spw-' + target.studentAccountId"
                      type="text"
                      [formControl]="newPassword"
                      autocomplete="off"
                    />
                    <button
                      type="button"
                      class="mini primary"
                      [disabled]="busy() || newPassword.value.trim().length < 8"
                      (click)="confirmReset(target)"
                    >
                      Set password
                    </button>
                    <button type="button" class="mini" (click)="resetFor.set(null)">Cancel</button>
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      @if (rows().length < total()) {
        <button type="button" class="more" [disabled]="loading()" (click)="loadMore()">
          {{ loading() ? 'Loading…' : 'Show more' }}
        </button>
      }
    }
  `,
  styles: [SHARED_TAB_STYLES()],
})
export class TeacherStudentAccountsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly accounts = inject(StudentAccountService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly rows = signal<StudentAccountListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly resetFor = signal<StudentAccountListItem | null>(null);

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly newPassword = new FormControl('', { nonNullable: true });

  private page = 1;
  private readonly teacherId = Number(this.route.parent?.snapshot.paramMap.get('id') ?? 0);
  private readonly requests = new Subject<number>();

  constructor() {
    // Same rule as the Students tab: only the newest request may write to the list.
    this.requests
      .pipe(
        switchMap((page) => {
          this.loading.set(true);
          return this.accounts
            .getStudentAccounts({
              teacherId: this.teacherId,
              page,
              pageSize: PAGE,
              search: this.search.value.trim() || undefined,
            })
            .pipe(
              map((res) => ({ page, res })),
              catchError(() => {
                this.loading.set(false);
                return EMPTY;
              }),
            );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ page, res }) => {
        this.rows.update((c) => mergePage(c, res.data, page, (a) => a.studentAccountId));
        this.total.set(res.totalCount);
        this.loading.set(false);
      });

    this.requests.next(this.page);
    this.search.valueChanges
      .pipe(
        map((v) => v.trim()),
        debounceTime(350),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.page = 1;
        this.rows.set([]);
        this.requests.next(this.page);
      });
  }

  protected loadMore(): void {
    if (this.loading()) return;
    this.page += 1;
    this.requests.next(this.page);
  }

  /** The link that belongs to THIS teacher — an account may be linked to several. */
  protected linkFor(a: StudentAccountListItem): StudentAccountTeacherLink | null {
    return a.teachers?.find((l: StudentAccountTeacherLink) => l.teacherId === this.teacherId) ?? null;
  }

  protected openReset(a: StudentAccountListItem): void {
    this.newPassword.setValue('');
    this.resetFor.set(a);
  }

  protected confirmReset(a: StudentAccountListItem): void {
    const pw = this.newPassword.value.trim();
    if (pw.length < 8 || this.busy()) return;

    // The reset endpoint takes the USER id, and this row carries the StudentUser id —
    // a different number. Resolve it by account code rather than passing the wrong one.
    this.busy.set(true);
    this.accounts.getUserIdByAccountCode(a.accountCode).subscribe({
      next: (userId) => {
        this.auth.forceChangePassword({ userId, newPassword: pw, confirmPassword: pw }).subscribe({
          next: () => {
            this.busy.set(false);
            this.resetFor.set(null);
            this.newPassword.setValue('');
            this.toast.success('Password reset. They are signed out everywhere.');
          },
          error: () => this.busy.set(false),
        });
      },
      error: () => this.busy.set(false),
    });
  }

  protected ago(iso?: string | null): string {
    return timeAgo(iso);
  }
}

/**
 * Page 1 replaces the list; a later page appends only rows not already shown, so a
 * row that shifted between pages (a student added mid-scroll) is never listed twice.
 */
function mergePage<T>(current: T[], incoming: T[], page: number, key: (row: T) => unknown): T[] {
  if (page === 1) return incoming;
  const seen = new Set(current.map(key));
  return [...current, ...incoming.filter((r) => !seen.has(key(r)))];
}

/** Styles every one of these tabs shares. Written once rather than pasted into each. */
function SHARED_TAB_STYLES(): string {
  return `
    :host { display: block; }

    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--s-3);
      margin-bottom: var(--s-3);
    }
    .bar input[type='search'] {
      flex: 1 1 280px;
      min-height: 40px;
      padding: 0 var(--s-3);
      border: 1px solid var(--rule-strong);
      border-radius: var(--r-sm);
      background: var(--surface);
      font: inherit;
      font-size: var(--t-sm);
    }
    .bar input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    .count { font-size: var(--t-xs); color: var(--ink-3); }

    .t-scroll { overflow-x: auto; background: var(--surface); border-radius: var(--r-md); }
    table { width: 100%; min-width: 760px; border-collapse: collapse; font-size: var(--t-sm); }
    thead th {
      padding: var(--s-3);
      text-align: left;
      font-size: var(--t-xs);
      font-weight: 600;
      color: var(--ink-3);
      white-space: nowrap;
    }
    tbody th, tbody td { padding: var(--s-3); text-align: left; vertical-align: top; }
    tbody th { font-weight: 650; color: var(--ink); }
    tbody tr:nth-child(odd) { background: var(--surface-2); }
    tbody a { color: var(--accent); text-decoration: none; }
    tbody a:hover { text-decoration: underline; }

    .txt-s { font-size: var(--t-xs); color: var(--ink-2); }
    .muted { color: var(--ink-3); }
    .ok { color: var(--live); font-weight: 600; }
    .bad { color: var(--gone); font-weight: 600; }
    .parent { display: block; color: var(--ink-3); }

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
    .mini:hover:not(:disabled) { background: var(--rule); color: var(--ink); }
    .mini.primary { background: var(--accent); color: #fff; }
    .mini:disabled { opacity: 0.55; cursor: default; }

    .reset-cell { background: var(--accent-soft); }
    .reset-cell label { display: block; font-weight: 600; font-size: var(--t-sm); }
    .hint { margin: 2px 0 var(--s-2); font-size: var(--t-xs); color: var(--ink-3); }
    .reset-row { display: flex; flex-wrap: wrap; gap: var(--s-2); }
    .reset-row input {
      flex: 1 1 200px;
      min-height: 34px;
      padding: 0 var(--s-3);
      border: 1px solid var(--rule-strong);
      border-radius: var(--r-sm);
      font: inherit;
      font-size: var(--t-sm);
    }

    .more {
      margin-top: var(--s-3);
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
    .empty { padding: var(--s-6) 0; text-align: center; color: var(--ink-3); font-size: var(--t-sm); }
    .sk { height: 220px; border-radius: var(--r-md); background: var(--quiet-soft); }
  `;
}
