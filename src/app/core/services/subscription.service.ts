import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResult } from '../models/api-result.model';
import {
  AdminActivateManagerialRequest,
  AdminActivateRequest,
  AdminExtendRequest,
  AdminPendingQueueItem,
  AdminSetEndDateRequest,
  AdminSubscriptionRequestQueueItem,
  CancelSubscriptionRequest,
  CurrentSubscriptionDto,
  RejectSubscriptionRequestRequest,
  SubscriptionRequestDto,
} from '../models/subscription.model';
import { TeacherSubscriptionDto } from '../models/teacher.model';
import { PaginatedResponse } from '../models/paginated-response.model';

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /**
   * POST /api/admin/subscriptions/cancel
   * Immediately cancels (expires in place) the teacher's current subscription.
   */
  cancel(request: CancelSubscriptionRequest): Observable<CurrentSubscriptionDto> {
    return this.http
      .post<ApiResult<CurrentSubscriptionDto>>(
        `${this.base}/admin/subscriptions/cancel`,
        request,
      )
      .pipe(map((r) => r.data));
  }

  /**
   * GET /api/teacher/{teacherId}/subscription
   * Returns the teacher's current subscription (or null if none).
   */
  getByTeacher(teacherId: number): Observable<TeacherSubscriptionDto | null> {
    return this.http
      .get<ApiResult<TeacherSubscriptionDto | null>>(
        `${this.base}/teacher/${teacherId}/subscription`,
      )
      .pipe(map((r) => r.data));
  }

  /**
   * POST /api/admin/subscriptions/activate
   * Manually activates a FULL subscription (SuperAdminOverride, no payment).
   */
  activate(request: AdminActivateRequest): Observable<CurrentSubscriptionDto> {
    return this.http
      .post<ApiResult<CurrentSubscriptionDto>>(
        `${this.base}/admin/subscriptions/activate`,
        request,
      )
      .pipe(map((r) => r.data));
  }

  /**
   * POST /api/admin/subscriptions/activate-managerial
   * Manually activates a MANAGERIAL subscription (SuperAdminOverride, no payment):
   * while active, no student or parent account may be linked to the teacher.
   * `removeExistingLinks` true also severs students/parents already linked.
   */
  activateManagerial(
    request: AdminActivateManagerialRequest,
  ): Observable<CurrentSubscriptionDto> {
    return this.http
      .post<ApiResult<CurrentSubscriptionDto>>(
        `${this.base}/admin/subscriptions/activate-managerial`,
        request,
      )
      .pipe(map((r) => r.data));
  }

  /**
   * POST /api/admin/subscriptions/extend
   * Extends the current subscription end date by N days.
   */
  extend(request: AdminExtendRequest): Observable<CurrentSubscriptionDto> {
    return this.http
      .post<ApiResult<CurrentSubscriptionDto>>(
        `${this.base}/admin/subscriptions/extend`,
        request,
      )
      .pipe(map((r) => r.data));
  }

  /**
   * PUT /api/admin/subscriptions/end-date
   * Overrides the end date on a specific subscription row.
   */
  setEndDate(request: AdminSetEndDateRequest): Observable<CurrentSubscriptionDto> {
    return this.http
      .put<ApiResult<CurrentSubscriptionDto>>(
        `${this.base}/admin/subscriptions/end-date`,
        request,
      )
      .pipe(map((r) => r.data));
  }

  /**
   * GET /api/admin/subscriptions/pending
   * Paginated list of subscriptions awaiting SuperAdmin approval.
   */
  getPendingQueue(
    page = 1,
    pageSize = 20,
  ): Observable<PaginatedResponse<AdminPendingQueueItem[]>> {
    return this.http
      .get<ApiResult<PaginatedResponse<AdminPendingQueueItem[]>>>(
        `${this.base}/admin/subscriptions/pending`,
        { params: { page, pageSize } },
      )
      .pipe(map((r) => r.data));
  }

  /**
   * POST /api/admin/subscriptions/pending/{id}/approve
   * Approves a pending manual payment.
   */
  approvePending(pendingPaymentId: number): Observable<unknown> {
    return this.http
      .post<ApiResult<unknown>>(
        `${this.base}/admin/subscriptions/pending/${pendingPaymentId}/approve`,
        {},
      )
      .pipe(map((r) => r.data));
  }

  /**
   * GET /api/admin/subscriptions/requests
   * Paginated queue of teacher-submitted new-subscription requests awaiting
   * SuperAdmin review (Pending only, oldest first / FIFO).
   */
  getSubscriptionRequests(
    page = 1,
    pageSize = 20,
  ): Observable<PaginatedResponse<AdminSubscriptionRequestQueueItem[]>> {
    return this.http
      .get<ApiResult<PaginatedResponse<AdminSubscriptionRequestQueueItem[]>>>(
        `${this.base}/admin/subscriptions/requests`,
        { params: { page, pageSize } },
      )
      .pipe(map((r) => r.data));
  }

  /**
   * POST /api/admin/subscriptions/requests/{id}/approve
   * Approves a pending request and activates the teacher's subscription
   * (Full → capacity = requestedStudents; Managerial → managerial activation).
   * Payment is coordinated outside the app — approval only activates.
   */
  approveSubscriptionRequest(id: number): Observable<SubscriptionRequestDto> {
    return this.http
      .post<ApiResult<SubscriptionRequestDto>>(
        `${this.base}/admin/subscriptions/requests/${id}/approve`,
        {},
      )
      .pipe(map((r) => r.data));
  }

  /**
   * POST /api/admin/subscriptions/requests/{id}/reject
   * Rejects a pending request with a required reason (max 500 chars).
   */
  rejectSubscriptionRequest(
    id: number,
    rejectionReason: string,
  ): Observable<SubscriptionRequestDto> {
    const body: RejectSubscriptionRequestRequest = { rejectionReason };
    return this.http
      .post<ApiResult<SubscriptionRequestDto>>(
        `${this.base}/admin/subscriptions/requests/${id}/reject`,
        body,
      )
      .pipe(map((r) => r.data));
  }
}
