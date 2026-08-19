import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  CenterListItem,
  CenterSubscription,
  CenterTeacherListItem,
} from '../../../core/models/center.model';
import { CenterService } from '../../../core/services/center.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

interface UsageBar {
  label: string;
  used: number;
  total: number;
}

/**
 * Overview tab: the center's teachers (GET /centers/{id}/teachers) + real
 * usage bars (GET /center-subscriptions/{id} — used vs total teacher slots
 * and student capacity). Read-only — no PUT /api/admin/centers/{id} endpoint
 * exists, so there is no inline-edit mode here (unlike TeacherInfoComponent).
 */
@Component({
  selector: 'app-center-overview',
  standalone: true,
  imports: [DatePipe, EmptyStateComponent],
  template: `
    @if (center(); as c) {
      <div class="row g-4">
        <div class="col-lg-5">
          <h3 class="h6 mb-3">Usage</h3>
          @if (usageBars().length) {
            <div class="usage-list">
              @for (bar of usageBars(); track bar.label) {
                <div class="usage-row">
                  <div class="usage-label">
                    <span>{{ bar.label }}</span>
                    <span class="text-muted">{{ bar.used }} / {{ bar.total }}</span>
                  </div>
                  <div class="progress" role="progressbar">
                    <div
                      class="progress-bar"
                      [class.bg-danger]="pct(bar) >= 100"
                      [style.width.%]="pct(bar)"
                    ></div>
                  </div>
                </div>
              }
            </div>

            @if (subscription(); as sub) {
              <div class="capacity-note">
                <div><span class="text-muted">Capacity under Full teachers</span> — {{ sub.studentCapacityUnderFull }}</div>
                <div><span class="text-muted">Capacity under Managerial teachers</span> — {{ sub.studentCapacityUnderManagerial }}</div>
              </div>
            }
          } @else {
            <p class="text-muted small">No active subscription/quota yet for this center.</p>
          }
        </div>

        <div class="col-lg-7">
          <h3 class="h6 mb-3">Teachers ({{ teachers().length }})</h3>
          @if (teachers().length === 0) {
            <app-empty-state
              icon="🧑‍🏫"
              title="No teachers yet"
              message="This center has no teachers assigned."
            />
          } @else {
            <div class="table-responsive">
              <table class="table align-middle">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th>Type</th>
                    <th>Revenue share</th>
                    <th>Student code</th>
                    <th>Status</th>
                    <th class="text-end">Students</th>
                  </tr>
                </thead>
                <tbody>
                  @for (t of teachers(); track t.teacherId) {
                    <tr>
                      <td class="fw-medium">{{ t.fullName }}</td>
                      <td class="text-muted font-monospace">{{ t.teacherCode }}</td>
                      <td>
                        @if (t.planType) {
                          <span
                            class="badge rounded-pill"
                            [class.text-bg-primary]="t.planType === 'Full'"
                            [class.text-bg-warning]="t.planType === 'Managerial'"
                          >
                            {{ t.planType }}
                          </span>
                        } @else {
                          <span class="text-muted">—</span>
                        }
                      </td>
                      <td>
                        {{ t.effectiveRevenueSharePercent }}%
                        @if (t.revenueSharePercentOverride != null) {
                          <span class="badge text-bg-light border ms-1" title="Overrides the center default">override</span>
                        }
                      </td>
                      <td>
                        {{ t.effectiveStudentCodeMode }}
                        @if (t.studentCodeModeOverride) {
                          <span class="badge text-bg-light border ms-1" title="Overrides the center default">override</span>
                        }
                      </td>
                      <td>
                        <span
                          class="badge"
                          [class.text-bg-success]="t.accountStatus === 'Active'"
                          [class.text-bg-secondary]="t.accountStatus !== 'Active'"
                        >
                          {{ t.accountStatus }}
                        </span>
                      </td>
                      <td class="text-end">{{ t.studentCount }} / {{ t.studentCapacity }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }

          <div class="text-muted small mt-3">
            Created {{ c.createdAt | date: 'mediumDate' }}
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .usage-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .usage-row .usage-label {
        display: flex;
        justify-content: space-between;
        font-size: 0.875rem;
        margin-bottom: 0.3rem;
      }
      .progress {
        height: 8px;
        border-radius: 999px;
      }
      .progress-bar {
        background: var(--edvanz-primary, #2563eb);
      }
      .capacity-note {
        margin-top: 1.5rem;
        padding: 1rem 1.1rem;
        border: 1px solid var(--edvanz-border, #e5e7eb);
        border-radius: 12px;
        font-size: 0.9rem;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
    `,
  ],
})
export class CenterOverviewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly centerService = inject(CenterService);

  protected readonly center = signal<CenterListItem | null>(null);
  protected readonly teachers = signal<CenterTeacherListItem[]>([]);
  protected readonly subscription = signal<CenterSubscription | null>(null);

  protected readonly usageBars = computed<UsageBar[]>(() => {
    const sub = this.subscription();
    if (!sub || !sub.hasSubscription) return [];
    return [
      { label: 'Full teacher slots', used: sub.usedFullTeachers, total: sub.fullTeacherSlots },
      {
        label: 'Managerial teacher slots',
        used: sub.usedManagerialTeachers,
        total: sub.managerialTeacherSlots,
      },
      {
        label: 'Student capacity (total)',
        used: sub.usedStudentsTotal,
        total: sub.studentCapacityTotal,
      },
    ];
  });

  ngOnInit(): void {
    const id = this.route.parent?.snapshot.paramMap.get('id');
    if (!id) return;
    const centerId = +id;

    this.centerService.getCenterById(centerId).subscribe((c) => this.center.set(c));
    this.centerService.getTeachers(centerId).subscribe((list) => this.teachers.set(list));
    this.centerService.getSubscription(centerId).subscribe({
      next: (sub) => this.subscription.set(sub),
      error: () => this.subscription.set(null),
    });
  }

  protected pct(bar: UsageBar): number {
    if (bar.total <= 0) return bar.used > 0 ? 100 : 0;
    return Math.min(100, Math.round((bar.used / bar.total) * 100));
  }
}
