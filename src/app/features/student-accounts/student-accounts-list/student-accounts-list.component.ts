import { Component, inject, OnInit, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../shared/components/searchable-select/searchable-select.component';
import { StudentAccountService } from '../../../core/services/student-account.service';
import { TeacherService } from '../../../core/services/teacher.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { PaginatedResponse } from '../../../core/models/paginated-response.model';
import { StudentAccountListItem } from '../../../core/models/student-account.model';
import { TeacherLookupItem } from '../../../core/models/teacher.model';

const DEFAULT_PAGE_SIZE = 10;

/**
 * Mirrors the backend `ForceChangePasswordDto` complexity rule: min 8 chars,
 * at least one lowercase, one uppercase, one digit, one special character.
 * Identical pattern to assistant-list/teacher-list — same backend endpoint.
 */
const PASSWORD_COMPLEXITY_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/;

/** Group-level validator: newPassword and confirmPassword must match. */
function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const newPassword = group.get('newPassword')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  return newPassword && confirmPassword && newPassword !== confirmPassword
    ? { passwordMismatch: true }
    : null;
}

/**
 * Platform-wide Student Accounts directory (Admin Portal, SuperAdmin only).
 * Distinct from the Students module (student-list.component.ts): this reads
 * StudentUserController — the mobile-app login identity — not the
 * per-teacher TeacherStudent roster. Search + teacher filter + pagination,
 * mirroring AssistantListComponent's mechanics throughout.
 *
 * Reset Password: the list only returns StudentUser.Id (studentAccountId),
 * but the shared force-change-password endpoint targets User.Id. We resolve
 * userId via GET studentuser/by-code/{accountCode} when the modal opens,
 * then submit exactly like Assistant/Teacher reset does.
 *
 * Link Teacher: there is no single endpoint that creates a link directly
 * from a raw (TeacherCode, StudentCode) pair — linking is request/approval
 * only (student requests, teacher accepts), and it only becomes bindable
 * once Active. So this resolves three existing calls in sequence:
 *   1. TeacherService.getTeachers({ search: teacherCode }) — the admin
 *      teacher list already supports searching by TeacherCode; take the
 *      exact match to get teacherId (GET teacher/list has no by-code
 *      lookup that returns an id — the public GET teacher/by-code/{code}
 *      deliberately omits it).
 *   2. StudentAccountService.getUnboundLinksForTeacher(teacherId) — find
 *      the Active-but-unbound connection whose studentAccountCode matches
 *      this row's accountCode, giving us its linkId. If none exists, this
 *      student hasn't connected to that teacher yet (nothing to bind).
 *   3. StudentAccountService.bindLinkByStudentCode(linkId, studentCode) —
 *      binds it to the roster record the teacher-assigned code resolves to.
 */
@Component({
  selector: 'app-student-accounts-list',
  standalone: true,
  imports: [ReactiveFormsModule, EmptyStateComponent, SearchableSelectComponent],
  templateUrl: 'student-accounts-list.component.html',
  styleUrl: 'student-accounts-list.component.css',
})
export class StudentAccountsListComponent implements OnInit {
  private readonly studentAccountService = inject(StudentAccountService);
  private readonly teacherService = inject(TeacherService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly searchControl = new FormControl<string>('', { nonNullable: true });
  protected readonly page = signal<PaginatedResponse<StudentAccountListItem[]> | null>(null);
  protected readonly teacherOptions = signal<SearchableSelectOption[]>([]);
  protected selectedTeacherId: number | null = null;

  private currentPage = 1;

  // ── Teachers column — compact by default, expandable per row ─────────────
  protected readonly expandedRows = signal<Set<number>>(new Set());

  // ── Force-change-password modal ───────────────────────────────────────────
  protected readonly passwordResetTarget = signal<StudentAccountListItem | null>(null);
  protected readonly passwordResetUserId = signal<number | null>(null);
  protected readonly passwordResetResolving = signal(false);
  protected readonly passwordSubmitting = signal(false);
  protected readonly passwordForm = this.fb.nonNullable.group(
    {
      newPassword: [
        '',
        [Validators.required, Validators.minLength(8), Validators.pattern(PASSWORD_COMPLEXITY_PATTERN)],
      ],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator },
  );

  // ── Link Teacher modal ─────────────────────────────────────────────────
  protected readonly linkTeacherTarget = signal<StudentAccountListItem | null>(null);
  protected readonly linkTeacherSubmitting = signal(false);
  protected readonly linkTeacherForm = this.fb.nonNullable.group({
    teacherCode: ['', [Validators.required]],
    studentCode: ['', [Validators.required]],
  });

  ngOnInit(): void {
    this.loadTeacherLookup();
    this.load();

    this.searchControl.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged())
      .subscribe(() => {
        this.currentPage = 1;
        this.load();
      });
  }

  protected onTeacherFilterChange(value: number | string | null): void {
    this.selectedTeacherId = value == null ? null : Number(value);
    this.currentPage = 1;
    this.load();
  }

  protected goToPage(page: number): void {
    this.currentPage = page;
    this.load();
  }

  protected get isFiltered(): boolean {
    return !!this.searchControl.value || this.selectedTeacherId != null;
  }

  // ── Teachers column ───────────────────────────────────────────────────────

  protected isExpanded(id: number): boolean {
    return this.expandedRows().has(id);
  }

