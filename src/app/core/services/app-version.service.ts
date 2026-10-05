import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResult } from '../models/api-result.model';

/**
 * Forced/optional-update thresholds for a single mobile platform.
 *
 * The mobile app compares its own build number against these on launch:
 *   build <  minSupportedBuild            -> FORCED (blocking) update
 *   minSupportedBuild <= build < latest   -> optional update prompt
 *   build >= latestBuild                  -> up to date
 */
export interface AppVersionPlatformConfig {
  /** Lowest build allowed to keep running; anything below is force-updated. */
  minSupportedBuild: number;
  /** Newest build published to the store. */
  latestBuild: number;
  /** Human-readable version string of the latest build (e.g. "2.3.4"). */
  latestVersion: string;
  /** Deep link to the platform's store listing shown in the update prompt. */
  storeUrl: string;
}

/** Both platforms' update-gate configuration, as returned/accepted by the admin API. */
export interface AppVersionConfig {
  android: AppVersionPlatformConfig;
  ios: AppVersionPlatformConfig;
}

/** Accounts last seen on one app build (GET /api/admin/app-version/usage). */
export interface AppBuildUsage {
  platform: string;
  build: number;
  users: number;
  /** Below the platform's current minimum: these accounts get the update screen. */
  belowMinimum: boolean;
}

/** Who is on which build, and who is still on an app too old to report one. */
export interface AppVersionUsage {
  windowDays: number;
  asOfUtc: string;
  builds: AppBuildUsage[];
  oldAppUsers: number;
  oldAppUsersByRole: { role: string; users: number }[];
}

/**
 * SuperAdmin app-version / update-gate configuration.
 * GET/PUT /api/admin/app-version — both require a SuperAdmin token (attached by
 * the auth interceptor). Reads the payload through the standard `data` envelope,
 * exactly like the other core services.
 */
@Injectable({ providedIn: 'root' })
export class AppVersionService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /** GET /api/admin/app-version — current thresholds for both platforms. */
  getConfig(): Observable<AppVersionConfig> {
    return this.http
      .get<ApiResult<AppVersionConfig>>(`${this.base}/admin/app-version`)
      .pipe(map((r) => r.data));
  }

  /** GET /api/admin/app-version/usage — accounts per build over the last N days (default 30). */
  getUsage(days = 30): Observable<AppVersionUsage> {
    return this.http
      .get<ApiResult<AppVersionUsage>>(`${this.base}/admin/app-version/usage`, { params: { days } })
      .pipe(map((r) => r.data));
  }

  /** PUT /api/admin/app-version — replaces both platforms; returns the updated config. */
  updateConfig(body: AppVersionConfig): Observable<AppVersionConfig> {
    return this.http
      .put<ApiResult<AppVersionConfig>>(`${this.base}/admin/app-version`, body)
      .pipe(map((r) => r.data));
  }
}
