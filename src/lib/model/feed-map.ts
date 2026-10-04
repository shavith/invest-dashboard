export type FeedPatch = {
  ticker: string;
  price: number | null;
  marketCapBn: number | null;
  capDate: string;
  revenuePeriodEnd?: string | null;
  profitPeriodEnd?: string | null;
  ttmRevenueBn: number | null;
  trailingPe: number | null;
  evEbitda: number | null;
  fcfYield: number | null;
  priceBook: number | null;
  roic: number | null;
  margin: number | null;
  fyRevenueBn: number | null;
  fyRevenue3Bn: number | null;
  bookEquityBn: number | null;
  debtBn: number | null;
  cashBn: number | null;
  ttmCfoBn: number | null;
  ttmCapexBn: number | null;
  source: string;
  warnings?: string[];
};

export function blankPatch(ticker: string, source: string, capDate: string): FeedPatch {
  return {
    ticker,
    price: null,
    marketCapBn: null,
    capDate,
    ttmRevenueBn: null,
    trailingPe: null,
    evEbitda: null,
    fcfYield: null,
    priceBook: null,
    roic: null,
    margin: null,
    fyRevenueBn: null,
    fyRevenue3Bn: null,
    bookEquityBn: null,
    debtBn: null,
    cashBn: null,
    ttmCfoBn: null,
    ttmCapexBn: null,
    source,
  };
}

export function patchHasFigures(patch: FeedPatch): boolean {
  return [patch.marketCapBn, patch.price, patch.ttmRevenueBn, patch.trailingPe, patch.evEbitda].some(
    (value) => value != null && Number.isFinite(value) && value !== 0,
  );
}

export function providerError(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (row.status === "OK" || row.status === "DELAYED") return null;
  const direct = row["Error Message"] ?? row.error;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  if (typeof row.message === "string" && row.message.trim() && !Array.isArray(row.results)) return row.message.trim();
  return null;
}

export function isoFromUnix(value: number | null): string | null {
  if (value == null || !Number.isFinite(value) || value < 1_000_000_000) return null;
  const ms = value > 10_000_000_000 ? value : value * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.map(asRecord).filter((row): row is Record<string, unknown> => row != null);
  const row = asRecord(data);
  return row ? [row] : [];
}

