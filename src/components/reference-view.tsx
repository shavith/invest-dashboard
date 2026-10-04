const EQUATIONS = [
  ["Company inclusion", "Primary operating equity, unique issuer, selected sector, sourced cap at least the USD 10bn floor, cap snapshot inside the age window."],
  ["Cap percentile", "100 × [smaller caps + 0.5 × (ties − 1)] / (N − 1). Identical values score 50. N must be at least 3."],
  ["Revenue percentile", "Same midpoint formula on comparable TTM revenue. The whole eligible universe must have revenue or nobody is scaled."],
  ["Scale", "Revenue weight × revenue percentile + cap weight × cap percentile. Default 50 / 50."],
  ["Network", "Breadth percentile of unique public counterparties at or above the floor, plus the percentile of their median cap. Default 50 / 50. A finished review with none scores 0. A missing review is unranked."],
  ["Competitive strength", "Scale weight × scale + network weight × network. Default 50 / 50. No silent reweight if one piece is missing."],
  ["Forward P/E", "Price / next-twelve-month diluted EPS. Zero or negative EPS is not a bargain."],
  ["Enterprise value", "Market cap + debt including leases + preferred + noncontrolling interest − cash − nonoperating investments."],
  ["Forward EV/EBITDA", "Enterprise value / next-twelve-month EBITDA. Both must be positive."],
  ["FCF yield", "(TTM cash from operations − cash capex) / market cap. Higher yield scores higher."],
  ["Price/book", "Market cap / positive common equity. Used in the utilities profile, not the general one."],
  ["Valuation score", "General: 35% P/E, 35% EV/EBITDA, 30% FCF yield. Utilities: 40% P/E, 40% EV/EBITDA, 20% price/book. Cheapness percentiles flip multiples so lower is better."],
  ["Growth", "50% three-year EPS CAGR percentile + 50% raw guidance-growth percentile. Guide growth is midpoint / last EPS − 1. Basis must match. Bias is diagnostic only."],
  ["Profitability", "50% reported ROIC percentile + 50% operating-margin percentile inside one business cohort and accounting standard."],
  ["Overall", "S = 25% strength + 25% valuation + 25% growth + 25% profitability. All four required. No zero fill and no renormalizing."],
  ["Weight test", "One weight moves ±10 percentage points and the other three move ∓3.33 points. The band is sensitivity, not a confidence interval."],
  ["Pilot variant", "Separate from the full score: scale without network, trailing multiples, revenue CAGR, vendor ROIC and margin. Thirty issuers, ten targets, three peers each."],
];

export function ReferenceView() {
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <p className="font-mono text-xs text-brass">Equation registry</p>
        <h2 className="mt-1 font-serif text-3xl">How a company is scored</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Taken from the investment model workbook. ETF ownership, contracts and balance-sheet risk are diagnostics or later modules. They do not enter the composite. These weights are not a return forecast.
        </p>
      </div>
      <ol className="flex flex-col">
        {EQUATIONS.map(([title, body], index) => (
          <li key={title} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 border-t border-line py-4">
            <span className="font-mono text-xs text-brass">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h3 className="text-sm">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
