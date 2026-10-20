"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { GAMES, type GameEvent, type GameId, type WinData } from "@/components/games/registry";
import { AriaOrb, type Mood } from "@/components/AriaFace";
import Jigsaw from "@/components/games/Jigsaw";
import { Quiz, Words } from "@/components/AriaMiniGames";
import { PatternMemory, MathSprint, ColourClash, NumberSeries } from "@/components/games/Cognitive";
import { ReactionTest, DigitSpan, OddOneOut, ProcessOrder } from "@/components/games/Brain2";

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
// Mischief: while nobody is playing she teases, pokes a book on the shelf, spins and peeks, and she giggles when poked. Her eyes follow the pointer.
const TEASE = [
  "Are you going to play, or just stare at me? 😏", "Psst… Colour clash is harder than it looks. Dare you?", "I bet you can't beat the jigsaw in 35 seconds. Prove me wrong.",
  "Look at that shelf. Those books won't open themselves.", "Don't make me pick a game for you. I will. Whoa, I just did.", "I can do this all day. Can you? 😜",
  "Pattern memory says you'll forget by round 5. Just saying.", "Click me. Go on. I dare you.",
];
const POKED = ["Hehe, that tickles!", "Ooh, do that again.", "Hey! I'm working here. Sort of.", "Boop! 😄", "Careful, I'm ticklish."];
const DIZZY = "Okay okay, stop poking me! I'm dizzy 😵";
const INTRO: Record<GameId, string> = {
  jigsaw: "I'll fall to pieces and you put me back together. Ready?",
  quiz: "Eight quick true-or-false questions. I'll keep score.",
  words: "Four levels, no clock. I'll only speak up when you ask for a hint.",
  pattern: "Watch the pads, then repeat the order. How long a chain can you hold in your head?",
  math: "Sums against the clock. Quick fingers, quick mind.",
  stroop: "Careful: the word and its colour will disagree. Trust your eyes, not your reading.",
  series: "Find what comes next. Every answer comes with the rule behind it.",
  react: "Fast fingers? Wait for green, then hit it. No cheating.",
  digits: "Hold the number in your head. How long a one can you carry?",
  odd: "Four things, one imposter. Spot the one that doesn't belong.",
  process: "Put the steps in the order they really happen.",
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
  if (id === "pattern") { const sc = d.score ?? 0, medal: Medal = sc >= 8 ? "gold" : sc >= 6 ? "silver" : "bronze"; return { medal, title: MEDAL_NAME[medal], line: `You held a chain of ${sc}.`, badge: sc >= 8 ? "Sharp memory" : undefined }; }
  if (id === "math") { const sc = d.score ?? 0, medal: Medal = sc >= 15 ? "gold" : sc >= 11 ? "silver" : "bronze"; return { medal, title: MEDAL_NAME[medal], line: `${sc} right in 45 seconds.`, badge: sc >= 15 ? "Human calculator" : undefined }; }
  if (id === "stroop") { const sc = d.score ?? 0, medal: Medal = sc >= 20 ? "gold" : sc >= 15 ? "silver" : "bronze"; return { medal, title: MEDAL_NAME[medal], line: `${sc} right in 30 seconds.`, badge: sc >= 20 ? "Laser focus" : undefined }; }
  if (id === "series") { const sc = d.score ?? 0, medal: Medal = sc >= 8 ? "gold" : sc >= 6 ? "silver" : "bronze"; return { medal, title: MEDAL_NAME[medal], line: `${sc} of ${d.total ?? 8} right.`, badge: sc >= 8 ? "Pattern spotter" : undefined }; }
  if (id === "react") { const ms = d.score ?? 500, medal: Medal = ms <= 260 ? "gold" : ms <= 340 ? "silver" : "bronze"; return { medal, title: MEDAL_NAME[medal], line: `Average ${ms} ms.`, badge: ms <= 260 ? "Lightning reflexes" : undefined }; }
  if (id === "digits") { const sc = d.score ?? 0, medal: Medal = sc >= 8 ? "gold" : sc >= 7 ? "silver" : "bronze"; return { medal, title: MEDAL_NAME[medal], line: `You held ${sc} digits.`, badge: sc >= 8 ? "Elephant memory" : undefined }; }
  if (id === "odd") { const sc = d.score ?? 0, medal: Medal = sc >= 8 ? "gold" : sc >= 7 ? "silver" : "bronze"; return { medal, title: MEDAL_NAME[medal], line: `${sc} of ${d.total ?? 8} right.`, badge: sc >= 8 ? "Sharp eye" : undefined }; }
  if (id === "process") { const sc = d.score ?? 0, medal: Medal = sc >= 5 ? "gold" : sc >= 4 ? "silver" : "bronze"; return { medal, title: MEDAL_NAME[medal], line: `${sc} of ${d.total ?? 5} in perfect order.`, badge: sc >= 5 ? "Process pro" : undefined }; }
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
  pattern: "Press Play and watch the four pads light up in an order. Then press them in the same order. Each round adds one more. A mistake ends the game, and the longest chain you held is your score.",
  math: "Each question is a sum with four possible answers. Press the right one. You have 45 seconds and the sums get harder as you go.",
  stroop: "A colour name appears written in a different colour. Press the colour the letters are painted in, not the colour the word says. You have 30 seconds.",
  series: "You see five numbers in a pattern. Pick the number that comes next. There are eight questions, no timer, and every answer shows the rule.",
  react: "Press nothing until the pad turns green, then click it as fast as you can. Clicking early costs the round. Five rounds, and your average time is your score.",
  digits: "A number flashes for a moment, then hides. Type it back and press Check. Each round adds one digit. A mistake ends the game.",
  odd: "You see four items. Press the one that does not belong with the other three. Eight questions, no timer, each answer explained.",
  process: "You see the name of a process and its steps in a jumbled order. Tap the steps in the order they happen. Five processes, no timer.",
};
const TIPS: Record<GameId, string> = {
  jigsaw: "Start with the corners and the pieces with a flat edge. Keep the board in view, and don't drag a piece far: it snaps in when it's close.",
  quiz: "Read the whole statement before you answer. Words like always or only are often a warning sign. And read my explanation after each answer: that's how you learn the words the app uses.",
  words: "Start from the clue and guess the first letter. Use Hint when you're stuck, but a word solved with a hint can't earn gold.",
  pattern: "Say the colours quietly to yourself, or group them in twos and threes. Don't look away while it plays.",
  math: "Round to tens, then adjust. Skip nothing: a wrong answer costs only time, so keep moving.",
  stroop: "Look at the colour first and ignore what the word says. It gets easier after a few tries.",
  series: "Look at the gaps between numbers first. If they are not equal, check whether the gaps themselves grow, or whether the numbers multiply.",
  react: "Rest your finger on the button and watch the colour, not the words. Don't guess: an early click wastes the round.",
  digits: "Chunk the number into pairs or threes, like a phone number, and say it quietly while it shows.",
  odd: "Find what three of them have in common first. The odd one is whatever is left over.",
  process: "Start with the very first and very last steps; the middle ones fall into place.",
};
const SCORING: Record<GameId, string> = {
  jigsaw: "Medals by time: gold up to 35 seconds, silver up to 48, bronze up to 60. Beat your own best and I add a New best badge.",
  quiz: "Medals by score: gold for 8 of 8, silver for 6 or 7, bronze for 4 or 5, and a ribbon below that. Time's up means no medal.",
  words: "Each level gives a medal: gold with no hints, silver with one hint, bronze with two or more.",
  pattern: "Win a medal by holding a chain of 4 or more: bronze for 4 or 5, silver for 6 or 7, gold for 8 or more.",
  math: "Medals by right answers: bronze for 7, silver for 11, gold for 15 or more.",
  stroop: "Medals by right answers: bronze for 10, silver for 15, gold for 20 or more.",
  series: "Medals by score: bronze for 5, silver for 6 or 7, gold for 8 of 8.",
  react: "You win a medal with an average of 500 ms or better: bronze up to 500, silver up to 340, gold up to 260.",
  digits: "You win a medal by holding 5 digits or more: bronze for 5 or 6, silver for 7, gold for 8 or more.",
  odd: "Medals by score: bronze for 5 or 6, silver for 7, gold for 8 of 8.",
  process: "A process counts as perfect when you tap every step right first time. Bronze for 3 perfect, silver for 4, gold for 5.",
};
const TIME: Record<GameId, string> = { jigsaw: "The jigsaw gives you 60 seconds.", quiz: "True or false gives you 45 seconds for all eight questions.", words: "Word scramble has no timer at all. Take as long as you like.", pattern: "Pattern memory has no timer. It ends when you make a mistake.", math: "Math sprint gives you 45 seconds.", stroop: "Colour clash gives you 30 seconds.", series: "Number series has no timer.", react: "Reaction speed is five quick rounds with no clock.", digits: "Digit span has no timer.", odd: "Odd one out has no timer.", process: "Process order has no timer." };
const NAMES: [RegExp, GameId][] = [[/jigsaw|puzzle|pieces/, "jigsaw"], [/true|false|quiz/, "quiz"], [/word|scramble|letters/, "words"], [/pattern|simon|pads/, "pattern"], [/math|sprint|sums|arithmetic/, "math"], [/colou?r|clash|stroop|ink/, "stroop"], [/series|sequence|next number/, "series"], [/react|reflex|speed test/, "react"], [/digit|span/, "digits"], [/odd|belong|imposter/, "odd"], [/process|order the steps/, "process"]];
function reply(q: string, idx: number, bestOf: (i: number) => string): { text: string; full?: boolean } {
  const t = q.toLowerCase(), named = NAMES.find(([r]) => r.test(t)), ni = named ? GAMES.findIndex((g) => g.id === named[1]) : -1, i = ni >= 0 ? ni : idx, id = GAMES[i].id as GameId;
  const lead = ni >= 0 && ni !== idx ? `About ${GAMES[i].name}: ` : "";
  if (/^(hi|hello|hey)\b/.test(t)) return { text: "Hi! Ask me how a game works, for tips, or how the medals are won." };
  if (/medal|award|gold|silver|bronze|score|point|trophy/.test(t)) return { text: lead + SCORING[id] };
  if (/best|record/.test(t)) return { text: `Your best in ${GAMES[i].name}: ${bestOf(i)}.` };
  if (/time|how long|second|clock|timer|minute/.test(t)) return { text: lead + TIME[id] };
  if (/download|get game|install|own/.test(t)) return { text: "Books with a download mark are not on your shelf yet. Select one and press Get game and it is added in a moment. Nothing is saved on your computer: the game is part of this app, and your shelf (which games you have) is remembered in this browser. You can remove a game from the shelf any time, and get it back later." };
  if (/skill|brain|train|cognitive|memory/.test(t)) return { text: "Each game trains something: " + GAMES.map((g) => `${g.name} (${g.skill.toLowerCase()})`).join(", ") + "." };
  if (/level/.test(t)) return { text: "Levels are in Word scramble: Level 1 has 3-letter words, Level 2 has 5, Level 3 has 7 and Level 4 has 10, five words each. Pick any level from the tabs." };
  if (/tip|hint|help|stuck|trick|advice/.test(t)) return { text: lead + TIPS[id] };
  if (/restart|again|stop|quit|close|leave|exit/.test(t)) return { text: "Use Play again to start over, or Close inside the game to stop. Done playing in the left panel takes you back to your work." };
  if (/how|play|rule|instruction|work|explain|what do i|what is|start/.test(t) || named) return { text: lead + HOW[id] };
  return { text: "I'm best at questions about the games here: how to play, tips, time and medals. For anything about your accounts, my full chat can help.", full: true };
}

