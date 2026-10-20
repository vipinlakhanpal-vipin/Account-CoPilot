# Lifting the Aria playroom into another app

For Claude Code: read this whole file, then do the steps in order. The source is in `../src`, the styles in `../styles/aria-playroom.css`. Keep the file names so the imports (`@/components/...`) keep working; the `@/` alias must point to the app root.

## 0. What the host app must provide

- Next.js 15 App Router, React 19, TypeScript, path alias `@/* -> ./*`.
- A left-hand panel (or any container) where the roaming Aria can live. The container must be `position: relative` and tall enough to roam (about 240 px or more); `AriaGame` finds it as its parent element.
- A page route for the playroom (default `/nav/games`). `AriaGame` navigates there when Aria is clicked and swaps itself for a "Playing with Aria / Done playing" card while the path starts with `/nav/games`. Change the path in `AriaGame.tsx` (two places) if the host uses another.
- Button classes `.btn`, `.btn.primary`, `.btn.tiny` (the games use them), and CSS variables listed at the top of `styles/aria-playroom.css` (`--surface`, `--line-2`, `--text`, `--muted`, `--teal`, and so on). If the host uses other names, add a small block that maps them.
- Optional: a hidden launcher button with class `nav-aria-mini` that opens the host's own chat. The playroom's "Open my full chat" button clicks it. If there is none, the button does nothing; remove it in `GameRoom.tsx` (`askAria`, `offerFull`).
- Fonts: Fredoka for Aria's bubble (`https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700`). Without it the bubble falls back to Baloo 2 or Comic Sans.

## 1. Copy the files

```
cp -R src/components/. <app>/components/
cp -R src/app/nav/games <app>/app/nav/games      # the route; edit the auth line below
cat styles/aria-playroom.css >> <app>/app/globals.css   # or import it as its own file
```

## 2. Adapt the page route

`app/nav/games/page.tsx` calls `requirePageUser()` from `@/lib/auth` so only signed-in people reach it. Replace that with the host app's own check, or delete the line for a public page.

## 3. Place the roaming Aria

In the left panel, inside a container with class `navmid` (any relatively positioned box that is tall enough), render:

```tsx
import AriaGame from "@/components/AriaGame";
<div className="navmid"><AriaGame /></div>
```

The box (`.navmid` in Account CoPilot) belongs to the panel layout, not to Aria, so its rules are not in the extracted CSS. Give it `position: relative; min-height: 260px; overflow: visible`.

## 4. Check

- `tsc --noEmit` passes.
- Aria rolls inside her box and bounces off its edges; her bubble stays inside.
- Clicking her opens the playroom; every game opens inside the Gaming Square; medals count up beside her.
- With `prefers-reduced-motion` on, nothing moves.

## 5. Optional changes

- **Different brand colours:** the orb uses purples and teal in `.aria-orb` / `.agame-bot` and `AriaFace.tsx`. The tabs, chips and the Gaming Square use the `--tab-*` tokens and the navy block `.gr-square`.
- **Follow the user across devices:** the shelf (`aria-games-owned`), medals (`aria-awards`) and best scores live in localStorage. To keep them in a database, replace the `localStorage` reads and writes in `GameRoom.tsx`, `components/games/registry.tsx` and the games (search for `aria-`) with calls to the host's own API.
- **Remove games:** delete the entry from `components/games/registry.tsx` and its case in `View` and the text tables in `GameRoom.tsx`.
- **Add a game:** see `GAMES.md`.
