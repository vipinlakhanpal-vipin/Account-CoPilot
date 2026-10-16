"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScanGauge } from "@/components/ScanGauge";
import { expectedSecs, clock } from "@/lib/scanTime";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Follows every "Find contacts" job from click to finish: a flashing "Searching…" card while it runs, then a completion card that says what was added and where to see it.
// Tracked jobs are kept in localStorage so the card survives page changes and reloads.
type Tracked = { slug: string; company: string; region: string; at: number; trigger: string; seamless?: boolean; state?: "done" | "error"; result?: string; took?: number };
type Job = { mode: string; slug?: string; status: string; requested_at: string; started_at?: string; done_at?: string; seamless?: boolean; result?: string };
const KEY = "fc-contacts-jobs";
export const FIND_CONTACTS_EVENT = "find-contacts-queued";

const read = (): Tracked[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const num = (s: string, re: RegExp) => Number(s.match(re)?.[1] || 0);

export default function ContactsJobTracker() {
  const [items, setItems] = useState<Tracked[]>([]);
  const [phase, setPhase] = useState<Record<string, Job>>({});
  const router = useRouter();
  const itemsRef = useRef<Tracked[]>([]);
  itemsRef.current = items;
  const save = useCallback((next: Tracked[]) => { setItems(next); try { localStorage.setItem(KEY, JSON.stringify(next.slice(0, 6))); } catch { /* optional */ } }, []);

  useEffect(() => { setItems(read()); }, []);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<Omit<Tracked, "at"> & { at?: number }>).detail;
      if (!d?.slug) return;
      save([{ ...d, at: d.at || Date.now() }, ...itemsRef.current.filter((x) => x.slug !== d.slug)]);
    };
    window.addEventListener(FIND_CONTACTS_EVENT, on);
    return () => window.removeEventListener(FIND_CONTACTS_EVENT, on);
  }, [save]);

  const waiting = items.some((i) => !i.state);
  useEffect(() => {
    if (!waiting) return;
    let stop = false;
    const poll = async () => {
      try {
        const r = await fetch("/api/engine?only=find", { cache: "no-store" });
        if (!r.ok || stop) return;
        const { jobs = [] } = (await r.json()) as { jobs?: Job[] };
        let changed = false; const ph: Record<string, Job> = {};
        const next = itemsRef.current.map((it) => {
          if (it.state) return it;
          const j = jobs.find((x) => x.mode === "contacts" && x.slug === it.slug && new Date(x.requested_at).getTime() >= it.at - 180000);
          if (!j) return it;
          ph[it.slug] = j;
          if (j.status === "done") { changed = true; return { ...it, state: "done" as const, result: j.result || "", took: j.started_at && j.done_at ? Math.round((new Date(j.done_at).getTime() - new Date(j.started_at).getTime()) / 1000) : undefined }; }
          if (j.status === "error" || j.status === "cancelled") { changed = true; return { ...it, state: "error" as const, result: j.result || "" }; }
          return it;
        });
        setPhase((p) => ({ ...p, ...ph }));
        if (changed) { save(next); router.refresh(); }
      } catch { /* try again on the next tick */ }
    };
    poll();
    const t = setInterval(poll, 6000);
    return () => { stop = true; clearInterval(t); };
  }, [waiting, save, router]);

  if (!items.length) return null;
  return (
    <div className="fcj-stack" role="region" aria-label="Find contacts progress">
      {items.map((it) => {
        const open = `/?open=${encodeURIComponent(it.slug)}&country=${encodeURIComponent(it.region)}`;
        const close = <button type="button" className="fcj-x" aria-label="Dismiss" onClick={() => save(items.filter((x) => x.slug !== it.slug))}>×</button>;
        if (!it.state) {
          const pj = phase[it.slug]; const daily = it.trigger !== "ok" && pj?.status !== "running";
          return (
            <div key={it.slug} className={`fcj-card ${daily ? "wait" : "busy"}`} role="status" aria-live="polite">
              <div className="fcj-body">
                <ScanGauge label={`Searching ${it.company} contacts${it.seamless ? " (web + Seamless)" : ""}`} requestedAt={pj?.requested_at || new Date(it.at).toISOString()} startedAt={pj?.started_at}
                  expectedSecs={expectedSecs({ mode: "contacts", seamless: it.seamless })} />
                <span>{daily ? "The instant trigger is off, so this starts at the next daily run (6am Dubai)." : `${it.seamless ? "Reading public web pages and Seamless records" : "Reading public web pages"} for named people with an email, phone or LinkedIn link. Usually a few minutes. You can keep working; this card updates by itself.`}</span>
              </div>
              {close}
            </div>);
        }
        if (it.state === "error") return (
          <div key={it.slug} className="fcj-card bad" role="status">
            <span className="fcj-icon">!</span>
            <div className="fcj-body"><b>The contact search for {it.company} did not finish</b><span>{it.result || "Try Find contacts again in a few minutes."}</span></div>{close}
          </div>);
        const added = num(it.result || "", /(\d+)\s+contacts?\s+added/i), updated = num(it.result || "", /(\d+)\s+updated/i);
        return (
          <div key={it.slug} className="fcj-card done" role="status">
            <span className="fcj-icon">✓</span>
            <div className="fcj-body">
              <b>Search completed for {it.company}{it.took ? ` · took ${clock(it.took)}` : ""}</b>
              {added + updated > 0 ? <>
                <span>{added} new contact{added === 1 ? "" : "s"} added{updated ? `, ${updated} existing updated` : ""} in your database. Each has its source page saved. You will find {added + updated === 1 ? "it" : "them"}:</span>
                <ul>
                  <li>On the account page, in the <b>Stakeholders</b> list: look for the green <b className="new-tag">NEW</b> badge beside the name (source: Public web)</li>
                  <li>In <b>Accounts → Stakeholders</b>, with the same NEW badge (or filter Source / Channel)</li>
                  <li>In the PDF report and the Excel contact list for this company, and when you ask Aria</li>
                </ul>
                <Link className="fcj-open" href={open} onClick={() => save(items.filter((x) => x.slug !== it.slug))}>Open {it.company} →</Link>
              </> : <span>No new public email, phone or LinkedIn was found, so nothing was added. People already on file are never duplicated, and Claude never guesses an email.</span>}
            </div>{close}
          </div>);
      })}
    </div>
  );
}
