import { create } from "zustand";
import type { FeedPatch } from "./feed-map";
import { PILOT_RECORDS } from "./pilot-data";
import { blankCompany, companyFromPilot, DEFAULT_RULES, workbookCompanies } from "./seed";
import type { PilotRecord, Relationship, ResearchCompany, Rules, SchemeId, UsListing } from "./types";

function positive(next: number | null, prev: number): number {
  return next != null && Number.isFinite(next) && next > 0 ? next : prev;
}

function multiple(next: number | null, prev: number): number {
  if (next == null || !Number.isFinite(next) || next === 0) return prev;
  return next;
}

function finite(next: number | null, prev: number): number {
  return next != null && Number.isFinite(next) ? next : prev;
}

function optionalBn(next: number | null, prev: number | null): number | null {
  return next != null && Number.isFinite(next) ? next : prev;
}

function cleanListing(value: unknown): UsListing | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const ticker = typeof row.ticker === "string" ? row.ticker.trim().toUpperCase() : "";
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) return null;
  const name = typeof row.name === "string" && row.name.trim() ? row.name.trim().slice(0, 140) : ticker;
  const exchange = typeof row.exchange === "string" ? row.exchange.slice(0, 24) : "";
  const sector = typeof row.sector === "string" && row.sector.trim() ? row.sector.trim().slice(0, 60) : "Unclassified";
  const industry = typeof row.industry === "string" ? row.industry.trim().slice(0, 80) : "";
  const marketCapBn = typeof row.marketCapBn === "number" && Number.isFinite(row.marketCapBn) && row.marketCapBn > 0 ? row.marketCapBn : null;
  const price = typeof row.price === "number" && Number.isFinite(row.price) && row.price > 0 ? row.price : null;
  return { ticker, name, exchange, sector, industry, marketCapBn, price };
}

function applyResearch(company: ResearchCompany, patch: FeedPatch): ResearchCompany {
  return {
    ...company,
    marketCap: positive(patch.marketCapBn, company.marketCap ?? 0) || company.marketCap,
    capSnapshot: patch.capDate || company.capSnapshot,
    capSource: patch.source || company.capSource,
    revenue: positive(patch.ttmRevenueBn, company.revenue ?? 0) || company.revenue,
    revenuePeriodEnd: patch.ttmRevenueBn != null && patch.ttmRevenueBn > 0 ? patch.capDate : company.revenuePeriodEnd,
    revenueSource: patch.ttmRevenueBn != null && patch.ttmRevenueBn > 0 ? patch.source : company.revenueSource,
    valuation: {
      ...company.valuation,
      price: positive(patch.price, company.valuation.price ?? 0) || company.valuation.price,
      bookEquity: optionalBn(patch.bookEquityBn, company.valuation.bookEquity),
      debt: optionalBn(patch.debtBn, company.valuation.debt),
      cash: optionalBn(patch.cashBn, company.valuation.cash),
      ttmCfo: optionalBn(patch.ttmCfoBn, company.valuation.ttmCfo),
      ttmCapex: optionalBn(patch.ttmCapexBn, company.valuation.ttmCapex),
    },
    profit: {
      ...company.profit,
      roic: patch.roic == null ? company.profit.roic : patch.roic,
      operatingMargin: patch.margin == null ? company.profit.operatingMargin : patch.margin,
      ttmEnd: patch.roic != null || patch.margin != null ? patch.capDate : company.profit.ttmEnd,
    },
  };
}

export type DeskView = "board" | "research" | "rules" | "equations" | "feed" | "listings";

const KEY = "invest-desk-v1";

export type LastPull = {
  at: string;
  provider: string;
  message: string;
};

type Persisted = {
  v: 1;
  view: DeskView;
  rules: Rules;
  companies: ResearchCompany[];
  relationships: Relationship[];
  pilot: PilotRecord[];
  scheme: SchemeId;
  selectedTicker: string;
  selectedResearchId: string;
  apiKey: string;
  apiProvider: string;
  lastPull: LastPull | null;
  listings: UsListing[];
};

