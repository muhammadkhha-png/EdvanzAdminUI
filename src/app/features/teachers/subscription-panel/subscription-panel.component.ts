import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { CurrentSubscriptionDto } from '../../../core/models/subscription.model';
import { TeacherSubscriptionDto } from '../../../core/models/teacher.model';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { ToastService } from '../../../core/services/toast.service';
import { SubscriptionStatusBadgeComponent } from './subscription-status-badge.component';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.service';

/**
 * Subscription tab for one teacher. Every mutation returns the fresh
 * subscription from the server, so `remainingDays`, `status` and `planType`
 * are never recomputed client-side — the backend stays the single source of truth.
 *
 * Supports the two subscription TYPES:
 *   - Full       — students & parents can be linked.
 *   - Managerial — no students or parents can be linked while active. When
 *                  activating/converting to Managerial the admin chooses whether to
 *                  also remove students/parents already linked (removeExistingLinks),
 *                  or keep them (only new links are blocked).
 */
@Component({
  selector: 'app-subscription-panel',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, SubscriptionStatusBadgeComponent],
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
              <span class="plan-badge" [class.managerial]="isManagerial(sub)">
                {{ isManagerial(sub) ? 'Managerial' : 'Full' }}
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

          @if (isManagerial(sub) && (sub.subscriptionStatus === 'Active' || sub.subscriptionStatus === 'ExpiringSoon')) {
            <div class="managerial-note">
              Managerial subscription — students &amp; parents cannot be linked to this teacher.
            </div>
          }
        </div>

        <div class="col-lg-7">
          <div class="actions">
            @if (sub.subscriptionStatus === 'Pending' || sub.subscriptionStatus === 'Cancelled' || sub.subscriptionStatus === 'Expired') {
              <form [formGroup]="activateForm" (ngSubmit)="activate()" class="action-card">
                <h6>Activate subscription</h6>

                <div class="mb-2">
                  <label class="form-label d-block mb-1">Subscription type</label>
                  <div class="btn-group btn-group-sm w-100" role="group">
                    <input type="radio" class="btn-check" formControlName="planType" value="Full" id="pt-full" />
                    <label class="btn btn-outline-primary" for="pt-full">Full</label>
                    <input type="radio" class="btn-check" formControlName="planType" value="Managerial" id="pt-mgr" />
                    <label class="btn btn-outline-primary" for="pt-mgr">Managerial</label>
                  </div>
                  <p class="text-muted small mt-1 mb-0">
                    @if (activateForm.controls.planType.value === 'Managerial') {
                      Managerial: no students or parents can be linked to this teacher.
                    } @else {
                      Full: students and parents can be linked normally.
                    }
                  </p>
                </div>

                <div class="row g-2">
                  <div class="col-sm-6">
                    <label class="form-label">Start date</label>
                    <input type="date" class="form-control" formControlName="startDate" />
                  </div>
                  <div class="col-sm-6">
                    <label class="form-label">End date</label>
                    <input type="date" class="form-control" formControlName="endDate" />
                  </div>
                </div>

                @if (activateForm.controls.planType.value === 'Managerial') {
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
                  {{ activateForm.controls.planType.value === 'Managerial' ? 'Activate managerial' : 'Activate' }}
                </button>
              </form>
            }

            @if (sub.subscriptionStatus === 'Active' || sub.subscriptionStatus === 'ExpiringSoon') {
              <div class="action-card">
                <h6>Subscription type</h6>
                <p class="mb-2">
                  Current type:
                  <span class="plan-badge" [class.managerial]="isManagerial(sub)">
                    {{ isManagerial(sub) ? 'Managerial' : 'Full' }}
                  </span>
                </p>

                @if (isManagerial(sub)) {
                  <p class="text-muted small mb-2">
                    Switch back to Full so students &amp; parents can be linked again.
                    The current period is kept. (Previously removed links are not restored automatically.)
                  </p>
                  <button type="button" class="btn btn-outline-primary btn-sm" (click)="convertToFull()">
                    Switch to Full
                  </button>
                } @else {
                  <p class="text-muted small mb-2">
                    Switch to Managerial — students &amp; parents can no longer be linked.
                    The current period is kept.
                  </p>
                  <div class="form-check mb-2">
                    <input class="form-check-input" type="checkbox" [formControl]="convertRemoveLinks" id="conv-rm" />
                    <label class="form-check-label" for="conv-rm">
                      Also remove students &amp; parents already linked to this teacher
                    </label>
                  </div>
                  <button type="button" class="btn btn-outline-warning btn-sm" (click)="convertToManagerial()">
                    Switch to Managerial
                  </button>
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
    @else {
  <div class="action-card empty-state">
    <h6>No subscription yet</h6>
    <p class="text-muted small mb-3">
      This teacher has no subscription record. Create the first one below
      (manual activation — SuperAdminOverride, no payment).
    </p>
    <form [formGroup]="activateForm" (ngSubmit)="activate()">
      <div class="mb-2">
        <label class="form-label d-block mb-1">Subscription type</label>
        <div class="btn-group btn-group-sm w-100" role="group">
          <input type="radio" class="btn-check" formControlName="planType" value="Full" id="pt-full-empty" />
          <label class="btn btn-outline-primary" for="pt-full-empty">Full</label>
          <input type="radio" class="btn-check" formControlName="planType" value="Managerial" id="pt-mgr-empty" />
          <label class="btn btn-outline-primary" for="pt-mgr-empty">Managerial</label>
        </div>
        <p class="text-muted small mt-1 mb-0">
          @if (activateForm.controls.planType.value === 'Managerial') {
            Managerial: no students or parents can be linked to this teacher.
          } @else {
            Full: students and parents can be linked normally.
          }
        </p>
      </div>
      <div class="row g-2">
        <div class="col-sm-6">
          <label class="form-label">Start date</label>
          <input type="date" class="form-control" formControlName="startDate" />
        </div>
        <div class="col-sm-6">
          <label class="form-label">End date</label>
          <input type="date" class="form-control" formControlName="endDate" />
        </div>
      </div>
      @if (activateForm.controls.planType.value === 'Managerial') {
        <div class="form-check mt-2">
          <input class="form-check-input" type="checkbox" formControlName="removeExistingLinks" id="rm-links-empty" />
          <label class="form-check-label" for="rm-links-empty">
            Also remove students &amp; parents already linked
          </label>
        </div>
      }
      <p class="text-muted small mt-2 mb-2">
        Leave both dates empty to start today for 30 days.
      </p>
      <button type="submit" class="btn btn-success btn-sm" [disabled]="activateForm.invalid">
        {{ activateForm.controls.planType.value === 'Managerial' ? 'Create managerial subscription' : 'Create subscription' }}
      </button>
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
      .empty-state { max-width: 520px; }
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
    `,
  ],
})
export class SubscriptionPanelComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);

  private teacherId!: number;
  private subscriptionId: number | null = null;

  protected readonly subscription = signal<TeacherSubscriptionDto | null>(null);

  protected readonly activateForm = this.fb.nonNullable.group({
    planType: ['Full'],
    startDate: [''],
    endDate: [''],
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

  ngOnInit(): void {
    this.teacherId = +(this.route.parent!.snapshot.paramMap.get('id') ?? '0');
    this.load();
  }

  protected isManagerial(sub: TeacherSubscriptionDto): boolean {
    return sub.planType === 'Managerial';
  }

  protected activate(): void {
    const { startDate, endDate, planType, removeExistingLinks } =
      this.activateForm.getRawValue();
    const start = startDate ? this.toUtc(startDate) : null;
    const end = endDate ? this.toUtc(endDate) : null;

    if (planType === 'Managerial') {
      this.subscriptionService
        .activateManagerial({
          teacherId: this.teacherId,
          startDate: start,
          endDate: end,
          removeExistingLinks,
        })
        .subscribe((sub) => this.applyResult(sub, 'Managerial subscription activated.'));
    } else {
      this.subscriptionService
        .activate({ teacherId: this.teacherId, startDate: start, endDate: end })
        .subscribe((sub) => this.applyResult(sub, 'Subscription activated.'));
    }
  }

  /** Convert an already-active subscription to Managerial, preserving the current period. */
  protected async convertToManagerial(): Promise<void> {
    const sub = this.subscription();
    if (!sub) return;

    const remove = this.convertRemoveLinks.value;
    const confirmed = await this.confirm.open({
      title: 'Switch to managerial',
      message: remove
        ? 'This blocks any new student/parent links AND removes all students & parents already linked to this teacher. Continue?'
        : 'This blocks any new student/parent links for this teacher. Students & parents already linked are kept. Continue?',
      confirmText: 'Switch to managerial',
      cancelText: 'Keep current',
    });
    if (!confirmed) return;

    this.subscriptionService
      .activateManagerial({
        teacherId: this.teacherId,
        startDate: sub.startDate, // preserve the current period
        endDate: sub.endDate,
        removeExistingLinks: remove,
      })
      .subscribe((s) => {
        this.convertRemoveLinks.setValue(false);
        this.applyResult(s, 'Switched to managerial subscription.');
      });
  }

  /** Convert an already-active Managerial subscription back to Full, preserving the period. */
  protected async convertToFull(): Promise<void> {
    const sub = this.subscription();
    if (!sub) return;

    const confirmed = await this.confirm.open({
      title: 'Switch to full',
      message:
        'Switch this teacher back to a full subscription? Students & parents will be able to link again. Previously removed links are not restored automatically.',
      confirmText: 'Switch to full',
      cancelText: 'Keep managerial',
    });
    if (!confirmed) return;

    this.subscriptionService
      .activate({
        teacherId: this.teacherId,
        startDate: sub.startDate,
        endDate: sub.endDate,
      })
      .subscribe((s) => this.applyResult(s, 'Switched to full subscription.'));
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

  private load(): void {
    this.subscriptionService
      .getByTeacher(this.teacherId)
      .subscribe((sub) => {
        this.subscription.set(sub);
        this.subscriptionId = sub?.id ?? null;
      });
  }

  /** Treats the date-input value (yyyy-MM-dd) as a UTC instant. */
  private toUtc(dateInput: string): string {
    return new Date(`${dateInput}T00:00:00Z`).toISOString();
  }
}
