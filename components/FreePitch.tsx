"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { notify } from "@/components/Confirm";
import { ScanGauge, DoneTick } from "@/components/ScanGauge";
import { expectedSecs } from "@/lib/scanTime";
import { logActivity } from "@/lib/activityClient";

type Job = { mode: string; slug?: string; status: string; requested_at: string; started_at?: string };
// The free pitch plan: a scheduled Claude session on your plan writes it (a few minutes, no API credit) and saves it on the account.
export default function FreePitch({ slug, region, company }: { slug: string; region: string; company: string }) {
  const [plan, setPlan] = useState<{ text: string; at?: string; via?: string } | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const had = useRef(false);
  const loadPlan = useCallback(() => fetch(`/api/pitch?slug=${encodeURIComponent(slug)}`, { cache: "no-store" }).then((r) => r.json()).then((j) => setPlan(j.plan || null)).catch(() => {}), [slug]);
  const poll = useCallback(() => fetch("/api/engine?only=find", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j: { jobs?: Job[] } | null) => {
    const mine = (j?.jobs || []).find((x) => x.mode === "pitch" && x.slug === slug && (x.status === "queued" || x.status === "running")) || null;
    if (had.current && !mine) { setDone(true); loadPlan(); setTimeout(() => setDone(false), 12000); }
    had.current = !!mine; setJob(mine);
  }).catch(() => {}), [slug, loadPlan]);
  useEffect(() => { loadPlan(); poll(); }, [loadPlan, poll]);
  useEffect(() => { const t = setInterval(poll, job ? 6000 : 30000); return () => clearInterval(t); }, [poll, job]);

  async function start() {
    setBusy(true); logActivity("scan", `Pitch plan (free): ${company}`);
    const r = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "queue", region, count: 1, mode: "pitch", slug }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok || r.status === 409) poll(); else notify(j.error || "Could not start the pitch plan.", "error");
  }
  return (
    <div className="freepitch">
      {job ? <ScanGauge label={`Writing the pitch plan for ${company}`} requestedAt={job.requested_at} startedAt={job.started_at} expectedSecs={expectedSecs({ mode: "pitch" })} />
        : <button type="button" className="btn primary" disabled={busy} onClick={start} title="A scheduled Claude session on your plan writes it: a few minutes, no API credit">{busy ? "Queuing…" : plan ? "Draft a fresh pitch plan (free)" : "Draft pitch plan (free)"}</button>}
      {done && !job && <DoneTick text="Pitch plan ready" />}
      <span className="note"> Free · a few minutes · written by a Claude session and saved here. It can also check public news.</span>
      {plan && <div className="pitch-out" aria-label="Saved pitch plan">{plan.text}<div className="muted" style={{ marginTop: 8, fontSize: 11 }}>{plan.via}{plan.at ? ` · ${new Date(plan.at).toLocaleString()}` : ""}</div></div>}
    </div>
  );
}
