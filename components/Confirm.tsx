"use client";
import { useEffect, useRef, useState } from "react";
import SecretInput from "@/components/SecretInput";

// In-app confirmation window (replaces the browser's confirm pop-up). Usage: if (!(await ask({ title, points, confirm }))) return;
export type AskOptions = { title: string; body?: string; points?: string[]; confirm?: string; cancel?: string; tone?: "primary" | "danger" | "cost"; cost?: string; pin?: boolean; error?: string };
let opener: ((o: AskOptions) => Promise<boolean>) | null = null;
export function ask(o: AskOptions): Promise<boolean> {
  return opener ? opener(o) : Promise.resolve(window.confirm([o.title, o.body, ...(o.points || [])].filter(Boolean).join("\n\n")));
}

// Short in-app notice at the top centre of the screen: notify("Saved", "ok").
let notifier: ((text: string, tone: "ok" | "error") => void) | null = null;
export function notify(text: string, tone: "ok" | "error" = "ok") { notifier?.(text, tone); }

/** Asks for the paid-actions PIN in an in-app window; null when cancelled. */
let pinOpener: ((o: AskOptions) => Promise<string | null>) | null = null;
export function askPin(o: Partial<AskOptions> = {}): Promise<string | null> {
  return pinOpener ? pinOpener({ title: "Enter the paid-actions PIN", tone: "cost", confirm: "Continue", ...o, pin: true }) : Promise.resolve(null);
}
/** fetch() for actions that call the Anthropic API: if the server asks for the paid-actions PIN, ask for it in the app and retry. */
export async function paidFetch(url: string, init: RequestInit, what = "This action", memo?: { pin?: string }, reason?: string): Promise<Response> {
  let pin = memo?.pin || "", error = ""; // memo: reuse one PIN across several calls (e.g. one search per country)
  for (;;) {
    const res = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), ...(pin ? { "x-paid-pin": pin } : {}) } });
    if (res.status !== 403 && res.status !== 429) { if (memo && pin) memo.pin = pin; return res; }
    const j = await res.clone().json().catch(() => ({}));
    if (!j.needPin || res.status === 429) { notify(j.error || "Not allowed.", "error"); return res; }
    const entered = await askPin({ body: reason || `${what} uses the Anthropic API and costs money, so it needs the paid-actions PIN set by your Super Admin.`, error: pin ? j.error : error || undefined });
    if (entered === null) return res;
    pin = entered; error = j.error;
  }
}

/** Mounted once in the root layout. */
export default function ConfirmHost() {
  const [cur, setCur] = useState<(AskOptions & { resolve: (v: boolean) => void }) | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);
  const [pinVal, setPinVal] = useState("");
  const [pinCur, setPinCur] = useState<(AskOptions & { resolve: (v: string | null) => void }) | null>(null);
  useEffect(() => {
    pinOpener = (o) => new Promise<string | null>((resolve) => { setPinVal(""); setPinCur({ ...o, resolve }); });
    return () => { pinOpener = null; };
  }, []);
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
  const pinEl = pinCur && (
    <div className="wn-backdrop" onClick={() => { pinCur.resolve(null); setPinCur(null); }}>
      <form className="wn ask ask-cost" role="dialog" aria-modal="true" aria-labelledby="pin-title" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (pinVal.trim()) { pinCur.resolve(pinVal.trim()); setPinCur(null); } }}>
        <div className="wn-head">
          <div><p className="wn-kicker">Uses the Anthropic API</p><h2 id="pin-title">{pinCur.title}</h2></div>
          <button type="button" className="wn-close" onClick={() => { pinCur.resolve(null); setPinCur(null); }} aria-label="Close">×</button>
        </div>
        <div className="wn-body ask-body">
          {pinCur.body && <p>{pinCur.body}</p>}
          <label className="pin-field">Paid-actions PIN
            <SecretInput autoFocus inputMode="numeric" value={pinVal} onChange={setPinVal} placeholder="••••••" /></label>
          {pinCur.error && <p className="pin-error">{pinCur.error}</p>}
          <p className="note">Nothing is spent unless the PIN is correct. Ask your Super Admin if you don&apos;t have it.</p>
        </div>
        <div className="wn-foot"><span /><span className="wn-actions">
          <button type="button" className="btn" onClick={() => { pinCur.resolve(null); setPinCur(null); }}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!pinVal.trim()}>{pinCur.confirm || "Continue"}</button></span></div>
      </form>
    </div>);
  if (!cur) return (toastEl || pinEl) ? <>{toastEl}{pinEl}</> : null;
  const tone = cur.tone || "primary";
  return (<>{toastEl}{pinEl}
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
