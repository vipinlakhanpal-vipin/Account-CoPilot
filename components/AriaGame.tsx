"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Aria floats in the left panel and asks to be hit. A click (the "hit") shatters her into nine jigsaw pieces and she asks to be rebuilt in 30 seconds.
// Drag each piece to its place on the board; a piece clicks into place when it is close. Best time is kept in this browser.
const N = 3, S = 66, PAD = Math.round(S * 0.32), LIMIT = 30;
const SIZE = N * S;
const STAGE_W = 560, STAGE_H = 400, BOARD_X = 36, BOARD_Y = 96;
type Piece = { id: number; r: number; c: number; x: number; y: number; locked: boolean; z: number };

// Edge signs: +1 means the knob points forward (down for a horizontal edge, right for a vertical one). Fixed pattern, so the pieces always fit.
const H = [[0, 0, 0], [1, -1, 1], [-1, 1, -1], [0, 0, 0]];
const V = [[0, 1, -1, 0], [0, -1, 1, 0], [0, 1, -1, 0]];
function piecePath(r: number, c: number) {
  const top = -H[r][c], right = V[r][c + 1], bottom = H[r + 1][c], left = -V[r][c];
  const a = Math.round(S * 0.38), b = Math.round(S * 0.62), rad = (S * 0.17).toFixed(1);
  const arc = (o: number, x: number, y: number) => (o === 0 ? `L${x} ${y}` : `A${rad} ${rad} 0 1 ${o > 0 ? 1 : 0} ${x} ${y}`);
  const p = PAD, q = PAD + S;
  return [`M${p} ${p}`, `L${p + a} ${p}`, arc(top, p + b, p), `L${q} ${p}`,
    `L${q} ${p + a}`, arc(right, q, p + b), `L${q} ${q}`,
    `L${p + b} ${q}`, arc(bottom, p + a, q), `L${p} ${q}`,
    `L${p} ${p + b}`, arc(left, p, p + a), `L${p} ${p}`, "Z"].join(" ");
}

// The picture: Aria's robot face on purple, drawn in a 3S square.
function Art() {
  const k = SIZE / 24;
  return (
    <g>
      <rect x="0" y="0" width={SIZE} height={SIZE} fill="#5B4BC4" />
      <circle cx={SIZE * 0.2} cy={SIZE * 0.18} r={SIZE * 0.34} fill="#7A67E8" opacity=".55" />
      <circle cx={SIZE * 0.85} cy={SIZE * 0.9} r={SIZE * 0.3} fill="#3B2F9A" opacity=".6" />
      <g transform={`scale(${k})`}>
        <circle cx="12" cy="2.9" r="1.35" fill="#FFE08A" />
        <path d="M12 4.2v2.3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        <rect x="4.6" y="6.4" width="14.8" height="11" rx="3.4" fill="#fff" />
        <rect x="2.3" y="9.6" width="1.9" height="4.6" rx="0.95" fill="#fff" />
        <rect x="19.8" y="9.6" width="1.9" height="4.6" rx="0.95" fill="#fff" />
        <circle cx="9.1" cy="11.4" r="1.7" fill="#5B4BC4" />
        <circle cx="14.9" cy="11.4" r="1.7" fill="#5B4BC4" />
        <path d="M9.4 14.9h5.2" stroke="#19D3B0" strokeWidth="1.6" strokeLinecap="round" />
        <rect x="8" y="18.4" width="8" height="2.6" rx="1.3" fill="#fff" />
      </g>
    </g>
  );
}

function PieceSvg({ r, c }: { r: number; c: number }) {
  const id = `ap-${r}-${c}`, d = piecePath(r, c), w = S + PAD * 2;
  return (
    <svg width={w} height={w} viewBox={`0 0 ${w} ${w}`} style={{ display: "block", overflow: "visible", pointerEvents: "none" }} aria-hidden="true">
      <defs><clipPath id={id}><path d={d} /></clipPath></defs>
      <g clipPath={`url(#${id})`}><g transform={`translate(${PAD - c * S} ${PAD - r * S})`}><Art /></g></g>
      <path d={d} fill="none" stroke="rgba(10,5,50,.55)" strokeWidth="1.2" />
    </svg>
  );
}

const slot = (r: number, c: number) => ({ x: BOARD_X + c * S - PAD, y: BOARD_Y + r * S - PAD });

