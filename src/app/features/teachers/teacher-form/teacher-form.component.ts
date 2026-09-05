import { Component, OnInit, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TeacherService } from '../../../core/services/teacher.service';
import { ToastService } from '../../../core/services/toast.service';
import {
  CreateTeacherSignUpRequest,
  SubjectDto,
} from '../../../core/models/teacher.model';

type UiLang = 'en' | 'ar';

/**
 * Bilingual UI strings for the create-teacher screen. This component owns its own
 * tiny dictionary (no app-wide i18n dependency introduced) so labels and validation
 * messages render in Arabic and English per the interface-language toggle. The same
 * toggle drives Accept-Language on the API calls, so backend messages match.
 */
const MSG: Record<UiLang, Record<string, string>> = {
  en: {
    titleNew: 'New teacher',
    titleEdit: 'Teacher details',
    back: 'Back to list',
    editNote:
      'Edit functionality requires a PUT /api/teacher/{id}/profile endpoint. Use the Subscription and Modules tabs to manage access.',
    fullName: 'Full name',
    username: 'Username',
    email: 'Email',
    phone: 'Phone',
    password: 'Password',
    confirmPassword: 'Confirm password',
    subject: 'Subject',
    subjectPlaceholder: 'Select a subject',
    customSubject: 'Custom subject (optional)',
    language: 'Teacher app language',
    capacity: 'Students in account',
    capacityHint: 'Every student this teacher adds and manages. The subscription is NOT priced on this number.',
    linkedCapacity: 'Student app accounts',
    linkedCapacityHint: 'How many of those students may sign in to the app and see their own data. The subscription price is calculated on THIS number, so it can never be more than the students in the account. Leave it empty to match the students in the account.',
    idImage: 'ID image (optional)',
    cancel: 'Cancel',
    create: 'Create teacher',
    creating: 'Creating…',
    createdOk: 'Teacher created.',
    subjectsUnavailable: 'Could not load subjects. Enter a custom subject instead.',
    reqFullName: 'Full name is required.',
    reqUsername: 'Username is required.',
    invalidEmail: 'Enter a valid email address.',
    reqPhone: 'Phone is required.',
    invalidPhone: 'Enter a valid Egyptian mobile (e.g. 01012345678).',
    reqPassword: 'Password is required.',
    weakPassword:
      'Min 8 chars with an uppercase, a lowercase, a number, and a special character.',
    reqConfirm: 'Please confirm the password.',
    mismatch: 'Passwords do not match.',
    reqSubject: 'Select a subject or enter a custom subject.',
    reqCapacity: 'Enter a valid capacity.',
    reqLinkedCapacity: 'Enter 0 or a higher whole number, or leave it empty to match the students in the account.',
    linkedAboveCapacity:
      'Student app accounts can\'t be more than the students in the account — a student has to exist in the account before they can get an app account. Lower this number, or raise "Students in account".',
  },
  ar: {
    titleNew: 'مدرّس جديد',
    titleEdit: 'بيانات المدرّس',
    back: 'رجوع للقائمة',
    editNote:
      'التعديل يحتاج endpoint من نوع PUT /api/teacher/{id}/profile. استخدم تبويبات الاشتراك والوحدات لإدارة الصلاحيات.',
    fullName: 'الاسم بالكامل',
    username: 'اسم المستخدم',
    email: 'البريد الإلكتروني',
    phone: 'رقم الموبايل',
    password: 'كلمة المرور',
    confirmPassword: 'تأكيد كلمة المرور',
    subject: 'المادة',
    subjectPlaceholder: 'اختر المادة',
    customSubject: 'مادة مخصّصة (اختياري)',
    language: 'لغة تطبيق المدرّس',
    capacity: 'الطلاب في الحساب',
    capacityHint: 'كل الطلاب اللي المدرّس ده هيضيفهم ويتابعهم. سعر الاشتراك مش بيتحسب على الرقم ده.',
    linkedCapacity: 'حسابات الطلاب على التطبيق',
    linkedCapacityHint: 'كام واحد من الطلاب دول يقدر يدخل على التطبيق ويشوف بياناته. سعر الاشتراك بيتحسب على الرقم ده، وعشان كده ماينفعش يكون أكتر من الطلاب في الحساب. سيبه فاضي عشان يبقى زي عدد الطلاب في الحساب.',
    idImage: 'صورة البطاقة (اختياري)',
    cancel: 'إلغاء',
    create: 'إنشاء المدرّس',
    creating: 'جارٍ الإنشاء…',
    createdOk: 'تم إنشاء المدرّس.',
    subjectsUnavailable: 'تعذّر تحميل المواد. أدخل مادة مخصّصة بدلاً من ذلك.',
    reqFullName: 'الاسم بالكامل مطلوب.',
    reqUsername: 'اسم المستخدم مطلوب.',
    invalidEmail: 'أدخل بريدًا إلكترونيًا صحيحًا.',
    reqPhone: 'رقم الموبايل مطلوب.',
    invalidPhone: 'أدخل رقم موبايل مصري صحيح (مثال: 01012345678).',
    reqPassword: 'كلمة المرور مطلوبة.',
    weakPassword:
      '٨ أحرف على الأقل مع حرف كبير وحرف صغير ورقم ورمز خاص.',
    reqConfirm: 'من فضلك أكّد كلمة المرور.',
    mismatch: 'كلمتا المرور غير متطابقتين.',
    reqSubject: 'اختر مادة أو أدخل مادة مخصّصة.',
    reqCapacity: 'أدخل سعة صحيحة.',
    reqLinkedCapacity: 'اكتب صفر أو رقم صحيح أكبر، أو سيبه فاضي عشان يبقى زي عدد الطلاب في الحساب.',
    linkedAboveCapacity:
      'حسابات الطلاب على التطبيق ماينفعش تكون أكتر من الطلاب في الحساب — لازم الطالب يكون موجود في الحساب الأول عشان ياخد حساب على التطبيق. قلّل الرقم ده، أو زوّد "الطلاب في الحساب".',
  },
};

