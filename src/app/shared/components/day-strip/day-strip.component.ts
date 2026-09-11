import { Component, computed, input } from '@angular/core';

/**
 * THE DAY STRIP — the one bold element on this console.
 *
 * Thirty (or ninety) discrete day marks, read left to right, oldest first. It is
 * deliberately NOT a smooth area chart: the product's own world is the ruled
 * attendance register, where a month is a row of separate day cells, and a tutor
 * either worked a given day or did not. A smoothed curve would invent continuity
 * between days that were genuinely empty.
 *
 * It carries TWO of the three usage axes at once, which is why it earns the space:
 *   • CADENCE  — how many marks are inked, and how they cluster
 *   • OPERATOR — each mark is tinted by who did the work that day
 *
 * A teacher working daily reads as a solid run. One working twice a week reads as
 * a comb. One who stopped three weeks ago reads as ink then nothing — and that
 * shape is visible before any number is read.
 *
 * Height encodes volume on a SQUARE-ROOT scale, not linear: the difference between
 * 1 and 10 writes matters far more than between 200 and 400, and a linear scale
 * would flatten every ordinary day against one bulk-import spike.
 */
@Component({
  selector: 'app-day-strip',
  standalone: true,
  template: `
    <div
      class="strip"
      role="img"
      [attr.aria-label]="label()"
      [style.--mark-gap.px]="gap()"
    >
      @for (bar of bars(); track $index) {
        <span
          class="mark"
          [class.empty]="bar.height === 0"
          [style.height.%]="bar.height"
          [attr.data-who]="bar.who"
        ></span>
      }
    </div>
  `,
  styles: [
    `
      /* The host must be a block that can SHRINK. Left inline and unconstrained,
         the 30 flex marks size the host to their content and it overflows its
         grid cell — grid items are min-width:auto by default, so the column
         refuses to shrink and the strip spills past the panel edge. */
      :host {
        display: block;
        width: 100%;
        min-width: 0;
      }
      .strip {
        display: flex;
        align-items: flex-end;
        gap: var(--mark-gap, 2px);
        height: 34px;
        min-width: 0;
        overflow: hidden;
      }
      .mark {
        flex: 1 1 0;
        min-width: 2px;
        border-radius: 1px;
        background: var(--accent);
        /* A day with no activity still occupies its slot — absence is data. */
        min-height: 2px;
      }
      .mark.empty {
        background: var(--rule);
      }
      /* Tinted by who did the work, so the operator axis reads without a legend
         once you have seen it twice. */
      .mark[data-who='teacher'] {
        background: var(--accent);
      }
      .mark[data-who='assistant'] {
        background: var(--live);
      }
      .mark[data-who='both'] {
        background: linear-gradient(
          to bottom,
          var(--accent) 0 50%,
          var(--live) 50% 100%
        );
      }
      .mark[data-who='unknown'] {
        background: var(--ink-4);
      }
    `,
  ],
})
export class DayStripComponent {
  /** Daily write totals, oldest first. Zero-filled by the API. */
  readonly values = input.required<readonly number[]>();

  /** Optional per-day teacher-write totals, same length as `values`. */
  readonly teacherValues = input<readonly number[] | null>(null);

  /** Optional per-day assistant-write totals, same length as `values`. */
  readonly assistantValues = input<readonly number[] | null>(null);

  /** Gap between marks. Tighter for a 90-day strip than a 30-day one. */
  readonly gap = input(2);

  /** Spoken description for screen readers and the `title` tooltip. */
  readonly label = computed(() => {
    const v = this.values();
    const active = v.filter((n) => n > 0).length;
    if (active === 0) return 'No activity in this period';
    return `${active} active ${active === 1 ? 'day' : 'days'} out of ${v.length}`;
  });

  protected readonly bars = computed(() => {
    const values = this.values();
    const teacher = this.teacherValues();
    const assistant = this.assistantValues();
    const peak = Math.max(...values, 1);

    return values.map((value, i) => {
      // Square root, so an ordinary day is still legible next to a bulk import.
      const height = value === 0 ? 0 : Math.max(12, (Math.sqrt(value) / Math.sqrt(peak)) * 100);

      let who: 'teacher' | 'assistant' | 'both' | 'unknown' = 'unknown';
      if (value > 0) {
        const t = teacher?.[i] ?? 0;
        const a = assistant?.[i] ?? 0;
        if (t > 0 && a > 0) who = 'both';
        else if (t > 0) who = 'teacher';
        else if (a > 0) who = 'assistant';
      }

      return { height, who };
    });
  });
}
