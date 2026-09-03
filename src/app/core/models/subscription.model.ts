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

// ── New-subscription request queue (/api/admin/subscriptions/requests/*) ──────

/** Lifecycle status of a teacher's new-subscription request (string enum). */
export type SubscriptionRequestStatus =
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | string;

/**
 * One row in the SuperAdmin new-subscription request queue.
 * `computedAmountEGP` is server-computed: Full = requestedStudents × 2.5 EGP,
 * Managerial = flat 500 EGP/month. Only Pending rows are returned (FIFO / oldest first).
 */
export interface AdminSubscriptionRequestQueueItem {
  id: number;
  teacherId: number;
  teacherName: string;
  teacherCode: string;
  planType: SubscriptionPlanType;
  requestedStudents: number;
  computedAmountEGP: number;
  note: string | null;
  requestedAt: string;
}

/** Full request record returned by approve/reject (SubscriptionRequestDto). */
export interface SubscriptionRequestDto {
  id: number;
  planType: SubscriptionPlanType;
  requestedStudents: number;
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
