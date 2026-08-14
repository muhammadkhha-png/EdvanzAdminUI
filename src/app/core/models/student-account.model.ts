// ── Student Accounts admin directory (StudentUserController) ───────────────
// Deliberately separate from student.model.ts: that file models the Students
// module (TeacherStudentController's per-teacher roster, id space =
// TeacherStudent.Id). This file models StudentUser accounts (the mobile-app
// login identity), id space = StudentUser.Id. Same person can appear in both
// as different rows with different ids — never mix the two.

/** One teacher this student account currently holds an ACTIVE link to. */
export interface StudentAccountTeacherLink {
  teacherId: number;
  teacherCode: string;
  /** The per-teacher student code that teacher assigned this account. Null when not set. */
  studentCode: string | null;
  teacherName: string;
}

// ── Row for GET /api/studentuser/list ───────────────────────────────────────
// Mirrors Edvanz.Application.Dtos.StudentUser.StudentAccountListItemDto exactly.
export interface StudentAccountListItem {
  /** StudentUser.Id — NOT the owning User.Id. Do not pass this to auth/user-scoped endpoints. */
  studentAccountId: number;
  fullName: string;
  userName: string;
  accountCode: string;
  phoneNumber?: string;
  /** Empty when the account has never linked to a teacher, or all links are non-Active. */
  teachers: StudentAccountTeacherLink[];
}

// ── Query params for GET /api/studentuser/list ──────────────────────────────
// Mirrors StudentAccountListRequest — deliberately its own shape (no sortBy),
// same reasoning noted on the backend DTO.
export interface StudentAccountListQuery {
  page?: number;
  pageSize?: number;
  /** Matches account full name, or the per-teacher student code of any ACTIVE teacher link. */
  search?: string;
  /** Restrict to accounts ACTIVE-linked to this teacher. */
  teacherId?: number | null;
}

// ── GET api/teacher/student-links/admin/teachers/{teacherId}/unbound-links ─
// Mirrors Edvanz.Application.Dtos.TeacherLinks.LinkedStudentListItemDto as
// returned by that endpoint — an Active, accepted connection between a
// student account and this teacher that isn't bound to a roster record yet.
// Used by the Link Teacher action to find the linkId for a given account
// (matched by studentAccountCode) before binding it via a teacher-assigned
// student code.
export interface StudentAccountUnboundLink {
  linkId: number;
  linkedAt: string;
  studentAccountCode: string;
  studentFullName: string;
  studentPhoneNumber?: string;
}

// ── GET /api/studentuser/by-code/{accountCode} ──────────────────────────────
// Mirrors StudentUserProfileDto. Used here purely as the bridge from
// studentAccountId (StudentUser.Id) to userId (User.Id) that
// AuthService.forceChangePassword requires — the list endpoint doesn't
// expose userId directly.
export interface StudentUserAccountLookup {
  id: number;
  userId: number;
  studentAccountCode: string;
  fullName: string;
  email?: string;
  phoneNumber?: string;
  languagePreference?: string;
  accountStatus: string;
  isFirstLogin: boolean;
  createdAt: string;
  linkedTeacherCount: number;
}
