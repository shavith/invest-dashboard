import { pullQuotes } from "./feed";
import { trackedTickers } from "./refresh-policy";
import { useDesk } from "./store";

let active = false;
let generation = 0;
let releaseWait: (() => void) | null = null;

export function cancelRefresh(): void {
  generation += 1;
  active = false;
  releaseWait?.();
  releaseWait = null;
  useDesk.getState().setRefresh({ phase: "idle", message: "Refresh stopped. Earlier updates are retained." });
}

function waitForBatch(): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => { clearTimeout(timer); releaseWait = null; resolve(); };
    const timer = setTimeout(finish, 20_000);
    releaseWait = finish;
  });
}

export async function refreshDesk(selectedTickers?: string[]): Promise<void> {
  if (active) return;
  const start = useDesk.getState();
  const provider = start.apiProvider;
  const key = start.apiKey.trim();
  if (!["Finnhub", "Financial Modeling Prep", "Polygon"].includes(provider) || key.length < 8) {
    start.setRefresh({ phase: "idle", error: "Choose a provider and enter its API key.", message: "" });
    return;
  }
  const tickers = trackedTickers(selectedTickers?.map((ticker) => ({ ticker })) ?? start.pilot, selectedTickers ? [] : start.companies);
  if (!tickers.length) { start.setRefresh({ error: "Add a ticker before refreshing." }); return; }
  active = true;
  const run = ++generation;
  const current = () => run === generation && useDesk.getState().apiProvider === provider && useDesk.getState().apiKey.trim() === key;
  const issues: { ticker: string; message: string }[] = [];
  let updated = 0;
  let failed = 0;
  let fatal: string | null = null;
  // Daily refreshes use tracked names only; directory browsing never pulls the whole market.
  if (!selectedTickers) start.markAttempt(new Date().toISOString(), provider);
  start.setRefresh({ phase: "running", done: 0, total: tickers.length, message: "Starting refresh…", error: null, issues: [] });
  try {
    const size = provider === "Polygon" ? 3 : 6;
    for (let index = 0; index < tickers.length; index += size) {
      if (!current()) return;
      const batch = tickers.slice(index, index + size);
      useDesk.getState().setRefresh({ phase: "running", message: `Refreshing ${Math.min(index + batch.length, tickers.length)} of ${tickers.length}…` });
      const result = await pullQuotes({ data: { provider: provider as "Finnhub" | "Financial Modeling Prep" | "Polygon", apiKey: key, tickers: batch } });
      if (!current()) return;
      if (result.patches.length) useDesk.getState().applyQuotes(result.patches, null);
      updated += result.patches.length;
      failed += result.errors.length;
      issues.push(...result.errors, ...(result.warnings ?? []));
      useDesk.getState().setRefresh({ done: Math.min(index + batch.length, tickers.length), issues: [...issues] });
      if (result.fatal) { fatal = result.fatal; break; }
      if (provider === "Finnhub" && index + batch.length < tickers.length) {
        useDesk.getState().setRefresh({ phase: "waiting", message: "Waiting for the next Finnhub batch…" });
        await waitForBatch();
      }
    }
    if (!current()) return;
    const message = `Updated ${updated} of ${tickers.length} names from ${provider}. ${failed} failed. Missing fields retain earlier inputs.${fatal ? " " + fatal : ""}`;
    if (updated) useDesk.getState().applyQuotes([], { at: new Date().toISOString(), provider, message, issues });
    useDesk.getState().setRefresh({ phase: "idle", message, error: updated === 0 ? fatal ?? "No usable figures returned." : fatal, issues });
  } catch (error) {
    if (current()) useDesk.getState().setRefresh({ phase: "idle", error: error instanceof Error ? error.message.split(key).join("••••") : "Refresh failed." });
  } finally {
    if (run === generation) {
      active = false;
      useDesk.getState().setRefresh({ phase: "idle" });
    }
  }
}
