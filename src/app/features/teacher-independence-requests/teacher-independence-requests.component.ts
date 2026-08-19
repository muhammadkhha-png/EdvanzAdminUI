import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { IndependenceRequestQueueItem } from '../../core/models/center.model';
import { CenterService } from '../../core/services/center.service';
import { ToastService } from '../../core/services/toast.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

const REJECTION_REASON_MAX = 500;

/**
 * SuperAdmin "Teacher Independence Requests" queue — a center-owned teacher's
 * request to leave their center and become a standalone teacher. Approve DETACHES
 * the teacher from the center (clears CenterId + the center-plan/revenue overrides);
 * the teacher keeps their login and data and subscribes on their own afterwards.
 * GET /api/admin/centers/independence-requests returns a BARE ARRAY (no pagination).
 */
@Component({
  selector: 'app-teacher-independence-requests',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, EmptyStateComponent],
  templateUrl: 'teacher-independence-requests.component.html',
  styleUrl: 'teacher-independence-requests.component.css',
})
export class TeacherIndependenceRequestsComponent implements OnInit {
  private readonly centerService = inject(CenterService);
  private readonly toast = inject(ToastService);

  protected readonly reasonMax = REJECTION_REASON_MAX;

  protected readonly requests = signal<IndependenceRequestQueueItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);
  protected readonly isEmpty = computed(() => this.loaded() && this.requests().length === 0);

  // ── Approve (confirm — detach) ──────────────────────────────────────────────
  protected readonly approveTarget = signal<IndependenceRequestQueueItem | null>(null);
  protected readonly approveSubmitting = signal(false);

  // ── Reject modal ────────────────────────────────────────────────────────────
  protected readonly rejectTarget = signal<IndependenceRequestQueueItem | null>(null);
  protected readonly rejectSubmitting = signal(false);
  protected readonly rejectReason = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.maxLength(REJECTION_REASON_MAX)],
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.centerService.getIndependenceRequests().subscribe({
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

  // ── Approve ───────────────────────────────────────────────────────────────

  protected startApprove(item: IndependenceRequestQueueItem): void {
    this.approveTarget.set(item);
  }

  protected closeApprove(): void {
    if (this.approveSubmitting()) return;
    this.approveTarget.set(null);
  }

  protected submitApprove(): void {
    const target = this.approveTarget();
    if (!target) return;
    this.approveSubmitting.set(true);
    this.centerService.approveIndependenceRequest(target.requestId).subscribe({
      next: () => {
        this.approveSubmitting.set(false);
        this.approveTarget.set(null);
        this.toast.success(`${target.teacherName} is now an independent teacher.`);
        this.load();
      },
      error: () => this.approveSubmitting.set(false),
    });
  }

  // ── Reject ────────────────────────────────────────────────────────────────

  protected openReject(item: IndependenceRequestQueueItem): void {
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
    this.centerService
      .rejectIndependenceRequest(target.requestId, this.rejectReason.value.trim())
      .subscribe({
        next: () => {
          this.rejectSubmitting.set(false);
          this.rejectTarget.set(null);
          this.toast.success(`Request from ${target.teacherName} rejected.`);
          this.load();
        },
        error: () => this.rejectSubmitting.set(false),
      });
  }
}
