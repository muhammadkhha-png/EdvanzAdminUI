// ── Admin subscription endpoints (/api/admin/subscriptions/*) ────────────────

/** Subscription plan type. Full = students/parents allowed; Managerial = blocked. */
export type SubscriptionPlanType = 'Full' | 'Managerial';

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
 * Activates a MANAGERIAL subscription — no student or parent account may be linked
 * to the teacher while it is active. `removeExistingLinks` true also severs any
 * students/parents already linked; false keeps them (only new links are blocked).
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
