import { computed, signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { PaginatedResponse } from '../../core/models/paginated-response.model';

/** Fetches one page. Reads the caller's current filter/search/sort state. */
export type PageFetcher<T> = (
  page: number,
  pageSize: number,
) => Observable<PaginatedResponse<T[]>>;

/**
 * Accumulating list state for infinite-scroll pagination. Holds every row
 * loaded so far, tracks page / loading / hasMore, appends the next page on
 * `loadMore()`, and re-loads from page 1 on `reset()`.
 *
 * - `reset()` — call on init and whenever a filter / search / sort / teacher
 *   changes, and after a row mutation (delete / activate / approve) to refresh.
 * - `loadMore()` — call from the scroll sentinel; guarded against concurrent
 *   loads and against paging past the end.
 * - A `generation` token makes any in-flight page that a `reset()` superseded
 *   drop its response, so stale rows never land in a freshly-filtered list.
 */
export class InfiniteListStore<T> {
  private readonly _items = signal<T[]>([]);
  private readonly _totalCount = signal(0);
  private readonly _loading = signal(false);
  private readonly _initialized = signal(false);

  /** Rows accumulated across every loaded page. */
  readonly items = this._items.asReadonly();
  readonly totalCount = this._totalCount.asReadonly();
  /** True while any page (first or subsequent) is being fetched. */
  readonly loading = this._loading.asReadonly();
  /** True once the first page has resolved (used to gate the empty state). */
  readonly initialized = this._initialized.asReadonly();
  /** More rows remain on the server than are currently loaded. */
  readonly hasMore = computed(() => this._items().length < this._totalCount());
  /** First load done and nothing came back. */
  readonly isEmpty = computed(() => this._initialized() && this._items().length === 0);
  /** A subsequent page (not the first) is being fetched — drives the footer spinner. */
  readonly loadingMore = computed(() => this._loading() && this._items().length > 0);

  private page = 0;
  private generation = 0;
  private sub?: Subscription;

  constructor(
    private readonly pageSize: number,
    private readonly fetcher: PageFetcher<T>,
  ) {}

  /**
   * (Re)load from the first page. Call on init and whenever a filter / search /
   * sort changes, and after a row mutation. Any in-flight page is superseded.
   *
   * Currently-loaded rows are kept on screen until page 1 arrives (which then
   * replaces them wholesale — see `fetchNext`), so a filter change doesn't blank
   * the list. On the very first load there are no rows yet, so `initialized`
   * stays false and the caller shows an initial spinner.
   */
  reset(): void {
    this.generation++;
    this.sub?.unsubscribe();
    this.page = 0;
    this.fetchNext();
  }

  /** Append the next page. No-op while loading or once every row is loaded. */
  loadMore(): void {
    if (this._loading()) return;
    if (this._initialized() && !this.hasMore()) return;
    this.fetchNext();
  }

  private fetchNext(): void {
    const gen = this.generation;
    const nextPage = this.page + 1;
    this._loading.set(true);
    this.sub = this.fetcher(nextPage, this.pageSize).subscribe({
      next: (res) => {
        if (gen !== this.generation) return; // superseded by a reset()
        this.page = res.page ?? nextPage;
        this._totalCount.set(res.totalCount ?? 0);
        this._items.update((cur) => (nextPage === 1 ? res.data : [...cur, ...res.data]));
        this._initialized.set(true);
        this._loading.set(false);
      },
      error: () => {
        if (gen !== this.generation) return;
        // HTTP errors are already toasted by the global errorInterceptor.
        this._loading.set(false);
        this._initialized.set(true);
      },
    });
  }
}
