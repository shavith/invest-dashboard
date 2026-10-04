import test from "node:test";
import assert from "node:assert/strict";
import { modelLoader } from "./model-test-loader.mjs";

const load = modelLoader();
const { scoreResearch } = load("src/lib/model/research.ts");
const { blankCompany, DEFAULT_RULES } = load("src/lib/model/seed.ts");
const { blankPatch, mapFinnhub, mapFmp, threeYearPair } = load("src/lib/model/feed-map.ts");
const { midpointPercentile, daysBetween, weightsValid } = load("src/lib/model/percentile.ts");
const { aggregateScore, sensitivityBand, scorePilotUniverse } = load("src/lib/model/pilot.ts");
const { PILOT_RECORDS } = load("src/lib/model/pilot-data.ts");
const { dailyRefreshDue, DAILY_REFRESH_MS, trackedTickers } = load("src/lib/model/refresh-policy.ts");
const { useDesk } = load("src/lib/model/store.ts");
const clone = (x) => JSON.parse(JSON.stringify(x));
function fixture() {
  const rules = { ...clone(DEFAULT_RULES), sector: "Industrials", industry: "", universeConfirmed: true, scaleBlend: 1, networkBlend: 0 };
  const companies = [1, 2, 3].map((i) => {
    const c = blankCompany();
    return { ...c, id: "TEST-" + i, ticker: "T" + i, name: "Issuer " + i, sector: rules.sector, industry: "Machinery",
      marketCap: 20 + i * 10, capSnapshot: "2026-10-02", capSource: "https://example.com/cap",
      revenue: 10 + i, revenuePeriodEnd: "2026-06-30", revenueComparable: true, revenueSource: "https://example.com/annual",
      valuation: { ...c.valuation, price: 100 + i, ntmEps: 4 + i, ntmEbitda: 5 + i, debt: 1, cash: 1,
        preferred: 0, nci: 0, nonoperatingInvestments: 0, ttmCfo: 5, ttmCapex: 1, verified: true },
      profit: { ...c.profit, cohort: "Machinery", ttmEnd: "2026-06-30", roic: 0.1 + i / 100, operatingMargin: 0.15 + i / 100 },
      growth: { ...c.growth, cohort: "Machinery", lastFyEnd: "2025-12-31", lastEps: 4 + i, epsThreeYearsAgo: 2 + i,
        guideFyEnd: "2026-12-31", guideLow: 5 + i, guideHigh: 6 + i, sameBasisReviewed: true },
    };
  });
  return { rules, companies };
}
test("complete comparable research ranks with a zero network weight", () => {
  const f = fixture();
  assert.ok(scoreResearch(f.companies, [], f.rules).rows.every((r) => r.ready && r.overall != null));
  f.rules.scaleBlend = 0.5; f.rules.networkBlend = 0.5;
  assert.ok(scoreResearch(f.companies, [], f.rules).rows.every((r) => !r.ready && r.overall == null));
});
test("invalid valuation signs cannot create a ranking", () => {
  for (const [key, value] of [["price", -10], ["ttmCapex", -1], ["debt", -1]]) {
    const f = fixture(); f.companies[0].valuation[key] = value;
    const row = scoreResearch(f.companies, [], f.rules).rows[0];
    assert.equal(row.valuation, null); assert.equal(row.overall, null);
  }
});
test("expired fiscal guidance and reversed ranges are rejected", () => {
  for (const patch of [{ guideFyEnd: "2025-12-31" }, { lastFyEnd: "" }, { guideLow: 12, guideHigh: 5 }]) {
    const f = fixture(); Object.assign(f.companies[0].growth, patch);
    assert.equal(scoreResearch(f.companies, [], f.rules).rows[0].growth, null);
  }
});
test("zero growth weights do not demand unused inputs", () => {
  const f = fixture(); f.rules.cagrWeight = 1; f.rules.guidanceWeight = 0;
  for (const c of f.companies) Object.assign(c.growth, { guideFyEnd: "", lastFyEnd: "", guideLow: null, guideHigh: null });
  assert.ok(scoreResearch(f.companies, [], f.rules).rows.every((r) => r.ready));
  f.rules.cagrWeight = 0; f.rules.guidanceWeight = 1;
  for (const c of f.companies) Object.assign(c.growth, { guideFyEnd: "2026-12-31", lastFyEnd: "2025-12-31", guideLow: 7, guideHigh: 8, epsThreeYearsAgo: null });
  assert.ok(scoreResearch(f.companies, [], f.rules).rows.every((r) => r.ready));
});
test("annual revenue uses year-minus-three, not array position", () => {
  const income = [2025, 2024, 2023, 2021].map((year) => ({ date: year + "-12-31", revenue: year * 1e9 }));
  const parts = { quote: [{ price: 20, marketCap: 20e9 }], metrics: [], ratios: [], income };
  assert.equal(mapFmp("TEST", parts).fyRevenue3Bn, null);
  parts.income.push({ date: "2022-12-31", revenue: 18e9 });
  assert.equal(mapFmp("TEST", parts).fyRevenue3Bn, 18);
  assert.equal(threeYearPair([{ period: "2025-12-31", value: 10 }, { period: "2025-06-30", value: 12 }]).latest, null);
});
test("Finnhub explicit units and unknown reporting dates are preserved", () => {
  const p = mapFinnhub("TEST", { marketCapitalization: 20000, shareOutstanding: 100 },
    { metric: { operatingMarginTTM: 1, pfcfShareTTM: 20, revenuePerShareTTM: 10 },
      series: { annual: { revenue: [{ period: "2025-12-31", v: 200 }] } } }, { c: 100 });
  assert.equal(p.marketCapBn, 20); assert.equal(p.margin, 0.01); assert.equal(p.fcfYield, 0.05);
  assert.equal(p.ttmRevenueBn, 1); assert.equal(p.fyRevenueBn, null); assert.equal(p.capDate, "");
});
test("quote-only updates retain financial dates and cap provenance", () => {
  useDesk.getState().resetWorkbook();
  const id = useDesk.getState().companies[0].id;
  useDesk.getState().patchCompany(id, { revenuePeriodEnd: "2025-12-31", profit: { ...useDesk.getState().companies[0].profit, ttmEnd: "2025-12-31" } });
  const before = clone(useDesk.getState().companies[0]);
  const patch = { ...blankPatch(before.ticker, "https://new.example", "2026-10-04"), price: 120 };
  useDesk.getState().applyQuotes([patch], null);
  const after = useDesk.getState().companies[0];
  assert.equal(after.capSnapshot, before.capSnapshot); assert.equal(after.capSource, before.capSource);
  assert.equal(after.revenuePeriodEnd, before.revenuePeriodEnd); assert.equal(after.profit.ttmEnd, before.profit.ttmEnd);
});
test("undated financial updates clear freshness and comparability", () => {
  const c = useDesk.getState().companies[0];
  const p = { ...blankPatch(c.ticker, "https://new.example", "2026-10-04"), marketCapBn: 50, ttmRevenueBn: 12, roic: 0.1, margin: 0.2 };
  useDesk.getState().applyQuotes([p], null);
  let after = useDesk.getState().companies[0];
  assert.equal(after.capSnapshot, "2026-10-04"); assert.equal(after.revenuePeriodEnd, "");
  assert.equal(after.profit.ttmEnd, ""); assert.equal(after.revenueComparable, false);
  useDesk.getState().applyQuotes([{ ...p, revenuePeriodEnd: "2026-06-30", profitPeriodEnd: "2026-06-30" }], null);
  after = useDesk.getState().companies[0];
  assert.equal(after.revenuePeriodEnd, "2026-06-30"); assert.equal(after.profit.ttmEnd, "2026-06-30");
});
test("directory stocks stage once and receive quotes without inferred freshness", () => {
  useDesk.getState().resetWorkbook();
  useDesk.getState().setListings([{ ticker: "TEST", name: "Test issuer", sector: "Industrials", industry: "Machinery", exchange: "NYSE", marketCapBn: 40, price: 10 }]);
  useDesk.getState().stageListing("TEST"); useDesk.getState().stageListing("TEST");
  const state = useDesk.getState();
  assert.equal(state.companies.filter((c) => c.ticker === "TEST").length, 1);
  assert.equal(state.companies.find((c) => c.ticker === "TEST").capSnapshot, "");
  assert.equal(state.view, "research"); assert.ok(trackedTickers(state.pilot, state.companies).includes("TEST"));
  state.applyQuotes([{ ...blankPatch("TEST", "provider", "2026-10-04"), price: 12, marketCapBn: 42 }], null);
  assert.equal(useDesk.getState().listings[0].price, 12);
  assert.equal(useDesk.getState().listings[0].marketCapBn, 42);
});
test("partial annual updates retain the matched pilot revenue pair", () => {
  const before = clone(useDesk.getState().pilot[0]);
  useDesk.getState().applyQuotes([{ ...blankPatch(before.ticker, "provider", ""), fyRevenueBn: 900 }], null);
  assert.equal(useDesk.getState().pilot[0].fyRevenue, before.fyRevenue);
  assert.equal(useDesk.getState().pilot[0].fyRevenue3, before.fyRevenue3);
});
test("nonfinite inputs and invalid dates cannot enter scores", () => {
  assert.equal(midpointPercentile(NaN, [1, 2, 3], true, 3), null);
  assert.equal(midpointPercentile(1, [1, 2, Infinity], true, 3), null);
  assert.equal(midpointPercentile(4, [1, 2, 3], true, 3), null);
  assert.equal(daysBetween("2026-02-30", "2026-01-01"), null);
  assert.equal(weightsValid([0.5, 0.5], NaN), false);
  const modules = { scale: 50, value: 50, growth: 50, profit: NaN };
  const w = { scale: 0.25, value: 0.25, growth: 0.25, profit: 0.25 };
  assert.equal(aggregateScore(modules, w), null); assert.equal(sensitivityBand({ ...modules, profit: 50 }, w, -1), null);
  assert.equal(scorePilotUniverse(PILOT_RECORDS, 3).length, 30);
});
test("daily refresh is opt-in, provider-aware, and limited to once per day", () => {
  const now = Date.parse("2026-10-04T12:00:00Z");
  assert.equal(dailyRefreshDue(false, "test-key", "Finnhub", null, now), false);
  assert.equal(dailyRefreshDue(true, "", "Finnhub", null, now), false);
  assert.equal(dailyRefreshDue(true, "test-key", "Finnhub", null, now), true);
  assert.equal(dailyRefreshDue(true, "test-key", "Finnhub", { at: new Date(now - 1000).toISOString(), provider: "Finnhub" }, now), false);
  assert.equal(dailyRefreshDue(true, "test-key", "Finnhub", { at: new Date(now - DAILY_REFRESH_MS).toISOString(), provider: "Finnhub" }, now), true);
  assert.equal(dailyRefreshDue(true, "test-key", "Finnhub", { at: new Date(now).toISOString(), provider: "Polygon" }, now), true);
});