type DeskState = Persisted & {
  hydrated: boolean;
  setView: (view: DeskView) => void;
  setScheme: (scheme: SchemeId) => void;
  selectTicker: (ticker: string) => void;
  selectResearch: (id: string) => void;
  patchPilot: (id: string, patch: Partial<PilotRecord>) => void;
  resetPilot: () => void;
  patchRules: (patch: Partial<Rules>) => void;
  patchCompany: (id: string, patch: Partial<ResearchCompany>) => void;
  addCompany: () => void;
  removeCompany: (id: string) => void;
  stageCohort: (cohort: string) => void;
  addRelationship: (companyId: string) => void;
  patchRelationship: (id: string, patch: Partial<Relationship>) => void;
  removeRelationship: (id: string) => void;
  setApi: (patch: { apiKey?: string; apiProvider?: string }) => void;
  applyQuotes: (patches: FeedPatch[], lastPull: LastPull | null) => void;
  setListings: (listings: UsListing[]) => void;
  resetWorkbook: () => void;
  hydrate: () => void;
};

function fresh(): Persisted {
  return {
    v: 1,
    view: "board",
    rules: DEFAULT_RULES,
    companies: workbookCompanies(),
    relationships: [],
    pilot: PILOT_RECORDS,
    scheme: "equal",
    selectedTicker: "JNJ",
    selectedResearchId: "US-XOM",
    apiKey: "",
    apiProvider: "Not connected",
    lastPull: null,
    listings: [],
  };
}

function persist(state: DeskState) {
  if (!state.hydrated || typeof localStorage === "undefined") return;
  const payload: Persisted = {
    v: 1,
    view: state.view,
    rules: state.rules,
    companies: state.companies,
    relationships: state.relationships,
    pilot: state.pilot,
    scheme: state.scheme,
    selectedTicker: state.selectedTicker,
    selectedResearchId: state.selectedResearchId,
    apiKey: state.apiKey,
    apiProvider: state.apiProvider,
    lastPull: state.lastPull,
    listings: state.listings,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // A full US directory can exceed the browser quota. Keep the in-memory list.
  }
}

