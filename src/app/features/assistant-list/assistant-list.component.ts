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
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { SearchableSelectComponent, SearchableSelectOption } from '../../shared/components/searchable-select/searchable-select.component';
import { InfiniteScrollDirective } from '../../shared/directives/infinite-scroll.directive';
import { InfiniteListStore } from '../../shared/utils/infinite-list-store';
import { AssistantService } from '../../core/services/assistant.service';
import { TeacherService } from '../../core/services/teacher.service';
import { AuthService } from '../../core/services/auth.service';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../core/services/toast.service';
import { AssistantAdminListItem } from '../../core/models/assistant.model';
import { TeacherLookupItem } from '../../core/models/teacher.model';


const DEFAULT_PAGE_SIZE = 10;

/** Group-level validator: newPassword and confirmPassword must match. */
function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const newPassword = group.get('newPassword')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  return newPassword && confirmPassword && newPassword !== confirmPassword
    ? { passwordMismatch: true }
    : null;
}

/**
 * Platform-wide assistant directory (Admin Portal, SuperAdmin only).
 * Search + teacher filter + edit navigation + activate/deactivate toggle +
 * force-reset password (identical mechanics to TeacherListComponent throughout).
 */
@Component({
  selector: 'app-assistant-list',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    EmptyStateComponent,
    SearchableSelectComponent,
    InfiniteScrollDirective,
  ],
  templateUrl: 'assistant-list.component.html',
  styleUrl: 'assistant-list.component.css',
})
export class AssistantListComponent implements OnInit {
  private readonly assistantService = inject(AssistantService);
  private readonly teacherService = inject(TeacherService);
  private readonly authService = inject(AuthService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly searchControl = new FormControl<string>('', { nonNullable: true });
  protected readonly teacherOptions = signal<SearchableSelectOption[]>([]);
  protected selectedTeacherId: number | null = null;

  /** Infinite-scroll list state: accumulates pages, appends on scroll. */
  protected readonly store = new InfiniteListStore<AssistantAdminListItem>(
    DEFAULT_PAGE_SIZE,
    (page, pageSize) =>
      this.assistantService.getAllAssistants({
        page,
        pageSize,
        search: this.searchControl.value,
        teacherId: this.selectedTeacherId,
      }),
  );

  // ── Activate/Deactivate — per-row in-flight guard prevents duplicate requests ──
  protected readonly togglingIds = signal<Set<number>>(new Set());

  // ── Force-change-password modal — identical mechanics to TeacherListComponent ──
  protected readonly passwordResetTarget = signal<AssistantAdminListItem | null>(null);
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
    this.loadTeacherLookup();
    this.store.reset();

    this.searchControl.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged())
      .subscribe(() => this.store.reset());
  }

  protected onTeacherFilterChange(value: number | string | null): void {
    this.selectedTeacherId = value == null ? null : Number(value);
    this.store.reset();
  }

  // ── Activate/Deactivate ──────────────────────────────────────────────────

  protected isToggling(id: number): boolean {
    return this.togglingIds().has(id);
  }

  private setToggling(id: number, value: boolean): void {
    const next = new Set(this.togglingIds());
    if (value) next.add(id);
    else next.delete(id);
    this.togglingIds.set(next);
  }

  protected async deactivate(a: AssistantAdminListItem): Promise<void> {
    const ok = await this.confirm.open({
      title: 'Deactivate assistant',
      message: `Deactivate ${a.fullName}? They'll be signed out and unable to log in.`,
      confirmText: 'Deactivate',
      cancelText: 'Cancel',
    });
    if (!ok || this.isToggling(a.id)) return;

    this.setToggling(a.id, true);
    this.assistantService.deactivateAssistant(a.id).subscribe({
      next: () => {
        this.toast.success('Assistant deactivated.');
        this.setToggling(a.id, false);
        this.store.reset();
      },
      error: () => this.setToggling(a.id, false),
    });
  }

  protected activate(a: AssistantAdminListItem): void {
    if (this.isToggling(a.id)) return;

    this.setToggling(a.id, true);
    this.assistantService.activateAssistant(a.id).subscribe({
      next: () => {
        this.toast.success('Assistant activated.');
        this.setToggling(a.id, false);
        this.store.reset();
      },
      error: () => this.setToggling(a.id, false),
    });
  }

  // ── Force-change-password ────────────────────────────────────────────────

  protected openPasswordReset(a: AssistantAdminListItem): void {
    this.passwordForm.reset();
    this.passwordResetTarget.set(a);
  }

  protected closePasswordReset(): void {
    if (this.passwordSubmitting()) return;
    this.passwordResetTarget.set(null);
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
          this.passwordSubmitting.set(false);
        },
      });
  }

  // ── Data loading ─────────────────────────────────────────────────────────

  private loadTeacherLookup(): void {
    this.teacherService.getTeacherLookup().subscribe((teachers: TeacherLookupItem[]) => {
      this.teacherOptions.set(teachers.map((t) => ({ value: t.id, label: t.fullName })));
    });
  }

}
