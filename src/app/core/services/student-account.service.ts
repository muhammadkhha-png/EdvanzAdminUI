import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResult } from '../models/api-result.model';
import { PaginatedResponse } from '../models/paginated-response.model';
import {
  StudentAccountListItem,
  StudentAccountListQuery,
  StudentAccountUnboundLink,
  StudentUserAccountLookup,
} from '../models/student-account.model';

/**
 * SuperAdmin "Student Accounts" directory — targets StudentUserController.
 * Distinct from StudentService (Students module / TeacherStudentController):
 * different backend controller, different entity, different id space.
 * StudentAccountListItem.studentAccountId is StudentUser.Id, never User.Id.
 */
@Injectable({ providedIn: 'root' })
export class StudentAccountService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /** GET studentuser/list — platform-wide, paginated, filterable by teacherId + search. */
  getStudentAccounts(
    query: StudentAccountListQuery,
  ): Observable<PaginatedResponse<StudentAccountListItem[]>> {
    let params = new HttpParams()
      .set('page', query.page ?? 1)
      .set('pageSize', query.pageSize ?? 20);

    if (query.search) params = params.set('search', query.search);
    if (query.teacherId != null) params = params.set('teacherId', query.teacherId);

    return this.http
      .get<ApiResult<PaginatedResponse<StudentAccountListItem[]>>>(
        `${this.base}/studentuser/list`,
        { params },
      )
      .pipe(map((r) => r.data));
  }

  /**
   * GET studentuser/by-code/{accountCode} — resolves the owning User.Id for a
   * student account. Not role-restricted beyond [Authorize], so a SuperAdmin
   * JWT is accepted. This is the bridge to AuthService.forceChangePassword,
   * which targets User.Id, not StudentUser.Id.
   */
  getUserIdByAccountCode(accountCode: string): Observable<number> {
    return this.http
      .get<ApiResult<StudentUserAccountLookup>>(
        `${this.base}/studentuser/by-code/${encodeURIComponent(accountCode)}`,
      )
      .pipe(map((r) => r.data.userId));
  }

  // ── Link Teacher (TeacherStudentLinksController's admin/* actions) ───────
  // These endpoints belong to a shared controller (not owned by the Students
  // or Student Accounts module specifically), but the calls themselves are
  // this page's own Link Teacher feature, so they're kept here rather than
  // duplicated into/reused from StudentService.

  /**
   * GET api/teacher/student-links/admin/teachers/{teacherId}/unbound-links —
   * this teacher's Active-but-unbound connections. The Link Teacher action
   * matches the entry whose studentAccountCode equals the target row's
   * accountCode to find the linkId to bind.
   */
  getUnboundLinksForTeacher(teacherId: number): Observable<StudentAccountUnboundLink[]> {
    return this.http
      .get<ApiResult<StudentAccountUnboundLink[]>>(
        `${this.base}/teacher/student-links/admin/teachers/${teacherId}/unbound-links`,
      )
      .pipe(map((r) => r.data ?? []));
  }

  /**
   * POST api/teacher/student-links/admin/{linkId}/bind — binds the accepted
   * connection to the roster record identified by the TEACHER-assigned
   * student code (BindStudentLinkDto.StudentCode), completing the Link
   * Teacher action without needing the internal TeacherStudentId.
   */
  bindLinkByStudentCode(linkId: number, studentCode: string): Observable<ApiResult<unknown>> {
    return this.http.post<ApiResult<unknown>>(
      `${this.base}/teacher/student-links/admin/${linkId}/bind`,
      { studentCode },
    );
  }
}
