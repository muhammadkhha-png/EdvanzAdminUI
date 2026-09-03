import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  AdminSubscriptionRequestQueueItem,
  planTypeLabel,
} from '../../core/models/subscription.model';
import { SubscriptionService } from '../../core/services/subscription.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { InfiniteScrollDirective } from '../../shared/directives/infinite-scroll.directive';
import { InfiniteListStore } from '../../shared/utils/infinite-list-store';

const DEFAULT_PAGE_SIZE = 20;
const REJECTION_REASON_MAX = 500;

/**
 * SuperAdmin "Subscription Requests" queue. Lists teacher-submitted
 * new-subscription requests (Pending only, FIFO) and lets an admin approve
 * (activates the teacher's subscription — payment is coordinated off-app) or
 * reject with a required reason. Mirrors the teacher-list queue conventions:
 * signal-backed PaginatedResponse, ConfirmDialogService for approve, an inline
 * reason modal for reject (like the force-reset-password modal), ToastService
 * for success (HTTP errors are toasted by the global errorInterceptor), and a
 * list refresh after every action.
 */
@Component({
  selector: 'app-subscription-requests',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DatePipe,
    DecimalPipe,
    EmptyStateComponent,
    InfiniteScrollDirective,
  ],
  templateUrl: 'subscription-requests.component.html',
  styleUrl: 'subscription-requests.component.css',
})
export class SubscriptionRequestsComponent implements OnInit {
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);

  /** Template-visible plan display label — the wire value is never shown raw. */
  protected readonly planLabel = planTypeLabel;

  protected readonly reasonMax = REJECTION_REASON_MAX;

  /** Infinite-scroll list state: accumulates pages, appends on scroll. */
  protected readonly store = new InfiniteListStore<AdminSubscriptionRequestQueueItem>(
    DEFAULT_PAGE_SIZE,
    (page, pageSize) =>
      this.subscriptionService.getSubscriptionRequests(page, pageSize),
  );

  // ── Reject modal (prompts for the required rejection reason) ────────────────
  protected readonly rejectTarget =
    signal<AdminSubscriptionRequestQueueItem | null>(null);
  protected readonly rejectSubmitting = signal(false);
  protected readonly rejectReason = new FormControl<string>('', {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.maxLength(REJECTION_REASON_MAX),
    ],
  });

  ngOnInit(): void {
    this.store.reset();
  }

  protected async approve(
    item: AdminSubscriptionRequestQueueItem,
  ): Promise<void> {
    const plan =
      item.planType === 'Full'
        ? `a Full subscription (capacity ${item.requestedStudents} students)`
        : `a ${planTypeLabel(item.planType)} subscription`;
    const ok = await this.confirm.open({
      title: 'Approve subscription request',
      message: `Activate ${plan} for ${item.teacherName} (${item.teacherCode})? Payment (${item.computedAmountEGP} EGP) is coordinated separately — approving only activates the subscription.`,
      confirmText: 'Approve & activate',
      cancelText: 'Cancel',
    });
    if (!ok) return;

    this.subscriptionService.approveSubscriptionRequest(item.id).subscribe(() => {
      this.toast.success(
        `Subscription activated for ${item.teacherName}.`,
      );
      this.store.reset();
    });
  }

  protected openReject(item: AdminSubscriptionRequestQueueItem): void {
    this.rejectReason.reset('');
    this.rejectTarget.set(item);
  }

  protected closeReject(): void {
    if (this.rejectSubmitting()) return;
    this.rejectTarget.set(null);
  }

  protected isReasonInvalid(): boolean {
    const c = this.rejectReason;
    return c.invalid && (c.touched || c.dirty);
  }

  protected submitReject(): void {
    const target = this.rejectTarget();
    if (!target) return;

    if (this.rejectReason.invalid) {
      this.rejectReason.markAsTouched();
      return;
    }

    this.rejectSubmitting.set(true);
    this.subscriptionService
      .rejectSubscriptionRequest(target.id, this.rejectReason.value.trim())
      .subscribe({
        next: () => {
          this.rejectSubmitting.set(false);
          this.rejectTarget.set(null);
          this.toast.success(
            `Request from ${target.teacherName} rejected.`,
          );
          this.store.reset();
        },
        error: () => {
          // HTTP error already toasted by the global errorInterceptor
          // (400 reason required, 404 not found, 409 not pending).
          // Keep the modal open so the admin can correct and retry.
          this.rejectSubmitting.set(false);
        },
      });
  }

}
