import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResult } from '../models/api-result.model';
import { PaginatedResponse } from '../models/paginated-response.model';
import { TeacherUsage } from './admin-insights.service';

/**
 * THE CONSOLE API.
 *
 * Separate from AdminInsightsService on purpose. That one speaks the usage model's
 * vocabulary — cadence, depth, operator mix — which is a real measurement language
 * someone has to be taught. This one answers the two questions asked every morning,
 * "what's new since yesterday" and "how is the business doing", and every number it
 * returns opens into the people inside it.
 */

// ── The dashboard ───────────────────────────────────────────────────────────

/** A teacher as every card, list and search result shows them. One shape, so the
 *  call and WhatsApp buttons are built once and appear everywhere. */
export interface ConsoleTeacher {
  teacherId: number;
  /** The login user id — what password reset takes. */
  userId: number;
  fullName: string;
  teacherCode: string;
  phoneNumber: string | null;
  /** Why this teacher is in THIS list, in plain words. Card-specific by design. */
  evidence: string | null;
}

/** A number, optionally its movement, and the key that opens the people inside it. */
export interface ConsoleStat {
  count: number;
  /** Null when the number is a scope rather than a list (e.g. "all teachers"). */
  segmentKey: string | null;
  /** Movement over the selected window. Null when a delta would be a guess. */
  delta: number | null;
}

/** A count that already carries its first few names, so the morning read needs no click. */
export interface ConsoleNamedCount {
  segmentKey: string;
  count: number;
  /** Capped; `count` is always the true total. */
  teachers: ConsoleTeacher[];
}

export interface ConsoleBandCount {
  key: string;
  count: number;
}

export interface ConsoleYesterday {
  /** The teacher-local (Africa/Cairo) day these lists describe. */
  date: string;
  registered: ConsoleNamedCount;
  subscribed: ConsoleNamedCount;
  expired: ConsoleNamedCount;
  /** First-ever activity was yesterday. The wins. */
  startedUsing: ConsoleNamedCount;
  usedApp: ConsoleNamedCount;
}

export interface ConsoleGrowth {
  teachers: ConsoleStat;
  subscribedNow: ConsoleStat;
  byPlan: ConsoleBandCount[];
  newlyRegistered: ConsoleStat;
  newlySubscribed: ConsoleStat;
  endingWithin7Days: ConsoleStat;
  expired: ConsoleStat;
  centerTeachers: ConsoleStat;
  centerTeachersByPlan: ConsoleBandCount[];
}

export interface ConsoleUsage {
  /** The denominator. Every pair below sums to it. */
  subscribers: number;
  usingApp7: ConsoleStat;
  notUsing7: ConsoleStat;
  usingApp30: ConsoleStat;
  notUsing30: ConsoleStat;
  uploadedStudents: ConsoleStat;
  noStudents: ConsoleStat;
  studentsNotInClasses: ConsoleStat;
  /** Both numbers, always — the gap between them is the story. */
  totalStudents: number;
  totalStudentsInClasses: number;
  needsCall: ConsoleStat;
}

export interface ConsoleFeatureRow {
  feature: string;
  haveIt: number;
  using30: number;
  neverOpened: number;
  haveItSegmentKey: string;
  usingSegmentKey: string;
  neverOpenedSegmentKey: string;
}

export interface ConsolePending {
  subscriptionPayments: number;
  subscriptionPaymentsEGP: number;
  subscriptionRequests: number;
  subscriptionRequestsEGP: number;
  capacityRequests: number;
  centerSubscriptionRequests: number;
  centerSubscriptionRequestsEGP: number;
  teacherIndependenceRequests: number;
  total: number;
  totalEGP: number;
}

export interface ConsoleRenewalMonth {
  month: string;
  label: string;
  /** TEACHERS whose subscription ended — people, not periods. */
  ended: number;
  renewed: number;
  churned: number;
  ratePercent: number;
  renewedSegmentKey: string;
  churnedSegmentKey: string;
}

