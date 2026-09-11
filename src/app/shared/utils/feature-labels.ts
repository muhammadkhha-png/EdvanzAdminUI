/**
 * How each feature is named on screen.
 *
 * The enum names are wire values and several of them are not what anyone says out
 * loud — "ExamsHomework", "ParentPortal". One map, used everywhere, so the same
 * feature cannot be called two different things on two different screens.
 *
 * "Sessions" is rendered as **Classes**: a tutor schedules classes, and "session"
 * is our word, not theirs.
 */
export const FEATURE_LABELS: Record<string, string> = {
  Students: 'Students',
  Sessions: 'Classes',
  Attendance: 'Attendance',
  Payments: 'Payments',
  EventPayments: 'Event payments',
  Videos: 'Videos',
  OnlineExams: 'Online exams',
  ExamsHomework: 'Exams & homework',
  Messaging: 'Messaging',
  ParentPortal: 'Parent portal',
};

/** How often the account is worked. */
export const CADENCE_LABELS: Record<string, string> = {
  Daily: 'Daily',
  MostDays: 'Most days',
  Weekly: 'Weekly',
  Rarely: 'Rarely',
  Dormant: 'Stopped',
  Never: 'Never used it',
};

/** Who does the work on the account. */
export const OPERATOR_LABELS: Record<string, string> = {
  TeacherOnly: 'Teacher only',
  AssistantsOnly: 'Assistants only',
  TeacherAndAssistants: 'Teacher + assistants',
  Nobody: 'Nobody',
};
