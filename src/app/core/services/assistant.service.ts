import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { skipGlobalLoading } from '../interceptors/loading-context';
import { ApiResult } from '../models/api-result.model';
import { AssistantAdminListItem, AssistantAdminListQuery, AssistantDetail, CreateAssistantRequest, LoginActivityEntry, UpdateAssistantRequest } from '../models/assistant.model';
import { PaginatedResponse } from '../models/paginated-response.model';

/**
 * Admin-portal assistant directory. SuperAdmin-only surface — every call here
 * targets the platform-wide `/api/assistant/all` endpoint, never the
 * per-teacher `/api/assistant` list used inside the Teacher app itself.
 *
 * Password reset intentionally has NO method here: it's the same
 * SuperAdmin-only force-reset used by teachers (AuthService.forceChangePassword,
 * keyed by userId), so the assistant list component calls AuthService directly —
 * duplicating a wrapper here would just be an extra indirection over the same call.
 */
@Injectable({ providedIn: 'root' })
export class AssistantService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /** GET /api/assistant/all — platform-wide, paginated, filterable by teacherId + search. */
  getAllAssistants(
    query: AssistantAdminListQuery,
  ): Observable<PaginatedResponse<AssistantAdminListItem[]>> {
    let params = new HttpParams()
      .set('page', query.page ?? 1)
      .set('pageSize', query.pageSize ?? 20);

    if (query.teacherId != null) params = params.set('teacherId', query.teacherId);
    if (query.search) params = params.set('search', query.search);
    if (query.sortBy) params = params.set('sortBy', query.sortBy);
    if (query.sortDirection) params = params.set('sortDirection', query.sortDirection);

    return this.http
      .get<ApiResult<PaginatedResponse<AssistantAdminListItem[]>>>(`${this.base}/assistant/all`, {
        params,
        context: skipGlobalLoading(),
      })
      .pipe(map((r) => r.data));
  }
  /**
   * POST /api/assistant — creates the assistant account under the selected teacher.
   * Returns the raw envelope (not unwrapped) so the caller can read `message` for
   * the success toast, matching TeacherService.createTeacher's convention.
   */
  createAssistant(req: CreateAssistantRequest): Observable<ApiResult<string | null>> {
    return this.http.post<ApiResult<string | null>>(`${this.base}/assistant`, req);
  }
  /** GET /api/assistant/{id} — full detail for the Edit page, including currently
   *  assigned permissions grouped by module. */
  getById(id: number): Observable<AssistantDetail> {
    return this.http
      .get<ApiResult<AssistantDetail>>(`${this.base}/assistant/${id}`)
      .pipe(map((r) => r.data));
  }

  /**
   * PUT /api/assistant/{id} — partial update; omitted fields keep their current
   * server-side value. Returns the raw envelope so the caller can read `message`,
   * matching createAssistant's convention.
   */
  updateAssistant(id: number, req: UpdateAssistantRequest): Observable<ApiResult<string | null>> {
    return this.http.put<ApiResult<string | null>>(`${this.base}/assistant/${id}`, req);
  }

  /** PATCH /api/assistant/{id}/activate — AccountStatus = Active. */
  activateAssistant(id: number): Observable<string | null> {
    return this.http
      .patch<ApiResult<string | null>>(`${this.base}/assistant/${id}/activate`, {})
      .pipe(map((r) => r.data));
  }

  /** PATCH /api/assistant/{id}/deactivate — AccountStatus = Inactive (reversible). */
  deactivateAssistant(id: number): Observable<string | null> {
    return this.http
      .patch<ApiResult<string | null>>(`${this.base}/assistant/${id}/deactivate`, {})
      .pipe(map((r) => r.data));
  }

  /** GET /api/assistant/{id}/login-activity — login/logout audit trail (newest first),
   *  with device/browser and IP per event. Activity Monitor drill-in. */
  getLoginActivity(id: number): Observable<LoginActivityEntry[]> {
    return this.http
      .get<ApiResult<LoginActivityEntry[]>>(`${this.base}/assistant/${id}/login-activity`, {
        context: skipGlobalLoading(),
      })
      .pipe(map((r) => r.data));
  }
}