  protected toggleExpanded(id: number): void {
    const next = new Set(this.expandedRows());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.expandedRows.set(next);
  }

  // ── Force-change-password ────────────────────────────────────────────────

  protected openPasswordReset(a: StudentAccountListItem): void {
    this.passwordForm.reset();
    this.passwordResetTarget.set(a);
    this.passwordResetUserId.set(null);
    this.passwordResetResolving.set(true);

    this.studentAccountService.getUserIdByAccountCode(a.accountCode).subscribe({
      next: (userId) => {
        this.passwordResetUserId.set(userId);
        this.passwordResetResolving.set(false);
      },
      error: () => {
        // errorInterceptor already surfaces a toast for the failed lookup.
        this.passwordResetResolving.set(false);
        this.passwordResetTarget.set(null);
      },
    });
  }

  protected closePasswordReset(): void {
    if (this.passwordSubmitting()) return;
    this.passwordResetTarget.set(null);
    this.passwordResetUserId.set(null);
  }

  protected isInvalid(control: 'newPassword' | 'confirmPassword'): boolean {
    const c = this.passwordForm.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }

  protected isConfirmInvalid(): boolean {
    const c = this.passwordForm.controls.confirmPassword;
    const touchedOrDirty = c.touched || c.dirty;
    return touchedOrDirty && (c.invalid || !!this.passwordForm.errors?.['passwordMismatch']);
  }

  protected submitPasswordReset(): void {
    const target = this.passwordResetTarget();
    const userId = this.passwordResetUserId();
    if (!target || userId == null) return;

    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const { newPassword, confirmPassword } = this.passwordForm.getRawValue();
    this.passwordSubmitting.set(true);

    this.authService.forceChangePassword({ userId, newPassword, confirmPassword }).subscribe({
      next: () => {
        this.passwordSubmitting.set(false);
        this.toast.success(
          `Password reset for ${target.fullName}. They've been signed out of all devices.`,
        );
        this.passwordResetTarget.set(null);
        this.passwordResetUserId.set(null);
      },
      error: () => {
        this.passwordSubmitting.set(false);
      },
    });
  }

  // ── Link Teacher ──────────────────────────────────────────────────────────

  protected openLinkTeacher(a: StudentAccountListItem): void {
    this.linkTeacherForm.reset();
    this.linkTeacherTarget.set(a);
  }

  protected closeLinkTeacher(): void {
    if (this.linkTeacherSubmitting()) return;
    this.linkTeacherTarget.set(null);
  }

  protected isLinkTeacherInvalid(control: 'teacherCode' | 'studentCode'): boolean {
    const c = this.linkTeacherForm.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }

  /**
   * Resolves teacherCode -> teacherId (via the admin teacher list search),
   * then studentAccountCode -> linkId (via that teacher's unbound links),
   * then binds the link with the entered studentCode. See class doc.
   */
  protected submitLinkTeacher(): void {
    const target = this.linkTeacherTarget();
    if (!target) return;

    if (this.linkTeacherForm.invalid) {
      this.linkTeacherForm.markAllAsTouched();
      return;
    }

    const { teacherCode, studentCode } = this.linkTeacherForm.getRawValue();
    const trimmedTeacherCode = teacherCode.trim();
    const trimmedStudentCode = studentCode.trim();

    this.linkTeacherSubmitting.set(true);

    this.teacherService.getTeachers({ page: 1, pageSize: 5, search: trimmedTeacherCode }).subscribe({
      next: (page) => {
        const teacher = page.data.find(
          (t) => t.teacherCode.toLowerCase() === trimmedTeacherCode.toLowerCase(),
        );
        if (!teacher) {
          this.toast.error(`No teacher found with code "${trimmedTeacherCode}".`);
          this.linkTeacherSubmitting.set(false);
          return;
        }

        this.studentAccountService.getUnboundLinksForTeacher(teacher.id).subscribe({
          next: (links) => {
            const link = links.find((l) => l.studentAccountCode === target.accountCode);
            if (!link) {
              this.toast.error(
                `${target.fullName} isn't connected to ${teacher.fullName} yet — the student ` +
                  `needs to send a link request from the app and have the teacher accept it first.`,
              );
              this.linkTeacherSubmitting.set(false);
              return;
            }

            this.studentAccountService.bindLinkByStudentCode(link.linkId, trimmedStudentCode).subscribe({
              next: () => {
                this.linkTeacherSubmitting.set(false);
                this.toast.success(`Linked ${target.fullName} to ${teacher.fullName}.`);
                this.linkTeacherTarget.set(null);
                this.load();
              },
              error: () => this.linkTeacherSubmitting.set(false),
            });
          },
          error: () => this.linkTeacherSubmitting.set(false),
        });
      },
      error: () => this.linkTeacherSubmitting.set(false),
    });
  }

  // ── Data loading ─────────────────────────────────────────────────────────

  private loadTeacherLookup(): void {
    this.teacherService.getTeacherLookup().subscribe((teachers: TeacherLookupItem[]) => {
      this.teacherOptions.set(teachers.map((t) => ({ value: t.id, label: t.fullName })));
    });
  }

  private load(): void {
    this.studentAccountService
      .getStudentAccounts({
        page: this.currentPage,
        pageSize: DEFAULT_PAGE_SIZE,
        search: this.searchControl.value,
        teacherId: this.selectedTeacherId,
      })
      .subscribe((result) => this.page.set(result));
  }
}
