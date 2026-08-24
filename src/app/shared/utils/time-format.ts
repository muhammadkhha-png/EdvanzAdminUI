// ── Timestamp display helpers (shared by admin list tables) ──────────────────
// Kept framework-free (plain functions, no DatePipe) so any standalone component
// can expose them to its template without pulling in CommonModule.

/**
 * Milliseconds since epoch for an ISO timestamp, treating a ZONE-LESS value as UTC.
 *
 * The API stores timestamps as UTC but EF reads them back from SQL Server as
 * DateTimeKind.Unspecified, so System.Text.Json emits a bare
 * "2026-08-16T17:48:00" with no trailing 'Z' and no offset. The browser's
 * `new Date()` parses such a zone-less string as LOCAL time, which shifts it by
 * the viewer's UTC offset (e.g. Egypt +3 → "3h ago" the instant you log in).
 * Appending 'Z' when no zone designator is present forces correct UTC parsing;
 * strings that already carry 'Z' or a +/-HH:MM offset are left untouched.
 *
 * Returns NaN for null/invalid input (callers already guard on that).
 */
function parseTimestampMs(iso?: string | null): number {
  if (!iso) return NaN;
  const hasZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(iso);
  return new Date(hasZone ? iso : `${iso}Z`).getTime();
}

/** Date-only display of an ISO timestamp, e.g. "16 Aug 2026". '' when null/invalid. */
export function formatDate(iso?: string | null): string {
  const ms = parseTimestampMs(iso);
  if (Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Absolute display of an ISO timestamp, e.g. "16 Aug 2026, 19:41". '' when null/invalid. */
export function formatDateTime(iso?: string | null): string {
  const ms = parseTimestampMs(iso);
  if (Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Compact "time ago" label for an ISO timestamp (e.g. "5m ago", "3d ago").
 * Returns '' when null/invalid, and the absolute date for future timestamps
 * (clock skew) so the cell never reads "-1s ago".
 */
export function timeAgo(iso?: string | null): string {
  const t = parseTimestampMs(iso);
  if (Number.isNaN(t)) return '';

  const secs = Math.floor((Date.now() - t) / 1000);
  if (secs < 0) return formatDateTime(iso);
  if (secs < 60) return 'just now';

  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  return `${Math.floor(days / 365)}y ago`;
}