function pickNum(row: Record<string, unknown> | null, keys: string[]): number | null {
  if (!row) return null;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function dollarsToBn(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value / 1e9;
}

function asDecimal(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (Math.abs(value) > 1.5) return value / 100;
  return value;
}

function firstRow(data: unknown): Record<string, unknown> | null {
  return asRows(data)[0] ?? null;
}

function annualRevenues(data: unknown): { date: string; revenue: number }[] {
  const dated = asRows(data)
    .map((row) => {
      const period = String(row.period ?? row.fiscalPeriod ?? "FY").toUpperCase();
      if (period && period !== "FY" && period !== "ANNUAL") return null;
      const revenue = pickNum(row, ["revenue", "totalRevenue"]);
      const date = String(row.date ?? row.calendarYear ?? row.fillingDate ?? "");
      if (revenue == null || revenue <= 0) return null;
      return { date, revenue };
    })
    .filter((row): row is { date: string; revenue: number } => row != null)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return dated;
}

export function mapFmp(ticker: string, parts: { quote: unknown; metrics: unknown; ratios: unknown; income: unknown }): FeedPatch | null {
  const quote = firstRow(parts.quote);
  const metrics = firstRow(parts.metrics);
  const ratios = firstRow(parts.ratios);
  const capDate = isoFromUnix(pickNum(quote, ["timestamp"])) ?? "";
  const patch = blankPatch(ticker, `https://financialmodelingprep.com/quote/${encodeURIComponent(ticker)}`, capDate);
  patch.price = pickNum(quote, ["price"]);
  patch.marketCapBn = dollarsToBn(pickNum(quote, ["marketCap"]) ?? pickNum(metrics, ["marketCap", "marketCapTTM"]));
  const enterprise = pickNum(metrics, ["enterpriseValueTTM", "enterpriseValue"]);
  const evToSales = pickNum(metrics, ["evToSalesTTM", "enterpriseValueOverRevenueTTM"]);
  patch.ttmRevenueBn = enterprise != null && evToSales != null && evToSales > 0 ? dollarsToBn(enterprise / evToSales) : null;
  patch.trailingPe = pickNum(ratios, ["priceToEarningsRatioTTM", "priceEarningsRatioTTM", "peRatioTTM"]) ?? pickNum(metrics, ["peRatioTTM"]);
  patch.evEbitda = pickNum(metrics, ["evToEBITDATTM", "enterpriseValueOverEBITDATTM"]);
  patch.fcfYield = pickNum(metrics, ["freeCashFlowYieldTTM"]);
  patch.priceBook = pickNum(ratios, ["priceToBookRatioTTM", "priceBookValueRatioTTM", "pbRatioTTM"]);
  patch.roic = asDecimal(pickNum(metrics, ["returnOnInvestedCapitalTTM", "roicTTM"]));
  patch.margin = asDecimal(pickNum(ratios, ["operatingProfitMarginTTM"]));
  const revenues = annualRevenues(parts.income);
  const pair = threeYearPair(revenues.map((row) => ({ period: row.date, value: row.revenue })));
  patch.fyRevenueBn = dollarsToBn(pair.latest?.value ?? null);
  patch.fyRevenue3Bn = dollarsToBn(pair.earlier?.value ?? null);
  return patchHasFigures(patch) ? patch : null;
}

export function threeYearPair(rows: { period: string; value: number }[]): {
  latest: { period: string; value: number } | null;
  earlier: { period: string; value: number } | null;
} {
  const clean = rows.filter((row) => /^\d{4}(?:-\d{2}-\d{2})?$/.test(row.period) && Number.isFinite(row.value) && row.value > 0)
    .sort((a, b) => b.period.localeCompare(a.period));
  const latest = clean[0] ?? null;
  if (!latest) return { latest: null, earlier: null };
  const year = Number(latest.period.slice(0, 4));
  const latestRows = clean.filter((row) => Number(row.period.slice(0, 4)) === year);
  if (latestRows.some((row) => row.value !== latest.value)) return { latest: null, earlier: null };
  const candidates = clean.filter((row) => Number(row.period.slice(0, 4)) === year - 3);
  const earlier = candidates.length && candidates.every((row) => row.value === candidates[0]!.value) ? candidates[0]! : null;
  return { latest, earlier };
}
export function mapFinnhub(ticker: string, profile: unknown, metricBody: unknown, quote: unknown): FeedPatch | null {
  const company = asRecord(profile);
  const body = asRecord(metricBody);
  const metric = asRecord(body?.metric) ?? body;
  const priceRow = asRecord(quote);
  const capDate = isoFromUnix(pickNum(priceRow, ["t"])) ?? "";
  const patch = blankPatch(ticker, `https://finnhub.io/quote?symbol=${encodeURIComponent(ticker)}`, capDate);
  const capMillions = pickNum(company, ["marketCapitalization"]);
  patch.marketCapBn = capMillions != null && capMillions > 0 ? capMillions / 1000 : null;
  const price = pickNum(priceRow, ["c"]);
  patch.price = price != null && price > 0 ? price : null;
  patch.trailingPe = pickNum(metric, ["peTTM", "peBasicExclExtraTTM", "peExclExtraTTM"]);
  patch.priceBook = pickNum(metric, ["pbQuarterly", "pbAnnual", "pbTTM"]);
  patch.evEbitda = pickNum(metric, ["currentEv/ebitdaTTM", "evEbitdaTTM", "currentEv/ebitdaAnnual"]);
  const fcfYield = pickNum(metric, ["fcfYieldTTM", "freeCashFlowYieldTTM"]);
  const priceToFcf = pickNum(metric, ["pfcfShareTTM", "pfcfShareAnnual"]);
  patch.fcfYield = fcfYield != null ? asDecimal(fcfYield) : priceToFcf != null && priceToFcf !== 0 ? 1 / priceToFcf : null;
  const margin = pickNum(metric, ["operatingMarginTTM", "operatingMarginAnnual"]);
  patch.margin = margin == null ? null : margin / 100;
  const roic = pickNum(metric, ["roicTTM", "returnOnInvestedCapitalTTM"]);
  patch.roic = roic == null ? null : Math.abs(roic) > 1.5 ? roic / 100 : roic;
  const revenuePerShare = pickNum(metric, ["revenuePerShareTTM", "salesPerShareTTM"]);
  const sharesMillions = pickNum(company, ["shareOutstanding"]);
  if (revenuePerShare != null && sharesMillions != null && revenuePerShare > 0 && sharesMillions > 0) {
    patch.ttmRevenueBn = (revenuePerShare * sharesMillions) / 1000;
  }
  // Basic Financials does not declare monetary units for arbitrary annual revenue keys.
  // Do not guess units or use the fourth available observation as a three-year baseline.
  return patchHasFigures(patch) ? patch : null;
}

function statementValue(statement: unknown, key: string): number | null {
  const row = asRecord(statement);
  const node = asRecord(row?.[key]);
  return pickNum(node, ["value"]);
}

export function mapPolygon(ticker: string, details: unknown, prev: unknown, annual: unknown, ttm: unknown): FeedPatch | null {
  const detailRow = asRecord(asRecord(details)?.results);
  const prevRow = asRows(asRecord(prev)?.results)[0] ?? null;
  const capDate = isoFromUnix(pickNum(prevRow, ["t"])) ?? "";
  const patch = blankPatch(ticker, `https://polygon.io/quote/${encodeURIComponent(ticker)}`, capDate);
  patch.marketCapBn = dollarsToBn(pickNum(detailRow, ["market_cap"]));
  const price = pickNum(prevRow, ["c"]);
  patch.price = price != null && price > 0 ? price : null;

  const annualRows = asRows(asRecord(annual)?.results);
  const annualRevenue = annualRows
    .map((row) => ({
      date: String(row.end_date ?? row.period_of_report_date ?? ""),
      revenue: statementValue(asRecord(row.financials)?.income_statement, "revenues"),
    }))
    .filter((row) => row.revenue != null && row.revenue > 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const pair = threeYearPair(annualRevenue.map((row) => ({ period: row.date, value: row.revenue! })));
  patch.fyRevenueBn = dollarsToBn(pair.latest?.value ?? null);
  patch.fyRevenue3Bn = dollarsToBn(pair.earlier?.value ?? null);

  const ttmRow = asRows(asRecord(ttm)?.results)[0] ?? null;
  const periodEnd = typeof ttmRow?.end_date === "string" ? ttmRow.end_date : null;
  patch.revenuePeriodEnd = periodEnd;
  patch.profitPeriodEnd = periodEnd;
  const financials = asRecord(ttmRow?.financials);
  const income = financials?.income_statement;
  const balance = financials?.balance_sheet;
  const cashFlow = financials?.cash_flow_statement;
  const ttmRevenue = statementValue(income, "revenues");
  patch.ttmRevenueBn = dollarsToBn(ttmRevenue);
  const operating = statementValue(income, "operating_income_loss");
  patch.margin = ttmRevenue != null && ttmRevenue > 0 && operating != null ? operating / ttmRevenue : null;
  const eps = statementValue(income, "diluted_earnings_per_share");
  patch.trailingPe = eps != null && eps > 0 && patch.price != null ? patch.price / eps : null;
  const equity = statementValue(balance, "equity") ?? statementValue(balance, "equity_attributable_to_parent");
  patch.bookEquityBn = dollarsToBn(equity);
  patch.priceBook = equity != null && equity > 0 && patch.marketCapBn != null ? (patch.marketCapBn * 1e9) / equity : null;
  const cfo = statementValue(cashFlow, "net_cash_flow_from_operating_activities");
  const capex = statementValue(cashFlow, "purchase_of_property_plant_and_equipment");
  patch.ttmCfoBn = dollarsToBn(cfo);
  patch.ttmCapexBn = capex == null ? null : Math.abs(capex) / 1e9;
  const freeCash = statementValue(cashFlow, "free_cash_flow");
  const fcf = freeCash ?? (cfo != null && capex != null ? cfo + (capex < 0 ? capex : -Math.abs(capex)) : null);
  patch.fcfYield = fcf != null && patch.marketCapBn != null && patch.marketCapBn > 0 ? fcf / (patch.marketCapBn * 1e9) : null;
  patch.debtBn = dollarsToBn(statementValue(balance, "long_term_debt") ?? statementValue(balance, "debt"));
  patch.cashBn = dollarsToBn(statementValue(balance, "cash") ?? statementValue(balance, "cash_and_cash_equivalents"));
  return patchHasFigures(patch) ? patch : null;
}
