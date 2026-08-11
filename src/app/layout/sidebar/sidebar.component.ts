import { Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

/**
 * Left navigation. On desktop (>= 992px) it is a static full-height column.
 * On mobile it becomes an off-canvas drawer: hidden by default, slid in when
 * `open` is true (toggled by the navbar ☰), and it emits `navigate` on a link
 * tap so the parent can close the drawer after routing.
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
        @for (item of items; track item.route) {
          <a
            class="nav-link"
            [routerLink]="item.route"
            routerLinkActive="active"
            [title]="item.label"
            (click)="navigate.emit()"
          >
            <span class="nav-icon">{{ item.icon }}</span>
            <span class="nav-label">{{ item.label }}</span>
          </a>
        }
      </nav>
    </aside>
  `,
  styles: [
    `
      .sidebar {
        width: 240px;
        background: var(--edvanz-sidebar, #0f172a);
        color: #e2e8f0;
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        padding: 1.15rem 1rem;
        font-weight: 700;
        font-size: 1.05rem;
      }
      .brand-mark {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: var(--edvanz-primary, #2563eb);
        color: #fff;
        flex-shrink: 0;
      }
      .nav-list {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        padding: 0.5rem;
      }
      .nav-link {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.65rem 0.75rem;
        border-radius: 8px;
        color: #cbd5e1;
        text-decoration: none;
        white-space: nowrap;
      }
      .nav-link:hover {
        background: rgba(255, 255, 255, 0.06);
        color: #fff;
      }
      .nav-link.active {
        background: var(--edvanz-primary, #2563eb);
        color: #fff;
      }
      .nav-icon {
        font-size: 1.1rem;
        text-align: center;
      }

      /* Mobile / tablet: off-canvas drawer that slides over the content. */
      @media (max-width: 991.98px) {
        .sidebar {
          position: fixed;
          top: 0;
          left: 0;
          height: 100vh;
          z-index: 1050;
          transform: translateX(-100%);
          transition: transform 0.25s ease;
          box-shadow: 2px 0 12px rgba(0, 0, 0, 0.25);
        }
        .sidebar.open {
          transform: translateX(0);
        }
      }
    `,
  ],
})
export class SidebarComponent {
  readonly open = input(false);
  readonly navigate = output<void>();

  // Emoji icons keep the shell dependency-free (no icon-font package).
  protected readonly items: NavItem[] = [
    { label: 'Dashboard', icon: '📊', route: '/dashboard' },
    { label: 'Teachers', icon: '🧑‍🏫', route: '/teachers' },
    { label: 'Assistants', icon: '🧑‍💼', route: '/assistants' },
    { label: 'Students', icon: '🎓', route: '/students' },
  ];
}
