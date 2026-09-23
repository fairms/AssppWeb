export function formatBytes(value?: number | string): string {
  if (value === undefined || value === null || value === '') return '—';

  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const amount = bytes / 1024 ** unitIndex;
  const digits = unitIndex === 0 || amount >= 100 ? 0 : 1;

  return `${amount.toFixed(digits)} ${units[unitIndex]}`;
}

/**
 * Formats an App Store rating to one decimal, or returns null when the store
 * did not report one. Apple omits `averageUserRating` for some storefronts and
 * unrated apps, and calling `toFixed` on that `undefined` used to take the
 * whole page down with it.
 */
export function formatRating(value?: number | null): string | null {
  if (value === undefined || value === null) return null;
  const rating = Number(value);
  if (!Number.isFinite(rating)) return null;
  return rating.toFixed(1);
}

