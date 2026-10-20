"use client";
import { useState } from "react";
import EngineBell from "@/components/EngineBell";
import EngineActivity from "@/components/EngineActivity";
import ScheduledRunHistory from "@/components/ScheduledRunHistory";

// The bell as a page. Daily Run Summary is the bell's own content (today's plan, then each run's company table, by region); Engine activity is the region overview with the seven-day grid; Run history is the run-by-run list.
export default function NavDailyRun() {
  const [view, setView] = useState<"summary" | "activity" | "runs">("summary");
  return (
    <>
      <h1 className="nav-h">Daily run</h1>
      <p className="note">What the engine does every morning at 6am Dubai, region by region. The bell in the top bar still shows the red badge when a new run is posted.</p>
      <div className="seg-toggle-row">
        <div className="seg-toggle" role="group" aria-label="Daily run view">
          <button type="button" aria-pressed={view === "summary"} onClick={() => setView("summary")}>Daily Run Summary</button>
          <button type="button" aria-pressed={view === "activity"} onClick={() => setView("activity")}>Engine activity</button>
          <button type="button" aria-pressed={view === "runs"} onClick={() => setView("runs")}>Run history</button>
        </div>
      </div>
      {view === "summary" ? <EngineBell inline /> : view === "activity" ? <EngineActivity /> : <ScheduledRunHistory />}
    </>
  );
}
