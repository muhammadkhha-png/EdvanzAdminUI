import { Component, computed, inject, OnInit, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CenterListItem } from '../../../core/models/center.model';
import { CenterService } from '../../../core/services/center.service';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ToastService } from '../../../core/services/toast.service';
import { formatDateTime, timeAgo } from '../../../shared/utils/time-format';

/** Group-level validator: newPassword and confirmPassword must match. */
function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const newPassword = group.get('newPassword')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  return newPassword && confirmPassword && newPassword !== confirmPassword
    ? { passwordMismatch: true }
    : null;
}

/**
 * Center directory. GET /api/admin/centers has NO pagination (bare array), so
 * this loads the full list once and filters client-side — unlike
 * TeacherListComponent's server-paginated InfiniteListStore.
 */
@Component({
  selector: 'app-center-list',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, EmptyStateComponent],
  templateUrl: 'center-list.component.html',
  styleUrl: 'center-list.component.css',
})
export class CenterListComponent implements OnInit {
  private readonly centerService = inject(CenterService);
  private readonly authService = inject(AuthService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  /** Timestamp formatters exposed to the template (last-login / last-activity columns). */
  protected readonly timeAgo = timeAgo;
  protected readonly formatDateTime = formatDateTime;

  protected readonly searchControl = new FormControl<string>('', { nonNullable: true });
  private readonly searchTerm = signal('');

  protected readonly centers = signal<CenterListItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);

  /** Center ids with an activate/deactivate call in flight — guards double-click. */
  protected readonly busyIds = signal<ReadonlySet<number>>(new Set());

  // ── Force-change-password modal (same mechanics as the teacher/assistant lists) ──
  // The complexity rule is DELIBERATELY relaxed here: only a minimum length of 8 is
  // enforced (no uppercase/digit/special-character requirement). The backend
  // (admin/force-change-password) accepts any 8+ char password.
  protected readonly passwordResetTarget = signal<CenterListItem | null>(null);
  protected readonly passwordSubmitting = signal(false);
  protected readonly passwordForm = this.fb.nonNullable.group(
    {
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator },
  );

  protected readonly filteredCenters = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const all = this.centers();
    if (!term) return all;
    return all.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.centerCode.toLowerCase().includes(term) ||
        (c.username?.toLowerCase().includes(term) ?? false),
    );
  });

  protected readonly isEmpty = computed(() => this.loaded() && this.filteredCenters().length === 0);

  ngOnInit(): void {
    this.load();
    this.searchControl.valueChanges.subscribe((v) => this.searchTerm.set(v));
  }

  private load(): void {
    this.loading.set(true);
    this.centerService.getCenters().subscribe({
      next: (list) => {
        this.centers.set(list);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: () => {
        // HTTP error already toasted by the global errorInterceptor.
        this.loading.set(false);
        this.loaded.set(true);
      },
    });
  }

  protected isBusy(centerId: number): boolean {
    return this.busyIds().has(centerId);
  }

  private setBusy(centerId: number, busy: boolean): void {
    this.busyIds.update((set) => {
      const next = new Set(set);
      if (busy) next.add(centerId);
      else next.delete(centerId);
      return next;
    });
  }

  protected async deactivate(c: CenterListItem): Promise<void> {
    if (this.isBusy(c.centerId)) return;
    const ok = await this.confirm.open({
      title: 'Deactivate center',
      message: `Deactivate ${c.name}? Its login will be blocked until reactivated.`,
      confirmText: 'Deactivate',
      cancelText: 'Cancel',
    });
    if (!ok) return;

    this.setBusy(c.centerId, true);
    this.centerService.deactivateCenter(c.centerId).subscribe({
      next: () => {
        this.toast.success('Center deactivated.');
        this.setBusy(c.centerId, false);
        this.load();
      },
      error: () => this.setBusy(c.centerId, false),
    });
  }

  protected activate(c: CenterListItem): void {
    if (this.isBusy(c.centerId)) return;
    this.setBusy(c.centerId, true);
    this.centerService.activateCenter(c.centerId).subscribe({
      next: () => {
        this.toast.success('Center activated.');
        this.setBusy(c.centerId, false);
        this.load();
      },
      error: () => this.setBusy(c.centerId, false),
    });
  }

  // ── Force-change-password ────────────────────────────────────────────────
  // Resets the CENTER's own login password (User row = center.userId), with no
  // old-password check. The center is signed out of every device on success.

  protected openPasswordReset(c: CenterListItem): void {
    this.passwordForm.reset();
    this.passwordResetTarget.set(c);
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
            `Password reset for ${target.name}. The center has been signed out of all devices.`,
          );
          this.passwordResetTarget.set(null);
        },
        error: () => {
          // HTTP error already toasted by the global errorInterceptor.
          // Keep the modal open so the admin can correct and retry.
          this.passwordSubmitting.set(false);
        },
      });
  }
}
