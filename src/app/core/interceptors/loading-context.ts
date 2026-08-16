import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * When set on a request's HttpContext, the auth interceptor skips the global
 * full-screen loading overlay for that call. Used by infinite-scroll list
 * fetches so appending the next page doesn't flash the blocking overlay on
 * every scroll — a small inline "loading more…" spinner is shown instead.
 *
 * This is purely client-side request metadata: it never leaves the browser,
 * so the outgoing URL / params / body (the API contract) are unchanged.
 */
export const SKIP_GLOBAL_LOADING = new HttpContextToken<boolean>(() => false);

/** Convenience: an HttpContext that opts the request out of the global overlay. */
export function skipGlobalLoading(): HttpContext {
  return new HttpContext().set(SKIP_GLOBAL_LOADING, true);
}
