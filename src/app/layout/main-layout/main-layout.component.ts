import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from '../navbar/navbar.component';
import { SidebarComponent } from '../sidebar/sidebar.component';

/**
 * Shell for all authenticated pages. Owns sidebar collapse state and composes
 * sidebar + navbar around the routed content. Renders nothing business-specific.
 */
@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, NavbarComponent],
  template: `
    <div class="layout" [class.nav-open]="sidebarOpen()">
      <app-sidebar [open]="sidebarOpen()" (navigate)="sidebarOpen.set(false)" />
      <div class="backdrop" (click)="sidebarOpen.set(false)"></div>
      <div class="content-area">
        <app-navbar (toggleSidebar)="sidebarOpen.set(!sidebarOpen())" />
        <main class="page-scroll">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: [
    `
      .layout {
        display: flex;
        height: 100vh;
        overflow: hidden;
      }
      .content-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .page-scroll {
        flex: 1;
        overflow-y: auto;
        padding: 1.5rem;
        background: var(--edvanz-bg, #f1f5f9);
      }
      /* Backdrop only exists on mobile, when the drawer is open. */
      .backdrop {
        display: none;
      }
      @media (max-width: 991.98px) {
        .backdrop {
          display: block;
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.5);
          z-index: 1040;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease;
        }
        .layout.nav-open .backdrop {
          opacity: 1;
          pointer-events: auto;
        }
        .page-scroll {
          padding: 1rem;
        }
      }
    `,
  ],
})
export class MainLayoutComponent {
  protected readonly sidebarOpen = signal(false);
}
