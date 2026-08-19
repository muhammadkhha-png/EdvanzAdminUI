import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';

/**
 * Center area. Mirrors Teachers: a list, a create form, and a details shell
 * with tabbed child routes (Overview / Subscription). 'new' is registered
 * before ':id' so it never matches as a center id.
 */
export const CENTERS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./center-list/center-list.component').then((m) => m.CenterListComponent),
    data: { breadcrumb: 'Centers' },
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./center-form/center-form.component').then((m) => m.CenterFormComponent),
    data: { breadcrumb: 'New center' },
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./center-details/center-details.component').then(
        (m) => m.CenterDetailsComponent,
      ),
    data: { breadcrumb: 'Center details' },
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./center-details/center-overview.component').then(
            (m) => m.CenterOverviewComponent,
          ),
      },
      {
        path: 'subscription',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Subscription', roles: ['SuperAdmin'] },
        loadComponent: () =>
          import('./center-details/center-subscription-panel.component').then(
            (m) => m.CenterSubscriptionPanelComponent,
          ),
      },
    ],
  },
];
