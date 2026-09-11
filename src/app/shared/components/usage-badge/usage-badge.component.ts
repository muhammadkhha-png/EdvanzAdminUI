import { Component, computed, input } from '@angular/core';

/**
 * The band chips for the three usage axes, plus the module chips.
 *
 * Colour is used ONLY where the band itself is the message — a cadence of
 * "Dormant" and an operator mix of "Assistants only" are the two states this
 * console exists to surface, so they carry signal colour. Healthy and neutral
 * bands stay quiet, because colouring everything means colouring nothing.
 *
 * Labels are written for the person reading them, not lifted from the enum:
 * `MostDays` reads as "Most days", `AssistantsOnly` as "Assistants only".
 */
@Component({
  selector: 'app-usage-badge',
  standalone: true,
  template: `
    <span class="chip" [attr.data-tone]="tone()" [title]="hint()">{{ label() }}</span>
  `,
  styles: [
    `
      .chip {
        display: inline-flex;
        align-items: center;
        padding: 0.1rem 0.45rem;
        border-radius: var(--r-sm);
        font-size: var(--t-xs);
        font-weight: 500;
        white-space: nowrap;
        background: var(--quiet-soft);
        color: var(--ink-2);
      }
      .chip[data-tone='live'] {
        background: var(--live-soft);
        color: var(--live);
      }
      .chip[data-tone='risk'] {
        background: var(--risk-soft);
        color: var(--risk);
      }
      .chip[data-tone='gone'] {
        background: var(--gone-soft);
        color: var(--gone);
      }
      .chip[data-tone='accent'] {
        background: var(--accent-soft);
        color: var(--accent-ink);
      }
    `,
  ],
})
export class UsageBadgeComponent {
  /** The raw enum name from the API, e.g. `MostDays`, `AssistantsOnly`. */
  readonly value = input.required<string>();

  /** Which axis this value belongs to — decides both wording and colour. */
  readonly axis = input<'cadence' | 'operators' | 'depth' | 'module' | 'subscription'>('cadence');

  protected readonly label = computed(() => LABELS[this.value()] ?? this.value());
  protected readonly hint = computed(() => HINTS[this.value()] ?? '');

  protected readonly tone = computed<string>(() => {
    const v = this.value();

    // Only the states that demand action get colour.
    if (v === 'Never' || v === 'Dormant' || v === 'Expired' || v === 'Nobody') return 'gone';
    if (v === 'AssistantsOnly' || v === 'Rarely' || v === 'ExpiringSoon' || v === 'Single') return 'risk';
    if (v === 'Daily' || v === 'MostDays' || v === 'Full' || v === 'Active') return 'live';
    if (this.axis() === 'module') return 'accent';
    return 'quiet';
  });
}

/** Human wording. The enum name is a wire value, never something a person reads. */
const LABELS: Record<string, string> = {
  // Cadence
  Daily: 'Daily',
  MostDays: 'Most days',
  Weekly: 'Weekly',
  Rarely: 'Rarely',
  Dormant: 'Went quiet',
  Never: 'Never started',
  // Operator mix
  TeacherOnly: 'Teacher only',
  AssistantsOnly: 'Assistants only',
  TeacherAndAssistants: 'Teacher + assistants',
  Nobody: 'Nobody',
  // Depth
  None: 'Nothing used',
  Single: 'One module',
  Core: 'Core',
  Broad: 'Broad',
  Full: 'Full product',
  // Modules
  Attendance: 'Attendance',
  Payments: 'Payments',
  Students: 'Students',
  Sessions: 'Sessions',
  Videos: 'Videos',
  OnlineExams: 'Online exams',
  ExamsHomework: 'Exams & homework',
  Messaging: 'Messaging',
  ParentPortal: 'Parent portal',
  // Subscription
  Active: 'Active',
  ExpiringSoon: 'Expiring soon',
  Expired: 'Expired',
};

/** Why a band means what it means — on hover, where it does not cost layout. */
const HINTS: Record<string, string> = {
  Daily: '20 or more active days in the last 30',
  MostDays: '10 to 19 active days in the last 30',
  Weekly: '4 to 9 active days in the last 30',
  Rarely: '1 to 3 active days in the last 30',
  Dormant: 'Worked before, nothing in the last 30 days',
  Never: 'No real activity has ever been recorded',
  AssistantsOnly: 'Assistants are working the account but the teacher is not',
  TeacherOnly: 'Only the teacher works this account',
  TeacherAndAssistants: 'Teacher and assistants are both active',
  Single: 'Only one part of the product is in use',
  Full: 'Six or more modules in use',
};
