import { mapFinnhub, mapFmp, mapPolygon, providerError, type FeedPatch } from "./feed-map";

export type PullResponse = {
  patches: FeedPatch[];
  errors: { ticker: string; message: string }[];
  fatal: string | null;
  warnings: { ticker: string; message: string }[];
};

type ProviderId = "Financial Modeling Prep" | "Finnhub" | "Polygon";

type PullInput = {
  provider: ProviderId;
  apiKey: string;
  tickers: string[];
};

const PROVIDERS: ProviderId[] = ["Financial Modeling Prep", "Finnhub", "Polygon"];

export function parseInput(input: PullInput): PullInput {
  if (!input || typeof input !== "object") throw new Error("Missing feed request.");
  if (!PROVIDERS.includes(input.provider)) throw new Error("Choose Financial Modeling Prep, Finnhub, or Polygon.");
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  if (apiKey.length < 8 || apiKey.length > 200) throw new Error("That API key does not look usable.");
  if (!Array.isArray(input.tickers) || input.tickers.length === 0) throw new Error("There are no tickers to refresh.");
  const tickers = [...new Set(input.tickers.map((ticker) => String(ticker).trim().toUpperCase()))].filter((ticker) =>
    /^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker),
  );
  if (tickers.length === 0 || tickers.length > 10) throw new Error("Refresh a smaller set of tickers.");
  return { provider: input.provider, apiKey, tickers };
}

function redact(message: string, apiKey: string): string {
  return message.split(apiKey).join("••••").replace(/apikey=[^&\s]+/gi, "apikey=••••").replace(/token=[^&\s]+/gi, "token=••••");
}

function stopFor(parts: { fatal: string | null }[]): string | null {
  for (const part of parts) {
    if (part.fatal && /rate-limited/i.test(part.fatal)) return part.fatal;
  }
  const auth = parts
    .map((part) => part.fatal)
    .filter((message): message is string => Boolean(message && /invalid api|api key|unauthorized|forbidden|HTTP 401|HTTP 403/i.test(message)));
  if (auth.length === parts.length) return auth[0] ?? null;
  return null;
}

async function getJson(url: string, apiKey: string, signal: AbortSignal): Promise<{ status: number; data: unknown }> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal,
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "invest-desk" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The provider did not respond.";
    throw new Error(redact(message, apiKey));
  }
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text.slice(0, 180) };
    }
  }
  return { status: response.status, data };
}

function fatalMessage(status: number, message: string): string | null {
  if (status === 429 || /rate limit|too many/i.test(message)) {
    return "The provider rate-limited this key. Figures already written stay on the board. Wait a minute and refresh again.";
  }
  if (status === 401 || status === 403 || /invalid api|api key|apikey|unauthorized|forbidden|not valid/i.test(message)) {
    if (/legacy|restricted endpoint|special endpoint|premium|not available/i.test(message)) return null;
    return message;
  }
  return null;
}

function isLegacyPlan(message: string): boolean {
  return /legacy|no longer supported|deprecated/i.test(message);
}

