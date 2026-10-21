// Net revenue bands for the Dashboard tiles. Bands are in USD millions; the figure is the best one the app has (verified first, then estimates).
export const REV_BANDS = [
  { key: "lt50", label: "Under $50M" },
  { key: "50-100", label: "$50M – $100M" },
  { key: "100-200", label: "$100M – $200M" },
  { key: "200-500", label: "$200M – $500M" },
  { key: "gt500", label: "Over $500M" },
  { key: "none", label: "No revenue yet" },
] as const;
export type RevBand = (typeof REV_BANDS)[number]["key"];
/** The band a revenue figure (USD millions) falls in. 50 to under 100, 100 to under 200, 200 to 500 inclusive, over 500. */
export function bandOf(v: number | null | undefined): RevBand {
  if (v === null || v === undefined || !Number.isFinite(v) || v <= 0) return "none";
  return v < 50 ? "lt50" : v < 100 ? "50-100" : v < 200 ? "100-200" : v <= 500 ? "200-500" : "gt500";
}
