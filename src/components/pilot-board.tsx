import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { Field, fmt, fmtPct, fmtRank, Meter } from "@/components/format";
import { Button } from "@/components/ui/button";
import { rankPilot, scorePilotUniverse, type PilotTarget } from "@/lib/model/pilot";
import { SCHEME_ORDER, SCHEMES } from "@/lib/model/schemes";
import { useDesk } from "@/lib/model/store";
import type { SchemeId } from "@/lib/model/types";

export function PilotBoard() {
  const pilot = useDesk((state) => state.pilot);
  const rules = useDesk((state) => state.rules);
  const scheme = useDesk((state) => state.scheme);
  const setScheme = useDesk((state) => state.setScheme);
  const selectedTicker = useDesk((state) => state.selectedTicker);
  const selectTicker = useDesk((state) => state.selectTicker);
  const patchPilot = useDesk((state) => state.patchPilot);
  const resetPilot = useDesk((state) => state.resetPilot);
  const lastPull = useDesk((state) => state.lastPull);
  const [sectorFilter, setSectorFilter] = useState("All");

  const scored = useMemo(
    () => scorePilotUniverse(pilot, Math.max(3, rules.minCompanies)),
    [pilot, rules.minCompanies],
  );
  const weights = SCHEMES[scheme];
  const board = useMemo(() => rankPilot(scored, weights, rules.sensitivity), [scored, weights, rules.sensitivity]);
  const sectors = useMemo(() => groupSectors(board), [board]);
  const visible = sectorFilter === "All" ? sectors : sectors.filter((group) => group.sector === sectorFilter);
  const selected = board.find((row) => row.ticker === selectedTicker) ?? board.find((row) => row.target) ?? board[0];
  const cohort = selected
    ? scored
        .filter((row) => row.cohort === selected.cohort)
        .sort((a, b) => (b.modules.scale ?? -1) - (a.modules.scale ?? -1))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 border-b border-line pb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-2xl">
            <p className="font-mono text-xs text-brass">Experimental variant</p>
            <h2 className="mt-1 font-serif text-3xl">Ten-sector pilot board</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Every issuer in the ten sectors is listed, not only the workbook targets. The rank number is still among those ten targets. The full US exchange directory, unscored, is on US stocks. Strength is cap and revenue. Valuation is trailing. Growth is a three-year revenue CAGR. Profit is vendor ROIC and operating margin.
            </p>
            {lastPull ? <p className="mt-2 text-sm text-brass">{lastPull.message}</p> : null}
          </div>
          <Button variant="ghost" onClick={resetPilot}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Reset inputs
          </Button>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Weight scheme">
          {SCHEME_ORDER.map((id) => (
            <Button key={id} variant={scheme === id ? "primary" : "line"} onClick={() => setScheme(id as SchemeId)}>
              {SCHEMES[id].label}
            </Button>
          ))}
        </div>
        <p className="text-sm text-muted">{weights.hint}</p>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sector">
          <Button variant={sectorFilter === "All" ? "primary" : "line"} onClick={() => setSectorFilter("All")}>
            All sectors
          </Button>
          {sectors.map((group) => (
            <Button
              key={group.sector}
              variant={sectorFilter === group.sector ? "primary" : "line"}
              onClick={() => setSectorFilter(group.sector)}
            >
              {group.sector}
            </Button>
          ))}
        </div>
      </section>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {visible.map((group) => (
            <section key={group.sector} className="min-w-0 overflow-hidden rounded-md border border-line">
              <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-3 py-2">
                <h3 className="font-serif text-xl">{group.sector}</h3>
                <p className="text-xs text-faint">{group.cohort}</p>
              </header>
              <ul>
                {group.rows.map((row) => {
                  const active = selected?.ticker === row.ticker;
                  return (
                    <li key={row.id} className="border-t border-line first:border-t-0">
                      <button
                        type="button"
                        onClick={() => selectTicker(row.ticker)}
                        className={`flex w-full min-w-0 flex-col gap-1 px-3 py-3 text-left ${active ? "bg-surface" : "hover:bg-surface/60"}`}
                      >
                        <div className="flex min-w-0 items-baseline gap-3">
                          <span className="w-8 shrink-0 font-mono text-sm text-brass">{row.target ? fmtRank(row.rank) : "·"}</span>
                          <span className="shrink-0 font-mono text-sm">{row.ticker}</span>
                          <span className="min-w-0 flex-1 truncate text-sm text-muted">{row.name}</span>
                          {row.target ? <span className="shrink-0 text-xs text-brass">target</span> : null}
                          <span className="shrink-0 font-serif text-xl leading-none">{fmt(row.score, 2)}</span>
                        </div>
                        <Meter value={row.score} />
                        <p className="text-xs text-faint">
                          scale {fmt(row.modules.scale, 0)} · value {fmt(row.modules.value, 0)} · growth {fmt(row.modules.growth, 0)} · profit {fmt(row.modules.profit, 0)}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        {selected ? (
          <aside className="flex min-w-0 flex-col gap-4 rounded-md border border-line bg-surface p-4">
            <div>
              <p className="font-mono text-xs text-brass">{selected.sector}</p>
              <h3 className="font-serif text-2xl">{selected.name}</h3>
              <p className="mt-1 text-sm text-muted">
                {selected.cohort}
                {selected.target ? "" : " · peer, not a workbook target"}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Score" value={fmt(selected.score, 2)} />
              <Stat label="Target rank" value={fmtRank(selected.rank)} />
              <Stat label="Weight-test low" value={fmt(selected.low, 2)} />
              <Stat label="Weight-test high" value={fmt(selected.high, 2)} />
            </dl>
            <p className="text-xs leading-relaxed text-faint">
              Band moves one module ±10 percentage points and the other three by ∓3.33 points. It is sensitivity, not a confidence interval. {selected.note}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Market cap USD bn" value={selected.marketCap} onChange={(marketCap) => marketCap != null && patchPilot(selected.id, { marketCap })} />
              <Field label="TTM revenue USD bn" value={selected.ttmRevenue} onChange={(ttmRevenue) => ttmRevenue != null && patchPilot(selected.id, { ttmRevenue })} />
              <Field label="Trailing P/E" value={selected.trailingPe} onChange={(trailingPe) => trailingPe != null && patchPilot(selected.id, { trailingPe })} />
              <Field label="TTM EV/EBITDA" value={selected.evEbitda} onChange={(evEbitda) => evEbitda != null && patchPilot(selected.id, { evEbitda })} />
              <Field label="FCF yield" value={selected.fcfYield} onChange={(fcfYield) => patchPilot(selected.id, { fcfYield })} />
              <Field label="Price / book" value={selected.priceBook} onChange={(priceBook) => patchPilot(selected.id, { priceBook })} />
              <Field label="Vendor ROIC" value={selected.roic} onChange={(roic) => roic != null && patchPilot(selected.id, { roic })} />
              <Field label="Vendor margin" value={selected.margin} onChange={(margin) => margin != null && patchPilot(selected.id, { margin })} />
              <Field label="Latest FY revenue" value={selected.fyRevenue} onChange={(fyRevenue) => fyRevenue != null && patchPilot(selected.id, { fyRevenue })} />
              <Field label="FY revenue, 3 years prior" value={selected.fyRevenue3} onChange={(fyRevenue3) => fyRevenue3 != null && patchPilot(selected.id, { fyRevenue3 })} />
            </div>
            <div>
              <h4 className="mb-2 text-sm text-muted">Cohort · {selected.cohortN} eligible</h4>
              <div className="min-w-0 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead className="text-xs text-faint">
                    <tr>
                      <th className="py-2 font-medium">Issuer</th>
                      <th className="py-2 font-medium">Scale</th>
                      <th className="py-2 font-medium">Value</th>
                      <th className="py-2 font-medium">Growth</th>
                      <th className="py-2 font-medium">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cohort.map((row) => (
                      <tr key={row.id} className="border-t border-line">
                        <td className="py-2">
                          <button type="button" className="font-mono" onClick={() => selectTicker(row.ticker)}>
                            {row.ticker}
                          </button>
                          {row.target ? <span className="ml-2 text-xs text-brass">target</span> : null}
                        </td>
                        <td className="py-2 font-mono">{fmt(row.modules.scale, 0)}</td>
                        <td className="py-2 font-mono">{fmt(row.modules.value, 0)}</td>
                        <td className="py-2 font-mono">{fmt(row.modules.growth, 0)}</td>
                        <td className="py-2 font-mono">{fmt(row.modules.profit, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-faint">
                Revenue CAGR {fmtPct(selected.modules.revenueCagr)}. Higher value scores are cheaper trailing multiples. Utilities use price/book instead of FCF yield.
              </p>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function groupSectors(rows: PilotTarget[]): { sector: string; cohort: string; rows: PilotTarget[] }[] {
  const groups = new Map<string, PilotTarget[]>();
  for (const row of rows) {
    const list = groups.get(row.sector) ?? [];
    list.push(row);
    groups.set(row.sector, list);
  }
  return [...groups.entries()]
    .map(([sector, members]) => ({
      sector,
      cohort: members[0]?.cohort ?? "",
      rows: [...members].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.ticker.localeCompare(b.ticker)),
    }))
    .sort((a, b) => {
      const left = a.rows.find((row) => row.target)?.rank ?? 99;
      const right = b.rows.find((row) => row.target)?.rank ?? 99;
      return left - right || a.sector.localeCompare(b.sector);
    });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-ink px-3 py-2">
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="font-mono text-base">{value}</dd>
    </div>
  );
}