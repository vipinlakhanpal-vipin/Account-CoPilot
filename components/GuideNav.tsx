"use client";
import { useEffect, useState } from "react";

// Guide contents: each tile opens one section; only the selected section is shown on the right (remembered in the URL hash).
export default function GuideNav({ items }: { items: [string, string][] }) {
  const [active, setActive] = useState(items[0][0]);
  useEffect(() => {
    const fromHash = () => { const h = window.location.hash.slice(1); setActive(items.some(([id]) => id === h) ? h : items[0][0]); };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [items]);
  useEffect(() => {
    const body = document.querySelector(".guide-body");
    body?.classList.add("one");
    document.querySelectorAll<HTMLElement>(".guide-body > section").forEach((s) => s.classList.toggle("on", s.id === active));
  }, [active]);
  const open = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    history.replaceState(null, "", `#${id}`);
    setActive(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <nav className="guide-toc" aria-label="Guide contents">
      {items.map(([id, t]) => <a key={id} href={`#${id}`} aria-current={active === id ? "page" : undefined} onClick={(e) => open(e, id)}>{t}</a>)}
    </nav>
  );
}
