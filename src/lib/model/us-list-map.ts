import type { UsListing } from "./types";

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;
const LIMIT = 1000;

const EXCHANGE_LABELS: Record<string, string> = {
  NYSE: "NYSE",
  XNYS: "NYSE",
  NASDAQ: "Nasdaq",
  NASDAQGS: "Nasdaq",
  NASDAQGM: "Nasdaq",
  NASDAQCM: "Nasdaq",
  NMS: "Nasdaq",
  NGM: "Nasdaq",
  NCM: "Nasdaq",
  XNAS: "Nasdaq",
  XNMS: "Nasdaq",
  XNGS: "Nasdaq",
  XNCM: "Nasdaq",
  XNIM: "Nasdaq",
  NYQ: "NYSE",
  AMEX: "NYSE American",
  NYSEAMERICAN: "NYSE American",
  NYSEAM: "NYSE American",
  NYSEMKT: "NYSE American",
  NYSEAMERICANMKT: "NYSE American",
  ASE: "NYSE American",
  XASE: "NYSE American",
};

export const FMP_EXCHANGES = ["NYSE", "NASDAQ", "AMEX"] as const;
export type FmpExchange = (typeof FMP_EXCHANGES)[number];

export function exchangeLabel(value: string): string | null {
  const key = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (EXCHANGE_LABELS[key]) return EXCHANGE_LABELS[key];
  if (!key) return null;
  if (key.includes("NASDAQ") || key.includes("XNAS")) return "Nasdaq";
  if (key.includes("ARCA") || key.includes("OTC") || key.includes("PINK") || key.includes("BATS") || key.includes("CBOE")) return null;
  if (key.includes("AMERICAN") || key.includes("AMEX") || key.includes("XASE")) return "NYSE American";
  if (key === "NYSE" || key.includes("NEWYORKSTOCKEXCHANGE") || key.includes("XNYS")) return "NYSE";
  return null;
}

export function tickerOk(symbol: string): boolean {
  if (!TICKER.test(symbol)) return false;
  if (/\.(WS|WT|W|U|R|RT)$/.test(symbol)) return false;
  if (/-(W|WS|WT|U|R|RT|P|PR)[A-Z]?$/.test(symbol)) return false;
  if (/-[A-Z]{2,}$/.test(symbol)) return false;
  return true;
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function directoryRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  if (Array.isArray(data.results)) return data.results.filter(isRecord);
  if (Array.isArray(data.data)) return data.data.filter(isRecord);
  return [];
}

export function rowAnchor(rows: Record<string, unknown>[]): string | null {
  const first = rows[0];
  if (!first) return null;
  const symbol = text(first.symbol ?? first.ticker ?? first.displaySymbol, 16).toUpperCase();
  return symbol || null;
}

function listing(ticker: string, name: string, exchange: string, sector: string, industry: string, marketCap: number | null, price: number | null): UsListing {
  return {
    ticker,
    name: name || ticker,
    exchange,
    sector: sector || "Unclassified",
    industry,
    marketCapBn: marketCap != null && marketCap > 0 ? marketCap / 1e9 : null,
    price: price != null && price > 0 ? price : null,
  };
}

const FINNHUB_SKIP = /ETF|ETP|FUND|WARRANT|RIGHT|UNIT|PREFERRED|BOND|NOTE|INDEX|STRUCTURED/;
const FINNHUB_KEEP = /COMMON|STOCK|ADR|REIT|PARTNER|EQUITY|ORDINARY|DEPOSITARY/;

function finnhubKindOk(kind: string): boolean {
  if (!kind || FINNHUB_SKIP.test(kind)) return false;
  return FINNHUB_KEEP.test(kind);
}

export function mapDirectory(source: "fmp" | "finnhub" | "polygon", data: unknown): { rows: UsListing[]; anchor: string | null; rawCount: number } {
  const raw = directoryRows(data);
  const rows: UsListing[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const mapped = source === "fmp" ? mapFmp(row) : source === "finnhub" ? mapFinnhub(row) : mapPolygon(row);
    if (!mapped || seen.has(mapped.ticker)) continue;
    seen.add(mapped.ticker);
    rows.push(mapped);
  }
  return { rows, anchor: rowAnchor(raw), rawCount: raw.length };
}

