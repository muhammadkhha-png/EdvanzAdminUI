import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResult } from '../models/api-result.model';
import { PaginatedResponse } from '../models/paginated-response.model';

// ════════════════════════════════════════════════════════════════════════════
// THE THREE AXES
// ════════════════════════════════════════════════════════════════════════════
//
// Usage is not one number. It is three independent questions, and the console
// always shows all three, because they demand different conversations:
//   • how OFTEN the account is worked
//   • WHICH parts of the product are used
//   • WHO on the account does the work
// ════════════════════════════════════════════════════════════════════════════

/** How often the account is worked, from active days in the last 30. */
export type UsageCadence =
  | 'Never'
  | 'Dormant'
  | 'Rarely'
  | 'Weekly'
  | 'MostDays'
  | 'Daily';

/** How much of the product is in use. Always shown beside the module list. */
export type UsageDepth = 'None' | 'Single' | 'Core' | 'Broad' | 'Full';

/**
 * Who works the account. `AssistantsOnly` is the highest-value signal here — the
 * owner has disengaged while staff keep the lights on, so the numbers look
 * healthy while the account is at risk.
 */
export type OperatorMix =
  | 'Nobody'
  | 'TeacherOnly'
  | 'AssistantsOnly'
  | 'TeacherAndAssistants';

/** Module names as returned in the `modules` arrays. */
export type UsageModule =
  | 'Students'
  | 'Sessions'
  | 'Attendance'
  | 'Payments'
  | 'Videos'
  | 'OnlineExams'
  | 'ExamsHomework'
  | 'Messaging'
  | 'ParentPortal';

/** One teacher on the usage grid. */
export interface TeacherUsage {
  teacherId: number;
  /** The login User id — what the password-reset endpoint takes. */
  userId: number;
  fullName: string;
  username: string | null;
  teacherCode: string;
  phoneNumber: string | null;
  /** Second way to reach them when the phone is dead. */
  email: string | null;
  registeredAt: string;
  accountStatus: string;

  subscriptionStatus: string | null;
  /** What "newly subscribed" is measured from. */
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  planType: string | null;
  salesRepId: number | null;
  salesRepName: string | null;
  acquisitionSource: string | null;

  cadence: UsageCadence;
  activeDays7: number;
  activeDays30: number;
  activeDays90: number;
  totalWrites30: number;

  depth: UsageDepth;
  modules: UsageModule[];
  modulesAllTime: UsageModule[];

  operators: OperatorMix;
  lastTeacherActivityAt: string | null;
  lastAssistantActivityAt: string | null;
  activeAssistantCount: number;

  firstActivityAt: string | null;
  lastActivityAt: string | null;

  /** Each pair is (total, the part that actually works). The gap is the story. */
  studentCount: number;
  studentsAssignedToSession: number;
  sessionCount: number;
  sessionsWithOccurrences: number;
  linkedAccountCount: number;
  boundAccountCount: number;
  hasEverMarkedAttendance: boolean;
  hasEverCollectedPayment: boolean;
  /** True only when a roster is assigned to a session that has class days. */
  hasRealData: boolean;

  noteCount: number;
  lastNoteAt: string | null;

  /** 30 daily write totals, oldest first, zero-filled. Drives the day strip. */
  sparkline30: number[];
  /** Null until the nightly rollup has reached this teacher. */
  computedAt: string | null;
}

/** One day on the activity chart. */
export interface UsageDayPoint {
  date: string;
  totalWrites: number;
  teacherWrites: number;
  assistantWrites: number;
  modules: UsageModule[];
}

/** A person who works the account. */
export interface TeacherOperator {
  userId: number;
  fullName: string;
  username: string | null;
  role: 'Teacher' | 'Assistant';
  /** False for a removed assistant, whose past work still counts. */
  isActive: boolean;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
}

/** Everything the Teacher 360 usage tab draws. */
export interface TeacherUsageDetail {
  summary: TeacherUsage;
  dailySeries: UsageDayPoint[];
  moduleBreakdown30: BandCount[];
  operators: TeacherOperator[];
}

/** One bar/slice: a band or module name and how many teachers fall in it. */
export interface BandCount {
  key: string;
  count: number;
}

