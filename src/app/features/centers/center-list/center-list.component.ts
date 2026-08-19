import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CenterListItem } from '../../../core/models/center.model';
import { CenterService } from '../../../core/services/center.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ToastService } from '../../../core/services/toast.service';

/**
 * Center directory. GET /api/admin/centers has NO pagination (bare array), so
 * this loads the full list once and filters client-side — unlike
 * TeacherListComponent's server-paginated InfiniteListStore.
 */
@Component({
  selector: 'app-center-list',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, EmptyStateComponent],
  templateUrl: 'center-list.component.html',
  styleUrl: 'center-list.component.css',
})
export class CenterListComponent implements OnInit {
  private readonly centerService = inject(CenterService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);

  protected readonly searchControl = new FormControl<string>('', { nonNullable: true });
  private readonly searchTerm = signal('');

  protected readonly centers = signal<CenterListItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);

  /** Center ids with an activate/deactivate call in flight — guards double-click. */
  protected readonly busyIds = signal<ReadonlySet<number>>(new Set());

  protected readonly filteredCenters = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const all = this.centers();
    if (!term) return all;
    return all.filter(
      (c) => c.name.toLowerCase().includes(term) || c.centerCode.toLowerCase().includes(term),
    );
  });

  protected readonly isEmpty = computed(() => this.loaded() && this.filteredCenters().length === 0);

  ngOnInit(): void {
    this.load();
    this.searchControl.valueChanges.subscribe((v) => this.searchTerm.set(v));
  }

  private load(): void {
    this.loading.set(true);
    this.centerService.getCenters().subscribe({
      next: (list) => {
        this.centers.set(list);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: () => {
        // HTTP error already toasted by the global errorInterceptor.
        this.loading.set(false);
        this.loaded.set(true);
      },
    });
  }

  protected isBusy(centerId: number): boolean {
    return this.busyIds().has(centerId);
  }

  private setBusy(centerId: number, busy: boolean): void {
    this.busyIds.update((set) => {
      const next = new Set(set);
      if (busy) next.add(centerId);
      else next.delete(centerId);
      return next;
    });
  }

  protected async deactivate(c: CenterListItem): Promise<void> {
    if (this.isBusy(c.centerId)) return;
    const ok = await this.confirm.open({
      title: 'Deactivate center',
      message: `Deactivate ${c.name}? Its login will be blocked until reactivated.`,
      confirmText: 'Deactivate',
      cancelText: 'Cancel',
    });
    if (!ok) return;

    this.setBusy(c.centerId, true);
    this.centerService.deactivateCenter(c.centerId).subscribe({
      next: () => {
        this.toast.success('Center deactivated.');
        this.setBusy(c.centerId, false);
        this.load();
      },
      error: () => this.setBusy(c.centerId, false),
    });
  }

  protected activate(c: CenterListItem): void {
    if (this.isBusy(c.centerId)) return;
    this.setBusy(c.centerId, true);
    this.centerService.activateCenter(c.centerId).subscribe({
      next: () => {
        this.toast.success('Center activated.');
        this.setBusy(c.centerId, false);
        this.load();
      },
      error: () => this.setBusy(c.centerId, false),
    });
  }
}
