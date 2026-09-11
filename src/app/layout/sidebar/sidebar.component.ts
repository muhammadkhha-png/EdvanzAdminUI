import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  /** Roles allowed to see the link. Omitted = visible to any signed-in admin. */
  roles?: string[];
}

interface NavGroup {
  /** Null for the first group, which needs no heading above the very top item. */
  title: string | null;
  items: NavItem[];
}

/**
 * Left navigation.
 *
 * Grouped rather than a flat list of eleven: the console does three different
 * jobs — understanding usage, managing accounts, and clearing queues — and a
 * single undifferentiated column made every page look equally likely to be the
 * one you wanted.
 *
 * Links are also FILTERED BY ROLE now. Previously a non-SuperAdmin was shown
 * SuperAdmin links that bounced them to /forbidden, which reads as a broken app
 * rather than a permission boundary.
 *
 * Desktop (>= 992px): a static full-height column.
 * Mobile: an off-canvas drawer, slid in by the navbar's toggle, emitting
 * `navigate` on a link tap so the parent can close it after routing.
 */
@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <aside class="sidebar" [class.open]="open()">
      <div class="brand">
        <span class="brand-mark">E</span>
        <span class="brand-text">Edvanz Admin</span>
      </div>

      <nav class="nav-list">
        @for (group of visibleGroups(); track group.title) {
          @if (group.title) {
            <p class="group-title">{{ group.title }}</p>
          }
          @for (item of group.items; track item.route) {
            <a
              class="nav-link"
              [routerLink]="item.route"
              routerLinkActive="active"
              [title]="item.label"
              (click)="navigate.emit()"
            >
              <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span>
              <span class="nav-label">{{ item.label }}</span>
            </a>
          }
        }
      </nav>
    </aside>
  `,
  styles: [
    `
      .sidebar {
        width: 244px;
        background: var(--ink);
        color: #d9dde6;
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
        overflow-y: auto;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: var(--s-2);
        padding: var(--s-4);
        font-weight: 650;
        font-size: var(--t-md);
        color: #fff;
        letter-spacing: -0.01em;
      }
      .brand-mark {
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border-radius: var(--r-sm);
        background: var(--accent);
        color: #fff;
        flex-shrink: 0;
        font-size: var(--t-base);
      }
      .nav-list {
        display: flex;
        flex-direction: column;
        gap: 1px;
        padding: 0 var(--s-2) var(--s-5);
      }
      .group-title {
        margin: var(--s-4) 0 var(--s-1);
        padding: 0 var(--s-3);
        font-size: var(--t-xs);
        font-weight: 500;
        color: #6b7485;
      }
      .nav-link {
        display: flex;
        align-items: center;
        gap: var(--s-2);
        padding: 0.55rem var(--s-3);
        border-radius: var(--r-sm);
        color: #c3c9d4;
        text-decoration: none;
        white-space: nowrap;
        font-size: var(--t-sm);
      }
      .nav-link:hover {
        background: rgba(255, 255, 255, 0.06);
        color: #fff;
      }
      .nav-link.active {
        background: var(--accent);
        color: #fff;
        font-weight: 500;
      }
      .nav-icon {
        font-size: 1rem;
        width: 1.2rem;
        text-align: center;
        flex-shrink: 0;
      }

      /* Mobile / tablet: off-canvas drawer sliding over the content. */
      @media (max-width: 991.98px) {
        .sidebar {
          position: fixed;
          top: 0;
          left: 0;
          height: 100vh;
          z-index: var(--z-drawer);
          transform: translateX(-100%);
          transition: transform 0.22s ease;
          box-shadow: var(--lift-pop);
        }
        .sidebar.open {
          transform: translateX(0);
        }
      }
    `,
  ],
})
export class SidebarComponent {
  private readonly auth = inject(AuthService);

  readonly open = input(false);
  readonly navigate = output<void>();

  /**
   * Emoji icons keep the shell dependency-free — no icon-font package, and they
   * render on every platform the team uses.
   */
  private readonly groups: NavGroup[] = [
    {
      title: null,
      items: [
        { label: 'Overview', icon: '◎', route: '/overview', roles: ['SuperAdmin'] },
        { label: 'Usage', icon: '▤', route: '/usage', roles: ['SuperAdmin'] },
      ],
    },
    {
      title: 'Accounts',
      items: [
        { label: 'Teachers', icon: '🧑‍🏫', route: '/teachers' },
        { label: 'Centers', icon: '🏢', route: '/centers' },
        { label: 'Assistants', icon: '🧑‍💼', route: '/assistants' },
        // Kept alongside Usage rather than replaced by it: this screen carries
        // the per-assistant device/IP login audit, which is a different question
        // from "is this account being worked".
        { label: 'Login activity', icon: '🕒', route: '/activity', roles: ['SuperAdmin'] },
        { label: 'Students', icon: '🎓', route: '/students' },
        { label: 'Student accounts', icon: '🪪', route: '/student-accounts' },
      ],
    },
    {
      title: 'Requests',
      items: [
        {
          label: 'Subscriptions',
          icon: '🧾',
          route: '/subscription-requests',
          roles: ['SuperAdmin'],
        },
        {
          label: 'Center subscriptions',
          icon: '📋',
          route: '/center-subscription-requests',
          roles: ['SuperAdmin'],
        },
        {
          label: 'Independence',
          icon: '🚪',
          route: '/teacher-independence-requests',
          roles: ['SuperAdmin'],
        },
      ],
    },
    {
      title: 'System',
      items: [
        { label: 'Sales', icon: '◆', route: '/sales', roles: ['SuperAdmin'] },
        { label: 'App version', icon: '📱', route: '/app-version', roles: ['SuperAdmin'] },
      ],
    },
  ];

  /**
   * Hides links the signed-in user cannot open. A link that only ever leads to
   * /forbidden is worse than no link — it looks like the app is broken.
   */
  protected readonly visibleGroups = computed<NavGroup[]>(() => {
    const roles = this.auth.currentUser()?.roles ?? [];
    return this.groups
      .map((group) => ({
        title: group.title,
        items: group.items.filter(
          (item) => !item.roles || item.roles.some((r) => roles.includes(r)),
        ),
      }))
      .filter((group) => group.items.length > 0);
  });
}
