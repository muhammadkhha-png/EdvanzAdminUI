// ── Center list item (GET /api/admin/centers — GET /api/admin/centers/{id}) ──
// AUTHORITATIVE contract: GET /api/admin/centers has NO pagination (data is a
// bare array, no page/pageSize params) and GET /api/admin/centers/{id} returns
// this SAME shape (no embedded teachers/subscription — those are separate
// endpoints, see CenterTeacherListItem / CenterSubscription below).
export interface CenterListItem {
  centerId: number;
  name: string;
  centerCode: string;
  /**
   * CENTER-controlled, not admin-set — the center manages its own revenue
   * share. Read-only here; never sent on create/update from this portal.
   */
  defaultRevenueSharePercent: number;
  accountStatus: string;
  /** Total teachers owned by this center (Full + Managerial + Managerial + Parents). */
  teacherCount: number;
  fullTeacherCount: number;
  managerialTeacherCount: number;
  /** Managerial + Parents (ManagerialPlus) teachers. Additive — 0 on older servers. */
  managerialPlusTeacherCount?: number;
  createdAt: string;
  /** The center's login User id — passed to force-change-password when resetting the center's password. */
  userId: number;
  /** The username the center signs in with. */
  username: string | null;
  /** UTC ISO timestamp of the center's most recent login, or null if it has never logged in. */
  lastLoginAt: string | null;
  /** UTC ISO "last seen" (most recent authenticated request), or null until the account's first request. */
  lastActivityAt: string | null;
}

// ── Create center (POST /api/admin/centers) ──────────────────────────────────
// FROZEN body shape. Returns the center summary (CenterListItem shape).
// NOTE: revenue-share % is CENTER-controlled, not admin-controlled — the create
// endpoint does not accept it (the center sets/manages its own
// defaultRevenueSharePercent from its own app, not this portal).
export interface CreateCenterRequest {
  name: string;
  username: string;
  password: string;
  fullName?: string;
  phoneNumber?: string;
  email?: string;
  languagePreference?: 'en' | 'ar';
}

// ── Center's teachers (GET /api/admin/centers/{id}/teachers) ─────────────────
// AUTHORITATIVE: bare array, no pagination.
export interface CenterTeacherListItem {
  teacherId: number;
  fullName: string;
  teacherCode: string;
  /** 'Full' | 'Managerial' | 'ManagerialPlus' | null (not yet subscribed under the center). */
  planType: 'Full' | 'Managerial' | 'ManagerialPlus' | null;
  studentCapacity: number;
  /** The rate actually applied to this teacher (override, else the center default). */
  effectiveRevenueSharePercent: number;
  /** Non-null when this teacher has a per-teacher override of the center default. */
  revenueSharePercentOverride: number | null;
  effectiveStudentCodeMode: 'Auto' | 'Manual';
  /** Non-null when this teacher has a per-teacher override of the center default. */
  studentCodeModeOverride: 'Auto' | 'Manual' | null;
  accountStatus: string;
  studentCount: number;
}

// ── Center subscription / quota package ───────────────────────────────────────
// FROZEN field names (the 7 quota numbers) — shared by the current-subscription
// read, the activate body, the approve body, and each request-queue row. The
// ManagerialPlus pair is additive (defaults 0 server-side).
export interface CenterQuota {
  fullTeacherSlots: number;
  managerialTeacherSlots: number;
  managerialPlusTeacherSlots: number;
  studentCapacityTotal: number;
  studentCapacityUnderFull: number;
  studentCapacityUnderManagerial: number;
  studentCapacityUnderManagerialPlus: number;
}

// ── Center subscription request queue row ────────────────────────────────────
// GET /api/admin/center-subscriptions/requests → bare array, no pagination.
export interface CenterSubscriptionRequestQueueItem extends CenterQuota {
  requestId: number;
  centerId: number;
  centerName: string;
  centerCode: string;
  computedAmountEGP: number;
  note: string | null;
  requestedAt: string;
  status: string;
}

// ── Current center subscription (GET /api/admin/center-subscriptions/{centerId}) ──
// AUTHORITATIVE: NO `id` field. Carries live usage counters and the pending
// request (if any) inline — no separate per-center request lookup is needed.
export interface CenterSubscription extends CenterQuota {
  hasSubscription: boolean;
  status: 'Active' | 'ExpiringSoon' | 'Expired' | null;
  startDate?: string;
  endDate?: string;
  daysRemaining?: number;
  usedFullTeachers: number;
  usedManagerialTeachers: number;
  usedManagerialPlusTeachers: number;
  usedStudentsTotal: number;
  hasPendingRequest: boolean;
  pendingRequest?: CenterSubscriptionRequestQueueItem | null;
  pendingRequestAmountEGP?: number;
}

// ── Activate/override center subscription (POST /api/admin/center-subscriptions/activate) ──
// FROZEN: centerId + the 5 quota numbers + durationDays (default 30) + optional note.
// Response data is the plain string "ok" — re-fetch GET .../{centerId} for the
// fresh CenterSubscription afterwards.
export interface ActivateCenterSubscriptionRequest extends CenterQuota {
  centerId: number;
  durationDays?: number;
  note?: string;
}

/**
 * POST /api/admin/center-subscriptions/requests/{requestId}/approve
 * FROZEN: the 5 quota numbers (admin-adjustable from the requested values) +
 * durationDays (default 30) + optional note. Response data is "ok" — re-fetch
 * GET .../{centerId} afterwards.
 */
export interface ApproveCenterSubscriptionRequestRequest extends CenterQuota {
  durationDays?: number;
  note?: string;
}

/** POST /api/admin/center-subscriptions/requests/{requestId}/reject — FROZEN. */
export interface RejectCenterSubscriptionRequestRequest {
  rejectionReason: string;
}

// ── Per-slot pricing (GET/PUT /api/admin/center-subscriptions/pricing) ───────
// FROZEN field names.
export interface CenterSubscriptionPricing {
  fullTeacherSlotPriceEGP: number;
  managerialTeacherSlotPriceEGP: number;
  managerialPlusTeacherSlotPriceEGP: number;
}

// ── Teacher independence requests (a center-owned teacher asking to leave) ────
/** GET /api/admin/centers/independence-requests — bare array, no pagination. */
export interface IndependenceRequestQueueItem {
  requestId: number;
  teacherId: number;
  teacherName: string;
  teacherCode: string;
  centerId: number;
  centerName: string;
  centerCode: string;
  note?: string | null;
  requestedAt: string;
  status: string;
}
