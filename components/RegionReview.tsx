"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { REGIONS } from "@/lib/icpDefinition.mjs";
import { regionReview, reviewOpen } from "@/lib/regionReview";
import { notify } from "@/components/Confirm";
import type { Row } from "@/lib/data";

// Region review (v6.56): the red flag on an account whose head office is in another country, the region picker used in the
// account tables, and the decision box in the account brief. The API is /api/region-review.
async function post(body: Record<string, string>): Promise<string | null> {
  try { const r = await fetch("/api/region-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); return r.ok ? null : (j.error || "Could not save."); }
  catch { return "Could not reach the server."; }
}
const OTHER = "__other";

/** Small red flag beside a company name while its region review is open. */
export function RegionFlag({ a }: { a: Row }) {
  const r = regionReview(a);
  if (!r || r.status !== "open") return null;
  return <span className="rflag" title={`Head office: ${r.hq_country}. ${r.reason} Open the account to move it or keep it in ${a.country}.`}>⚑ HO {r.hq_country}</span>;
}

/** Region cell with a drop-down to move the account to another region (or another country, which then shows under Other regions). */
export function RegionPicker({ a, label }: { a: Row; label: string }) {
  const router = useRouter(), [busy, setBusy] = useState(false);
  const flagged = reviewOpen(a);
  const move = async (v: string) => {
    let to = v;
    if (v === OTHER) { to = (window.prompt("Which country should this account be filed under?") || "").trim(); if (!to) return; }
    if (!to) return;
    setBusy(true); const err = await post({ id: a.id, action: "move", to }); setBusy(false);
    if (err) { notify(err); return; }
    notify(`${a.company_name} moved to ${to}.`); router.refresh();
  };
  return (
    <span className={`rpick${flagged ? " flagged" : ""}`} onClick={(e) => e.stopPropagation()}>
      <select value="" disabled={busy} aria-label={`Move ${a.company_name} to another region`} title="Move this account to another region" onChange={(e) => { const v = e.target.value; e.target.value = ""; if (v) void move(v); }}>
        <option value="">{label}</option>
        {REGIONS.filter((r: { countries: string[] }) => r.countries[0].toLowerCase() !== String(a.country).toLowerCase()).map((r: { key: string; name: string; countries: string[] }) => <option key={r.key} value={r.countries[0]}>Move to {r.name}</option>)}
        <option value={OTHER}>Move to another country…</option>
      </select>
    </span>
  );
}

/** Red box at the top of the account brief: where the head office is, who owns the review, and the two ways to settle it. */
export function RegionReviewBox({ a }: { a: Row }) {
  const router = useRouter(), [busy, setBusy] = useState(false);
  const r = regionReview(a);
  if (!r) return null;
  const run = async (action: "move" | "keep") => {
    setBusy(true); const err = await post({ id: a.id, action, to: action === "move" ? r.hq_country : "" }); setBusy(false);
    if (err) { notify(err); return; }
    notify(action === "move" ? `${a.company_name} moved to ${r.hq_country}.` : `${a.company_name} stays in ${a.country}.`); router.refresh();
  };
  if (r.status === "open") return (
    <div className="rbox" role="alert">
      <b>⚑ Region review: head office in {r.hq_country}</b>
      <p>{r.reason} It is filed under <b>{a.country}</b> for now. The ICP follows the head office, so decide where it belongs.{r.owner ? <> Owner: <b>{r.owner}</b>.</> : null}</p>
      <div className="rbox-act">
        <button type="button" className="btn primary tiny" disabled={busy} onClick={() => run("move")}>Move to {r.hq_country}</button>
        <button type="button" className="btn tiny" disabled={busy} onClick={() => run("keep")}>Keep in {a.country}</button>
        <RegionPicker a={a} label="Move somewhere else…" />
      </div>
    </div>
  );
  return <div className="rbox done">{r.status === "moved" ? <>Region review: moved from <b>{r.from}</b> to <b>{r.to}</b> by {r.decided_by} on {String(r.decided_at).slice(0, 10)}. Head office: {r.hq_country}.</> : <>Region review: head office in {r.hq_country}; kept in <b>{a.country}</b> by {r.decided_by} on {String(r.decided_at).slice(0, 10)}.</>}</div>;
}
