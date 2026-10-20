"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GameEvent } from "@/components/games/registry";
type Ev = (e: GameEvent, detail?: string) => void;

// Two quick games Aria offers besides the jigsaw: True or false, and Word scramble (no time limit). Both are about the work the app is for (source-to-pay and the way CoPilot labels evidence), all in the browser, nothing stored but a best score.

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

const QN = 8;
export function Quiz({ onClose, onEvent }: { onClose: () => void; onEvent?: Ev }) {
  const [qs, setQs] = useState(() => shuffle(FACTS).slice(0, QN));
  const [i, setI] = useState(0), [score, setScore] = useState(0), [pick, setPick] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<"play" | "won" | "lost">("play"), [best, setBest] = useState<number | null>(getBest("aria-quiz-best"));
  useEffect(() => { onEvent?.("start"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const finish = (s: number, p: "won" | "lost") => { onEvent?.(p === "won" ? "win" : "lose", `${s} of ${QN}`); setPhase(p); setBest((b) => { const n = b === null || s > b ? s : b; setBestKey("aria-quiz-best", n); return n; }); };
  const scoreRef = useRef(0); scoreRef.current = score;
  const left = useCountdown(45, phase === "play", () => finish(scoreRef.current, "lost"));
  const q = qs[i];
  const answer = (v: boolean) => {
    if (pick !== null || phase !== "play") return;
    setPick(v); const s = score + (v === q.a ? 1 : 0); setScore(s); onEvent?.(v === q.a ? "good" : "bad");
    setTimeout(() => { if (i + 1 >= QN) finish(s, "won"); else { setI(i + 1); setPick(null); } }, 1500);
  };
  const again = () => { onEvent?.("start"); setQs(shuffle(FACTS).slice(0, QN)); setI(0); setScore(0); setPick(null); setPhase("play"); };
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

// Four levels of five words each: 3, 5, 7 and 10 letters. Every play draws five at random from the level's pool.
const LEVELS: { name: string; len: number; pool: { w: string; clue: string }[] }[] = [
  { name: "Level 1", len: 3, pool: [
    { w: "ERP", clue: "The system a company runs its finance, stock and orders on" }, { w: "RFQ", clue: "What you send suppliers to ask for a price" },
    { w: "BID", clue: "A supplier's offer to do the work at a price" }, { w: "PAY", clue: "The last step of purchase to pay" },
    { w: "KPI", clue: "A number that tracks how well something is going" }, { w: "SAP", clue: "The company behind Ariba" },
    { w: "ICP", clue: "The rules for which companies are worth tracking" }, { w: "SLA", clue: "A promise about service levels, in short" },
    { w: "TCO", clue: "Total cost of ownership, in short" }, { w: "TAX", clue: "Added to an invoice by the government" } ] },
  { name: "Level 2", len: 5, pool: [
    { w: "PRICE", clue: "What a supplier charges" }, { w: "ORDER", clue: "What a purchase order places" },
    { w: "COUPA", clue: "A source-to-pay platform with a spend-management focus" }, { w: "ARIBA", clue: "SAP's procurement network" },
    { w: "SPEND", clue: "The money a company pays to suppliers" }, { w: "BUYER", clue: "The person who chooses what to purchase" },
    { w: "QUOTE", clue: "A price a supplier gives before you order" }, { w: "TERMS", clue: "The conditions written into a contract" },
    { w: "AUDIT", clue: "A check that the records are right" }, { w: "STOCK", clue: "Goods a company keeps on hand" } ] },
  { name: "Level 3", len: 7, pool: [
    { w: "INVOICE", clue: "The bill a supplier sends after delivery" }, { w: "CATALOG", clue: "A list of items a buyer can order" },
    { w: "PROCURE", clue: "To obtain goods or services for a company" }, { w: "SAVINGS", clue: "What good negotiation leaves in the bank" },
    { w: "REVENUE", clue: "Money a company earns from sales" }, { w: "ACCOUNT", clue: "A company you are working to win" },
    { w: "PARTNER", clue: "A firm that implements a vendor's software" }, { w: "CONTACT", clue: "A person you can reach at a company" },
    { w: "FINANCE", clue: "The department that manages the money" } ] },
  { name: "Level 4", len: 10, pool: [
    { w: "COMPLIANCE", clue: "Following the rules and policies" }, { w: "PURCHASING", clue: "The act of buying what a company needs" },
    { w: "AUTOMATION", clue: "Letting software do the repetitive work" }, { w: "ONBOARDING", clue: "Bringing a new supplier or employee into the system" },
    { w: "CATEGORIES", clue: "Groups of similar things a company buys" }, { w: "RECEIVABLE", clue: "Money owed to a company by its customers" },
    { w: "BENCHMARKS", clue: "Standards you compare your results against" } ] },
];
const WN = 5;
const scramble = (w: string) => { let a = shuffle(w.split("")); for (let t = 0; t < 8 && a.join("") === w; t++) a = shuffle(w.split("")); return a; };
const draw = (lv: number) => shuffle(LEVELS[lv].pool).slice(0, WN);
export function Words({ onClose, onEvent }: { onClose: () => void; onEvent?: Ev }) {
  const [lv, setLv] = useState(0);
  const [set, setSet] = useState(() => draw(0));
  const [i, setI] = useState(0), [score, setScore] = useState(0), [hints, setHints] = useState(0), [usedHint, setUsedHint] = useState(false);
  const [tiles, setTiles] = useState<string[]>(() => scramble(set[0].w)), [pick, setPick] = useState<number[]>([]);
  const [state, setState] = useState<"play" | "right" | "wrong" | "end">("play");
  const cur = set[i], typed = pick.map((k) => tiles[k]).join("");
  useEffect(() => { onEvent?.("start"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const begin = (level: number) => { const f = draw(level); setLv(level); setSet(f); setI(0); setScore(0); setHints(0); setTiles(scramble(f[0].w)); setPick([]); setState("play"); setUsedHint(false); };
  const load = (w: string) => { setTiles(scramble(w)); setPick([]); setState("play"); setUsedHint(false); };
  const check = (np: number[]) => {
    if (np.length !== cur.w.length) return;
    if (np.map((k) => tiles[k]).join("") === cur.w) { setState("right"); setScore((x) => x + (usedHint ? 0 : 1)); onEvent?.("good"); } else { setState("wrong"); onEvent?.("bad"); }
  };
  const add = (k: number) => { if (state === "right" || state === "end" || pick.includes(k)) return; const np = [...pick, k]; setPick(np); setState("play"); check(np); };
  const drop = (n: number) => { if (state === "right" || state === "end") return; setPick((p) => p.filter((_, j) => j !== n)); setState("play"); };
  const hint = () => {
    if (state === "right" || state === "end") return;
    let np = pick; if (typed !== cur.w.slice(0, typed.length)) np = []; // wrong so far: start the word again
    const want = cur.w[np.length], k = tiles.findIndex((t, j) => t === want && !np.includes(j));
    if (k < 0) return;
    np = [...np, k]; setPick(np); setHints((h) => h + 1); setUsedHint(true); setState("play"); onEvent?.("hint"); check(np);
  };
  const next = () => {
    if (i + 1 >= set.length) { setState("end"); onEvent?.("win", `${L.name}: ${score} of ${set.length} without a hint`); try { const d = Number(localStorage.getItem("aria-words-level")) || 0; if (lv + 1 > d) localStorage.setItem("aria-words-level", String(lv + 1)); } catch { /* optional */ } return; }
    setI(i + 1); load(set[i + 1].w);
  };
  const keys = useRef({ add, drop, pick, tiles, state }); keys.current = { add, drop, pick, tiles, state };
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const k = keys.current; if (e.ctrlKey || e.metaKey || e.altKey || k.state === "end") return;
      if (e.key === "Backspace") { k.drop(k.pick.length - 1); return; }
      if (e.key === "Enter" && k.state === "right") { e.preventDefault(); next(); return; }
      const ch = e.key.toUpperCase(); if (!/^[A-Z]$/.test(ch)) return;
      const j = k.tiles.findIndex((t, n) => t === ch && !k.pick.includes(n)); if (j >= 0) k.add(j);
    };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const L = LEVELS[lv], lastLevel = lv === LEVELS.length - 1;
  return (
    <Shell title={state === "end" ? `${L.name} done` : "Word scramble"}
      sub={state === "end" ? `${score} of ${set.length} without a hint · ${hints} hint${hints === 1 ? "" : "s"} used` : `${L.name}: ${L.len}-letter words. Tap the letters or type. No time limit.`}
      info={state === "end" ? "" : `Word ${i + 1} of ${set.length}`} info2={`${score} solved without a hint`} onClose={onClose} onRestart={() => begin(lv)}>
      <div className="seg-toggle agm-levels" role="group" aria-label="Level">
        {LEVELS.map((x, n) => <button type="button" key={x.name} aria-pressed={n === lv} onClick={() => begin(n)} title={`${x.len}-letter words`}>{x.name} · {x.len}</button>)}
      </div>
      {state === "end" ? (
        <div className="agm-end static" style={{ gap: 10 }}>
          <button type="button" className="btn" onClick={() => begin(lv)}>Play {L.name} again</button>
          {!lastLevel ? <button type="button" className="btn primary" onClick={() => begin(lv + 1)}>Next: {LEVELS[lv + 1].name} ({LEVELS[lv + 1].len} letters)</button>
            : <button type="button" className="btn primary" onClick={() => begin(0)}>Start again from Level 1</button>}
        </div>
      ) : (
        <div className="agm-w">
          <p className="agm-clue">{cur.clue}</p>
          <div className={`agm-slots${state === "wrong" ? " wrong" : state === "right" ? " right" : ""}`} aria-live="polite">
            {cur.w.split("").map((_, n) => <button type="button" key={n} className="agm-slot" onClick={() => drop(n)} aria-label={pick[n] !== undefined ? `Letter ${tiles[pick[n]]}, tap to remove` : "Empty"}>{pick[n] !== undefined ? tiles[pick[n]] : ""}</button>)}
          </div>
          <div className="agm-tiles">
            {tiles.map((t, k) => <button type="button" key={k} className="agm-tile" disabled={pick.includes(k) || state === "right"} onClick={() => add(k)}>{t}</button>)}
          </div>
          <p className="agm-why" aria-live="polite">{state === "right" ? `Yes: ${cur.w}.${usedHint ? " (with a hint)" : ""}` : state === "wrong" ? "Not quite. Tap a letter in the answer to take it out, or use Hint." : ""}</p>
          <div className="agm-row">
            <button type="button" className="btn tiny" onClick={() => { setPick([]); setState("play"); }} disabled={!pick.length || state === "right"}>Clear</button>
            <button type="button" className="btn tiny" onClick={hint} disabled={state === "right"}>Hint</button>
            {state === "right" ? <button type="button" className="btn primary" onClick={next} autoFocus>{i + 1 >= set.length ? "Finish level" : "Next word"}</button>
              : <button type="button" className="btn tiny" onClick={next}>Skip</button>}
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ title, sub, left, total, info, info2, onClose, onRestart, children }: { title: string; sub: string; left?: number; total?: number; info: string; info2: string; onClose: () => void; onRestart?: () => void; children: React.ReactNode }) {
  const bar = useMemo(() => (left !== undefined && total ? Math.round((left / total) * 100) : 100), [left, total]);
  return (
    <div className="agame-card agm-shell agm-inline" role="region" aria-label={title}>
        <div className="agame-head"><div><b>{title}</b><span>{sub}</span></div><span className="agm-headbtns">{onRestart && <button type="button" className="btn tiny" onClick={onRestart}>Restart</button>}<button type="button" className="btn tiny" onClick={onClose}>Close</button></span></div>
        {left !== undefined && <div className="agame-meter" aria-hidden="true"><i style={{ width: `${bar}%`, background: left < 10 ? "#D92D20" : undefined }} /></div>}
        <div className="agame-info"><span>{info}</span><span>{info2}</span></div>
        {children}
      </div>
  );
}
