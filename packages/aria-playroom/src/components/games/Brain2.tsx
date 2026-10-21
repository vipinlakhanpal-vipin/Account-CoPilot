"use client";
import { useEffect, useRef, useState } from "react";
import { Shell, shuffle, getBest, setBestKey, type Ev } from "@/components/AriaMiniGames";

// Four more brain games: Reaction speed (reaction time), Digit span (short-term memory), Odd one out (categorising) and Process order (sequencing).
const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

// ------------------------------------------------------------------ Reaction speed
const RR = 5;
export function ReactionTest({ onClose, onEvent }: { onClose: () => void; onEvent?: Ev }) {
  const [state, setState] = useState<"wait" | "go" | "early" | "shown" | "done">("wait"), [times, setTimes] = useState<number[]>([]), [ms, setMs] = useState(0);
  const t0 = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [best, setBest] = useState<number | null>(getBest("aria-react-best"));
  const arm = () => { setState("wait"); clearTimeout(timer.current); timer.current = setTimeout(() => { t0.current = performance.now(); setState("go"); }, rnd(1200, 3500)); };
  useEffect(() => { onEvent?.("start"); arm(); return () => clearTimeout(timer.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const press = () => {
    if (state === "wait") { clearTimeout(timer.current); setState("early"); onEvent?.("bad"); return; }
    if (state === "go") {
      const t = Math.round(performance.now() - t0.current), all = [...times, t]; setMs(t); setTimes(all); onEvent?.("good");
      if (all.length >= RR) {
        const avg = Math.round(all.reduce((a, b) => a + b, 0) / all.length); setState("done");
        setBest((b) => { const n = b === null || avg < b ? avg : b; setBestKey("aria-react-best", n); return n; });
        onEvent?.(avg <= 500 ? "win" : "lose", `${avg} ms`, { score: avg, total: RR });
      } else setState("shown");
    }
  };
  const again = () => { setTimes([]); onEvent?.("start"); arm(); };
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
  return (
    <Shell title={state === "done" ? "Your reaction time" : "Reaction speed"} sub={state === "done" ? `Average ${avg} ms${best !== null ? ` · best ${best} ms` : ""}` : "Wait for green, then click as fast as you can. Five rounds."}
      info={`Round ${Math.min(RR, times.length + (state === "done" ? 0 : 1))} of ${RR}`} info2={ms ? `Last ${ms} ms` : ""} onClose={onClose} onRestart={again}>
      {state !== "done" ? (
        <div className="b2-react"><button type="button" className={`b2-pad ${state}`} onClick={press}>
          {state === "wait" ? "Wait for green…" : state === "go" ? "Click now!" : state === "early" ? "Too soon!" : `${ms} ms`}</button>
          {(state === "early" || state === "shown") && <button type="button" className="btn primary" onClick={arm} autoFocus>{state === "early" ? "Try this round again" : "Next round"}</button>}</div>
      ) : <div className="agm-end static" style={{ flexDirection: "column", alignItems: "center", gap: 10 }}><p className="cg-big">{avg} ms</p><button type="button" className="btn primary" onClick={again}>Play again</button></div>}
    </Shell>
  );
}

// ------------------------------------------------------------------ Digit span
export function DigitSpan({ onClose, onEvent }: { onClose: () => void; onEvent?: Ev }) {
  const make = (n: number) => Array.from({ length: n }, () => rnd(0, 9)).join("");
  const [len, setLen] = useState(3), [digits, setDigits] = useState(() => make(3)), [phase, setPhase] = useState<"show" | "type" | "over">("show"), [val, setVal] = useState("");
  const [best, setBest] = useState<number | null>(getBest("aria-digits-best")), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = (d: string) => { setPhase("show"); setVal(""); clearTimeout(timer.current); timer.current = setTimeout(() => setPhase("type"), 700 + d.length * 650); };
  useEffect(() => { onEvent?.("start"); show(digits); return () => clearTimeout(timer.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); if (phase !== "type") return;
    if (val === digits) { onEvent?.("good"); const n = len + 1, d = make(n); setLen(n); setDigits(d); show(d); }
    else { const score = len - 1; setPhase("over"); setBest((b) => { const n = b === null || score > b ? score : b; setBestKey("aria-digits-best", n); return n; }); onEvent?.(score >= 5 ? "win" : "lose", `${score} digits`, { score, total: 9 }); }
  };
  const again = () => { const d = make(3); setLen(3); setDigits(d); onEvent?.("start"); show(d); };
  const score = len - 1;
  return (
    <Shell title={phase === "over" ? "Game over" : phase === "show" ? "Memorise this" : "Type it back"} sub={phase === "over" ? `You held ${score} digits${best !== null ? ` · best ${best}` : ""}. It was ${digits}.` : "A number flashes, then it hides. Type it back. It grows by one digit each round."}
      info={`${len} digits`} info2={`Longest: ${Math.max(0, score)}`} onClose={onClose} onRestart={again}>
      <div className="cg-q">
        <p className="cg-big b2-digits">{phase === "show" ? digits : phase === "type" ? "?".repeat(len) : digits}</p>
        {phase === "type" && <form onSubmit={submit} className="agm-row"><input className="b2-input" inputMode="numeric" autoFocus value={val} onChange={(e) => setVal(e.target.value.replace(/\D/g, "").slice(0, len))} aria-label="The digits" /><button type="submit" className="btn primary">Check</button></form>}
        {phase === "over" && <button type="button" className="btn primary" onClick={again}>Play again</button>}
      </div>
    </Shell>
  );
}

// ------------------------------------------------------------------ Odd one out
const ODD: { items: string[]; odd: number; why: string }[] = [
  { items: ["Purchase order", "Invoice", "Goods receipt", "Org chart"], odd: 3, why: "The other three are documents in the purchase-to-pay flow." },
  { items: ["Coupa", "SAP Ariba", "Jaggaer", "Photoshop"], odd: 3, why: "The other three are procurement platforms." },
  { items: ["Sourcing", "Contracting", "Invoicing", "Parking"], odd: 3, why: "The other three are steps of source to pay." },
  { items: ["Revenue", "Headcount", "Industry", "Weather"], odd: 3, why: "The other three are things the ICP checks about a company." },
  { items: ["FACT", "LIKELY", "UNVERIFIED", "WINNER"], odd: 3, why: "The other three are CoPilot's evidence labels." },
  { items: ["UAE", "KSA", "Qatar", "Norway"], odd: 3, why: "The other three are Gulf regions the app tracks." },
  { items: ["Bid", "Quote", "Tender", "Receipt"], odd: 3, why: "The other three are a supplier's offer before an order; a receipt comes after." },
  { items: ["Dirham", "Riyal", "Dinar", "Kilogram"], odd: 3, why: "The other three are currencies." },
  { items: ["Budget", "Forecast", "Ledger", "Hammer"], odd: 3, why: "The other three are finance terms." },
  { items: ["Hot", "Warm", "Watch", "Frozen"], odd: 3, why: "The other three are the strengths of a buying signal." },
];
const ON = 8;
export function OddOneOut({ onClose, onEvent }: { onClose: () => void; onEvent?: Ev }) {
  const make = () => { const q = ODD[rnd(0, ODD.length - 1)], order = shuffle(q.items.map((t, i) => ({ t, odd: i === q.odd }))); return { order, why: q.why }; };
  const deal = () => { const seen = new Set<string>(), out: ReturnType<typeof make>[] = []; while (out.length < ON) { const m = make(); if (!seen.has(m.why)) { seen.add(m.why); out.push(m); } } return out; };
  const [qs, setQs] = useState(deal);
  const [i, setI] = useState(0), [score, setScore] = useState(0), [pick, setPick] = useState<number | null>(null), [phase, setPhase] = useState<"play" | "over">("play"), [best, setBest] = useState<number | null>(getBest("aria-odd-best"));
  useEffect(() => { onEvent?.("start"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const q = qs[i];
  const answer = (k: number) => { if (pick !== null) return; const ok = q.order[k].odd; setPick(k); if (ok) setScore((x) => x + 1); onEvent?.(ok ? "good" : "bad"); };
  const next = () => { if (i + 1 >= ON) { setPhase("over"); setBest((b) => { const n = b === null || score > b ? score : b; setBestKey("aria-odd-best", n); return n; }); onEvent?.(score >= 5 ? "win" : "lose", `${score} of ${ON}`, { score, total: ON }); } else { setI(i + 1); setPick(null); } };
  const again = () => { setQs(deal()); setI(0); setScore(0); setPick(null); setPhase("play"); onEvent?.("start"); };
  return (
    <Shell title={phase === "over" ? "Finished" : "Odd one out"} sub={phase === "over" ? `${score} of ${ON} right${best !== null ? ` · best ${best}` : ""}` : "Which one does not belong with the others? No timer."}
      info={phase === "over" ? "" : `Question ${i + 1} of ${ON}`} info2={`${score} right`} onClose={onClose} onRestart={again}>
      {phase === "play" ? (
        <div className="cg-q"><div className="cg-opts">{q.order.map((o, k) => <button type="button" key={o.t} className={`btn cg-opt b2-word${pick !== null ? (o.odd ? " right" : pick === k ? " wrong" : "") : ""}`} onClick={() => answer(k)} disabled={pick !== null}>{o.t}</button>)}</div>
          {pick !== null && <p className={`agm-why ${q.order[pick].odd ? "ok" : "no"}`}><b>{q.order[pick].odd ? "Correct!" : `Incorrect. The odd one is ${q.order.find((o) => o.odd)?.t}.`}</b> {q.why}</p>}
          {pick !== null && <div className="agm-row"><button type="button" className="btn primary" onClick={next} autoFocus>{i + 1 >= ON ? "Finish" : "Next"}</button></div>}</div>
      ) : <div className="agm-end static"><button type="button" className="btn primary" onClick={again}>Play again</button></div>}
    </Shell>
  );
}

// ------------------------------------------------------------------ Process order
const PROCESSES: { name: string; steps: string[] }[] = [
  { name: "Purchase to pay", steps: ["Raise a requisition", "Approve it", "Send the purchase order", "Receive the goods", "Pay the invoice"] },
  { name: "Sourcing a supplier", steps: ["Define the need", "Send the RFQ", "Compare the bids", "Negotiate", "Award the contract"] },
  { name: "Onboarding a supplier", steps: ["Invite the supplier", "Collect their documents", "Check compliance", "Approve", "Start trading"] },
  { name: "Checking an invoice", steps: ["Receive the invoice", "Match it to the order", "Match it to the receipt", "Approve for payment", "Pay it"] },
  { name: "Qualifying an account", steps: ["Find the company", "Check its revenue", "Compare with the ICP", "Label the evidence", "Add it to the pipeline"] },
];
export function ProcessOrder({ onClose, onEvent }: { onClose: () => void; onEvent?: Ev }) {
  const [order, setOrder] = useState(() => shuffle(PROCESSES)), [i, setI] = useState(0), [score, setScore] = useState(0), [mistakes, setMistakes] = useState(0);
  const [shuf, setShuf] = useState(() => shuffle(order[0].steps)), [placed, setPlaced] = useState<(string | null)[]>(() => order[0].steps.map(() => null)), [phase, setPhase] = useState<"play" | "next" | "over">("play"), [shake, setShake] = useState(""), [over, setOver] = useState(-1), [drag, setDrag] = useState("");
  const [best, setBest] = useState<number | null>(getBest("aria-process-best"));
  useEffect(() => { onEvent?.("start"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const p = order[i];
  // Drag a step onto its slot, or tap it and it goes to the next free slot (only if that is where it belongs).
  const put = (s: string, k: number) => {
    if (phase !== "play" || placed[k]) return;
    if (s === p.steps[k]) {
      const d = placed.map((x, j) => (j === k ? s : x)); setPlaced(d); onEvent?.("good");
      if (d.every(Boolean)) { setScore((x) => x + (mistakes === 0 ? 1 : 0)); setPhase("next"); }
    } else { setMistakes((m) => m + 1); setShake(s); setTimeout(() => setShake(""), 400); onEvent?.("bad"); }
  };
  const tap = (s: string) => put(s, placed.findIndex((x) => !x));
  const next = () => {
    if (i + 1 >= order.length) { setPhase("over"); setBest((b) => { const n = b === null || score > b ? score : b; setBestKey("aria-process-best", n); return n; }); onEvent?.(score >= 3 ? "win" : "lose", `${score} of ${order.length} perfect`, { score, total: order.length }); return; }
    setI(i + 1); setShuf(shuffle(order[i + 1].steps)); setPlaced(order[i + 1].steps.map(() => null)); setMistakes(0); setPhase("play");
  };
  const again = () => { const o = shuffle(PROCESSES); setOrder(o); setI(0); setScore(0); setMistakes(0); setShuf(shuffle(o[0].steps)); setPlaced(o[0].steps.map(() => null)); setPhase("play"); onEvent?.("start"); };
  return (
    <Shell title={phase === "over" ? "Finished" : p.name} sub={phase === "over" ? `${score} of ${order.length} in perfect order${best !== null ? ` · best ${best}` : ""}` : "Drag each step into its place, in the order they happen (or tap them in order). No timer."}
      info={phase === "over" ? "" : `Process ${i + 1} of ${order.length}`} info2={`${score} perfect`} onClose={onClose} onRestart={again}>
      {phase !== "over" ? (
        <div className="cg-q"><ol className="b2-done">{p.steps.map((_, k) => <li key={k} className={`${placed[k] ? "on" : ""}${over === k ? " over" : ""}`}
            onDragOver={(e) => { if (!placed[k]) { e.preventDefault(); setOver(k); } }} onDragLeave={() => setOver(-1)} onDrop={(e) => { e.preventDefault(); setOver(-1); const t = e.dataTransfer.getData("text/plain") || drag; if (t) put(t, k); setDrag(""); }}>{placed[k] || `Step ${k + 1}`}</li>)}</ol>
          <div className="cg-opts" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>{shuf.filter((s) => !placed.includes(s)).map((s) => <button type="button" key={s} draggable className={`btn cg-opt b2-step${shake === s ? " wrong" : ""}${drag === s ? " dragging" : ""}`} onClick={() => tap(s)}
            onDragStart={(e) => { e.dataTransfer.setData("text/plain", s); e.dataTransfer.effectAllowed = "move"; setDrag(s); }} onDragEnd={() => { setDrag(""); setOver(-1); }}>{s}</button>)}</div>
          {phase === "next" && <><p className="agm-why ok"><b>Correct!</b> {mistakes === 0 ? "In perfect order." : `Done, with ${mistakes} slip${mistakes === 1 ? "" : "s"}.`}</p><div className="agm-row"><button type="button" className="btn primary" onClick={next} autoFocus>{i + 1 >= order.length ? "Finish" : "Next process"}</button></div></>}</div>
      ) : <div className="agm-end static"><button type="button" className="btn primary" onClick={again}>Play again</button></div>}
    </Shell>
  );
}
