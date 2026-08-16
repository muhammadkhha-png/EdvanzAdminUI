import {
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';

/**
 * Emits `(scrolled)` when the host element (a sentinel placed at the end of a
 * list) enters — or comes within `rootMargin` of — the viewport. Classic
 * infinite-scroll trigger, implemented with IntersectionObserver so it works
 * whether the page scrolls the window or an inner overflow container (the
 * observer clips against intermediate scroll containers automatically).
 *
 * Usage:
 *   <div appInfiniteScroll [appInfiniteScrollDisabled]="store.loading()"
 *        (scrolled)="store.loadMore()"></div>
 *
 * `appInfiniteScrollDisabled` guards against firing while a page is already in
 * flight. When it flips back to false (a load settled), the sentinel is
 * re-observed so a still-visible sentinel keeps paging until the viewport is
 * filled or the sentinel is removed (render it only while more pages remain).
 */
@Directive({
  selector: '[appInfiniteScroll]',
  standalone: true,
})
export class InfiniteScrollDirective implements OnInit, OnChanges, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer?: IntersectionObserver;

  /** Ignore intersections while true (e.g. a page fetch is in flight). */
  @Input('appInfiniteScrollDisabled') disabled = false;

  /** Prefetch distance below the viewport bottom, e.g. '300px'. */
  @Input() infiniteScrollMargin = '300px';

  @Output('scrolled') readonly scrolled = new EventEmitter<void>();

  ngOnInit(): void {
    if (typeof IntersectionObserver === 'undefined') return;
    this.observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && !this.disabled) {
          this.scrolled.emit();
        }
      },
      { root: null, rootMargin: `0px 0px ${this.infiniteScrollMargin} 0px`, threshold: 0 },
    );
    this.observer.observe(this.host.nativeElement);
  }

  ngOnChanges(changes: SimpleChanges): void {
    // When a load finishes (disabled: true -> false) re-observe so a sentinel
    // that is still on-screen re-fires and paging continues until it's pushed
    // out of view. Re-observing forces IntersectionObserver to re-deliver the
    // current intersection state on the next tick.
    const change = changes['disabled'];
    if (change && !change.firstChange && !this.disabled && this.observer) {
      this.observer.unobserve(this.host.nativeElement);
      this.observer.observe(this.host.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
