import { PagedQuery } from './paginated-response.model';
import { CapacityRequestKind } from './subscription.model';

// ── Teacher list item (GET /api/teacher/list) ────────────────────────────────
export interface TeacherListItem {
  id: number;
  userId: number;
  fullName: string;
  username: string;
  teacherCode: string;
  phoneNumber?: string;
  /** "Students in account" — every student the teacher adds and manages.
   *  NOT what the subscription is priced on. */
  studentCapacity: number;
  /** "Student app accounts" — how many students may hold an app login linked to
   *  this teacher. THE SUBSCRIPTION IS PRICED ON THIS NUMBER. Optional on the
   *  wire: absent on servers older than the linked-capacity rollout, so every
   *  read site must fail open (render as today) rather than show undefined. */
  linkedStudentCapacity?: number;
  /** Seats actually CONSUMED — accounts accepted AND bound to a student record.
   *  This is the number measured against linkedStudentCapacity; the invariant is
   *  linkedStudentsUsed <= linkedStudentCount. It may legally EXCEED the capacity
   *  after an admin lowers the limit (existing links keep working, only new links
   *  are blocked), so never derive a remaining figure without clamping at 0.
   *  Absent on pre-rollout servers. */
  linkedStudentsUsed?: number;
  /** Created students under this teacher (active TeacherStudents). */
  studentCount?: number;
  /** Students with an active account link (CONNECTED) to this teacher — a superset
   *  of linkedStudentsUsed, since a connected account need not be bound to a student
   *  record yet. NOT the seat number: never measure this against the capacity. */
  linkedStudentCount?: number;
  /** Sessions (classes) owned by this teacher — hard-deleted, so live rows == real count. */
  sessionCount?: number;
  accountStatus: string;
  isConfigurationCompleted: boolean;
  subscriptionStatus?: string;
  /** 'Full' | 'Managerial' — latest subscription's plan type (absent if never subscribed). */
  planType?: string;
  subscriptionEndDate?: string;
  createdAt: string;
  /** Most recent successful login (ISO UTC), or absent/null if never logged in. */
  lastLoginAt?: string | null;
  /** "Last seen" — most recent authenticated request (ISO UTC, ±5-min server throttle),
   *  or absent/null before the account's first request since the column shipped. */
  lastActivityAt?: string | null;
  /** Assistant accounts under this teacher — same population as
   *  GET /api/assistant/all?teacherId={id} (Activity Monitor expand). */
  assistantCount?: number;
  /** Start date of the CURRENT subscription (ISO UTC), absent/null if never subscribed. */
  subscriptionStartDate?: string | null;
  /** Latest "seen" across teacher + all assistants (max of their last activity/login).
   *  Null when nobody on the team has ever logged in. */
  teamLastActivityAt?: string | null;
  /** True when teamLastActivityAt came from an assistant, not the teacher's own account. */
  teamLastActivityIsAssistant?: boolean;
}

// ── Teacher detail (GET /api/teacher/{id}/profile) ───────────────────────────
export interface TeacherProfile {
  id: number;
  userId: number;
  teacherCode: string;
  fullName: string;
  email?: string;
  phoneNumber?: string;
  /** "Students in account" — every student the teacher adds and manages. Not priced. */
  studentCapacity: number;
  /** "Student app accounts" — the limit the subscription is priced on. Optional on
   *  the wire (absent on pre-rollout servers) — the details screen hides the row
   *  entirely when it is missing so the page renders exactly as it does today. */
  linkedStudentCapacity?: number;
  /** Seats actually CONSUMED against linkedStudentCapacity (accepted AND bound).
   *  Same meaning as on TeacherListItem and on the subscription status endpoint.
   *  May legally exceed the capacity; absent on pre-rollout servers, where the
   *  details row degrades to showing the limit alone. */
  linkedStudentsUsed?: number;
  languagePreference: string;
  customSubject?: string;
  accountStatus: string;
  isConfigurationCompleted: boolean;
  createdAt: string;
  subjects: SubjectDto[];
  capacityPackageName?: string;
  /** Current capacity package id (added to TeacherProfileDto) so edit can preselect it. */
  studentCapacityPackageId?: number | null;
  activeSubscription?: TeacherSubscriptionDto;
}

// ── Subject lookup (GET /api/teacher/subjects) ───────────────────────────────
export interface SubjectDto {
  id: number;
  nameEn: string;
  nameAr: string;
  displayOrder: number;
}

// ── Capacity package lookup (GET /api/teacher/capacity-packages) ─────────────
export interface StudentCapacityPackageDto {
  id: number;
  name: string;
  minStudents: number;
  maxStudents: number | null;
  displayOrder: number;
}