async function readProvider(
  url: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<{ data: unknown; fatal: string | null; legacy: boolean; error: string | null }> {
  let status: number;
  let data: unknown;
  try { ({ status, data } = await getJson(url, apiKey, signal)); }
  catch (error) {
    return { data: null, fatal: null, legacy: false, error: redact(error instanceof Error ? error.message : "Request failed.", apiKey) };
  }
  const message = providerError(data);
  if (message) {
    const clean = redact(`HTTP ${status}: ${message}`, apiKey);
    return { data: null, fatal: fatalMessage(status, clean), legacy: isLegacyPlan(clean), error: clean };
  }
  if (status >= 400) {
    const message = `The provider returned HTTP ${status}.`;
    return { data: null, fatal: fatalMessage(status, message), legacy: false, error: message };
  }
  return { data, fatal: null, legacy: false, error: null };
}

function attachWarnings(patch: FeedPatch | null, parts: { error: string | null }[], labels: string[]): FeedPatch {
  const warnings = parts.flatMap((part, index) => part.error ? [`${labels[index]}: ${part.error}`] : []);
  if (!patch) throw new Error(warnings.join(" · ") || "No usable figures returned.");
  return { ...patch, warnings };
}

async function mapPool<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function withKey(base: string, params: Record<string, string>, apiKey: string, keyName: string): string {
  const url = new URL(base);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.set(keyName, apiKey);
  return url.toString();
}

async function pullFmp(ticker: string, apiKey: string, signal: AbortSignal, legacy: boolean): Promise<FeedPatch | null> {
  const quoteUrl = legacy
    ? withKey(`https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(ticker)}`, {}, apiKey, "apikey")
    : withKey("https://financialmodelingprep.com/stable/quote", { symbol: ticker }, apiKey, "apikey");
  const metricsUrl = legacy
    ? withKey(`https://financialmodelingprep.com/api/v3/key-metrics-ttm/${encodeURIComponent(ticker)}`, {}, apiKey, "apikey")
    : withKey("https://financialmodelingprep.com/stable/key-metrics-ttm", { symbol: ticker }, apiKey, "apikey");
  const ratiosUrl = legacy
    ? withKey(`https://financialmodelingprep.com/api/v3/ratios-ttm/${encodeURIComponent(ticker)}`, {}, apiKey, "apikey")
    : withKey("https://financialmodelingprep.com/stable/ratios-ttm", { symbol: ticker }, apiKey, "apikey");
  const incomeUrl = legacy
    ? withKey(
        `https://financialmodelingprep.com/api/v3/income-statement/${encodeURIComponent(ticker)}`,
        { period: "annual", limit: "4" },
        apiKey,
        "apikey",
      )
    : withKey("https://financialmodelingprep.com/stable/income-statement", { symbol: ticker, period: "annual", limit: "4" }, apiKey, "apikey");
  const [quote, metrics, ratios, income] = await Promise.all([
    readProvider(quoteUrl, apiKey, signal),
    readProvider(metricsUrl, apiKey, signal),
    readProvider(ratiosUrl, apiKey, signal),
    readProvider(incomeUrl, apiKey, signal),
  ]);
  const parts = [quote, metrics, ratios, income];
  const fatal = stopFor(parts);
  if (fatal && /rate-limited/i.test(fatal)) throw new Error(fatal);
  if (!legacy && (parts.some((part) => part.legacy) || parts.every((part) => part.fatal))) {
    const error = new Error(fatal || "legacy") as Error & { legacy?: boolean };
    error.legacy = true;
    throw error;
  }
  if (fatal) throw new Error(fatal);
  return attachWarnings(mapFmp(ticker, { quote: quote.data, metrics: metrics.data, ratios: ratios.data, income: income.data }), parts, ["Quote", "Metrics", "Ratios", "Annual income"]);
}

async function pullFinnhub(ticker: string, apiKey: string, signal: AbortSignal): Promise<FeedPatch | null> {
  const [profile, metric, quote] = await Promise.all([
    readProvider(withKey("https://finnhub.io/api/v1/stock/profile2", { symbol: ticker }, apiKey, "token"), apiKey, signal),
    readProvider(withKey("https://finnhub.io/api/v1/stock/metric", { symbol: ticker, metric: "all" }, apiKey, "token"), apiKey, signal),
    readProvider(withKey("https://finnhub.io/api/v1/quote", { symbol: ticker }, apiKey, "token"), apiKey, signal),
  ]);
  const fatal = stopFor([profile, metric, quote]);
  if (fatal) throw new Error(fatal);
  const patch = attachWarnings(mapFinnhub(ticker, profile.data, metric.data, quote.data), [profile, metric, quote], ["Profile", "Basic Financials", "Quote"]);
  patch.warnings ??= [];
  if (patch.fyRevenueBn == null || patch.fyRevenue3Bn == null) patch.warnings.push("An aligned three-year reported revenue pair is unavailable. Existing history is retained.");
  if ((patch.ttmRevenueBn != null || patch.margin != null || patch.roic != null) && !patch.revenuePeriodEnd && !patch.profitPeriodEnd)
    patch.warnings.push("Financial reporting dates are unavailable. Research freshness needs verification.");
  if (patch.ttmRevenueBn != null) patch.warnings.push("TTM revenue is estimated from per-share revenue and the current share count.");
  return patch;
}

async function pullPolygon(ticker: string, apiKey: string, signal: AbortSignal): Promise<FeedPatch | null> {
  // The experimental financials API was retired. Preserve the usable price feed.
  const host = "https://api.polygon.io";
  const [details, prev] = await Promise.all([
    readProvider(withKey(`${host}/v3/reference/tickers/${encodeURIComponent(ticker)}`, {}, apiKey, "apiKey"), apiKey, signal),
    readProvider(withKey(`${host}/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev`, { adjusted: "true" }, apiKey, "apiKey"), apiKey, signal),
  ]);
  const fatal = stopFor([details, prev]);
  if (fatal) throw new Error(fatal);
  const patch = attachWarnings(mapPolygon(ticker, details.data, prev.data, null, null), [details, prev], ["Profile", "Previous close"]);
  (patch.warnings ??= []).push("Polygon supplies prices and caps only; its retired financials endpoint is disabled.");
  return patch;
}

export async function runPull(input: PullInput): Promise<PullResponse> {
  const patches: FeedPatch[] = [];
  const errors: { ticker: string; message: string }[] = [];
  const warnings: { ticker: string; message: string }[] = [];
  let fatal: string | null = null;
  let legacy = false;
  const accept = (patch: FeedPatch) => {
    patches.push(patch);
    warnings.push(...(patch.warnings ?? []).map((message) => ({ ticker: patch.ticker, message })));
  };
  const signal = AbortSignal.timeout(20_000);
  await mapPool(input.tickers, input.provider === "Polygon" ? 2 : 4, async (ticker) => {
    if (fatal) return;
    try {
      const patch =
        input.provider === "Financial Modeling Prep"
          ? await pullFmp(ticker, input.apiKey, signal, legacy)
          : input.provider === "Finnhub"
            ? await pullFinnhub(ticker, input.apiKey, signal)
            : await pullPolygon(ticker, input.apiKey, signal);
      if (!patch) errors.push({ ticker, message: "No figures returned." });
      else accept(patch);
    } catch (error) {
      const marked = error as Error & { legacy?: boolean };
      if (marked.legacy && input.provider === "Financial Modeling Prep") {
        legacy = true;
        try {
          const patch = await pullFmp(ticker, input.apiKey, signal, true);
          if (!patch) errors.push({ ticker, message: "No figures returned." });
          else accept(patch);
          return;
        } catch (retryError) {
          fatal = redact(retryError instanceof Error ? retryError.message : "The feed rejected this key.", input.apiKey);
          return;
        }
      }
      const clean = redact(error instanceof Error ? error.message : "Request failed.", input.apiKey);
      if (/rate-limited|invalid api|api key|unauthorized|forbidden|HTTP 401|HTTP 403/i.test(clean)) fatal = clean;
      else errors.push({ ticker, message: clean });
    }
  });
  return { patches, errors, warnings, fatal };
}

