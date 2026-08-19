import { Component, inject, OnInit, signal } from '@angular/core';
import {
  ActivatedRoute,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { CenterListItem } from '../../../core/models/center.model';
import { CenterService } from '../../../core/services/center.service';
import { SubscriptionStatusBadgeComponent } from '../../teachers/subscription-panel/subscription-status-badge.component';

/**
 * Shell for a single center. GET /api/admin/centers/{id} returns only the
 * summary (no embedded subscription), so the header's status badge is loaded
 * from a separate GET /api/admin/center-subscriptions/{id} call — mirrors
 * TeacherDetailsComponent's shell + independently-fetching tab convention.
 */
@Component({
  selector: 'app-center-details',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, SubscriptionStatusBadgeComponent],
  template: `
    <div class="page-header">
      <a routerLink="/centers" class="btn btn-outline-secondary btn-sm mb-2">
        ← Back to centers
      </a>
    </div>

    @if (center(); as c) {
      <div class="detail-card">
        <div class="detail-head">
          <div class="avatar">{{ initials(c.name) }}</div>
          <div class="flex-grow-1">
            <h2 class="h4 mb-1">{{ c.name }}</h2>
            <div class="text-muted">
              Code <span class="font-monospace">{{ c.centerCode }}</span>
              · {{ c.teacherCount }} teacher(s)
              ·
              <span title="Set and managed by the center — not editable from this portal">
                {{ c.defaultRevenueSharePercent }}% revenue share (managed by the center)
              </span>
            </div>
          </div>
          <app-subscription-status-badge [status]="subscriptionStatus() ?? ''" />
        </div>

        <ul class="nav nav-tabs px-3">
          <li class="nav-item">
            <a
              class="nav-link"
              [routerLink]="['/centers', c.centerId]"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: true }"
            >
              Overview
            </a>
          </li>
          <li class="nav-item">
            <a
              class="nav-link"
              [routerLink]="['/centers', c.centerId, 'subscription']"
              routerLinkActive="active"
            >
              Subscription
            </a>
          </li>
        </ul>

        <div class="tab-body">
          <router-outlet />
        </div>
      </div>
    }
  `,
  styles: [
    `
      .page-header {
        margin-bottom: 0.5rem;
      }
      .detail-card {
        background: #fff;
        border: 1px solid var(--edvanz-border, #e5e7eb);
        border-radius: 14px;
        overflow: hidden;
      }
      .detail-head {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1.5rem;
        border-bottom: 1px solid var(--edvanz-border, #e5e7eb);
      }
      .avatar {
        display: grid;
        place-items: center;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: var(--edvanz-primary, #2563eb);
        color: #fff;
        font-weight: 700;
        font-size: 1.2rem;
        flex-shrink: 0;
      }
      .tab-body {
        padding: 1.5rem;
      }
    `,
  ],
})
export class CenterDetailsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly centerService = inject(CenterService);

  protected readonly center = signal<CenterListItem | null>(null);
  protected readonly subscriptionStatus = signal<string | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    const centerId = +id;

    this.centerService.getCenterById(centerId).subscribe((c) => this.center.set(c));
    this.centerService.getSubscription(centerId).subscribe({
      next: (sub) => this.subscriptionStatus.set(sub.status),
      // No subscription yet, or the read failed — badge just falls back to "—".
      error: () => this.subscriptionStatus.set(null),
    });
  }

  protected initials(name: string): string {
    return name
      .split(' ')
      .map((p) => p.charAt(0))
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }
}