/** A teacher as named on an insight card. */
export interface InsightTeacher {
  teacherId: number;
  fullName: string;
  teacherCode: string;
  phoneNumber: string | null;
  salesRepName: string | null;
  lastActivityAt: string | null;
  registeredAt: string;
  studentCount: number;
  /** The one number explaining why this teacher is on this card. */
  detail: string | null;
}

/** One named problem, how many teachers have it, and the first few by name. */
export interface InsightCard {
  key: string;
  description: string;
  severity: 'attention' | 'warning' | 'info';
  totalCount: number;
  teachers: InsightTeacher[];
}

/** The admin landing page in one call. */
export interface AdminOverview {
  generatedAt: string;
  /** Oldest rollup timestamp — how you find out the nightly job stalled. */
  oldestSnapshotAt: string | null;
  totals: {
    teachers: number;
    live: number;
    dormant: number;
    neverStarted: number;
    withRealData: number;
    assistantOnly: number;
    livePrevious: number;
  };
  cadenceBreakdown: BandCount[];
  depthBreakdown: BandCount[];
  operatorBreakdown: BandCount[];
  moduleAdoption: BandCount[];
  insights: InsightCard[];
}

/** Filters for the usage grid. Every one optional; they compose. */
export interface UsageQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  cadence?: UsageCadence;
  depth?: UsageDepth;
  operators?: OperatorMix;
  usingModule?: UsageModule;
  hasRealData?: boolean;
  salesRepId?: number;
  unassignedSalesRep?: boolean;
  subscriptionStatus?: string;
  registeredFrom?: string;
  registeredTo?: string;
  /** Only teachers whose current subscription started within this many days. */
  subscribedWithinDays?: number;
  sortBy?: 'LastActivity' | 'ActiveDays30' | 'TotalWrites30' | 'StudentCount' | 'RegisteredAt' | 'Name';
  sortDirection?: 'Asc' | 'Desc';
}

/** A sales rep plus how their accounts are actually doing. */
export interface SalesRep {
  id: number;
  name: string;
  phoneNumber: string | null;
  isActive: boolean;
  createdAt: string;
  /** Accounts sold is the vanity number; the rest is the truth. */
  teachersAssigned: number;
  teachersLive: number;
  teachersDormant: number;
  teachersNeverStarted: number;
  teachersWithRealData: number;
}

/** An internal note about a teacher. Never shown to the teacher. */
export interface AdminNote {
  id: number;
  teacherId: number;
  authorUserId: number;
  authorName: string;
  body: string;
  isPinned: boolean;
  followUpDate: string | null;
  createdAt: string;
}

/**
 * The SuperAdmin insights API.
 *
 * Everything here reads a pre-computed nightly snapshot, so responses are fast
 * but can be up to a day old — which is why every payload carries a `computedAt`
 * and `recomputeTeacher` exists for when someone needs a number refreshed now.
 */