export interface ConsoleMoney {
  activeValueEGP: number;
  /** Always "TodayPrices" — see the API docs for why the stored column is reported separately. */
  valueBasis: string;
  recordedPaidEGP: number;
  latestRenewals: ConsoleRenewalMonth | null;
  renewedAtLeastOnce: ConsoleStat;
  firstSubscriptionOnly: ConsoleStat;
  pending: ConsolePending;
}

export interface ConsolePlatform {
  teachersTotal: number;
  teachersIndependent: number;
  teachersCenterOwned: number;
  students: number;
  linkedStudentAccounts: number;
  assistants: number;
  centers: number;
}

export interface ConsoleDashboard {
  generatedAt: string;
  windowDays: number;
  /** The last day the usage figures are complete for — yesterday, because the rollup runs overnight. */
  computedThrough: string;
  oldestSnapshotAt: string | null;
  teachersNotYetComputed: number;
  /** What "ending soon" means here. Rendered rather than hardcoded, so the page and
   *  the server can never disagree about the threshold. */
  endingSoonThresholdDays: number;
  yesterday: ConsoleYesterday;
  growth: ConsoleGrowth;
  usage: ConsoleUsage;
  features: ConsoleFeatureRow[];
  money: ConsoleMoney;
  platform: ConsolePlatform;
}

// ── Trends ──────────────────────────────────────────────────────────────────

export interface ConsoleTrendPoint {
  periodStart: string;
  label: string;
  registrations: number;
  newSubscriptions: number;
  /** For the period still in progress this is measured at now, not at its future end. */
  subscribersAtEnd: number;
}

export interface ConsoleTrends {
  granularity: string;
  points: ConsoleTrendPoint[];
}

// ── Segments (the list behind every number) ─────────────────────────────────

/** A grid row plus the line explaining why this teacher is in this list. */
export interface ConsoleSegmentTeacher extends TeacherUsage {
  evidence: string | null;
  /**
   * Whole days until the subscription ends; negative once it has.
   *
   * RENDER THIS, never `subscriptionStatus`, when the screen talks about expiry:
   * the status enum bands at five days while this console counts seven, so a row
   * can read "Active" and sit inside the ending-soon card at the same time.
   */
  subscriptionEndsInDays: number | null;
}

// ── Renewals ────────────────────────────────────────────────────────────────

export interface ConsoleRenewals {
  months: ConsoleRenewalMonth[];
  firstSubOnlyCount: number;
  renewedAtLeastOnceCount: number;
  renewalWindowDays: number;
}

// ── Global search ───────────────────────────────────────────────────────────

export interface ConsoleSearchHit {
  /** Teacher | Student | StudentAccount | Assistant */
  kind: string;
  id: number;
  userId: number | null;
  fullName: string;
  code: string | null;
  phoneNumber: string | null;
  teacherId: number | null;
  teacherName: string | null;
}

export interface ConsoleSearch {
  query: string;
  teachers: ConsoleSearchHit[];
  /** Roster records a teacher created — NOT app accounts. */
  students: ConsoleSearchHit[];
  /** The student's own login. */
  studentAccounts: ConsoleSearchHit[];
  assistants: ConsoleSearchHit[];
  totalHits: number;
}

// ── Teacher page lookups ────────────────────────────────────────────────────

export interface ConsoleLoginEvent {
  action: string;
  occurredAt: string;
  deviceOrBrowser: string | null;
  ipAddress: string | null;
}

export interface ConsoleLoginPerson {
  userId: number;
  fullName: string;
  username: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  events: ConsoleLoginEvent[];
}

export interface ConsoleLogins {
  teacherId: number;
  teacher: ConsoleLoginPerson;
  assistants: ConsoleLoginPerson[];
  teacherHistoryRecorded: boolean;
  /**
   * Oldest sign-in on record platform-wide. READ THIS before rendering an empty
   * event list: recording started at a deploy, so nothing before that date exists,
   * and "no record yet" is a different answer from "never signed in".
   */
  recordedSince: string | null;
}

