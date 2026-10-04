import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { modelLoader } from "./model-test-loader.mjs";

const load = modelLoader();
const { parseInput, runPull } = load("src/lib/model/feed-core.server.ts");
const { blankPatch } = load("src/lib/model/feed-map.ts");
const input = { provider: "Finnhub", apiKey: "test-secret-key", tickers: ["TEST"] };
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
const good = (url) => {
  if (url.includes("profile2")) return response({ marketCapitalization: 20000, shareOutstanding: 100 });
  if (url.includes("/quote")) return response({ c: 100, t: 1791028800 });
  return response({ metric: { peTTM: 20, operatingMarginTTM: 10 } });
};
async function withFetch(mock, run) {
  const previous = globalThis.fetch; globalThis.fetch = mock;
  try { await run(); } finally { globalThis.fetch = previous; }
}
test("request validation rejects oversized and empty ticker batches", () => {
  assert.throws(() => parseInput({ ...input, tickers: Array.from({ length: 11 }, (_, i) => "T" + i) }), /smaller/);
  assert.throws(() => parseInput({ ...input, tickers: ["???"] }), /smaller/);
  assert.deepEqual(parseInput({ ...input, tickers: [" test ", "TEST"] }).tickers, ["TEST"]);
});
test("premium financial failures retain usable quote and expose endpoint errors", async () => {
  await withFetch(async (url) => url.includes("/metric") ? response({ error: "Premium not available" }, 403) : good(url), async () => {
    const result = await runPull(input);
    assert.equal(result.patches.length, 1); assert.equal(result.patches[0].price, 100);
    assert.equal(result.fatal, null);
    assert.ok(result.warnings.some((w) => /Basic Financials: HTTP 403/.test(w.message)));
  });
});
test("network failure in one endpoint does not discard the company quote", async () => {
  await withFetch(async (url) => { if (url.includes("/metric")) throw new Error("network unavailable"); return good(url); }, async () => {
    const result = await runPull(input);
    assert.equal(result.patches.length, 1); assert.ok(result.warnings.some((w) => /network unavailable/.test(w.message)));
  });
});
test("invalid keys stop and are redacted from the response", async () => {
  await withFetch(async () => response({ error: "Invalid API key test-secret-key" }, 401), async () => {
    const result = await runPull(input);
    assert.equal(result.patches.length, 0); assert.ok(result.fatal);
    assert.equal(JSON.stringify(result).includes(input.apiKey), false);
  });
});
test("rate limits stop refresh without silently reporting successful data", async () => {
  await withFetch(async () => response({ error: "Too many requests" }, 429), async () => {
    const result = await runPull(input);
    assert.equal(result.patches.length, 0); assert.match(result.fatal, /rate-limited/);
  });
});
test("HTTP 500 is surfaced even with an empty error body", async () => {
  await withFetch(async (url) => url.includes("/metric") ? response({}, 500) : good(url), async () => {
    const result = await runPull(input);
    assert.equal(result.patches.length, 1); assert.ok(result.warnings.some((w) => /HTTP 500/.test(w.message)));
  });
});
test("Polygon uses supported price endpoints only", async () => {
  const urls = [];
  await withFetch(async (url) => {
    urls.push(url);
    return url.includes("/reference/") ? response({ results: { market_cap: 20e9 } }) : response({ results: [{ c: 100, t: 1791028800000 }] });
  }, async () => {
    const result = await runPull({ ...input, provider: "Polygon" });
    assert.equal(urls.length, 2); assert.ok(urls.every((u) => !u.includes("/vX/")));
    assert.equal(result.patches.length, 1); assert.ok(result.warnings.some((w) => /retired financials/.test(w.message)));
  });
});
test("cancellation ignores in-flight results and permits the next refresh", async () => {
  let release;
  let immediate = false;
  const isolated = modelLoader({ [resolve("src/lib/model/feed.ts")]: { pullQuotes: () => immediate
    ? Promise.resolve({ patches: [{ ...blankPatch("XOM", "test-provider", "2026-10-04"), price: 222 }], errors: [], warnings: [], fatal: null })
    : new Promise((r) => { release = r; }) } });
  const { useDesk } = isolated("src/lib/model/store.ts");
  const { refreshDesk, cancelRefresh } = isolated("src/lib/model/refresh.ts");
  useDesk.getState().setApi({ apiProvider: "Finnhub", apiKey: input.apiKey });
  const original = useDesk.getState().companies.find((c) => c.ticker === "XOM").valuation.price;
  const first = refreshDesk(["XOM"]);
  assert.equal(useDesk.getState().refresh.phase, "running");
  cancelRefresh();
  release({ patches: [{ ...blankPatch("XOM", "test-provider", "2026-10-04"), price: 111 }], errors: [], warnings: [], fatal: null });
  await first;
  assert.equal(useDesk.getState().companies.find((c) => c.ticker === "XOM").valuation.price, original);
  immediate = true; await refreshDesk(["XOM"]);
  assert.equal(useDesk.getState().companies.find((c) => c.ticker === "XOM").valuation.price, 222);
  assert.equal(useDesk.getState().refresh.phase, "idle"); assert.ok(useDesk.getState().lastPull);
});
