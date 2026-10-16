"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// A long text in a table cell: the first few words, then an i button that opens the full text. Keeps rows one line tall; the story is one click away.
export function leadOf(text: string, max = 44): string {
  const t = text.replace(/\s+/g, " ").trim();
  const cut = t.split(/[:;]|\.\s|\s[—–]\s/)[0].trim();
  const lead = cut.length >= 12 ? cut : t;
  return lead.length > max ? lead.slice(0, max - 1).trimEnd() + "…" : lead + (lead.length < t.length ? "…" : "");
}

export default function LongText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const away = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".longtext-pop,.longtext-i")) close(); };
    document.addEventListener("keydown", key); document.addEventListener("mousedown", away); window.addEventListener("scroll", close, true); window.addEventListener("resize", close);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", away); window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [open]);
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btn.current) { const r = btn.current.getBoundingClientRect(); setPos({ x: Math.min(Math.max(12, r.left - 8), window.innerWidth - 440), y: r.bottom + 8 }); }
    setOpen((o) => !o);
  };
  return (
    <span className="longtext">
      <span className="longtext-lead">{leadOf(text)}</span>
      <button type="button" ref={btn} className="longtext-i" aria-label="Show the full text" aria-expanded={open} onClick={toggle} title="Show the full text">i</button>
      {open && pos && createPortal(<div className="longtext-pop" role="dialog" style={{ left: pos.x, top: Math.min(pos.y, window.innerHeight - 160) }}>{text}</div>, document.body)}
    </span>
  );
}
