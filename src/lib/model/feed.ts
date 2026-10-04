import { createServerFn } from "@tanstack/react-start";
import { mapFinnhub, mapFmp, mapPolygon, providerError, type FeedPatch } from "./feed-map";

export type PullResponse = {
  patches: FeedPatch[];
  errors: { ticker: string; message: string }[];
  fatal: string | null;
};

type ProviderId = "Financial Modeling Prep" | "Finnhub" | "Polygon";

type PullInput = {
  provider: ProviderId;
  apiKey: string;
  tickers: string[];
};

const PROVIDERS: ProviderId[] = ["Financial Modeling Prep", "Finnhub", "Polygon"];

function parseInput(input: PullInput): PullInput {
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
): Promise<{ data: unknown; fatal: string | null; legacy: boolean }> {
  const { status, data } = await getJson(url, apiKey, signal);
  const message = providerError(data);
  if (message) {
    return { data, fatal: fatalMessage(status, message), legacy: isLegacyPlan(message) };
  }
  if (status >= 400) {
    return { data, fatal: fatalMessage(status, `The provider returned HTTP ${status}.`), legacy: false };
  }
  return { data, fatal: null, legacy: false };
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
  return mapFmp(ticker, { quote: quote.data, metrics: metrics.data, ratios: ratios.data, income: income.data });
}

async function pullFinnhub(ticker: string, apiKey: string, signal: AbortSignal): Promise<FeedPatch | null> {
  const [profile, metric, quote] = await Promise.all([
    readProvider(withKey("https://finnhub.io/api/v1/stock/profile2", { symbol: ticker }, apiKey, "token"), apiKey, signal),
    readProvider(withKey("https://finnhub.io/api/v1/stock/metric", { symbol: ticker, metric: "all" }, apiKey, "token"), apiKey, signal),
    readProvider(withKey("https://finnhub.io/api/v1/quote", { symbol: ticker }, apiKey, "token"), apiKey, signal),
  ]);
  const fatal = stopFor([profile, metric, quote]);
  if (fatal) throw new Error(fatal);
  return mapFinnhub(ticker, profile.data, metric.data, quote.data);
}

async function pullPolygon(ticker: string, apiKey: string, signal: AbortSignal): Promise<FeedPatch | null> {
  const host = "https://api.polygon.io";
  const [details, prev, annual, ttm] = await Promise.all([
    readProvider(withKey(`${host}/v3/reference/tickers/${encodeURIComponent(ticker)}`, {}, apiKey, "apiKey"), apiKey, signal),
    readProvider(withKey(`${host}/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev`, { adjusted: "true" }, apiKey, "apiKey"), apiKey, signal),
    readProvider(
      withKey(`${host}/vX/reference/financials`, { ticker, timeframe: "annual", limit: "4", order: "desc", sort: "period_of_report_date" }, apiKey, "apiKey"),
      apiKey,
      signal,
    ),
    readProvider(withKey(`${host}/vX/reference/financials`, { ticker, timeframe: "ttm", limit: "1" }, apiKey, "apiKey"), apiKey, signal),
  ]);
  const fatal = stopFor([details, prev, annual, ttm]);
  if (fatal) throw new Error(fatal);
  return mapPolygon(ticker, details.data, prev.data, annual.fatal ? null : annual.data, ttm.fatal ? null : ttm.data);
}

async function runPull(input: PullInput): Promise<PullResponse> {
  const patches: FeedPatch[] = [];
  const errors: { ticker: string; message: string }[] = [];
  let fatal: string | null = null;
  let legacy = false;
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
      else patches.push(patch);
    } catch (error) {
      const marked = error as Error & { legacy?: boolean };
      if (marked.legacy && input.provider === "Financial Modeling Prep") {
        legacy = true;
        try {
          const patch = await pullFmp(ticker, input.apiKey, signal, true);
          if (!patch) errors.push({ ticker, message: "No figures returned." });
          else patches.push(patch);
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
  return { patches, errors, fatal };
}

export const pullQuotes = createServerFn({ method: "POST" })
  .validator((input: PullInput) => parseInput(input))
  .handler(async ({ data }) => runPull(data));
