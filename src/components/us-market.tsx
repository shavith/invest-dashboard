import { useMemo, useState } from "react";
import { fmt } from "@/components/format";
import { Button } from "@/components/ui/button";
import { useDesk } from "@/lib/model/store";
import type { UsListing } from "@/lib/model/types";
import { listUsStocks } from "@/lib/model/us-list";

const PAGE_SIZE = 80;
const MAX_PAGES = 45;

type Resume = { page: number; cursor: string | null; anchor: string | null };

function fmtCap(value: number | null): string {
  if (value == null) return "—";
  if (value >= 100) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (value >= 10) return fmt(value, 1);
  return fmt(value, 2);
}

function fmtPrice(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function UsMarket() {
  const listings = useDesk((state) => state.listings);
  const setListings = useDesk((state) => state.setListings);
  const apiKey = useDesk((state) => state.apiKey);
  const apiProvider = useDesk((state) => state.apiProvider);
  const setView = useDesk((state) => state.setView);
  const stageListing = useDesk((state) => state.stageListing);
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("All");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);

  const sectors = useMemo(() => {
    const names = new Set(listings.map((row) => row.sector || "Unclassified"));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [listings]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = listings.filter((row) => {
      if (sector !== "All" && row.sector !== sector) return false;
      if (!needle) return true;
      return row.ticker.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle);
    });
    return [...rows].sort((a, b) => {
      const left = a.marketCapBn ?? -1;
      const right = b.marketCapBn ?? -1;
      if (left !== right) return right - left;
      return a.ticker.localeCompare(b.ticker);
    });
  }, [listings, query, sector]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, (safePage + 1) * PAGE_SIZE);

  async function importMarket(continuePrevious: boolean) {
    setError(null);
    setStatus(null);
    if (apiProvider !== "Financial Modeling Prep" && apiProvider !== "Finnhub" && apiProvider !== "Polygon") {
      setError("Choose Financial Modeling Prep, Finnhub, or Polygon on Live feed, and paste the key there.");
      return;
    }
    const key = apiKey.trim();
    if (key.length < 8) {
      setError("Paste the API key on Live feed, then import.");
      return;
    }
    const provider = apiProvider as "Financial Modeling Prep" | "Finnhub" | "Polygon";
    const start = continuePrevious && resume ? resume : { page: 0, cursor: null, anchor: null };
    const collected = new Map<string, UsListing>();
    if (continuePrevious) {
      for (const row of listings) collected.set(row.ticker, row);
    }
    setBusy(true);
    setPage(0);
    if (!continuePrevious) setResume(null);
    let fatal: string | null = null;
    let rawCount = 0;
    let pageNo = start.page;
    let cursor = start.cursor;
    let anchor = start.anchor;
    let capped = false;
    try {
      for (let step = 0; step < MAX_PAGES; step += 1) {
        setStatus(`Reading the exchange list… ${collected.size.toLocaleString("en-US")} names`);
        const result = await listUsStocks({
          data: { provider, apiKey: key, page: pageNo, cursor, previousAnchor: anchor },
        });
        rawCount += result.rawCount;
        if (result.fatal) {
          fatal = result.fatal;
          if (/rate-limited/i.test(result.fatal)) setResume({ page: pageNo, cursor, anchor });
          else setResume(null);
          break;
        }
        for (const row of result.rows) collected.set(row.ticker, row);
        if (collected.size > 0) setListings([...collected.values()]);
        if (!result.hasMore || (result.cursor && result.cursor === cursor && result.anchor === anchor)) {
          setResume(null);
          break;
        }
        if (step === MAX_PAGES - 1) {
          capped = true;
          setResume({ page: result.nextPage ?? pageNo + 1, cursor: result.cursor, anchor: result.anchor });
          break;
        }
        pageNo = result.nextPage ?? pageNo + 1;
        cursor = result.cursor;
        anchor = result.anchor;
      }
      const count = collected.size;
      if (count === 0) {
        setError(
          fatal ??
            (rawCount > 0
              ? "The provider answered, but none of the rows were NYSE, Nasdaq, or NYSE American common stock."
              : "The provider returned no US listings. The pilot board is unchanged."),
        );
        return;
      }
      const partial = fatal ? ` ${fatal}` : "";
      const capNote = capped ? " The safety cap paused the import. Continue to read the next pages." : "";
      setStatus(
        `Imported ${count.toLocaleString("en-US")} US listings from ${apiProvider}.${partial}${capNote} ETFs, funds, and OTC names are left out. This list is not a model score.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The exchange list could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="max-w-2xl">
        <p className="font-mono text-xs text-brass">Exchange directory</p>
        <h2 className="mt-1 font-serif text-3xl">US stocks</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Imports every common stock and ADR your key can list on NYSE, Nasdaq, and NYSE American. Financial Modeling Prep also sends cap, price, sector, and industry. Finnhub and Polygon send the name and exchange only, so cap and sector stay blank instead of being guessed. Use Add to research to track a company and complete its inputs. Research enforces the $10B minimum; this directory is not a ranking.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {resume ? (
          <Button variant="primary" disabled={busy} onClick={() => void importMarket(true)}>
            Continue import
          </Button>
        ) : (
          <Button variant="primary" disabled={busy} onClick={() => void importMarket(false)}>
            {busy ? "Importing…" : listings.length > 0 ? "Import again" : "Import US stocks"}
          </Button>
        )}
        {resume ? (
          <Button variant="line" disabled={busy} onClick={() => void importMarket(false)}>
            {busy ? "Importing…" : "Start over"}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          disabled={busy || listings.length === 0}
          onClick={() => {
            setListings([]);
            setResume(null);
            setStatus(null);
            setError(null);
            setPage(0);
            setSector("All");
            setQuery("");
          }}
        >
          Clear list
        </Button>
        <Button variant="ghost" onClick={() => setView("feed")}>
          Live feed
        </Button>
      </div>
      <p className={`text-sm leading-relaxed ${error ? "text-down" : "text-muted"}`} aria-live="polite">
        {error ??
          status ??
          (listings.length === 0
            ? "No US directory yet. The key saved on Live feed is used only when you import, and only for that provider."
            : `${listings.length.toLocaleString("en-US")} names saved in this browser.`)}
      </p>
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-muted">Search ticker or name</span>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            className="h-11 w-full min-w-0 rounded-md border border-line bg-ink px-3 text-sm"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-muted">Sector</span>
          <select
            value={sectors.includes(sector) || sector === "All" ? sector : "All"}
            onChange={(event) => {
              setSector(event.target.value);
              setPage(0);
            }}
            className="h-11 w-full min-w-0 rounded-md border border-line bg-ink px-3 text-sm"
          >
            <option value="All">All sectors</option>
            {sectors.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <p>
          {filtered.length === 0 ? "No names match" : `${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} of ${filtered.length.toLocaleString("en-US")}`}
        </p>
        <div className="flex gap-2">
          <Button variant="line" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            Previous
          </Button>
          <Button variant="line" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>
            Next
          </Button>
        </div>
      </div>
      <div className="min-w-0 overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-surface text-xs text-faint">
            <tr>
              <th className="px-3 py-3 font-medium">Ticker</th>
              <th className="px-3 py-3 font-medium">Name</th>
              <th className="px-3 py-3 font-medium">Exchange</th>
              <th className="px-3 py-3 font-medium">Sector</th>
              <th className="px-3 py-3 font-medium">Cap $bn</th>
              <th className="px-3 py-3 font-medium">Price</th>
              <th className="px-3 py-3 font-medium">Research</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-muted">
                  {listings.length === 0 ? "Import a directory to fill this table." : "Nothing in this sector or search."}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={row.ticker} className="border-t border-line">
                  <td className="px-3 py-2 font-mono">{row.ticker}</td>
                  <td className="max-w-[16rem] truncate px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2 text-muted">{row.exchange || "—"}</td>
                  <td className="px-3 py-2 text-muted">{row.sector}</td>
                  <td className="px-3 py-2 font-mono">{fmtCap(row.marketCapBn)}</td>
                  <td className="px-3 py-2 font-mono">{fmtPrice(row.price)}</td>
                  <td className="px-3 py-2"><Button variant="ghost" onClick={() => stageListing(row.ticker)}>Add to research</Button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
