import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../shared/components/searchable-select/searchable-select.component';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import { InfiniteScrollDirective } from '../../shared/directives/infinite-scroll.directive';
import { InfiniteListStore } from '../../shared/utils/infinite-list-store';
import { StudentService } from '../../core/services/student.service';
import { TeacherService } from '../../core/services/teacher.service';
import { ToastService } from '../../core/services/toast.service';
import { StudentAdminListItem, UnboundLinkItem } from '../../core/models/student.model';
import { TeacherLookupItem } from '../../core/models/teacher.model';

const DEFAULT_PAGE_SIZE = 10;

type MissingFilter = 'missingStudentPhone' | 'missingParentPhone' | 'missingSession';

/**
 * Platform-wide student directory (Admin Portal, SuperAdmin only).
 * Search + teacher filter + "missing field" toggle chips + pagination +
 * view/edit navigation, plus a per-row mobile-account Link/Unlink toggle.
 * No activate/deactivate or delete here — the admin Student surface only
 * exposes list/get/create/update (TeacherStudentController admin/* actions)
 * plus the link/unbind actions (TeacherStudentLinksController admin/* actions);
 * recycle-bin and bulk-delete remain teacher-scoped and are out of this
 * module's confirmed backend contract.
 */
@Component({
  selector: 'app-student-list',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    EmptyStateComponent,
    SearchableSelectComponent,
    InfiniteScrollDirective,
  ],
  templateUrl: 'student-list.component.html',
  styleUrl: 'student-list.component.css',
})
export class StudentListComponent implements OnInit {
  private readonly studentService = inject(StudentService);
  private readonly teacherService = inject(TeacherService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  protected readonly searchControl = new FormControl<string>('', { nonNullable: true });
  protected readonly teacherOptions = signal<SearchableSelectOption[]>([]);
  protected selectedTeacherId: number | null = null;

  /** Infinite-scroll list state: accumulates pages, appends on scroll. */
  protected readonly store = new InfiniteListStore<StudentAdminListItem>(
    DEFAULT_PAGE_SIZE,
    (page, pageSize) =>
      this.studentService.getAllStudents({
        page,
        pageSize,
        search: this.searchControl.value,
        teacherId: this.selectedTeacherId,
        missingStudentPhone: this.missingStudentPhone() || undefined,
        missingParentPhone: this.missingParentPhone() || undefined,
        missingSession: this.missingSession() || undefined,
      }),
  );

  // ── "Missing field" filter chips — REQ-STU-036 equivalents, admin-wide ──
  protected readonly missingStudentPhone = signal(false);
  protected readonly missingParentPhone = signal(false);
  protected readonly missingSession = signal(false);

  // ── Link picker modal state ─────────────────────────────────────────────
  protected readonly pickerOpen = signal(false);
  protected readonly pickerLoading = signal(false);
  protected readonly pickerOptions = signal<UnboundLinkItem[]>([]);
  protected readonly pickerTarget = signal<StudentAdminListItem | null>(null);
  protected readonly linkActionBusyId = signal<number | null>(null);

  ngOnInit(): void {
    this.loadTeacherLookup();
    this.store.reset();

    this.searchControl.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged())
      .subscribe(() => this.store.reset());
  }

  protected onTeacherFilterChange(value: number | string | null): void {
    this.selectedTeacherId = value == null ? null : Number(value);
    this.store.reset();
  }

  protected toggleMissingFilter(filter: MissingFilter): void {
    const target =
      filter === 'missingStudentPhone'
        ? this.missingStudentPhone
        : filter === 'missingParentPhone'
          ? this.missingParentPhone
          : this.missingSession;
    target.update((v) => !v);
    this.store.reset();
  }

  // ── Mobile-account Link / Unlink ─────────────────────────────────────────

  /** Row has an Active link bound to it — call unbind, with a confirm gate (loses the student's access). */
  protected async unlink(student: StudentAdminListItem): Promise<void> {
    if (student.linkId == null) return;

    const confirmed = await this.confirmDialog.open({
      title: 'Unlink student account?',
      message: `${student.studentName} will stay connected but lose data access until re-linked.`,
      confirmText: 'Unlink',
      danger: true,
    });
    if (!confirmed) return;

    this.linkActionBusyId.set(student.id);
    this.studentService.unlinkStudent(student.linkId).subscribe({
      next: () => {
        this.toast.success('Student unlinked.');
        this.linkActionBusyId.set(null);
        this.store.reset();
      },
      error: () => this.linkActionBusyId.set(null),
    });
  }

  /** Row has no bound link — open the picker of this teacher's unbound Active connections. */
  protected openLinkPicker(student: StudentAdminListItem): void {
    this.pickerTarget.set(student);
    this.pickerOpen.set(true);
    this.pickerLoading.set(true);
    this.pickerOptions.set([]);

    this.studentService.getUnboundLinksForTeacher(student.teacherId).subscribe({
      next: (options) => {
        this.pickerOptions.set(options);
        this.pickerLoading.set(false);
      },
      error: () => this.pickerLoading.set(false),
    });
  }

  protected closePicker(): void {
    this.pickerOpen.set(false);
    this.pickerTarget.set(null);
    this.pickerOptions.set([]);
  }

  protected pickLink(option: UnboundLinkItem): void {
    const target = this.pickerTarget();
    if (!target) return;

    this.linkActionBusyId.set(target.id);
    this.studentService.linkStudent(option.linkId, target.id).subscribe({
      next: () => {
        this.toast.success(`Linked to ${option.studentFullName}.`);
        this.linkActionBusyId.set(null);
        this.closePicker();
        this.store.reset();
      },
      error: () => this.linkActionBusyId.set(null),
    });
  }

  // ── Data loading ─────────────────────────────────────────────────────────

  private loadTeacherLookup(): void {
    this.teacherService.getTeacherLookup().subscribe((teachers: TeacherLookupItem[]) => {
      this.teacherOptions.set(teachers.map((t) => ({ value: t.id, label: t.fullName })));
    });
  }

}
