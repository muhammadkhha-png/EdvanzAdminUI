import { Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AdminConsoleService, ConsolePending } from '../../core/services/admin-console.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  /** Roles allowed to see the link. Omitted = visible to any signed-in admin. */
  roles?: string[];
  /** Which pending count to badge this entry with, if any. */
  badge?: 'subscriptions' | 'centerSubscriptions' | 'independence';
}

interface NavGroup {
  /** Null for the first group, which needs no heading above the very top item. */
  title: string | null;
  items: NavItem[];
}

/**
 * Left navigation.
 *
 * TWO entries at the top, not four. Teachers used to be listed on four separate
 * screens (Overview, Usage, Teachers, Login activity) and nothing said which was
 * the real one. There is now ONE teacher list with views, and one page of numbers
 * above it.
 *
 * Grouped rather than a flat list: the console does three different
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
              @if (badgeFor(item); as count) {
                <!-- The number is in the accessible name too, not only in a coloured
                     pill — a queue with three people waiting has to read as three to
                     a screen reader as well. -->
                <span class="nav-badge" [attr.aria-label]="count + ' waiting'">{{ count }}</span>
              }
            </a>
          }
        }
      </nav>
    </aside>
  `,
  styles: [
    `
      .nav-badge {
        margin-left: auto;
        min-width: 22px;
        padding: 1px 7px;
        border-radius: 999px;
        background: #b45309;
        color: #fff;
        font-size: 0.7rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        text-align: center;
      }

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
  private readonly console = inject(AdminConsoleService);

  /**
   * Approval counts, fetched once when the shell mounts.
   *
   * A queue nobody is told about is a queue somebody has to REMEMBER to visit, and a
   * teacher waiting on an approval has no way to know they are waiting on nothing.
   * Deliberately not polled: this is a sidebar, not a monitor, and a count that is a
   * few minutes old still says "go and look".
   */
  protected readonly pending = signal<ConsolePending | null>(null);

  constructor() {
    // SuperAdmin-only endpoint. A non-admin gets a 403 and simply no badges, which is
    // the same as the links they cannot see anyway.
    this.console.getPending().subscribe({
      next: (p) => this.pending.set(p),
      error: () => this.pending.set(null),
    });
  }

  /** The count for one entry, or null when there is nothing waiting — an empty queue
   *  should show nothing at all rather than a zero, which reads as a number to act on. */
  protected badgeFor(item: NavItem): number | null {
    const p = this.pending();
    if (!p || !item.badge) return null;

    const count =
      item.badge === 'subscriptions'
        ? p.subscriptionRequests + p.subscriptionPayments + p.capacityRequests
        : item.badge === 'centerSubscriptions'
          ? p.centerSubscriptionRequests
          : p.teacherIndependenceRequests;

    return count > 0 ? count : null;
  }

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
        { label: 'Console', icon: '◎', route: '/console', roles: ['SuperAdmin'] },
        { label: 'Teachers', icon: '▤', route: '/teachers', roles: ['SuperAdmin'] },
      ],
    },
    {
      title: 'Accounts',
      items: [
        { label: 'Centers', icon: '🏢', route: '/centers' },
        { label: 'Assistants', icon: '🧑‍💼', route: '/assistants' },
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
          badge: 'subscriptions',
        },
        {
          label: 'Center subscriptions',
          icon: '📋',
          route: '/center-subscription-requests',
          roles: ['SuperAdmin'],
          badge: 'centerSubscriptions',
        },
        {
          label: 'Independence',
          icon: '🚪',
          route: '/teacher-independence-requests',
          roles: ['SuperAdmin'],
          badge: 'independence',
        },
      ],
    },
    {
      title: 'System',
      items: [
        { label: 'Sales', icon: '◆', route: '/sales', roles: ['SuperAdmin'] },
        { label: 'Watch checks', icon: '≠', route: '/watch-checks', roles: ['SuperAdmin'] },
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
