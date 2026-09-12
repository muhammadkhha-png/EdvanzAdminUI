import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ConsoleTrendPoint } from '../../core/services/admin-console.service';

/**
 * Registrations and new subscriptions per period, with the subscriber level over them.
 *
 * FORM: the two flows (what happened during the period) are bars, because a count
 * per bucket is a discrete quantity; the level (how many subscribers existed at the
 * end) is a line, because it is a continuous state. One y-axis — all three are counts
 * of teachers, so a second scale would be the dual-axis lie.
 *
 * COLOR: a dedicated categorical trio, validated for colour-vision deficiency
 * (worst adjacent pair ΔE 19.6 deutan / 25.0 normal). Deliberately NOT the page's
 * green/amber/red, which mean healthy/slipping/lost here — reusing a status colour
 * as "series 3" would make a chart series look like a verdict.
 */
@Component({
  selector: 'app-console-trend-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="legend">
      @for (s of series; track s.key) {
        <span class="key">
          <span class="swatch" [style.background]="s.color" [class.line]="s.isLine"></span>
          {{ s.label }}
        </span>
      }
    </div>

    <!-- Wide content scrolls inside its OWN container; the page body never scrolls
         sideways. Twelve buckets cannot be legible at 375px any other way. -->
    <div class="scroller" role="group" [attr.aria-label]="ariaSummary()">
      <svg
        [attr.viewBox]="'0 0 ' + W + ' ' + H"
        [style.min-width.px]="minWidth()"
        role="img"
        [attr.aria-label]="ariaSummary()"
      >
        <!-- Grid: recessive, and only where a value is read off it. -->
        @for (t of ticks(); track t.value) {
          <line class="grid" [attr.x1]="PAD_L" [attr.x2]="W - PAD_R" [attr.y1]="t.y" [attr.y2]="t.y" />
          <text class="axis" [attr.x]="PAD_L - 8" [attr.y]="t.y + 4" text-anchor="end">{{ t.value }}</text>
        }

        @for (c of columns(); track c.label) {
          <!-- One hit target per period, wider than the marks, so hovering anywhere
               in the column works rather than only exactly on a 10px bar. -->
          <rect
            class="hit"
            [class.on]="hovered() === c.index"
            [attr.x]="c.x"
            [attr.y]="PAD_T"
            [attr.width]="bandWidth()"
            [attr.height]="H - PAD_T - PAD_B"
            (mouseenter)="hovered.set(c.index)"
            (mouseleave)="hovered.set(null)"
          />

          <rect
            class="bar"
            [attr.x]="c.regX"
            [attr.y]="c.regY"
            [attr.width]="barWidth()"
            [attr.height]="c.regH"
            [attr.fill]="series[0].color"
            rx="4"
          />
          <rect
            class="bar"
            [attr.x]="c.subX"
            [attr.y]="c.subY"
            [attr.width]="barWidth()"
            [attr.height]="c.subH"
            [attr.fill]="series[1].color"
            rx="4"
          />

          <text class="axis" [attr.x]="c.x + bandWidth() / 2" [attr.y]="H - 12" text-anchor="middle">
            {{ c.label }}
          </text>
        }

        <!-- The level, drawn over the bars. 2px, with markers big enough to hit. -->
        <polyline class="level" [attr.points]="levelPoints()" [attr.stroke]="series[2].color" />
        @for (c of columns(); track c.label) {
          <circle
            class="dot"
            [attr.cx]="c.x + bandWidth() / 2"
            [attr.cy]="c.levelY"
            r="4"
            [attr.fill]="series[2].color"
          />
        }
      </svg>
    </div>

    <!-- The tooltip is HTML, not SVG: it wraps, it inherits type tokens, and it can
         be read by a screen reader as ordinary text. -->
    @if (hoveredPoint(); as p) {
      <div class="tip">
        <strong>{{ p.label }}</strong>
        <span><i [style.background]="series[0].color"></i>{{ p.registrations }} registered</span>
        <span><i [style.background]="series[1].color"></i>{{ p.newSubscriptions }} subscribed</span>
        <span><i [style.background]="series[2].color"></i>{{ p.subscribersAtEnd }} subscribers by the end</span>
      </div>
    }

    <!-- Identity is never colour alone: the same numbers, as text. -->
    <details class="table">
      <summary>See the numbers as a table</summary>
      <div class="scroller">
        <table>
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Registered</th>
              <th scope="col">Subscribed</th>
              <th scope="col">Subscribers by the end</th>
            </tr>
          </thead>
          <tbody>
            @for (p of points(); track p.periodStart) {
              <tr>
                <th scope="row">{{ p.label }}</th>
                <td class="tnum">{{ p.registrations }}</td>
                <td class="tnum">{{ p.newSubscriptions }}</td>
                <td class="tnum">{{ p.subscribersAtEnd }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </details>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }

      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-4);
        margin-bottom: var(--s-3);
        font-size: var(--t-sm);
        color: var(--ink-2);
      }
      .key {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .swatch {
        width: 12px;
        height: 12px;
        border-radius: 3px;
      }
      .swatch.line {
        height: 3px;
        border-radius: 2px;
      }

      .scroller {
        overflow-x: auto;
        overflow-y: hidden;
        -webkit-overflow-scrolling: touch;
      }

      svg {
        width: 100%;
        height: auto;
        display: block;
      }

      .grid {
        stroke: var(--rule);
        stroke-width: 1;
      }

      .axis {
        font-size: 11px;
        fill: var(--ink-3);
      }

      .hit {
        fill: transparent;
      }
      .hit.on {
        fill: var(--quiet-soft);
      }

      .level {
        fill: none;
        stroke-width: 2;
        stroke-linejoin: round;
        stroke-linecap: round;
      }

      /* A surface-coloured ring keeps the dots readable where they sit on a bar. */
      .dot {
        stroke: var(--surface);
        stroke-width: 2;
      }

      .tip {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--s-2) var(--s-4);
        margin-top: var(--s-3);
        padding: var(--s-2) var(--s-3);
        background: var(--quiet-soft);
        border-radius: var(--r-sm);
        font-size: var(--t-sm);
        color: var(--ink-2);
      }
      .tip i {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 2px;
        margin-right: 6px;
      }

      .table {
        margin-top: var(--s-3);
        font-size: var(--t-sm);
      }
      .table summary {
        cursor: pointer;
        color: var(--ink-3);
      }
      .table summary:hover {
        color: var(--accent);
      }
      .table table {
        width: 100%;
        border-collapse: collapse;
        margin-top: var(--s-2);
      }
      .table th,
      .table td {
        padding: var(--s-2) var(--s-3);
        text-align: left;
        white-space: nowrap;
      }
      .table thead th {
        font-size: var(--t-xs);
        color: var(--ink-3);
        font-weight: 600;
      }
      .table tbody tr:nth-child(even) {
        background: var(--surface-2);
      }
      .table td {
        text-align: right;
      }
    `,
  ],
})
export class ConsoleTrendChartComponent {
  readonly points = input.required<ConsoleTrendPoint[]>();

  protected readonly hovered = signal<number | null>(null);

  /** Fixed hue order — a series keeps its colour whatever else is on the chart. */
  protected readonly series = [
    { key: 'reg', label: 'Registered', color: '#1d4ed8', isLine: false },
    { key: 'sub', label: 'Subscribed', color: '#0d9488', isLine: false },
    { key: 'lvl', label: 'Subscribers by the end', color: '#9333ea', isLine: true },
  ];

  protected readonly W = 760;
  protected readonly H = 260;
  protected readonly PAD_L = 34;
  protected readonly PAD_R = 8;
  protected readonly PAD_T = 12;
  protected readonly PAD_B = 30;

  protected readonly hoveredPoint = computed(() => {
    const i = this.hovered();
    return i === null ? null : (this.points()[i] ?? null);
  });

  /** Below this the twelve buckets collide, so the chart scrolls instead of shrinking. */
  protected readonly minWidth = computed(() => Math.max(480, this.points().length * 56));

  private readonly max = computed(() => {
    const vals = this.points().flatMap((p) => [
      p.registrations,
      p.newSubscriptions,
      p.subscribersAtEnd,
    ]);
    // A floor of 1 keeps an all-zero chart from dividing by zero and drawing bars
    // of infinite height on a platform's first quiet week.
    return Math.max(1, ...vals);
  });

  protected readonly bandWidth = computed(
    () => (this.W - this.PAD_L - this.PAD_R) / Math.max(1, this.points().length),
  );

  /** Two bars plus a 2px surface gap between them, inside the band. */
  protected readonly barWidth = computed(() => Math.max(4, this.bandWidth() * 0.3 - 1));

  protected readonly ticks = computed(() => {
    const max = this.max();
    const step = niceStep(max);
    const out: { value: number; y: number }[] = [];
    for (let v = 0; v <= max; v += step) out.push({ value: v, y: this.y(v) });
    return out;
  });

  protected readonly columns = computed(() =>
    this.points().map((p, index) => {
      const band = this.bandWidth();
      const bw = this.barWidth();
      const x = this.PAD_L + index * band;
      const centre = x + band / 2;

      return {
        index,
        label: p.label,
        x,
        regX: centre - bw - 1,
        regY: this.y(p.registrations),
        regH: Math.max(0, this.y(0) - this.y(p.registrations)),
        subX: centre + 1,
        subY: this.y(p.newSubscriptions),
        subH: Math.max(0, this.y(0) - this.y(p.newSubscriptions)),
        levelY: this.y(p.subscribersAtEnd),
      };
    }),
  );

  protected readonly levelPoints = computed(() =>
    this.columns()
      .map((c) => `${c.x + this.bandWidth() / 2},${c.levelY}`)
      .join(' '),
  );

  /** The chart in one sentence, for anyone who cannot see it. */
  protected readonly ariaSummary = computed(() => {
    const pts = this.points();
    if (pts.length === 0) return 'No periods to show yet.';
    const first = pts[0];
    const last = pts[pts.length - 1];
    return (
      `Registrations, new subscriptions and subscriber count by period, ` +
      `${first.label} to ${last.label}. ` +
      `Latest period: ${last.registrations} registered, ${last.newSubscriptions} subscribed, ` +
      `${last.subscribersAtEnd} subscribers by the end.`
    );
  });

  private y(value: number): number {
    const plot = this.H - this.PAD_T - this.PAD_B;
    return this.PAD_T + plot - (value / this.max()) * plot;
  }
}

/** Round axis steps — 1, 2, 5, 10, 20, 50… so gridlines land on readable numbers. */
function niceStep(max: number): number {
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return Math.max(1, step * mag);
}
