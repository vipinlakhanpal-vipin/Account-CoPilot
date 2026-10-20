"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { GAMES, type GameEvent, type GameId } from "@/components/games/registry";
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

function View({ id, onClose, onEvent }: { id: GameId; onClose: () => void; onEvent: (e: GameEvent, d?: string) => void }) {
  if (id === "jigsaw") return <Jigsaw onClose={onClose} onEvent={onEvent} />;
  if (id === "quiz") return <Quiz onClose={onClose} onEvent={onEvent} />;
  return <Words onClose={onClose} onEvent={onEvent} />;
}

export default function GameRoom() {
  const [pick, setPick] = useState(0), [run, setRun] = useState(0), [playing, setPlaying] = useState(false), [, tick] = useState(0);
  const [say, setSay] = useState(LINES.arrive[0]), [mood, setMood] = useState<Mood>("happy"), [anim, setAnim] = useState<"" | "hop" | "shake">(""), last = useRef(""), idleAt = useRef(Date.now());
  const speak = useCallback((text: string, m: Mood, a: "" | "hop" | "shake" = "") => {
    last.current = text; idleAt.current = Date.now(); setSay(text); setMood(m); setAnim(""); if (a) setTimeout(() => setAnim(a), 20);
  }, []);
  useEffect(() => { setSay(pickOne(LINES.arrive, "")); try { const i = GAMES.findIndex((g) => g.id === localStorage.getItem("aria-game-pick")); if (i >= 0) setPick(i); } catch { /* optional */ } }, []);
  useEffect(() => { if (!playing) return; const t = setInterval(() => tick((x) => x + 1), 1500); return () => clearInterval(t); }, [playing]); // keeps "best" fresh while a game runs
  useEffect(() => { // if nothing happens for a while, she nudges you
    const t = setInterval(() => { if (!playing && Date.now() - idleAt.current > 25000) speak(pickOne(LINES.idle, last.current), "think"); }, 5000);
    return () => clearInterval(t);
  }, [playing, speak]);
  const react = useCallback((e: GameEvent, d = "") => {
    speak(pickOne(LINES[e], last.current).replace("{d}", d), MOOD[e], e === "good" || e === "win" ? "hop" : e === "bad" || e === "lose" ? "shake" : "");
  }, [speak]);
  const g = GAMES[pick];
  const choose = (i: number) => { setPick(i); setPlaying(false); speak(INTRO[GAMES[i].id], "happy", "hop"); try { localStorage.setItem("aria-game-pick", GAMES[i].id); } catch { /* optional */ } };
  const play = () => { setRun((r) => r + 1); setPlaying(true); };
  const askAria = () => document.querySelector<HTMLButtonElement>(".nav-aria-mini")?.click();
  return (
    <div className="gr">
      <div className="gr-host">
        <AriaOrb mood={mood} size={104} anim={anim} />
        <div className="gr-say" role="status" aria-live="polite"><b>Aria</b><p>{say}</p></div>
        <button type="button" className="btn gr-askbtn" onClick={askAria}>Ask me something instead</button>
      </div>
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
          {playing ? <View key={`${g.id}-${run}`} id={g.id} onClose={() => { setPlaying(false); speak("Good game! Pick another book whenever you like.", "happy"); }} onEvent={react} />
            : <div className="gr-idle"><span className="gr-ic big" style={{ background: g.fill, color: g.ink }}>{g.icon}</span><b>{g.name}</b><span>Press Play with Aria. We play right here.</span></div>}
        </div>
      </div>
    </div>
  );
}
