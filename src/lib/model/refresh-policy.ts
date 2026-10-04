export const DAILY_REFRESH_MS = 24 * 60 * 60 * 1000;

export function dailyRefreshDue(
  enabled: boolean,
  key: string,
  provider: string,
  lastAttempt: { at: string; provider: string } | null,
  now = Date.now(),
): boolean {
  if (!enabled || key.trim().length < 8 || provider === "Not connected" || !Number.isFinite(now)) return false;
  if (!lastAttempt || lastAttempt.provider !== provider) return true;
  const then = Date.parse(lastAttempt.at);
  return !Number.isFinite(then) || now - then >= DAILY_REFRESH_MS;
}

export function trackedTickers(pilot: { ticker: string }[], companies: { ticker: string }[]): string[] {
  return [...new Set([...pilot, ...companies].map((row) => row.ticker.trim().toUpperCase()))]
    .filter((ticker) => /^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker));
}
