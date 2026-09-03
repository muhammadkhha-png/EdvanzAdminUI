import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  ApproveCenterSubscriptionRequestRequest,
  CenterSubscriptionPricing,
  CenterSubscriptionRequestQueueItem,
} from '../../core/models/center.model';
import { CenterService } from '../../core/services/center.service';
import { ToastService } from '../../core/services/toast.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

const REJECTION_REASON_MAX = 500;
const DEFAULT_DURATION_DAYS = 30;

/**
 * SuperAdmin "Center Subscription Requests" queue — the centers-module
 * counterpart of SubscriptionRequestsComponent (teachers). GET
 * /api/admin/center-subscriptions/requests returns a BARE ARRAY (no
 * pagination), so this loads once and renders directly — no InfiniteListStore.
 * Also hosts the per-slot pricing panel (GET/PUT
 * /api/admin/center-subscriptions/pricing) since pricing is global, not
 * per-center, and has no other natural home in the Centers area.
 */
@Component({
  selector: 'app-center-subscription-requests',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, DecimalPipe, EmptyStateComponent],
  templateUrl: 'center-subscription-requests.component.html',
  styleUrl: 'center-subscription-requests.component.css',
})
export class CenterSubscriptionRequestsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly centerService = inject(CenterService);
  private readonly toast = inject(ToastService);

  protected readonly reasonMax = REJECTION_REASON_MAX;

  protected readonly requests = signal<CenterSubscriptionRequestQueueItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);
  protected readonly isEmpty = computed(() => this.loaded() && this.requests().length === 0);

  // ── Pricing panel ─────────────────────────────────────────────────────────
  protected readonly pricingLoaded = signal(false);
  protected readonly pricingSaving = signal(false);
  protected readonly pricingForm = this.fb.nonNullable.group({
    fullTeacherSlotPriceEGP: [0, [Validators.required, Validators.min(0)]],
    managerialTeacherSlotPriceEGP: [0, [Validators.required, Validators.min(0)]],
    managerialPlusTeacherSlotPriceEGP: [0, [Validators.required, Validators.min(0)]],
  });

  // ── Approve (adjustable quotas + duration) ─────────────────────────────────
  protected readonly approveTarget = signal<CenterSubscriptionRequestQueueItem | null>(null);
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

  // ── Reject modal ────────────────────────────────────────────────────────────
  protected readonly rejectTarget = signal<CenterSubscriptionRequestQueueItem | null>(null);
  protected readonly rejectSubmitting = signal(false);
  protected readonly rejectReason = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(REJECTION_REASON_MAX)],
  });

  ngOnInit(): void {
    this.load();
    this.loadPricing();
  }

  private load(): void {
    this.loading.set(true);
    this.centerService.getSubscriptionRequests().subscribe({
      next: (list) => {
        this.requests.set(list);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: () => {
        this.loading.set(false);
        this.loaded.set(true);
      },
    });
  }

  private loadPricing(): void {
    this.centerService.getPricing().subscribe({
      next: (p) => {
        this.pricingForm.patchValue(p);
        this.pricingLoaded.set(true);
      },
      error: () => this.pricingLoaded.set(true),
    });
  }

  protected savePricing(): void {
    if (this.pricingForm.invalid) {
      this.pricingForm.markAllAsTouched();
      return;
    }
    this.pricingSaving.set(true);
    const req: CenterSubscriptionPricing = this.pricingForm.getRawValue();
    this.centerService.updatePricing(req).subscribe({
      next: () => {
        this.pricingSaving.set(false);
        this.toast.success('Pricing updated.');
      },
      error: () => this.pricingSaving.set(false),
    });
  }

  // ── Approve ───────────────────────────────────────────────────────────────

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

  protected startApprove(item: CenterSubscriptionRequestQueueItem): void {
    this.approveTarget.set(item);
    this.approveForm.setValue({
      fullTeacherSlots: item.fullTeacherSlots,
      managerialTeacherSlots: item.managerialTeacherSlots,
      managerialPlusTeacherSlots: item.managerialPlusTeacherSlots,
      studentCapacityTotal: item.studentCapacityTotal,
      studentCapacityUnderFull: item.studentCapacityUnderFull,
      studentCapacityUnderManagerial: item.studentCapacityUnderManagerial,
      studentCapacityUnderManagerialPlus: item.studentCapacityUnderManagerialPlus,
      durationDays: DEFAULT_DURATION_DAYS,
      note: '',
    });
  }

  protected closeApprove(): void {
    if (this.approveSubmitting()) return;
    this.approveTarget.set(null);
  }

  protected submitApprove(): void {
    const target = this.approveTarget();
    if (!target) return;

    if (this.approveForm.invalid) {
      this.approveForm.markAllAsTouched();
      return;
    }

    this.approveSubmitting.set(true);
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

    this.centerService.approveSubscriptionRequest(target.requestId, body).subscribe({
      next: () => {
        this.approveSubmitting.set(false);
        this.approveTarget.set(null);
        this.toast.success(`Subscription activated for ${target.centerName}.`);
        this.load();
      },
      error: () => this.approveSubmitting.set(false),
    });
  }

  // ── Reject ────────────────────────────────────────────────────────────────

  protected openReject(item: CenterSubscriptionRequestQueueItem): void {
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
    this.centerService.rejectSubscriptionRequest(target.requestId, this.rejectReason.value.trim()).subscribe({
      next: () => {
        this.rejectSubmitting.set(false);
        this.rejectTarget.set(null);
        this.toast.success(`Request from ${target.centerName} rejected.`);
        this.load();
      },
      error: () => this.rejectSubmitting.set(false),
    });
  }
}
