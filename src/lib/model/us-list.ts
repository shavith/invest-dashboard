import { createServerFn } from "@tanstack/react-start";
import { providerError } from "./feed-map";
import {
  FMP_PAGE_LIMIT,
  directoryRows,
  legacyPlan,
  mapDirectory,
  polygonCursor,
  type FmpExchange,
} from "./us-list-map";
import type { UsListing } from "./types";

export type ListResponse = {
  rows: UsListing[];
  hasMore: boolean;
  cursor: string | null;
  nextPage: number | null;
  fatal: string | null;
  anchor: string | null;
  rawCount: number;
};

type ProviderId = "Financial Modeling Prep" | "Finnhub" | "Polygon";

type ListInput = {
  provider: ProviderId;
  apiKey: string;
  page: number;
  cursor: string | null;
  previousAnchor: string | null;
};

const PROVIDERS: ProviderId[] = ["Financial Modeling Prep", "Finnhub", "Polygon"];

function parseInput(input: ListInput): ListInput {
  if (!input || typeof input !== "object") throw new Error("Missing list request.");
  if (!PROVIDERS.includes(input.provider)) throw new Error("Choose Financial Modeling Prep, Finnhub, or Polygon.");
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  if (apiKey.length < 8 || apiKey.length > 200) throw new Error("That API key does not look usable.");
  const page = Number.isInteger(input.page) && input.page >= 0 && input.page <= 200 ? input.page : -1;
  if (page < 0) throw new Error("That page is outside the import.");
  let cursor: string | null = null;
  if (typeof input.cursor === "string" && input.cursor) {
    if (input.provider === "Financial Modeling Prep") {
      if (!/^(s:\d{1,3}|q:(NYSE|NASDAQ|AMEX)|list|(?:NYSE|NASDAQ|AMEX):\d{1,2})$/.test(input.cursor)) {
        throw new Error("The listing cursor was rejected.");
      }
      cursor = input.cursor;
    } else if (input.provider === "Polygon") {
      if (input.cursor.length > 1800 || /https?:|apiKey|apikey|token=/i.test(input.cursor) || !/^[A-Za-z0-9._~+/-]+=*$/.test(input.cursor)) {
        throw new Error("The listing cursor was rejected.");
      }
      cursor = input.cursor;
    }
  }
  let previousAnchor: string | null = null;
  if (typeof input.previousAnchor === "string" && input.previousAnchor) {
    const anchor = input.previousAnchor.trim().toUpperCase();
    if (!/^[A-Z0-9.-]{1,16}$/.test(anchor)) throw new Error("The listing page did not line up.");
    previousAnchor = anchor;
  }
  return { provider: input.provider, apiKey, page, cursor, previousAnchor };
}

function redact(message: string, apiKey: string): string {
  return message.split(apiKey).join("••••").replace(/apikey=[^&\s]+/gi, "apikey=••••").replace(/token=[^&\s]+/gi, "token=••••").replace(/apiKey=[^&\s]+/gi, "apiKey=••••");
}

