"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// One rule for every data table in the app (see the "tables" block in globals.css): each value sits on one line, and a cell whose text does not fit is cut with an i
// at its end; click the cell to read all of it. Tables of running prose (the Guide, cost notes, the source catalogue) carry the class "prose" and wrap as normal.
const SEL = ".tablewrap table:not(.prose):not(.mkt-table):not(.aria-table) td";
export default function TableNeat() {
  const [pop, setPop] = useState<{ text: string; x: number; y: number } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scan = () => {
      const cells = Array.from(document.querySelectorAll<HTMLElement>(SEL));
      let i = 0;
      const step = () => { // in chunks, so a table of thousands of cells never freezes the page
        const end = Math.min(i + 500, cells.length);
        for (; i < end; i++) {
          const td = cells[i];
          if (td.querySelector(".longtext,button,select,input,form,.gauge,.fc-wrap")) { td.classList.remove("is-cut"); continue; }
          td.classList.toggle("is-cut", td.scrollWidth > td.clientWidth + 1);
        }
        if (i < cells.length) requestAnimationFrame(step);
      };
      step();
    };
    const queue = () => { if (timer) clearTimeout(timer); timer = setTimeout(scan, 250); };
    const mo = new MutationObserver(queue);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", queue);
    queue();
    return () => { mo.disconnect(); window.removeEventListener("resize", queue); if (timer) clearTimeout(timer); };
  }, []);

  useEffect(() => {
    const click = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      const td = t.closest<HTMLElement>("td.is-cut");
      if (td && !t.closest("a,button")) {
        e.stopPropagation();
        const r = td.getBoundingClientRect();
        setPop({ text: (td.innerText || td.textContent || "").trim(), x: Math.min(Math.max(12, r.left), window.innerWidth - 440), y: Math.min(r.bottom + 6, window.innerHeight - 180) });
        return;
      }
      if (!t.closest(".longtext-pop")) setPop(null);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setPop(null); };
    const away = () => setPop(null);
    document.addEventListener("click", click, true); document.addEventListener("keydown", esc); window.addEventListener("scroll", away, true);
    return () => { document.removeEventListener("click", click, true); document.removeEventListener("keydown", esc); window.removeEventListener("scroll", away, true); };
  }, []);

  return pop ? createPortal(<div className="longtext-pop" role="dialog" style={{ left: pop.x, top: pop.y }}>{pop.text}</div>, document.body) : null;
}
