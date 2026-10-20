"use client";
import { useEffect, useState } from "react";
import { GAMES, type GameId } from "@/components/games/registry";
import Jigsaw from "@/components/games/Jigsaw";
import { Memory, Quiz, Words } from "@/components/AriaMiniGames";

// Aria's Game room: a page in the right-hand area. A bookshelf of games (slim books, so many fit; it scrolls sideways when there are more), the picked game's card, and a play area right in the page.
const spineH = (name: string) => Math.min(150, Math.max(104, 50 + name.length * 6.5));

function View({ id, onClose }: { id: GameId; onClose: () => void }) {
  if (id === "jigsaw") return <Jigsaw onClose={onClose} />;
  if (id === "memory") return <Memory onClose={onClose} />;
  if (id === "quiz") return <Quiz onClose={onClose} />;
  return <Words onClose={onClose} />;
}

export default function GameRoom() {
  const [pick, setPick] = useState(0), [run, setRun] = useState(0), [playing, setPlaying] = useState(false), [, tick] = useState(0);
  useEffect(() => { try { const i = GAMES.findIndex((g) => g.id === localStorage.getItem("aria-game-pick")); if (i >= 0) setPick(i); } catch { /* optional */ } }, []);
  useEffect(() => { if (!playing) return; const t = setInterval(() => tick((x) => x + 1), 1500); return () => clearInterval(t); }, [playing]); // keeps "best" fresh while a game runs
  const g = GAMES[pick];
  const choose = (i: number) => { setPick(i); setPlaying(false); try { localStorage.setItem("aria-game-pick", GAMES[i].id); } catch { /* optional */ } };
  const play = () => { setRun((r) => r + 1); setPlaying(true); };
  const askAria = () => document.querySelector<HTMLButtonElement>(".nav-aria-mini")?.click();
  return (
    <div className="gr">
      <div className="gr-head">
        <div><h1 className="nav-h">Game room</h1><p className="note">A few minutes off. Pick a book, then press Play. Best scores stay in this browser.</p></div>
        <button type="button" className="btn" onClick={askAria}>Ask Aria a question</button>
      </div>
      <div className="gr-shelf" role="tablist" aria-label="Games">
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
          <div className="gr-foot"><span>🏆 {g.best()}</span><button type="button" className="btn primary" onClick={play}>{playing ? "Play again" : "Play"}</button></div>
        </div>
        <div className="gr-play">
          {playing ? <View key={`${g.id}-${run}`} id={g.id} onClose={() => setPlaying(false)} />
            : <div className="gr-idle"><span className="gr-ic big" style={{ background: g.fill, color: g.ink }}>{g.icon}</span><b>{g.name}</b><span>Press Play. The game opens right here.</span></div>}
        </div>
      </div>
    </div>
  );
}