function mapFmp(row: Record<string, unknown>): UsListing | null {
  const kind = text(row.type, 24).toLowerCase();
  if (kind === "etf" || kind === "fund" || kind === "trust") return null;
  if (row.isEtf === true || row.isFund === true || row.isEtf === "true" || row.isFund === "true") return null;
  const ticker = text(row.symbol ?? row.ticker, 12).toUpperCase();
  if (!tickerOk(ticker)) return null;
  const name = text(row.companyName ?? row.name, 140);
  if (row.isEtf !== false && row.isEtf !== "false" && /\bETF\b|\bETN\b/i.test(name)) return null;
  const rawExchange = text(row.exchangeShortName ?? row.exchange, 40);
  let exchange = exchangeLabel(rawExchange);
  if (!exchange) {
    if (/OTC|PINK|PNK|ARCA/.test(rawExchange.toUpperCase())) return null;
    const country = text(row.country, 24).toUpperCase();
    if (country !== "US" && country !== "USA" && country !== "UNITED STATES") return null;
    exchange = "US";
  }
  return listing(ticker, name, exchange, text(row.sector, 60), text(row.industry, 80), num(row.marketCap), num(row.price));
}

function mapFinnhub(row: Record<string, unknown>): UsListing | null {
  const kind = text(row.type, 40).toUpperCase();
  if (!finnhubKindOk(kind)) return null;
  const exchange = exchangeLabel(text(row.mic, 16));
  if (!exchange) return null;
  const ticker = text(row.symbol ?? row.displaySymbol, 12).toUpperCase();
  if (!tickerOk(ticker)) return null;
  return listing(ticker, text(row.description, 140), exchange, "", "", null, null);
}

function mapPolygon(row: Record<string, unknown>): UsListing | null {
  const kind = text(row.type, 12).toUpperCase();
  if (kind !== "CS" && kind !== "ADRC" && kind !== "OS") return null;
  const exchange = exchangeLabel(text(row.primary_exchange, 16));
  if (!exchange) return null;
  const ticker = text(row.ticker, 12).toUpperCase();
  if (!tickerOk(ticker)) return null;
  return listing(ticker, text(row.name, 140), exchange, "", "", null, null);
}

export function parseFmpCursor(cursor: string | null, page: number): { exchange: FmpExchange; index: number } {
  if (cursor && /^(NYSE|NASDAQ|AMEX):\d{1,2}$/.test(cursor)) {
    const [exchange, indexText] = cursor.split(":");
    const index = Number(indexText);
    if ((exchange === "NYSE" || exchange === "NASDAQ" || exchange === "AMEX") && index >= 0 && index <= 40) {
      return { exchange, index };
    }
  }
  return { exchange: "NYSE", index: page > 0 ? page : 0 };
}

export function fmpAdvance(exchange: FmpExchange, index: number, rawCount: number): { cursor: string | null; hasMore: boolean } {
  if (rawCount >= LIMIT) {
    const nextIndex = index + 1;
    if (nextIndex > 40) return { cursor: null, hasMore: false };
    return { cursor: `${exchange}:${nextIndex}`, hasMore: true };
  }
  const at = FMP_EXCHANGES.indexOf(exchange);
  const next = FMP_EXCHANGES[at + 1];
  if (!next) return { cursor: null, hasMore: false };
  return { cursor: `${next}:0`, hasMore: true };
}

export function polygonCursor(nextUrl: unknown): string | null {
  if (typeof nextUrl !== "string" || !nextUrl) return null;
  let url: URL;
  try {
    url = new URL(nextUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "api.polygon.io" || url.pathname !== "/v3/reference/tickers") return null;
  const cursor = url.searchParams.get("cursor");
  if (!cursor || cursor.length > 1800 || /https?:|apiKey|apikey|token=/i.test(cursor)) return null;
  if (!/^[A-Za-z0-9._~+/-]+=*$/.test(cursor)) return null;
  return cursor;
}

export function legacyPlan(message: string): boolean {
  return /legacy|no longer supported|deprecated|restricted endpoint|special endpoint/i.test(message);
}

export const FMP_PAGE_LIMIT = LIMIT;
