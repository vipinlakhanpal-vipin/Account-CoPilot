"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { GAMES, type GameEvent, type GameId, type WinData } from "@/components/games/registry";
import { AriaOrb, type Mood } from "@/components/AriaFace";
import Jigsaw from "@/components/games/Jigsaw";
import { Quiz, Words } from "@/components/AriaMiniGames";

// Aria's playroom: she is the host. She greets you, introduces each game, cheers when you get something right, groans when you don't, nudges you when you are stuck, and congratulates you at the end.
// Her face and the little hop or shake follow what happens in the game (each game reports its events through onEvent).
const LINES: Record<GameEvent | "arrive" | "idle", string[]> = {
  arrive: ["Hi, I'm Aria! Pick a book from my shelf and I'll play with you.", "You came to play! Pick a book and I'll keep score."],
  idle: ["Still there? Pick a book, I'm ready when you are.", "I can wait all day. Well, almost."],
  start: ["Go!", "Here we go!", "Let's see what you've got."],
  good: ["Nice one!", "Yes! Just like that.", "You're good at this.", "Perfect."],
  bad: ["Oops. Try again.", "Not quite, but close.", "Hmm, so close."],
  hint: ["A little nudge from me.", "One letter, on the house. Don't tell anyone."],
  hurry: ["Tick tock! Ten seconds left!"],
  win: ["You did it! {d}. Want to beat that?", "{d}. I'm impressed.", "Well played! {d}."],
  lose: ["Time's up! We'll get it next round.", "Ouch, that was close. Again?"],
};
const INTRO: Record<GameId, string> = {
  jigsaw: "I'll fall to pieces and you put me back together. Ready?",
  quiz: "Eight quick true-or-false questions. I'll keep score.",
  words: "Four levels, no clock. I'll only speak up when you ask for a hint.",
};
const MOOD: Record<GameEvent, Mood> = { start: "happy", good: "cheer", bad: "oops", hint: "think", hurry: "oops", win: "cheer", lose: "oops" };
const spineH = (name: string) => Math.min(150, Math.max(104, 50 + name.length * 6.5));
const pickOne = (a: string[], not: string) => { const b = a.filter((x) => x !== not); return (b.length ? b : a)[Math.floor(Math.random() * (b.length || a.length))]; };

