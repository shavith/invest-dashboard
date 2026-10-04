export function round10(n: number): number {
  return Math.round(n * 1e10) / 1e10;
}

/** Midpoint rank percentile. `peers` includes `value`. */
export function midpointPercentile(
  value: number,
  peers: number[],
  higherIsBetter: boolean,
  minN: number,
): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(minN) || peers.some((peer) => !Number.isFinite(peer)) || !peers.includes(value)) return null;
  const n = peers.length;
  if (n < Math.max(2, minN)) return null;
  let min = peers[0]!;
  let max = peers[0]!;
  let less = 0;
  let equal = 0;
  for (const peer of peers) {
    if (peer < min) min = peer;
    if (peer > max) max = peer;
    if (peer < value) less += 1;
    else if (peer === value) equal += 1;
  }
  if (max === min) return 50;
  const raw = (100 * (less + 0.5 * (equal - 1))) / (n - 1);
  return round10(higherIsBetter ? raw : 100 - raw);
}

export function averageRank(score: number, scores: number[]): number {
  let higher = 0;
  let equal = 0;
  for (const other of scores) {
    if (other > score) higher += 1;
    else if (other === score) equal += 1;
  }
  return round10(1 + higher + (equal - 1) / 2);
}

export function weightsValid(weights: number[], sensitivity = 0): boolean {
  if (weights.length === 0 || weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    return false;
  }
  const sum = weights.reduce((total, weight) => total + weight, 0);
  if (Math.abs(sum - 1) > 0.000001) return false;
  if (!Number.isFinite(sensitivity) || sensitivity < 0) return false;
  const min = Math.min(...weights);
  return sensitivity <= min + 1e-9;
}

export function daysBetween(laterIso: string, earlierIso: string): number | null {
  const parseDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const date = Date.parse(value);
    return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === value ? date : NaN;
  };
  const later = parseDate(laterIso);
  const earlier = parseDate(earlierIso);
  if (!Number.isFinite(later) || !Number.isFinite(earlier)) return null;
  return Math.round((later - earlier) / 86_400_000);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}