export interface TeacherSubscriptionDto {
  id: number;
  subscriptionStatus: string;
  /** 'Full' | 'Managerial' — present since the managerial-subscription feature. */
  planType?: string;
  startDate: string;
  endDate: string;
  daysRemaining: number;
}

// ── Create teacher (POST /api/Auth/sign-up — multipart/form-data) ────────────
// SINGLE CALL — sign-up with userType=Teacher creates User + Teacher in one server
// transaction. Do NOT also call /api/teacher/initialize (would 409).
export interface CreateTeacherSignUpRequest {
  userType: 'Teacher';
  fullName: string;
  username: string;
  email?: string;
  password: string;
  confirmedPassword: string;
  /** Required. Egyptian mobile: 010/011/012/015 + 8 digits (^01[0125]\d{8}$). */
  phoneNumber: string;
  subjectIds: number[];
  languagePreference: 'en' | 'ar';
  studentCapacity?: number;
  /** "Student app accounts" seat limit for the new teacher; must be <= studentCapacity.
   *  Sent as a form field only when set — an older server simply ignores the extra
   *  multipart field, so the create flow keeps working during the rollout. */
  linkedStudentCapacity?: number;
  customSubject?: string;
  idImage?: File | null;
}

// ── Update teacher profile (PUT /api/teacher/{id}/profile) ───────────────────
// Editable: fullName, languagePreference, subjectIds (replaces all), customSubject,
// and studentCapacityPackageId ONLY while the teacher is not yet configured. Once
// isConfigurationCompleted, capacity is managed via the admin capacity endpoint below,
// so the client omits studentCapacityPackageId for configured teachers.
export interface UpdateTeacherProfileRequest {
  fullName: string;
  languagePreference: 'en' | 'ar';
  subjectIds: number[];
  customSubject?: string;
  studentCapacityPackageId?: number | null;
}

// ── Admin capacity adjust (PUT /api/admin/subscriptions/teachers/{id}/capacity) ─
// SuperAdmin-only, increase-only. Raises Teacher.StudentCapacity ("students in
// account") directly (no prior teacher request), writes an Approved audit row,
// notifies the teacher; new price from the next renewal. teacherId is in the route.
// The SEPARATE "student app accounts" limit — the one the subscription is priced on —
// has its own endpoint and allows decreases too: see
// SubscriptionService.setLinkedStudentCapacity.
export interface AdminSetCapacityRequest {
  newCapacity: number;
  note?: string;
}

/** Subset of CapacityRequestDto returned by the admin capacity endpoint. */
export interface CapacityAdjustResult {
  id: number;
  requestedCapacity: number;
  capacityAtRequest: number;
  status: string;
  /** Which limit this row is about — the same queue now serves both. Absent on
   *  pre-rollout servers, where every row is an 'AccountStudents' request. */
  capacityKind?: CapacityRequestKind;
}

// ── Admin billing start (POST /api/admin/payments/billing-start) ──────────────
// SuperAdmin sets/overrides a teacher's one-time billing start month and the
// backend reconciles the ladders (removes never-paid pre-start months, backfills
// newly-billable ones; paid/manual rows are kept). Always dry-run first — the
// summary is shown to the admin before the real run.
export interface BillingStartReconcileResult {
  teacherId: number;
  billingStartDate: string;
  dryRun: boolean;
  removedPeriods: number;
  backfilledPeriods: number;
  keptPaid: number;
  keptManual: number;
  studentsAffected: number;
}

// ── Teacher list query params ─────────────────────────────────────────────────
export interface TeacherListQuery extends PagedQuery {
  accountStatus?: string;
  subscriptionStatus?: string;
  /** Only teachers whose CURRENT subscription started within this many days,
   *  ordered newest-subscription-first (Activity Monitor "Newly subscribed" tab). */
  subscribedWithinDays?: number;
  /** Inclusive lower bound (yyyy-MM-dd) on REGISTRATION date (createdAt). */
  registeredFrom?: string;
  /** Inclusive upper bound (yyyy-MM-dd) on REGISTRATION date (createdAt) — the whole
   *  of that day is included. When either bound is set the list is ordered
   *  newest-registration-first (Activity Monitor "Registered on" date-range filter). */
  registeredTo?: string;
}

// ── Dashboard derived from teacher/list totalCount ───────────────────────────
export interface DashboardSummary {
  totalTeachers: number;
  activeTeachers: number;
  expiredSubscriptions: number;
  expiringSoon: number;
}
// ── Teacher lookup (GET /api/teacher/lookup) — Id + FullName only, for dropdowns ────
export interface TeacherLookupItem {
  id: number;
  fullName: string;
}
