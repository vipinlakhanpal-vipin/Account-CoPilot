"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Two quick games Aria offers besides the jigsaw. Both are about the work the app is for (source-to-pay and the way CoPilot labels evidence), all in the browser, nothing stored but a best score.
export type MiniGame = "memory" | "quiz";

const PAIRS: [string, string][] = [
  ["PO", "Purchase order"], ["RFQ", "Request for quotation"], ["S2P", "Source to pay"],
  ["GRN", "Goods received note"], ["SLA", "Service level agreement"], ["TCO", "Total cost of ownership"],
];
const FACTS: { q: string; a: boolean; why: string }[] = [
  { q: "A purchase order is raised after the supplier's invoice has been paid.", a: false, why: "A PO comes first: it is the order, then goods arrive, then the invoice is matched and paid." },
  { q: "Three-way match compares the PO, the goods receipt and the invoice.", a: true, why: "If the three agree, the invoice can be paid without more checks." },
  { q: "Coupa and SAP Ariba are both source-to-pay platforms.", a: true, why: "They cover sourcing, contracts, purchasing and invoicing in one place." },
  { q: "In Account CoPilot, a FACT label means the figure comes from an official source.", a: true, why: "Likely, Unverified and Unknown mark weaker evidence, and every figure keeps its source link." },
  { q: "Tail spend is the few biggest suppliers a company has.", a: false, why: "Tail spend is the long list of small suppliers that add up to a modest share of the money." },
  { q: "An RFQ asks suppliers to quote a price for a defined need.", a: true, why: "It is used when the need is clear and price is the main thing to compare." },
  { q: "One US dollar is about 3.67 UAE dirhams (the rate the app uses).", a: true, why: "The dirham is pegged at 3.6725 to the dollar." },
  { q: "Accounts payable decides which supplier a company buys from.", a: false, why: "Procurement chooses the supplier; accounts payable checks and pays the invoice." },
  { q: "The app's default ICP needs a stock-exchange listing.", a: false, why: "A listing is recorded separately; the default rule is revenue and headcount." },
  { q: "A contract is signed before an RFP is written.", a: false, why: "An RFP invites proposals; the contract follows once a supplier is chosen." },
];
const shuffle = <T,>(a: T[]) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const getBest = (k: string) => { try { return Number(localStorage.getItem(k)) || null; } catch { return null; } };
const setBestKey = (k: string, v: number) => { try { localStorage.setItem(k, String(v)); } catch { /* optional */ } };

function useCountdown(total: number, running: boolean, onEnd: () => void) {
  const [left, setLeft] = useState(total);
  const t0 = useRef(0), end = useRef(onEnd);
  end.current = onEnd;
  useEffect(() => { if (running) { t0.current = Date.now(); setLeft(total); } }, [running, total]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => { const l = Math.max(0, total - (Date.now() - t0.current) / 1000); setLeft(l); if (l <= 0) { clearInterval(t); end.current(); } }, 100);
    return () => clearInterval(t);
  }, [running, total]);
  return left;
}

type Card = { id: number; pair: number; text: string; term: boolean };
function Memory({ onClose }: { onClose: () => void }) {
  const deal = () => shuffle(PAIRS.flatMap(([a, b], i) => [{ id: i * 2, pair: i, text: a, term: true }, { id: i * 2 + 1, pair: i, text: b, term: false }] as Card[]));
  const [cards, setCards] = useState<Card[]>(deal);
  const [up, setUp] = useState<number[]>([]), [done, setDone] = useState<number[]>([]), [moves, setMoves] = useState(0);
  const [phase, setPhase] = useState<"play" | "won" | "lost">("play"), [best, setBest] = useState<number | null>(getBest("aria-memory-best"));
  const left = useCountdown(60, phase === "play", () => setPhase("lost"));
  const again = () => { setCards(deal()); setUp([]); setDone([]); setMoves(0); setPhase("play"); };
  const flip = (c: Card) => {
    if (phase !== "play" || up.length >= 2 || up.includes(c.id) || done.includes(c.pair)) return;
    const nu = [...up, c.id]; setUp(nu);
    if (nu.length === 2) {
      setMoves((m) => m + 1);
      const [a, b] = nu.map((id) => cards.find((x) => x.id === id)!);
      if (a.pair === b.pair) setTimeout(() => { setDone((d) => { const nd = [...d, a.pair]; if (nd.length === PAIRS.length) { setPhase("won"); const m = moves + 1; setBest((bb) => { const n = bb === null || m < bb ? m : bb; setBestKey("aria-memory-best", n); return n; }); } return nd; }); setUp([]); }, 350);
      else setTimeout(() => setUp([]), 800);
    }
  };
  return (
    <Shell title={phase === "won" ? "All matched!" : phase === "lost" ? "Time's up" : "Match the term to its meaning"}
      sub={phase === "won" ? `${moves} moves${best !== null ? ` · best ${best}` : ""}` : phase === "lost" ? `${done.length} of ${PAIRS.length} pairs found` : "Flip two cards. 60 seconds."}
      left={left} total={60} info={`${Math.ceil(left)} s left`} info2={`${done.length} / ${PAIRS.length} pairs · ${moves} moves`} onClose={onClose}>
      <div className="agm-grid">
        {cards.map((c) => {
          const shown = up.includes(c.id) || done.includes(c.pair);
          return <button type="button" key={c.id} className={`agm-card${shown ? " up" : ""}${done.includes(c.pair) ? " ok" : ""}${c.term ? " term" : ""}`} onClick={() => flip(c)} aria-label={shown ? c.text : "Hidden card"}>{shown ? c.text : "?"}</button>;
        })}
      </div>
      {phase !== "play" && <div className="agm-end"><button type="button" className="btn primary" onClick={again}>{phase === "won" ? "Beat my moves" : "Try again"}</button></div>}
    </Shell>
  );
}

