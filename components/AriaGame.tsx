"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AriaMiniGames, { type MiniGame } from "@/components/AriaMiniGames";

// Aria floats in the left panel and asks to be hit. A click (the "hit") shatters her into nine jigsaw pieces and she asks to be rebuilt in 60 seconds, with a different picture each time (five designs).
// Drag each piece to its place on the board; a piece clicks into place when it is close. Best time is kept in this browser.
const N = 3, S = 66, PAD = Math.round(S * 0.32), LIMIT = 60, DESIGNS = 5;
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

// The pictures: five designs, each drawn on a 24 x 24 grid and scaled to the 3S square. A different one comes up each game.
function Robot({ bg, glow, eye, mouth }: { bg: string; glow: string; eye: string; mouth: string }) {
  return (
    <>
      <rect width="24" height="24" fill={bg} />
      <circle cx="4.8" cy="4.3" r="8.2" fill={glow} opacity=".55" />
      <circle cx="20.4" cy="21.6" r="7.2" fill="#000" opacity=".22" />
      <circle cx="12" cy="2.9" r="1.35" fill="#FFE08A" />
      <path d="M12 4.2v2.3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="4.6" y="6.4" width="14.8" height="11" rx="3.4" fill="#fff" />
      <rect x="2.3" y="9.6" width="1.9" height="4.6" rx="0.95" fill="#fff" />
      <rect x="19.8" y="9.6" width="1.9" height="4.6" rx="0.95" fill="#fff" />
      <circle cx="9.1" cy="11.4" r="1.7" fill={eye} />
      <circle cx="14.9" cy="11.4" r="1.7" fill={eye} />
      <path d="M9.4 14.9h5.2" stroke={mouth} strokeWidth="1.6" strokeLinecap="round" />
      <rect x="8" y="18.4" width="8" height="2.6" rx="1.3" fill="#fff" />
    </>
  );
}
function Skyline() {
  const b: [number, number, number, number][] = [[1.5, 15, 3, 9], [4.5, 13, 2.5, 11], [8.6, 16, 3, 8], [12, 12, 2.6, 12], [15, 17, 3, 7], [18.4, 14, 3, 10], [21.4, 18, 2.6, 6]];
  return (
    <>
      <rect width="24" height="24" fill="#1B2A5A" />
      <rect y="8" width="24" height="6" fill="#E8678A" opacity=".5" />
      <rect y="13" width="24" height="7" fill="#F4A259" opacity=".6" />
      <circle cx="17" cy="13" r="3.4" fill="#FFD76A" />
      {b.map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} fill="#0F1738" />)}
      <path d="M6.2 24V12l.8-9 .8 9v12Z" fill="#0F1738" />
      {[[2.4, 17], [5.4, 15.5], [9.4, 18], [12.8, 14], [16, 19.5], [19.2, 16], [22.2, 20]].map(([x, y], i) => <rect key={i} x={x} y={y} width=".8" height=".8" fill="#FFD76A" opacity=".85" />)}
      <path d="M0 22q6-3 12 0t12-1v3H0Z" fill="#C9803F" />
    </>
  );
}
function Circuit() {
  return (
    <>
      <rect width="24" height="24" fill="#12203B" />
      <g fill="none" stroke="#19D3B0" strokeWidth=".55" strokeLinecap="round" strokeLinejoin="round">
        <path d="M0 5h6l3 3h3" /><path d="M0 12h5l2 2" /><path d="M0 19h8l3-3" /><path d="M24 4h-6l-3 3h-3" /><path d="M24 12h-5l-2-2" /><path d="M24 20h-7l-3-3h-2" /><path d="M8 0v6" /><path d="M16 24v-6" /><path d="M12 0v5" /><path d="M5 24v-5" />
      </g>
      <rect x="7.6" y="7.6" width="8.8" height="8.8" rx="2" fill="#1D2F55" stroke="#7A67E8" strokeWidth=".7" />
      <rect x="10" y="10" width="4" height="4" rx=".9" fill="#7A67E8" />
      {[[6, 5], [5, 12], [8, 19], [18, 4], [19, 12], [17, 20], [8, 6], [16, 18], [12, 5], [5, 19]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r=".85" fill="#FFE08A" />)}
    </>
  );
}
function Dhow() {
  return (
    <>
      <rect width="24" height="24" fill="#7FD1E8" />
      <circle cx="18.5" cy="6" r="3" fill="#FFE08A" />
      <rect y="14" width="24" height="10" fill="#1B6CA8" />
      <g fill="none" stroke="#fff" strokeWidth=".5" strokeLinecap="round" opacity=".55"><path d="M1 17q2-1 4 0t4 0" /><path d="M13 20q2-1 4 0t4 0" /><path d="M3 22q2-1 4 0t4 0" /></g>
      <path d="M12 5.5V15" stroke="#4A2A12" strokeWidth=".6" />
      <path d="M12.4 6l5.2 8.2h-5.2Z" fill="#fff" />
      <path d="M11.6 8l-4 6.2h4Z" fill="#F4E6C8" />
      <path d="M5.6 14.6h13l-2.2 3.6H7.8Z" fill="#6B3F1D" />
    </>
  );
}
function Art({ v }: { v: number }) {
  const k = SIZE / 24;
  return (
    <g transform={`scale(${k})`}>
      {v === 0 ? <Robot bg="#5B4BC4" glow="#7A67E8" eye="#5B4BC4" mouth="#19D3B0" />
        : v === 1 ? <Skyline />
        : v === 2 ? <Robot bg="#0E6F63" glow="#2ECC8F" eye="#0E6F63" mouth="#FFE08A" />
        : v === 3 ? <Circuit />
        : <Dhow />}
    </g>
  );
}

