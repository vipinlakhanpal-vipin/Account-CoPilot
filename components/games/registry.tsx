import type { ReactElement } from "react";

// The games in Aria's Game room, each a book on the shelf. Add a row here and a new book appears (the shelf scrolls when there are many).
export type GameId = "jigsaw" | "quiz" | "words" | "pattern" | "math" | "stroop" | "series" | "react" | "digits" | "odd" | "process";
/** What a game tells its host: it started, the player did something right or wrong, asked for a hint, is running out of time, won or lost. */
/** Details a game passes with a win, so Aria can pick the medal. */
export type WinData = { seconds?: number; newBest?: boolean; score?: number; total?: number; hints?: number; level?: number };
export type GameEvent = "start" | "good" | "bad" | "hint" | "hurry" | "win" | "lose";
export type Game = { id: GameId; name: string; icon: ReactElement; fill: string; ink: string; time: string; timed: boolean; blurb: string; skill: string; helps: string; starter?: boolean; best: () => string };

const num = (k: string) => { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } };
const svg = (d: ReactElement) => <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
export const GAMES: Game[] = [
  { id: "jigsaw", helps: "Seeing how parts fit into a whole, like piecing an account together from scattered facts.", name: "Jigsaw puzzle", skill: "Visual and spatial reasoning", starter: true, fill: "#CECBF6", ink: "#3C3489", time: "60 s", timed: true, blurb: "Rebuild Aria from nine pieces. A new picture every game.",
    icon: svg(<path d="M10 4a2 2 0 1 1 4 0v1h4v4h-1a2 2 0 1 0 0 4h1v4h-4v-1a2 2 0 1 0-4 0v1H6v-4h1a2 2 0 1 0 0-4H6V5h4z" />), best: () => { const b = num("aria-puzzle-best"); return b ? `Best ${b} s` : "Not played yet"; } },
  { id: "quiz", helps: "Recalling and judging facts quickly, like checking a claim against what you know.", name: "True or false", skill: "Recall and judgement", starter: true, fill: "#FAC775", ink: "#633806", time: "45 s", timed: true, blurb: "Eight quick statements about source-to-pay and how CoPilot labels evidence.",
    icon: svg(<><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.5" /></>), best: () => { const b = num("aria-quiz-best"); return b ? `Best ${b} of 8` : "Not played yet"; } },
  { id: "words", helps: "Building the vocabulary of source-to-pay and recalling it under mild pressure.", name: "Word scramble", skill: "Vocabulary and recall", starter: true, fill: "#F5C4B3", ink: "#712B13", time: "No timer", timed: false, blurb: "Four levels of five words: 3, 5, 7 and 10 letters. Hints and Restart any time.",
    icon: svg(<><path d="M4 18l4-11 4 11M5.6 14h4.8" /><path d="M15 9h3.5a2 2 0 0 1 0 4H15m0 0h4a2 2 0 0 1 0 4h-4z" /></>), best: () => { const d = num("aria-words-level"); return d ? `Level ${Math.min(d, 4)} cleared` : "No timer, 4 levels"; } },
  { id: "pattern", helps: "Holding a sequence in mind, like a client's requirements or the key points of a call.", name: "Pattern memory", skill: "Working memory", fill: "#B5D4F4", ink: "#0C447C", time: "No timer", timed: false, blurb: "Watch four pads light up, then repeat the order. It grows by one every round.",
    icon: svg(<><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" /></>), best: () => { const b = num("aria-pattern-best"); return b ? `Best ${b} in a row` : "Not played yet"; } },
  { id: "math", helps: "Quick mental arithmetic for estimating spend, discounts and totals on the spot.", name: "Math sprint", skill: "Mental arithmetic and speed", fill: "#C0DD97", ink: "#27500A", time: "45 s", timed: true, blurb: "Pick the right answer to as many sums as you can. They get harder as you go.",
    icon: svg(<><path d="M5 12h14M12 5v14" /><path d="M5 19l14-14" opacity=".35" /></>), best: () => { const b = num("aria-math-best"); return b ? `Best ${b} right` : "Not played yet"; } },
  { id: "stroop", helps: "Staying focused on what matters and ignoring distraction, as in a busy inbox.", name: "Colour clash", skill: "Attention and self-control", fill: "#F4C0D1", ink: "#72243E", time: "30 s", timed: true, blurb: "A word is written in a colour. Press the colour of the ink, not the word.",
    icon: svg(<><circle cx="9" cy="10" r="5" /><circle cx="15" cy="14" r="5" /></>), best: () => { const b = num("aria-stroop-best"); return b ? `Best ${b} right` : "Not played yet"; } },
  { id: "series", helps: "Spotting the rule behind numbers, like a trend in spend or revenue.", name: "Number series", skill: "Logical reasoning", fill: "#D3D1C7", ink: "#2C2C2A", time: "No timer", timed: false, blurb: "Find the number that comes next in the pattern. Eight questions, each explained.",
    icon: svg(<><path d="M4 17l4-5 4 3 5-8" /><path d="M17 7h3v3" /></>), best: () => { const b = num("aria-series-best"); return b ? `Best ${b} of 8` : "Not played yet"; } },
  { id: "react", helps: "Staying alert and responding promptly.", name: "Reaction speed", skill: "Reaction time", fill: "#F7C1C1", ink: "#791F1F", time: "5 rounds", timed: false, blurb: "Wait for the pad to turn green, then click as fast as you can. Five rounds, averaged.",
    icon: svg(<path d="M13 3L5 14h6l-1 7 8-11h-6z" />), best: () => { const b = num("aria-react-best"); return b ? `Best ${b} ms` : "Not played yet"; } },
  { id: "digits", helps: "Remembering figures and reference numbers without writing them down.", name: "Digit span", skill: "Short-term memory", fill: "#9FE1CB", ink: "#085041", time: "No timer", timed: false, blurb: "A number flashes and hides. Type it back. It grows by one digit each round.",
    icon: svg(<path d="M5 8h4M7 6v6M13 8h6M15 14h4M5 17h6" />), best: () => { const b = num("aria-digits-best"); return b ? `Best ${b} digits` : "Not played yet"; } },
  { id: "odd", helps: "Spotting what does not fit, like an outlier in a supplier list or a doubtful figure.", name: "Odd one out", skill: "Categorising and logic", fill: "#E1DEFB", ink: "#3C3489", time: "No timer", timed: false, blurb: "Four items, one does not belong. Spot it. Eight questions, each explained.",
    icon: svg(<><circle cx="7" cy="8" r="2.5" /><circle cx="17" cy="8" r="2.5" /><circle cx="7" cy="17" r="2.5" /><path d="M14.5 14.5l5 5m0-5l-5 5" /></>), best: () => { const b = num("aria-odd-best"); return b ? `Best ${b} of 8` : "Not played yet"; } },
  { id: "process", helps: "Thinking in the right order, like a purchase-to-pay or approval flow.", name: "Process order", skill: "Sequencing and planning", fill: "#FAEEDA", ink: "#633806", time: "No timer", timed: false, blurb: "Tap the steps of a real procurement process in the order they happen.",
    icon: svg(<><path d="M5 6h6M5 12h10M5 18h14" /><path d="M16 4l3 2-3 2" /></>), best: () => { const b = num("aria-process-best"); return b ? `Best ${b} of 5 perfect` : "Not played yet"; } },
];