@Component({
  selector: 'app-teacher-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div [attr.dir]="uiLang() === 'ar' ? 'rtl' : 'ltr'">
      <div class="page-header">
        <h2>{{ isEdit() ? t('titleEdit') : t('titleNew') }}</h2>
        <div class="d-flex align-items-center gap-2">
          <div class="btn-group" role="group" aria-label="Interface language">
            <button type="button" class="btn btn-sm"
              [class.btn-primary]="uiLang() === 'en'"
              [class.btn-outline-secondary]="uiLang() !== 'en'"
              (click)="setUiLang('en')">EN</button>
            <button type="button" class="btn btn-sm"
              [class.btn-primary]="uiLang() === 'ar'"
              [class.btn-outline-secondary]="uiLang() !== 'ar'"
              (click)="setUiLang('ar')">ع</button>
          </div>
          <a routerLink="/teachers" class="btn btn-outline-secondary">{{ t('back') }}</a>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          @if (isEdit()) {
            <p class="text-muted">{{ t('editNote') }}</p>
          }
          <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label" for="fullName">{{ t('fullName') }} *</label>
                <input id="fullName" class="form-control" formControlName="fullName"
                  [class.is-invalid]="invalid('fullName')" />
                @if (invalid('fullName')) {
                  <div class="invalid-feedback">{{ t('reqFullName') }}</div>
                }
              </div>

              <div class="col-md-6">
                <label class="form-label" for="username">{{ t('username') }} *</label>
                <input id="username" class="form-control" formControlName="username"
                  [class.is-invalid]="invalid('username')" />
                @if (invalid('username')) {
                  <div class="invalid-feedback">{{ t('reqUsername') }}</div>
                }
              </div>

              <div class="col-md-6">
                <label class="form-label" for="email">{{ t('email') }}</label>
                <input id="email" type="email" class="form-control" formControlName="email"
                  [class.is-invalid]="invalid('email')" />
                @if (invalid('email')) {
                  <div class="invalid-feedback">{{ t('invalidEmail') }}</div>
                }
              </div>

              <div class="col-md-6">
                <label class="form-label" for="phoneNumber">{{ t('phone') }} *</label>
                <input id="phoneNumber" class="form-control" formControlName="phoneNumber"
                  placeholder="01012345678" [class.is-invalid]="invalid('phoneNumber')" />
                @if (invalid('phoneNumber')) {
                  <div class="invalid-feedback">
                    {{ form.controls.phoneNumber.hasError('required') ? t('reqPhone') : t('invalidPhone') }}
                  </div>
                }
              </div>

              @if (!isEdit()) {
                <div class="col-md-6">
                  <label class="form-label" for="password">{{ t('password') }} *</label>
                  <input id="password" type="password" class="form-control"
                    formControlName="password" autocomplete="new-password"
                    [class.is-invalid]="invalid('password')" />
                  @if (invalid('password')) {
                    <div class="invalid-feedback">
                      {{ form.controls.password.hasError('required') ? t('reqPassword') : t('weakPassword') }}
                    </div>
                  }
                </div>

                <div class="col-md-6">
                  <label class="form-label" for="confirmedPassword">{{ t('confirmPassword') }} *</label>
                  <input id="confirmedPassword" type="password" class="form-control"
                    formControlName="confirmedPassword" autocomplete="new-password"
                    [class.is-invalid]="confirmInvalid()" />
                  @if (confirmInvalid()) {
                    <div class="invalid-feedback">
                      {{ form.controls.confirmedPassword.hasError('required') ? t('reqConfirm') : t('mismatch') }}
                    </div>
                  }
                </div>

                <div class="col-md-6">
                  <label class="form-label" for="subjectId">{{ t('subject') }} *</label>
                  <select id="subjectId" class="form-select" formControlName="subjectId"
                    [class.is-invalid]="invalid('subjectId')">
                    <option [ngValue]="null" disabled>{{ t('subjectPlaceholder') }}</option>
                    @for (s of subjects(); track s.id) {
                      <option [ngValue]="s.id">{{ uiLang() === 'ar' ? s.nameAr : s.nameEn }}</option>
                    }
                  </select>
                  @if (subjectsFailed()) {
                    <div class="form-text text-warning">{{ t('subjectsUnavailable') }}</div>
                  }
                  @if (invalid('subjectId')) {
                    <div class="invalid-feedback">{{ t('reqSubject') }}</div>
                  }
                </div>

                <div class="col-md-6">
                  <label class="form-label" for="customSubject">{{ t('customSubject') }}</label>
                  <input id="customSubject" class="form-control" formControlName="customSubject" />
                </div>

                <div class="col-md-6">
                  <label class="form-label" for="languagePreference">{{ t('language') }} *</label>
                  <select id="languagePreference" class="form-select" formControlName="languagePreference">
                    <option value="en">English</option>
                    <option value="ar">العربية</option>
                  </select>
                </div>

                <div class="col-md-6">
                  <label class="form-label" for="studentCapacity">{{ t('capacity') }} *</label>
                  <input id="studentCapacity" type="number" min="1" class="form-control"
                    formControlName="studentCapacity" [class.is-invalid]="invalid('studentCapacity')" />
                  @if (invalid('studentCapacity')) {
                    <div class="invalid-feedback">{{ t('reqCapacity') }}</div>
                  }
                  <div class="form-text">{{ t('capacityHint') }}</div>
                </div>

                <div class="col-md-6">
                  <label class="form-label" for="linkedStudentCapacity">{{ t('linkedCapacity') }}</label>
                  <input id="linkedStudentCapacity" type="number" min="0" class="form-control"
                    formControlName="linkedStudentCapacity"
                    [class.is-invalid]="linkedCapacityInvalid()" />
                  @if (linkedCapacityInvalid()) {
                    <div class="invalid-feedback">
                      {{ form.hasError('linkedAboveCapacity') ? t('linkedAboveCapacity') : t('reqLinkedCapacity') }}
                    </div>
                  }
                  <div class="form-text">{{ t('linkedCapacityHint') }}</div>
                </div>

                <div class="col-md-6">
                  <label class="form-label" for="idImage">{{ t('idImage') }}</label>
                  <input id="idImage" type="file" class="form-control" accept="image/*"
                    (change)="onFileSelected($event)" />
                </div>
              }
            </div>

            @if (!isEdit()) {
              <div class="d-flex justify-content-end gap-2 pt-4">
                <a routerLink="/teachers" class="btn btn-outline-secondary">{{ t('cancel') }}</a>
                <button type="submit" class="btn btn-primary" [disabled]="submitting()">
                  {{ submitting() ? t('creating') : t('create') }}
                </button>
              </div>
            }
          </form>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-header { display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-bottom:1.5rem; }
    .card { border:1px solid var(--edvanz-border,#e5e7eb); border-radius:14px; }
  `],
})
export class TeacherFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly teacherService = inject(TeacherService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // Mirrors UserService.PhoneNumberValidator: 11 digits, 010/011/012/015.
  private static readonly EG_PHONE_PATTERN = /^01[0125]\d{8}$/;
  // Mirrors AddUserDto password policy: upper, lower, digit, special, 8+ chars.
  private static readonly PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/;

  protected readonly isEdit = signal(false);
  protected readonly submitting = signal(false);
  protected readonly uiLang = signal<UiLang>('en');
  protected readonly subjects = signal<SubjectDto[]>([]);
  protected readonly subjectsFailed = signal(false);

  private teacherId: string | null = null;
  private idImage: File | null = null;

  protected readonly form = this.fb.nonNullable.group(
    {
      fullName: ['', [Validators.required, Validators.maxLength(120)]],
      username: ['', [Validators.required]],
      email: ['', [Validators.email]],
      phoneNumber: ['', [Validators.required, Validators.pattern(TeacherFormComponent.EG_PHONE_PATTERN)]],
      password: ['', [
        Validators.required,
        Validators.minLength(8),
        Validators.pattern(TeacherFormComponent.PASSWORD_PATTERN),
      ]],
      confirmedPassword: ['', [Validators.required]],
      subjectId: this.fb.control<number | null>(null, [Validators.required]),
      customSubject: [''],
      languagePreference: ['en' as UiLang, [Validators.required]],
      studentCapacity: [500, [Validators.required, Validators.min(1)]],
      // Deliberately EMPTY by default, not 500: the backend treats a null as "mirror
      // studentCapacity", so an admin who ignores this field always gets a limit that
      // agrees with the capacity they actually typed. A hardcoded 500 would silently
      // diverge the moment they set a different capacity. 0 is valid and meaningful —
      // it means "no student app accounts at all" (managerial-style).
      linkedStudentCapacity: this.fb.control<number | null>(null, [Validators.min(0)]),
    },
    {
      validators: [
        TeacherFormComponent.passwordsMatch,
        TeacherFormComponent.linkedNotAboveCapacity,
      ],
    },
  );

  ngOnInit(): void {
    this.teacherId = this.route.snapshot.paramMap.get('id');
    this.isEdit.set(!!this.teacherId);

    if (this.isEdit()) {
      // Edit mode is view-only for now (no PUT endpoint). Relax create-only controls
      // so the shared FormGroup does not block the two editable fields.
      this.relaxCreateOnlyValidators();
      this.teacherService.getTeacherById(+this.teacherId!).subscribe((teacher) => {
        this.form.patchValue({ fullName: teacher.fullName, phoneNumber: teacher.phoneNumber ?? '' });
      });
      return;
    }

    this.loadSubjects();
  }

  private loadSubjects(): void {
    this.teacherService.getSubjects(this.uiLang()).subscribe({
      next: (list) => this.subjects.set([...list].sort((a, b) => a.displayOrder - b.displayOrder)),
      // Interceptor already toasts the error; fall back to the custom-subject path.
      error: () => this.subjectsFailed.set(true),
    });
  }

  private relaxCreateOnlyValidators(): void {
    for (const name of [
      'password',
      'confirmedPassword',
      'subjectId',
      'languagePreference',
      'studentCapacity',
      'linkedStudentCapacity',
    ]) {
      const control = this.form.get(name);
      control?.clearValidators();
      control?.updateValueAndValidity();
    }
  }

  /** Group-level validator: confirmedPassword must equal password. */
  private static passwordsMatch(group: AbstractControl): ValidationErrors | null {
    const password = group.get('password')?.value;
    const confirm = group.get('confirmedPassword')?.value;
    return password && confirm && password !== confirm ? { passwordMismatch: true } : null;
  }

  /**
   * Group-level validator: the "student app accounts" limit can never exceed the
   * "students in account" limit — an app account belongs to a student who already
   * exists in the account, so more seats than students is meaningless (and would be
   * billed). Skips when either side is blank so the field's own required/min rule
   * reports first, and in edit mode where both are relaxed.
   */
  private static linkedNotAboveCapacity(group: AbstractControl): ValidationErrors | null {
    const capacity = group.get('studentCapacity')?.value;
    const linked = group.get('linkedStudentCapacity')?.value;
    if (capacity == null || linked == null || capacity === '' || linked === '') return null;
    return Number(linked) > Number(capacity) ? { linkedAboveCapacity: true } : null;
  }

  protected setUiLang(lang: UiLang): void {
    if (this.uiLang() === lang) return;
    this.uiLang.set(lang);
    // Re-fetch subjects so any backend message is localized; names themselves are bilingual.
    if (!this.isEdit()) this.loadSubjects();
  }

  protected t(key: string): string {
    return MSG[this.uiLang()][key] ?? key;
  }

  protected invalid(control: string): boolean {
    const c = this.form.get(control);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  /** App-accounts field shows an error for its own required/min rule OR the
   *  group-level "must not exceed students in account" rule. */
  protected linkedCapacityInvalid(): boolean {
    const c = this.form.controls.linkedStudentCapacity;
    const touched = c.touched || c.dirty || this.form.controls.studentCapacity.dirty;
    return touched && (c.invalid || this.form.hasError('linkedAboveCapacity'));
  }

  /** Confirm field shows an error for its own required rule OR the group mismatch. */
  protected confirmInvalid(): boolean {
    const c = this.form.controls.confirmedPassword;
    const touched = c.touched || c.dirty;
    return touched && (c.invalid || this.form.hasError('passwordMismatch'));
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.idImage = input.files?.[0] ?? null;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.create();
  }

  private create(): void {
    const raw = this.form.getRawValue();

    const request: CreateTeacherSignUpRequest = {
      userType: 'Teacher',
      fullName: raw.fullName.trim(),
      username: raw.username.trim(),
      email: raw.email.trim() || undefined,
      password: raw.password,
      confirmedPassword: raw.confirmedPassword,
      phoneNumber: raw.phoneNumber.trim(),
      subjectIds: raw.subjectId != null ? [raw.subjectId] : [],
      languagePreference: raw.languagePreference,
      studentCapacity: raw.studentCapacity,
      // Omitted when blank -> the server mirrors studentCapacity (old-client behaviour).
      linkedStudentCapacity: raw.linkedStudentCapacity ?? undefined,
      customSubject: raw.customSubject.trim() || undefined,
      idImage: this.idImage,
    };

    this.teacherService.createTeacher(request, this.uiLang()).subscribe({
      next: (res) => {
        this.toast.success(res.message ?? this.t('createdOk'));
        void this.router.navigate(['/teachers']);
      },
      // Interceptor surfaces the localized backend message; just release the button.
      error: () => this.submitting.set(false),
    });
  }
}
