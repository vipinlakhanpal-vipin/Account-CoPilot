"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Shell, shuffle, useCountdown, getBest, setBestKey, type Ev } from "@/components/AriaMiniGames";

// Four brain-training games, each aimed at one cognitive skill: Pattern memory (working memory), Math sprint (mental arithmetic and speed), Colour clash (attention and self-control),
// Number series (reasoning). Each reports what happens to its host through onEvent, like the other games.
const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const options = (answer: number, spread: number) => {
  const set = new Set<number>([answer]);
  while (set.size < 4) { const d = rnd(1, spread) * (Math.random() < 0.5 ? -1 : 1); set.add(answer + d); }
  return shuffle([...set]);
};

// ------------------------------------------------------------------ Pattern memory
const PADS = [{ c: "#E24B4A", n: "Red" }, { c: "#378ADD", n: "Blue" }, { c: "#1D9E75", n: "Green" }, { c: "#EF9F27", n: "Amber" }];
export function PatternMemory({ onClose, onEvent }: { onClose: () => void; onEvent?: Ev }) {
  const [seq, setSeq] = useState<number[]>([]), [step, setStep] = useState(0), [lit, setLit] = useState(-1);
  const [phase, setPhase] = useState<"show" | "input" | "over">("show"), [best, setBest] = useState<number | null>(getBest("aria-pattern-best"));
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const play = useCallback((s: number[]) => {
    clear(); setPhase("show"); setStep(0);
    s.forEach((p, i) => { timers.current.push(setTimeout(() => setLit(p), 600 + i * 650), setTimeout(() => setLit(-1), 600 + i * 650 + 420)); });
    timers.current.push(setTimeout(() => setPhase("input"), 600 + s.length * 650));
  }, []);
  const begin = useCallback(() => { const s = [rnd(0, 3)]; setSeq(s); onEvent?.("start"); play(s); }, [play, onEvent]);
  useEffect(() => { begin(); return clear; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const press = (p: number) => {
    if (phase !== "input") return;
    setLit(p); setTimeout(() => setLit(-1), 180);
    if (p !== seq[step]) {
      const score = seq.length - 1; setPhase("over");
      setBest((b) => { const n = b === null || score > b ? score : b; setBestKey("aria-pattern-best", n); return n; });
      onEvent?.(score >= 4 ? "win" : "lose", `${score} in a row`, { score, total: 8 });
      return;
    }
    if (step + 1 === seq.length) { onEvent?.("good"); const s = [...seq, rnd(0, 3)]; setSeq(s); setTimeout(() => play(s), 700); } else setStep(step + 1);
  };
  const score = phase === "over" ? seq.length - 1 : seq.length - 1;
  return (
    <Shell title={phase === "over" ? "Game over" : phase === "show" ? "Watch closely" : "Your turn"}
      sub={phase === "over" ? `You repeated ${score} in a row${best !== null ? ` · best ${best}` : ""}` : "Watch the pads light up, then repeat the order. It grows by one each round."}
      info={`Round ${seq.length}`} info2={`${Math.max(0, score)} in a row`} onClose={onClose} onRestart={begin}>
      <div className="cg-pads" role="group" aria-label="Pads">
        {PADS.map((p, i) => <button type="button" key={p.n} aria-label={p.n} className={`cg-pad${lit === i ? " lit" : ""}`} style={{ ["--pc" as string]: p.c }} onClick={() => press(i)} disabled={phase !== "input"} />)}
      </div>
      {phase === "over" && <div className="agm-end static"><button type="button" className="btn primary" onClick={begin}>Play again</button></div>}
    </Shell>
  );
}

// ------------------------------------------------------------------ Math sprint
type Q = { text: string; ans: number; opts: number[] };
function makeQ(n: number): Q {
  const hard = Math.min(3, Math.floor(n / 4)), r = Math.random();
  let a: number, b: number, text: string, ans: number;
  if (r < 0.4) { a = rnd(5 + hard * 10, 20 + hard * 25); b = rnd(4 + hard * 8, 20 + hard * 20); ans = a + b; text = `${a} + ${b}`; }
  else if (r < 0.75) { a = rnd(15 + hard * 15, 45 + hard * 30); b = rnd(3, 12 + hard * 10); ans = a - b; text = `${a} − ${b}`; }
  else { a = rnd(3, 9 + hard * 2); b = rnd(3, 9 + hard * 2); ans = a * b; text = `${a} × ${b}`; }
  return { text, ans, opts: options(ans, 6 + hard * 2) };
}
export function MathSprint({ onClose, onEvent }: { onClose: () => void; onEvent?: Ev }) {
  const [q, setQ] = useState<Q>(() => makeQ(0)), [n, setN] = useState(0), [score, setScore] = useState(0), [pick, setPick] = useState<number | null>(null);
  const [phase, setPhase] = useState<"play" | "over">("play"), [best, setBest] = useState<number | null>(getBest("aria-math-best"));
  const sc = useRef(0); sc.current = score;
  const left = useCountdown(45, phase === "play", () => {
    const s = sc.current; setPhase("over"); setBest((b) => { const nb = b === null || s > b ? s : b; setBestKey("aria-math-best", nb); return nb; });
    onEvent?.(s >= 7 ? "win" : "lose", `${s} right`, { score: s, total: 15 });
  });
  useEffect(() => { onEvent?.("start"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const answer = (v: number) => {
    if (pick !== null || phase !== "play") return;
    setPick(v); const ok = v === q.ans; if (ok) setScore((x) => x + 1); onEvent?.(ok ? "good" : "bad");
    setTimeout(() => { setN((x) => x + 1); setQ(makeQ(n + 1)); setPick(null); }, 450);
  };
  const again = () => { setScore(0); setN(0); setQ(makeQ(0)); setPick(null); setPhase("play"); onEvent?.("start"); };
  return (
    <Shell title={phase === "over" ? "Time's up" : "Math sprint"} sub={phase === "over" ? `${score} right${best !== null ? ` · best ${best}` : ""}` : "Pick the right answer as fast as you can. 45 seconds."}
      left={left} total={45} info={`${Math.ceil(left)} s left`} info2={`${score} right`} onClose={onClose} onRestart={again}>
      {phase === "play" ? (
        <div className="cg-q"><p className="cg-big">{q.text} = ?</p>
          <div className="cg-opts">{q.opts.map((o) => <button type="button" key={o} className={`btn cg-opt${pick !== null ? (o === q.ans ? " right" : pick === o ? " wrong" : "") : ""}`} onClick={() => answer(o)} disabled={pick !== null}>{o}</button>)}</div></div>
      ) : <div className="agm-end static"><button type="button" className="btn primary" onClick={again}>Play again</button></div>}
    </Shell>
  );
}

// ------------------------------------------------------------------ Colour clash (Stroop)
const INKS = [{ n: "RED", c: "#E24B4A" }, { n: "BLUE", c: "#378ADD" }, { n: "GREEN", c: "#1D9E75" }, { n: "AMBER", c: "#E0900F" }];
const makeClash = () => { const w = rnd(0, 3); let c = rnd(0, 3); if (c === w) c = (c + 1 + rnd(0, 2)) % 4; return { w, c }; };
export function ColourClash({ onClose, onEvent }: { onClose: () => void; onEvent?: Ev }) {
  const [t, setT] = useState(makeClash), [score, setScore] = useState(0), [flash, setFlash] = useState<"" | "ok" | "no">("");
  const [phase, setPhase] = useState<"play" | "over">("play"), [best, setBest] = useState<number | null>(getBest("aria-stroop-best"));
  const sc = useRef(0); sc.current = score;
  const left = useCountdown(30, phase === "play", () => {
    const s = sc.current; setPhase("over"); setBest((b) => { const nb = b === null || s > b ? s : b; setBestKey("aria-stroop-best", nb); return nb; });
    onEvent?.(s >= 10 ? "win" : "lose", `${s} right`, { score: s, total: 25 });
  });
  useEffect(() => { onEvent?.("start"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const answer = (i: number) => {
    if (phase !== "play") return;
    const ok = i === t.c; if (ok) setScore((x) => x + 1); setFlash(ok ? "ok" : "no"); onEvent?.(ok ? "good" : "bad");
    setTimeout(() => setFlash(""), 160); setT(makeClash());
  };
  const again = () => { setScore(0); setT(makeClash()); setPhase("play"); onEvent?.("start"); };
  return (
    <Shell title={phase === "over" ? "Time's up" : "Colour clash"} sub={phase === "over" ? `${score} right${best !== null ? ` · best ${best}` : ""}` : "Press the colour the word is written in, not the word it spells. 30 seconds."}
      left={left} total={30} info={`${Math.ceil(left)} s left`} info2={`${score} right`} onClose={onClose} onRestart={again}>
      {phase === "play" ? (
        <div className="cg-q"><p className={`cg-word${flash ? ` ${flash}` : ""}`} style={{ color: INKS[t.c].c }}>{INKS[t.w].n}</p>
          <div className="cg-opts">{INKS.map((k, i) => <button type="button" key={k.n} className="btn cg-opt cg-ink" onClick={() => answer(i)}><i style={{ background: k.c }} aria-hidden="true" />{k.n[0] + k.n.slice(1).toLowerCase()}</button>)}</div></div>
      ) : <div className="agm-end static"><button type="button" className="btn primary" onClick={again}>Play again</button></div>}
    </Shell>
  );
}

// ------------------------------------------------------------------ Number series
type Series = { shown: number[]; ans: number; why: string };
function makeSeries(): Series {
  const k = rnd(0, 5);
  if (k === 0) { const a = rnd(2, 15), d = rnd(2, 9), s = Array.from({ length: 6 }, (_, i) => a + d * i); return { shown: s.slice(0, 5), ans: s[5], why: `It goes up by ${d} each time.` }; }
  if (k === 1) { const a = rnd(1, 4), r = rnd(2, 3), s = Array.from({ length: 6 }, (_, i) => a * r ** i); return { shown: s.slice(0, 5), ans: s[5], why: `Each number is ${r} times the one before.` }; }
  if (k === 2) { const a = rnd(1, 6), s = [a, a + 1]; for (let i = 2; i < 6; i++) s.push(s[i - 1] + s[i - 2]); return { shown: s.slice(0, 5), ans: s[5], why: "Each number is the sum of the two before it." }; }
  if (k === 3) { const a = rnd(2, 9), d = rnd(1, 3), s = [a]; for (let i = 1; i < 6; i++) s.push(s[i - 1] + d * i + 1); return { shown: s.slice(0, 5), ans: s[5], why: "The step grows by the same amount each time." }; }
  if (k === 4) { const a = rnd(1, 5), s = Array.from({ length: 6 }, (_, i) => (a + i) ** 2); return { shown: s.slice(0, 5), ans: s[5], why: "These are square numbers: 1, 4, 9, 16 and so on." }; }
  const a = rnd(20, 60), b = rnd(3, 9), c = rnd(2, 6), s: number[] = []; for (let i = 0; i < 6; i++) s.push(i % 2 === 0 ? a + c * (i / 2) : b + c * ((i - 1) / 2)); return { shown: s.slice(0, 5), ans: s[5], why: "Two lists are mixed: every second number follows its own pattern." };
}
const SN = 8;
export function NumberSeries({ onClose, onEvent }: { onClose: () => void; onEvent?: Ev }) {
  const [q, setQ] = useState(makeSeries), [opts, setOpts] = useState<number[]>([]), [i, setI] = useState(0), [score, setScore] = useState(0), [pick, setPick] = useState<number | null>(null);
  const [phase, setPhase] = useState<"play" | "over">("play"), [best, setBest] = useState<number | null>(getBest("aria-series-best"));
  useEffect(() => { setOpts(options(q.ans, 8)); }, [q]);
  useEffect(() => { onEvent?.("start"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const answer = (v: number) => {
    if (pick !== null) return;
    const ok = v === q.ans, s = score + (ok ? 1 : 0); setPick(v); setScore(s); onEvent?.(ok ? "good" : "bad");
  };
  const next = () => {
    if (i + 1 >= SN) { setPhase("over"); setBest((b) => { const nb = b === null || score > b ? score : b; setBestKey("aria-series-best", nb); return nb; }); onEvent?.(score >= 5 ? "win" : "lose", `${score} of ${SN}`, { score, total: SN }); return; }
    setI(i + 1); setPick(null); setQ(makeSeries());
  };
  const again = () => { setI(0); setScore(0); setPick(null); setPhase("play"); setQ(makeSeries()); onEvent?.("start"); };
  return (
    <Shell title={phase === "over" ? "Series finished" : "Number series"} sub={phase === "over" ? `${score} of ${SN} right${best !== null ? ` · best ${best}` : ""}` : "Find the number that comes next. No timer."}
      info={phase === "over" ? "" : `Question ${i + 1} of ${SN}`} info2={`${score} right`} onClose={onClose} onRestart={again}>
      {phase === "play" ? (
        <div className="cg-q"><p className="cg-big">{q.shown.join(", ")}, <span className="cg-qm">?</span></p>
          <div className="cg-opts">{opts.map((o) => <button type="button" key={o} className={`btn cg-opt${pick !== null ? (o === q.ans ? " right" : pick === o ? " wrong" : "") : ""}`} onClick={() => answer(o)} disabled={pick !== null}>{o}</button>)}</div>
          {pick !== null && <p className={`agm-why ${pick === q.ans ? "ok" : "no"}`}><b>{pick === q.ans ? "Correct!" : `Incorrect. The answer is ${q.ans}.`}</b> {q.why}</p>}
          {pick !== null && <div className="agm-row"><button type="button" className="btn primary" onClick={next} autoFocus>{i + 1 >= SN ? "Finish" : "Next"}</button></div>}
        </div>
      ) : <div className="agm-end static"><button type="button" className="btn primary" onClick={again}>Play again</button></div>}
    </Shell>
  );
}
