import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  AdminConsoleService,
  ConsoleDashboard,
  ConsoleSegmentTeacher,
  ConsoleStat,
  ConsoleTrends,
} from '../../core/services/admin-console.service';
import { TeacherMiniRowComponent } from '../../shared/components/teacher-mini-row/teacher-mini-row.component';
import { ConsoleTrendChartComponent } from './console-trend-chart.component';
import { FEATURE_LABELS } from '../../shared/utils/feature-labels';
import { formatDate } from '../../shared/utils/time-format';

/** How many people load at a time inside an opened card. */
const SEGMENT_PAGE = 15;

/**
 * THE CONSOLE.
 *
 * Two questions get asked here every morning — "what's new since yesterday" and
 * "how is the business doing" — and the answer to both has to end in a phone call.
 * So the page is a BRIEFING rather than a grid of tiles: each answer is a sentence
 * with a number in it, and every number opens the people inside it, in place.
 *
 * THE VISUAL DEVICE IS COLOUR, NOT RULES OR CARDS. A stat sits on a soft tint of its
 * own meaning — green for healthy, amber for slipping, red for lost, ink for a plain
 * fact — and separation comes from that tint plus space. No borders, no identical
 * rounded cards with the same grey shadow under each, no hairline register. The one
 * bold element is the expansion: a card opens a full-width region directly beneath
 * its row, carrying its own colour down the spine so it reads as THAT card opening
 * rather than as a second card appearing.
 */
