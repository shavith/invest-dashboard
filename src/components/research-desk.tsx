import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Field, fmt, fmtRank, TextField } from "@/components/format";
import { Button } from "@/components/ui/button";
import { scoreResearch } from "@/lib/model/research";
import { useDesk } from "@/lib/model/store";
import type { ResearchCompany } from "@/lib/model/types";

export function ResearchDesk() {
  const companies = useDesk((state) => state.companies);
  const relationships = useDesk((state) => state.relationships);
  const rules = useDesk((state) => state.rules);
  const pilot = useDesk((state) => state.pilot);
  const selectedId = useDesk((state) => state.selectedResearchId);
  const selectResearch = useDesk((state) => state.selectResearch);
  const patchCompany = useDesk((state) => state.patchCompany);
  const addCompany = useDesk((state) => state.addCompany);
  const removeCompany = useDesk((state) => state.removeCompany);
  const stageCohort = useDesk((state) => state.stageCohort);
  const addRelationship = useDesk((state) => state.addRelationship);
  const patchRelationship = useDesk((state) => state.patchRelationship);
  const removeRelationship = useDesk((state) => state.removeRelationship);
  const [cohort, setCohort] = useState(pilot[0]?.cohort ?? "");

  const result = useMemo(() => scoreResearch(companies, relationships, rules), [companies, relationships, rules]);
  const selected = result.rows.find((row) => row.company.id === selectedId) ?? result.rows[0];
  const cohorts = [...new Set(pilot.map((row) => row.cohort))];
  const ties = selected ? relationships.filter((tie) => tie.companyId === selected.company.id) : [];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 border-b border-line pb-5">
        <p className="font-mono text-xs text-brass">Original equations</p>
        <h2 className="font-serif text-3xl">Research universe</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted">
          Same gates as the workbook. Include is off, the sector is not selected, and revenue is blank, so every issuer stays outside the approved scope. Scores appear only when a confirmed sector has at least three complete records. Missing inputs stay unranked — they are never filled with zero.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs text-muted">Stage cap and revenue from a pilot cohort</span>
            <select
              value={cohort}
              onChange={(event) => setCohort(event.target.value)}
              className="h-11 w-full min-w-0 rounded-md border border-line bg-ink px-3 text-sm"
            >
              {cohorts.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <Button variant="primary" onClick={() => stageCohort(cohort)}>
            Stage cohort
          </Button>
          <Button onClick={addCompany}>
            <Plus className="size-4" aria-hidden="true" />
            Add issuer
          </Button>
        </div>
        <p className="text-sm">
          Universe status: <span className="text-brass">{result.universeStatus}</span>
        </p>
      </section>

      <div className="min-w-0 overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="bg-surface text-xs text-faint">
            <tr>
              <th className="px-3 py-3 font-medium">Issuer</th>
              <th className="px-3 py-3 font-medium">Sector</th>
              <th className="px-3 py-3 font-medium">Cap</th>
              <th className="px-3 py-3 font-medium">Scale</th>
              <th className="px-3 py-3 font-medium">Score</th>
              <th className="px-3 py-3 font-medium">Rank</th>
              <th className="px-3 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => {
              const active = selected?.company.id === row.company.id;
              return (
                <tr
                  key={row.company.id}
                  className={`cursor-pointer border-t border-line ${active ? "bg-surface" : "hover:bg-surface/60"}`}
                  onClick={() => selectResearch(row.company.id)}
                >
                  <td className="px-3 py-3">
                    <span className="font-mono">{row.company.ticker}</span>
                    <span className="ml-2 text-muted">{row.company.name}</span>
                  </td>
                  <td className="px-3 py-3 text-muted">{row.company.sector}</td>
                  <td className="px-3 py-3 font-mono">{fmt(row.company.marketCap, 1)}</td>
                  <td className="px-3 py-3 font-mono">{fmt(row.scale, 0)}</td>
                  <td className="px-3 py-3 font-mono">{fmt(row.overall, 1)}</td>
                  <td className="px-3 py-3 font-mono">{fmtRank(row.rank)}</td>
                  <td className="px-3 py-3 text-xs text-muted">{row.ready ? "Ready" : row.overallStatus}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected ? (
        <IssuerEditor
          rowStatus={selected}
          ties={ties}
          onPatch={(patch) => patchCompany(selected.company.id, patch)}
          onRemove={() => removeCompany(selected.company.id)}
          onAddTie={() => addRelationship(selected.company.id)}
          onPatchTie={patchRelationship}
          onRemoveTie={removeRelationship}
        />
      ) : null}
    </div>
  );
}

