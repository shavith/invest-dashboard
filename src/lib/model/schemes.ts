import type { SchemeId, WeightSet } from "./types";

export const SCHEMES: Record<SchemeId, WeightSet & { label: string; hint: string }> = {
  equal: {
    label: "Equal",
    hint: "25% each. Provisional prior — smallest average rank movement in the workbook’s weight test.",
    scale: 0.25,
    value: 0.25,
    growth: 0.25,
    profit: 0.25,
  },
  profit40: {
    label: "Profit 40%",
    hint: "15% scale, 20% value, 25% growth, 40% profitability.",
    scale: 0.15,
    value: 0.2,
    growth: 0.25,
    profit: 0.4,
  },
  value40: {
    label: "Value 40%",
    hint: "15% scale, 40% value, 20% growth, 25% profitability.",
    scale: 0.15,
    value: 0.4,
    growth: 0.2,
    profit: 0.25,
  },
};

export const SCHEME_ORDER: SchemeId[] = ["equal", "profit40", "value40"];
