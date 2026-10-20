// Copies everything that makes up Aria (the roaming character, her playroom, every game, their styles) into packages/aria-playroom so the folder always holds the current version.
//   node scripts/sync_aria_playroom.mjs
// The app keeps running from its own files (components/, app/); the package is a ready-to-lift copy plus docs. Run this after changing any Aria or game file, then commit.
import fs from "node:fs";
import path from "node:path";

const OUT = "packages/aria-playroom";
const FILES = [
  "components/AriaFace.tsx", "components/AriaGame.tsx", "components/AriaTraveller.tsx", "components/GameRoom.tsx", "components/AriaMiniGames.tsx",
  "components/games/registry.tsx", "components/games/Jigsaw.tsx", "components/games/Cognitive.tsx", "components/games/Brain2.tsx",
  "app/nav/games/page.tsx",
];
for (const f of FILES) {
  if (!fs.existsSync(f)) { console.log("missing, skipped:", f); continue; }
  const to = path.join(OUT, "src", f); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(f, to);
}

// Styles: pull every rule of globals.css that belongs to Aria or the games, plus the tab colour tokens they use.
const css = fs.readFileSync("app/globals.css", "utf8");
const KEEP = /(\.agame|\.agm-|\.gr-|\.aria-orb|button\.aria-orb|\.cg-|\.b2-|\.medal|\.agame-away|\.alib)/;
const KEEP_FRAMES = /^@keyframes (agame-|gr-|agm-|aria-|acp-)/;
function topLevel(src) { // split into top-level rules and at-rules by matching braces
  const out = []; let depth = 0, start = 0, inStr = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (c === inStr && src[i - 1] !== "\\") inStr = ""; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 1; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { out.push(src.slice(start, i + 1).trim()); start = i + 1; } }
  }
  return out;
}
const rules = topLevel(css).map((r) => r.replace(/^(\/\*[\s\S]*?\*\/\s*)+/, "").trim()).filter((r) => {
  const head = r.slice(0, r.indexOf("{"));
  if (r.startsWith("@keyframes")) return KEEP_FRAMES.test(head.trim());
  if (r.startsWith("@media")) return KEEP.test(r);
  return KEEP.test(head);
});
const tokens = (css.match(/:root\{--tab-bg[^}]*\}/) || [""])[0];
const header = `/* Aria playroom styles: extracted from the app's globals.css by scripts/sync_aria_playroom.mjs. Do not edit here; edit globals.css and run the script.
   Needs these CSS variables from the host app (all have the same names in Account CoPilot): --surface, --surface-2, --line, --line-2, --text, --text-strong, --muted, --teal, --ink,
   --body, --display, --mono, --bg-accent, --tab-bg, --tab-hover, --tab-fg, --tab-on, --tab-on-fg, --tab-accent, --tab-line (defined at the end of this file if missing).
   Fonts: Fredoka (Aria's bubble), plus the app's display and body faces. Class .btn / .btn.primary / .btn.tiny come from the host's button styles. */\n`;
fs.mkdirSync(path.join(OUT, "styles"), { recursive: true });
fs.writeFileSync(path.join(OUT, "styles/aria-playroom.css"), header + rules.join("\n") + "\n\n/* tab colour tokens used by the games' tabs, chips and switches */\n" + tokens + "\n");

// Manifest
const manifest = { name: "aria-playroom", syncedAt: new Date().toISOString(), files: FILES.filter((f) => fs.existsSync(f)), styles: "styles/aria-playroom.css", cssRules: rules.length };
fs.writeFileSync(path.join(OUT, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Synced ${manifest.files.length} files and ${rules.length} style rules into ${OUT}`);
