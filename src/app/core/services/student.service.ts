import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { skipGlobalLoading } from '../interceptors/loading-context';
import { ApiResult } from '../models/api-result.model';
import { PaginatedResponse } from '../models/paginated-response.model';
import {
  CreateStudentByAdminRequest,
  StudentAdminListItem,
  StudentAdminListQuery,
  StudentProfile,
  UnboundLinkItem,
  UpdateStudentRequest,
} from '../models/student.model';

/**
 * Admin-portal student directory. SuperAdmin-only surface — every call here
 * targets the `teacherstudent/admin/*` endpoints (no tenant scope, resolved
 * server-side), never the per-teacher `teacherstudent` endpoints used inside
 * the Teacher app itself.
 *
 * Reassignment to a different teacher is intentionally NOT modeled here: the
 * backend UpdateTeacherStudentDto has no TeacherId field, and no such feature
 * exists in the domain.
 *
 * unlinkStudent/getUnboundLinksForTeacher/linkStudent below are the one
 * exception — they call TeacherStudentLinksController's admin actions
 * (`api/teacher/student-links/admin/*`), a different controller than the
 * rest of this service. Kept here rather than a separate service because
 * they're 100% co-located in the UI with student-row actions (the list's
 * Link/Unlink toggle), not because they share a backend resource.
 */
@Injectable({ providedIn: 'root' })
export class StudentService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /** GET teacherstudent/admin/students — platform-wide, paginated, filterable by teacherId + search. */
  getAllStudents(
    query: StudentAdminListQuery,
  ): Observable<PaginatedResponse<StudentAdminListItem[]>> {
    let params = new HttpParams()
      .set('page', query.page ?? 1)
      .set('pageSize', query.pageSize ?? 20);

    if (query.teacherId != null) params = params.set('teacherId', query.teacherId);
    if (query.sessionId != null) params = params.set('sessionId', query.sessionId);
    if (query.search) params = params.set('search', query.search);
    if (query.missingStudentPhone) params = params.set('missingStudentPhone', true);
    if (query.missingParentPhone) params = params.set('missingParentPhone', true);
    if (query.missingSession) params = params.set('missingSession', true);
    if (query.sortBy) params = params.set('sortBy', query.sortBy);
    if (query.sortDirection) params = params.set('sortDirection', query.sortDirection);

    return this.http
      .get<ApiResult<PaginatedResponse<StudentAdminListItem[]>>>(
        `${this.base}/teacherstudent/admin/students`,
        { params, context: skipGlobalLoading() },
      )
      .pipe(map((r) => r.data));
  }

  /** GET teacherstudent/admin/students/{id} — full profile, including the assigned-session card. */
  getById(id: number): Observable<StudentProfile> {
    return this.http
      .get<ApiResult<StudentProfile>>(`${this.base}/teacherstudent/admin/students/${id}`)
      .pipe(map((r) => r.data));
  }

  /**
   * POST teacherstudent/admin — creates the student record under the selected teacher.
   * Returns the raw envelope so the caller can read `message` for the success toast
   * and `data` for the created record (e.g. to navigate to its profile), matching
   * AssistantService's create/update convention.
   */
  createStudent(req: CreateStudentByAdminRequest): Observable<ApiResult<StudentAdminListItem>> {
    return this.http.post<ApiResult<StudentAdminListItem>>(`${this.base}/teacherstudent/admin`, req);
  }

  /**
   * PUT teacherstudent/admin/students/{id} — full update (StudentName is mandatory,
   * all other fields optional/clearable). Returns the raw envelope, same reasoning
   * as createStudent.
   */
  updateStudent(
    id: number,
    req: UpdateStudentRequest,
  ): Observable<ApiResult<StudentAdminListItem>> {
    return this.http.put<ApiResult<StudentAdminListItem>>(
      `${this.base}/teacherstudent/admin/students/${id}`,
      req,
    );
  }

  // ── Mobile-account link management (TeacherStudentLinksController) ───────

  /**
   * GET api/teacher/student-links/admin/teachers/{teacherId}/unbound-links —
   * this teacher's Active-but-unbound connections, for the Link picker modal.
   */
  getUnboundLinksForTeacher(teacherId: number): Observable<UnboundLinkItem[]> {
    return this.http
      .get<ApiResult<UnboundLinkItem[]>>(
        `${this.base}/teacher/student-links/admin/teachers/${teacherId}/unbound-links`,
      )
      .pipe(map((r) => r.data ?? []));
  }

  /**
   * POST api/teacher/student-links/admin/{linkId}/bind — attaches the chosen
   * unbound connection to this roster row. Returns the raw envelope for the
   * success toast, matching createStudent/updateStudent's convention.
   */
  linkStudent(linkId: number, teacherStudentId: number): Observable<ApiResult<unknown>> {
    return this.http.post<ApiResult<unknown>>(
      `${this.base}/teacher/student-links/admin/${linkId}/bind`,
      { teacherStudentId },
    );
  }

  /**
   * POST api/teacher/student-links/admin/{linkId}/unbind — detaches the
   * currently-bound connection from this roster row. The connection itself
   * stays Active (the student remains "connected"); it just loses access
   * until re-linked.
   */
  unlinkStudent(linkId: number): Observable<ApiResult<unknown>> {
    return this.http.post<ApiResult<unknown>>(
      `${this.base}/teacher/student-links/admin/${linkId}/unbind`,
      {},
    );
  }
}
