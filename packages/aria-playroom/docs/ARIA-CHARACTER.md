# Aria, the character

## Look
- A glossy 3D orb lit from the top left: bright highlight, shadowed underside with a bounce of teal light, a soft glow that slowly breathes, a thin outer ring. CSS classes `.agame-bot` (roaming, a button) and `.aria-orb` (the playroom host; a button when it has an `onClick`).
- The face (`AriaFace.tsx`) is a white robot head with glossy eyes, a glowing teal mouth and a lit amber antenna.
- Moods: `happy` (smile), `cheer` (arched eyes, wide smile), `oops` (frown), `think` (eyes up, small "o"), `neutral` (flat mouth), `wink` (one eye closed), `dizzy` (X eyes, wavy mouth). The playroom changes the mood with what happens in a game.
- Eyes follow the pointer in the playroom (CSS variables `--ex` and `--ey` set on `.gr-host`).

## The roaming Aria (left panel)
- Moves by physics in `AriaGame.tsx`: slow drift, bounces off the left, right, top and bottom of her area (never past them), a small squash on each hit (`bump-x`, `bump-y`). Pauses while the pointer is on her, while the tab is hidden, and stays still with reduced motion.
- Speech bubble: "Want to play? 🎮 / Click me! 👆" in Fredoka on sunny yellow, below her with its pointer up. Its position is kept inside her area through the CSS variables `--bx` and `--ax`.
- Every 40 to 70 seconds she flashes one of ten funny, slightly sad messages for 7 seconds (`MOODS` in `AriaGame.tsx`) and wobbles.
- Click: a short "punch" animation, then the playroom opens.
- In the playroom the roaming Aria steps aside; the panel shows "Playing with Aria" and Done playing.

## The host in the playroom (`GameRoom.tsx`)
- Speech lines by event (`LINES`), an intro for every game (`INTRO`), reactions that follow what the game reports (`start`, `good`, `bad`, `hint`, `hurry`, `win`, `lose`), a hop for good news and a shake for bad.
- Idle: a nudge after 25 seconds of quiet. Mischief every few seconds while idle (`TEASE`, a wiggling book, a spin, a peek). Poke her for giggles (`POKED`); five fast pokes make her dizzy.
- Medals: she presents a gold, silver or bronze medal with confetti when you win (`awardFor`). Counts are kept in the browser.
- Chat bar: always open under her. `reply()` answers from tables of facts about the games (how to play, tips, scoring, time, best score, skills, how downloads work). Anything else gets a polite "my full chat can help" with a button.
