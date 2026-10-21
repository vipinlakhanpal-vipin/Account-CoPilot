"use client";
import { useEffect, useState } from "react";
import HourlySettings from "@/components/HourlySettings";

// Settings → Aria Setup: everything about how Aria behaves, on one page. Quiet mode (just me, and the Super Admin's default for
// everyone) and the hourly break reminder. Choices are kept in this browser; the roaming Aria and the reminder listen for "aria-prefs-changed".
export default function AriaSetup() {
  const [pref, setPref] = useState<"1" | "0" | null>(null), [def, setDef] = useState<{ quietDefault: boolean; canSet: boolean }>({ quietDefault: false, canSet: false });
  useEffect(() => {
    try { const v = localStorage.getItem("aria-quiet"); if (v === "1" || v === "0") setPref(v); } catch { /* optional */ }
    fetch("/api/aria-prefs", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setDef(j)).catch(() => {});
  }, []);
  const quiet = pref !== null ? pref === "1" : def.quietDefault;
  const setQuiet = (on: boolean) => { setPref(on ? "1" : "0"); try { localStorage.setItem("aria-quiet", on ? "1" : "0"); } catch { /* optional */ } window.dispatchEvent(new Event("aria-prefs-changed")); };
  const setEveryone = (on: boolean) => {
    fetch("/api/aria-prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quietDefault: on }) })
      .then((r) => { if (r.ok) { setDef((d) => ({ ...d, quietDefault: on })); window.dispatchEvent(new Event("aria-prefs-changed")); } }).catch(() => {});
  };
  return (
    <div className="wrap aset">
      <div className="panel">
        <h2>Aria Setup</h2>
        <p className="note">How Aria behaves for you. These choices are kept in this browser.</p>
        <section className="aset-sec">
          <h3>Quiet mode</h3>
          <p className="note">Aria stays calm: no roaming, no teasing or funny messages, and the hourly break stays off. She still shows her menu when you click her.</p>
          <label className="aset-row"><input type="checkbox" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} /> Quiet mode (just me)</label>
          {def.canSet && <label className="aset-row" title="The default for every other user who has not chosen for themselves. Their own switch still wins."><input type="checkbox" checked={def.quietDefault} onChange={(e) => setEveryone(e.target.checked)} /> Quiet for everyone (default for other users)</label>}
        </section>
        <section className="aset-sec">
          <h3>Hourly break</h3>
          <p className="note">Between 10am and 6pm Aria peeks out from behind a clock on each full hour, rings an alarm and tells you to take a short break.</p>
          <HourlySettings />
        </section>
      </div>
    </div>
  );
}