function withKey(base: string, params: Record<string, string>, apiKey: string, keyName: string): string {
  const url = new URL(base);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.set(keyName, apiKey);
  return url.toString();
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

function bodyMessage(status: number, data: unknown): string | null {
  if (typeof data === "string" && data.trim()) return data.trim().slice(0, 240);
  const message = providerError(data);
  if (message) return message;
  if (status >= 400) return `The provider returned HTTP ${status}.`;
  return null;
}

function planLimited(message: string): boolean {
  return legacyPlan(message) || /premium|restricted|special endpoint|not available|permission|upgrade/i.test(message);
}

function fatalOf(status: number, data: unknown, apiKey: string): string | null {
  const message = bodyMessage(status, data);
  if (!message) return null;
  const clean = redact(message, apiKey);
  if (status === 429 || /rate limit|too many/i.test(clean)) {
    return "The provider rate-limited this key. Names already imported stay in the list. Wait a minute and continue the import.";
  }
  return clean;
}

function done(partial: Partial<ListResponse> & Pick<ListResponse, "rows" | "fatal">): ListResponse {
  return {
    rows: partial.rows,
    hasMore: partial.hasMore ?? false,
    cursor: partial.cursor ?? null,
    nextPage: partial.nextPage ?? null,
    fatal: partial.fatal,
    anchor: partial.anchor ?? null,
    rawCount: partial.rawCount ?? 0,
  };
}

const SCREENER = "https://financialmodelingprep.com/stable/company-screener";
const QUOTE_EXCHANGES: FmpExchange[] = ["NYSE", "NASDAQ", "AMEX"];

function nextQuote(exchange: FmpExchange): FmpExchange | null {
  const at = QUOTE_EXCHANGES.indexOf(exchange);
  return QUOTE_EXCHANGES[at + 1] ?? null;
}

function parseMode(cursor: string | null, page: number): { kind: "screen"; page: number } | { kind: "quote"; exchange: FmpExchange } | { kind: "list" } {
  if (cursor === "list") return { kind: "list" };
  const quote = cursor?.match(/^q:(NYSE|NASDAQ|AMEX)$/);
  if (quote) return { kind: "quote", exchange: quote[1] as FmpExchange };
  const screen = cursor?.match(/^s:(\d{1,3})$/);
  if (screen) return { kind: "screen", page: Number(screen[1]) };
  return { kind: "screen", page: page > 0 ? page : 0 };
}

async function stockList(apiKey: string, signal: AbortSignal, prior: string | null): Promise<ListResponse> {
  const urls = [
    "https://financialmodelingprep.com/stable/stock-list",
    "https://financialmodelingprep.com/api/v3/stock/list",
    "https://financialmodelingprep.com/api/v3/available-traded/list",
  ];
  let last = prior;
  for (const url of urls) {
    const fetched = await getJson(withKey(url, {}, apiKey, "apikey"), apiKey, signal);
    const message = bodyMessage(fetched.status, fetched.data);
    if (message) {
      last = message;
      continue;
    }
    const mapped = mapDirectory("fmp", fetched.data);
    if (mapped.rows.length) {
      return done({ rows: mapped.rows, fatal: null, hasMore: false, anchor: mapped.anchor, rawCount: mapped.rawCount });
    }
  }
  return done({ rows: [], fatal: redact(last ?? "The provider returned no US listings.", apiKey) });
}

async function loadQuotes(apiKey: string, signal: AbortSignal, exchange: FmpExchange): Promise<{ status: number; data: unknown }> {
  const stable = await getJson(
    withKey("https://financialmodelingprep.com/stable/batch-exchange-quote", { exchange }, apiKey, "apikey"),
    apiKey,
    signal,
  );
  const stableMessage = bodyMessage(stable.status, stable.data);
  if (!stableMessage && directoryRows(stable.data).length > 0) return stable;
  return getJson(withKey(`https://financialmodelingprep.com/api/v3/quotes/${exchange}`, {}, apiKey, "apikey"), apiKey, signal);
}

async function quoteExchange(apiKey: string, signal: AbortSignal, exchange: FmpExchange): Promise<ListResponse> {
  const fetched = await loadQuotes(apiKey, signal, exchange);
  const message = bodyMessage(fetched.status, fetched.data);
  if (message) {
    if (exchange === "NYSE") return stockList(apiKey, signal, message);
    return done({ rows: [], fatal: redact(message, apiKey) });
  }
  const mapped = mapDirectory("fmp", fetched.data);
  if (mapped.rows.length === 0 && exchange === "NYSE") return stockList(apiKey, signal, null);
  const next = nextQuote(exchange);
  return done({
    rows: mapped.rows,
    fatal: null,
    hasMore: Boolean(next),
    cursor: next ? `q:${next}` : null,
    nextPage: next ? 1 : null,
    anchor: mapped.anchor,
    rawCount: mapped.rawCount,
  });
}

async function loadScreener(apiKey: string, signal: AbortSignal, page: number): Promise<{ status: number; data: unknown }> {
  const base = { country: "US", limit: String(FMP_PAGE_LIMIT), page: String(page) };
  const strict = await getJson(
    withKey(SCREENER, { ...base, isEtf: "false", isFund: "false", isActivelyTrading: "true" }, apiKey, "apikey"),
    apiKey,
    signal,
  );
  const message = bodyMessage(strict.status, strict.data);
  if (!message && directoryRows(strict.data).length > 0) return strict;
  if (page > 0 || (message && !planLimited(message))) return strict;
  const loose = await getJson(withKey(SCREENER, base, apiKey, "apikey"), apiKey, signal);
  if (!bodyMessage(loose.status, loose.data) && directoryRows(loose.data).length > 0) return loose;
  return message ? strict : loose;
}

async function listFmp(input: ListInput, signal: AbortSignal): Promise<ListResponse> {
  const mode = parseMode(input.cursor, input.page);
  if (mode.kind === "list") return stockList(input.apiKey, signal, null);
  if (mode.kind === "quote") return quoteExchange(input.apiKey, signal, mode.exchange);

  const fetched = await loadScreener(input.apiKey, signal, mode.page);
  const message = bodyMessage(fetched.status, fetched.data);
  if (message && !planLimited(message)) return done({ rows: [], fatal: redact(message, input.apiKey) });
  if (message && planLimited(message)) return quoteExchange(input.apiKey, signal, "NYSE");
  const mapped = mapDirectory("fmp", fetched.data);
  if (mode.page === 0 && mapped.rows.length === 0) return quoteExchange(input.apiKey, signal, "NYSE");
  if (input.previousAnchor && mapped.anchor && mapped.anchor === input.previousAnchor) {
    return done({ rows: mapped.rows, fatal: null, hasMore: false, anchor: mapped.anchor, rawCount: mapped.rawCount });
  }
  const hasMore = mapped.rawCount >= FMP_PAGE_LIMIT && mode.page < 40;
  return done({
    rows: mapped.rows,
    fatal: null,
    hasMore,
    cursor: hasMore ? `s:${mode.page + 1}` : null,
    nextPage: hasMore ? input.page + 1 : null,
    anchor: mapped.anchor,
    rawCount: mapped.rawCount,
  });
}

async function listFinnhub(input: ListInput, signal: AbortSignal): Promise<ListResponse> {
  if (input.page > 0) return done({ rows: [], fatal: null, hasMore: false });
  const fetched = await getJson(withKey("https://finnhub.io/api/v1/stock/symbol", { exchange: "US" }, input.apiKey, "token"), input.apiKey, signal);
  const fatal = fatalOf(fetched.status, fetched.data, input.apiKey);
  if (fatal) return done({ rows: [], fatal });
  const mapped = mapDirectory("finnhub", fetched.data);
  return done({ rows: mapped.rows, fatal: null, hasMore: false, anchor: mapped.anchor, rawCount: mapped.rawCount });
}

async function listPolygon(input: ListInput, signal: AbortSignal): Promise<ListResponse> {
  const params: Record<string, string> = input.cursor
    ? { cursor: input.cursor }
    : { market: "stocks", locale: "us", active: "true", limit: "1000", order: "asc", sort: "ticker" };
  const fetched = await getJson(withKey("https://api.polygon.io/v3/reference/tickers", params, input.apiKey, "apiKey"), input.apiKey, signal);
  const fatal = fatalOf(fetched.status, fetched.data, input.apiKey);
  if (fatal) return done({ rows: [], fatal });
  const mapped = mapDirectory("polygon", fetched.data);
  const cursor = polygonCursor(isRecord(fetched.data) ? fetched.data.next_url : null);
  return done({
    rows: mapped.rows,
    fatal: null,
    hasMore: Boolean(cursor),
    cursor,
    nextPage: cursor ? input.page + 1 : null,
    anchor: mapped.anchor,
    rawCount: mapped.rawCount,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function runList(input: ListInput): Promise<ListResponse> {
  const signal = AbortSignal.timeout(25_000);
  if (input.provider === "Financial Modeling Prep") return listFmp(input, signal);
  if (input.provider === "Finnhub") return listFinnhub(input, signal);
  return listPolygon(input, signal);
}

export const listUsStocks = createServerFn({ method: "POST" })
  .validator((input: ListInput) => parseInput(input))
  .handler(async ({ data }) => runList(data));