@Component({
  selector: 'app-console-dashboard',
  standalone: true,
  // NgTemplateOutlet is explicit: without it the *ngTemplateOutlet bindings compile
  // to nothing and the expanding region silently never renders.
  imports: [NgTemplateOutlet, RouterLink, TeacherMiniRowComponent, ConsoleTrendChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <div>
        <h1>Console</h1>
        @if (data(); as d) {
          <p class="fresh">
            Figures are complete through {{ prettyDay(d.computedThrough) }}.
            @if (d.teachersNotYetComputed > 0) {
              <span class="warn">
                {{ d.teachersNotYetComputed }} teacher{{ d.teachersNotYetComputed === 1 ? '' : 's' }}
                not counted yet — they registered after last night's run.
              </span>
            }
          </p>
        }
      </div>

      <div class="window" role="group" aria-label="Time window for new figures">
        @for (w of windows; track w) {
          <button
            type="button"
            [class.on]="windowDays() === w"
            (click)="setWindow(w)"
            [attr.aria-pressed]="windowDays() === w"
          >
            {{ w }} days
          </button>
        }
      </div>
    </header>

    @if (data(); as d) {
      @if (error()) {
        <p class="stale" role="status">
          {{ error() }} These figures are from the last successful load.
          <button type="button" class="retry" (click)="load()">Try again</button>
        </p>
      }
      <!-- ── A. Since yesterday ─────────────────────────────────────────── -->
      <section>
        <h2>Since yesterday</h2>
        <p class="sub">What changed on {{ prettyDay(d.yesterday.date) }}.</p>

        <div class="grid">
          @for (c of yesterdayCards(); track c.key) {
            <button
              type="button"
              class="stat"
              [attr.data-tone]="c.tone"
              [class.open]="openKey() === c.segmentKey"
              [disabled]="c.count === 0"
              (click)="toggle(c.segmentKey)"
              [attr.aria-expanded]="openKey() === c.segmentKey"
            >
              <span class="n tnum">{{ c.count }}</span>
              <span class="label">{{ c.label }}</span>
              <span class="cap">{{ c.caption }}</span>
              @if (c.names.length) {
                <span class="names">{{ c.names.join(' · ') }}</span>
              }
            </button>
          }
        </div>

        @if (isOpenIn(yesterdayKeys())) {
          <ng-container *ngTemplateOutlet="panel" />
        }
      </section>

      <!-- ── B. Growth & subscriptions ──────────────────────────────────── -->
      <section>
        <h2>How the business is doing</h2>
        <p class="sub">
          Independent teachers only. Teachers who belong to a centre are counted on their
          own card — their money is the centre's.
        </p>

        <div class="grid">
          @for (c of growthCards(); track c.key) {
            <button
              type="button"
              class="stat"
              [attr.data-tone]="c.tone"
              [class.open]="openKey() === c.segmentKey"
              [disabled]="!c.segmentKey || c.count === 0"
              (click)="toggle(c.segmentKey)"
              [attr.aria-expanded]="openKey() === c.segmentKey"
            >
              <span class="n tnum">{{ c.count }}</span>
              <span class="label">{{ c.label }}</span>
              <span class="cap">{{ c.caption }}</span>
              @if (c.delta !== null) {
                <span class="delta">{{ c.delta > 0 ? '+' : '' }}{{ c.delta }} in {{ windowDays() }} days</span>
              }
            </button>
          }
        </div>

        @if (isOpenIn(growthKeys())) {
          <ng-container *ngTemplateOutlet="panel" />
        }

        <p class="plans">
          @for (p of d.growth.byPlan; track p.key) {
            <span class="plan"><b class="tnum">{{ p.count }}</b> on {{ planLabel(p.key) }}</span>
          }
        </p>
      </section>

      <!-- ── C. Are subscribers using it ────────────────────────────────── -->
      <section>
        <h2>Are subscribers using it</h2>
        <p class="sub">
          Out of {{ d.usage.subscribers }} teachers paying right now. "Using it" means they
          did something real in the app — not that they logged in.
        </p>

        <div class="grid">
          @for (c of usageCards(); track c.key) {
            <button
              type="button"
              class="stat"
              [attr.data-tone]="c.tone"
              [class.open]="openKey() === c.segmentKey"
              [disabled]="!c.segmentKey || c.count === 0"
              (click)="toggle(c.segmentKey)"
              [attr.aria-expanded]="openKey() === c.segmentKey"
            >
              <span class="n tnum">{{ c.count }}</span>
              <span class="label">{{ c.label }}</span>
              <span class="cap">{{ c.caption }}</span>
            </button>
          }
        </div>

        @if (isOpenIn(usageKeys())) {
          <ng-container *ngTemplateOutlet="panel" />
        }

        <p class="gap" [class.amber]="d.usage.totalStudents > d.usage.totalStudentsInClasses">
          <b class="tnum">{{ d.usage.totalStudents }}</b> students uploaded ·
          <b class="tnum">{{ d.usage.totalStudentsInClasses }}</b> of them in a class.
          @if (d.usage.totalStudents > d.usage.totalStudentsInClasses) {
            <span>
              {{ d.usage.totalStudents - d.usage.totalStudentsInClasses }} students are not in
              any class, so those students open an empty app.
            </span>
          }
        </p>
      </section>

      <!-- ── D. Feature by feature ──────────────────────────────────────── -->
      <section>
        <h2>Feature by feature</h2>
        <p class="sub">
          Counted only among subscribers who actually have each feature — a plan without
          videos is not a teacher ignoring videos.
        </p>

        <div class="t-scroll">
          <table class="features">
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col">Have it</th>
                <th scope="col">Used it in 30 days</th>
                <th scope="col">Never opened it</th>
              </tr>
            </thead>
            <tbody>
              @for (f of d.features; track f.feature) {
                <tr>
                  <th scope="row">{{ featureLabel(f.feature) }}</th>
                  <td>
                    <button type="button" class="cell" (click)="toggle(f.haveItSegmentKey)">
                      {{ f.haveIt }}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      class="cell live"
                      [disabled]="f.using30 === 0"
                      (click)="toggle(f.usingSegmentKey)"
                    >
                      {{ f.using30 }}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      class="cell gone"
                      [disabled]="f.neverOpened === 0"
                      (click)="toggle(f.neverOpenedSegmentKey)"
                    >
                      {{ f.neverOpened }}
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (isOpenIn(featureKeys())) {
          <ng-container *ngTemplateOutlet="panel" />
        }
      </section>

      <!-- ── E. Money ───────────────────────────────────────────────────── -->
      <section>
        <h2>Money</h2>

        <div class="grid">
          <div class="stat flat" data-tone="money">
            <span class="n tnum">{{ money(d.money.activeValueEGP) }}</span>
            <span class="label">Active subscriptions, per month</span>
            <span class="cap">What today's live subscriptions are worth at today's prices.</span>
          </div>

          @if (d.money.latestRenewals; as r) {
            <button
              type="button"
              class="stat"
              [attr.data-tone]="r.churned > r.renewed ? 'gone' : 'live'"
              [class.open]="openKey() === r.churnedSegmentKey"
              [disabled]="r.churned === 0"
              (click)="toggle(r.churnedSegmentKey)"
              [attr.aria-expanded]="openKey() === r.churnedSegmentKey"
            >
              <span class="n tnum">{{ r.churned }}</span>
              <span class="label">Did not come back in {{ r.label }}</span>
              <span class="cap">
                Of {{ r.ended }} whose subscription ended, {{ r.renewed }} renewed.
              </span>
            </button>
          }

          <button
            type="button"
            class="stat"
            data-tone="live"
            [class.open]="openKey() === d.money.renewedAtLeastOnce.segmentKey"
            [disabled]="d.money.renewedAtLeastOnce.count === 0"
            (click)="toggle(d.money.renewedAtLeastOnce.segmentKey)"
            [attr.aria-expanded]="openKey() === d.money.renewedAtLeastOnce.segmentKey"
          >
            <span class="n tnum">{{ d.money.renewedAtLeastOnce.count }}</span>
            <span class="label">Paid more than once</span>
            <span class="cap">They came back after the free month.</span>
          </button>

          <button
            type="button"
            class="stat"
            data-tone="quiet"
            [class.open]="openKey() === d.money.firstSubscriptionOnly.segmentKey"
            [disabled]="d.money.firstSubscriptionOnly.count === 0"
            (click)="toggle(d.money.firstSubscriptionOnly.segmentKey)"
            [attr.aria-expanded]="openKey() === d.money.firstSubscriptionOnly.segmentKey"
          >
            <span class="n tnum">{{ d.money.firstSubscriptionOnly.count }}</span>
            <span class="label">Still on their first subscription</span>
            <span class="cap">They have not renewed yet.</span>
          </button>
        </div>

        @if (isOpenIn(moneyKeys())) {
          <ng-container *ngTemplateOutlet="panel" />
        }

        @if (d.money.pending.total > 0) {
          <div class="pending">
            <b>{{ d.money.pending.total }} waiting for a decision</b>
            @if (d.money.pending.totalEGP > 0) {
              <span>· {{ money(d.money.pending.totalEGP) }}</span>
            }
            <span class="links">
              @if (d.money.pending.subscriptionRequests > 0) {
                <a routerLink="/subscription-requests">
                  {{ d.money.pending.subscriptionRequests }} subscription requests
                </a>
              }
              @if (d.money.pending.centerSubscriptionRequests > 0) {
                <a routerLink="/center-subscription-requests">
                  {{ d.money.pending.centerSubscriptionRequests }} centre requests
                </a>
              }
              @if (d.money.pending.teacherIndependenceRequests > 0) {
                <a routerLink="/teacher-independence-requests">
                  {{ d.money.pending.teacherIndependenceRequests }} independence requests
                </a>
              }
            </span>
          </div>
        }
      </section>

      <!-- ── F. Growth over time ────────────────────────────────────────── -->
      <section>
        <div class="sec-head">
          <div>
            <h2>Growth over time</h2>
            <p class="sub">The last twelve {{ granularity() === 'Weekly' ? 'weeks' : 'months' }}.</p>
          </div>
          <div class="window" role="group" aria-label="Chart period">
            <button
              type="button"
              [class.on]="granularity() === 'Weekly'"
              (click)="setGranularity('Weekly')"
              [attr.aria-pressed]="granularity() === 'Weekly'"
            >
              Weekly
            </button>
            <button
              type="button"
              [class.on]="granularity() === 'Monthly'"
              (click)="setGranularity('Monthly')"
              [attr.aria-pressed]="granularity() === 'Monthly'"
            >
              Monthly
            </button>
          </div>
        </div>

        @if (trends(); as t) {
          <app-console-trend-chart [points]="t.points" />
        } @else {
          <div class="sk-chart"></div>
        }
      </section>

      <!-- ── G. Platform totals ─────────────────────────────────────────── -->
      <section class="totals">
        <h2>Everything on the platform</h2>
        <p>
          <b class="tnum">{{ d.platform.teachersTotal }}</b> teachers
          ({{ d.platform.teachersIndependent }} on their own,
          <button type="button" class="inline" (click)="toggle(d.growth.centerTeachers.segmentKey)">
            {{ d.platform.teachersCenterOwned }} in a centre</button>) ·
          <b class="tnum">{{ d.platform.students }}</b> students ·
          <b class="tnum">{{ d.platform.linkedStudentAccounts }}</b> student app accounts ·
          <b class="tnum">{{ d.platform.assistants }}</b> assistants ·
          <b class="tnum">{{ d.platform.centers }}</b> centres
        </p>
        @if (isOpenIn([d.growth.centerTeachers.segmentKey])) {
          <ng-container *ngTemplateOutlet="panel" />
        }
      </section>
    } @else if (error()) {
      <div class="empty">
        <h2>The console could not load</h2>
        <p>{{ error() }}</p>
        <button type="button" class="retry" (click)="load()">Try again</button>
      </div>
    } @else {
      <div class="skeleton" aria-live="polite" aria-busy="true">
        <span class="sr">Loading the console</span>
        @for (i of skeletonBlocks; track i) {
          <div class="sk-block"></div>
        }
      </div>
    }

    <!-- ── The expanding region ──────────────────────────────────────────
         ONE template, rendered beneath whichever section holds the open card.
         It carries that card's colour down its left edge, so it reads as the
         card opening rather than as a new card arriving. -->
    <ng-template #panel>
      <div class="panel" [attr.data-tone]="openTone()" role="region" [attr.aria-label]="openTitle()">
        <div class="p-head">
          <h3>{{ openTitle() }}</h3>
          <div class="p-tools">
            <!-- Search INSIDE the list. A drill-down runs to hundreds of people and
                 someone looking for one of them should not page through the rest.
                 It filters on the server, so it searches the whole list rather than
                 the fifteen rows that happen to be loaded. -->
            <input
              type="search"
              class="p-search"
              placeholder="Search this list"
              [attr.aria-label]="'Search ' + openTitle()"
              [value]="segmentSearch()"
              (input)="onSearch($event)"
            />
            <button
              type="button"
              class="p-export"
              [disabled]="exporting() || segmentTotal() === 0"
              (click)="exportSegment()"
            >
              {{ exporting() ? 'Preparing…' : 'Export CSV' }}
            </button>
            <button type="button" class="close" (click)="toggle(null)" aria-label="Close this list">
              Close
            </button>
          </div>
        </div>

        @if (segmentLoading() && segmentRows().length === 0) {
          @for (i of skeletonRows; track i) {
            <div class="sk-row"></div>
          }
        } @else if (segmentRows().length === 0) {
          <p class="p-empty">
            @if (segmentSearch()) {
              Nobody in this list matches "{{ segmentSearch() }}".
            } @else {
              Nobody is in this list.
            }
          </p>
        } @else {
          @for (t of segmentRows(); track t.teacherId) {
            <app-teacher-mini-row [t]="t" />
          }

          <div class="p-foot">
            <span>Showing {{ segmentRows().length }} of {{ segmentTotal() }}</span>
            @if (segmentRows().length < segmentTotal()) {
              <button type="button" class="more" [disabled]="segmentLoading()" (click)="loadMore()">
                {{ segmentLoading() ? 'Loading…' : 'Show more' }}
              </button>
            }
          </div>
        }
      </div>
    </ng-template>
  `,
  styles: [
    `
      :host {
        display: block;
        padding: var(--s-5) var(--s-5) var(--s-7);
        max-width: 1180px;
        /* The page body never scrolls sideways; wide things scroll inside themselves. */
        overflow-x: hidden;
      }

      /* ── Head ──────────────────────────────────────────────────────────── */
      .head {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--s-4);
        margin-bottom: var(--s-6);
      }
      h1 {
        margin: 0;
        font-size: var(--t-xl);
        font-weight: 700;
        letter-spacing: -0.02em;
        color: var(--ink);
      }
      .fresh {
        margin: var(--s-2) 0 0;
        font-size: var(--t-sm);
        color: var(--ink-3);
        max-width: 70ch;
      }
      .fresh .warn {
        color: var(--risk);
      }

      .window {
        display: inline-flex;
        gap: 2px;
        padding: 3px;
        background: var(--quiet-soft);
        border-radius: var(--r-sm);
      }
      .window button {
        min-height: 36px;
        padding: 0 var(--s-3);
        border: 0;
        border-radius: 3px;
        background: transparent;
        font: inherit;
        font-size: var(--t-sm);
        color: var(--ink-2);
        cursor: pointer;
      }
      .window button.on {
        background: var(--surface);
        color: var(--ink);
        font-weight: 600;
      }
      .window button:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 1px;
      }

      /* ── Sections ──────────────────────────────────────────────────────── */
      section {
        margin-bottom: var(--s-7);
      }
      .sec-head {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--s-4);
      }
      h2 {
        margin: 0;
        font-size: var(--t-lg);
        font-weight: 650;
        letter-spacing: -0.01em;
        color: var(--ink);
      }
      .sub {
        margin: var(--s-2) 0 var(--s-4);
        font-size: var(--t-sm);
        color: var(--ink-3);
        max-width: 72ch;
      }

      /* ── The stat blocks ───────────────────────────────────────────────
         No border and no shadow. A soft tint of the stat's own meaning does
         the grouping, and space does the separating. */
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(215px, 1fr));
        gap: var(--s-3);
      }

      .stat {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        padding: var(--s-4);
        border: 0;
        border-radius: var(--r-md);
        background: var(--quiet-soft);
        text-align: left;
        font: inherit;
        cursor: pointer;
        transition: background-color 160ms ease;
      }
      .stat.flat {
        cursor: default;
      }
      .stat:disabled {
        cursor: default;
        opacity: 0.72;
      }
      .stat:not(:disabled):not(.flat):hover {
        background: var(--tone-hover, var(--rule));
      }
      .stat:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      /* The open card keeps its colour but gains weight, so it is obvious which
         one the region below belongs to. */
      .stat.open {
        box-shadow: inset 0 0 0 2px var(--tone-ink, var(--ink-3));
      }

      .n {
        font-size: var(--t-num);
        font-weight: 700;
        line-height: 1.05;
        letter-spacing: -0.03em;
        color: var(--tone-ink, var(--ink));
      }
      .label {
        font-size: var(--t-base);
        font-weight: 600;
        color: var(--ink);
      }
      .cap {
        font-size: var(--t-xs);
        color: var(--ink-3);
        line-height: 1.4;
      }
      .names {
        margin-top: var(--s-2);
        font-size: var(--t-xs);
        color: var(--ink-2);
        line-height: 1.5;
      }
      .delta {
        margin-top: var(--s-1);
        font-size: var(--t-xs);
        font-weight: 600;
        color: var(--tone-ink, var(--ink-2));
      }

      /* ── The tones. This is the whole visual system. ───────────────────── */
      [data-tone='live'] {
        background: var(--live-soft);
        --tone-ink: var(--live);
        --tone-hover: #d3ece6;
      }
      [data-tone='risk'] {
        background: var(--risk-soft);
        --tone-ink: var(--risk);
        --tone-hover: #f8e5cd;
      }
      [data-tone='gone'] {
        background: var(--gone-soft);
        --tone-ink: var(--gone);
        --tone-hover: #f8d8e1;
      }
      [data-tone='quiet'] {
        background: var(--quiet-soft);
        --tone-ink: var(--ink-2);
        --tone-hover: var(--rule);
      }
      [data-tone='money'] {
        background: var(--accent-soft);
        --tone-ink: var(--accent-ink);
        --tone-hover: #dde7ff;
      }

      /* ── Plans / gap / pending lines ───────────────────────────────────── */
      .plans,
      .gap,
      .pending {
        margin: var(--s-4) 0 0;
        font-size: var(--t-sm);
        color: var(--ink-2);
      }
      .plans {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-4);
      }
      .gap.amber {
        color: var(--risk);
      }
      .pending {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--s-2) var(--s-3);
        padding: var(--s-3) var(--s-4);
        background: var(--accent-soft);
        border-radius: var(--r-md);
        color: var(--accent-ink);
      }
      .pending .links {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-3);
      }
      .pending a {
        color: var(--accent-ink);
      }

      /* ── Feature table ─────────────────────────────────────────────────── */
      .t-scroll {
        overflow-x: auto;
      }
      .features {
        width: 100%;
        min-width: 460px;
        border-collapse: collapse;
        font-size: var(--t-sm);
      }
      .features th,
      .features td {
        padding: var(--s-2) var(--s-3);
        text-align: left;
      }
      .features thead th {
        font-size: var(--t-xs);
        font-weight: 600;
        color: var(--ink-3);
      }
      .features tbody tr:nth-child(odd) {
        background: var(--surface-2);
      }
      .features tbody th {
        font-weight: 600;
        color: var(--ink);
      }
      .features td {
        text-align: right;
      }
      .cell {
        min-width: 44px;
        min-height: 36px;
        padding: 0 var(--s-2);
        border: 0;
        border-radius: var(--r-sm);
        background: transparent;
        font: inherit;
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        color: var(--ink-2);
        cursor: pointer;
      }
      .cell:not(:disabled):hover {
        background: var(--quiet-soft);
        color: var(--ink);
      }
      .cell:disabled {
        cursor: default;
        color: var(--ink-4);
      }
      .cell.live:not(:disabled) {
        color: var(--live);
      }
      .cell.gone:not(:disabled) {
        color: var(--gone);
      }
      .cell:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 1px;
      }

      /* ── The expansion ─────────────────────────────────────────────────── */
      .panel {
        margin-top: var(--s-3);
        padding: var(--s-4) var(--s-4) var(--s-3);
        border-left: 3px solid var(--tone-ink, var(--ink-3));
        border-radius: 0 var(--r-md) var(--r-md) 0;
        background: var(--surface);
        animation: open 180ms ease;
      }
      @keyframes open {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .panel {
          animation: none;
        }
      }

      .p-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--s-3);
        margin-bottom: var(--s-2);
      }
      .p-tools {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--s-2);
      }
      .p-search {
        min-height: 40px;
        min-width: 200px;
        padding: 0 var(--s-3);
        border: 1px solid var(--rule-strong);
        border-radius: var(--r-sm);
        background: var(--surface);
        font: inherit;
        font-size: var(--t-sm);
        color: var(--ink);
      }
      .p-search:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 1px;
        border-color: var(--accent);
      }
      .p-export {
        min-height: 40px;
        padding: 0 var(--s-3);
        border: 0;
        border-radius: var(--r-sm);
        background: var(--accent-soft);
        font: inherit;
        font-size: var(--t-sm);
        font-weight: 600;
        color: var(--accent-ink);
        cursor: pointer;
      }
      .p-export:hover:not(:disabled) {
        background: #dde7ff;
      }
      .p-export:disabled {
        opacity: 0.55;
        cursor: default;
      }
      .p-export:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      .p-head h3 {
        margin: 0;
        font-size: var(--t-base);
        font-weight: 650;
        color: var(--ink);
      }
      .close,
      .more,
      .retry {
        min-height: 40px;
        padding: 0 var(--s-3);
        border: 0;
        border-radius: var(--r-sm);
        background: var(--quiet-soft);
        font: inherit;
        font-size: var(--t-sm);
        font-weight: 600;
        color: var(--ink-2);
        cursor: pointer;
      }
      .close:hover,
      .more:hover,
      .retry:hover {
        background: var(--rule);
        color: var(--ink);
      }
      .close:focus-visible,
      .more:focus-visible,
      .retry:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }

      app-teacher-mini-row + app-teacher-mini-row {
        border-top: 1px solid var(--rule);
      }

      .p-empty {
        margin: 0;
        padding: var(--s-3) 0;
        font-size: var(--t-sm);
        color: var(--ink-3);
      }
      .p-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s-3);
        padding-top: var(--s-3);
        font-size: var(--t-xs);
        color: var(--ink-3);
      }

      /* ── Totals ────────────────────────────────────────────────────────── */
      .totals p {
        margin: 0;
        font-size: var(--t-sm);
        color: var(--ink-2);
        line-height: 1.9;
      }
      .inline {
        border: 0;
        padding: 0;
        background: none;
        font: inherit;
        font-weight: 700;
        color: var(--accent);
        cursor: pointer;
        text-decoration: underline;
      }

      /* ── Loading & empty ───────────────────────────────────────────────── */
      .skeleton {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(215px, 1fr));
        gap: var(--s-3);
      }
      .sk-block,
      .sk-row,
      .sk-chart {
        border-radius: var(--r-md);
        background: linear-gradient(90deg, var(--quiet-soft), var(--rule), var(--quiet-soft));
        background-size: 200% 100%;
        animation: shimmer 1.4s linear infinite;
      }
      .sk-block {
        height: 118px;
      }
      .sk-row {
        height: 56px;
        margin-bottom: var(--s-2);
      }
      .sk-chart {
        height: 260px;
      }
      @keyframes shimmer {
        to {
          background-position: -200% 0;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .sk-block,
        .sk-row,
        .sk-chart {
          animation: none;
        }
      }

      /* A failed REFRESH keeps the last good figures on screen rather than blanking
         the page, and says so. A blank console reads as "the business stopped". */
      .stale {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--s-3);
        margin: 0 0 var(--s-5);
        padding: var(--s-3) var(--s-4);
        background: var(--risk-soft);
        border-radius: var(--r-md);
        font-size: var(--t-sm);
        color: var(--risk);
      }

      .empty {
        padding: var(--s-7) 0;
        text-align: center;
      }
      .empty h2 {
        margin-bottom: var(--s-2);
      }
      .empty p {
        color: var(--ink-3);
        margin-bottom: var(--s-4);
      }

      .sr {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
      }

      @media (max-width: 640px) {
        :host {
          padding: var(--s-4) var(--s-3) var(--s-6);
        }
        .grid {
          grid-template-columns: 1fr;
        }
        .panel {
          border-radius: 0 var(--r-sm) var(--r-sm) 0;
          padding: var(--s-3);
        }
      }
    `,
  ],
})
export class ConsoleDashboardComponent {
  private readonly api = inject(AdminConsoleService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly data = signal<ConsoleDashboard | null>(null);
  protected readonly trends = signal<ConsoleTrends | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly windowDays = signal(7);
  protected readonly granularity = signal<'Weekly' | 'Monthly'>('Weekly');
  protected readonly windows = [7, 30, 90];
  protected readonly skeletonBlocks = [1, 2, 3, 4, 5, 6];
  protected readonly skeletonRows = [1, 2, 3];

  /** The open card, mirrored in the URL so a refresh keeps it and a link can carry it. */
  protected readonly openKey = signal<string | null>(null);
  protected readonly openTitle = signal<string>('');
  protected readonly openTone = signal<string>('quiet');
  protected readonly segmentRows = signal<ConsoleSegmentTeacher[]>([]);
  protected readonly segmentTotal = signal(0);
  protected readonly segmentLoading = signal(false);
  protected readonly segmentSearch = signal('');
  protected readonly exporting = signal(false);
  private segmentPage = 1;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      const w = Number(params.get('window'));
      if (this.windows.includes(w) && w !== this.windowDays()) {
        this.windowDays.set(w);
        this.load();
      }

      const card = params.get('card');
      if (card !== this.openKey()) this.applyOpen(card);
    });

    this.load();
    this.loadTrends();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.getDashboard(this.windowDays()).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
        // A card opened from the URL needs its title once the labels exist.
        if (this.openKey()) this.describeOpen(this.openKey()!);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('The request did not come back. Check the connection and try again.');
      },
    });
  }

  private loadTrends(): void {
    this.api.getTrends(this.granularity()).subscribe({
      next: (t) => this.trends.set(t),
      error: () => this.trends.set({ granularity: this.granularity(), points: [] }),
    });
  }

  protected setWindow(days: number): void {
    if (days === this.windowDays()) return;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { window: days },
      queryParamsHandling: 'merge',
    });
  }

  protected setGranularity(g: 'Weekly' | 'Monthly'): void {
    if (g === this.granularity()) return;
    this.granularity.set(g);
    this.trends.set(null);
    this.loadTrends();
  }

  /** Open a card, or close whatever is open. Only ever one at a time. */
  protected toggle(key: string | null): void {
    const next = key && key !== this.openKey() ? key : null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { card: next },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private applyOpen(key: string | null): void {
    this.openKey.set(key);
    this.segmentRows.set([]);
    this.segmentTotal.set(0);
    this.segmentPage = 1;
    // A term typed into one list must not silently narrow the next one.
    this.segmentSearch.set('');
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (!key) return;

    this.describeOpen(key);
    this.fetchSegment();
  }

  protected loadMore(): void {
    if (this.segmentLoading()) return;
    this.segmentPage += 1;
    this.fetchSegment();
  }

  /**
   * Debounced so a four-letter name is one request, not four. The term goes to the
   * SERVER — filtering the fifteen loaded rows client-side would search the page
   * rather than the list, and quietly answer "no matches" about people who are in it.
   */
  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (this.searchTimer) clearTimeout(this.searchTimer);

    this.searchTimer = setTimeout(() => {
      if (value.trim() === this.segmentSearch()) return;
      this.segmentSearch.set(value.trim());
      this.segmentPage = 1;
      this.segmentRows.set([]);
      this.fetchSegment();
    }, 350);
  }

  /** The whole list as a CSV, with the search applied — what a rep takes into a morning of calls. */
  protected exportSegment(): void {
    const key = this.openKey();
    if (!key || this.exporting()) return;

    this.exporting.set(true);
    this.api.exportSegment(key, this.windowDays(), this.segmentSearch() || null).subscribe({
      next: ({ blob, filename }) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        // Revoking immediately can cancel the download in some browsers; one tick is enough.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.exporting.set(false);
      },
      error: () => this.exporting.set(false),
    });
  }

  private fetchSegment(): void {
    const key = this.openKey();
    if (!key) return;

    this.segmentLoading.set(true);
    this.api
      .getSegment(key, this.windowDays(), this.segmentPage, SEGMENT_PAGE, this.segmentSearch() || null)
      .subscribe({
      next: (res) => {
        this.segmentRows.update((rows) => [...rows, ...res.data]);
        this.segmentTotal.set(res.totalCount);
        this.segmentLoading.set(false);
      },
        error: () => this.segmentLoading.set(false),
      });
  }

  /**
   * The heading and colour of the open region, taken from the card that opened it —
   * so the region names the same thing the card does, in the same words.
   */
  private describeOpen(key: string): void {
    const d = this.data();
    if (!d) return;

    const all = [
      ...this.yesterdayCards(),
      ...this.growthCards(),
      ...this.usageCards(),
      ...this.moneyCards(),
    ];
    const match = all.find((c) => c.segmentKey === key);
    if (match) {
      this.openTitle.set(match.label);
      this.openTone.set(match.tone);
      return;
    }

    // The feature table's cells carry a module in the key — "ModuleUsing:Videos".
    const [kind, mod] = key.split(':');
    const label = mod ? featureLabelOf(mod) : key;
    const titles: Record<string, string> = {
      ModuleHaveIt: `Teachers who have ${label}`,
      ModuleUsing: `Teachers using ${label}`,
      ModuleNeverOpened: `Teachers who have never opened ${label}`,
      Renewed: 'Renewed',
      NotRenewed: 'Did not come back',
    };
    this.openTitle.set(titles[kind] ?? label);
    this.openTone.set(kind === 'ModuleUsing' ? 'live' : kind === 'ModuleHaveIt' ? 'quiet' : 'gone');
  }

  protected isOpenIn(keys: (string | null)[]): boolean {
    const k = this.openKey();
    return k !== null && keys.includes(k);
  }

  // ── Card definitions. Labels are plain sentences; captions say exactly what is
  //    counted, so nobody has to be taught the vocabulary. ────────────────────

  // ── Card definitions. Labels are plain sentences; captions say exactly what is
  //    counted, so nobody has to be taught the vocabulary.
  //
  //    These are computed signals rather than template calls: a method in a template
  //    re-runs on every change detection and hands @for a brand-new array each time,
  //    which throws away the DOM it just built. ─────────────────────────────────

  protected readonly yesterdayCards = computed<Card[]>(() => {
    const d = this.data();
    if (!d) return [];
    const y = d.yesterday;
    return [
      card(y.registered, 'Registered', 'New accounts created yesterday.', 'quiet'),
      card(y.subscribed, 'Subscribed', 'Started paying yesterday.', 'live'),
      card(y.expired, 'Subscription ended', 'Their subscription ran out yesterday.', 'gone'),
      card(y.startedUsing, 'Started using it', 'Did something in the app for the first time ever.', 'live'),
      card(y.usedApp, 'Used the app', 'Did something real yesterday — not just logged in.', 'quiet'),
    ];
  });

  protected readonly growthCards = computed<Card[]>(() => {
    const d = this.data();
    if (!d) return [];
    const g = d.growth;
    return [
      stat(g.teachers, 'Teachers', 'Everyone with their own account.', 'quiet'),
      stat(g.subscribedNow, 'Paying right now', 'Their subscription is live today.', 'live'),
      stat(g.newlyRegistered, `Registered in ${d.windowDays} days`, 'New accounts in the window above.', 'quiet'),
      stat(g.newlySubscribed, `Subscribed in ${d.windowDays} days`, 'Started paying in the window above.', 'live'),
      stat(
        g.endingWithin7Days,
        `Ending within ${d.endingSoonThresholdDays} days`,
        'Still paying, but not for much longer.',
        'risk',
      ),
      stat(g.expired, 'Stopped paying', 'Had a subscription, it ran out, nothing replaced it.', 'gone'),
      stat(g.centerTeachers, 'Teach at a centre', 'The centre pays for them, not us.', 'quiet'),
    ];
  });

  protected readonly usageCards = computed<Card[]>(() => {
    const d = this.data();
    if (!d) return [];
    const u = d.usage;
    return [
      stat(u.usingApp7, 'Used it this week', 'Did something in the last 7 days.', 'live'),
      stat(u.notUsing7, 'Nothing this week', 'Silent for 7 days.', 'risk'),
      stat(u.usingApp30, 'Used it this month', 'Did something in the last 30 days.', 'live'),
      stat(u.notUsing30, 'Nothing this month', 'Silent for 30 days.', 'gone'),
      stat(u.uploadedStudents, 'Have students', 'At least one student on the account.', 'live'),
      stat(u.noStudents, 'No students yet', 'They are paying and have uploaded nobody.', 'gone'),
      stat(
        u.studentsNotInClasses,
        'Students not in a class',
        'They have students, but none are in a class — so those students see an empty app.',
        'risk',
      ),
      stat(u.needsCall, 'Needs a call', 'Stalled, quiet or set up wrong. Worked from the top.', 'risk'),
    ];
  });

  protected readonly moneyCards = computed<Card[]>(() => {
    const d = this.data();
    if (!d) return [];
    const m = d.money;
    const out = [
      stat(m.renewedAtLeastOnce, 'Paid more than once', 'They came back after the free month.', 'live'),
      stat(m.firstSubscriptionOnly, 'Still on their first subscription', 'They have not renewed yet.', 'quiet'),
    ];
    if (m.latestRenewals) {
      out.push({
        key: m.latestRenewals.churnedSegmentKey,
        segmentKey: m.latestRenewals.churnedSegmentKey,
        count: m.latestRenewals.churned,
        label: `Did not come back in ${m.latestRenewals.label}`,
        caption: `Of ${m.latestRenewals.ended} whose subscription ended, ${m.latestRenewals.renewed} renewed.`,
        tone: 'gone',
        delta: null,
        names: [],
      });
    }
    return out;
  });

  protected readonly yesterdayKeys = computed(() => this.yesterdayCards().map((c) => c.segmentKey));
  protected readonly growthKeys = computed(() => this.growthCards().map((c) => c.segmentKey));
  protected readonly usageKeys = computed(() => this.usageCards().map((c) => c.segmentKey));
  protected readonly moneyKeys = computed(() => this.moneyCards().map((c) => c.segmentKey));

  protected readonly featureKeys = computed(() =>
    (this.data()?.features ?? []).flatMap((f) => [
      f.haveItSegmentKey,
      f.usingSegmentKey,
      f.neverOpenedSegmentKey,
    ]),
  );

  protected featureLabel(key: string): string {
    return featureLabelOf(key);
  }

  protected planLabel(key: string): string {
    const map: Record<string, string> = {
      Full: 'the full plan',
      Managerial: 'Managerial',
      ManagerialPlus: 'Managerial + Parents',
      None: 'no plan recorded',
    };
    return map[key] ?? key;
  }

  /** EGP with thousands separators and no decimals — nobody reads piastres here. */
  protected money(amount: number): string {
    return `${Math.round(amount).toLocaleString('en-GB')} EGP`;
  }

  protected prettyDay(iso: string): string {
    return formatDate(iso);
  }
}

interface Card {
  key: string;
  segmentKey: string | null;
  count: number;
  label: string;
  caption: string;
  tone: string;
  delta: number | null;
  names: string[];
}

/** A "since yesterday" card, which already carries its first few names. */
function card(
  source: { segmentKey: string; count: number; teachers: { fullName: string }[] },
  label: string,
  caption: string,
  tone: string,
): Card {
  return {
    key: source.segmentKey,
    segmentKey: source.segmentKey,
    count: source.count,
    label,
    caption,
    tone,
    delta: null,
    names: source.teachers.map((t) => t.fullName),
  };
}

/** Any other card: a number, a movement, and the key that opens it. */
function stat(source: ConsoleStat, label: string, caption: string, tone: string): Card {
  return {
    key: source.segmentKey ?? label,
    segmentKey: source.segmentKey,
    count: source.count,
    label,
    caption,
    tone,
    delta: source.delta,
    names: [],
  };
}

function featureLabelOf(key: string): string {
  return FEATURE_LABELS[key] ?? key;
}
