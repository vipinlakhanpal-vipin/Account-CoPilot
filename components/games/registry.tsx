import type { ReactElement } from "react";

// The games in Aria's Game room, each a book on the shelf. Add a row here and a new book appears (the shelf scrolls when there are many).
export type GameId = "jigsaw" | "memory" | "quiz" | "words";
export type Game = { id: GameId; name: string; icon: ReactElement; fill: string; ink: string; time: string; timed: boolean; blurb: string; best: () => string };

const num = (k: string) => { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } };
const svg = (d: ReactElement) => <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
export const GAMES: Game[] = [
  { id: "jigsaw", name: "Jigsaw puzzle", fill: "#CECBF6", ink: "#3C3489", time: "60 s", timed: true, blurb: "Rebuild Aria from nine pieces. A new picture every game.",
    icon: svg(<path d="M10 4a2 2 0 1 1 4 0v1h4v4h-1a2 2 0 1 0 0 4h1v4h-4v-1a2 2 0 1 0-4 0v1H6v-4h1a2 2 0 1 0 0-4H6V5h4z" />), best: () => { const b = num("aria-puzzle-best"); return b ? `Best ${b} s` : "Not played yet"; } },
  { id: "memory", name: "Memory match", fill: "#9FE1CB", ink: "#085041", time: "60 s", timed: true, blurb: "Match six procurement terms to their meanings.",
    icon: svg(<><rect x="3" y="6" width="11" height="14" rx="2" /><path d="M17 8l3 1-3 10" /></>), best: () => { const b = num("aria-memory-best"); return b ? `Best ${b} moves` : "Not played yet"; } },
  { id: "quiz", name: "True or false", fill: "#FAC775", ink: "#633806", time: "45 s", timed: true, blurb: "Eight quick statements about source-to-pay and how CoPilot labels evidence.",
    icon: svg(<><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.5" /></>), best: () => { const b = num("aria-quiz-best"); return b ? `Best ${b} of 8` : "Not played yet"; } },
  { id: "words", name: "Word scramble", fill: "#F5C4B3", ink: "#712B13", time: "No timer", timed: false, blurb: "Four levels of five words: 3, 5, 7 and 10 letters. Hints and Restart any time.",
    icon: svg(<><path d="M4 18l4-11 4 11M5.6 14h4.8" /><path d="M15 9h3.5a2 2 0 0 1 0 4H15m0 0h4a2 2 0 0 1 0 4h-4z" /></>), best: () => { const d = num("aria-words-level"); return d ? `Level ${Math.min(d, 4)} cleared` : "No timer, 4 levels"; } },
];

