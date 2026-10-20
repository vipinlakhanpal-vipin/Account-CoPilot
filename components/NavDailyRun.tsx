"use client";
import { useState } from "react";
import EngineActivity from "@/components/EngineActivity";
import ScheduledRunHistory from "@/components/ScheduledRunHistory";

// The bell as a page: what the daily run planned for each Active region and did (priority, plan, latest run, last seven days), and the run-by-run history.
export default function NavDailyRun() {
  const [view, setView] = useState<"activity" | "runs">("activity");
  return (
    <>
      <h1 className="nav-h">Daily run</h1>
      <p className="note">What the engine does every morning at 6am Dubai, region by region. The bell in the top bar still shows the red badge when a new run is posted.</p>
      <div className="seg-toggle-row">
        <div className="seg-toggle" role="group" aria-label="Daily run view">
          <button type="button" aria-pressed={view === "activity"} onClick={() => setView("activity")}>Today&apos;s plan and activity</button>
          <button type="button" aria-pressed={view === "runs"} onClick={() => setView("runs")}>Run history</button>
        </div>
      </div>
      {view === "activity" ? <EngineActivity /> : <ScheduledRunHistory />}
    </>
  );
}