const QN = 8;
function Quiz({ onClose }: { onClose: () => void }) {
  const [qs, setQs] = useState(() => shuffle(FACTS).slice(0, QN));
  const [i, setI] = useState(0), [score, setScore] = useState(0), [pick, setPick] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<"play" | "won" | "lost">("play"), [best, setBest] = useState<number | null>(getBest("aria-quiz-best"));
  const finish = (s: number, p: "won" | "lost") => { setPhase(p); setBest((b) => { const n = b === null || s > b ? s : b; setBestKey("aria-quiz-best", n); return n; }); };
  const scoreRef = useRef(0); scoreRef.current = score;
  const left = useCountdown(45, phase === "play", () => finish(scoreRef.current, "lost"));
  const q = qs[i];
  const answer = (v: boolean) => {
    if (pick !== null || phase !== "play") return;
    setPick(v); const s = score + (v === q.a ? 1 : 0); setScore(s);
    setTimeout(() => { if (i + 1 >= QN) finish(s, "won"); else { setI(i + 1); setPick(null); } }, 1500);
  };
  const again = () => { setQs(shuffle(FACTS).slice(0, QN)); setI(0); setScore(0); setPick(null); setPhase("play"); };
  return (
    <Shell title={phase === "play" ? "True or false?" : phase === "won" ? "Round finished" : "Time's up"}
      sub={phase === "play" ? `Question ${i + 1} of ${QN}. 45 seconds in all.` : `${score} of ${QN} right${best !== null ? ` · best ${best}` : ""}`}
      left={left} total={45} info={`${Math.ceil(left)} s left`} info2={`${score} right`} onClose={onClose}>
      {phase === "play" ? (
        <div className="agm-q">
          <p className="agm-stmt">{q.q}</p>
          <div className="agm-tf">
            {[true, false].map((v) => <button type="button" key={String(v)} className={`btn agm-tfb${pick !== null ? (v === q.a ? " right" : pick === v ? " wrong" : "") : ""}`} onClick={() => answer(v)} disabled={pick !== null}>{v ? "True" : "False"}</button>)}
          </div>
          <p className="agm-why" aria-live="polite">{pick === null ? "" : `${pick === q.a ? "Right. " : "Not quite. "}${q.why}`}</p>
        </div>
      ) : (
        <div className="agm-end static"><button type="button" className="btn primary" onClick={again}>{phase === "won" ? "Play again" : "Try again"}</button></div>
      )}
    </Shell>
  );
}

function Shell({ title, sub, left, total, info, info2, onClose, children }: { title: string; sub: string; left: number; total: number; info: string; info2: string; onClose: () => void; children: React.ReactNode }) {
  const bar = useMemo(() => Math.round((left / total) * 100), [left, total]);
  return (
    <div className="agame-back" role="dialog" aria-modal="true" aria-label={title}>
      <div className="agame-card agm-shell">
        <div className="agame-head"><div><b>{title}</b><span>{sub}</span></div><button type="button" className="btn tiny" onClick={onClose}>Close</button></div>
        <div className="agame-meter" aria-hidden="true"><i style={{ width: `${bar}%`, background: left < 10 ? "#D92D20" : undefined }} /></div>
        <div className="agame-info"><span>{info}</span><span>{info2}</span></div>
        {children}
      </div>
    </div>
  );
}

export default function AriaMiniGames({ game, onClose }: { game: MiniGame | null; onClose: () => void }) {
  if (!game || typeof document === "undefined") return null;
  return createPortal(game === "memory" ? <Memory onClose={onClose} /> : <Quiz onClose={onClose} />, document.body);
}
