import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CreateCenterRequest } from '../../../core/models/center.model';
import { CenterService } from '../../../core/services/center.service';
import { ToastService } from '../../../core/services/toast.service';

/** Group-level validator: password and confirmPassword must match (UX-only). */
function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  return password && confirmPassword && password !== confirmPassword
    ? { passwordMismatch: true }
    : null;
}

/**
 * Create-center screen. POST /api/admin/centers creates the center login +
 * Center row in one call and auto-assigns an 8-digit centerCode — mirrors
 * AssistantFormComponent's plain-JSON create/navigate/error convention
 * (no multipart, unlike the teacher sign-up form).
 */
@Component({
  selector: 'app-center-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: 'center-form.component.html',
  styleUrl: 'center-form.component.css',
})
export class CenterFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly centerService = inject(CenterService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);

  protected readonly form = this.fb.nonNullable.group(
    {
      name: ['', [Validators.required, Validators.maxLength(120)]],
      username: ['', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
      fullName: [''],
      phoneNumber: [''],
      email: ['', [Validators.email]],
      languagePreference: ['en' as 'en' | 'ar', [Validators.required]],
    },
    { validators: [passwordsMatchValidator] },
  );

  protected invalid(control: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }

  protected confirmInvalid(): boolean {
    const c = this.form.controls.confirmPassword;
    const touched = c.touched || c.dirty;
    return touched && (c.invalid || this.form.hasError('passwordMismatch'));
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);

    const raw = this.form.getRawValue();
    const request: CreateCenterRequest = {
      name: raw.name.trim(),
      username: raw.username.trim(),
      password: raw.password,
      fullName: raw.fullName.trim() || undefined,
      phoneNumber: raw.phoneNumber.trim() || undefined,
      email: raw.email.trim() || undefined,
      languagePreference: raw.languagePreference,
    };

    this.centerService.createCenter(request).subscribe({
      next: (res) => {
        this.toast.success(res.message ?? 'Center created.');
        void this.router.navigate(['/centers']);
      },
      // Interceptor surfaces the localized backend message; just release the button.
      error: () => this.submitting.set(false),
    });
  }
}
