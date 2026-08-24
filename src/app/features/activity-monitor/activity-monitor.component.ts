import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { AssistantAdminListItem, LoginActivityEntry } from '../../core/models/assistant.model';
import { TeacherListItem } from '../../core/models/teacher.model';
import { AssistantService } from '../../core/services/assistant.service';
import { TeacherService } from '../../core/services/teacher.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { InfiniteScrollDirective } from '../../shared/directives/infinite-scroll.directive';
import { InfiniteListStore } from '../../shared/utils/infinite-list-store';
import { formatDateTime, timeAgo } from '../../shared/utils/time-format';
import { SubscriptionStatusBadgeComponent } from '../teachers/subscription-panel/subscription-status-badge.component';

const DEFAULT_PAGE_SIZE = 10;

/** Backend clamps pageSize at 100; a teacher has a handful of assistants at most,
 *  so one page always covers the expansion. */
const ASSISTANTS_PAGE_SIZE = 100;

/**
 * Activity Monitor: read-only usage view of teachers and the assistant accounts
 * under each of them. Every teacher row expands to its assistants; both levels
 * show "last login" (real login) and "last activity" (last authenticated request,
 * i.e. last time the app was actually used). Assistants additionally drill into
 * their full login/logout audit trail (device + IP) in a modal.
 *
 * Read-only by design — account actions (activate / reset / edit) stay on the
 * Teachers and Assistants tabs; this page answers "who is actually using the app,
 * and when did they last open it".
 */
@Component({
  selector: 'app-activity-monitor',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    EmptyStateComponent,
    SubscriptionStatusBadgeComponent,
    InfiniteScrollDirective,
  ],
  templateUrl: 'activity-monitor.component.html',
  styleUrl: 'activity-monitor.component.css',
})
export class ActivityMonitorComponent implements OnInit {
  private readonly teacherService = inject(TeacherService);
  private readonly assistantService = inject(AssistantService);

  protected readonly searchControl = new FormControl<string>('', { nonNullable: true });

  /** '' = all; otherwise the backend SubscriptionStatus enum name. Derived server-side,
   *  so "Active" = currently subscribed — this is the "subscribed teachers" filter. */
  protected readonly subscriptionFilter = new FormControl<string>('', { nonNullable: true });

  protected readonly timeAgo = timeAgo;
  protected readonly formatDateTime = formatDateTime;

  protected readonly store = new InfiniteListStore<TeacherListItem>(
    DEFAULT_PAGE_SIZE,
    (page, pageSize) =>
      this.teacherService.getTeachers({
        page,
        pageSize,
        search: this.searchControl.value,
        subscriptionStatus: this.subscriptionFilter.value || undefined,
      }),
  );

  // ── Per-teacher expansion state ───────────────────────────────────────────
  protected readonly expandedIds = signal<ReadonlySet<number>>(new Set());
  /** Cache of loaded assistants per teacher — kept across filter changes (the
   *  assistants under a teacher don't depend on the teacher-level filters). */
  protected readonly assistantsByTeacher = signal<ReadonlyMap<number, AssistantAdminListItem[]>>(
    new Map(),
  );
  protected readonly assistantsLoading = signal<ReadonlySet<number>>(new Set());

  // ── Login-activity modal ──────────────────────────────────────────────────
  protected readonly activityTarget = signal<AssistantAdminListItem | null>(null);
  protected readonly activityLog = signal<LoginActivityEntry[] | null>(null);
  protected readonly activityLoading = signal(false);

  ngOnInit(): void {
    this.store.reset();
    this.searchControl.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged())
      .subscribe(() => this.store.reset());
    this.subscriptionFilter.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe(() => this.store.reset());
  }

  protected isExpanded(teacherId: number): boolean {
    return this.expandedIds().has(teacherId);
  }

  protected toggleExpand(teacher: TeacherListItem): void {
    const next = new Set(this.expandedIds());
    if (next.has(teacher.id)) {
      next.delete(teacher.id);
    } else {
      next.add(teacher.id);
      if (!this.assistantsByTeacher().has(teacher.id)) {
        this.loadAssistants(teacher.id);
      }
    }
    this.expandedIds.set(next);
  }

  private loadAssistants(teacherId: number): void {
    this.assistantsLoading.update((cur) => new Set(cur).add(teacherId));
    this.assistantService
      .getAllAssistants({ teacherId, page: 1, pageSize: ASSISTANTS_PAGE_SIZE })
      .subscribe({
        next: (res) => {
          this.assistantsByTeacher.update((cur) => new Map(cur).set(teacherId, res.data));
          this.removeLoading(teacherId);
        },
        error: () => {
          // HTTP error already toasted by the global errorInterceptor. Collapse and
          // leave the teacher uncached — an expanded-but-uncached row would read as
          // "no assistants", and re-expanding retries the fetch.
          this.removeLoading(teacherId);
          this.expandedIds.update((cur) => {
            const next = new Set(cur);
            next.delete(teacherId);
            return next;
          });
        },
      });
  }

  private removeLoading(teacherId: number): void {
    this.assistantsLoading.update((cur) => {
      const next = new Set(cur);
      next.delete(teacherId);
      return next;
    });
  }

  // ── Login-activity modal ──────────────────────────────────────────────────

  protected openActivityLog(assistant: AssistantAdminListItem): void {
    this.activityTarget.set(assistant);
    this.activityLog.set(null);
    this.activityLoading.set(true);
    this.assistantService.getLoginActivity(assistant.id).subscribe({
      next: (log) => {
        this.activityLog.set(log);
        this.activityLoading.set(false);
      },
      error: () => {
        // Error toasted globally; close so the admin isn't stuck on a dead modal.
        this.activityLoading.set(false);
        this.activityTarget.set(null);
      },
    });
  }

  protected closeActivityLog(): void {
    this.activityTarget.set(null);
    this.activityLog.set(null);
  }
}