@Injectable({ providedIn: 'root' })
export class AdminInsightsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin/insights`;

  /** The landing page: headline counts, axis distributions and the named cards. */
  getOverview(): Observable<AdminOverview> {
    return this.http
      .get<ApiResult<AdminOverview>>(`${this.base}/overview`)
      .pipe(map((r) => r.data));
  }

  /** One page of the usage grid. */
  getTeachers(query: UsageQuery): Observable<PaginatedResponse<TeacherUsage[]>> {
    return this.http
      .get<ApiResult<PaginatedResponse<TeacherUsage[]>>>(`${this.base}/teachers`, {
        params: toParams(query),
      })
      .pipe(map((r) => r.data));
  }

  /** Everything the Teacher 360 usage tab draws. */
  getTeacher(teacherId: number): Observable<TeacherUsageDetail> {
    return this.http
      .get<ApiResult<TeacherUsageDetail>>(`${this.base}/teachers/${teacherId}`)
      .pipe(map((r) => r.data));
  }

  /** The full named list behind one insight card — what "see all" opens. */
  getInsightTeachers(
    insightKey: string,
    page = 1,
    pageSize = 20,
  ): Observable<PaginatedResponse<TeacherUsage[]>> {
    return this.http
      .get<ApiResult<PaginatedResponse<TeacherUsage[]>>>(`${this.base}/cards/${insightKey}`, {
        params: new HttpParams().set('page', page).set('pageSize', pageSize),
      })
      .pipe(map((r) => r.data));
  }

  /** Rebuilds one teacher's usage now instead of waiting for tonight's run. */
  recomputeTeacher(teacherId: number, days = 0): Observable<TeacherUsageDetail> {
    return this.http
      .post<ApiResult<TeacherUsageDetail>>(
        `${this.base}/teachers/${teacherId}/recompute`,
        {},
        { params: new HttpParams().set('days', days) },
      )
      .pipe(map((r) => r.data));
  }

  /**
   * Downloads the CURRENTLY FILTERED teachers as a CSV.
   *
   * Asks for a blob because the payload is a file, not JSON — and reads the
   * filename from Content-Disposition so the saved file keeps the server's
   * timestamped name rather than a generic one.
   */
  exportTeachers(query: UsageQuery): Observable<{ blob: Blob; filename: string }> {
    return this.http
      .get(`${this.base}/teachers/export`, {
        params: toParams(query),
        responseType: 'blob',
        observe: 'response',
      })
      .pipe(
        map((res) => ({
          blob: res.body as Blob,
          filename:
            /filename="?([^";]+)"?/.exec(res.headers.get('content-disposition') ?? '')?.[1] ??
            'edvanz-teachers.csv',
        })),
      );
  }

  // ── Sales attribution ─────────────────────────────────────────────────────

  getSalesReps(includeInactive = false): Observable<SalesRep[]> {
    return this.http
      .get<ApiResult<SalesRep[]>>(`${this.base}/sales-reps`, {
        params: new HttpParams().set('includeInactive', includeInactive),
      })
      .pipe(map((r) => r.data));
  }

  createSalesRep(body: { name: string; phoneNumber?: string | null; isActive: boolean }): Observable<SalesRep> {
    return this.http
      .post<ApiResult<SalesRep>>(`${this.base}/sales-reps`, body)
      .pipe(map((r) => r.data));
  }

  updateSalesRep(
    id: number,
    body: { name: string; phoneNumber?: string | null; isActive: boolean },
  ): Observable<SalesRep> {
    return this.http
      .put<ApiResult<SalesRep>>(`${this.base}/sales-reps/${id}`, body)
      .pipe(map((r) => r.data));
  }

  /** A null `salesRepId` clears the attribution — an explicit, supported action. */
  assignSalesRep(
    teacherId: number,
    body: { salesRepId: number | null; acquisitionSource?: string | null },
  ): Observable<TeacherUsage> {
    return this.http
      .put<ApiResult<TeacherUsage>>(`${this.base}/teachers/${teacherId}/sales`, body)
      .pipe(map((r) => r.data));
  }

  // ── Internal notes ────────────────────────────────────────────────────────

  getNotes(teacherId: number): Observable<AdminNote[]> {
    return this.http
      .get<ApiResult<AdminNote[]>>(`${this.base}/teachers/${teacherId}/notes`)
      .pipe(map((r) => r.data));
  }

  createNote(
    teacherId: number,
    body: { body: string; isPinned: boolean; followUpDate?: string | null },
  ): Observable<AdminNote> {
    return this.http
      .post<ApiResult<AdminNote>>(`${this.base}/teachers/${teacherId}/notes`, body)
      .pipe(map((r) => r.data));
  }

  deleteNote(teacherId: number, noteId: number): Observable<boolean> {
    return this.http
      .delete<ApiResult<boolean>>(`${this.base}/teachers/${teacherId}/notes/${noteId}`)
      .pipe(map((r) => r.data));
  }
}

/**
 * Builds query params, dropping anything unset.
 *
 * An omitted filter and a filter set to `false` mean different things here —
 * `hasRealData=false` is a real filter ("show me the accounts with nothing that
 * works"), so only null/undefined/empty may be dropped.
 */
function toParams(query: UsageQuery): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === '') continue;
    params = params.set(key, String(value));
  }
  return params;
}
