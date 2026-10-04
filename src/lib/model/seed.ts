import type { PilotRecord, Relationship, ResearchCompany, Rules, ValuationInputs, ProfitInputs, GrowthInputs, NetworkReview } from "./types";

export const SNAPSHOT = "2026-10-03";
export const CAP_DATE = "2026-10-02";

export const DEFAULT_RULES: Rules = {
  capFloor: 10,
  snapshot: SNAPSHOT,
  sector: "Not selected",
  industry: "",
  country: "Global",
  maxCapAgeDays: 7,
  maxRevenueAgeDays: 180,
  minCompanies: 3,
  revenueWeight: 0.5,
  capWeight: 0.5,
  universeConfirmed: false,
  breadthWeight: 0.5,
  sizeWeight: 0.5,
  scaleBlend: 0.5,
  networkBlend: 0.5,
  roicWeight: 0.5,
  marginWeight: 0.5,
  cagrWeight: 0.5,
  guidanceWeight: 0.5,
  competitiveWeight: 0.25,
  valuationWeight: 0.25,
  growthWeight: 0.25,
  profitWeight: 0.25,
  sensitivity: 0.1,
  relationshipMaxAgeDays: 365,
  generalWeights: { pe: 0.35, ev: 0.35, fcf: 0.3, pb: 0 },
  utilityWeights: { pe: 0.4, ev: 0.4, fcf: 0, pb: 0.2 },
};

function valuation(): ValuationInputs {
  return {
    price: null,
    ntmEps: null,
    ntmEbitda: null,
    ttmCfo: null,
    ttmCapex: null,
    bookEquity: null,
    debt: null,
    cash: null,
    preferred: null,
    nci: null,
    nonoperatingInvestments: null,
    verified: false,
    earningsBasis: "Adjusted",
  };
}

function profit(cohort = ""): ProfitInputs {
  return { cohort, accounting: "US GAAP", ttmEnd: "", roic: null, operatingMargin: null };
}

function growth(cohort = "", epsBasis = "Adjusted", lastEps: number | null = null): GrowthInputs {
  return {
    cohort,
    accounting: "US GAAP",
    epsBasis,
    lastFyEnd: "",
    lastEps,
    epsThreeYearsAgo: null,
    guideFyEnd: "",
    guideLow: null,
    guideHigh: null,
    sameBasisReviewed: false,
  };
}

function network(): NetworkReview {
  return { reviewComplete: false, reviewDate: "", reviewLog: "" };
}

type Seed = {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  lastEps?: number;
  epsBasis?: string;
  guideLow?: number;
  guideHigh?: number;
};

const SEEDS: Seed[] = [
  { id: "US-XOM", ticker: "XOM", name: "ExxonMobil", sector: "Energy", industry: "Integrated oil", marketCap: 674.39, lastEps: 6.99 },
  { id: "US-JNJ", ticker: "JNJ", name: "Johnson & Johnson", sector: "Health Care", industry: "Pharma and MedTech", marketCap: 617.01, lastEps: 10.79, guideLow: 11.6, guideHigh: 11.75 },
  { id: "US-PG", ticker: "PG", name: "Procter & Gamble", sector: "Consumer Staples", industry: "Household and personal products", marketCap: 336.58, lastEps: 6.89, epsBasis: "Core", guideLow: 6.89, guideHigh: 7.11 },
  { id: "US-HD", ticker: "HD", name: "Home Depot", sector: "Consumer Discretionary", industry: "Home improvement", marketCap: 282.2, lastEps: 14.69, guideLow: 14.69, guideHigh: 15.2776 },
  { id: "US-IBM", ticker: "IBM", name: "IBM", sector: "Information Technology", industry: "Software, consulting and infrastructure", marketCap: 209.76, lastEps: 11.59, epsBasis: "Operating" },
  { id: "US-VZ", ticker: "VZ", name: "Verizon", sector: "Communication Services", industry: "US telecom", marketCap: 190.79, lastEps: 4.71, guideLow: 4.99, guideHigh: 5.04 },
  { id: "US-HON", ticker: "HON", name: "Honeywell Technologies", sector: "Industrials", industry: "Industrial automation", marketCap: 67.82, lastEps: 6.46, guideLow: 8.05, guideHigh: 8.35 },
  { id: "US-SHW", ticker: "SHW", name: "Sherwin-Williams", sector: "Materials", industry: "Paints and coatings", marketCap: 77.11, lastEps: 11.43, guideLow: 11.8, guideHigh: 12.2 },
  { id: "US-AEP", ticker: "AEP", name: "American Electric Power", sector: "Utilities", industry: "Regulated electric utilities", marketCap: 65.09, lastEps: 5.97, epsBasis: "Operating", guideLow: 6.25, guideHigh: 6.55 },
  { id: "US-JPM", ticker: "JPM", name: "JPMorgan Chase", sector: "Financials", industry: "US diversified banks", marketCap: 883.53, lastEps: 20.02, epsBasis: "Reported" },
];

export function workbookCompanies(): ResearchCompany[] {
  return SEEDS.map((seed) => ({
    id: seed.id,
    ticker: seed.ticker,
    name: seed.name,
    sector: seed.sector,
    industry: seed.industry,
    country: "United States",
    primaryListing: true,
    operatingEquity: true,
    marketCap: seed.marketCap,
    capSnapshot: CAP_DATE,
    capSource: `https://stockanalysis.com/stocks/${seed.ticker.toLowerCase()}/market-cap/`,
    revenue: null,
    revenuePeriodEnd: "",
    revenueComparable: false,
    revenueSource: "",
    include: false,
    valuation: valuation(),
    profit: profit(seed.industry),
    growth: {
      ...growth(seed.industry, seed.epsBasis ?? "Adjusted", seed.lastEps ?? null),
      guideLow: seed.guideLow ?? null,
      guideHigh: seed.guideHigh ?? null,
    },
    network: network(),
  }));
}

export function blankCompany(): ResearchCompany {
  return {
    id: "",
    ticker: "",
    name: "",
    sector: "",
    industry: "",
    country: "United States",
    primaryListing: true,
    operatingEquity: true,
    marketCap: null,
    capSnapshot: CAP_DATE,
    capSource: "",
    revenue: null,
    revenuePeriodEnd: "",
    revenueComparable: false,
    revenueSource: "",
    include: true,
    valuation: valuation(),
    profit: profit(),
    growth: growth(),
    network: network(),
  };
}

export function companyFromPilot(record: PilotRecord): ResearchCompany {
  return {
    id: record.id,
    ticker: record.ticker,
    name: record.name,
    sector: record.sector,
    industry: record.cohort,
    country: "United States",
    primaryListing: true,
    operatingEquity: true,
    marketCap: record.marketCap,
    capSnapshot: CAP_DATE,
    capSource: `https://stockanalysis.com/stocks/${record.ticker.toLowerCase()}/statistics/`,
    revenue: record.ttmRevenue,
    revenuePeriodEnd: "2026-06-30",
    revenueComparable: true,
    revenueSource: `https://stockanalysis.com/stocks/${record.ticker.toLowerCase()}/financials/`,
    include: true,
    valuation: valuation(),
    profit: profit(record.cohort),
    growth: growth(record.cohort),
    network: network(),
  };
}

export const EMPTY_RELATIONSHIPS: Relationship[] = [];