function View({ id, onClose, onEvent }: { id: GameId; onClose: () => void; onEvent: (e: GameEvent, d?: string, data?: WinData) => void }) {
  if (id === "jigsaw") return <Jigsaw onClose={onClose} onEvent={onEvent} />;
  if (id === "quiz") return <Quiz onClose={onClose} onEvent={onEvent} />;
  if (id === "pattern") return <PatternMemory onClose={onClose} onEvent={onEvent} />;
  if (id === "math") return <MathSprint onClose={onClose} onEvent={onEvent} />;
  if (id === "stroop") return <ColourClash onClose={onClose} onEvent={onEvent} />;
  if (id === "series") return <NumberSeries onClose={onClose} onEvent={onEvent} />;
  if (id === "react") return <ReactionTest onClose={onClose} onEvent={onEvent} />;
  if (id === "digits") return <DigitSpan onClose={onClose} onEvent={onEvent} />;
  if (id === "odd") return <OddOneOut onClose={onClose} onEvent={onEvent} />;
  if (id === "process") return <ProcessOrder onClose={onClose} onEvent={onEvent} />;
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

const OWNED_KEY = "aria-games-owned";
const loadOwned = (): GameId[] => { try { const v = JSON.parse(localStorage.getItem(OWNED_KEY) || "null"); if (Array.isArray(v)) return v; } catch { /* optional */ } return GAMES.filter((g) => g.starter).map((g) => g.id); };

export default function GameRoom() {
  const [pick, setPick] = useState(0), [run, setRun] = useState(0), [playing, setPlaying] = useState(false), [, tick] = useState(0);
  const [say, setSay] = useState(LINES.arrive[0]), [mood, setMood] = useState<Mood>("happy"), [anim, setAnim] = useState<"" | "hop" | "shake" | "spin" | "peek">(""), last = useRef(""), idleAt = useRef(Date.now());
  const [awards, setAwards] = useState<Stored[]>([]), [shown, setShown] = useState<Award | null>(null);
  const [owned, setOwned] = useState<GameId[]>(() => GAMES.filter((g) => g.starter).map((g) => g.id)), [getting, setGetting] = useState<GameId | null>(null);
  const [filter, setFilter] = useState<"all" | "mine" | "new">("all");
  const [tip, setTip] = useState<{ i: number; left: number; bottom: number } | null>(null), wrapRef = useRef<HTMLDivElement>(null);
  const [msgs, setMsgs] = useState<{ who: "you" | "aria"; text: string }[]>([]), [q, setQ] = useState(""), [offerFull, setOfferFull] = useState(false), logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setAwards(loadAwards()); setOwned(loadOwned()); }, []);
  const speak = useCallback((text: string, m: Mood, a: "" | "hop" | "shake" | "spin" | "peek" = "") => {
    last.current = text; idleAt.current = Date.now(); setSay(text); setMood(m); setAnim(""); if (a) setTimeout(() => setAnim(a), 20);
  }, []);
  useEffect(() => { setSay(pickOne(LINES.arrive, "")); try { const i = GAMES.findIndex((g) => g.id === localStorage.getItem("aria-game-pick")); if (i >= 0) setPick(i); } catch { /* optional */ } }, []);
  useEffect(() => { if (!playing) return; const t = setInterval(() => tick((x) => x + 1), 1500); return () => clearInterval(t); }, [playing]); // keeps "best" fresh while a game runs
  useEffect(() => { // if nothing happens for a while, she nudges you
    const t = setInterval(() => { if (!playing && Date.now() - idleAt.current > 25000) speak(pickOne(LINES.idle, last.current), "think"); }, 5000);
    return () => clearInterval(t);
  }, [playing, speak]);
  const pickRef = useRef(0); pickRef.current = pick;
  const hostRef = useRef<HTMLDivElement>(null), pokes = useRef({ n: 0, at: 0 }), [wiggle, setWiggle] = useState(-1);
  // eyes follow the pointer
  useEffect(() => {
    const on = (e: MouseEvent) => {
      const h = hostRef.current, orb = h?.querySelector<HTMLElement>(".aria-orb"); if (!h || !orb) return;
      const r = orb.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 260);
      h.style.setProperty("--ex", String((dx / d) * 0.75 * k)); h.style.setProperty("--ey", String((dy / d) * 0.6 * k));
    };
    window.addEventListener("mousemove", on); return () => window.removeEventListener("mousemove", on);
  }, []);
  // every so often, while idle, she gets up to something
  const playingRef = useRef(false); playingRef.current = playing;
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      if (playingRef.current || Date.now() - idleAt.current < 9000) return;
      const r = Math.floor(Math.random() * 4);
      if (r === 0) speak(pickOne(TEASE, last.current), "wink", "hop");
      else if (r === 1) { const i = Math.floor(Math.random() * GAMES.length); setWiggle(i); setTimeout(() => setWiggle(-1), 1800); speak(`Psst, try ${GAMES[i].name}. ${GAMES[i].skill} needs a workout.`, "wink", "hop"); }
      else if (r === 2) speak("Wheee!", "cheer", "spin");
      else speak("Peekaboo! 👀", "wink", "peek");
    }, 7000);
    return () => clearInterval(t);
  }, [speak]);
  const poke = () => {
    const n = Date.now(), p = pokes.current; p.n = n - p.at < 1600 ? p.n + 1 : 1; p.at = n;
    if (p.n >= 5) { p.n = 0; speak(DIZZY, "dizzy", "spin"); } else speak(pickOne(POKED, last.current), "wink", "hop");
  };
  const react = useCallback((e: GameEvent, d = "", data?: WinData) => {
    speak(pickOne(LINES[e], last.current).replace("{d}", d), MOOD[e], e === "good" || e === "win" ? "hop" : e === "bad" || e === "lose" ? "shake" : "");
    if (e === "win" && data) { // she presents a medal
      const id = GAMES[pickRef.current].id as GameId, a = awardFor(id, data);
      const rec: Stored = { g: id, m: a.medal, at: new Date().toISOString() };
      const all = [rec, ...loadAwards()].slice(0, 200); try { localStorage.setItem(AWARDS_KEY, JSON.stringify(all)); } catch { /* optional */ }
      setAwards(all); setShown(a); speak(MEDAL_LINE[a.medal], "cheer", "hop");
    }
  }, [speak]);
  const g = GAMES[pick], has = owned.includes(g.id);
  const choose = (i: number) => { setPick(i); setPlaying(false); setShown(null); setTip(null); speak(owned.includes(GAMES[i].id) ? INTRO[GAMES[i].id] : `${GAMES[i].name} trains ${GAMES[i].skill.toLowerCase()}. Press Get game and I'll add it to your shelf.`, "happy", "hop"); try { localStorage.setItem("aria-game-pick", GAMES[i].id); } catch { /* optional */ } };
  const play = () => { setRun((r) => r + 1); setPlaying(true); setShown(null); };
  const getGame = () => {
    setGetting(g.id);
    setTimeout(() => {
      const next = owned.includes(g.id) ? owned : [...owned, g.id]; setOwned(next); setGetting(null);
      try { localStorage.setItem(OWNED_KEY, JSON.stringify(next)); } catch { /* optional */ }
      speak(`${g.name} is on your shelf now. Want to play it?`, "cheer", "hop");
    }, 900);
  };
  const removeGame = () => {
    const next = owned.filter((x) => x !== g.id); setOwned(next); setPlaying(false);
    try { localStorage.setItem(OWNED_KEY, JSON.stringify(next)); } catch { /* optional */ }
    speak(`${g.name} is off your shelf. It stays in the library if you change your mind.`, "oops");
  };
  const restoreStarters = () => {
    const next = GAMES.filter((x) => x.starter).map((x) => x.id); setOwned(next); setPlaying(false);
    try { localStorage.setItem(OWNED_KEY, JSON.stringify(next)); } catch { /* optional */ }
    speak("Back to the starter shelf: the jigsaw, True or false and Word scramble.", "happy");
  };
  const askAria = () => document.querySelector<HTMLButtonElement>(".nav-aria-mini")?.click();
  const ask = (text: string) => {
    const t = text.trim(); if (!t) return;
    const r = reply(t, pick, (i) => GAMES[i].best().replace(/^Best /, ""));
    const named = NAMES.find(([re]) => re.test(t.toLowerCase())), ni = named ? GAMES.findIndex((x) => x.id === named[1]) : -1; if (ni >= 0 && ni !== pick) { setPick(ni); setPlaying(false); }
    setMsgs((m) => [...m.slice(-7), { who: "you", text: t }, { who: "aria", text: r.text }]); setOfferFull(!!r.full); speak(r.text, "happy"); setQ("");
    setTimeout(() => logRef.current?.scrollTo({ top: 1e5 }), 30);
  };
  const count = (m: Medal) => awards.filter((a) => a.m === m).length;
  // the small window that describes a game while the pointer (or keyboard focus) is on its book
  const showTip = (i: number, el: HTMLElement) => {
    const wrap = wrapRef.current; if (!wrap) return;
    const W = 270, center = el.offsetLeft - (el.parentElement?.scrollLeft || 0) + el.offsetWidth / 2;
    setTip({ i, left: Math.max(4, Math.min(wrap.clientWidth - W - 4, center - W / 2)), bottom: wrap.clientHeight - el.offsetTop + 8 });
  };
  return (
    <div className="gr">
      <div className="gr-host" ref={hostRef}>
        <span className="gr-bob"><AriaOrb mood={mood} size={104} anim={anim} onClick={poke} /></span>
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
          {["How do I play?", "Any tips?", "How do I win a medal?", "Which skills do these train?"].map((c) => <button type="button" key={c} onClick={() => ask(c)}>{c}</button>)}
          {offerFull && <button type="button" className="full" onClick={askAria}>Open my full chat</button>}
        </div>
      </form>

      <div className="gr-shelfbar">
        <span><b>My shelf</b> · {owned.length} of {GAMES.length} games downloaded</span>
        <span className="gr-filters" role="group" aria-label="Show">
          {([["all", "All games"], ["mine", "On my shelf"], ["new", "Not downloaded"]] as const).map(([k, l]) => <button type="button" key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
        </span>
        <button type="button" className="btn tiny" onClick={restoreStarters} title="Keep only the three starter games">Restore starter set</button>
      </div>
      <div className="gr-shelfwrap" ref={wrapRef} onMouseLeave={() => setTip(null)}>
        <div className="gr-shelf" role="tablist" aria-label="Aria's games" onScroll={() => setTip(null)}>
          {GAMES.map((x, i) => {
            const mine = owned.includes(x.id);
            if ((filter === "mine" && !mine) || (filter === "new" && mine)) return null;
            return (
              <button type="button" key={x.id} role="tab" aria-selected={i === pick} className={`gr-spine${mine ? "" : " away"}${wiggle === i ? " wiggle" : ""}`} onClick={() => choose(i)}
                onMouseEnter={(e) => showTip(i, e.currentTarget)} onFocus={(e) => showTip(i, e.currentTarget)} onBlur={() => setTip(null)}
                style={{ height: spineH(x.name) + (i === pick ? 12 : 0), background: x.fill, color: x.ink }} aria-label={`${x.name}${mine ? "" : ", not downloaded yet"}`}>
                {x.icon}<span>{x.name}</span>
                {!mine && <svg className="gr-dl" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" /></svg>}
              </button>);
          })}
          <div className="gr-shelf-fill" aria-hidden="true" />
        </div>
        {tip && <div className="gr-tip" role="tooltip" style={{ left: tip.left, bottom: tip.bottom }}>
          <b>{GAMES[tip.i].name}</b>
          <span className="gr-tip-meta">{GAMES[tip.i].timed ? "⏱ " : "∞ "}{GAMES[tip.i].time} · {GAMES[tip.i].skill}</span>
          <p>{GAMES[tip.i].blurb}</p>
          <em>{owned.includes(GAMES[tip.i].id) ? "On your shelf" : "Not downloaded yet"}</em>
        </div>}
      </div>

      <div className="gr-row">
        <span className="gr-ic" style={{ background: g.fill, color: g.ink }}>{g.icon}</span>
        <div className="gr-row-main">
          <div className="gr-row-title"><b>{g.name}</b><span className="gr-chip">{g.timed ? "⏱ " : "∞ "}{g.time}</span><span className="gr-chip skill">{g.skill}</span></div>
          <p>{g.blurb}</p>
        </div>
        <span className="gr-row-best">🏆 {g.best()}</span>
        {has
          ? <span className="gr-go-wrap"><button type="button" className="btn primary gr-go" onClick={play}>{playing ? "Play again" : "Play with Aria"}</button>
              <button type="button" className="btn tiny gr-remove" onClick={removeGame} title="Take it off your shelf; you can download it again later">Remove</button></span>
          : <button type="button" className="btn primary gr-go" onClick={getGame} disabled={getting === g.id}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 6, verticalAlign: -2 }}><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" /></svg>{getting === g.id ? "Downloading…" : "Get game"}</button>}
      </div>

      <section className="gr-square" aria-label="Gaming Square">
        <div className="gr-square-head"><b>Gaming Square</b><span>Aria&apos;s playground. Pick a game above and we play right here.</span></div>
        <div className="gr-play">
          {shown && <AwardCard a={shown} onClose={() => setShown(null)} />}
          {playing && has ? <View key={`${g.id}-${run}`} id={g.id} onClose={() => { setPlaying(false); speak("Good game! Pick another book whenever you like.", "happy"); }} onEvent={react} />
            : <div className="gr-idle"><span className="gr-ic big" style={{ background: g.fill, color: g.ink }}>{g.icon}</span><b>{g.name}</b><span>{has ? "Press Play with Aria. The game opens right here." : "This game is not on your shelf yet. Press Get game to download it."}</span></div>}
        </div>
      </section>
    </div>
  );
}
