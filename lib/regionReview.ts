import type { Row } from "@/lib/data";

// Region review (v6.56): an account whose head office is in another country than the one it is filed under gets a red flag
// (companies.profile["Region review"]) until someone decides: move it to the head office's region, or keep it where it is.
// The ICP is head-office based (Define ICP, "Group HQ"), so the flag says where the head office is.
export type RegionReview = { status: "open" | "moved" | "kept"; hq_country: string; reason: string; flagged_at: string; owner?: string;
  from?: string; to?: string; decided_by?: string; decided_at?: string };
export const REVIEW_KEY = "Region review";

export function regionReview(a: Row | null | undefined): RegionReview | null {
  const r = a?.profile?.[REVIEW_KEY];
  return r && typeof r === "object" && (r.status === "open" || r.status === "moved" || r.status === "kept") ? (r as RegionReview) : null;
}
export const reviewOpen = (a: Row | null | undefined) => regionReview(a)?.status === "open";
