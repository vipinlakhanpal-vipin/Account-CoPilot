"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Tier = { tier: string; label: string; examples: string };

export default function TierSettings({ initial }: { initial: Tier[] }) {
  const [tiers, setTiers] = useState<Tier[]>(initial);
  const [msg, setMsg] = useState("");
  const set = (i: number, k: keyof Tier, v: string) => setTiers(tiers.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  async function save() {
    const { error } = await supabaseBrowser().from("settings").upsert({ key: "contact_tiers", value: tiers, updated_at: new Date().toISOString() });
    setMsg(error ? `Could not save: ${error.message}` : "Saved.");
  }
  return (
    <section className="view">
      <div className="panel">
        <h2>Contact tiers</h2>
        <p className="note">Tiers are an internal sales classification, not a fact. Edit the gold-framed fields; the research engine and your team use these definitions.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
          {tiers.map((t, i) => (
            <div key={t.tier} className="form-grid" style={{ gridTemplateColumns: "90px 1fr 2fr" }}>
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
