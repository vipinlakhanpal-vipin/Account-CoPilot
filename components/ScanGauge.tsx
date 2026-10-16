"use client";
import { useEffect, useState } from "react";
import { clock } from "@/lib/scanTime";

// One look for every free cloud search in the app: a running timer, a green gauge that fills towards the usual running time, and a green tick when it is done.
export function ScanGauge({ label, requestedAt, startedAt, expectedSecs, extra, compact = false }: { label: string; requestedAt: string; startedAt?: string; expectedSecs: number; extra?: string; compact?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const running = !!startedAt;
  const secs = Math.max(0, Math.round((now - new Date(startedAt || requestedAt).getTime()) / 1000));
  const pct = running ? Math.min(95, Math.round((secs / expectedSecs) * 95)) : 0;
  const note = running ? (secs > expectedSecs * 1.5 ? "taking longer than usual" : `usually about ${Math.max(1, Math.round(expectedSecs / 60))} min`) : "starts within a minute or two";
  return (
    <span className={`gauge${compact ? " compact" : ""}`} role="status" aria-live="polite">
      <span className="gauge-top"><i className="fcj-dot" aria-hidden="true" /><em>{running ? label : "Waiting…"}</em><b>{clock(secs)}</b></span>
      <span className="gauge-bar" aria-hidden="true"><i className={running ? "" : "wait"} style={{ width: `${running ? Math.max(4, pct) : 100}%` }} /></span>
      {!compact && <small>{note}{extra || ""}</small>}
    </span>
  );
}

export function DoneTick({ text, compact = false }: { text: string; compact?: boolean }) {
  return <span className={`gauge-done${compact ? " compact" : ""}`} role="status"><i aria-hidden="true">✓</i><em>{text}</em></span>;
}
