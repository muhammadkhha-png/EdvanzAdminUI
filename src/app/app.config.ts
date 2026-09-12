import {
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withNavigationErrorHandler,
} from '@angular/router';
import { APP_ROUTES } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';

/**
 * A lazy chunk that 404s leaves a WHITE PAGE, and a deploy is what causes it.
 *
 * Every screen here is lazy-loaded, and each build names its chunks by content
 * hash. A tab that was open across a deploy still holds the previous index.html,
 * so the moment it routes anywhere it asks for a chunk filename that no longer
 * exists: the navigation rejects, nothing renders, and the app looks dead rather
 * than out of date. GitHub Pages caches index.html aggressively enough that a
 * normal refresh does not always clear it either.
 *
 * So a chunk-load failure reloads the page once. The guard is a TIMESTAMP rather than
 * a flag: a flag never clears, so the first recovery of a session would block every
 * later one, and the next deploy would be a white page again. A window self-heals —
 * two failures seconds apart is a loop and stops, two failures an hour apart are two
 * separate deploys and both recover. Anything that is not a chunk-load failure is
 * left alone.
 */
function recoverFromStaleBuild(error: unknown): void {
  const message = String((error as Error)?.message ?? error);
  const isChunkFailure =
    /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported module/i.test(
      message,
    );

  if (!isChunkFailure) {
    console.error('[router]', error);
    return;
  }

  const KEY = 'edvanz.reloadedForStaleBuild';
  const LOOP_WINDOW_MS = 15_000;
  const lastReload = Number(sessionStorage.getItem(KEY) ?? 0);

  if (Date.now() - lastReload < LOOP_WINDOW_MS) {
    console.error('[router] chunk still missing after a reload; not looping', error);
    return;
  }

  sessionStorage.setItem(KEY, String(Date.now()));
  location.reload();
}

/**
 * Standalone application providers. Interceptor order matters: auth runs first
 * (attaches token + starts the loading counter), error wraps the response.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      APP_ROUTES,
      withComponentInputBinding(),
      withNavigationErrorHandler(recoverFromStaleBuild),
    ),
    provideHttpClient(
      withInterceptors([authInterceptor, errorInterceptor]),
    ),
  ],
};
