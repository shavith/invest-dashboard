export type UsListing = {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  marketCapBn: number | null;
  price: number | null;
};

export type SchemeId = "equal" | "profit40" | "value40";


export type WeightSet = {
  scale: number;
  value: number;
  growth: number;
  profit: number;
};

export type ValuationWeights = {
  pe: number;
  ev: number;
  fcf: number;
  pb: number;
};

export type Rules = {
  capFloor: number;
  snapshot: string;
  sector: string;
  industry: string;
  country: string;
  maxCapAgeDays: number;
  maxRevenueAgeDays: number;
  minCompanies: number;
  revenueWeight: number;
  capWeight: number;
  universeConfirmed: boolean;
  breadthWeight: number;
  sizeWeight: number;
  scaleBlend: number;
  networkBlend: number;
  roicWeight: number;
  marginWeight: number;
  cagrWeight: number;
  guidanceWeight: number;
  competitiveWeight: number;
  valuationWeight: number;
  growthWeight: number;
  profitWeight: number;
  sensitivity: number;
  relationshipMaxAgeDays: number;
  generalWeights: ValuationWeights;
  utilityWeights: ValuationWeights;
};

export type ValuationInputs = {
  price: number | null;
  ntmEps: number | null;
  ntmEbitda: number | null;
  ttmCfo: number | null;
  ttmCapex: number | null;
  bookEquity: number | null;
  debt: number | null;
  cash: number | null;
  preferred: number | null;
  nci: number | null;
  nonoperatingInvestments: number | null;
  verified: boolean;
  earningsBasis: string;
};

export type ProfitInputs = {
  cohort: string;
  accounting: string;
  ttmEnd: string;
  roic: number | null;
  operatingMargin: number | null;
};

export type GrowthInputs = {
  cohort: string;
  accounting: string;
  epsBasis: string;
  lastFyEnd: string;
  lastEps: number | null;
  epsThreeYearsAgo: number | null;
  guideFyEnd: string;
  guideLow: number | null;
  guideHigh: number | null;
  sameBasisReviewed: boolean;
};

export type NetworkReview = {
  reviewComplete: boolean;
  reviewDate: string;
  reviewLog: string;
};

export type ResearchCompany = {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  country: string;
  primaryListing: boolean;
  operatingEquity: boolean;
  marketCap: number | null;
  capSnapshot: string;
  capSource: string;
  revenue: number | null;
  revenuePeriodEnd: string;
  revenueComparable: boolean;
  revenueSource: string;
  include: boolean;
  valuation: ValuationInputs;
  profit: ProfitInputs;
  growth: GrowthInputs;
  network: NetworkReview;
};

export type Relationship = {
  id: string;
  companyId: string;
  counterpartyName: string;
  counterpartyCap: number | null;
  role: "Client" | "Partner" | "Client and partner";
  active: boolean;
  include: boolean;
  material: boolean;
  sourceUrl: string;
  sourceDate: string;
  verifiedDate: string;
};

export type PilotRecord = {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  cohort: string;
  target: boolean;
  marketCap: number;
  ttmRevenue: number;
  trailingPe: number;
  evEbitda: number;
  fcfYield: number | null;
  priceBook: number | null;
  roic: number;
  margin: number;
  fyRevenue: number;
  fyRevenue3: number;
  note: string;
};

export type Num = number | null;
