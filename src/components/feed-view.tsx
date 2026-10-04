import { useState } from "react";
import { TextField } from "@/components/format";
import { Button } from "@/components/ui/button";
import { pullQuotes } from "@/lib/model/feed";
import type { FeedPatch } from "@/lib/model/feed-map";
import { useDesk } from "@/lib/model/store";

const PROVIDERS = ["Not connected", "Financial Modeling Prep", "Finnhub", "Polygon"] as const;

const FIELDS = [
  "Market cap and the quote date",
  "Trailing P/E, EV/EBITDA, FCF yield, and price/book",
  "TTM revenue, latest fiscal revenue, and revenue three years earlier",
  "Vendor ROIC and operating margin, when the feed publishes them",
  "Research price, cap, and revenue for the same tickers",
];

function tickersOf(pilot: { ticker: string }[], companies: { ticker: string }[]): string[] {
  return [...new Set([...pilot, ...companies].map((row) => row.ticker.trim().toUpperCase()))].filter((ticker) =>
    /^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker),
  );
}

function summarize(provider: string, updated: number, failed: number, fatal: string | null): string {
  if (updated === 0) return fatal ?? "The feed returned no figures. The workbook numbers are unchanged.";
  const failNote = failed > 0 ? ` ${failed} ${failed === 1 ? "name was" : "names were"} left unchanged.` : "";
  const fatalNote = fatal ? ` ${fatal}` : "";
  return `Updated ${updated} ${updated === 1 ? "name" : "names"} from ${provider}. Caps, trailing multiples, revenue, and profitability replaced the workbook figures where the feed sent them.${failNote}${fatalNote}`;
}

export function FeedView() {
  const apiKey = useDesk((state) => state.apiKey);
  const apiProvider = useDesk((state) => state.apiProvider);
  const setApi = useDesk((state) => state.setApi);
  const pilot = useDesk((state) => state.pilot);
  const companies = useDesk((state) => state.companies);
  const applyQuotes = useDesk((state) => state.applyQuotes);
  const lastPull = useDesk((state) => state.lastPull);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    setStatus(null);
    if (apiProvider === "Not connected") {
      setError("Choose Financial Modeling Prep, Finnhub, or Polygon.");
      return;
    }
    const key = apiKey.trim();
    if (key.length < 8) {
      setError("Paste the API key from that provider, then refresh.");
      return;
    }
    const tickers = tickersOf(pilot, companies);
    if (tickers.length === 0) {
      setError("Add a ticker before refreshing.");
      return;
    }
    setBusy(true);
    const patches: FeedPatch[] = [];
    let failed = 0;
    let fatal: string | null = null;
    try {
      const size = apiProvider === "Polygon" ? 3 : 6;
      for (let index = 0; index < tickers.length; index += size) {
        const batch = tickers.slice(index, index + size);
        setStatus(`Refreshing ${Math.min(index + batch.length, tickers.length)} of ${tickers.length}…`);
        const result = await pullQuotes({
          data: { provider: apiProvider as "Financial Modeling Prep" | "Finnhub" | "Polygon", apiKey: key, tickers: batch },
        });
        if (result.patches.length) {
          patches.push(...result.patches);
          applyQuotes(result.patches, null);
        }
        failed += result.errors.length;
        if (result.fatal) {
          fatal = result.fatal;
          break;
        }
      }
      const message = summarize(apiProvider, patches.length, failed, fatal);
      if (patches.length === 0) {
        setError(message);
      } else {
        applyQuotes([], { at: new Date().toISOString(), provider: apiProvider, message });
        setStatus(message);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The feed could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-5">
      <div>
        <p className="font-mono text-xs text-brass">Your key, your quotes</p>
        <h2 className="mt-1 font-serif text-3xl">Market data feed</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Choose a provider and paste its key. Refresh pulls caps, trailing value, revenue, and profitability for every ticker already on the desk, then reranks the pilot board. The full NYSE, Nasdaq, and NYSE American directory is on US stocks and uses this same key. The key stays in this browser. It is sent only to that provider for the request you start.
        </p>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Provider</span>
        <select
          value={apiProvider}
          onChange={(event) => setApi({ apiProvider: event.target.value })}
          className="h-11 w-full min-w-0 rounded-md border border-line bg-ink px-3 text-sm"
        >
          {PROVIDERS.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </label>
      <TextField
        label="API key"
        type="password"
        autoComplete="off"
        value={apiKey}
        onChange={(next) => setApi({ apiKey: next })}
        onKeyDown={(event) => {
          if (event.key === "Enter") void refresh();
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy} onClick={() => void refresh()}>
          {busy ? "Refreshing…" : "Refresh ranks"}
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setApi({ apiKey: "", apiProvider: "Not connected" });
            setStatus(null);
            setError(null);
          }}
        >
          Clear key
        </Button>
      </div>
      <p className={`text-sm leading-relaxed ${error ? "text-down" : "text-muted"}`} aria-live="polite">
        {error ?? status ?? lastPull?.message ?? "No live refresh yet. The board is still the workbook snapshot of 2–3 Oct 2026."}
      </p>
      <ul className="flex flex-col gap-2 text-sm text-muted">
        {FIELDS.map((field) => (
          <li key={field} className="border-t border-line py-2">
            {field}
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-faint">
        Network ties, guidance, and forward estimates stay manual. A field the provider omits is left as entered, so a rank can mix a new cap with an older multiple. These figures are a screening input, not a recommendation.
      </p>
    </div>
  );
}
