import { useState } from "react";
import { TextField } from "@/components/format";
import { Button } from "@/components/ui/button";
import { cancelRefresh, refreshDesk } from "@/lib/model/refresh";
import { trackedTickers } from "@/lib/model/refresh-policy";
import { useDesk } from "@/lib/model/store";

const PROVIDERS = ["Not connected", "Financial Modeling Prep", "Finnhub", "Polygon"] as const;

export function FeedView() {
  const apiKey = useDesk((state) => state.apiKey);
  const apiProvider = useDesk((state) => state.apiProvider);
  const setApi = useDesk((state) => state.setApi);
  const pilot = useDesk((state) => state.pilot);
  const companies = useDesk((state) => state.companies);
  const lastPull = useDesk((state) => state.lastPull);
  const refresh = useDesk((state) => state.refresh);
  const autoRefresh = useDesk((state) => state.autoRefresh);
  const setAutoRefresh = useDesk((state) => state.setAutoRefresh);
  const tickers = trackedTickers(pilot, companies);
  const [testTicker, setTestTicker] = useState(tickers[0] ?? "");
  const busy = refresh.phase !== "idle";
  const issues = refresh.issues.length ? refresh.issues : lastPull?.issues ?? [];

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <p className="font-mono text-xs text-brass">Your key, your quotes</p>
        <h2 className="mt-1 font-serif text-3xl">Market data feed</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">Connect a provider, test one company, then refresh the tracked research and pilot names. Partial financial access and missing fields are shown below.</p>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Provider</span>
        <select aria-label="Provider" disabled={busy} value={apiProvider} onChange={(event) => setApi({ apiProvider: event.target.value })}
          className="h-11 w-full min-w-0 rounded-md border border-line bg-ink px-3 text-sm">
          {PROVIDERS.map((name) => <option key={name}>{name}</option>)}
        </select>
      </label>
      <TextField label="API key" type="password" autoComplete="off" disabled={busy} value={apiKey}
        onChange={(next) => setApi({ apiKey: next })} />
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Company to test</span>
        <select aria-label="Company to test" disabled={busy} value={testTicker} onChange={(event) => setTestTicker(event.target.value)}
          className="h-11 w-full min-w-0 rounded-md border border-line bg-ink px-3 text-sm">
          {tickers.map((ticker) => <option key={ticker}>{ticker}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy || !testTicker} onClick={() => void refreshDesk([testTicker])}>Test company</Button>
        <Button disabled={busy} onClick={() => void refreshDesk()}>Refresh all tracked</Button>
        {busy ? <Button variant="line" onClick={cancelRefresh}>Stop refresh</Button> : null}
        <Button variant="ghost" disabled={busy} onClick={() => { cancelRefresh(); setApi({ apiKey: "", apiProvider: "Not connected" }); }}>Clear key</Button>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input className="size-4 accent-brass" type="checkbox" checked={autoRefresh} disabled={busy} onChange={(event) => setAutoRefresh(event.target.checked)} />
        Refresh daily while this app is open
      </label>
      <p className="text-xs text-faint">Finnhub batches are paced for the free plan. Daily refresh checks tracked names every 24 hours and requires this browser to be open. Your key stays in this browser and is sent through the app server to the selected provider.</p>
      <p className={`text-sm leading-relaxed ${refresh.error ? "text-down" : "text-muted"}`} aria-live="polite">
        {refresh.error ?? (refresh.message || lastPull?.message || "No provider refresh yet. The pilot still uses the workbook snapshot.")}
      </p>
      {issues.length > 0 ? (
        <section className="rounded-md border border-line p-3">
          <h3 className="text-sm font-medium">Data coverage and request issues</h3>
          <ul className="mt-2 flex flex-col gap-2 text-sm text-muted">
            {issues.map((issue, index) => <li key={`${issue.ticker}-${index}`}><strong>{issue.ticker}</strong>: {issue.message}</li>)}
          </ul>
        </section>
      ) : null}
      <p className="text-xs leading-relaxed text-faint">Network reviews, guidance, forward estimates, and financial dates still need sourced research. Refreshing prices does not verify those inputs or turn an incomplete full score into a ranking.</p>
    </div>
  );
}
