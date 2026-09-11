import { Component, ElementRef, computed, effect, inject, input, output } from '@angular/core';

/**
 * One dialog for the whole console.
 *
 * Seven feature files each carried their own `.xxx-backdrop` / `.xxx-modal` CSS
 * with the same `position: fixed; translate(-50%, -50%); width: min(Xpx, 92vw)`
 * block, and each got focus handling, Escape and scroll-locking slightly
 * differently or not at all. This replaces all of them.
 *
 * On phones it is a BOTTOM SHEET rather than a shrunken centred box: a dialog
 * pinned to the middle of a small screen puts its actions under the thumb's
 * reach and above the keyboard when one opens.
 */
@Component({
  selector: 'app-modal',
  standalone: true,
  template: `
    <div class="backdrop" (click)="onBackdrop($event)">
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="heading()"
        [style.--sheet-width]="width()"
        (click)="$event.stopPropagation()"
      >
        <header class="sheet-head">
          <h3>{{ heading() }}</h3>
          <button type="button" class="close" (click)="dismissed.emit()" aria-label="Close">
            &times;
          </button>
        </header>

        <div class="sheet-body">
          <ng-content></ng-content>
        </div>

        @if (hasFooter()) {
          <footer class="sheet-foot">
            <ng-content select="[modalActions]"></ng-content>
          </footer>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .backdrop {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal-backdrop);
        background: rgba(18, 22, 31, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--s-4);
      }
      .sheet {
        position: relative;
        z-index: var(--z-modal);
        width: min(var(--sheet-width, 520px), 100%);
        max-height: min(88vh, 760px);
        display: flex;
        flex-direction: column;
        background: var(--surface);
        border-radius: var(--r-lg);
        box-shadow: var(--lift-modal);
        overflow: hidden;
      }
      .sheet-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s-3);
        padding: var(--s-4);
        border-bottom: 1px solid var(--rule);
      }
      .sheet-head h3 {
        margin: 0;
        font-size: var(--t-md);
        font-weight: 600;
      }
      .close {
        border: 0;
        background: transparent;
        font-size: 1.6rem;
        line-height: 1;
        color: var(--ink-3);
        cursor: pointer;
        padding: 0 var(--s-1);
        border-radius: var(--r-sm);
      }
      .close:hover {
        color: var(--ink);
      }
      .sheet-body {
        padding: var(--s-4);
        overflow-y: auto;
      }
      .sheet-foot {
        display: flex;
        justify-content: flex-end;
        gap: var(--s-2);
        padding: var(--s-3) var(--s-4);
        border-top: 1px solid var(--rule);
        background: var(--surface-2);
      }

      /* Phones: a bottom sheet. Actions stay under the thumb, and the dialog is
         not fighting the on-screen keyboard for the middle of the viewport. */
      @media (max-width: 575.98px) {
        .backdrop {
          align-items: flex-end;
          padding: 0;
        }
        .sheet {
          width: 100%;
          max-height: 92vh;
          border-radius: var(--r-lg) var(--r-lg) 0 0;
        }
        .sheet-foot {
          padding-bottom: max(var(--s-3), env(safe-area-inset-bottom));
        }
      }
    `,
  ],
  host: {
    '(document:keydown.escape)': 'dismissed.emit()',
  },
})
export class ModalComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly heading = input.required<string>();

  /** Max width on tablet and up. Phones always go full-bleed. */
  readonly width = input('520px');

  /**
   * Whether clicking the backdrop closes the dialog. Off for forms holding
   * unsaved input, where a stray click would silently discard typing.
   */
  readonly dismissOnBackdrop = input(true);

  readonly dismissed = output<void>();

  protected readonly hasFooter = computed(() => true);

  constructor() {
    // The page behind a dialog must not scroll — on iOS especially, a scrolling
    // background under a sheet is disorienting and can strand the sheet offscreen.
    effect((onCleanup) => {
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      onCleanup(() => {
        document.body.style.overflow = previous;
      });
    });

    // Move focus into the dialog so keyboard and screen-reader users are not left
    // behind on the page underneath.
    effect(() => {
      queueMicrotask(() => {
        const target = this.host.nativeElement.querySelector<HTMLElement>(
          'input, select, textarea, button:not(.close), [tabindex]:not([tabindex="-1"])',
        );
        target?.focus();
      });
    });
  }

  protected onBackdrop(event: MouseEvent): void {
    if (this.dismissOnBackdrop()) {
      event.stopPropagation();
      this.dismissed.emit();
    }
  }
}
