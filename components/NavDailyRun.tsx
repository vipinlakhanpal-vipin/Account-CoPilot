"use client";
import { useEffect, useState } from "react";
import EngineBell from "@/components/EngineBell";
import EngineActivity from "@/components/EngineActivity";
import ScheduledRunHistory from "@/components/ScheduledRunHistory";

// The bell as a page. Daily Run Summary is the bell's own content (today's plan, then each run's company table, by region); Engine activity is the region overview with the seven-day grid; Run history is the run-by-run list.
export default function NavDailyRun() {
  const [view, setView] = useState<"summary" | "activity" | "runs">("summary");
  // How many runs were posted since you last looked (the blue pill on the left panel's Daily run item), counted once on arrival and shown on the tabs where those runs are listed.
  const [fresh, setFresh] = useState(0);
  useEffect(() => {
    let seen = ""; try { seen = localStorage.getItem("engine-seen") || ""; } catch { /* optional */ }
    fetch("/api/engine?only=log", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setFresh((j.entries || []).filter((e: { at: string }) => e.at > seen).length)).catch(() => {});
  }, []);
  const pill = fresh > 0 ? <span className="navbadge new tabnew">{fresh} new</span> : null;
  return (
    <>
      <h1 className="nav-h">Daily run</h1>
      <p className="note">What the engine does every morning at 6am Dubai, region by region. When a new run is posted, the left panel shows a blue "new" pill on Daily run, and the same pill sits on the tabs below where that run is listed: Daily Run Summary (the run and its companies) and Run history.</p>
      <div className="seg-toggle-row">
        <div className="seg-toggle" role="group" aria-label="Daily run view">
          <button type="button" aria-pressed={view === "summary"} onClick={() => setView("summary")}>Daily Run Summary{pill}</button>
          <button type="button" aria-pressed={view === "activity"} onClick={() => setView("activity")}>Engine activity</button>
          <button type="button" aria-pressed={view === "runs"} onClick={() => setView("runs")}>Run history{pill}</button>
        </div>
      </div>
      {view === "summary" ? <EngineBell inline /> : view === "activity" ? <EngineActivity /> : <ScheduledRunHistory />}
    </>
  );
}
