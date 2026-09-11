import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';

/**
 * Teacher area. The details shell nests the tabbed child routes; usage,
 * subscription and modules are each independently permission-guarded.
 */
export const TEACHERS_ROUTES: Routes = [
  // The old flat teacher list lived here. It is superseded by the one list at
  // /teachers (with views + the detail panel); this path now only carries the
  // action destinations the panel links out to.
  { path: '', pathMatch: 'full', redirectTo: '/teachers' },
  {
    path: 'new',
    loadComponent: () =>
      import('./teacher-form/teacher-form.component').then(
        (m) => m.TeacherFormComponent,
      ),
    data: { breadcrumb: 'New teacher' },
  },
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./teacher-form/teacher-form.component').then(
        (m) => m.TeacherFormComponent,
      ),
    data: { breadcrumb: 'Edit teacher' },
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./teacher-details/teacher-details.component').then(
        (m) => m.TeacherDetailsComponent,
      ),
    data: { breadcrumb: 'Teacher details' },
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./teacher-details/teacher-info.component').then(
            (m) => m.TeacherInfoComponent,
          ),
      },
      {
        // Teacher 360 — the usage tab. Everything about whether this account is
        // actually being used, in one place.
        path: 'usage',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Usage', roles: ['SuperAdmin'] },
        loadComponent: () =>
          import('../teacher-360/teacher-usage-page.component').then(
            (m) => m.TeacherUsagePageComponent,
          ),
      },
      {
        path: 'subscription',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Subscription', roles: ['SuperAdmin'] },
        loadComponent: () =>
          import('./subscription-panel/subscription-panel.component').then(
            (m) => m.SubscriptionPanelComponent,
          ),
      },
      {
        path: 'modules',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Modules', roles: ['SuperAdmin'] },
        loadComponent: () =>
          import('./modules-panel/modules-panel.component').then(
            (m) => m.ModulesPanelComponent,
          ),
      },
    ],
  },
];
