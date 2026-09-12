// ── Admin subscription endpoints (/api/admin/subscriptions/*) ────────────────

/**
 * Subscription plan type. Full = students/parents allowed; Managerial = blocked;
 * ManagerialPlus ("Managerial + Parents") = Managerial rules but the public parent
 * follow-up page stays available.
 */
export type SubscriptionPlanType = 'Full' | 'Managerial' | 'ManagerialPlus';

/** Display label for a plan — the wire value is never shown raw. Accepts any
 * string so loosely-typed rows (e.g. TeacherListItem.planType?: string) can
 * pass through; unknown values fall back to the raw string. */
export function planTypeLabel(planType: string | null | undefined): string {
  switch (planType) {
    case 'ManagerialPlus':
      return 'Managerial + Parents';
    case 'Managerial':
      return 'Managerial';
    case 'Full':
      return 'Full';
    default:
      return planType ?? '—';
  }
}

/**
 * Which per-teacher limit a capacity request/adjustment is about. The two are
 * separate numbers with separate meanings:
 *   'AccountStudents' → "Students in account"   (Teacher.StudentCapacity — NOT priced)
 *   'LinkedStudents'  → "Student app accounts"  (the subscription price comes from this)
 * Absent on pre-rollout servers, where every capacity row is 'AccountStudents'.
 */
export type CapacityRequestKind = 'AccountStudents' | 'LinkedStudents';

/** Display label for a capacity kind — the wire value is never shown raw. Accepts
 * any string so loosely-typed rows pass through; unknown/absent values fall back to
 * the "students in account" wording, which is what pre-rollout rows always meant. */
export function capacityKindLabel(kind: string | null | undefined): string {
  return kind === 'LinkedStudents' ? 'Student app accounts' : 'Students in account';
}

export interface CurrentSubscriptionDto {
  id: number;
  /** Derived status (Active/ExpiringSoon/Expired) — backend field name is `status`. */
  status: string;
  /** 'Full' | 'Managerial'. */
  planType: SubscriptionPlanType;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  renewalAmountEGP?: number;
}

/** POST /api/admin/subscriptions/activate */
export interface AdminActivateRequest {
  teacherId: number;
  startDate?: string | null;
  endDate?: string | null;
  /** Students allowed on the account. Omitted leaves the current limit alone. */
  studentCapacity?: number | null;
  /**
   * Student app accounts allowed. Omitted leaves the current limit alone.
   * THE FULL PLAN IS PRICED ON THIS, and the server applies it before it snapshots
   * the amount — so sending it here prices the plan the admin just agreed.
   */
  linkedStudentCapacity?: number | null;
}

/**
 * POST /api/admin/subscriptions/activate-managerial
 * AND /api/admin/subscriptions/activate-managerial-plus (same body shape).
 * Activates a MANAGERIAL (or Managerial + Parents) subscription — no student or
 * parent account may be linked to the teacher while it is active (the -plus route
 * additionally keeps the public parent follow-up page open). `removeExistingLinks`
 * true also severs any students/parents already linked; false keeps them (only new
 * links are blocked). It never touches parent-portal follow-up grants.
 */
export interface AdminActivateManagerialRequest {
  teacherId: number;
  startDate?: string | null;
  endDate?: string | null;
  removeExistingLinks: boolean;
  /**
   * Students allowed on the account. Omitted leaves the current limit alone.
   * One number only — neither managerial plan permits student app accounts, so there
   * is no second limit to set and both are priced flat regardless of it.
   */
  studentCapacity?: number | null;
}

/** POST /api/admin/subscriptions/extend */
export interface AdminExtendRequest {
  teacherId: number;
  extensionDays: number;
}

/** PUT /api/admin/subscriptions/end-date */
export interface AdminSetEndDateRequest {
  subscriptionId: number;
  newEndDate: string;
}

/**
 * PUT /api/admin/subscriptions/teachers/{teacherId}/linked-capacity
 * Sets the teacher's "student app accounts" limit — the number the subscription is
 * priced on. Unlike the roster-capacity endpoint (AdminSetCapacityRequest, which is
 * increase-only) this one accepts BOTH increases and decreases: lowering it below the
 * teacher's current usage is legal, never unlinks a student who is already signed in,
 * and only blocks NEW links. teacherId travels in the route.
 */
export interface AdminSetLinkedCapacityRequest {
  newCapacity: number;
  note?: string;
}

// ── New-subscription request queue (/api/admin/subscriptions/requests/*) ──────

/** Lifecycle status of a teacher's new-subscription request (string enum). */
export type SubscriptionRequestStatus =
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | string;

/**
 * One row in the SuperAdmin new-subscription request queue.
 * `computedAmountEGP` is server-computed and PRICED OFF `requestedLinkedStudents`
 * (the student app accounts), not `requestedStudents`; Managerial plans are a flat
 * monthly price. Only Pending rows are returned (FIFO / oldest first).
 */
export interface AdminSubscriptionRequestQueueItem {
  id: number;
  teacherId: number;
  teacherName: string;
  teacherCode: string;
  planType: SubscriptionPlanType;
  /** "Students in account" the teacher asked for — not what the amount is based on. */
  requestedStudents: number;
  /** "Student app accounts" the teacher asked for — THE PRICED NUMBER. Absent on
   *  pre-rollout servers; the queue then renders exactly as it did before. */
  requestedLinkedStudents?: number;
  computedAmountEGP: number;
  note: string | null;
  requestedAt: string;
}

/** Full request record returned by approve/reject (SubscriptionRequestDto). */
export interface SubscriptionRequestDto {
  id: number;
  planType: SubscriptionPlanType;
  requestedStudents: number;
  /** "Student app accounts" — the priced number. Absent on pre-rollout servers. */
  requestedLinkedStudents?: number;
  computedAmountEGP: number;
  status: SubscriptionRequestStatus;
  note: string | null;
  rejectionReason: string | null;
  requestedAt: string;
  resolvedAt: string | null;
}

/** POST /api/admin/subscriptions/requests/{id}/reject — reason is required (max 500). */
export interface RejectSubscriptionRequestRequest {
  rejectionReason: string;
}

// ── Pending payments queue ────────────────────────────────────────────────────
export interface AdminPendingQueueItem {
  id: number;
  teacherId: number;
  teacherName: string;
  amount: number;
  transactionReference?: string;
  phoneNumber?: string;
  createdAt: string;
}
export interface CancelSubscriptionRequest {
  teacherId: number;
}

/** GET /api/admin/subscriptions/pricing — the three rates a plan can be priced from. */
export interface AdminSubscriptionPricing {
  pricePerStudentEGP: number;
  managerialMonthlyPriceEGP: number;
  managerialPlusMonthlyPriceEGP: number;
  updatedAt?: string | null;
}