// ---- Awards: Aria presents a medal when you win. Jigsaw by time, True or false by score, Word scramble by hints. Kept in this browser.
type Medal = "gold" | "silver" | "bronze" | "ribbon";
type Award = { medal: Medal; title: string; line: string; badge?: string };
const MEDAL_NAME: Record<Medal, string> = { gold: "Gold medal", silver: "Silver medal", bronze: "Bronze medal", ribbon: "Ribbon for trying" };
function awardFor(id: GameId, d: WinData): Award {
  if (id === "jigsaw") {
    const t = d.seconds ?? 60, medal: Medal = t <= 35 ? "gold" : t <= 48 ? "silver" : "bronze";
    return { medal, title: MEDAL_NAME[medal], line: `You rebuilt me in ${t} seconds.`, badge: d.newBest ? "New best time" : undefined };
  }
  if (id === "quiz") {
    const sc = d.score ?? 0, medal: Medal = sc >= 8 ? "gold" : sc >= 6 ? "silver" : sc >= 4 ? "bronze" : "ribbon";
    return { medal, title: MEDAL_NAME[medal], line: `${sc} of ${d.total ?? 8} right.`, badge: sc >= 8 ? "Perfect round" : undefined };
  }
  const h = d.hints ?? 0, medal: Medal = h === 0 ? "gold" : h === 1 ? "silver" : "bronze";
  return { medal, title: MEDAL_NAME[medal], line: `Level ${d.level ?? 1} cleared${h ? ` with ${h} hint${h === 1 ? "" : "s"}` : " with no hints"}.`, badge: h === 0 ? "No hints" : undefined };
}
const AWARDS_KEY = "aria-awards";
type Stored = { g: GameId; m: Medal; at: string };
const loadAwards = (): Stored[] => { try { const v = JSON.parse(localStorage.getItem(AWARDS_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const MEDAL_LINE: Record<Medal, string> = { gold: "Gold! You earned every bit of that.", silver: "Silver! So close to gold.", bronze: "Bronze! On the podium.", ribbon: "A ribbon for trying. I'm proud of you." };

// ---- Aria's chat about the game: free, answered from what she knows about the games (no AI call, no cost).
const HOW: Record<GameId, string> = {
  jigsaw: "Press Play and I break into nine pieces. Drag each piece onto the dashed board where it fits; it clicks into place when it's close. You have 60 seconds, and the picture is new every game.",
  quiz: "You get eight statements about source-to-pay and how CoPilot works. Press True or False for each one, and I explain the answer. You have 45 seconds in all.",
  words: "I show a clue and scrambled letters. Tap the letters, or just type them, in the right order. There are four levels (3, 5, 7 and 10 letters, five words each) and no timer. Hint places the next right letter.",
};
const TIPS: Record<GameId, string> = {
  jigsaw: "Start with the corners and the pieces with a flat edge. Keep the board in view, and don't drag a piece far: it snaps in when it's close.",
  quiz: "Read the whole statement before you answer. Words like always or only are often a warning sign. And read my explanation after each answer: that's how you learn the words the app uses.",
  words: "Start from the clue and guess the first letter. Use Hint when you're stuck, but a word solved with a hint can't earn gold.",
};
const SCORING: Record<GameId, string> = {
  jigsaw: "Medals by time: gold up to 35 seconds, silver up to 48, bronze up to 60. Beat your own best and I add a New best badge.",
  quiz: "Medals by score: gold for 8 of 8, silver for 6 or 7, bronze for 4 or 5, and a ribbon below that. Time's up means no medal.",
  words: "Each level gives a medal: gold with no hints, silver with one hint, bronze with two or more.",
};
const TIME: Record<GameId, string> = { jigsaw: "The jigsaw gives you 60 seconds.", quiz: "True or false gives you 45 seconds for all eight questions.", words: "Word scramble has no timer at all. Take as long as you like." };
const NAMES: [RegExp, number][] = [[/jigsaw|puzzle|pieces/, 0], [/true|false|quiz/, 1], [/word|scramble|letters/, 2]];
function reply(q: string, idx: number, bestOf: (i: number) => string): { text: string; full?: boolean } {
  const t = q.toLowerCase(), named = NAMES.find(([r]) => r.test(t)), i = named ? named[1] : idx, id = GAMES[i].id as GameId;
  const lead = named && named[1] !== idx ? `About ${GAMES[i].name}: ` : "";
  if (/^(hi|hello|hey)\b/.test(t)) return { text: "Hi! Ask me how a game works, for tips, or how the medals are won." };
  if (/medal|award|gold|silver|bronze|score|point|trophy/.test(t)) return { text: lead + SCORING[id] };
  if (/best|record/.test(t)) return { text: `Your best in ${GAMES[i].name}: ${bestOf(i)}.` };
  if (/time|how long|second|clock|timer|minute/.test(t)) return { text: lead + TIME[id] };
  if (/level/.test(t)) return { text: "Levels are in Word scramble: Level 1 has 3-letter words, Level 2 has 5, Level 3 has 7 and Level 4 has 10, five words each. Pick any level from the tabs." };
  if (/tip|hint|help|stuck|trick|advice/.test(t)) return { text: lead + TIPS[id] };
  if (/restart|again|stop|quit|close|leave|exit/.test(t)) return { text: "Use Play again to start over, or Close inside the game to stop. Done playing in the left panel takes you back to your work." };
  if (/how|play|rule|instruction|work|explain|what do i|what is|start/.test(t) || named) return { text: lead + HOW[id] };
  return { text: "I'm best at questions about the games here: how to play, tips, time and medals. For anything about your accounts, my full chat can help.", full: true };
}

function View({ id, onClose, onEvent }: { id: GameId; onClose: () => void; onEvent: (e: GameEvent, d?: string, data?: WinData) => void }) {
  if (id === "jigsaw") return <Jigsaw onClose={onClose} onEvent={onEvent} />;
  if (id === "quiz") return <Quiz onClose={onClose} onEvent={onEvent} />;
  return <Words onClose={onClose} onEvent={onEvent} />;
}

function AwardCard({ a, onClose }: { a: Award; onClose: () => void }) {
  const bits = Array.from({ length: 22 }, (_, i) => i);
  return (
    <div className="gr-award" role="dialog" aria-label={a.title}>
      <div className="gr-confetti" aria-hidden="true">{bits.map((i) => <i key={i} style={{ left: `${(i * 4.7 + 3) % 100}%`, animationDelay: `${(i % 7) * 0.12}s`, background: ["#F5C242", "#2EC4A6", "#7A67E8", "#F0997B", "#85B7EB"][i % 5] }} />)}</div>
      <p className="gr-award-from">Aria presents</p>
      <i className={`medal big ${a.medal}`} aria-hidden="true" />
      <b className="gr-award-t">{a.title}</b>
      <span className="gr-award-l">{a.line}</span>
      {a.badge && <span className="gr-award-badge">{a.badge}</span>}
      <button type="button" className="btn primary" onClick={onClose}>Thanks, Aria</button>
    </div>
  );
}

export default function GameRoom() {
  const [pick, setPick] = useState(0), [run, setRun] = useState(0), [playing, setPlaying] = useState(false), [, tick] = useState(0);
  const [say, setSay] = useState(LINES.arrive[0]), [mood, setMood] = useState<Mood>("happy"), [anim, setAnim] = useState<"" | "hop" | "shake">(""), last = useRef(""), idleAt = useRef(Date.now());
  const [awards, setAwards] = useState<Stored[]>([]), [shown, setShown] = useState<Award | null>(null);
  const [msgs, setMsgs] = useState<{ who: "you" | "aria"; text: string }[]>([]), [q, setQ] = useState(""), [offerFull, setOfferFull] = useState(false), logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setAwards(loadAwards()); }, []);
  const speak = useCallback((text: string, m: Mood, a: "" | "hop" | "shake" = "") => {
    last.current = text; idleAt.current = Date.now(); setSay(text); setMood(m); setAnim(""); if (a) setTimeout(() => setAnim(a), 20);
  }, []);
  useEffect(() => { setSay(pickOne(LINES.arrive, "")); try { const i = GAMES.findIndex((g) => g.id === localStorage.getItem("aria-game-pick")); if (i >= 0) setPick(i); } catch { /* optional */ } }, []);
  useEffect(() => { if (!playing) return; const t = setInterval(() => tick((x) => x + 1), 1500); return () => clearInterval(t); }, [playing]); // keeps "best" fresh while a game runs
  useEffect(() => { // if nothing happens for a while, she nudges you
    const t = setInterval(() => { if (!playing && Date.now() - idleAt.current > 25000) speak(pickOne(LINES.idle, last.current), "think"); }, 5000);
    return () => clearInterval(t);
  }, [playing, speak]);
  const react = useCallback((e: GameEvent, d = "", data?: WinData) => {
    speak(pickOne(LINES[e], last.current).replace("{d}", d), MOOD[e], e === "good" || e === "win" ? "hop" : e === "bad" || e === "lose" ? "shake" : "");
    if (e === "win" && data) { // she presents a medal
      const id = GAMES[pickRef.current].id as GameId, a = awardFor(id, data);
      const rec: Stored = { g: id, m: a.medal, at: new Date().toISOString() };
      const all = [rec, ...loadAwards()].slice(0, 200); try { localStorage.setItem(AWARDS_KEY, JSON.stringify(all)); } catch { /* optional */ }
      setAwards(all); setShown(a); speak(MEDAL_LINE[a.medal], "cheer", "hop");
    }
  }, [speak]);
  const pickRef = useRef(0); pickRef.current = pick;
  const g = GAMES[pick];
  const choose = (i: number) => { setPick(i); setPlaying(false); setShown(null); speak(INTRO[GAMES[i].id], "happy", "hop"); try { localStorage.setItem("aria-game-pick", GAMES[i].id); } catch { /* optional */ } };
  const play = () => { setRun((r) => r + 1); setPlaying(true); setShown(null); };
  const askAria = () => document.querySelector<HTMLButtonElement>(".nav-aria-mini")?.click();
  const ask = (text: string) => {
    const t = text.trim(); if (!t) return;
    const r = reply(t, pick, (i) => GAMES[i].best().replace(/^Best /, ""));
    const named = NAMES.find(([re]) => re.test(t.toLowerCase())); if (named && named[1] !== pick) { setPick(named[1]); setPlaying(false); }
    setMsgs((m) => [...m.slice(-7), { who: "you", text: t }, { who: "aria", text: r.text }]); setOfferFull(!!r.full); speak(r.text, "happy"); setQ("");
    setTimeout(() => logRef.current?.scrollTo({ top: 1e5 }), 30);
  };
  const count = (m: Medal) => awards.filter((a) => a.m === m).length;
  return (
    <div className="gr">
      <div className="gr-host">
        <AriaOrb mood={mood} size={104} anim={anim} />
        <div className="gr-say" role="status" aria-live="polite"><b>Aria</b><p>{say}</p></div>
        <div className="gr-awards" title="Medals Aria has given you (kept in this browser)" aria-label="Your medals">
          <span className="gr-awards-h">Your medals</span>
          {(["gold", "silver", "bronze"] as Medal[]).map((m) => <span key={m} className="gr-medal-count"><i className={`medal ${m}`} aria-hidden="true" />{count(m)}</span>)}
        </div>
      </div>
      <form className="gr-chat" onSubmit={(e) => { e.preventDefault(); ask(q); }} aria-label="Ask Aria about the game">
        {msgs.length > 0 && <div className="gr-chat-log" ref={logRef}>{msgs.map((m, i) => <p key={i} className={m.who}><b>{m.who === "you" ? "You" : "Aria"}</b> {m.text}</p>)}</div>}
        <div className="gr-chat-row">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Ask Aria about ${g.name}: how to play, tips, medals…`} aria-label="Your question for Aria" maxLength={160} />
          <button type="submit" className="btn primary">Ask</button>
        </div>
        <div className="gr-chips">
          {["How do I play?", "Any tips?", "How do I win a medal?", "How long do I have?"].map((c) => <button type="button" key={c} onClick={() => ask(c)}>{c}</button>)}
          {offerFull && <button type="button" className="full" onClick={askAria}>Open my full chat</button>}
        </div>
      </form>
      <div className="gr-shelf" role="tablist" aria-label="Aria's games">
        {GAMES.map((x, i) => (
          <button type="button" key={x.id} role="tab" aria-selected={i === pick} className="gr-spine" onClick={() => choose(i)} title={x.name}
            style={{ height: spineH(x.name) + (i === pick ? 12 : 0), background: x.fill, color: x.ink }}>
            {x.icon}<span>{x.name}</span>
          </button>))}
        <div className="gr-shelf-fill" aria-hidden="true" />
      </div>
      <div className="gr-body">
        <div className="gr-card">
          <div className="gr-card-top">
            <span className="gr-ic" style={{ background: g.fill, color: g.ink }}>{g.icon}</span>
            <div><b>{g.name}</b><span className="gr-chip">{g.timed ? "⏱ " : "∞ "}{g.time}</span></div>
          </div>
          <p>{g.blurb}</p>
          <div className="gr-foot"><span>🏆 {g.best()}</span><button type="button" className="btn primary" onClick={play}>{playing ? "Play again" : "Play with Aria"}</button></div>
        </div>
        <div className="gr-play">
          {shown && <AwardCard a={shown} onClose={() => setShown(null)} />}
          {playing ? <View key={`${g.id}-${run}`} id={g.id} onClose={() => { setPlaying(false); speak("Good game! Pick another book whenever you like.", "happy"); }} onEvent={react} />
            : <div className="gr-idle"><span className="gr-ic big" style={{ background: g.fill, color: g.ink }}>{g.icon}</span><b>{g.name}</b><span>Press Play with Aria. We play right here.</span></div>}
        </div>
      </div>
    </div>
  );
}
