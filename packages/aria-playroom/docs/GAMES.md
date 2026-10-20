# The games

Every game is a React component with props `{ onClose, onEvent }`. It shows itself with `Shell` (from `AriaMiniGames.tsx`) and reports to its host through `onEvent(event, detail?, data?)`:

| Event | Meaning | Aria's reaction |
|---|---|---|
| `start` | a game or round began | "Go!" |
| `good` / `bad` | a right or wrong move | cheer and hop, or oops and shake |
| `hint` | the player asked for help | thinking face |
| `hurry` | time nearly up | warning |
| `win` (with `data`) | the player won; `data` carries `score`, `total`, `seconds`, `hints`, `level` | she presents a medal |
| `lose` | the game ended without a win | consolation, no medal |

## The list

| Game | Trains | Rules in short | Medals (win needs the first level) | localStorage best |
|---|---|---|---|---|
| Jigsaw puzzle | visual and spatial reasoning | 9 pieces, drag to the board, 60 s, a new picture each game (5 designs) | time: gold <= 35 s, silver <= 48 s, bronze <= 60 s | `aria-puzzle-best` (s) |
| True or false | recall and judgement | 8 statements, 45 s, each answer explained, green Correct / red Incorrect banner | 8 gold, 6-7 silver, 4-5 bronze, ribbon below | `aria-quiz-best` |
| Word scramble | vocabulary and recall | 4 levels x 5 words (3, 5, 7, 10 letters), clue + scrambled letters, tap or type, Hint, no timer | per level: no hints gold, 1 hint silver, more bronze | `aria-words-level` (highest cleared) |
| Pattern memory | working memory | repeat a growing chain of 4 pads; a mistake ends it | chain 8+ gold, 6-7 silver, 4-5 bronze | `aria-pattern-best` |
| Math sprint | mental arithmetic and speed | 45 s of sums, 4 options, harder as you go | 15 gold, 11 silver, 7 bronze | `aria-math-best` |
| Colour clash | attention and self-control | 30 s, press the ink colour not the word | 20 gold, 15 silver, 10 bronze | `aria-stroop-best` |
| Number series | logical reasoning | 8 pattern questions with the rule explained, no timer | 8 gold, 6-7 silver, 5 bronze | `aria-series-best` |
| Reaction speed | reaction time | wait for green, click, 5 rounds averaged | avg <= 260 ms gold, <= 340 silver, <= 500 bronze | `aria-react-best` (ms, lower is better) |
| Digit span | short-term memory | a number flashes and hides, type it back, grows by a digit | 8+ gold, 7 silver, 5-6 bronze | `aria-digits-best` |
| Odd one out | categorising and logic | 8 questions, four items, find the one that does not belong, explained | 8 gold, 7 silver, 5-6 bronze | `aria-odd-best` |
| Process order | sequencing and planning | tap the steps of a procurement process in order, 5 processes | 5 gold, 4 silver, 3 bronze | `aria-process-best` |

Other keys: `aria-games-owned` (which games are on the shelf; the three starters are Jigsaw, True or false and Word scramble), `aria-awards` (medal history), `aria-game-pick` (last selected book).

## Add a game (checklist)

1. Write the component (copy a small one, `NumberSeries` in `Cognitive.tsx`, as a template). Call `onEvent` at the moments in the table above; send `data` with `win`.
2. Add a row to `GAMES` in `components/games/registry.tsx`: id, name, icon, `fill` and `ink` colours, time, `timed`, `blurb`, `skill`, `best()`. Add the id to the `GameId` type.
3. In `GameRoom.tsx`: add a `case` in `View`, a line in each of the tables `INTRO`, `HOW`, `TIPS`, `SCORING`, `TIME`, a name pattern in `NAMES`, and a medal rule in `awardFor`.
4. Run `scripts/sync_aria_playroom.mjs` and commit.
