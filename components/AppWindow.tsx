"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// A floating window in Aria's style: drag the header, drag any edge or corner to resize, Expand to fill the screen, Close. It does not dim or block the page behind it,
// so a list can stay open beside the account pages. Used by Buying signals and Market intelligence.
export default function AppWindow({ open, onClose, title, subtitle, badge, actions, slot = 0, children }: { open: boolean; onClose: () => void; title: string; subtitle: string; badge: string; actions?: ReactNode; slot?: number; children: ReactNode }) {
  const [wide, setWide] = useState(false);
  const [mini, setMini] = useState(false); // minimized: a small bar in the corner; the content stays mounted, so scans keep running and updating
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const winRef = useRef<HTMLElement>(null);

  const startDrag = (mode: string) => (e: React.PointerEvent) => {
    if (e.button !== 0 || !winRef.current || mini) return;
    if (mode === "move" && (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const r = winRef.current.getBoundingClientRect();
    const o = { x: r.left, y: r.top, w: r.width, h: r.height };
    const sx = e.clientX, sy = e.clientY, MIN_W = 420, MIN_H = 360;
    setWide(false); setRect(o);
    document.body.style.userSelect = "none";
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy, vw = window.innerWidth, vh = window.innerHeight;
      let { x, y, w, h } = o;
      if (mode === "move") { x = Math.min(Math.max(o.x + dx, 140 - o.w), vw - 140); y = Math.min(Math.max(o.y + dy, 0), vh - 56); }
      else {
        if (mode.includes("e")) w = Math.min(Math.max(MIN_W, o.w + dx), vw - o.x);
        if (mode.includes("s")) h = Math.min(Math.max(MIN_H, o.h + dy), vh - o.y);
        if (mode.includes("w")) { const nw = Math.min(Math.max(MIN_W, o.w - dx), o.x + o.w); x = o.x + o.w - nw; w = nw; }
        if (mode.includes("n")) { const nh = Math.min(Math.max(MIN_H, o.h - dy), o.y + o.h); y = o.y + o.h - nh; h = nh; }
      }
      setRect({ x, y, w, h });
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); document.removeEventListener("pointercancel", onUp);
      document.body.style.userSelect = "";
    };
    document.addEventListener("pointermove", onMove); document.addEventListener("pointerup", onUp); document.addEventListener("pointercancel", onUp);
  };
  useEffect(() => { if (!open) setMini(false); }, [open]); // reopening always starts at normal size
  useEffect(() => {
    const fit = () => setRect((r) => r && { ...r, x: Math.min(Math.max(r.x, 140 - r.w), window.innerWidth - 140), y: Math.min(Math.max(r.y, 0), window.innerHeight - 56) });
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !mini) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, mini]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className={`aria-backdrop appwin-bd${mini ? " mini" : ""}`}>
      <section ref={winRef} className={`aria-window appwin${wide ? " wide" : ""}${mini ? " mini" : ""}`} style={mini ? ({ "--slot": slot } as React.CSSProperties) : rect ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h } : undefined} role="dialog" aria-label={title}>
        {["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((d) => <span key={d} className={`aria-rz ${d}`} onPointerDown={startDrag(d)} aria-hidden="true" />)}
        <header className="aria-top" onPointerDown={startDrag("move")} title="Drag to move the window anywhere. Drag any edge or corner to resize it.">
          <span className="aria-badge" aria-hidden="true">{badge}</span>
          <div className="aria-title"><b>{title}</b><small>{subtitle}</small><small className="aria-hint">✥ Drag me anywhere on the screen, and resize me from any edge or corner</small></div>
          <div className="aria-top-actions">
            {actions}
            <button type="button" className="aria-home aria-minbtn aria-ic" onClick={() => setMini((m) => !m)} aria-label={mini ? "Restore the window" : "Minimize the window"} title={mini ? "Restore the window (+)" : "Minimize: shrink to a small bar so you can work on other things; it keeps running (–)"}>{mini ? "+" : "–"}</button>
            {!mini && <button type="button" className="aria-home" onClick={() => { setRect(null); setWide((w) => !w); }} aria-pressed={wide} title="Make the window fill the screen, or back to its normal size">{wide ? "Shrink" : "Expand"}</button>}
            <button type="button" className="aria-home aria-close" onClick={onClose}>Close</button>
          </div>
        </header>
        <div className="aria-body appwin-body">{children}</div>
      </section>
    </div>, document.body);
}
