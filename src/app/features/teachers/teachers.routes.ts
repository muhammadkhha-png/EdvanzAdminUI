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
        // THE DEFAULT TAB: the state of the account on one screen.
        path: '',
        loadComponent: () =>
          import('./teacher-details/teacher-overview.component').then(
            (m) => m.TeacherOverviewComponent,
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
        path: 'students',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Students', roles: ['SuperAdmin'] },
        loadComponent: () =>
          import('./teacher-details/teacher-roster.component').then(
            (m) => m.TeacherRosterComponent,
          ),
      },
      {
        // The students' OWN logins. Deliberately a separate tab from the roster —
        // conflating a record a teacher created with a student's account is how
        // "the student cannot see anything" turns into an hour of confusion.
        path: 'student-accounts',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Student accounts', roles: ['SuperAdmin'] },
        loadComponent: () =>
          import('./teacher-details/teacher-roster.component').then(
            (m) => m.TeacherStudentAccountsComponent,
          ),
      },
      {
        path: 'team',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Team', roles: ['SuperAdmin'] },
        loadComponent: () =>
          import('./teacher-details/teacher-team.component').then((m) => m.TeacherTeamComponent),
      },
      {
        path: 'activity',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Activity', roles: ['SuperAdmin'] },
        loadComponent: () =>
          import('./teacher-details/teacher-activity.component').then(
            (m) => m.TeacherActivityComponent,
          ),
      },
      {
        path: 'snapshot',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'What they have', roles: ['SuperAdmin'] },
        loadComponent: () =>
          import('./teacher-details/teacher-snapshot.component').then(
            (m) => m.TeacherSnapshotComponent,
          ),
      },
      {
        path: 'modules',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'Modules', roles: ['SuperAdmin'] },
        loadComponent: () =>
          import('./modules-panel/modules-panel.component').then((m) => m.ModulesPanelComponent),
      },
      {
        // The profile and the capacity/billing editors. Kept as its own tab rather
        // than folded into Overview: Overview READS the account, this one CHANGES it,
        // and losing the capacity controls is exactly the regression this rebuild is
        // meant to undo.
        path: 'profile',
        loadComponent: () =>
          import('./teacher-details/teacher-info.component').then((m) => m.TeacherInfoComponent),
        data: { breadcrumb: 'Profile' },
      },
      {
        // The old Teacher 360 usage tab. Its content now lives on Overview (the
        // numbers) and Activity (the day-by-day), so this only keeps a bookmark
        // working for one release.
        path: 'usage',
        pathMatch: 'full',
        redirectTo: 'activity',
      },
    ],
  },
];
