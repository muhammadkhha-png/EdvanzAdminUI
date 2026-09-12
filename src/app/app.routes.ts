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
      { path: '', pathMatch: 'full', redirectTo: 'console' },
      {
        // THE LANDING PAGE. Answers the two questions asked every morning — what
        // changed since yesterday, and how the business is doing — and every number
        // on it opens the people inside it.
        path: 'console',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Console', roles: ['SuperAdmin'] },
        loadComponent: () =>
          import('./features/console/dashboard.component').then(
            (m) => m.ConsoleDashboardComponent,
          ),
      },
      // The old landing page. Its endpoint is still live and the page still works;
      // it is kept reachable for one release so a bookmark does not 404, and the
      // sidebar no longer offers it.
      {
        path: 'numbers',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Numbers', roles: ['SuperAdmin'] },
        loadComponent: () =>
          import('./features/numbers/numbers.component').then((m) => m.NumbersComponent),
      },
      {
        // THE ONE TEACHER LIST. Four screens used to list teachers; this replaced
        // all of them, with views as preset filters over the same rows.
        path: 'teachers',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Teachers', roles: ['SuperAdmin'] },
        loadComponent: () =>
          import('./features/teachers-list/teachers-list.component').then(
            (m) => m.TeachersListComponent,
          ),
      },
      // The teacher FORMS and admin panels stay — they are where the actions live,
      // and the detail panel links to them.
      {
        path: 'teacher',
        loadChildren: () =>
          import('./features/teachers/teachers.routes').then((m) => m.TEACHERS_ROUTES),
      },
      // Old links and bookmarks land on the list rather than a 404. NOTE: redirectTo
      // cannot carry a query string — Angular treats it as a path segment — so these
      // land on the default view ("to contact") rather than a specific one.
      // NOTE: nothing may redirect 'activity' here. A redirect declared above the
      // real ActivityMonitorComponent route below shadowed it completely, and the
      // Activity Monitor — the only screen carrying "Newly subscribed" and the
      // registered date-range — became unreachable dead code.
      { path: 'overview', pathMatch: 'full', redirectTo: 'teachers' },
      { path: 'dashboard', pathMatch: 'full', redirectTo: 'console' },
      { path: 'usage', pathMatch: 'full', redirectTo: 'teachers' },
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
        // The sidebar has linked here since the sales page shipped; the route was
        // never declared, so every click landed on the 404 page.
        path: 'sales',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Sales', roles: ['SuperAdmin'] },
        loadComponent: () =>
          import('./features/sales/sales.component').then((m) => m.SalesComponent),
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
