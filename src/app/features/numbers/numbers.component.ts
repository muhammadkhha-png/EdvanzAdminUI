import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminInsightsService, AdminNumbers } from '../../core/services/admin-insights.service';
import { FEATURE_LABELS } from '../../shared/utils/feature-labels';

/**
 * THE NUMBERS — the landing page.
 *
 * Scoped to SUBSCRIBED teachers. The free and expired accounts outnumber the paying
 * ones roughly three to one, and counting them together made every figure look like
 * a failure when the subscribers were fine.
 *
 * The centrepiece is the feature-adoption table, worst-adopted first — it answers
 * "is he using all the features or not" across the whole base, and it is read to
 * find where the product is not landing, not to admire what already works. Every
 * number links into the teacher list, pre-filtered, so a figure is never a dead end.
 */
@Component({
  selector: 'app-numbers',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page-header">
      <div>
        <h2>The numbers</h2>
        <p>{{ scopeLine() }}</p>
      </div>
      <label class="scope">
        <input type="checkbox" [checked]="!subscribedOnly()" (change)="toggleScope()" />
        Include free and expired
      </label>
    </div>

    @if (data(); as d) {
      <!-- ── The headline, as a sentence ───────────────────────────────── -->
      <section class="panel headline">
        <p class="lead">
          <strong class="tnum">{{ d.active }}</strong> of
          <span class="tnum">{{ d.teachers }}</span>
          {{ d.subscribedOnly ? 'subscribed teachers' : 'teachers' }} taught with Edvanz
          in the last 30 days.
          @if (d.activePrevious > 0) {
            <span class="delta" [attr.data-dir]="d.active >= d.activePrevious ? 'up' : 'down'">
              {{ d.active >= d.activePrevious ? '+' : '' }}{{ d.active - d.activePrevious }}
              vs the month before
            </span>
          }
        </p>

        <dl class="figures">
          <a class="fig" routerLink="/teachers" [queryParams]="{ view: 'set-up' }">
            <dt>Properly set up</dt>
            <dd class="tnum">{{ d.setUp }}</dd>
            <p>Students in a class that has class days</p>
          </a>
          <a class="fig" routerLink="/teachers" [queryParams]="{ view: 'to-contact' }">
            <dt>Need a call</dt>
            <dd class="tnum">{{ d.needAttention }}</dd>
            <p>Stalled, quiet, or paying for features they never opened</p>
          </a>
          <a class="fig" routerLink="/teachers" [queryParams]="{ view: 'not-using' }">
            <dt>Not using it</dt>
            <dd class="tnum">{{ d.teachers - d.active }}</dd>
            <p>Nothing at all in the last 30 days</p>
          </a>
        </dl>
      </section>

      <!-- ── Feature adoption — the centrepiece ────────────────────────── -->
      <section class="panel">
        <div class="panel-head">
          <h3>Which features they actually use</h3>
          <span class="small muted">Counted only among teachers who have each feature</span>
        </div>

        <div class="adoption">
          <div class="ad-head" aria-hidden="true">
            <span>Feature</span>
            <span class="n">Have it</span>
            <span class="n">Using now</span>
            <span class="n">Never opened</span>
            <span>Adoption</span>
          </div>

          @for (f of d.featureAdoption; track f.feature) {
            <a
              class="ad-row"
              routerLink="/teachers"
              [queryParams]="{ view: 'never-used', feature: f.feature }"
              [title]="'See the ' + f.neverUsed + ' who have never opened ' + label(f.feature)"
            >
              <span class="ad-name">{{ label(f.feature) }}</span>
              <span class="n tnum">{{ f.entitled }}</span>
              <span class="n tnum">{{ f.usingNow }}</span>
              <span class="n tnum gap" [class.zero]="f.neverUsed === 0">{{ f.neverUsed }}</span>
              <span class="ad-bar">
                <span class="track">
                  <span class="fill" [style.width.%]="pct(f.everUsed, f.entitled)"></span>
                </span>
                <span class="pct tnum">{{ pct(f.everUsed, f.entitled) }}%</span>
              </span>
            </a>
          }
        </div>
      </section>

      <!-- ── By plan ──────────────────────────────────────────────────── -->
      <section class="panel">
        <div class="panel-head"><h3>By plan</h3></div>
        <div class="plans">
          @for (p of d.byPlan; track p.plan) {
            <div class="plan">
              <span class="p-name">{{ planLabel(p.plan) }}</span>
              <span class="p-main tnum">{{ p.teachers }}</span>
              <span class="p-sub">
                {{ p.active }} active · {{ p.adoptionPercent }}% of their features used
              </span>
            </div>
          }
        </div>
      </section>
    } @else if (loading()) {
      <div class="skeleton"></div>
      <div class="skeleton tall"></div>
    } @else {
      <section class="panel empty">
        <h3>Could not load the numbers</h3>
        <button type="button" class="btn btn-outline-secondary btn-sm" (click)="reload()">
          Try again
        </button>
      </section>
    }
  `,
  styles: [
    `
      .scope {
        display: flex;
        align-items: center;
        gap: var(--s-2);
        font-size: var(--t-sm);
        color: var(--ink-2);
        white-space: nowrap;
      }

      .headline {
        padding: var(--s-5);
        margin-bottom: var(--s-4);
      }
      .lead {
        margin: 0;
        font-size: var(--t-md);
        color: var(--ink-2);
        line-height: 1.5;
      }
      .lead strong {
        font-size: var(--t-num);
        font-weight: 650;
        color: var(--ink);
        line-height: 1;
        letter-spacing: -0.02em;
      }
      .delta {
        margin-left: var(--s-2);
        font-size: var(--t-sm);
        font-weight: 500;
      }
      .delta[data-dir='up'] {
        color: var(--live);
      }
      .delta[data-dir='down'] {
        color: var(--gone);
      }

      .figures {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: var(--s-4);
        margin: var(--s-5) 0 0;
        padding-top: var(--s-4);
        border-top: 1px solid var(--rule);
      }
      .fig {
        text-decoration: none;
        color: inherit;
        min-width: 0;
      }
      .fig:hover dd {
        color: var(--accent);
      }
      .fig dt {
        font-size: var(--t-sm);
        font-weight: 500;
        color: var(--ink-2);
      }
      .fig dd {
        margin: var(--s-1) 0 0;
        font-size: var(--t-lg);
        font-weight: 650;
        line-height: 1;
      }
      .fig p {
        margin: var(--s-1) 0 0;
        font-size: var(--t-xs);
        color: var(--ink-3);
        line-height: 1.4;
      }

      /* ── Adoption table ───────────────────────────────────────────── */
      .ad-head,
      .ad-row {
        display: grid;
        grid-template-columns: minmax(130px, 1.3fr) 5rem 6rem 7.5rem minmax(150px, 1fr);
        align-items: center;
        gap: var(--s-3);
        padding: var(--s-3) var(--s-4);
      }
      .ad-head {
        font-size: var(--t-xs);
        font-weight: 600;
        color: var(--ink-3);
        background: var(--surface-2);
        border-bottom: 1px solid var(--rule-strong);
      }
      .ad-row {
        border-bottom: 1px solid var(--rule);
        text-decoration: none;
        color: inherit;
      }
      .ad-row:last-child {
        border-bottom: 0;
      }
      .ad-row:hover {
        background: var(--surface-2);
      }
      .ad-name {
        font-size: var(--t-sm);
        font-weight: 500;
      }
      .n {
        text-align: right;
        font-size: var(--t-sm);
      }
      /* The only coloured number here: how many pay for it and never opened it. */
      .gap {
        color: var(--risk);
        font-weight: 600;
      }
      .gap.zero {
        color: var(--live);
        font-weight: 400;
      }
      .ad-bar {
        display: flex;
        align-items: center;
        gap: var(--s-2);
      }
      .track {
        flex: 1;
        height: 6px;
        background: var(--quiet-soft);
        border-radius: 3px;
        overflow: hidden;
      }
      .fill {
        display: block;
        height: 100%;
        background: var(--accent);
        border-radius: 3px;
      }
      .pct {
        font-size: var(--t-xs);
        color: var(--ink-3);
        width: 2.5rem;
        text-align: right;
      }

      /* ── Plans ────────────────────────────────────────────────────── */
      .plans {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: var(--s-4);
        padding: var(--s-4);
      }
      .plan {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .p-name {
        font-size: var(--t-sm);
        color: var(--ink-2);
      }
      .p-main {
        font-size: var(--t-lg);
        font-weight: 650;
        line-height: 1;
      }
      .p-sub {
        font-size: var(--t-xs);
        color: var(--ink-3);
      }

      .empty {
        padding: var(--s-6);
        text-align: center;
      }
      .empty h3 {
        margin: 0 0 var(--s-3);
        font-size: var(--t-md);
      }
      .skeleton {
        height: 190px;
        margin-bottom: var(--s-4);
        border-radius: var(--r-md);
        background: linear-gradient(90deg, var(--quiet-soft) 25%, #f3f4f7 50%, var(--quiet-soft) 75%);
        background-size: 200% 100%;
        animation: shimmer 1.4s infinite;
      }
      .skeleton.tall {
        height: 340px;
      }
      @keyframes shimmer {
        to {
          background-position: -200% 0;
        }
      }

      @media (max-width: 767.98px) {
        .ad-head {
          display: none;
        }
        /* Each row becomes a labelled block rather than a table read sideways. */
        .ad-row {
          grid-template-columns: 1fr auto;
          grid-template-areas: 'name never' 'bar bar';
          gap: var(--s-2);
        }
        .ad-name {
          grid-area: name;
        }
        .gap {
          grid-area: never;
        }
        .gap::after {
          content: ' never opened';
          font-weight: 400;
          font-size: var(--t-xs);
          color: var(--ink-3);
        }
        .ad-row .n:not(.gap) {
          display: none;
        }
        .ad-bar {
          grid-area: bar;
        }
      }
    `,
  ],
})
export class NumbersComponent implements OnInit {
  private readonly insights = inject(AdminInsightsService);

  protected readonly data = signal<AdminNumbers | null>(null);
  protected readonly loading = signal(true);
  protected readonly subscribedOnly = signal(true);

  ngOnInit(): void {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.insights.getNumbers(this.subscribedOnly()).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected toggleScope(): void {
    this.subscribedOnly.update((v) => !v);
    this.reload();
  }

  protected scopeLine(): string {
    return this.subscribedOnly()
      ? 'Teachers with a live subscription. Free and expired accounts are left out.'
      : 'Every teacher, including free and expired accounts.';
  }

  /** Share of the ENTITLED who have ever used it — never a share of everyone. */
  protected pct(used: number, entitled: number): number {
    if (entitled === 0) return 0;
    return Math.round((used / entitled) * 100);
  }

  protected label(feature: string): string {
    return FEATURE_LABELS[feature] ?? feature;
  }

  protected planLabel(plan: string): string {
    return PLAN_LABELS[plan] ?? plan;
  }
}

const PLAN_LABELS: Record<string, string> = {
  Full: 'Full',
  Managerial: 'Managerial',
  ManagerialPlus: 'Managerial + Parents',
  None: 'No plan',
};
