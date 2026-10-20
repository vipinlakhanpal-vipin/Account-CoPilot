"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

// Aria's game library: a bookshelf. Each game is a narrow coloured spine (add a row to GAMES and a new book appears; the shelf scrolls when there are many);
// picking one raises it and shows its card with a Play button. Opens beside Aria in its own layer so the left panel never clips it.
export type GameId = "jigsaw" | "memory" | "quiz" | "words";
type Game = { id: GameId; name: string; icon: ReactElement; fill: string; ink: string; time: string; timed: boolean; blurb: string; best: () => string };

const num = (k: string) => { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } };
const svg = (d: ReactElement) => <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
export const GAMES: Game[] = [
  { id: "jigsaw", name: "Jigsaw puzzle", fill: "#CECBF6", ink: "#3C3489", time: "60 s", timed: true, blurb: "Rebuild Aria from nine pieces. A new picture every game.",
    icon: svg(<path d="M10 4a2 2 0 1 1 4 0v1h4v4h-1a2 2 0 1 0 0 4h1v4h-4v-1a2 2 0 1 0-4 0v1H6v-4h1a2 2 0 1 0 0-4H6V5h4z" />), best: () => { const b = num("aria-puzzle-best"); return b ? `Best ${b} s` : "Not played yet"; } },
  { id: "memory", name: "Memory match", fill: "#9FE1CB", ink: "#085041", time: "60 s", timed: true, blurb: "Match six procurement terms to their meanings.",
    icon: svg(<><rect x="3" y="6" width="11" height="14" rx="2" /><path d="M17 8l3 1-3 10" /></>), best: () => { const b = num("aria-memory-best"); return b ? `Best ${b} moves` : "Not played yet"; } },
  { id: "quiz", name: "True or false", fill: "#FAC775", ink: "#633806", time: "45 s", timed: true, blurb: "Eight quick statements about source-to-pay and how CoPilot labels evidence.",
    icon: svg(<><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.5" /></>), best: () => { const b = num("aria-quiz-best"); return b ? `Best ${b} of 8` : "Not played yet"; } },
  { id: "words", name: "Word scramble", fill: "#F5C4B3", ink: "#712B13", time: "No timer", timed: false, blurb: "Put the letters in order. Hints and Restart any time.",
    icon: svg(<><path d="M4 18l4-11 4 11M5.6 14h4.8" /><path d="M15 9h3.5a2 2 0 0 1 0 4H15m0 0h4a2 2 0 0 1 0 4h-4z" /></>), best: () => "Play as long as you like" },
];

const POP_W = 340;
export default function AriaLibrary({ anchor, onClose, onAsk, onPlay }: { anchor: DOMRect; onClose: () => void; onAsk: () => void; onPlay: (g: GameId) => void }) {
  const [pick, setPick] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { try { const i = GAMES.findIndex((g) => g.id === localStorage.getItem("aria-game-pick")); if (i >= 0) setPick(i); } catch { /* optional */ } }, []);
  useLayoutEffect(() => {
    const h = box.current?.offsetHeight || 380;
    const left = Math.max(8, Math.min(window.innerWidth - POP_W - 8, anchor.left + anchor.width / 2 - POP_W / 2));
    let top = anchor.bottom + 10; if (top + h > window.innerHeight - 8) top = Math.max(8, anchor.top - h - 10);
    setPos({ left, top });
  }, [anchor, pick]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.(".agame-bot")) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); };
  }, [onClose]);
  const choose = (i: number) => { setPick(i); try { localStorage.setItem("aria-game-pick", GAMES[i].id); } catch { /* optional */ } };
  const g = GAMES[pick];
  // spine height follows the name's length, so a longer title gets a taller book
  const h = (name: string) => Math.min(172, Math.max(112, 56 + name.length * 7));
  return createPortal(
    <div className="alib" ref={box} role="dialog" aria-label="Aria's game library" style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, width: POP_W, visibility: pos ? "visible" : "hidden" }}>
      <div className="alib-head"><b>Aria&apos;s library</b><span>{GAMES.length} games · pick a book</span></div>
      <button type="button" className="alib-ask" onClick={onAsk}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.7 7L4 20l1.1-4.3A8 8 0 1 1 21 12z" /></svg>
        <span>Ask Aria a question</span>
      </button>
      <div className="alib-shelf" role="tablist" aria-label="Games">
        {GAMES.map((x, i) => (
          <button type="button" key={x.id} role="tab" aria-selected={i === pick} className="alib-spine" onClick={() => choose(i)}
            style={{ height: h(x.name) + (i === pick ? 14 : 0), background: x.fill, color: x.ink }} title={x.name}>
            {x.icon}<span>{x.name}</span>
          </button>))}
      </div>
      <div className="alib-card">
        <div className="alib-card-top">
          <span className="alib-ic" style={{ background: g.fill, color: g.ink }}>{g.icon}</span>
          <div><b>{g.name}</b><span className="alib-chip">{g.timed ? "⏱ " : "∞ "}{g.time}</span></div>
        </div>
        <p>{g.blurb}</p>
        <div className="alib-foot"><span>🏆 {g.best()}</span><button type="button" className="btn primary" onClick={() => onPlay(g.id)}>Play</button></div>
      </div>
    </div>, document.body);
}
