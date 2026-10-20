"use client";
import { useEffect } from "react";

// One rule for every row of tabs (see the "TABS" block at the end of globals.css): if the labels do not fit the row, the type and the space around each tab shrink together
// (down to 10 px) until they do, so text never runs out of a tab. Rows are found by class, so a new tab row only needs one of these classes.
const SEL = ".settabs,.mkt-tabs,.seg-toggle,.dp-tabs";
const MIN = 10;

function fit(row: HTMLElement) {
  row.style.removeProperty("--tabfs"); row.style.removeProperty("--tabpx");
  if (!row.clientWidth) return; // hidden
  const first = row.querySelector<HTMLElement>("a,button");
  if (!first) return;
  const cs = getComputedStyle(first), base = parseFloat(cs.fontSize) || 14, pad = parseFloat(cs.paddingLeft) || 16;
  if (row.scrollWidth <= row.clientWidth + 1) return;
  for (let s = base - 0.5; s >= MIN; s -= 0.5) {
    row.style.setProperty("--tabfs", `${s}px`);
    row.style.setProperty("--tabpx", `${Math.max(7, Math.round(pad * (s / base)))}px`);
    if (row.scrollWidth <= row.clientWidth + 1) return;
  }
}

export default function TabFit() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => document.querySelectorAll<HTMLElement>(SEL).forEach(fit);
    const queue = () => { if (timer) clearTimeout(timer); timer = setTimeout(run, 120); };
    const mo = new MutationObserver(queue);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", queue);
    document.fonts?.ready.then(queue).catch(() => {});
    queue();
    return () => { mo.disconnect(); window.removeEventListener("resize", queue); if (timer) clearTimeout(timer); };
  }, []);
  return null;
}
