import { Component, inject, OnInit, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import {
  AppVersionConfig,
  AppVersionPlatformConfig,
  AppVersionService,
} from '../../core/services/app-version.service';
import { ToastService } from '../../core/services/toast.service';

/** The two platforms the update gate configures, in display order. */
type PlatformKey = 'android' | 'ios';

/** Rejects a whole-number requirement failure (decimals / NaN). Empty values
 *  are left to Validators.required so we don't double-flag a blank field. */
function integerValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  if (value === null || value === undefined || value === '') return null;
  return Number.isInteger(value) ? null : { integer: true };
}

/** Treats a whitespace-only string as empty (reuses the `required` error key so
 *  the template shows one message for both blank and spaces-only input). */
function noWhitespace(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  if (typeof value !== 'string') return null;
  return value.trim().length === 0 ? { required: true } : null;
}

/** Group-level rule: the latest build can never be older than the minimum
 *  supported build (mirrors the backend's `latestBuild >= minSupportedBuild`). */
function latestNotBelowMin(group: AbstractControl): ValidationErrors | null {
  const min = group.get('minSupportedBuild')?.value;
  const latest = group.get('latestBuild')?.value;
  if (typeof min !== 'number' || typeof latest !== 'number') return null;
  return latest < min ? { latestBelowMin: true } : null;
}

/**
 * SuperAdmin "App Version / Update Gate" screen. Views and edits the mobile
 * app's forced/optional-update thresholds per platform (Android + iOS) via
 * GET/PUT /api/admin/app-version.
 *
 * The build validation mirrors the backend exactly (non-negative integers,
 * latestBuild >= minSupportedBuild, non-empty version + store URL) so the admin
 * gets immediate feedback before submitting. Save stays disabled until the form
 * is both valid and dirty. HTTP errors are toasted by the global errorInterceptor;
 * this component only toasts on success.
 */
@Component({
  selector: 'app-app-version',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: 'app-version.component.html',
  styleUrl: 'app-version.component.css',
})
export class AppVersionComponent implements OnInit {
  private readonly appVersionService = inject(AppVersionService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);

  /** Drives the two form sections and their headings. */
  protected readonly platforms: readonly { key: PlatformKey; label: string; icon: string }[] = [
    { key: 'android', label: 'Android', icon: '🤖' },
    { key: 'ios', label: 'iOS', icon: '🍎' },
  ];

  protected readonly form = this.fb.group({
    android: this.platformGroup(),
    ios: this.platformGroup(),
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.appVersionService.getConfig().subscribe({
      next: (config) => {
        this.form.reset(config);
        this.form.markAsPristine();
        this.form.markAsUntouched();
        this.loading.set(false);
      },
      error: () => {
        // Message already toasted by the global errorInterceptor; show the
        // inline retry state so the admin isn't stuck on a blank screen.
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const raw = this.form.getRawValue();
    const body: AppVersionConfig = {
      android: this.toPlatformConfig(raw.android),
      ios: this.toPlatformConfig(raw.ios),
    };

    this.appVersionService.updateConfig(body).subscribe({
      next: (updated) => {
        // Reflect the server's authoritative values and reset the dirty state.
        this.form.reset(updated);
        this.form.markAsPristine();
        this.saving.set(false);
        this.toast.success('App version settings saved.');
      },
      error: () => this.saving.set(false),
    });
  }

  /** True when a field should render its invalid state (invalid + interacted). */
  protected invalid(platform: PlatformKey, field: string): boolean {
    const control = this.form.get([platform, field]);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  /** True when the platform's latestBuild < minSupportedBuild and the field was
   *  interacted with — surfaces the group-level cross-field error inline. */
  protected latestBelowMin(platform: PlatformKey): boolean {
    const group = this.form.get(platform);
    const latest = group?.get('latestBuild');
    return (
      !!group &&
      group.hasError('latestBelowMin') &&
      !!latest &&
      (latest.touched || latest.dirty)
    );
  }

  private platformGroup() {
    return this.fb.group(
      {
        minSupportedBuild: this.fb.control<number | null>(null, [
          Validators.required,
          Validators.min(0),
          integerValidator,
        ]),
        latestBuild: this.fb.control<number | null>(null, [
          Validators.required,
          Validators.min(0),
          integerValidator,
        ]),
        latestVersion: this.fb.nonNullable.control('', [Validators.required, noWhitespace]),
        storeUrl: this.fb.nonNullable.control('', [Validators.required, noWhitespace]),
      },
      { validators: [latestNotBelowMin] },
    );
  }

  private toPlatformConfig(raw: {
    minSupportedBuild: number | null;
    latestBuild: number | null;
    latestVersion: string;
    storeUrl: string;
  }): AppVersionPlatformConfig {
    // The form is valid at this point, so the build fields are real numbers.
    return {
      minSupportedBuild: raw.minSupportedBuild!,
      latestBuild: raw.latestBuild!,
      latestVersion: raw.latestVersion.trim(),
      storeUrl: raw.storeUrl.trim(),
    };
  }
}
