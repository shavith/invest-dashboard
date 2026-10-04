import { Field, TextField } from "@/components/format";
import { weightsValid } from "@/lib/model/percentile";
import { useDesk } from "@/lib/model/store";
import type { Rules } from "@/lib/model/types";

export function RulesView() {
  const rules = useDesk((state) => state.rules);
  const companies = useDesk((state) => state.companies);
  const patchRules = useDesk((state) => state.patchRules);
  const sectors = ["Not selected", ...new Set(companies.map((company) => company.sector).filter(Boolean))];
  const scaleOk = weightsValid([rules.revenueWeight, rules.capWeight]);
  const blendOk = weightsValid([rules.scaleBlend, rules.networkBlend]);
  const overallOk = weightsValid(
    [rules.competitiveWeight, rules.valuationWeight, rules.growthWeight, rules.profitWeight],
    rules.sensitivity,
  );

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <p className="font-mono text-xs text-brass">Model controls</p>
        <h2 className="mt-1 font-serif text-3xl">Rules</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          The company floor cannot fall below USD 10bn. Weights are draft assumptions — the workbook has not calibrated them to returns. A pair or set that does not total 100% blocks that score.
        </p>
      </div>
      <section className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Sector</span>
          <select
            value={rules.sector}
            onChange={(event) => patchRules({ sector: event.target.value })}
            className="h-11 w-full min-w-0 rounded-md border border-line bg-ink px-3 text-sm"
          >
            {sectors.map((sector) => (
              <option key={sector} value={sector}>
                {sector}
              </option>
            ))}
          </select>
        </label>
        <TextField label="Industry filter (blank = whole sector)" value={rules.industry} onChange={(industry) => patchRules({ industry })} />
        <TextField label="Country" value={rules.country} onChange={(country) => patchRules({ country })} />
        <TextField label="Research snapshot" value={rules.snapshot} onChange={(snapshot) => patchRules({ snapshot })} />
        <Field label="Cap floor USD bn" value={rules.capFloor} onChange={(capFloor) => capFloor != null && patchRules({ capFloor })} />
        <Field label="Minimum companies" value={rules.minCompanies} onChange={(minCompanies) => minCompanies != null && patchRules({ minCompanies })} />
        <Field label="Max cap age, days" value={rules.maxCapAgeDays} onChange={(maxCapAgeDays) => maxCapAgeDays != null && patchRules({ maxCapAgeDays })} />
        <Field label="Max revenue age, days" value={rules.maxRevenueAgeDays} onChange={(maxRevenueAgeDays) => maxRevenueAgeDays != null && patchRules({ maxRevenueAgeDays })} />
      </section>
      <label className="flex h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={rules.universeConfirmed}
          onChange={(event) => patchRules({ universeConfirmed: event.target.checked })}
          className="size-4 accent-brass"
        />
        Universe confirmed for this scope
      </label>
      <WeightGroup
        title="Scale"
        ok={scaleOk}
        rows={[
          ["Revenue percentile", rules.revenueWeight, (revenueWeight) => patchRules({ revenueWeight })],
          ["Cap percentile", rules.capWeight, (capWeight) => patchRules({ capWeight })],
        ]}
      />
      <WeightGroup
        title="Competitive strength"
        ok={blendOk}
        rows={[
          ["Scale", rules.scaleBlend, (scaleBlend) => patchRules({ scaleBlend })],
          ["Network", rules.networkBlend, (networkBlend) => patchRules({ networkBlend })],
        ]}
      />
      <WeightGroup
        title="Overall score"
        ok={overallOk}
        rows={[
          ["Competitive strength", rules.competitiveWeight, (competitiveWeight) => patchRules({ competitiveWeight })],
          ["Valuation", rules.valuationWeight, (valuationWeight) => patchRules({ valuationWeight })],
          ["Growth", rules.growthWeight, (growthWeight) => patchRules({ growthWeight })],
          ["Profitability", rules.profitWeight, (profitWeight) => patchRules({ profitWeight })],
        ]}
      />
      <section className="grid gap-3 sm:grid-cols-2">
        <Field label="General forward P/E" value={rules.generalWeights.pe} onChange={(pe) => pe != null && patchProfile("generalWeights", { pe })} />
        <Field label="General EV/EBITDA" value={rules.generalWeights.ev} onChange={(ev) => ev != null && patchProfile("generalWeights", { ev })} />
        <Field label="General FCF yield" value={rules.generalWeights.fcf} onChange={(fcf) => fcf != null && patchProfile("generalWeights", { fcf })} />
        <Field label="General price/book" value={rules.generalWeights.pb} onChange={(pb) => pb != null && patchProfile("generalWeights", { pb })} />
        <Field label="Utilities forward P/E" value={rules.utilityWeights.pe} onChange={(pe) => pe != null && patchProfile("utilityWeights", { pe })} />
        <Field label="Utilities EV/EBITDA" value={rules.utilityWeights.ev} onChange={(ev) => ev != null && patchProfile("utilityWeights", { ev })} />
        <Field label="Utilities FCF yield" value={rules.utilityWeights.fcf} onChange={(fcf) => fcf != null && patchProfile("utilityWeights", { fcf })} />
        <Field label="Utilities price/book" value={rules.utilityWeights.pb} onChange={(pb) => pb != null && patchProfile("utilityWeights", { pb })} />
      </section>
      <p className="text-xs text-faint">
        Effective floor is {Math.max(10, rules.capFloor)} billion dollars. Valuation weights must each total 1 inside the research engine before a profile can rank.
      </p>
    </div>
  );

  function patchProfile(key: "generalWeights" | "utilityWeights", patch: Partial<Rules["generalWeights"]>) {
    patchRules({ [key]: { ...rules[key], ...patch } });
  }
}

function WeightGroup({
  title,
  ok,
  rows,
}: {
  title: string;
  ok: boolean;
  rows: [string, number, (value: number) => void][];
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm">{title}</h3>
        <span className={ok ? "text-xs text-up" : "text-xs text-down"}>{ok ? "Valid" : "Check weights"}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map(([label, value, onChange]) => (
          <Field key={label} label={label} value={value} onChange={(next) => next != null && onChange(next)} />
        ))}
      </div>
    </section>
  );
}
