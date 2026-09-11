import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TeacherUsageTabComponent } from './teacher-usage-tab.component';

/**
 * Route wrapper for the Teacher 360 usage tab.
 *
 * Exists only to read `:id` off the PARENT route and hand it to the tab as an
 * input. The tab itself is a plain presentational component taking a teacher id,
 * so it can also be dropped into any other shell without dragging the router
 * along with it.
 */
@Component({
  selector: 'app-teacher-usage-page',
  standalone: true,
  imports: [TeacherUsageTabComponent],
  template: `
    @if (teacherId(); as id) {
      <app-teacher-usage-tab [teacherId]="id" />
    }
  `,
})
export class TeacherUsagePageComponent {
  private readonly route = inject(ActivatedRoute);

  /** `:id` lives on the parent (`/teachers/:id`), not on this child route. */
  protected teacherId(): number | null {
    const raw = this.route.parent?.snapshot.paramMap.get('id');
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
}
