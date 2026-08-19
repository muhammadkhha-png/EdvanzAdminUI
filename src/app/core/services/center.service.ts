import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { skipGlobalLoading } from '../interceptors/loading-context';
import { ApiResult } from '../models/api-result.model';
import {
  ActivateCenterSubscriptionRequest,
  ApproveCenterSubscriptionRequestRequest,
  CenterListItem,
  CenterSubscription,
  CenterSubscriptionPricing,
  CenterSubscriptionRequestQueueItem,
  CenterTeacherListItem,
  CreateCenterRequest,
  IndependenceRequestQueueItem,
} from '../models/center.model';

/**
 * SuperAdmin "Centers" area. A Center is an account tier that owns several
 * Teachers; this portal creates/manages centers and approves/overrides their
 * subscription (a quota package: teacher slots + student capacity). Every
 * list endpoint here returns a BARE ARRAY (no pagination) per the
 * authoritative contract — do not reintroduce PaginatedResponse/page params.
 */
@Injectable({ providedIn: 'root' })
export class CenterService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  // ── Centers CRUD ─────────────────────────────────────────────────────────

  /** GET /api/admin/centers — bare array, no pagination. */
  getCenters(): Observable<CenterListItem[]> {
    return this.http
      .get<ApiResult<CenterListItem[]>>(`${this.base}/admin/centers`, {
        context: skipGlobalLoading(),
      })
      .pipe(map((r) => r.data ?? []));
  }

  /** GET /api/admin/centers/{id} — the same summary shape as the list row. */
  getCenterById(centerId: number): Observable<CenterListItem> {
    return this.http
      .get<ApiResult<CenterListItem>>(`${this.base}/admin/centers/${centerId}`)
      .pipe(map((r) => r.data));
  }

  /** GET /api/admin/centers/{id}/teachers — bare array, no pagination. */
  getTeachers(centerId: number): Observable<CenterTeacherListItem[]> {
    return this.http
      .get<ApiResult<CenterTeacherListItem[]>>(`${this.base}/admin/centers/${centerId}/teachers`)
      .pipe(map((r) => r.data ?? []));
  }

  /**
   * POST /api/admin/centers — creates the center login + Center row + auto
   * 8-digit centerCode. Returns the raw envelope (not unwrapped) so the caller
   * can read `message` for the success toast, matching TeacherService.createTeacher.
   */
  createCenter(req: CreateCenterRequest): Observable<ApiResult<CenterListItem>> {
    return this.http.post<ApiResult<CenterListItem>>(`${this.base}/admin/centers`, req);
  }

  /** POST /api/admin/centers/{id}/deactivate — data is "ok". */
  deactivateCenter(centerId: number): Observable<string | null> {
    return this.http
      .post<ApiResult<string | null>>(`${this.base}/admin/centers/${centerId}/deactivate`, {})
      .pipe(map((r) => r.data));
  }

  /** POST /api/admin/centers/{id}/activate — data is "ok". */
  activateCenter(centerId: number): Observable<string | null> {
    return this.http
      .post<ApiResult<string | null>>(`${this.base}/admin/centers/${centerId}/activate`, {})
      .pipe(map((r) => r.data));
  }

  // ── Center subscription (quota package) ────────────────────────────────────

  /** GET /api/admin/center-subscriptions/{centerId} — current quota + live usage + pending request. */
  getSubscription(centerId: number): Observable<CenterSubscription> {
    return this.http
      .get<ApiResult<CenterSubscription>>(`${this.base}/admin/center-subscriptions/${centerId}`)
      .pipe(map((r) => r.data));
  }

  /**
   * POST /api/admin/center-subscriptions/activate — activates/renews/overrides
   * the center's quota package directly (SuperAdmin override, no payment).
   * Response data is the plain string "ok" — callers must re-fetch
   * `getSubscription(centerId)` for the fresh state.
   */
  activateSubscription(req: ActivateCenterSubscriptionRequest): Observable<string | null> {
    return this.http
      .post<ApiResult<string | null>>(`${this.base}/admin/center-subscriptions/activate`, req)
      .pipe(map((r) => r.data));
  }

  /** GET /api/admin/center-subscriptions/requests — bare array, no pagination. */
  getSubscriptionRequests(): Observable<CenterSubscriptionRequestQueueItem[]> {
    return this.http
      .get<ApiResult<CenterSubscriptionRequestQueueItem[]>>(
        `${this.base}/admin/center-subscriptions/requests`,
        { context: skipGlobalLoading() },
      )
      .pipe(map((r) => r.data ?? []));
  }

  /**
   * POST /api/admin/center-subscriptions/requests/{requestId}/approve — approve
   * accepts (or admin-adjusts) the requested quota numbers + durationDays.
   * Response data is "ok" — re-fetch `getSubscription(centerId)` afterwards.
   */
  approveSubscriptionRequest(
    requestId: number,
    req: ApproveCenterSubscriptionRequestRequest,
  ): Observable<string | null> {
    return this.http
      .post<ApiResult<string | null>>(
        `${this.base}/admin/center-subscriptions/requests/${requestId}/approve`,
        req,
      )
      .pipe(map((r) => r.data));
  }

  /** POST /api/admin/center-subscriptions/requests/{requestId}/reject — reason required. */
  rejectSubscriptionRequest(requestId: number, rejectionReason: string): Observable<string | null> {
    return this.http
      .post<ApiResult<string | null>>(
        `${this.base}/admin/center-subscriptions/requests/${requestId}/reject`,
        { rejectionReason },
      )
      .pipe(map((r) => r.data));
  }

  // ── Teacher independence requests (leave-the-center queue) ───────────────────

  /** GET /api/admin/centers/independence-requests — bare array, no pagination. */
  getIndependenceRequests(): Observable<IndependenceRequestQueueItem[]> {
    return this.http
      .get<ApiResult<IndependenceRequestQueueItem[]>>(
        `${this.base}/admin/centers/independence-requests`,
        { context: skipGlobalLoading() },
      )
      .pipe(map((r) => r.data ?? []));
  }

  /**
   * POST /api/admin/centers/independence-requests/{requestId}/approve — approve
   * DETACHES the teacher from the center (they become a standalone teacher).
   * Response data is "ok".
   */
  approveIndependenceRequest(requestId: number): Observable<string | null> {
    return this.http
      .post<ApiResult<string | null>>(
        `${this.base}/admin/centers/independence-requests/${requestId}/approve`,
        {},
      )
      .pipe(map((r) => r.data));
  }

  /** POST /api/admin/centers/independence-requests/{requestId}/reject — reason optional. */
  rejectIndependenceRequest(requestId: number, rejectionReason: string): Observable<string | null> {
    return this.http
      .post<ApiResult<string | null>>(
        `${this.base}/admin/centers/independence-requests/${requestId}/reject`,
        { rejectionReason },
      )
      .pipe(map((r) => r.data));
  }

  // ── Per-slot pricing ─────────────────────────────────────────────────────────

  /** GET /api/admin/center-subscriptions/pricing. */
  getPricing(): Observable<CenterSubscriptionPricing> {
    return this.http
      .get<ApiResult<CenterSubscriptionPricing>>(`${this.base}/admin/center-subscriptions/pricing`)
      .pipe(map((r) => r.data));
  }

  /** PUT /api/admin/center-subscriptions/pricing. */
  updatePricing(req: CenterSubscriptionPricing): Observable<CenterSubscriptionPricing> {
    return this.http
      .put<ApiResult<CenterSubscriptionPricing>>(
        `${this.base}/admin/center-subscriptions/pricing`,
        req,
      )
      .pipe(map((r) => r.data));
  }
}
