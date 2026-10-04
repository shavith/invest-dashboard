import { averageRank, midpointPercentile, round10 } from "./percentile";
import type { PilotRecord, WeightSet } from "./types";

export type PilotModules = {
  scale: number | null;
  value: number | null;
  growth: number | null;
  profit: number | null;
  capPercentile: number | null;
  revenuePercentile: number | null;
  revenueCagr: number | null;
};

export type PilotScored = PilotRecord & {
  eligible: boolean;
  cohortN: number;
  modules: PilotModules;
  ready: boolean;
};

export type PilotTarget = PilotScored & {
  score: number | null;
  rank: number | null;
  low: number | null;
  high: number | null;
};

const UTILITY = "utilities";

function isUtility(record: PilotRecord): boolean {
  return record.sector.trim().toLowerCase() === UTILITY;
}

function eligible(record: PilotRecord): boolean {
  if (!record.cohort || !(record.marketCap >= 10)) return false;
  if (!(record.ttmRevenue > 0) || !(record.fyRevenue > 0) || !(record.fyRevenue3 > 0)) return false;
  if (!(record.trailingPe > 0) || !(record.evEbitda > 0)) return false;
  if (!Number.isFinite(record.roic) || !Number.isFinite(record.margin)) return false;
  if (isUtility(record)) return record.priceBook != null && record.priceBook > 0;
  return record.fcfYield != null && Number.isFinite(record.fcfYield);
}

function cagr(latest: number, earlier: number): number | null {
  if (!(latest > 0) || !(earlier > 0)) return null;
  return round10(Math.pow(latest / earlier, 1 / 3) - 1);
}

export function scorePilotUniverse(records: PilotRecord[], minN: number): PilotScored[] {
  const flags = records.map(eligible);
  return records.map((record, index) => {
    const ok = flags[index]!;
    const peers = records.filter((peer, peerIndex) => flags[peerIndex] && peer.cohort === record.cohort);
    const cohortN = peers.length;
    const blank: PilotModules = {
      scale: null,
      value: null,
      growth: null,
      profit: null,
      capPercentile: null,
      revenuePercentile: null,
      revenueCagr: null,
    };
    if (!ok || cohortN < minN) {
      return { ...record, eligible: ok, cohortN, modules: blank, ready: false };
    }
    const capPercentile = midpointPercentile(
      record.marketCap,
      peers.map((peer) => peer.marketCap),
      true,
      minN,
    );
    const revenuePercentile = midpointPercentile(
      record.ttmRevenue,
      peers.map((peer) => peer.ttmRevenue),
      true,
      minN,
    );
    const scale =
      capPercentile == null || revenuePercentile == null
        ? null
        : round10((capPercentile + revenuePercentile) / 2);
    const pe = midpointPercentile(
      record.trailingPe,
      peers.map((peer) => peer.trailingPe),
      false,
      minN,
    );
    const ev = midpointPercentile(
      record.evEbitda,
      peers.map((peer) => peer.evEbitda),
      false,
      minN,
    );
    let value: number | null = null;
    if (isUtility(record)) {
      const books = peers.map((peer) => peer.priceBook).filter((book): book is number => book != null);
      const pb = record.priceBook == null ? null : midpointPercentile(record.priceBook, books, false, minN);
      value = pe == null || ev == null || pb == null ? null : round10(0.4 * pe + 0.4 * ev + 0.2 * pb);
    } else {
      const yields = peers.map((peer) => peer.fcfYield).filter((yieldValue): yieldValue is number => yieldValue != null);
      const fcf = record.fcfYield == null ? null : midpointPercentile(record.fcfYield, yields, true, minN);
      value = pe == null || ev == null || fcf == null ? null : round10(0.35 * pe + 0.35 * ev + 0.3 * fcf);
    }
    const revenueCagr = cagr(record.fyRevenue, record.fyRevenue3);
    const growthPeers = peers
      .map((peer) => cagr(peer.fyRevenue, peer.fyRevenue3))
      .filter((rate): rate is number => rate != null);
    const growth =
      revenueCagr == null ? null : midpointPercentile(revenueCagr, growthPeers, true, minN);
    const roic = midpointPercentile(
      record.roic,
      peers.map((peer) => peer.roic),
      true,
      minN,
    );
    const margin = midpointPercentile(
      record.margin,
      peers.map((peer) => peer.margin),
      true,
      minN,
    );
    const profit = roic == null || margin == null ? null : round10((roic + margin) / 2);
    const ready = scale != null && value != null && growth != null && profit != null;
    return {
      ...record,
      eligible: true,
      cohortN,
      ready,
      modules: { scale, value, growth, profit, capPercentile, revenuePercentile, revenueCagr },
    };
  });
}

export function aggregateScore(modules: PilotModules, weights: WeightSet): number | null {
  const parts = [modules.scale, modules.value, modules.growth, modules.profit];
  if (parts.some((part) => part == null)) return null;
  return round10(
    weights.scale * modules.scale! +
      weights.value * modules.value! +
      weights.growth * modules.growth! +
      weights.profit * modules.profit!,
  );
}

/** One weight ±delta; the other three move by ∓delta/3. Returns the score band. */
export function sensitivityBand(modules: PilotModules, weights: WeightSet, delta: number): { low: number; high: number } | null {
  const base = aggregateScore(modules, weights);
  if (base == null || modules.scale == null || modules.value == null || modules.growth == null || modules.profit == null) {
    return null;
  }
  const parts = [modules.scale, modules.value, modules.growth, modules.profit];
  const sum = parts.reduce((total, part) => total + part, 0);
  const shifts = parts.flatMap((part) => {
    const gap = part - (sum - part) / 3;
    return [base + delta * gap, base - delta * gap];
  });
  return { low: round10(Math.min(...shifts)), high: round10(Math.max(...shifts)) };
}

export function rankPilot(scored: PilotScored[], weights: WeightSet, delta: number): PilotTarget[] {
  const rows = scored.map((row) => {
    const score = row.ready ? aggregateScore(row.modules, weights) : null;
    const band = score == null ? null : sensitivityBand(row.modules, weights, delta);
    return {
      ...row,
      score,
      rank: null as number | null,
      low: band?.low ?? null,
      high: band?.high ?? null,
    };
  });
  const targetScores = rows
    .filter((row) => row.target && row.score != null)
    .map((row) => row.score!);
  return rows.map((row) => ({
    ...row,
    rank: row.target && row.score != null ? averageRank(row.score, targetScores) : null,
  }));
}
