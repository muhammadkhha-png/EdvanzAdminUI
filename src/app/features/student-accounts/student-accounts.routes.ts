import { Routes } from '@angular/router';

/**
 * Student Accounts area (StudentUserController — the mobile-app login
 * identity). List only for now: no create/edit/detail screens exist for
 * this module, unlike the separate Students area.
 */
export const STUDENT_ACCOUNTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./student-accounts-list/student-accounts-list.component').then(
        (m) => m.StudentAccountsListComponent,
      ),
    data: { breadcrumb: 'Student Accounts' },
  },
];
