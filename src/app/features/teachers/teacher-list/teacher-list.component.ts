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
import { TeacherListItem } from '../../../core/models/teacher.model';
import { planTypeLabel } from '../../../core/models/subscription.model';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { InfiniteScrollDirective } from '../../../shared/directives/infinite-scroll.directive';
import { InfiniteListStore } from '../../../shared/utils/infinite-list-store';
import { formatDateTime, timeAgo } from '../../../shared/utils/time-format';
import { AuthService } from '../../../core/services/auth.service';
import { TeacherService } from '../../../core/services/teacher.service';
import { ToastService } from '../../../core/services/toast.service';
import { SubscriptionStatusBadgeComponent } from '../subscription-panel/subscription-status-badge.component';

const DEFAULT_PAGE_SIZE = 10;

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
    InfiniteScrollDirective,
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

  /** Timestamp formatters exposed to the template (last-login column). */
  protected readonly timeAgo = timeAgo;

  /** Plan display label exposed to the template — never shows the raw wire value. */
  protected readonly planLabel = planTypeLabel;
  protected readonly formatDateTime = formatDateTime;

  /** Infinite-scroll list state: accumulates pages, appends on scroll. */
  protected readonly store = new InfiniteListStore<TeacherListItem>(
    DEFAULT_PAGE_SIZE,
    (page, pageSize) =>
      this.teacherService.getTeachers({
        page,
        pageSize,
        search: this.searchControl.value,
      }),
  );

  // ── Force-change-password modal (SuperAdmin only surface; this whole portal is SuperAdmin) ──
  protected readonly passwordResetTarget = signal<TeacherListItem | null>(null);
  protected readonly passwordSubmitting = signal(false);
  protected readonly passwordForm = this.fb.nonNullable.group(
    {
      // Only a minimum length is enforced — no uppercase/digit/special-character
      // requirement (the backend accepts any 8+ char password).
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator },
  );

  ngOnInit(): void {
    this.store.reset();
    this.searchControl.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged())
      .subscribe(() => this.store.reset());
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
      this.store.reset();
    });
  }

  protected activate(t: TeacherListItem): void {
    this.teacherService.activateTeacher(t.id).subscribe(() => {
      this.toast.success('Teacher activated.');
      this.store.reset();
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
      this.store.reset();
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
}
