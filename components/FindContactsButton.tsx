"use client";
import { useEffect, useRef, useState } from "react";
import { queueFindContacts } from "@/lib/findContactsClient";

// Find contacts: one button, two ways. Free = public web pages only. With Seamless = also Seamless records (uses Seamless credits, about 1 per person, at most 5).
export default function FindContactsButton({ slug, region, company, className = "btn tiny", label = "Find contacts", quiet = false, onQueued }: { slug: string; region: string; company: string; className?: string; label?: string; quiet?: boolean; onQueued?: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  const go = (seamless: boolean) => { setOpen(false); queueFindContacts(slug, region, company, seamless, quiet).then((ok) => { if (ok) onQueued?.(); }); };
  return (
    <span className="fc-wrap" ref={box}>
      <button type="button" className={className} aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>{label} ▾</button>
      {open && (
        <span className="fc-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => go(false)}><b>Free</b><small>Public web pages only. No cost.</small></button>
          <button type="button" role="menuitem" onClick={() => go(true)}><b>Free + Seamless</b><small>Also Seamless records. Uses Seamless credits (about 1 per person, at most 5).</small></button>
        </span>)}
    </span>
  );
}
