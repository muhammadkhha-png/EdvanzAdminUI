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
import { formatDate, formatDateTime, timeAgo } from '../../shared/utils/time-format';
import { SubscriptionStatusBadgeComponent } from '../teachers/subscription-panel/subscription-status-badge.component';

const DEFAULT_PAGE_SIZE = 10;

/** Backend clamps pageSize at 100; a teacher has a handful of assistants at most,
 *  so one page always covers the expansion. */
const ASSISTANTS_PAGE_SIZE = 100;

/** Window for the "Newly subscribed" tab — current subscription started within this many days. */
const NEWLY_SUBSCRIBED_DAYS = 30;

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

  /** REGISTRATION date-range filter (yyyy-MM-dd). '' = unbounded on that side. Both
   *  bounds are inclusive server-side (the "to" day is fully covered). Only applied on
   *  the "All teachers" tab. */
  protected readonly registeredFromControl = new FormControl<string>('', { nonNullable: true });
  protected readonly registeredToControl = new FormControl<string>('', { nonNullable: true });

  /** Today as yyyy-MM-dd — caps both date inputs so no future registration date is picked. */
  protected readonly todayIso = new Date().toLocaleDateString('en-CA');

  protected readonly timeAgo = timeAgo;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatDate = formatDate;
  protected readonly newlySubscribedDays = NEWLY_SUBSCRIBED_DAYS;

  /** 'all' = every teacher; 'new' = subscribed within the last NEWLY_SUBSCRIBED_DAYS,
   *  newest subscription first (server-side filter + sort). */
  protected readonly activeTab = signal<'all' | 'new'>('all');

  protected readonly store = new InfiniteListStore<TeacherListItem>(
    DEFAULT_PAGE_SIZE,
    (page, pageSize) =>
      this.teacherService.getTeachers({
        page,
        pageSize,
        search: this.searchControl.value,
        // The newly-subscribed tab is implicitly "subscribed" — the status filter
        // only applies on the All tab (it's hidden on the other one).
        subscriptionStatus:
          this.activeTab() === 'all' ? this.subscriptionFilter.value || undefined : undefined,
        subscribedWithinDays: this.activeTab() === 'new' ? NEWLY_SUBSCRIBED_DAYS : undefined,
        // Registration date-range filter is an "All teachers" concern only.
        registeredFrom:
          this.activeTab() === 'all' ? this.registeredFromControl.value || undefined : undefined,
        registeredTo:
          this.activeTab() === 'all' ? this.registeredToControl.value || undefined : undefined,
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
    this.registeredFromControl.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe(() => this.store.reset());
    this.registeredToControl.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe(() => this.store.reset());
  }

  /** Clears both registration-date bounds and reloads once (suppress the per-control
   *  change events so we don't reset the list twice). */
  protected clearRegisteredRange(): void {
    this.registeredFromControl.setValue('', { emitEvent: false });
    this.registeredToControl.setValue('', { emitEvent: false });
    this.store.reset();
  }

  /** True when either registration-date bound is set — drives the "Clear" button. */
  protected hasRegisteredRange(): boolean {
    return !!(this.registeredFromControl.value || this.registeredToControl.value);
  }

  protected setTab(tab: 'all' | 'new'): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    this.store.reset();
  }

  /** Effective "last seen" for an assistant row: the later of last activity and
   *  last login (mirrors the server-side rollup on the teacher row). */
  protected lastSeen(a: AssistantAdminListItem): string | null {
    const activity = a.lastActivityAt ?? null;
    const login = a.lastLoginAt ?? null;
    if (!activity) return login;
    if (!login) return activity;
    return activity > login ? activity : login;
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