function IssuerEditor({
  rowStatus,
  ties,
  onPatch,
  onRemove,
  onAddTie,
  onPatchTie,
  onRemoveTie,
}: {
  rowStatus: ReturnType<typeof scoreResearch>["rows"][number];
  ties: ReturnType<typeof useDesk.getState>["relationships"];
  onPatch: (patch: Partial<ResearchCompany>) => void;
  onRemove: () => void;
  onAddTie: () => void;
  onPatchTie: (id: string, patch: Partial<(typeof ties)[number]>) => void;
  onRemoveTie: (id: string) => void;
}) {
  const company = rowStatus.company;
  return (
    <section className="flex flex-col gap-5 rounded-md border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-2xl">{company.name || "Issuer"}</h3>
          <p className="mt-1 text-sm text-muted">
            Scale {fmt(rowStatus.scale, 1)} · network {fmt(rowStatus.network, 1)} · valuation {fmt(rowStatus.valuation, 1)} · growth {fmt(rowStatus.growth, 1)} · profit {fmt(rowStatus.profitability, 1)}
          </p>
        </div>
        <Button variant="ghost" onClick={onRemove}>
          <Trash2 className="size-4" aria-hidden="true" />
          Remove
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TextField label="Ticker" value={company.ticker} onChange={(ticker) => onPatch({ ticker })} />
        <TextField label="Company" value={company.name} onChange={(name) => onPatch({ name })} />
        <TextField label="Sector" value={company.sector} onChange={(sector) => onPatch({ sector })} />
        <TextField label="Industry" value={company.industry} onChange={(industry) => onPatch({ industry })} />
        <TextField label="Country" value={company.country} onChange={(country) => onPatch({ country })} />
        <Field label="Market cap USD bn" value={company.marketCap} onChange={(marketCap) => onPatch({ marketCap })} />
        <Field label="TTM revenue USD bn" value={company.revenue} onChange={(revenue) => onPatch({ revenue })} />
        <TextField label="Cap snapshot" value={company.capSnapshot} onChange={(capSnapshot) => onPatch({ capSnapshot })} />
        <TextField label="Revenue period end" value={company.revenuePeriodEnd} onChange={(revenuePeriodEnd) => onPatch({ revenuePeriodEnd })} />
      </div>
      <label className="flex h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={company.include}
          onChange={(event) => onPatch({ include: event.target.checked })}
          className="size-4 accent-brass"
        />
        Include in the selected scope
      </label>
      <label className="flex h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={company.revenueComparable}
          onChange={(event) => onPatch({ revenueComparable: event.target.checked })}
          className="size-4 accent-brass"
        />
        Revenue is comparable segment TTM
      </label>
      <TextField label="Revenue source URL" value={company.revenueSource} onChange={(revenueSource) => onPatch({ revenueSource })} />

      <details className="rounded-md border border-line p-3">
        <summary className="cursor-pointer text-sm">Valuation inputs · {rowStatus.valuationStatus}</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Price USD" value={company.valuation.price} onChange={(price) => onPatch({ valuation: { ...company.valuation, price } })} />
          <Field label="NTM diluted EPS" value={company.valuation.ntmEps} onChange={(ntmEps) => onPatch({ valuation: { ...company.valuation, ntmEps } })} />
          <Field label="NTM EBITDA USD bn" value={company.valuation.ntmEbitda} onChange={(ntmEbitda) => onPatch({ valuation: { ...company.valuation, ntmEbitda } })} />
          <Field label="TTM CFO USD bn" value={company.valuation.ttmCfo} onChange={(ttmCfo) => onPatch({ valuation: { ...company.valuation, ttmCfo } })} />
          <Field label="TTM cash capex USD bn" value={company.valuation.ttmCapex} onChange={(ttmCapex) => onPatch({ valuation: { ...company.valuation, ttmCapex } })} />
          <Field label="Common book USD bn" value={company.valuation.bookEquity} onChange={(bookEquity) => onPatch({ valuation: { ...company.valuation, bookEquity } })} />
          <Field label="Debt incl. leases" value={company.valuation.debt} onChange={(debt) => onPatch({ valuation: { ...company.valuation, debt } })} />
          <Field label="Cash" value={company.valuation.cash} onChange={(cash) => onPatch({ valuation: { ...company.valuation, cash } })} />
          <Field label="Preferred" value={company.valuation.preferred} onChange={(preferred) => onPatch({ valuation: { ...company.valuation, preferred } })} />
          <Field label="Noncontrolling interest" value={company.valuation.nci} onChange={(nci) => onPatch({ valuation: { ...company.valuation, nci } })} />
          <Field label="Nonoperating investments" value={company.valuation.nonoperatingInvestments} onChange={(nonoperatingInvestments) => onPatch({ valuation: { ...company.valuation, nonoperatingInvestments } })} />
        </div>
        <label className="mt-3 flex h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={company.valuation.verified}
            onChange={(event) => onPatch({ valuation: { ...company.valuation, verified: event.target.checked } })}
            className="size-4 accent-brass"
          />
          Comparability verified
        </label>
        <p className="mt-2 text-xs text-faint">
          Forward P/E {fmt(rowStatus.forwardPe, 2)} · EV/EBITDA {fmt(rowStatus.forwardEvEbitda, 2)} · FCF yield {fmt(rowStatus.fcfYield, 3)} · P/B {fmt(rowStatus.priceBook, 2)}. General profile is 35/35/30. Utilities are 40/40/20 with price/book. Banks stay unranked.
        </p>
      </details>

      <details className="rounded-md border border-line p-3">
        <summary className="cursor-pointer text-sm">Growth inputs · {rowStatus.growthStatus}</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TextField label="Growth cohort" value={company.growth.cohort} onChange={(cohort) => onPatch({ growth: { ...company.growth, cohort } })} />
          <TextField label="EPS basis" value={company.growth.epsBasis} onChange={(epsBasis) => onPatch({ growth: { ...company.growth, epsBasis } })} />
          <TextField label="Guide fiscal year end" value={company.growth.guideFyEnd} onChange={(guideFyEnd) => onPatch({ growth: { ...company.growth, guideFyEnd } })} />
          <Field label="Last annual EPS" value={company.growth.lastEps} onChange={(lastEps) => onPatch({ growth: { ...company.growth, lastEps } })} />
          <Field label="EPS three years earlier" value={company.growth.epsThreeYearsAgo} onChange={(epsThreeYearsAgo) => onPatch({ growth: { ...company.growth, epsThreeYearsAgo } })} />
          <Field label="Guide low" value={company.growth.guideLow} onChange={(guideLow) => onPatch({ growth: { ...company.growth, guideLow } })} />
          <Field label="Guide high" value={company.growth.guideHigh} onChange={(guideHigh) => onPatch({ growth: { ...company.growth, guideHigh } })} />
        </div>
        <label className="mt-3 flex h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={company.growth.sameBasisReviewed}
            onChange={(event) => onPatch({ growth: { ...company.growth, sameBasisReviewed: event.target.checked } })}
            className="size-4 accent-brass"
          />
          Actuals, history and guidance use the same basis
        </label>
        <p className="mt-2 text-xs text-faint">
          CAGR {fmt(rowStatus.epsCagr == null ? null : rowStatus.epsCagr * 100, 1)}% · raw guide growth {fmt(rowStatus.guideGrowth == null ? null : rowStatus.guideGrowth * 100, 1)}%. Guidance bias is not scored.
        </p>
      </details>

      <details className="rounded-md border border-line p-3">
        <summary className="cursor-pointer text-sm">Profitability inputs · {rowStatus.profitStatus}</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TextField label="Business cohort" value={company.profit.cohort} onChange={(cohort) => onPatch({ profit: { ...company.profit, cohort } })} />
          <TextField label="Accounting standard" value={company.profit.accounting} onChange={(accounting) => onPatch({ profit: { ...company.profit, accounting } })} />
          <TextField label="TTM period end" value={company.profit.ttmEnd} onChange={(ttmEnd) => onPatch({ profit: { ...company.profit, ttmEnd } })} />
          <Field label="Reported ROIC" value={company.profit.roic} onChange={(roic) => onPatch({ profit: { ...company.profit, roic } })} />
          <Field label="Operating margin" value={company.profit.operatingMargin} onChange={(operatingMargin) => onPatch({ profit: { ...company.profit, operatingMargin } })} />
        </div>
      </details>

      <details className="rounded-md border border-line p-3">
        <summary className="cursor-pointer text-sm">
          Client and partner network · {rowStatus.networkStatus} · {rowStatus.qualifyingTies} ties
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <TextField label="Review date" value={company.network.reviewDate} onChange={(reviewDate) => onPatch({ network: { ...company.network, reviewDate } })} />
          <TextField label="Review log" value={company.network.reviewLog} onChange={(reviewLog) => onPatch({ network: { ...company.network, reviewLog } })} />
        </div>
        <label className="mt-3 flex h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={company.network.reviewComplete}
            onChange={(event) => onPatch({ network: { ...company.network, reviewComplete: event.target.checked } })}
            className="size-4 accent-brass"
          />
          Dated review is complete
        </label>
        <div className="mt-3 flex flex-col gap-3">
          {ties.map((tie) => (
            <div key={tie.id} className="grid gap-3 rounded-md bg-ink p-3 sm:grid-cols-2">
              <TextField label="Counterparty" value={tie.counterpartyName} onChange={(counterpartyName) => onPatchTie(tie.id, { counterpartyName })} />
              <Field label="Cap USD bn" value={tie.counterpartyCap} onChange={(counterpartyCap) => onPatchTie(tie.id, { counterpartyCap })} />
              <TextField label="Source URL" value={tie.sourceUrl} onChange={(sourceUrl) => onPatchTie(tie.id, { sourceUrl })} />
              <TextField label="Source date" value={tie.sourceDate} onChange={(sourceDate) => onPatchTie(tie.id, { sourceDate })} />
              <TextField label="Verified" value={tie.verifiedDate} onChange={(verifiedDate) => onPatchTie(tie.id, { verifiedDate })} />
              <div className="flex items-end">
                <Button variant="ghost" onClick={() => onRemoveTie(tie.id)}>
                  Remove tie
                </Button>
              </div>
            </div>
          ))}
          <Button onClick={onAddTie}>Add relationship</Button>
        </div>
        <p className="mt-2 text-xs text-faint">
          Only public counterparties at or above the USD 10bn floor count. A finished review with no qualifying ties scores zero. An unfinished review stays unranked.
        </p>
      </details>
    </section>
  );
}
