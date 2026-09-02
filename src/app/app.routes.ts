import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { loginGuard } from './core/guards/login.guard';
import { permissionGuard } from './core/guards/permission.guard';

/**
 * Top-level routing. Public login sits outside the layout; everything else is
 * wrapped in the authenticated shell behind `authGuard`. Features are lazy.
 */
export const APP_ROUTES: Routes = [
  {
    path: 'login',
    canActivate: [loginGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then(
        (m) => m.LoginComponent,
      ),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/main-layout/main-layout.component').then(
        (m) => m.MainLayoutComponent,
      ),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        data: { breadcrumb: 'Dashboard' },
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
      },
      {
        path: 'teachers',
        loadChildren: () =>
          import('./features/teachers/teachers.routes').then(
            (m) => m.TEACHERS_ROUTES,
          ),
      },
      {
        path: 'centers',
        loadChildren: () =>
          import('./features/centers/centers.routes').then(
            (m) => m.CENTERS_ROUTES,
          ),
      },
      {
        path: 'assistants',
        loadChildren: () =>
          import('./features/assistants/assistants.routes').then(
            (m) => m.ASSISTANTS_ROUTES,
          ),
      },
      {
        path: 'students',
        loadChildren: () =>
          import('./features/Student list/students.routes').then(
            (m) => m.STUDENTS_ROUTES,
          ),
      },
      {
        path: 'student-accounts',
        loadChildren: () =>
          import('./features/student-accounts/student-accounts.routes').then(
            (m) => m.STUDENT_ACCOUNTS_ROUTES,
          ),
      },
      {
        path: 'activity',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Activity Monitor', roles: ['SuperAdmin'] },
        loadComponent: () =>
          import('./features/activity-monitor/activity-monitor.component').then(
            (m) => m.ActivityMonitorComponent,
          ),
      },
      {
        path: 'subscription-requests',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Subscription requests', roles: ['SuperAdmin'] },
        loadComponent: () =>
          import(
            './features/subscription-requests/subscription-requests.component'
          ).then((m) => m.SubscriptionRequestsComponent),
      },
      {
        path: 'center-subscription-requests',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Center subscription requests', roles: ['SuperAdmin'] },
        loadComponent: () =>
          import(
            './features/center-subscription-requests/center-subscription-requests.component'
          ).then((m) => m.CenterSubscriptionRequestsComponent),
      },
      {
        path: 'teacher-independence-requests',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Teacher independence requests', roles: ['SuperAdmin'] },
        loadComponent: () =>
          import(
            './features/teacher-independence-requests/teacher-independence-requests.component'
          ).then((m) => m.TeacherIndependenceRequestsComponent),
      },
      {
        path: 'app-version',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'App version', roles: ['SuperAdmin'] },
        loadComponent: () =>
          import('./features/app-version/app-version.component').then(
            (m) => m.AppVersionComponent,
          ),
      },
    ],
  },
  {
    path: 'forbidden',
    loadComponent: () =>
      import('./shared/components/status-page/status-page.component').then(
        (m) => m.StatusPageComponent,
      ),
    data: {
      code: '403',
      title: 'Access denied',
      message: 'You do not have permission to view this page.',
    },
  },
  {
    path: '**',
    loadComponent: () =>
      import('./shared/components/status-page/status-page.component').then(
        (m) => m.StatusPageComponent,
      ),
    data: {
      code: '404',
      title: 'Page not found',
      message: 'The page you are looking for does not exist.',
    },
  },
];
