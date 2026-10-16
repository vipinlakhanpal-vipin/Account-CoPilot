"use client";
import { useEffect, useState } from "react";
import { clock } from "@/lib/scanTime";

// One look for every free cloud search in the app: a running timer, a green gauge that fills towards the usual running time, and a green tick when it is done.
export function ScanGauge({ label, requestedAt, startedAt, expectedSecs, extra, compact = false, tile = false }: { label: string; requestedAt: string; startedAt?: string; expectedSecs: number; extra?: string; compact?: boolean; tile?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const running = !!startedAt;
  const secs = Math.max(0, Math.round((now - new Date(startedAt || requestedAt).getTime()) / 1000));
  const pct = running ? Math.min(95, Math.round((secs / expectedSecs) * 95)) : 0;
  const note = running ? (secs > expectedSecs * 1.5 ? "taking longer than usual" : `usually about ${Math.max(1, Math.round(expectedSecs / 60))} min`) : "starts within a minute or two";
  if (tile) { // inside a dashboard-style tile: the tile keeps its size; the clock sits in the corner and the gauge is a thin line on the bottom edge
    return (
      <span className="gauge tile" role="status" aria-live="polite" title={`${label}${running ? ` · usually about ${Math.max(1, Math.round(expectedSecs / 60))} min` : " · waiting for a session"}${extra || ""}`}>
        <span className="gauge-clock"><i className="fcj-dot" aria-hidden="true" />{running ? clock(secs) : "waiting"}</span>
        <span className="gauge-bar" aria-hidden="true"><i className={running ? "" : "wait"} style={{ width: `${running ? Math.max(4, pct) : 100}%` }} /></span>
      </span>
    );
  }
  return (
    <span className={`gauge${compact ? " compact" : ""}`} role="status" aria-live="polite">
      <span className="gauge-top"><i className="fcj-dot" aria-hidden="true" /><em>{running ? label : "Waiting…"}</em><b>{clock(secs)}</b></span>
      <span className="gauge-bar" aria-hidden="true"><i className={running ? "" : "wait"} style={{ width: `${running ? Math.max(4, pct) : 100}%` }} /></span>
      {!compact && <small>{note}{extra || ""}</small>}
    </span>
  );
}

export function DoneTick({ text, compact = false, tile = false }: { text: string; compact?: boolean; tile?: boolean }) {
  return <span className={`gauge-done${compact ? " compact" : ""}${tile ? " tile" : ""}`} role="status"><i aria-hidden="true">✓</i><em>{text}</em></span>;
}