export interface ConsoleSnapshotClass {
  sessionId: number;
  sessionName: string;
  groupName: string | null;
  scheduleDays: string | null;
  startTime: string;
  durationMinutes: number;
  startDate: string;
  endDate: string;
  studentCount: number;
  /** Zero means nothing downstream of this class can work. */
  occurrenceCount: number;
}

export interface ConsoleSnapshotContent {
  total: number;
  latestAt: string | null;
  latestTitles: string[];
}

export interface ConsoleSnapshot {
  teacherId: number;
  classes: ConsoleSnapshotClass[];
  videos: ConsoleSnapshotContent;
  onlineExams: ConsoleSnapshotContent;
  examsAndHomework: ConsoleSnapshotContent;
  studentAccounts: { active: number; bound: number };
  studentCount: number;
  studentsInClasses: number;
}

@Injectable({ providedIn: 'root' })
export class AdminConsoleService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin`;

  /** The landing page in one call. `window` is 7, 30 or 90 days. */
  getDashboard(windowDays: number): Observable<ConsoleDashboard> {
    return this.http
      .get<ApiResult<ConsoleDashboard>>(`${this.base}/insights/dashboard`, {
        params: new HttpParams().set('window', windowDays),
      })
      .pipe(map((r) => r.data));
  }

  /** Registrations, new subscriptions and live subscribers per period. */
  getTrends(granularity: 'Weekly' | 'Monthly'): Observable<ConsoleTrends> {
    return this.http
      .get<ApiResult<ConsoleTrends>>(`${this.base}/insights/trends`, {
        params: new HttpParams().set('granularity', granularity),
      })
      .pipe(map((r) => r.data));
  }

  /**
   * The people behind any number. `key` comes from the dashboard itself — never
   * hand-built here, so a card and its list can only ever describe one population.
   */
  getSegment(
    key: string,
    windowDays: number,
    page: number,
    pageSize: number,
  ): Observable<PaginatedResponse<ConsoleSegmentTeacher[]>> {
    return this.http
      .get<ApiResult<PaginatedResponse<ConsoleSegmentTeacher[]>>>(
        `${this.base}/insights/segments/${encodeURIComponent(key)}`,
        {
          params: new HttpParams()
            .set('window', windowDays)
            .set('page', page)
            .set('pageSize', pageSize),
        },
      )
      .pipe(map((r) => r.data));
  }

  /** Renewed vs churned per month, plus the trial-conversion split. */
  getRenewals(months = 6): Observable<ConsoleRenewals> {
    return this.http
      .get<ApiResult<ConsoleRenewals>>(`${this.base}/insights/renewals`, {
        params: new HttpParams().set('months', months),
      })
      .pipe(map((r) => r.data));
  }

  /** Teachers, roster students, student app accounts and assistants at once. */
  search(q: string, take = 5): Observable<ConsoleSearch> {
    return this.http
      .get<ApiResult<ConsoleSearch>>(`${this.base}/search`, {
        params: new HttpParams().set('q', q).set('take', take),
      })
      .pipe(map((r) => r.data));
  }

  /** Who signed in to a teacher's account and when. */
  getLogins(teacherId: number): Observable<ConsoleLogins> {
    return this.http
      .get<ApiResult<ConsoleLogins>>(`${this.base}/insights/teachers/${teacherId}/logins`)
      .pipe(map((r) => r.data));
  }

  /** What the teacher's account contains, read-only and counted live. */
  getSnapshot(teacherId: number): Observable<ConsoleSnapshot> {
    return this.http
      .get<ApiResult<ConsoleSnapshot>>(`${this.base}/insights/teachers/${teacherId}/snapshot`)
      .pipe(map((r) => r.data));
  }
}
