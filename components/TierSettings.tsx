"use client";
import { useState } from "react";
import { paidFetch, notify } from "@/components/Confirm";

type Tier = { tier: string; label: string; examples: string };

export default function TierSettings({ initial }: { initial: Tier[] }) {
  const [tiers, setTiers] = useState<Tier[]>(initial);
  const [msg, setMsg] = useState("");
  const set = (i: number, k: keyof Tier, v: string) => setTiers(tiers.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  async function save() {
    const res = await paidFetch("/api/tiers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tiers }) },
      "Saving Contact tiers", undefined, "Contact tiers now drive live research classification. Enter the paid-actions PIN to save this change.");
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setMsg("Saved."); notify("Contact tiers saved.", "ok"); } else { const t = j.error || "Could not save."; setMsg(t); notify(t, "error"); }
  }
  return (
    <section className="view">
      <div className="panel">
        <h2>Contact tiers</h2>
        <p className="note">Tiers are an internal sales classification, not a fact. The research engine reads these definitions live on every new research run (Research Queue, Research more, Refresh) to classify each contact — change the titles here and the next research run follows it. Only Super Admins can reach this page.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
          {tiers.map((t, i) => (
            <div key={t.tier} className="form-grid tier-row" style={{ gridTemplateColumns: "90px 1fr 2fr", alignItems: "center" }}>
              <b>{t.tier}</b>
              <input type="text" className="input-frame" aria-label={`${t.tier} label`} value={t.label} onChange={(e) => set(i, "label", e.target.value)} />
              <textarea className="input-frame" aria-label={`${t.tier} example titles`} value={t.examples} onChange={(e) => set(i, "examples", e.target.value)} />
            </div>
          ))}
        </div>
        <div className="row-actions" style={{ marginTop: 14 }}><button className="btn" type="button" onClick={save}>Save tiers</button>{msg && <span className="note">{msg}</span>}</div>
      </div>
    </section>
  );
}
