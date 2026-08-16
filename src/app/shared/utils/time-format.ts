// ── Timestamp display helpers (shared by admin list tables) ──────────────────
// Kept framework-free (plain functions, no DatePipe) so any standalone component
// can expose them to its template without pulling in CommonModule.

/** Absolute display of an ISO timestamp, e.g. "16 Aug 2026, 19:41". '' when null/invalid. */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
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
  if (!iso) return '';
  const t = new Date(iso).getTime();
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
