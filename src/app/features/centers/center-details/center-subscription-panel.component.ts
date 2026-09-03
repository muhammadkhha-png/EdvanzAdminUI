import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  ActivateCenterSubscriptionRequest,
  ApproveCenterSubscriptionRequestRequest,
  CenterSubscription,
} from '../../../core/models/center.model';
import { CenterService } from '../../../core/services/center.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../core/services/toast.service';
import { SubscriptionStatusBadgeComponent } from '../../teachers/subscription-panel/subscription-status-badge.component';

const DEFAULT_DURATION_DAYS = 30;
const REJECTION_REASON_MAX = 500;

/**
 * Subscription tab for one center. A center's subscription is a QUOTA PACKAGE
 * (teacher slots + student capacity + durationDays), read from
 * GET /api/admin/center-subscriptions/{centerId} — which also carries live
 * usage counters (usedFullTeachers/usedManagerialTeachers/usedStudentsTotal)
 * and the single pending request inline (hasPendingRequest/pendingRequest),
 * so there is no separate per-center request list to fetch/filter.
 *
 * Both the activate and approve endpoints return the plain string "ok" — every
 * mutation here re-fetches `getSubscription(centerId)` afterwards rather than
 * trusting the mutation response as the fresh subscription.
 */
@Component({
  selector: 'app-center-subscription-panel',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, SubscriptionStatusBadgeComponent],
  template: `
    <div class="row g-4">
      <div class="col-lg-5">
        @if (subscription(); as sub) {
          @if (sub.hasSubscription) {
            <div class="summary">
              <div class="summary-row">
                <span class="label">Status</span>
                <app-subscription-status-badge [status]="sub.status ?? ''" />
              </div>
              <div class="summary-row">
                <span class="label">Full teacher slots</span>
                <span class="fw-semibold">{{ sub.usedFullTeachers }} / {{ sub.fullTeacherSlots }}</span>
              </div>
              <div class="summary-row">
                <span class="label">Managerial teacher slots</span>
                <span class="fw-semibold">{{ sub.usedManagerialTeachers }} / {{ sub.managerialTeacherSlots }}</span>
              </div>
              <div class="summary-row">
                <span class="label">Managerial + Parents teacher slots</span>
                <span class="fw-semibold">{{ sub.usedManagerialPlusTeachers }} / {{ sub.managerialPlusTeacherSlots }}</span>
              </div>
              <div class="summary-row">
                <span class="label">Student capacity (total)</span>
                <span class="fw-semibold">{{ sub.usedStudentsTotal }} / {{ sub.studentCapacityTotal }}</span>
              </div>
              <div class="summary-row">
                <span class="label">Student capacity — under Full</span>
                <span class="fw-semibold">{{ sub.studentCapacityUnderFull }}</span>
              </div>
              <div class="summary-row">
                <span class="label">Student capacity — under Managerial</span>
                <span class="fw-semibold">{{ sub.studentCapacityUnderManagerial }}</span>
              </div>
              <div class="summary-row">
                <span class="label">Student capacity — under Managerial + Parents</span>
                <span class="fw-semibold">{{ sub.studentCapacityUnderManagerialPlus }}</span>
              </div>
              @if (sub.endDate) {
                <div class="summary-row">
                  <span class="label">End date</span>
                  <span>{{ sub.endDate | date: 'mediumDate' }}</span>
                </div>
              }
              @if (sub.daysRemaining != null) {
                <div class="summary-row">
                  <span class="label">Remaining days</span>
                  <span class="fw-semibold">{{ sub.daysRemaining }}</span>
                </div>
              }
            </div>
          } @else {
            <div class="action-card">
              <h6>No subscription yet</h6>
              <p class="text-muted small mb-0">
                This center has no quota package yet. Activate the first one on the right.
              </p>
            </div>
          }
        }
      </div>

      <div class="col-lg-7">
        <form [formGroup]="activateForm" (ngSubmit)="activate()" class="action-card">
          <h6>{{ subscription()?.hasSubscription ? 'Activate / override quotas' : 'Activate quota package' }}</h6>
          <p class="text-muted small mb-3">
            Directly sets (or renews) this center's quota package. SuperAdmin
            override — no payment or approval step.
          </p>

          <div class="row g-2">
            <div class="col-sm-6">
              <label class="form-label">Full teacher slots</label>
              <input type="number" min="0" class="form-control" formControlName="fullTeacherSlots" />
            </div>
            <div class="col-sm-6">
              <label class="form-label">Managerial teacher slots</label>
              <input type="number" min="0" class="form-control" formControlName="managerialTeacherSlots" />
            </div>
            <div class="col-sm-6">
              <label class="form-label">Managerial + Parents teacher slots</label>
              <input type="number" min="0" class="form-control" formControlName="managerialPlusTeacherSlots" />
            </div>
            <div class="col-sm-4">
              <label class="form-label">Student capacity (total)</label>
              <input type="number" min="0" class="form-control" formControlName="studentCapacityTotal" />
            </div>
            <div class="col-sm-4">
              <label class="form-label">Under Full</label>
              <input type="number" min="0" class="form-control" formControlName="studentCapacityUnderFull" />
            </div>
            <div class="col-sm-4">
              <label class="form-label">Under Managerial</label>
              <input type="number" min="0" class="form-control" formControlName="studentCapacityUnderManagerial" />
            </div>
            <div class="col-sm-4">
              <label class="form-label">Under Managerial + Parents</label>
              <input type="number" min="0" class="form-control" formControlName="studentCapacityUnderManagerialPlus" />
            </div>
            <div class="col-sm-6">
              <label class="form-label">Duration (days)</label>
              <input type="number" min="1" class="form-control" formControlName="durationDays" />
            </div>
            <div class="col-sm-6">
              <label class="form-label">Note (optional)</label>
              <input type="text" class="form-control" formControlName="note" maxlength="300" />
            </div>
          </div>

          @if (activateMismatch()) {
            <div class="mismatch-warning mt-2">
              ⚠ The per-plan student capacities ({{ activateUnderSum() }}) don't add up to the total ({{ activateForm.controls.studentCapacityTotal.value }}). You can still save.
            </div>
          }

          <button type="submit" class="btn btn-success btn-sm mt-3" [disabled]="activateForm.invalid || activating()">
            {{ activating() ? 'Saving…' : (subscription()?.hasSubscription ? 'Save quotas' : 'Activate subscription') }}
          </button>
        </form>
      </div>
    </div>

    <hr class="my-4" />

    <h3 class="h6 mb-3">Pending subscription request</h3>
    @if (subscription(); as sub) {
      @if (sub.hasPendingRequest && sub.pendingRequest; as pending) {
        <div class="table-responsive">
          <table class="table align-middle">
            <thead>
              <tr>
                <th>Requested</th>
                <th class="text-end">Full slots</th>
                <th class="text-end">Managerial slots</th>
                <th class="text-end">Mgr + Parents slots</th>
                <th class="text-end">Capacity (total)</th>
                <th class="text-end">Amount (EGP)</th>
                <th>Note</th>
                <th class="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="text-nowrap">{{ pending.requestedAt | date: 'medium' }}</td>
                <td class="text-end">{{ pending.fullTeacherSlots }}</td>
                <td class="text-end">{{ pending.managerialTeacherSlots }}</td>
                <td class="text-end">{{ pending.managerialPlusTeacherSlots }}</td>
                <td class="text-end">{{ pending.studentCapacityTotal }}</td>
                <td class="text-end fw-medium">{{ pending.computedAmountEGP }}</td>
                <td class="note-cell text-muted">{{ pending.note || '—' }}</td>
                <td class="text-end text-nowrap">
                  <button type="button" class="btn btn-sm btn-success" (click)="openApprove()">Approve</button>
                  <button type="button" class="btn btn-sm btn-outline-danger ms-1" (click)="openReject()">Reject</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      } @else {
        <p class="text-muted small">No pending quota request for this center.</p>
      }
    }

    @if (approveOpen()) {
      <div class="rj-backdrop" (click)="closeApprove()"></div>
      <div class="rj-modal" role="dialog" aria-modal="true">
        <h5 class="rj-title">Approve request</h5>
        <p class="rj-message">
          Adjust the quotas if needed, then confirm to activate. Payment is
          coordinated separately — approving only activates the quotas.
        </p>

        <form [formGroup]="approveForm" (ngSubmit)="confirmApprove()" novalidate>
          <div class="row g-2">
            <div class="col-sm-6">
              <label class="form-label">Full teacher slots</label>
              <input type="number" min="0" class="form-control" formControlName="fullTeacherSlots" />
            </div>
            <div class="col-sm-6">
              <label class="form-label">Managerial teacher slots</label>
              <input type="number" min="0" class="form-control" formControlName="managerialTeacherSlots" />
            </div>
            <div class="col-sm-6">
              <label class="form-label">Managerial + Parents teacher slots</label>
              <input type="number" min="0" class="form-control" formControlName="managerialPlusTeacherSlots" />
            </div>
            <div class="col-sm-4">
              <label class="form-label">Capacity (total)</label>
              <input type="number" min="0" class="form-control" formControlName="studentCapacityTotal" />
            </div>
            <div class="col-sm-4">
              <label class="form-label">Under Full</label>
              <input type="number" min="0" class="form-control" formControlName="studentCapacityUnderFull" />
            </div>
            <div class="col-sm-4">
              <label class="form-label">Under Managerial</label>
              <input type="number" min="0" class="form-control" formControlName="studentCapacityUnderManagerial" />
            </div>
            <div class="col-sm-4">
              <label class="form-label">Under Managerial + Parents</label>
              <input type="number" min="0" class="form-control" formControlName="studentCapacityUnderManagerialPlus" />
            </div>
            <div class="col-sm-6">
              <label class="form-label">Duration (days)</label>
              <input type="number" min="1" class="form-control" formControlName="durationDays" />
            </div>
            <div class="col-sm-6">
              <label class="form-label">Note (optional)</label>
              <input type="text" class="form-control" formControlName="note" maxlength="300" />
            </div>
          </div>

          @if (approveMismatch()) {
            <div class="mismatch-warning mt-2">
              ⚠ The per-plan student capacities ({{ approveUnderSum() }}) don't add up to the total ({{ approveForm.controls.studentCapacityTotal.value }}). You can still approve.
            </div>
          }

          <div class="rj-actions">
            <button type="button" class="btn btn-outline-secondary" [disabled]="approveSubmitting()" (click)="closeApprove()">Cancel</button>
            <button type="submit" class="btn btn-success" [disabled]="approveForm.invalid || approveSubmitting()">
              {{ approveSubmitting() ? 'Approving…' : 'Approve & activate' }}
            </button>
          </div>
        </form>
      </div>
    }

    @if (rejectOpen()) {
      <div class="rj-backdrop" (click)="closeReject()"></div>
      <div class="rj-modal" role="dialog" aria-modal="true">
        <h5 class="rj-title">Reject quota request</h5>
        <p class="rj-message">
          This reason is shown to the center, so keep it clear.
        </p>

        <form (ngSubmit)="submitReject()" novalidate>
          <div class="mb-2">
            <label class="form-label" for="rejectReason">Rejection reason</label>
            <textarea
              id="rejectReason"
              class="form-control"
              rows="3"
              [formControl]="rejectReason"
              [maxlength]="reasonMax"
              [class.is-invalid]="isReasonInvalid()"
              placeholder="Why is this request being rejected?"
            ></textarea>
            @if (isReasonInvalid() && rejectReason.errors?.['required']) {
              <div class="invalid-feedback d-block">A reason is required.</div>
            } @else if (isReasonInvalid() && rejectReason.errors?.['maxlength']) {
              <div class="invalid-feedback d-block">Reason must be {{ reasonMax }} characters or fewer.</div>
            }
          </div>

          <div class="rj-actions">
            <button type="button" class="btn btn-outline-secondary" [disabled]="rejectSubmitting()" (click)="closeReject()">Cancel</button>
            <button type="submit" class="btn btn-danger" [disabled]="rejectSubmitting()">
              {{ rejectSubmitting() ? 'Rejecting…' : 'Reject request' }}
            </button>
          </div>
        </form>
      </div>
    }
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
      .summary-row:last-child {
        border-bottom: none;
      }
      .label {
        color: var(--edvanz-muted, #6b7280);
        font-size: 0.9rem;
      }
      .action-card {
        border: 1px solid var(--edvanz-border, #e5e7eb);
        border-radius: 12px;
        padding: 1rem 1.25rem;
      }
      .action-card h6 {
        margin-bottom: 0.25rem;
      }
      .mismatch-warning {
        font-size: 0.825rem;
        color: #92400e;
        background: #fffbeb;
        border: 1px solid #fcd34d;
        border-radius: 8px;
        padding: 0.5rem 0.75rem;
      }
      .note-cell {
        max-width: 240px;
        white-space: normal;
        word-break: break-word;
      }
      .rj-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.45);
        z-index: 1085;
      }
      .rj-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #fff;
        border-radius: 14px;
        padding: 1.5rem;
        width: min(520px, 92vw);
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
        z-index: 1086;
      }
      .rj-title {
        margin: 0 0 0.5rem;
        font-weight: 600;
      }
      .rj-message {
        color: var(--edvanz-muted, #6b7280);
        margin-bottom: 1.25rem;
      }
      .rj-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 1rem;
      }
    `,
  ],
})
export class CenterSubscriptionPanelComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly centerService = inject(CenterService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);

  private centerId!: number;

  protected readonly reasonMax = REJECTION_REASON_MAX;
  protected readonly subscription = signal<CenterSubscription | null>(null);
  protected readonly activating = signal(false);

  protected readonly activateForm = this.fb.nonNullable.group({
    fullTeacherSlots: [0, [Validators.required, Validators.min(0)]],
    managerialTeacherSlots: [0, [Validators.required, Validators.min(0)]],
    managerialPlusTeacherSlots: [0, [Validators.required, Validators.min(0)]],
    studentCapacityTotal: [0, [Validators.required, Validators.min(0)]],
    studentCapacityUnderFull: [0, [Validators.required, Validators.min(0)]],
    studentCapacityUnderManagerial: [0, [Validators.required, Validators.min(0)]],
    studentCapacityUnderManagerialPlus: [0, [Validators.required, Validators.min(0)]],
    durationDays: [DEFAULT_DURATION_DAYS, [Validators.required, Validators.min(1)]],
    note: [''],
  });

  // ── Pending request (single row — read straight off the subscription payload) ──
  protected readonly approveOpen = signal(false);
  protected readonly approveSubmitting = signal(false);
  protected readonly approveForm = this.fb.nonNullable.group({
    fullTeacherSlots: [0, [Validators.required, Validators.min(0)]],
    managerialTeacherSlots: [0, [Validators.required, Validators.min(0)]],
    managerialPlusTeacherSlots: [0, [Validators.required, Validators.min(0)]],
    studentCapacityTotal: [0, [Validators.required, Validators.min(0)]],
    studentCapacityUnderFull: [0, [Validators.required, Validators.min(0)]],
    studentCapacityUnderManagerial: [0, [Validators.required, Validators.min(0)]],
    studentCapacityUnderManagerialPlus: [0, [Validators.required, Validators.min(0)]],
    durationDays: [DEFAULT_DURATION_DAYS, [Validators.required, Validators.min(1)]],
    note: [''],
  });

  protected readonly rejectOpen = signal(false);
  protected readonly rejectSubmitting = signal(false);
  protected readonly rejectReason = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(REJECTION_REASON_MAX)],
  });

  ngOnInit(): void {
    this.centerId = +(this.route.parent!.snapshot.paramMap.get('id') ?? '0');
    this.load();
  }

  private load(): void {
    this.centerService.getSubscription(this.centerId).subscribe({
      next: (sub) => {
        this.subscription.set(sub);
        if (sub.hasSubscription) {
          this.activateForm.patchValue({
            fullTeacherSlots: sub.fullTeacherSlots,
            managerialTeacherSlots: sub.managerialTeacherSlots,
            managerialPlusTeacherSlots: sub.managerialPlusTeacherSlots,
            studentCapacityTotal: sub.studentCapacityTotal,
            studentCapacityUnderFull: sub.studentCapacityUnderFull,
            studentCapacityUnderManagerial: sub.studentCapacityUnderManagerial,
            studentCapacityUnderManagerialPlus: sub.studentCapacityUnderManagerialPlus,
          });
        }
      },
      error: () => this.subscription.set(null),
    });
  }

  // ── Activate / override ──────────────────────────────────────────────────────

  protected activateUnderSum(): number {
    const v = this.activateForm.getRawValue();
    return (
      v.studentCapacityUnderFull +
      v.studentCapacityUnderManagerial +
      v.studentCapacityUnderManagerialPlus
    );
  }

  protected activateMismatch(): boolean {
    const v = this.activateForm.getRawValue();
    return this.activateUnderSum() !== v.studentCapacityTotal;
  }

  protected activate(): void {
    if (this.activateForm.invalid) {
      this.activateForm.markAllAsTouched();
      return;
    }
    this.activating.set(true);
    const raw = this.activateForm.getRawValue();

    const req: ActivateCenterSubscriptionRequest = {
      centerId: this.centerId,
      fullTeacherSlots: raw.fullTeacherSlots,
      managerialTeacherSlots: raw.managerialTeacherSlots,
      managerialPlusTeacherSlots: raw.managerialPlusTeacherSlots,
      studentCapacityTotal: raw.studentCapacityTotal,
      studentCapacityUnderFull: raw.studentCapacityUnderFull,
      studentCapacityUnderManagerial: raw.studentCapacityUnderManagerial,
      studentCapacityUnderManagerialPlus: raw.studentCapacityUnderManagerialPlus,
      durationDays: raw.durationDays,
      note: raw.note.trim() || undefined,
    };

    this.centerService.activateSubscription(req).subscribe({
      next: () => {
        // Response data is just "ok" — re-fetch the real subscription.
        this.activating.set(false);
        this.toast.success('Center subscription updated.');
        this.load();
      },
      error: () => this.activating.set(false),
    });
  }

  // ── Approve (adjustable quotas) ──────────────────────────────────────────────

  protected approveUnderSum(): number {
    const v = this.approveForm.getRawValue();
    return (
      v.studentCapacityUnderFull +
      v.studentCapacityUnderManagerial +
      v.studentCapacityUnderManagerialPlus
    );
  }

  protected approveMismatch(): boolean {
    const v = this.approveForm.getRawValue();
    return this.approveUnderSum() !== v.studentCapacityTotal;
  }

  protected openApprove(): void {
    const pending = this.subscription()?.pendingRequest;
    if (!pending) return;
    this.approveForm.setValue({
      fullTeacherSlots: pending.fullTeacherSlots,
      managerialTeacherSlots: pending.managerialTeacherSlots,
      managerialPlusTeacherSlots: pending.managerialPlusTeacherSlots,
      studentCapacityTotal: pending.studentCapacityTotal,
      studentCapacityUnderFull: pending.studentCapacityUnderFull,
      studentCapacityUnderManagerial: pending.studentCapacityUnderManagerial,
      studentCapacityUnderManagerialPlus: pending.studentCapacityUnderManagerialPlus,
      durationDays: DEFAULT_DURATION_DAYS,
      note: '',
    });
    this.approveOpen.set(true);
  }

  protected closeApprove(): void {
    if (this.approveSubmitting()) return;
    this.approveOpen.set(false);
  }

  protected async confirmApprove(): Promise<void> {
    const pending = this.subscription()?.pendingRequest;
    if (!pending) return;

    if (this.approveForm.invalid) {
      this.approveForm.markAllAsTouched();
      return;
    }

    const ok = await this.confirm.open({
      title: 'Approve subscription request',
      message: `Activate this quota package for this center? Payment (${pending.computedAmountEGP} EGP) is coordinated separately — approving only activates the quotas.`,
      confirmText: 'Approve & activate',
      cancelText: 'Cancel',
    });
    if (!ok) return;

    const raw = this.approveForm.getRawValue();
    const body: ApproveCenterSubscriptionRequestRequest = {
      fullTeacherSlots: raw.fullTeacherSlots,
      managerialTeacherSlots: raw.managerialTeacherSlots,
      managerialPlusTeacherSlots: raw.managerialPlusTeacherSlots,
      studentCapacityTotal: raw.studentCapacityTotal,
      studentCapacityUnderFull: raw.studentCapacityUnderFull,
      studentCapacityUnderManagerial: raw.studentCapacityUnderManagerial,
      studentCapacityUnderManagerialPlus: raw.studentCapacityUnderManagerialPlus,
      durationDays: raw.durationDays,
      note: raw.note.trim() || undefined,
    };

    this.approveSubmitting.set(true);
    this.centerService.approveSubscriptionRequest(pending.requestId, body).subscribe({
      next: () => {
        this.approveSubmitting.set(false);
        this.approveOpen.set(false);
        this.toast.success('Subscription activated.');
        this.load();
      },
      error: () => this.approveSubmitting.set(false),
    });
  }

  // ── Reject ────────────────────────────────────────────────────────────────

  protected openReject(): void {
    this.rejectReason.reset('');
    this.rejectOpen.set(true);
  }

  protected closeReject(): void {
    if (this.rejectSubmitting()) return;
    this.rejectOpen.set(false);
  }

  protected isReasonInvalid(): boolean {
    const c = this.rejectReason;
    return c.invalid && (c.touched || c.dirty);
  }

  protected submitReject(): void {
    const pending = this.subscription()?.pendingRequest;
    if (!pending) return;

    if (this.rejectReason.invalid) {
      this.rejectReason.markAsTouched();
      return;
    }

    this.rejectSubmitting.set(true);
    this.centerService.rejectSubscriptionRequest(pending.requestId, this.rejectReason.value.trim()).subscribe({
      next: () => {
        this.rejectSubmitting.set(false);
        this.rejectOpen.set(false);
        this.toast.success('Request rejected.');
        this.load();
      },
      error: () => this.rejectSubmitting.set(false),
    });
  }
}
