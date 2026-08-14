import { Component, inject, OnInit, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { PaginatedResponse } from '../../../core/models/paginated-response.model';
import { TeacherListItem } from '../../../core/models/teacher.model';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { AuthService } from '../../../core/services/auth.service';
import { TeacherService } from '../../../core/services/teacher.service';
import { ToastService } from '../../../core/services/toast.service';
import { SubscriptionStatusBadgeComponent } from '../subscription-panel/subscription-status-badge.component';

const DEFAULT_PAGE_SIZE = 10;

/**
 * Mirrors the backend `ForceChangePasswordDto` complexity rule: min 8 chars,
 * at least one lowercase, one uppercase, one digit, one special character.
 * Keeping this in sync with the server regex avoids a round-trip just to
 * learn the password is too weak.
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

/** Teacher directory: search, paginate, navigate to details/edit, delete, force-reset password. */
@Component({
  selector: 'app-teacher-list',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    EmptyStateComponent,
    SubscriptionStatusBadgeComponent,
  ],
  templateUrl: 'teacher-list.component.html',
  styleUrl: 'teacher-list.component.css',
})
export class TeacherListComponent implements OnInit {
  private readonly teacherService = inject(TeacherService);
  private readonly authService = inject(AuthService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly searchControl = new FormControl<string>('', {
    nonNullable: true,
  });
  protected readonly page = signal<PaginatedResponse<TeacherListItem[]> | null>(null);
  private currentPage = 1;

  // ── Force-change-password modal (SuperAdmin only surface; this whole portal is SuperAdmin) ──
  protected readonly passwordResetTarget = signal<TeacherListItem | null>(null);
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

  ngOnInit(): void {
    this.load();
    this.searchControl.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged())
      .subscribe(() => {
        this.currentPage = 1;
        this.load();
      });
  }

  protected goToPage(page: number): void {
    this.currentPage = page;
    this.load();
  }

  protected async deactivate(t: TeacherListItem): Promise<void> {
    const ok = await this.confirm.open({
      title: 'Deactivate teacher',
      message: `Deactivate ${t.fullName}? They'll be signed out and unable to log in.`,
      confirmText: 'Deactivate',
      cancelText: 'Cancel',
    });
    if (!ok) return;
    this.teacherService.deactivateTeacher(t.id).subscribe(() => {
      this.toast.success('Teacher deactivated.');
      this.load();
    });
  }

  protected activate(t: TeacherListItem): void {
    this.teacherService.activateTeacher(t.id).subscribe(() => {
      this.toast.success('Teacher activated.');
      this.load();
    });
  }

  protected async softDelete(t: TeacherListItem): Promise<void> {
    const ok = await this.confirm.open({
      title: 'Delete teacher',
      message: `Soft-delete ${t.fullName}? They'll be removed from the list and signed out. Reversible via Activate.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (!ok) return;
    this.teacherService.softDeleteTeacher(t.id).subscribe(() => {
      this.toast.success('Teacher deleted.');
      this.load();
    });
  }

  // ── Force-change-password ────────────────────────────────────────────────

  /** Opens the reset-password modal for the given row. Uses `teacher.userId` — the
   *  owning User row's id — NOT `teacher.id` (the Teacher entity id). */
  protected openPasswordReset(t: TeacherListItem): void {
    this.passwordForm.reset();
    this.passwordResetTarget.set(t);
  }

  protected closePasswordReset(): void {
    if (this.passwordSubmitting()) return;
    this.passwordResetTarget.set(null);
  }

  protected isInvalid(control: 'newPassword' | 'confirmPassword'): boolean {
    const c = this.passwordForm.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }

  /** Confirm field is also invalid when the group-level mismatch error fires. */
  protected isConfirmInvalid(): boolean {
    const c = this.passwordForm.controls.confirmPassword;
    const touchedOrDirty = c.touched || c.dirty;
    return touchedOrDirty && (c.invalid || !!this.passwordForm.errors?.['passwordMismatch']);
  }

  protected submitPasswordReset(): void {
    const target = this.passwordResetTarget();
    if (!target) return;

    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const { newPassword, confirmPassword } = this.passwordForm.getRawValue();
    this.passwordSubmitting.set(true);

    this.authService
      .forceChangePassword({ userId: target.userId, newPassword, confirmPassword })
      .subscribe({
        next: () => {
          this.passwordSubmitting.set(false);
          this.toast.success(
            `Password reset for ${target.fullName}. They've been signed out of all devices.`,
          );
          this.passwordResetTarget.set(null);
        },
        error: () => {
          // HTTP error already toasted by the global errorInterceptor
          // (e.g. weak password, confirmation mismatch, user not found).
          // Keep the modal open so the admin can correct and retry.
          this.passwordSubmitting.set(false);
        },
      });
  }

  private load(): void {
    this.teacherService
      .getTeachers({
        page: this.currentPage,
        pageSize: DEFAULT_PAGE_SIZE,
        search: this.searchControl.value,
      })
      .subscribe((result) => {
        this.page.set(result)
        console.log(result);

      }
    );
  }
}
