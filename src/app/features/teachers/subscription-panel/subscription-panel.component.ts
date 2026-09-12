import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  CurrentSubscriptionDto,
  SubscriptionPlanType,
  planTypeLabel,
} from '../../../core/models/subscription.model';
import { TeacherSubscriptionDto } from '../../../core/models/teacher.model';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { ToastService } from '../../../core/services/toast.service';
import { TeacherService } from '../../../core/services/teacher.service';
import { TeacherProfile } from '../../../core/models/teacher.model';
import { AdminSubscriptionPricing } from '../../../core/models/subscription.model';
import { SubscriptionStatusBadgeComponent } from './subscription-status-badge.component';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.service';

/**
 * Subscription tab for one teacher. Every mutation returns the fresh
 * subscription from the server, so `remainingDays`, `status` and `planType`
 * are never recomputed client-side — the backend stays the single source of truth.
 *
 * Supports the three subscription TYPES:
 *   - Full            — students & parents can be linked.
 *   - Managerial      — no students or parents can be linked while active. When
 *                       activating/converting to Managerial the admin chooses whether
 *                       to also remove students/parents already linked
 *                       (removeExistingLinks), or keep them (only new links blocked).
 *   - ManagerialPlus  — "Managerial + Parents": same account blocks as Managerial,
 *                       but the public parent follow-up page stays available.
 */
