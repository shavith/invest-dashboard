import { averageRank, daysBetween, median, midpointPercentile, round10, weightsValid } from "./percentile";
import { sensitivityBand } from "./pilot";
import type { Num, Relationship, ResearchCompany, Rules, WeightSet } from "./types";

export type ResearchRow = {
  company: ResearchCompany;
  capEligible: boolean;
  revenueReady: boolean;
  inputStatus: string;
  capPercentile: Num;
  revenuePercentile: Num;
  scale: Num;
  network: Num;
  networkStatus: string;
  qualifyingTies: number;
  strength: Num;
  strengthStatus: string;
  forwardPe: Num;
  forwardEvEbitda: Num;
  fcfYield: Num;
  priceBook: Num;
  valuation: Num;
  valuationStatus: string;
  epsCagr: Num;
  guideGrowth: Num;
  growth: Num;
  growthStatus: string;
  profitability: Num;
  profitStatus: string;
  overall: Num;
  overallStatus: string;
  ready: boolean;
  rank: Num;
  bandLow: Num;
  bandHigh: Num;
};

function num(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function effectiveFloor(rules: Rules): number {
  return Math.max(10, rules.capFloor);
}

function profileOf(company: ResearchCompany): "general" | "utilities" | "unsupported" {
  const text = `${company.sector} ${company.industry}`.toLowerCase();
  if (/financial|bank|insurance|reit|real estate/.test(text)) return "unsupported";
  if (company.sector.trim().toLowerCase() === "utilities") return "utilities";
  return "general";
}

function inScope(company: ResearchCompany, rules: Rules, floor: number): boolean {
  if (!company.id || !company.primaryListing || !company.operatingEquity || !company.include) return false;
  if (rules.sector === "Not selected" || company.sector !== rules.sector) return false;
  if (rules.industry && company.industry !== rules.industry) return false;
  if (rules.country !== "Global" && company.country !== rules.country) return false;
  if (!num(company.marketCap) || company.marketCap < floor) return false;
  if (!company.capSource) return false;
  const age = daysBetween(rules.snapshot, company.capSnapshot);
  return age != null && age >= 0 && age <= rules.maxCapAgeDays;
}

function duplicate(company: ResearchCompany, companies: ResearchCompany[]): boolean {
  return companies.filter((other) => other.id === company.id).length !== 1;
}

export function scoreResearch(
  companies: ResearchCompany[],
  relationships: Relationship[],
  rules: Rules,
): { universeStatus: string; rows: ResearchRow[] } {
  const floor = effectiveFloor(rules);
  const minN = Math.max(3, rules.minCompanies);
  const capEligible = companies.map(
    (company) => !duplicate(company, companies) && inScope(company, rules, floor),
  );
  const revenueReady = companies.map((company, index) => {
    if (!capEligible[index]) return false;
    if (!num(company.revenue) || company.revenue < 0 || !company.revenueComparable || !company.revenueSource) {
      return false;
    }
    const age = daysBetween(rules.snapshot, company.revenuePeriodEnd);
    return age != null && age >= 0 && age <= rules.maxRevenueAgeDays;
  });
  const capCount = capEligible.filter(Boolean).length;
  const revenueCount = revenueReady.filter(Boolean).length;
  const capSum = companies.reduce((sum, company, index) => sum + (capEligible[index] && num(company.marketCap) ? company.marketCap : 0), 0);
  const revenueSum = companies.reduce((sum, company, index) => sum + (revenueReady[index] && num(company.revenue) ? company.revenue : 0), 0);
  const scaleWeightsOk = weightsValid([rules.revenueWeight, rules.capWeight]);
  const blendOk = weightsValid([rules.scaleBlend, rules.networkBlend]);
  const networkWeightsOk = weightsValid([rules.breadthWeight, rules.sizeWeight]);
  const profitWeightsOk = weightsValid([rules.roicWeight, rules.marginWeight]);
  const growthWeightsOk = weightsValid([rules.cagrWeight, rules.guidanceWeight], 0);
  const overallWeights: WeightSet = {
    scale: rules.competitiveWeight,
    value: rules.valuationWeight,
    growth: rules.growthWeight,
    profit: rules.profitWeight,
  };
  const overallOk = weightsValid(
    [overallWeights.scale, overallWeights.value, overallWeights.growth, overallWeights.profit],
    rules.sensitivity,
  );

  let universeStatus = "Ready";
  if (rules.sector === "Not selected") universeStatus = "Choose research scope";
  else if (!rules.universeConfirmed) universeStatus = "Confirm issuer universe";
  else if (capCount < minN) universeStatus = "Too few comparable issuers";
  else if (capCount !== revenueCount) universeStatus = "Revenue inputs incomplete";
  else if (!(revenueSum > 0)) universeStatus = "Revenue denominator missing";
  else if (!scaleWeightsOk) universeStatus = "Check score weights";

  const eligibleCaps = companies.filter((_, index) => capEligible[index]).map((company) => company.marketCap!);
  const eligibleRevenues = companies.filter((_, index) => revenueReady[index]).map((company) => company.revenue!);

  const draft = companies.map((company, index) => {
    const eligible = capEligible[index]!;
    const revenueOk = revenueReady[index]!;
    let inputStatus = "Ready";
    if (!company.id) inputStatus = "";
    else if (duplicate(company, companies)) inputStatus = "Duplicate issuer";
    else if (num(company.marketCap) && company.marketCap < floor) inputStatus = "Below cap floor";
    else if (!eligible) inputStatus = "Check scope/cap inputs";
    else if (!revenueOk) inputStatus = "Check revenue inputs";

    const capPercentile =
      eligible && capCount >= minN
        ? midpointPercentile(company.marketCap!, eligibleCaps, true, minN)
        : null;
    const revenuePercentile =
      universeStatus === "Ready" && revenueOk
        ? midpointPercentile(company.revenue!, eligibleRevenues, true, minN)
        : null;
    const scale =
      universeStatus === "Ready" && capPercentile != null && revenuePercentile != null
        ? round10(rules.revenueWeight * revenuePercentile + rules.capWeight * capPercentile)
        : null;

    const network = networkFor(company, index, companies, relationships, rules, capEligible, floor, minN, networkWeightsOk);
    const strength =
      !blendOk || (rules.scaleBlend > 0 && scale == null) || (rules.networkBlend > 0 && network.score == null)
        ? null
        : round10(rules.scaleBlend * (scale ?? 0) + rules.networkBlend * (network.score ?? 0));
    let strengthStatus = "Ready";
    if (!blendOk) strengthStatus = "Check combined weights";
    else if (rules.scaleBlend > 0 && scale == null) strengthStatus = "Scale score unavailable";
    else if (rules.networkBlend > 0 && network.score == null) strengthStatus = network.status;
    else if (!eligible) strengthStatus = inputStatus || "Outside scope";

    const valuation = valuationFor(company, companies, capEligible, rules, minN);
    const growth = growthFor(company, companies, capEligible, rules, minN, growthWeightsOk);
    const profit = profitFor(company, companies, capEligible, rules, minN, floor, profitWeightsOk);

    return {
      company,
      capEligible: eligible,
      revenueReady: revenueOk,
      inputStatus,
      capPercentile,
      revenuePercentile,
      scale,
      network: network.score,
      networkStatus: network.status,
      qualifyingTies: network.ties,
      strength,
      strengthStatus,
      ...valuation,
      ...growth,
      ...profit,
      capSum,
    };
  });

  const rows: ResearchRow[] = draft.map((row) => {
    const modules = [row.strength, row.valuation, row.growth, row.profitability];
    const completed = modules.filter((module) => module != null).length;
    const missing = [
      row.strength == null ? "strength" : "",
      row.valuation == null ? "valuation" : "",
      row.growth == null ? "growth" : "",
      row.profitability == null ? "profitability" : "",
    ].filter(Boolean);
    const cohortN = Math.min(
      ...[
        row.capEligible ? draft.filter((item) => item.capEligible).length : 0,
        row.valuation != null ? draft.filter((item) => item.valuation != null).length : 0,
        row.growth != null ? draft.filter((item) => item.growth != null && item.company.growth.cohort === row.company.growth.cohort).length : 0,
        row.profitability != null
          ? draft.filter(
              (item) =>
                item.profitability != null &&
                item.company.profit.cohort === row.company.profit.cohort &&
                item.company.profit.accounting === row.company.profit.accounting,
            ).length
          : 0,
      ].filter((count) => count > 0),
    );
    const ready =
      row.capEligible &&
      num(row.company.marketCap) &&
      row.company.marketCap >= floor &&
      overallOk &&
      rules.universeConfirmed &&
      completed === 4 &&
      modules.every((module) => module != null && module >= 0 && module <= 100) &&
      row.strengthStatus === "Ready" &&
      row.valuationStatus === "Ranked" &&
      row.growthStatus === "Ready" &&
      row.profitStatus === "Ready" &&
      (rules.networkBlend === 0 || row.networkStatus === "Ranked" || row.networkStatus === "Reviewed: no qualifying ties") &&
      Number.isFinite(cohortN) &&
      cohortN >= minN;

    let overallStatus = "Ready";
    if (!overallOk) overallStatus = "Check score weights/sensitivity";
    else if (!row.capEligible) overallStatus = "Outside selected/approved universe";
    else if (!rules.universeConfirmed) overallStatus = "Confirm issuer universe";
    else if (completed !== 4) overallStatus = `Missing modules: ${missing.join(", ")}`;
    else if (!ready) overallStatus = "Check module/cohort statuses";

    const weights: WeightSet = overallWeights;
    const overall = ready
      ? round10(
          weights.scale * row.strength! +
            weights.value * row.valuation! +
            weights.growth * row.growth! +
            weights.profit * row.profitability!,
        )
      : null;
    const band =
      overall == null
        ? null
        : sensitivityBand(
            { scale: row.strength, value: row.valuation, growth: row.growth, profit: row.profitability, capPercentile: null, revenuePercentile: null, revenueCagr: null },
            weights,
            rules.sensitivity,
          );
    return {
      company: row.company,
      capEligible: row.capEligible,
      revenueReady: row.revenueReady,
      inputStatus: row.inputStatus,
      capPercentile: row.capPercentile,
      revenuePercentile: row.revenuePercentile,
      scale: row.scale,
      network: row.network,
      networkStatus: row.networkStatus,
      qualifyingTies: row.qualifyingTies,
      strength: row.strength,
      strengthStatus: row.strengthStatus,
      forwardPe: row.forwardPe,
      forwardEvEbitda: row.forwardEvEbitda,
      fcfYield: row.fcfYield,
      priceBook: row.priceBook,
      valuation: row.valuation,
      valuationStatus: row.valuationStatus,
      epsCagr: row.epsCagr,
      guideGrowth: row.guideGrowth,
      growth: row.growth,
      growthStatus: row.growthStatus,
      profitability: row.profitability,
      profitStatus: row.profitStatus,
      overall,
      overallStatus,
      ready,
      rank: null,
      bandLow: band?.low ?? null,
      bandHigh: band?.high ?? null,
    };
  });

  const readyScores = rows.map((row) => row.overall).filter((score): score is number => score != null);
  for (const row of rows) {
    if (row.overall != null) row.rank = averageRank(row.overall, readyScores);
  }
  return { universeStatus, rows };
}

function networkFor(
  company: ResearchCompany,
  index: number,
  companies: ResearchCompany[],
  relationships: Relationship[],
  rules: Rules,
  capEligible: boolean[],
  floor: number,
  minN: number,
  weightsOk: boolean,
): { score: Num; status: string; ties: number } {
  if (!capEligible[index]) return { score: null, status: "Outside cap universe", ties: 0 };
  const mine = relationships.filter((tie) => tie.companyId === company.id);
  const eligibleTie = (tie: Relationship) => {
    if (!tie.include || !tie.active || !tie.material || !tie.sourceUrl) return false;
    if (!num(tie.counterpartyCap) || tie.counterpartyCap < floor) return false;
    const sourceAge = daysBetween(rules.snapshot, tie.sourceDate);
    const verifiedAge = daysBetween(rules.snapshot, tie.verifiedDate);
    const order = daysBetween(tie.verifiedDate, tie.sourceDate);
    if (sourceAge == null || verifiedAge == null || order == null) return false;
    if (sourceAge < 0 || verifiedAge < 0 || verifiedAge > rules.relationshipMaxAgeDays || order < 0) return false;
    return true;
  };
  const blocking = mine.filter((tie) => tie.include && !eligibleTie(tie)).length;
  const ties = mine.filter(eligibleTie);
  const review = company.network;
  const reviewAge = daysBetween(rules.snapshot, review.reviewDate);
  const reviewOk =
    review.reviewComplete &&
    review.reviewLog.trim() !== "" &&
    reviewAge != null &&
    reviewAge >= 0 &&
    reviewAge <= rules.relationshipMaxAgeDays;
  if (!reviewOk) return { score: null, status: "Review incomplete", ties: ties.length };
  if (blocking > 0) return { score: null, status: "Resolve included records", ties: ties.length };
  if (!weightsOk) return { score: null, status: "Check network weights", ties: ties.length };
  if (!rules.universeConfirmed || rules.sector === "Not selected") {
    return { score: null, status: "Confirm issuer universe", ties: ties.length };
  }

  const reviewed = companies.filter((other, otherIndex) => {
    if (!capEligible[otherIndex]) return false;
    const age = daysBetween(rules.snapshot, other.network.reviewDate);
    return (
      other.network.reviewComplete &&
      other.network.reviewLog.trim() !== "" &&
      age != null &&
      age >= 0 &&
      age <= rules.relationshipMaxAgeDays &&
      relationships.filter((tie) => tie.companyId === other.id && tie.include && !eligibleTie(tie)).length === 0
    );
  });
  if (reviewed.length < minN) return { score: null, status: "Too few reviewed companies", ties: ties.length };

  const breadthOf = (id: string) =>
    new Set(
      relationships.filter((tie) => tie.companyId === id && eligibleTie(tie)).map((tie) => tie.counterpartyName.trim().toLowerCase()),
    ).size;
  const medianOf = (id: string) => {
    const caps = relationships
      .filter((tie) => tie.companyId === id && eligibleTie(tie) && num(tie.counterpartyCap))
      .map((tie) => tie.counterpartyCap!);
    return caps.length === 0 ? 0 : median(caps)!;
  };
  const breadth = breadthOf(company.id);
  const breadthPeers = reviewed.map((other) => breadthOf(other.id));
  const sizePeers = reviewed.map((other) => medianOf(other.id));
  const breadthScore = breadth === 0 ? 0 : midpointPercentile(breadth, breadthPeers, true, minN);
  const sizeScore = breadth === 0 ? 0 : midpointPercentile(medianOf(company.id), sizePeers, true, minN);
  if (breadthScore == null || sizeScore == null) return { score: null, status: "Too few reviewed companies", ties: breadth };
  return {
    score: round10(rules.breadthWeight * breadthScore + rules.sizeWeight * sizeScore),
    status: breadth === 0 ? "Reviewed: no qualifying ties" : "Ranked",
    ties: breadth,
  };
}

function valuationFor(
  company: ResearchCompany,
  companies: ResearchCompany[],
  capEligible: boolean[],
  rules: Rules,
  minN: number,
) {
  const empty = {
    forwardPe: null as Num,
    forwardEvEbitda: null as Num,
    fcfYield: null as Num,
    priceBook: null as Num,
    valuation: null as Num,
    valuationStatus: "Outside cap universe",
  };
  const index = companies.findIndex((item) => item.id === company.id);
  if (!capEligible[index]) return empty;
  const profile = profileOf(company);
  if (profile === "unsupported") return { ...empty, valuationStatus: "Sector profile required" };
  const weights = profile === "utilities" ? rules.utilityWeights : rules.generalWeights;
  if (!weightsValid([weights.pe, weights.ev, weights.fcf, weights.pb])) {
    return { ...empty, valuationStatus: "Check profile weights" };
  }
  const inputs = company.valuation;
  const cap = company.marketCap!;
  const pe = num(inputs.price) && inputs.price > 0 && num(inputs.ntmEps) && inputs.ntmEps > 0 ? inputs.price / inputs.ntmEps : null;
  const parts = [inputs.debt, inputs.cash, inputs.preferred, inputs.nci, inputs.nonoperatingInvestments];
  const ev =
    parts.every((part) => num(part) && part >= 0) && num(inputs.ntmEbitda)
      ? cap + inputs.debt! + inputs.preferred! + inputs.nci! - inputs.cash! - inputs.nonoperatingInvestments!
      : null;
  const evMultiple = ev != null && num(inputs.ntmEbitda) && ev > 0 && inputs.ntmEbitda > 0 ? ev / inputs.ntmEbitda : null;
  const fcf =
    num(inputs.ttmCfo) && num(inputs.ttmCapex) && inputs.ttmCapex >= 0 && cap > 0 ? (inputs.ttmCfo - inputs.ttmCapex) / cap : null;
  const book = num(inputs.bookEquity) && inputs.bookEquity > 0 ? cap / inputs.bookEquity : null;
  const required = [
    [weights.pe, pe],
    [weights.ev, evMultiple],
    [weights.fcf, fcf],
    [weights.pb, book],
  ] as const;
  const covered = required.every(([weight, metric]) => weight === 0 || metric != null);
  if (!covered || !inputs.verified) {
    return {
      forwardPe: pe,
      forwardEvEbitda: evMultiple,
      fcfYield: fcf,
      priceBook: book,
      valuation: null,
      valuationStatus: !inputs.verified ? "Comparability not verified" : "Missing/NM required metric",
    };
  }
  const pool = companies.filter((other, otherIndex) => {
    if (!capEligible[otherIndex] || profileOf(other) !== profile || !other.valuation.verified) return false;
    return metricBundle(other, weights).complete;
  });
  if (!rules.universeConfirmed) {
    return { forwardPe: pe, forwardEvEbitda: evMultiple, fcfYield: fcf, priceBook: book, valuation: null, valuationStatus: "Confirm issuer universe" };
  }
  if (pool.length < minN) {
    return { forwardPe: pe, forwardEvEbitda: evMultiple, fcfYield: fcf, priceBook: book, valuation: null, valuationStatus: "Too few scorable companies" };
  }
  const peScore = weights.pe === 0 || pe == null ? 0 : midpointPercentile(pe, pool.map((item) => metricBundle(item, weights).pe!), false, minN);
  const evScore = weights.ev === 0 || evMultiple == null ? 0 : midpointPercentile(evMultiple, pool.map((item) => metricBundle(item, weights).ev!), false, minN);
  const fcfScore = weights.fcf === 0 || fcf == null ? 0 : midpointPercentile(fcf, pool.map((item) => metricBundle(item, weights).fcf!), true, minN);
  const pbScore = weights.pb === 0 || book == null ? 0 : midpointPercentile(book, pool.map((item) => metricBundle(item, weights).pb!), false, minN);
  if ([peScore, evScore, fcfScore, pbScore].some((score) => score == null)) {
    return { forwardPe: pe, forwardEvEbitda: evMultiple, fcfYield: fcf, priceBook: book, valuation: null, valuationStatus: "Too few scorable companies" };
  }
  return {
    forwardPe: pe,
    forwardEvEbitda: evMultiple,
    fcfYield: fcf,
    priceBook: book,
    valuation: round10(weights.pe * peScore! + weights.ev * evScore! + weights.fcf * fcfScore! + weights.pb * pbScore!),
    valuationStatus: "Ranked",
  };
}

function metricBundle(company: ResearchCompany, weights: Rules["generalWeights"]) {
  const cap = company.marketCap ?? 0;
  const inputs = company.valuation;
  const pe = num(inputs.price) && inputs.price > 0 && num(inputs.ntmEps) && inputs.ntmEps > 0 ? inputs.price / inputs.ntmEps : null;
  const parts = [inputs.debt, inputs.cash, inputs.preferred, inputs.nci, inputs.nonoperatingInvestments];
  const evBase = parts.every((part) => num(part) && part >= 0)
    ? cap + inputs.debt! + inputs.preferred! + inputs.nci! - inputs.cash! - inputs.nonoperatingInvestments!
    : null;
  const ev = evBase != null && num(inputs.ntmEbitda) && evBase > 0 && inputs.ntmEbitda > 0 ? evBase / inputs.ntmEbitda : null;
  const fcf = num(inputs.ttmCfo) && num(inputs.ttmCapex) && inputs.ttmCapex >= 0 && cap > 0 ? (inputs.ttmCfo - inputs.ttmCapex) / cap : null;
  const pb = num(inputs.bookEquity) && inputs.bookEquity > 0 ? cap / inputs.bookEquity : null;
  const complete = [
    [weights.pe, pe],
    [weights.ev, ev],
    [weights.fcf, fcf],
    [weights.pb, pb],
  ].every(([weight, metric]) => weight === 0 || metric != null);
  return { pe, ev, fcf, pb, complete };
}

function growthFor(
  company: ResearchCompany,
  companies: ResearchCompany[],
  capEligible: boolean[],
  rules: Rules,
  minN: number,
  weightsOk: boolean,
) {
  const index = companies.findIndex((item) => item.id === company.id);
  const empty = { epsCagr: null as Num, guideGrowth: null as Num, growth: null as Num, growthStatus: "Outside selected/approved universe" };
  if (!capEligible[index]) return empty;
  if (!weightsOk) return { ...empty, growthStatus: "Check weights" };
  const growth = company.growth;
  if (rules.guidanceWeight > 0 && !growthDatesValid(company, rules.snapshot)) return { ...empty, growthStatus: "Check fiscal years/guidance dates" };
  const cagr =
    num(growth.lastEps) && num(growth.epsThreeYearsAgo) && growth.lastEps > 0 && growth.epsThreeYearsAgo > 0
      ? Math.pow(growth.lastEps / growth.epsThreeYearsAgo, 1 / 3) - 1
      : null;
  const guideMid = num(growth.guideLow) && num(growth.guideHigh) && growth.guideLow <= growth.guideHigh ? (growth.guideLow + growth.guideHigh) / 2 : null;
  const guide = guideMid != null && num(growth.lastEps) && growth.lastEps > 0 ? guideMid / growth.lastEps - 1 : null;
  if (!growth.sameBasisReviewed || (rules.cagrWeight > 0 && cagr == null) || (rules.guidanceWeight > 0 && guide == null) || !growth.cohort) {
    return { epsCagr: cagr, guideGrowth: guide, growth: null, growthStatus: "Growth inputs incomplete" };
  }
  if (!rules.universeConfirmed || rules.sector === "Not selected") {
    return { epsCagr: cagr, guideGrowth: guide, growth: null, growthStatus: "Confirm issuer universe" };
  }
  const peers = companies.filter((other, otherIndex) => {
    if (!capEligible[otherIndex] || !other.growth.sameBasisReviewed || (rules.guidanceWeight > 0 && !growthDatesValid(other, rules.snapshot))) return false;
    if (other.growth.cohort !== growth.cohort || other.growth.accounting !== growth.accounting || other.growth.epsBasis !== growth.epsBasis) {
      return false;
    }
    const gap = daysBetween(other.growth.guideFyEnd, growth.guideFyEnd);
    return (rules.guidanceWeight === 0 || (gap != null && Math.abs(gap) <= 45 && guided(other) != null)) && (rules.cagrWeight === 0 || rate(other) != null);
  });
  if (peers.length < minN) return { epsCagr: cagr, guideGrowth: guide, growth: null, growthStatus: "Too few comparable growth records" };
  const cagrScore = rules.cagrWeight === 0 ? 0 : midpointPercentile(cagr!, peers.map((peer) => rate(peer)!), true, minN);
  const guideScore = rules.guidanceWeight === 0 ? 0 : midpointPercentile(guide!, peers.map((peer) => guided(peer)!), true, minN);
  if (cagrScore == null || guideScore == null) {
    return { epsCagr: cagr, guideGrowth: guide, growth: null, growthStatus: "Too few comparable growth records" };
  }
  return {
    epsCagr: cagr,
    guideGrowth: guide,
    growth: round10(rules.cagrWeight * cagrScore + rules.guidanceWeight * guideScore),
    growthStatus: "Ready",
  };
}

function growthDatesValid(company: ResearchCompany, snapshot: string): boolean {
  const lastAge = daysBetween(snapshot, company.growth.lastFyEnd);
  const guideAge = daysBetween(snapshot, company.growth.guideFyEnd);
  const yearGap = daysBetween(company.growth.guideFyEnd, company.growth.lastFyEnd);
  return lastAge != null && lastAge >= 0 && lastAge <= 550 &&
    guideAge != null && guideAge <= 0 && guideAge >= -550 &&
    yearGap != null && yearGap >= 300 && yearGap <= 400;
}

function rate(company: ResearchCompany): number | null {
  const growth = company.growth;
  if (!num(growth.lastEps) || !num(growth.epsThreeYearsAgo) || growth.lastEps <= 0 || growth.epsThreeYearsAgo <= 0) return null;
  return Math.pow(growth.lastEps / growth.epsThreeYearsAgo, 1 / 3) - 1;
}

function guided(company: ResearchCompany): number | null {
  const growth = company.growth;
  if (!num(growth.guideLow) || !num(growth.guideHigh) || growth.guideLow > growth.guideHigh || !num(growth.lastEps) || growth.lastEps <= 0) return null;
  return (growth.guideLow + growth.guideHigh) / 2 / growth.lastEps - 1;
}

function profitFor(
  company: ResearchCompany,
  companies: ResearchCompany[],
  capEligible: boolean[],
  rules: Rules,
  minN: number,
  floor: number,
  weightsOk: boolean,
) {
  const index = companies.findIndex((item) => item.id === company.id);
  const empty = { profitability: null as Num, profitStatus: "Outside cap/scope universe" };
  if (!capEligible[index] || !num(company.marketCap) || company.marketCap < floor) return empty;
  if (profileOf(company) === "unsupported") return { profitability: null, profitStatus: "Sector profile required" };
  if (!weightsOk) return { profitability: null, profitStatus: "Check weights" };
  const profit = company.profit;
  if (!profit.cohort || !profit.accounting || !num(profit.roic) || !num(profit.operatingMargin)) {
    return { profitability: null, profitStatus: "Add TTM financials" };
  }
  const age = daysBetween(rules.snapshot, profit.ttmEnd);
  if (age == null || age < 0 || age > rules.maxRevenueAgeDays) return { profitability: null, profitStatus: "Check financial data/dates/profile" };
  if (!rules.universeConfirmed || rules.sector === "Not selected") return { profitability: null, profitStatus: "Confirm issuer universe" };
  const peers = companies.filter((other, otherIndex) => {
    if (!capEligible[otherIndex]) return false;
    const peerAge = daysBetween(rules.snapshot, other.profit.ttmEnd);
    return (
      other.profit.cohort === profit.cohort &&
      other.profit.accounting === profit.accounting &&
      num(other.profit.roic) &&
      num(other.profit.operatingMargin) &&
      peerAge != null &&
      peerAge >= 0 &&
      peerAge <= rules.maxRevenueAgeDays
    );
  });
  if (peers.length < minN) return { profitability: null, profitStatus: "Too few same-cohort companies" };
  const roicScore = midpointPercentile(profit.roic!, peers.map((peer) => peer.profit.roic!), true, minN);
  const marginScore = midpointPercentile(profit.operatingMargin!, peers.map((peer) => peer.profit.operatingMargin!), true, minN);
  if (roicScore == null || marginScore == null) return { profitability: null, profitStatus: "Too few same-cohort companies" };
  return {
    profitability: round10(rules.roicWeight * roicScore + rules.marginWeight * marginScore),
    profitStatus: "Ready",
  };
}