export const useDesk = create<DeskState>((set, get) => ({
  ...fresh(),
  hydrated: false,
  setView: (view) => {
    set({ view });
    persist(get());
  },
  setScheme: (scheme) => {
    set({ scheme });
    persist(get());
  },
  selectTicker: (selectedTicker) => set({ selectedTicker }),
  selectResearch: (selectedResearchId) => set({ selectedResearchId }),
  patchPilot: (id, patch) => {
    set({ pilot: get().pilot.map((row) => (row.id === id ? { ...row, ...patch } : row)) });
    persist(get());
  },
  resetPilot: () => {
    set({ pilot: PILOT_RECORDS });
    persist(get());
  },
  patchRules: (patch) => {
    set({ rules: { ...get().rules, ...patch, capFloor: Math.max(10, patch.capFloor ?? get().rules.capFloor) } });
    persist(get());
  },
  patchCompany: (id, patch) => {
    set({
      companies: get().companies.map((company) => (company.id === id ? { ...company, ...patch } : company)),
    });
    persist(get());
  },
  addCompany: () => {
    const id = `NEW-${Date.now()}`;
    const company = { ...blankCompany(), id, ticker: "NEW", name: "New issuer" };
    set({ companies: [...get().companies, company], selectedResearchId: id });
    persist(get());
  },
  removeCompany: (id) => {
    set({
      companies: get().companies.filter((company) => company.id !== id),
      relationships: get().relationships.filter((tie) => tie.companyId !== id),
    });
    persist(get());
  },
  stageCohort: (cohort) => {
    const peers = get().pilot.filter((row) => row.cohort === cohort);
    if (peers.length === 0) return;
    const incoming = peers.map(companyFromPilot);
    const byId = new Map(get().companies.map((company) => [company.id, company]));
    for (const company of incoming) byId.set(company.id, company);
    set({
      companies: [...byId.values()],
      rules: {
        ...get().rules,
        sector: peers[0]!.sector,
        industry: "",
        country: "Global",
        universeConfirmed: true,
      },
      view: "research",
      selectedResearchId: incoming[0]!.id,
    });
    persist(get());
  },
  addRelationship: (companyId) => {
    const tie: Relationship = {
      id: `tie-${Date.now()}`,
      companyId,
      counterpartyName: "",
      counterpartyCap: null,
      role: "Client",
      active: true,
      include: true,
      material: true,
      sourceUrl: "",
      sourceDate: "",
      verifiedDate: "",
    };
    set({ relationships: [...get().relationships, tie] });
    persist(get());
  },
  patchRelationship: (id, patch) => {
    set({
      relationships: get().relationships.map((tie) => (tie.id === id ? { ...tie, ...patch } : tie)),
    });
    persist(get());
  },
  removeRelationship: (id) => {
    set({ relationships: get().relationships.filter((tie) => tie.id !== id) });
    persist(get());
  },
  setApi: (patch) => {
    set({ ...patch });
    persist(get());
  },
  applyQuotes: (patches, lastPull) => {
    const byTicker = new Map(patches.map((patch) => [patch.ticker.toUpperCase(), patch]));
    const pilot = get().pilot.map((row) => {
      const patch = byTicker.get(row.ticker.toUpperCase());
      if (!patch) return row;
      return {
        ...row,
        marketCap: positive(patch.marketCapBn, row.marketCap),
        ttmRevenue: positive(patch.ttmRevenueBn, row.ttmRevenue),
        trailingPe: multiple(patch.trailingPe, row.trailingPe),
        evEbitda: multiple(patch.evEbitda, row.evEbitda),
        fcfYield: patch.fcfYield == null || !Number.isFinite(patch.fcfYield) ? row.fcfYield : patch.fcfYield,
        priceBook: patch.priceBook == null || !Number.isFinite(patch.priceBook) ? row.priceBook : patch.priceBook,
        roic: finite(patch.roic, row.roic),
        margin: finite(patch.margin, row.margin),
        fyRevenue: positive(patch.fyRevenueBn, row.fyRevenue),
        fyRevenue3: positive(patch.fyRevenue3Bn, row.fyRevenue3),
      };
    });
    const companies = get().companies.map((company) => {
      const patch = byTicker.get(company.ticker.toUpperCase());
      return patch ? applyResearch(company, patch) : company;
    });
    const capDate = patches.find((patch) => patch.capDate)?.capDate;
    set({
      pilot,
      companies,
      rules: capDate ? { ...get().rules, snapshot: capDate } : get().rules,
      lastPull: lastPull ?? get().lastPull,
    });
    persist(get());
  },
  setListings: (listings) => {
    const clean: UsListing[] = [];
    const seen = new Set<string>();
    for (const row of listings) {
      const next = cleanListing(row);
      if (!next || seen.has(next.ticker)) continue;
      seen.add(next.ticker);
      clean.push(next);
      if (clean.length >= 15_000) break;
    }
    set({ listings: clean });
    persist(get());
  },
  resetWorkbook: () => {
    const listings = get().listings;
    set({ ...fresh(), listings, hydrated: true });
    persist(get());
  },
  hydrate: () => {
    if (get().hydrated || typeof localStorage === "undefined") {
      set({ hydrated: true });
      return;
    }
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        set({ hydrated: true });
        return;
      }
      const parsed = JSON.parse(raw) as Persisted;
      if (parsed.v !== 1 || !Array.isArray(parsed.pilot) || !Array.isArray(parsed.companies)) {
        set({ hydrated: true });
        return;
      }
      set({
        ...parsed,
        lastPull: parsed.lastPull ?? null,
        apiKey: parsed.apiKey ?? "",
        apiProvider: parsed.apiProvider || "Not connected",
        listings: Array.isArray(parsed.listings)
          ? parsed.listings.flatMap((row) => {
              const next = cleanListing(row);
              return next ? [next] : [];
            }).slice(0, 15_000)
          : [],
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },
}));