@Component({
  selector: 'app-subscription-panel',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, NgTemplateOutlet, SubscriptionStatusBadgeComponent],
  template: `
    @if (subscription(); as sub) {
      <div class="row g-4">
        <div class="col-lg-5">
          <div class="summary">
            <div class="summary-row">
              <span class="label">Status</span>
              <app-subscription-status-badge [status]="sub.subscriptionStatus" />
            </div>
            <div class="summary-row">
              <span class="label">Plan</span>
              <span class="plan-badge" [class.managerial]="isRestricted(sub)">
                {{ planLabel(sub.planType) }}
              </span>
            </div>
            <div class="summary-row">
              <span class="label">Start date</span>
              <span>{{ sub.startDate ? (sub.startDate | date: 'mediumDate') : '—' }}</span>
            </div>
            <div class="summary-row">
              <span class="label">End date</span>
              <span>{{ sub.endDate ? (sub.endDate | date: 'mediumDate') : '—' }}</span>
            </div>
            <div class="summary-row">
              <span class="label">Remaining days</span>
              <span class="fw-semibold">{{ sub.daysRemaining }}</span>
            </div>
          </div>

          @if (isRestricted(sub) && (sub.subscriptionStatus === 'Active' || sub.subscriptionStatus === 'ExpiringSoon')) {
            <div class="managerial-note">
              @if (sub.planType === 'ManagerialPlus') {
                Managerial + Parents subscription — no student accounts can be linked,
                but the parent follow-up page is available to this teacher.
              } @else {
                Managerial subscription — students &amp; parents cannot be linked to this teacher.
              }
            </div>
          }
        </div>

        <div class="col-lg-7">
          <div class="actions">
            @if (sub.subscriptionStatus === 'Pending' || sub.subscriptionStatus === 'Cancelled' || sub.subscriptionStatus === 'Expired') {
              <div class="action-card">
                <h6>Activate subscription</h6>
                <ng-container *ngTemplateOutlet="activationForm; context: { $implicit: 'Activate' }" />
              </div>
            }

            @if (sub.subscriptionStatus === 'Active' || sub.subscriptionStatus === 'ExpiringSoon') {
              <div class="action-card">
                <h6>Subscription type</h6>
                <p class="mb-2">
                  Current type:
                  <span class="plan-badge" [class.managerial]="isRestricted(sub)">
                    {{ planLabel(sub.planType) }}
                  </span>
                </p>

                @if (isRestricted(sub)) {
                  <p class="text-muted small mb-2">
                    Switch back to Full so students &amp; parents can be linked again.
                    The current period is kept. (Previously removed links are not restored automatically.)
                  </p>
                } @else {
                  <p class="text-muted small mb-2">
                    Switch to a managerial plan — student &amp; parent accounts can no longer be linked
                    (Managerial + Parents keeps the parent follow-up page available).
                    The current period is kept.
                  </p>
                  <div class="form-check mb-2">
                    <input class="form-check-input" type="checkbox" [formControl]="convertRemoveLinks" id="conv-rm" />
                    <label class="form-check-label" for="conv-rm">
                      Also remove students &amp; parents already linked to this teacher
                    </label>
                  </div>
                }
                <div class="d-flex flex-wrap gap-2">
                  @if (sub.planType !== 'Full' && isRestricted(sub)) {
                    <button type="button" class="btn btn-outline-primary btn-sm" (click)="convertTo('Full')">
                      Switch to Full
                    </button>
                  }
                  @if (sub.planType !== 'ManagerialPlus') {
                    <button type="button" class="btn btn-outline-warning btn-sm" (click)="convertTo('ManagerialPlus')">
                      Switch to Managerial + Parents
                    </button>
                  }
                  @if (sub.planType !== 'Managerial') {
                    <button type="button" class="btn btn-outline-warning btn-sm" (click)="convertTo('Managerial')">
                      Switch to Managerial
                    </button>
                  }
                </div>
              </div>

              <!-- THE LIMITS WHILE IT IS RUNNING. The activation form sets these, but a
                   subscription spends almost all of its life Active, so an admin asked to
                   raise a teacher's numbers arrives here and used to find nothing. The two
                   numbers behave differently and the card says so rather than failing at
                   the server: students-on-the-account only goes up, app accounts go either
                   way and carry the price. -->
              <div class="action-card">
                <h6>Students this subscription covers</h6>

                <div class="cap-grid">
                  <div>
                    <label class="form-label small mb-1" for="live-cap-students">
                      Students on the account
                    </label>
                    <div class="input-group input-group-sm">
                      <input
                        id="live-cap-students"
                        type="number"
                        class="form-control"
                        [min]="currentStudentCapacity() + 1"
                        [formControl]="liveStudentCapacity"
                        [attr.placeholder]="currentStudentCapacity()"
                      />
                      <button
                        type="button"
                        class="btn btn-outline-primary"
                        [disabled]="savingStudents() || !canRaiseStudents()"
                        (click)="raiseStudentCapacity()"
                      >
                        {{ savingStudents() ? 'Saving…' : 'Set' }}
                      </button>
                    </div>
                    <p class="text-muted small mb-0 mt-1">
                      Now {{ currentStudentCapacity() }}. This one only goes up — type a
                      higher number. Not what the subscription is priced on.
                    </p>
                  </div>

                  @if (!isRestricted(sub)) {
                    <div>
                      <label class="form-label small mb-1" for="live-cap-linked">
                        Student app accounts
                      </label>
                      <div class="input-group input-group-sm">
                        <input
                          id="live-cap-linked"
                          type="number"
                          min="0"
                          class="form-control"
                          [formControl]="liveLinkedCapacity"
                          [attr.placeholder]="currentLinkedCapacity()"
                        />
                        <button
                          type="button"
                          class="btn btn-outline-primary"
                          [disabled]="savingLinked() || !canSetLinked()"
                          (click)="setLinkedCapacity()"
                        >
                          {{ savingLinked() ? 'Saving…' : 'Set' }}
                        </button>
                      </div>
                      <p class="text-muted small mb-0 mt-1">
                        Now {{ currentLinkedCapacity() }}. Up or down.
                        <strong>The price is based on this</strong>, from the next renewal.
                        Lowering it never signs anyone out — it only blocks new links.
                      </p>
                    </div>
                  }
                </div>

                @if (livePriceLine(sub); as line) {
                  <p class="price-line mb-0 mt-2">{{ line }}</p>
                }
              </div>

              <form [formGroup]="extendForm" (ngSubmit)="extend()" class="action-card">
                <h6>Extend by days</h6>
                <div class="input-group">
                  <input type="number" min="1" class="form-control" formControlName="days" />
                  <button type="submit" class="btn btn-primary" [disabled]="extendForm.invalid">
                    Extend
                  </button>
                </div>
              </form>

              <form [formGroup]="endDateForm" (ngSubmit)="updateEndDate()" class="action-card">
                <h6>Update end date</h6>
                <div class="input-group">
                  <input type="date" class="form-control" formControlName="endDate" />
                  <button type="submit" class="btn btn-primary" [disabled]="endDateForm.invalid">
                    Update
                  </button>
                </div>
              </form>

              <div class="action-card">
                <h6>Cancel subscription</h6>
                <p class="text-muted small mb-2">
                  Immediately revokes access for this teacher.
                </p>
                <button type="button" class="btn btn-outline-danger btn-sm" (click)="cancel()">
                  Cancel subscription
                </button>
              </div>
            }
          </div>
        </div>
      </div>
    }
    @else if (loadState() === 'loading') {
  <div class="action-card empty-state">
    <div class="sk sk-title"></div>
    <div class="sk"></div>
    <div class="sk sk-short"></div>
  </div>
}
    @else if (loadState() === 'failed') {
  <div class="action-card empty-state">
    <h6>Could not load the subscription</h6>
    <p class="text-muted small mb-3">
      Nothing has been changed. Try again before creating anything — this teacher may
      already have a live subscription.
    </p>
    <button type="button" class="btn btn-outline-secondary btn-sm" (click)="retry()">
      Try again
    </button>
  </div>
}
    @else {
  <div class="action-card empty-state">
    <h6>No subscription yet</h6>
    <p class="text-muted small mb-3">
      This teacher has no subscription record. Create the first one below
      (manual activation — SuperAdminOverride, no payment).
    </p>
    <ng-container *ngTemplateOutlet="activationForm; context: { $implicit: 'Create' }" />
  </div>
}

<!-- THE ONE ACTIVATION FORM. It is reached from two places — a teacher whose
     subscription lapsed, and a teacher who has never had one — and it used to exist
     as two copies of the same markup. They drifted the moment one was edited: the
     student limits were added to the lapsed copy only, so setting up a brand new
     teacher (the case that needs them most) silently offered no limits at all. One
     definition, two call sites; the word on the button is the only difference. -->
<ng-template #activationForm let-verb>
  <form [formGroup]="activateForm" (ngSubmit)="activate()">
    <div class="mb-2">
      <label class="form-label d-block mb-1">Subscription type</label>
      <div class="btn-group btn-group-sm w-100" role="group">
        <input type="radio" class="btn-check" formControlName="planType" value="Full" id="pt-full" />
        <label class="btn btn-outline-primary" for="pt-full">Full</label>
        <input type="radio" class="btn-check" formControlName="planType" value="ManagerialPlus" id="pt-mgr-plus" />
        <label class="btn btn-outline-primary" for="pt-mgr-plus">Managerial + Parents</label>
        <input type="radio" class="btn-check" formControlName="planType" value="Managerial" id="pt-mgr" />
        <label class="btn btn-outline-primary" for="pt-mgr">Managerial</label>
      </div>
      <p class="text-muted small mt-1 mb-0">
        {{ planHelp(activateForm.controls.planType.value) }}
      </p>
    </div>

    <div class="row g-2">
      <div class="col-sm-6">
        <label class="form-label" for="act-start">Start date</label>
        <input id="act-start" type="date" class="form-control" formControlName="startDate" />
      </div>
      <div class="col-sm-6">
        <label class="form-label" for="act-end">End date</label>
        <input id="act-end" type="date" class="form-control" formControlName="endDate" />
      </div>
    </div>
    <p class="text-muted small mt-1 mb-0">
      Leave both dates empty to start today for 30 days.
    </p>

    <!-- THE LIMITS, SET HERE. They and the plan are one decision: an admin agreeing a
         subscription is agreeing the numbers it covers, and putting them on a different
         screen means activating at the old limit and correcting it afterwards. The
         server applies them before it snapshots the price, so what is typed here is
         what the plan costs. -->
    <div class="mt-3">
      <label class="form-label d-block mb-1">
        {{ activateForm.controls.planType.value === 'Full'
            ? 'Limits this subscription covers'
            : 'Students this subscription covers' }}
      </label>

      <div class="row g-2">
        <div [class]="activateForm.controls.planType.value === 'Full' ? 'col-sm-6' : 'col-12'">
          <label class="form-label small mb-1" for="cap-students">Students on the account</label>
          <input
            id="cap-students"
            type="number"
            min="1"
            class="form-control"
            formControlName="studentCapacity"
            [attr.placeholder]="currentStudentCapacity()"
          />
          <p class="text-muted small mb-0">
            Now {{ currentStudentCapacity() }}. Leave blank to keep it.
          </p>
        </div>

        @if (activateForm.controls.planType.value === 'Full') {
          <div class="col-sm-6">
            <label class="form-label small mb-1" for="cap-linked">Student app accounts</label>
            <input
              id="cap-linked"
              type="number"
              min="1"
              class="form-control"
              formControlName="linkedStudentCapacity"
              [attr.placeholder]="currentLinkedCapacity()"
            />
            <p class="text-muted small mb-0">
              Now {{ currentLinkedCapacity() }}. <strong>The price is based on this.</strong>
            </p>
          </div>
        }
      </div>

      @if (priceLine(); as line) {
        <p class="price-line mb-0 mt-2">{{ line }}</p>
      }
    </div>

    @if (activateForm.controls.planType.value !== 'Full') {
      <div class="form-check mt-2">
        <input class="form-check-input" type="checkbox" formControlName="removeExistingLinks" id="rm-links" />
        <label class="form-check-label" for="rm-links">
          Also remove students &amp; parents already linked
        </label>
        <p class="text-muted small mb-0">
          Off: existing students/parents are kept (only new links are blocked).
          On: their account links are removed now.
        </p>
      </div>
    }

    <button type="submit" class="btn btn-success btn-sm mt-2" [disabled]="activateForm.invalid">
      {{ verb }} {{ planLabel(asPlan(activateForm.controls.planType.value)) }} subscription
    </button>
  </form>
</ng-template>
  `,
  styles: [
    `
      .summary {
        border: 1px solid var(--edvanz-border, #e5e7eb);
        border-radius: 12px;
        padding: 1.25rem;
      }
      .summary-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.6rem 0;
        border-bottom: 1px solid var(--edvanz-border, #eef2f7);
      }
      .empty-state { max-width: 520px; }
      .sk {
        height: 14px;
        margin-bottom: 0.6rem;
        border-radius: 6px;
        background: linear-gradient(90deg, #eef0f4 25%, #f6f7f9 50%, #eef0f4 75%);
        background-size: 200% 100%;
        animation: sub-shimmer 1.4s infinite;
      }
      .sk-title { height: 20px; width: 45%; margin-bottom: 1rem; }
      .sk-short { width: 70%; margin-bottom: 0; }
      @keyframes sub-shimmer {
        to { background-position: -200% 0; }
      }
      .summary-row:last-child {
        border-bottom: none;
      }
      .label {
        color: var(--edvanz-muted, #6b7280);
        font-size: 0.9rem;
      }
      .plan-badge {
        display: inline-block;
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
        font-size: 0.8rem;
        font-weight: 600;
        background: #eef2ff;
        color: #4338ca;
      }
      .plan-badge.managerial {
        background: #fef3c7;
        color: #b45309;
      }
      .managerial-note {
        margin-top: 0.75rem;
        padding: 0.6rem 0.9rem;
        border: 1px solid #fcd34d;
        background: #fffbeb;
        color: #92400e;
        border-radius: 10px;
        font-size: 0.85rem;
      }
      .actions {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .action-card {
        border: 1px solid var(--edvanz-border, #e5e7eb);
        border-radius: 12px;
        padding: 1rem 1.25rem;
      }
      .action-card h6 {
        margin-bottom: 0.75rem;
      }
      /* The money the numbers above add up to. Quiet, but never grey-on-grey —
         it is the consequence of the decision being made, not a footnote. */
      .price-line {
        padding: 0.45rem 0.7rem;
        border-radius: 8px;
        background: #eef2ff;
        color: #3730a3;
        font-size: 0.85rem;
        font-weight: 600;
      }
      /* Two limits side by side on a wide panel, stacked when the column narrows —
         they are read together, and the priced one must never scroll out of sight
         of the one it is not. */
      .cap-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
        gap: 1rem;
      }
    `,
  ],
})
export class SubscriptionPanelComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly teachers = inject(TeacherService);

  private teacherId!: number;
  private subscriptionId: number | null = null;

  protected readonly subscription = signal<TeacherSubscriptionDto | null>(null);

  /**
   * A null subscription means two very different things — still fetching, or the
   * teacher genuinely has none — and the create form must only appear for the
   * second. Until this guard existed the form rendered during every fetch, so on a
   * slow connection an admin could create a SECOND subscription for a teacher who
   * already had a live one.
   */
  protected readonly loadState = signal<'loading' | 'loaded' | 'failed'>('loading');

  /** The teacher's CURRENT limits, so each box can say what it is replacing. */
  protected readonly profile = signal<TeacherProfile | null>(null);
  /** The rates, so the form can price the numbers being typed into it. */
  protected readonly pricing = signal<AdminSubscriptionPricing | null>(null);

  protected readonly activateForm = this.fb.nonNullable.group({
    planType: ['Full'],
    startDate: [''],
    endDate: [''],
    // Blank means "leave the limit alone" — a number box that defaults to 0 would
    // quietly cap a teacher at nothing the first time someone activated without
    // thinking about it.
    studentCapacity: [''],
    linkedStudentCapacity: [''],
    removeExistingLinks: [false],
  });
  /** Standalone toggle for the "switch an active subscription to Managerial" card. */
  protected readonly convertRemoveLinks = this.fb.nonNullable.control(false);
  protected readonly extendForm = this.fb.nonNullable.group({
    days: [30, [Validators.required, Validators.min(1)]],
  });
  protected readonly endDateForm = this.fb.nonNullable.group({
    endDate: ['', Validators.required],
  });

  // ── The two limits, editable while the subscription is running ────────────────
  // Separate controls from the activation form's: those mean "apply this when the
  // period starts", these mean "change it now, on a period already running". Blank
  // means "leave it alone" in both, which is why neither is seeded with the current
  // number — a pre-filled box invites a Set that changes nothing.
  protected readonly liveStudentCapacity = this.fb.nonNullable.control('');
  protected readonly liveLinkedCapacity = this.fb.nonNullable.control('');
  protected readonly savingStudents = signal(false);
  protected readonly savingLinked = signal(false);

  ngOnInit(): void {
    this.teacherId = +(this.route.parent!.snapshot.paramMap.get('id') ?? '0');
    this.load();
  }

  /** True for BOTH managerial plans — the ones that block student/parent accounts. */
  protected isRestricted(sub: TeacherSubscriptionDto): boolean {
    return sub.planType === 'Managerial' || sub.planType === 'ManagerialPlus';
  }

  protected planLabel(planType: string | null | undefined): string {
    return planTypeLabel(planType);
  }

  /** Narrow the form control's string to the plan union for the label helper. */
  protected asPlan(value: string): SubscriptionPlanType {
    return value as SubscriptionPlanType;
  }

  protected planHelp(planType: string): string {
    switch (planType) {
      case 'ManagerialPlus':
        return 'Managerial + Parents: no student accounts can be linked, but the parent follow-up page stays available.';
      case 'Managerial':
        return 'Managerial: no students or parents can be linked to this teacher.';
      default:
        return 'Full: students and parents can be linked normally.';
    }
  }

  protected activate(): void {
    const { startDate, endDate, planType, removeExistingLinks, studentCapacity, linkedStudentCapacity } =
      this.activateForm.getRawValue();
    const start = startDate ? this.toUtc(startDate) : null;
    const end = endDate ? this.toUtc(endDate) : null;
    const plan = this.asPlan(planType);

    // Blank stays blank: null tells the server to leave the limit exactly as it is.
    const students = this.asLimit(studentCapacity);
    const linked = this.asLimit(linkedStudentCapacity);

    if (plan === 'Full') {
      this.subscriptionService
        .activate({
          teacherId: this.teacherId,
          startDate: start,
          endDate: end,
          studentCapacity: students,
          linkedStudentCapacity: linked,
        })
        .subscribe((sub) => this.applyResult(sub, 'Subscription activated.'));
      return;
    }

    const request = {
      teacherId: this.teacherId,
      startDate: start,
      endDate: end,
      removeExistingLinks,
      // One number: a managerial plan has no app accounts to limit.
      studentCapacity: students,
    };
    (plan === 'ManagerialPlus'
      ? this.subscriptionService.activateManagerialPlus(request)
      : this.subscriptionService.activateManagerial(request)
    ).subscribe((sub) =>
      this.applyResult(sub, `${planTypeLabel(plan)} subscription activated.`),
    );
  }

  /** Convert an already-active subscription to another plan, preserving the current period. */
  protected async convertTo(target: SubscriptionPlanType): Promise<void> {
    const sub = this.subscription();
    if (!sub || sub.planType === target) return;

    // Removing links only matters when leaving Full for a plan that blocks accounts.
    const remove =
      sub.planType === 'Full' && target !== 'Full'
        ? this.convertRemoveLinks.value
        : false;

    const message =
      target === 'Full'
        ? 'Switch this teacher back to a full subscription? Students & parents will be able to link again. Previously removed links are not restored automatically.'
        : target === 'ManagerialPlus'
          ? remove
            ? 'This blocks any new student/parent account links AND removes all students & parents already linked. The parent follow-up page stays available. Continue?'
            : 'This blocks any new student/parent account links (existing ones are kept). The parent follow-up page stays available. Continue?'
          : remove
            ? 'This blocks any new student/parent links AND removes all students & parents already linked to this teacher. Continue?'
            : 'This blocks any new student/parent links for this teacher. Students & parents already linked are kept. Continue?';

    const confirmed = await this.confirm.open({
      title: `Switch to ${planTypeLabel(target)}`,
      message,
      confirmText: `Switch to ${planTypeLabel(target)}`,
      cancelText: 'Keep current',
    });
    if (!confirmed) return;

    const period = {
      teacherId: this.teacherId,
      startDate: sub.startDate, // preserve the current period
      endDate: sub.endDate,
    };
    const call =
      target === 'Full'
        ? this.subscriptionService.activate(period)
        : target === 'ManagerialPlus'
          ? this.subscriptionService.activateManagerialPlus({
              ...period,
              removeExistingLinks: remove,
            })
          : this.subscriptionService.activateManagerial({
              ...period,
              removeExistingLinks: remove,
            });

    call.subscribe((s) => {
      this.convertRemoveLinks.setValue(false);
      this.applyResult(s, `Switched to ${planTypeLabel(target)} subscription.`);
    });
  }

  protected extend(): void {
    if (this.extendForm.invalid) return;
    this.subscriptionService
      .extend({ teacherId: this.teacherId, extensionDays: this.extendForm.getRawValue().days })
      .subscribe((sub) => this.applyResult(sub, 'Subscription extended.'));
  }

  protected updateEndDate(): void {
    if (this.endDateForm.invalid || !this.subscriptionId) return;
    this.subscriptionService
      .setEndDate({
        subscriptionId: this.subscriptionId,
        newEndDate: this.toUtc(this.endDateForm.getRawValue().endDate),
      })
      .subscribe((sub) => this.applyResult(sub, 'End date updated.'));
  }

  protected async cancel(): Promise<void> {

  const confirmed = await this.confirm.open({
    title: 'Cancel subscription',
    message: 'Are you sure you want to cancel this subscription?',
    confirmText: 'Cancel subscription',
    cancelText: 'Keep subscription'
  });

  if (!confirmed) {
    return;
  }

  this.subscriptionService
    .cancel({
      teacherId: this.teacherId
    })
    .subscribe(sub => {
      this.applyResult(sub, 'Subscription cancelled.');
    });
}

  /**
   * The mutation endpoints return CurrentSubscriptionDto (status field is `status`);
   * the panel/signal use the TeacherSubscriptionDto shape (`subscriptionStatus`).
   * Normalize here so the badges, action cards and plan display stay correct
   * after every mutation.
   */
  private applyResult(sub: CurrentSubscriptionDto | null, message: string): void {
    if (!sub) {
      this.subscription.set(null);
      this.subscriptionId = null;
      this.toast.success(message);
      return;
    }
    const normalized: TeacherSubscriptionDto = {
      id: sub.id,
      subscriptionStatus: sub.status,
      planType: sub.planType,
      startDate: sub.startDate,
      endDate: sub.endDate,
      daysRemaining: sub.daysRemaining,
    };
    this.subscription.set(normalized);
    this.subscriptionId = normalized.id ?? null;
    this.toast.success(message);
  }

  /** Blank means "leave this limit alone" — never 0, which would cap a teacher at nothing. */
  private asLimit(value: string): number | null {
    const trimmed = (value ?? '').trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }

  protected currentStudentCapacity(): number {
    return this.profile()?.studentCapacity ?? 0;
  }

  protected currentLinkedCapacity(): number {
    return this.profile()?.linkedStudentCapacity ?? 0;
  }

  /**
   * What the plan will cost with the numbers currently in the boxes.
   *
   * Shown because the admin is typing the number the Full price is computed FROM, and
   * a limit with no price beside it is a decision made blind. The managerial plans are
   * flat, so their line says so rather than reacting to a box that does not affect them.
   */
  protected priceLine(): string | null {
    const rates = this.pricing();
    if (!rates) return null;

    const plan = this.activateForm.controls.planType.value;
    if (plan === 'Managerial') {
      return `Managerial is a flat ${this.egp(rates.managerialMonthlyPriceEGP)} a month, whatever the student limit.`;
    }
    if (plan === 'ManagerialPlus') {
      return `Managerial + Parents is a flat ${this.egp(rates.managerialPlusMonthlyPriceEGP)} a month, whatever the student limit.`;
    }

    const seats =
      this.asLimit(this.activateForm.controls.linkedStudentCapacity.value) ??
      this.currentLinkedCapacity();
    if (!seats || !rates.pricePerStudentEGP) return null;

    return `${seats} app accounts × ${this.egp(rates.pricePerStudentEGP)} = ${this.egp(
      seats * rates.pricePerStudentEGP,
    )} a month.`;
  }

  private egp(amount: number): string {
    return `${Math.round(amount).toLocaleString('en-GB')} EGP`;
  }

  // ── Changing the limits on a subscription that is already running ─────────────

  /**
   * The Set button is dead until the number would actually change something, and
   * the hint under the box says why. The server rejects an equal-or-lower value on
   * this endpoint by design (raising capacity is a billing event with an audit row
   * and a notification; lowering it is not a thing an admin does by typing), so
   * refusing it here means the admin reads the rule instead of a 400.
   */
  protected canRaiseStudents(): boolean {
    const n = this.asLimit(this.liveStudentCapacity.value);
    return n !== null && n > this.currentStudentCapacity();
  }

  /** Up or down, but not to the number it already is. */
  protected canSetLinked(): boolean {
    const raw = (this.liveLinkedCapacity.value ?? '').trim();
    if (!raw) return false;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && Math.floor(n) !== this.currentLinkedCapacity();
  }

  protected raiseStudentCapacity(): void {
    const n = this.asLimit(this.liveStudentCapacity.value);
    if (n === null || !this.canRaiseStudents() || this.savingStudents()) return;

    this.savingStudents.set(true);
    this.teachers.adjustTeacherCapacity(this.teacherId, { newCapacity: n }).subscribe({
      next: () => {
        this.savingStudents.set(false);
        this.liveStudentCapacity.setValue('');
        // The echoed row is a capacity-request audit record, not the teacher — re-read
        // the profile so every "Now N" on the screen comes from one source.
        this.refreshProfile();
        this.toast.success(`Students on the account raised to ${n}.`);
      },
      error: () => this.savingStudents.set(false),
    });
  }

  protected setLinkedCapacity(): void {
    const raw = (this.liveLinkedCapacity.value ?? '').trim();
    const n = Math.floor(Number(raw));
    if (!this.canSetLinked() || this.savingLinked()) return;

    this.savingLinked.set(true);
    this.subscriptionService
      .setLinkedStudentCapacity(this.teacherId, { newCapacity: n })
      .subscribe({
        next: () => {
          this.savingLinked.set(false);
          this.liveLinkedCapacity.setValue('');
          this.refreshProfile();
          this.toast.success(
            `Student app accounts set to ${n}. The next renewal is priced on it.`,
          );
        },
        error: () => this.savingLinked.set(false),
      });
  }

  /**
   * What this teacher's plan costs a month at the limits they are on RIGHT NOW,
   * moved to what is typed in the boxes. Distinct from priceLine(), which prices the
   * activation form; this one follows the live plan rather than a radio button.
   */
  protected livePriceLine(sub: TeacherSubscriptionDto): string | null {
    const rates = this.pricing();
    if (!rates) return null;

    if (sub.planType === 'Managerial') {
      return `Managerial is a flat ${this.egp(rates.managerialMonthlyPriceEGP)} a month, whatever the student limit.`;
    }
    if (sub.planType === 'ManagerialPlus') {
      return `Managerial + Parents is a flat ${this.egp(rates.managerialPlusMonthlyPriceEGP)} a month, whatever the student limit.`;
    }

    const typed = (this.liveLinkedCapacity.value ?? '').trim();
    const seats =
      typed && Number.isFinite(Number(typed))
        ? Math.floor(Number(typed))
        : this.currentLinkedCapacity();
    if (!seats || !rates.pricePerStudentEGP) return null;

    const total = this.egp(seats * rates.pricePerStudentEGP);
    return typed && Math.floor(Number(typed)) !== this.currentLinkedCapacity()
      ? `${seats} app accounts × ${this.egp(rates.pricePerStudentEGP)} = ${total} a month once set.`
      : `${seats} app accounts × ${this.egp(rates.pricePerStudentEGP)} = ${total} a month.`;
  }

  private refreshProfile(): void {
    this.teachers.getTeacherById(this.teacherId).subscribe({
      next: (p) => this.profile.set(p),
      error: () => {},
    });
  }

  private load(): void {
    this.loadState.set('loading');
    this.subscriptionService.getByTeacher(this.teacherId).subscribe({
      next: (sub) => {
        this.subscription.set(sub);
        this.subscriptionId = sub?.id ?? null;
        this.loadState.set('loaded');
      },
      error: () => this.loadState.set('failed'),
    });

    // Both are for the activate form only, so neither blocks the panel: without them
    // the boxes still work, they just cannot say what they are replacing or what it costs.
    this.teachers.getTeacherById(this.teacherId).subscribe({
      next: (p) => this.profile.set(p),
      error: () => this.profile.set(null),
    });
    this.subscriptionService.getPricing().subscribe({
      next: (r) => this.pricing.set(r),
      error: () => this.pricing.set(null),
    });
  }

  protected retry(): void {
    this.load();
  }

  /** Treats the date-input value (yyyy-MM-dd) as a UTC instant. */
  private toUtc(dateInput: string): string {
    return new Date(`${dateInput}T00:00:00Z`).toISOString();
  }
}