function PieceSvg({ r, c, v }: { r: number; c: number; v: number }) {
  const id = `ap-${r}-${c}`, d = piecePath(r, c), w = S + PAD * 2;
  return (
    <svg width={w} height={w} viewBox={`0 0 ${w} ${w}`} style={{ display: "block", overflow: "visible", pointerEvents: "none" }} aria-hidden="true">
      <defs><clipPath id={id}><path d={d} /></clipPath></defs>
      <g clipPath={`url(#${id})`}><g transform={`translate(${PAD - c * S} ${PAD - r * S})`}><Art v={v} /></g></g>
      <path d={d} fill="none" stroke="rgba(10,5,50,.55)" strokeWidth="1.2" />
    </svg>
  );
}

const slot = (r: number, c: number) => ({ x: BOARD_X + c * S - PAD, y: BOARD_Y + r * S - PAD });

export default function AriaGame({ onChat }: { onChat: () => void }) {
  const [menu, setMenu] = useState(false);
  const [mini, setMini] = useState<MiniGame | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!menu) return; const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setMenu(false); }; document.addEventListener("mousedown", away); return () => document.removeEventListener("mousedown", away); }, [menu]);
  const [phase, setPhase] = useState<"idle" | "punched" | "play" | "won" | "lost">("idle");
  const [open, setOpen] = useState(false);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [left, setLeft] = useState(LIMIT);
  const [took, setTook] = useState(0);
  const [design, setDesign] = useState(0), lastDesign = useRef(-1);
  const [best, setBest] = useState<number | null>(null);
  const t0 = useRef(0), zTop = useRef(10), drag = useRef<{ id: number; dx: number; dy: number } | null>(null), stage = useRef<HTMLDivElement>(null);
  useEffect(() => { try { const b = Number(localStorage.getItem("aria-puzzle-best")); if (b) setBest(b); } catch { /* optional */ } }, []);

  const start = useCallback(() => {
    // a different picture from the last game
    let d = Math.floor(Math.random() * DESIGNS); if (d === lastDesign.current) d = (d + 1) % DESIGNS;
    lastDesign.current = d; setDesign(d);
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
        {phase === "idle" && !menu && <span className="agame-bubble" aria-hidden="true">Want to play?<br />Click me!</span>}
        <button type="button" className={`agame-bot${phase === "punched" ? " punched" : ""}`} onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="Aria: ask a question, or play a game">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="2.9" r="1.35" fill="#FFE08A" /><path d="M12 4.2v2.3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
            <rect x="4.6" y="6.4" width="14.8" height="11" rx="3.4" fill="#fff" /><rect x="2.3" y="9.6" width="1.9" height="4.6" rx="0.95" fill="#fff" /><rect x="19.8" y="9.6" width="1.9" height="4.6" rx="0.95" fill="#fff" />
            <circle cx="9.1" cy="11.4" r="1.7" fill="#5B4BC4" /><circle cx="14.9" cy="11.4" r="1.7" fill="#5B4BC4" /><path d="M9.4 14.9h5.2" stroke="#19D3B0" strokeWidth="1.6" strokeLinecap="round" /><rect x="8" y="18.4" width="8" height="2.6" rx="1.3" fill="#fff" />
          </svg>
        </button>
        {menu && (
          <div className="agame-menu" role="menu">
            <button type="button" role="menuitem" className="agame-opt" onClick={() => { setMenu(false); onChat(); }}>Ask Aria</button>
            <button type="button" role="menuitem" className="agame-opt" onClick={hit}>Jigsaw puzzle · 60 s</button>
            <button type="button" role="menuitem" className="agame-opt" onClick={() => { setMenu(false); setMini("memory"); }}>Memory match · 60 s</button>
            <button type="button" role="menuitem" className="agame-opt" onClick={() => { setMenu(false); setMini("quiz"); }}>True or false · 45 s</button>
            <button type="button" role="menuitem" className="agame-opt" onClick={() => { setMenu(false); setMini("words"); }}>Word scramble · no timer</button>
          </div>)}
      </div>
      {open && typeof document !== "undefined" && createPortal(
        <div className="agame-back" role="dialog" aria-modal="true" aria-label="Rebuild Aria">
          <div className="agame-card">
            <div className="agame-head">
              <div><b>{phase === "punched" ? "Ouch!" : phase === "won" ? "You built me!" : phase === "lost" ? "Time's up" : "Build me now!"}</b>
                <span>{phase === "play" ? "Drag the pieces onto the board. 60 seconds." : phase === "won" ? `Rebuilt in ${took}s${best !== null ? ` · best ${best}s` : ""}` : phase === "lost" ? `${placed} of 9 pieces placed. Want another go?` : "Hold on…"}</span></div>
              <button type="button" className="btn tiny" onClick={close}>Close</button>
            </div>
            <div className="agame-meter" aria-hidden="true"><i style={{ width: `${phase === "won" ? 100 : bar}%`, background: left < 8 && phase === "play" ? "#D92D20" : undefined }} /></div>
            <div className="agame-info"><span>{phase === "play" ? `${Math.ceil(left)} s left` : phase === "won" ? "Brain: warmed up" : ""}</span><span>{placed} / 9 placed</span></div>
            <div className="agame-stage" ref={stage} style={{ width: STAGE_W, height: STAGE_H }} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
              <div className="agame-board" style={{ left: BOARD_X, top: BOARD_Y, width: SIZE, height: SIZE }} aria-hidden="true" />
              {pieces.map((p) => (
                <div key={p.id} className={`agame-piece${p.locked ? " locked" : ""}${drag.current?.id === p.id ? " drag" : ""}`}
                  style={{ transform: `translate(${p.x}px,${p.y}px)`, zIndex: p.z }} onPointerDown={(e) => down(e, p)}><PieceSvg r={p.r} c={p.c} v={design} /></div>))}
              {(phase === "won" || phase === "lost") && (
                <div className="agame-end"><button type="button" className="btn primary" onClick={start}>{phase === "won" ? "Beat my time" : "Try again"}</button></div>)}
            </div>
          </div>
        </div>, document.body)}
      <AriaMiniGames game={mini} onClose={() => setMini(null)} />
    </>
  );
}
