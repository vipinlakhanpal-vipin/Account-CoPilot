"use client";
import { useEffect, useRef, useState } from "react";

// In-app confirmation window (replaces the browser's confirm pop-up). Usage: if (!(await ask({ title, points, confirm }))) return;
export type AskOptions = { title: string; body?: string; points?: string[]; confirm?: string; cancel?: string; tone?: "primary" | "danger" | "cost"; cost?: string };
let opener: ((o: AskOptions) => Promise<boolean>) | null = null;
export function ask(o: AskOptions): Promise<boolean> {
  return opener ? opener(o) : Promise.resolve(window.confirm([o.title, o.body, ...(o.points || [])].filter(Boolean).join("\n\n")));
}

// Short in-app notice at the top centre of the screen: notify("Saved", "ok").
let notifier: ((text: string, tone: "ok" | "error") => void) | null = null;
export function notify(text: string, tone: "ok" | "error" = "ok") { notifier?.(text, tone); }

/** Mounted once in the root layout. */
export default function ConfirmHost() {
  const [cur, setCur] = useState<(AskOptions & { resolve: (v: boolean) => void }) | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    notifier = (text, tone) => { setToast({ text, tone }); clearTimeout(t); t = setTimeout(() => setToast(null), 6000); };
    return () => { notifier = null; clearTimeout(t); };
  }, []);
  useEffect(() => {
    opener = (o) => new Promise<boolean>((resolve) => setCur({ ...o, resolve }));
    return () => { opener = null; };
  }, []);
  const done = (v: boolean) => { cur?.resolve(v); setCur(null); };
  useEffect(() => {
    if (!cur) return;
    okRef.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") done(false); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const toastEl = toast && (
    <div className={`app-toast ${toast.tone}`} role="status" aria-live="polite"><span>{toast.tone === "ok" ? "✓" : "!"}</span>{toast.text}
      <button type="button" aria-label="Close" onClick={() => setToast(null)}>×</button></div>);
  if (!cur) return toastEl || null;
  const tone = cur.tone || "primary";
  return (<>{toastEl}
    <div className="wn-backdrop" onClick={() => done(false)}>
      <div className={`wn ask ask-${tone}`} role="alertdialog" aria-modal="true" aria-labelledby="ask-title" onClick={(e) => e.stopPropagation()}>
        <div className="wn-head">
          <div><p className="wn-kicker">{tone === "danger" ? "Please confirm" : tone === "cost" ? "Uses the Anthropic API" : "Confirm"}</p><h2 id="ask-title">{cur.title}</h2></div>
          <button type="button" className="wn-close" onClick={() => done(false)} aria-label="Close">×</button>
        </div>
        <div className="wn-body ask-body">
          {cur.body && <p>{cur.body}</p>}
          {cur.points?.length ? <ul>{cur.points.map((p) => <li key={p}>{p}</li>)}</ul> : null}
          {cur.cost && <p className="ask-cost"><b>Cost impact:</b> {cur.cost}</p>}
        </div>
        <div className="wn-foot">
          <span />
          <span className="wn-actions">
            <button type="button" className="btn" onClick={() => done(false)}>{cur.cancel || "Cancel"}</button>
            <button type="button" ref={okRef} className={`btn ${tone === "danger" ? "danger" : "primary"}`} onClick={() => done(true)}>{cur.confirm || "Confirm"}</button>
          </span>
        </div>
      </div>
    </div></>
  );
}
