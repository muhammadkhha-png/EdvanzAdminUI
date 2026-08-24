import { PagedQuery } from './paginated-response.model';
import { ModulePermissions } from './permission.model';

// ── Assistant row for the Admin Portal's platform-wide list (GET /api/assistant/all) ──
// Mirrors Edvanz.Application.Dtos.AssistantDtos.AssistantAdminListDto exactly.
export interface AssistantAdminListItem {
  id: number;
  /** Owning User.Id — target for force-password-reset, NOT the Assistant entity id. */
  userId: number;
  fullName: string;
  username: string;
  email?: string;
  phoneNumber: string;
  isActive: boolean;
  teacherId: number;
  teacherName: string;
  createdAt: string;
  accountStatus: string;
  deletedAt?: string;
  updatedAt: string;
  languagePreference?: string;
  /** Most recent successful login (ISO UTC), or absent/null if never logged in. */
  lastLoginAt?: string | null;
  /** "Last seen" — most recent authenticated request (ISO UTC, ±5-min server throttle),
   *  or absent/null before the account's first request since the column shipped. */
  lastActivityAt?: string | null;
}

// ── Login/logout audit row (GET /api/assistant/{id}/login-activity) ─────────
// Mirrors Edvanz.Application.Dtos.AssistantDtos.LoginActivityDto (REQ-USR-028).
export interface LoginActivityEntry {
  id?: number | null;
  assistantName: string;
  /** 'login' | 'logOut' — LoginAcitvityActionType serialized as a string. */
  action: string;
  occurredAt: string;
  deviceOrBrowser?: string | null;
  ipAddress?: string | null;
}

/** Valid sort columns per Edvanz.Domain.Enums.AssistantSortBy (string enum on the wire). */
export type AssistantSortBy = 'CreatedAt' | 'fullName';

// ── Query params for GET /api/assistant/all ────────────────────────────────
export interface AssistantAdminListQuery extends PagedQuery {
  /** Restrict to a single teacher's assistants. Omit/undefined = all teachers. */
  teacherId?: number | null;
  sortBy?: AssistantSortBy;
}
// ── Create assistant (POST /api/assistant) ──────────────────────────────────
// Mirrors Edvanz.Application.Dtos.AssistantDtos.CreateAssistantDto.
// permissionProfileIds is deliberately typed as `null` only — no profile-selection
// UI exists per spec, so there is no other value this field can ever hold here.
export interface CreateAssistantRequest {
  fullName: string;
  username: string;
  password: string;
  email?: string;
  phoneNumber?: string;
  teacherId: number;
  permissionIds: number[];
  permissionProfileIds: null;
}
// ── Assistant detail (GET /api/assistant/{id}) — used by the Edit page ─────────
// Mirrors Edvanz.Application.Dtos.AssistantDtos.AssistantDto. `assignedPermissionsProfiles`
// is intentionally omitted here — no profile-selection UI exists in this app, per spec.
export interface AssistantDetail {
  id: number;
  fullName: string;
  username: string;
  email?: string;
  phoneNumber?: string;
  teacherId: number;
  teacherName: string;
  createdAt: string;
  accountStatus: string;
  deletedAt?: string;
  updatedAt?: string;
  languagePreference?: string;
  /** Currently granted permissions, grouped by module. */
  userPermissions: ModulePermissions[];
}

// ── Update assistant (PUT /api/assistant/{id}) ──────────────────────────────
// Mirrors Edvanz.Application.Dtos.AssistantDtos.UpdateAssistantRequest.
// Deliberately has NO teacherId — the backend DTO doesn't support reassignment,
// so the Edit page must not offer it as an editable field.
// permissionProfileIds is always `null` — same reasoning as CreateAssistantRequest.
export interface UpdateAssistantRequest {
  fullName?: string;
  username?: string;
  newPassword?: string;
  phoneNumber?: string;
  email?: string;
  permissionIds?: number[];
  permissionProfileIds: null;
}
