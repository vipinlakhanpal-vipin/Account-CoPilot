# Aria playroom: the character, the games, everything built around them

This folder holds **all the work done on Aria as a character and on her games** in Account CoPilot, as a copy-in package. Point Claude Code at this folder in any other app and say "bring Aria's playroom into this app as it is", and it can lift it across and configure it with the steps in `docs/INTEGRATION.md`.

The chat assistant itself (the question box) is a separate package: `packages/aria`. This one is the personality and the play.

## What is in it

| Part | What it does | Files (under `src/`) |
|---|---|---|
| Roaming Aria | A 3D glowing orb that rolls around her area of the left panel, bounces off its edges, shows a speech bubble ("Want to play? Click me!" and funny messages), and opens the playroom when clicked. In the playroom she steps aside and the panel offers "Done playing". | `components/AriaGame.tsx`, `components/AriaFace.tsx` |
| Aria's face | One SVG face with moods: happy, cheer, oops, think, neutral, wink, dizzy. Pupils follow the pointer in the playroom. `AriaOrb` is the 3D orb at any size. | `components/AriaFace.tsx` |
| The playroom | The page Aria hosts: her avatar and speech bubble that react to every move, an always-open chat bar about the games (free, rule-based), the medals counter, the shelf of games (download, remove, filter, hover descriptions), a one-line row for the picked game and the "Gaming Square" where it is played. Aria is naughty: teases, wiggles a book, spins, peeks, giggles when poked. | `components/GameRoom.tsx`, `app/nav/games/page.tsx` |
| Game registry | The list of games: name, icon, colours, time, the skill it trains, blurb, best score. Add a row and a new book appears. | `components/games/registry.tsx` |
| The games (11) | Jigsaw puzzle, True or false, Word scramble (4 levels), Pattern memory, Math sprint, Colour clash, Number series, Reaction speed, Digit span, Odd one out, Process order | `components/games/Jigsaw.tsx`, `components/AriaMiniGames.tsx`, `components/games/Cognitive.tsx`, `components/games/Brain2.tsx` |
| Styles | Every rule that belongs to Aria and the games, extracted from the app's `globals.css` | `styles/aria-playroom.css` |

Docs: `docs/INTEGRATION.md` (how to lift it into another app), `docs/ARIA-CHARACTER.md` (her look, moods, messages, rules of movement), `docs/GAMES.md` (every game: rules, medals, storage keys, how to add one).

## Keep it current

The running app uses its own files (`components/`, `app/`); this folder is the portable copy. After any change to Aria or a game, run

```
npx -y -p node@22 node scripts/sync_aria_playroom.mjs
```

and commit. It recopies the files listed in `scripts/sync_aria_playroom.mjs` and re-extracts the styles, and updates `MANIFEST.json`. A new Aria file must be added to the `FILES` list in that script.

## Facts worth knowing

- Everything runs in the browser. No API calls, no cost, no paid AI: Aria's game chat answers from what she knows about the games.
- What is stored, and where: only in the browser's localStorage (shelf, best scores, medals, last game). See `docs/GAMES.md` for the keys. Nothing is written to the database or to the computer's disk.
- The "download" of a game is an unlock of code that is already in the app; it marks the game as on the shelf.
- Respects `prefers-reduced-motion` (no roaming, no confetti).
- Built for Next.js 15 (App Router) and React 19 with TypeScript. Nothing else to install.