export default function AriaGame({ onChat }: { onChat: () => void }) {
  const [menu, setMenu] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!menu) return; const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setMenu(false); }; document.addEventListener("mousedown", away); return () => document.removeEventListener("mousedown", away); }, [menu]);
  const [phase, setPhase] = useState<"idle" | "punched" | "play" | "won" | "lost">("idle");
  const [open, setOpen] = useState(false);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [left, setLeft] = useState(LIMIT);
  const [took, setTook] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const t0 = useRef(0), zTop = useRef(10), drag = useRef<{ id: number; dx: number; dy: number } | null>(null), stage = useRef<HTMLDivElement>(null);
  useEffect(() => { try { const b = Number(localStorage.getItem("aria-puzzle-best")); if (b) setBest(b); } catch { /* optional */ } }, []);

  const start = useCallback(() => {
    const solved: Piece[] = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) solved.push({ id: r * N + c, r, c, ...slot(r, c), locked: false, z: 1 });
    setPieces(solved); setLeft(LIMIT); setTook(0); setPhase("play"); t0.current = Date.now();
    // the shatter: from the solved picture, every piece flies to a random spot on the right
    setTimeout(() => setPieces(solved.map((p, i) => ({ ...p, x: 300 + Math.random() * 190 - (i % 2) * 10, y: 70 + Math.random() * 260, z: 2 + i }))), 60);
  }, []);
  const hit = () => { setMenu(false); setPhase("punched"); setOpen(true); setTimeout(start, 650); };
  const close = () => { setOpen(false); setPhase("idle"); };

  useEffect(() => {
    if (phase !== "play") return;
    const t = setInterval(() => {
      const s = (Date.now() - t0.current) / 1000;
      setLeft(Math.max(0, LIMIT - s));
      if (s >= LIMIT) setPhase("lost");
    }, 100);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => {
    if (phase === "play" && pieces.length && pieces.every((p) => p.locked)) {
      const s = Math.round(((Date.now() - t0.current) / 1000) * 10) / 10;
      setTook(s); setPhase("won");
      setBest((b) => { const nb = b === null || s < b ? s : b; try { localStorage.setItem("aria-puzzle-best", String(nb)); } catch { /* optional */ } return nb; });
    }
  }, [pieces, phase]);

  const down = (e: React.PointerEvent, p: Piece) => {
    if (phase !== "play" || p.locked) return;
    const box = stage.current!.getBoundingClientRect();
    drag.current = { id: p.id, dx: e.clientX - box.left - p.x, dy: e.clientY - box.top - p.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    zTop.current += 1; const z = zTop.current;
    setPieces((all) => all.map((x) => (x.id === p.id ? { ...x, z } : x)));
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const box = stage.current!.getBoundingClientRect();
    const x = Math.min(STAGE_W - S, Math.max(-PAD, e.clientX - box.left - d.dx)), y = Math.min(STAGE_H - S, Math.max(-PAD, e.clientY - box.top - d.dy));
    setPieces((all) => all.map((p) => (p.id === d.id ? { ...p, x, y } : p)));
  };
  const up = () => {
    const d = drag.current; drag.current = null; if (!d) return;
    setPieces((all) => all.map((p) => { if (p.id !== d.id) return p; const s = slot(p.r, p.c); return Math.hypot(p.x - s.x, p.y - s.y) < 18 ? { ...p, ...s, locked: true, z: 1 } : p; }));
  };
  const placed = pieces.filter((p) => p.locked).length;
  const bar = useMemo(() => Math.round((left / LIMIT) * 100), [left]);

  return (
    <>
      <div className="agame" ref={wrap}>
        {phase === "idle" && !menu && <span className="agame-bubble" aria-hidden="true">Click me!</span>}
        <button type="button" className={`agame-bot${phase === "punched" ? " punched" : ""}`} onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="Aria: ask a question, or play the 30-second puzzle">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="2.9" r="1.35" fill="#FFE08A" /><path d="M12 4.2v2.3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
            <rect x="4.6" y="6.4" width="14.8" height="11" rx="3.4" fill="#fff" /><rect x="2.3" y="9.6" width="1.9" height="4.6" rx="0.95" fill="#fff" /><rect x="19.8" y="9.6" width="1.9" height="4.6" rx="0.95" fill="#fff" />
            <circle cx="9.1" cy="11.4" r="1.7" fill="#5B4BC4" /><circle cx="14.9" cy="11.4" r="1.7" fill="#5B4BC4" /><path d="M9.4 14.9h5.2" stroke="#19D3B0" strokeWidth="1.6" strokeLinecap="round" /><rect x="8" y="18.4" width="8" height="2.6" rx="1.3" fill="#fff" />
          </svg>
        </button>
        {menu && (
          <div className="agame-menu" role="menu">
            <button type="button" role="menuitem" className="agame-opt" onClick={() => { setMenu(false); onChat(); }}>Ask Aria</button>
            <button type="button" role="menuitem" className="agame-opt" onClick={hit}>Hit me! (30 s puzzle)</button>
          </div>)}
      </div>
      {open && typeof document !== "undefined" && createPortal(
        <div className="agame-back" role="dialog" aria-modal="true" aria-label="Rebuild Aria">
          <div className="agame-card">
            <div className="agame-head">
              <div><b>{phase === "punched" ? "Ouch!" : phase === "won" ? "You built me!" : phase === "lost" ? "Time's up" : "Build me now!"}</b>
                <span>{phase === "play" ? "Drag the pieces onto the board. 30 seconds." : phase === "won" ? `Rebuilt in ${took}s${best !== null ? ` · best ${best}s` : ""}` : phase === "lost" ? `${placed} of 9 pieces placed. Want another go?` : "Hold on…"}</span></div>
              <button type="button" className="btn tiny" onClick={close}>Close</button>
            </div>
            <div className="agame-meter" aria-hidden="true"><i style={{ width: `${phase === "won" ? 100 : bar}%`, background: left < 8 && phase === "play" ? "#D92D20" : undefined }} /></div>
            <div className="agame-info"><span>{phase === "play" ? `${Math.ceil(left)} s left` : phase === "won" ? "Brain: warmed up" : ""}</span><span>{placed} / 9 placed</span></div>
            <div className="agame-stage" ref={stage} style={{ width: STAGE_W, height: STAGE_H }} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
              <div className="agame-board" style={{ left: BOARD_X, top: BOARD_Y, width: SIZE, height: SIZE }} aria-hidden="true" />
              {pieces.map((p) => (
                <div key={p.id} className={`agame-piece${p.locked ? " locked" : ""}${drag.current?.id === p.id ? " drag" : ""}`}
                  style={{ transform: `translate(${p.x}px,${p.y}px)`, zIndex: p.z }} onPointerDown={(e) => down(e, p)}><PieceSvg r={p.r} c={p.c} /></div>))}
              {(phase === "won" || phase === "lost") && (
                <div className="agame-end"><button type="button" className="btn primary" onClick={start}>{phase === "won" ? "Beat my time" : "Try again"}</button></div>)}
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
