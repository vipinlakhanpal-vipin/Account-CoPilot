"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AriaFace, type Mood } from "@/components/AriaFace";

// Aria out exploring: after one click she leaves her spot in the panel and goes wherever the pointer goes, stopping a short way from it. On the way she stretches and squashes along her direction of travel,
// spins, changes shape (circle, square, diamond, star, blob) and pulls faces. Double-click her (or press Escape) and she flies home to her place in the panel.
// She only ever catches pointer events on her own body, so the page under her keeps working.
const N = 16;
const poly = (r: (t: number) => number) => `polygon(${Array.from({ length: N }, (_, i) => { const t = (i / N) * Math.PI * 2; return `${(50 + Math.cos(t) * r(t)).toFixed(1)}% ${(50 + Math.sin(t) * r(t)).toFixed(1)}%`; }).join(",")})`;
const SHAPES: Record<string, string> = {
  circle: poly(() => 50),
  square: poly((t) => (50 / Math.max(Math.abs(Math.cos(t)), Math.abs(Math.sin(t)))) * 0.74),
  diamond: poly((t) => 50 / (Math.abs(Math.cos(t)) + Math.abs(Math.sin(t))) * 0.98),
  star: poly((t) => { const k = Math.round((t / (Math.PI * 2)) * N); return k % 2 === 0 ? 50 : 26; }),
  blob: poly((t) => 40 + 9 * Math.sin(3 * t + 0.8) + 4 * Math.sin(5 * t)),
};
const NAMES = Object.keys(SHAPES);
const SAYS = ["Wheee!", "Catch me if you can!", "Where are we going?", "Look, I'm a star!", "This page is big!", "Double-click me to send me home", "Boing!", "I'm a square now. Don't judge."];
// What she says when the pointer rests on a tab or menu item, by what it is called. {n} becomes the person's first name.
const ON_TAB: [RegExp, string[]][] = [
  [/review/, ["What do you want to review, {n}? Everything looks fine to me!", "Review time! Do I look nervous, {n}?"]],
  [/region|size/, ["Size matters, {n}. Choose wisely 😏", "Regions and sizes! Think big, {n}."]],
  [/add data/, ["Feeding me data, {n}? Yum, I'm hungry!", "Ooh, data! Bring it on, {n}."]],
  [/domain/, ["Domains! So fancy, {n}. Are we buying a website?", "Which departments, {n}? Ask nicely."]],
  [/daily plan|daily run/, ["A daily plan, {n}? I'm tired just thinking about it.", "My morning shift! I get up at six for this, {n}."]],
  [/data source|sources/, ["Sources! Always cite them, {n}. I'll know.", "Where did that come from, {n}? Show me the link."]],
  [/dashboard/, ["The big picture, {n}. Squint a little.", "Numbers, numbers! Don't let them scare you, {n}."]],
  [/pipeline|accounts/, ["Hunting accounts, {n}? Happy hunting 🎯", "Who's next on the list, {n}?"]],
  [/stakeholder/, ["People! Be nice to them, {n}.", "Stakeholders, {n}. Remember their names."]],
  [/team/, ["Checking on the team, {n}? Who's been naughty?", "Ooh, the team. I won't tell anyone, {n}."]],
  [/setting|define icp|engine|learn|guide/, ["Fiddling with the settings again, {n}?", "Careful, {n}. That button is shinier than it looks."]],
  [/market/, ["Spying on the competition, {n}? I won't tell.", "Market intelligence! Very James Bond, {n}."]],
  [/signal/, ["Buying signals! Ka-ching, {n}!", "Ooh, someone wants to buy, {n}. Go go go!"]],
  [/find|search/, ["Looking for someone, {n}? I'll help you hunt!", "Search time! I love a good chase, {n}."]],
  [/about/, ["Reading about me, {n}? I'm blushing.", "All my secrets are in there, {n}."]],
  [/jigsaw|puzzle|game|play|quiz|word|math|memory|digit|series|odd|process|clash|reaction/, ["A game, {n}? Now you're talking!", "Ooh, play time. I'm in, {n}."]],
  [/wizard/, ["The wizard! Abracadabra, {n}.", "Let's do some magic, {n}."]],
  [/version|history/, ["Time travel, {n}? Mind the gap.", "Look how much I've grown, {n}!"]],
  [/suggest/, ["Got ideas, {n}? I love ideas.", "Tell them what you want, {n}. They listen."]],
];
const TAB_SEL = ".settabs a,.mkt-tab,.navbar .tab,.subtab,.navit,.seg-toggle button,.gr-spine,.dp-tabs button,.find-modes button,.navbar a";
const tabLine = (label: string, name: string) => {
  const t = label.toLowerCase(), hit = ON_TAB.find(([r]) => r.test(t)), who = name || "friend";
  const lines = hit ? hit[1] : [`"${label}"? Ooh, mysterious. What are we doing there, {n}?`, `${label}, ${who}? Bold choice.`];
  return lines[Math.floor(Math.random() * lines.length)].replace("{n}", who);
};
const SIZE = 72, STOP = 78; // her size, and how close she comes to the pointer before she stops

export default function AriaTraveller({ getHome, onHome, name = "" }: { getHome: () => DOMRect | null; onHome: () => void; name?: string }) {
  const box = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null), orb = useRef<HTMLSpanElement>(null);
  const [mood, setMood] = useState<Mood>("cheer"), [say, setSay] = useState<string | null>("Where to? Double-click me to send me home"), [mounted, setMounted] = useState(false);
  const st = useRef({ px: 0, py: 0, hoverEl: null as Element | null, hoverAt: 0, x: 0, y: 0, tx: 0, ty: 0, going: false, home: false, over: false, shape: "circle", spin: 0, lastMove: 0 });
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted) return;
    const s = st.current, reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const h0 = getHome(); const start = h0 ? { x: h0.left + h0.width / 2, y: h0.top + h0.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    s.x = start.x; s.y = start.y; s.tx = start.x; s.ty = start.y;
    const move = (e: MouseEvent) => { s.px = e.clientX; s.py = e.clientY; if (!s.home) { s.tx = e.clientX; s.ty = e.clientY; s.going = true; s.lastMove = performance.now(); } };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") s.home = true; };
    window.addEventListener("mousemove", move); window.addEventListener("keydown", key);
    let raf = 0, last = performance.now(), shapeAt = last + 1800, sayAt = last + 5000, prevX = s.x, prevY = s.y, moodAt = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      let gx = s.tx, gy = s.ty;
      if (s.home) { const r = getHome(); if (r) { gx = r.left + r.width / 2; gy = r.top + r.height / 2; } }
      const dx = gx - s.x, dy = gy - s.y, d = Math.hypot(dx, dy);
      // she stops a short way from the pointer (so the page under the pointer stays reachable), or goes all the way home
      const stopAt = s.home ? 4 : s.over ? 1e9 : STOP;
      if (d > stopAt) { const k = 1 - Math.pow(0.0009, dt), f = s.home ? 1 : (d - stopAt) / d; s.x += dx * k * f; s.y += dy * k * f; }
      if (s.home && d < 6) { onHome(); return; }
      const vx = (s.x - prevX) / Math.max(dt, 0.001), vy = (s.y - prevY) / Math.max(dt, 0.001), speed = Math.hypot(vx, vy); prevX = s.x; prevY = s.y;
      const ang = Math.atan2(vy, vx), stretch = reduced ? 0 : Math.min(0.55, speed / 1400), t = now / 1000;
      if (!reduced) s.spin += (speed > 200 ? speed / 900 : Math.sin(t * 2) * 0.01) * dt * 60;
      const wob = reduced ? 0 : Math.sin(t * 6) * 0.05;
      if (box.current) box.current.style.transform = `translate(${s.x - SIZE / 2}px,${s.y - SIZE / 2}px)`;
      if (body.current) body.current.style.transform = `rotate(${ang}rad) scale(${1 + stretch + wob},${1 - stretch * 0.6 - wob}) rotate(${-ang + s.spin}rad)`;
      if (box.current) { const gxp = s.tx - s.x, gyp = s.ty - s.y, dd = Math.hypot(gxp, gyp) || 1; box.current.style.setProperty("--ex", String((gxp / dd) * 0.75)); box.current.style.setProperty("--ey", String((gyp / dd) * 0.6)); }
      if (!reduced && now > shapeAt && orb.current) { s.shape = NAMES[Math.floor(Math.random() * NAMES.length)]; orb.current.style.clipPath = SHAPES[s.shape]; shapeAt = now + 1500 + Math.random() * 1200; }
      // when the pointer rests on a tab or menu item she comments on it, using the person's name
      if (now - s.hoverAt > 220) {
        s.hoverAt = now;
        const under = document.elementFromPoint(s.px, s.py), item = under && !under.closest(".atrav") ? under.closest(TAB_SEL) : null;
        if (item !== s.hoverEl) {
          s.hoverEl = item;
          if (item) {
            const label = ((item as HTMLElement).getAttribute("aria-label") || (item as HTMLElement).innerText || "").split("\n")[0].replace(/^\d+\s*/, "").replace(/\s+\d+$/, "").trim();
            if (label) { setSay(tabLine(label, name)); setMood(/review/i.test(label) ? "think" : "wink"); sayAt = now + 5200; moodAt = now + 2500; setTimeout(() => setSay(null), 3600); }
          }
        }
      }
      if (now > moodAt) { moodAt = now + 700; setMood(speed > 500 ? "cheer" : speed > 120 ? "wink" : now - s.lastMove > 2500 ? "think" : "happy"); }
      if (now > sayAt) { sayAt = now + 4500 + Math.random() * 3000; setSay(SAYS[Math.floor(Math.random() * SAYS.length)]); setTimeout(() => setSay(null), 2600); }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("mousemove", move); window.removeEventListener("keydown", key); };
  }, [mounted]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!mounted) return null;
  return createPortal(
    <div className="atrav" ref={box} style={{ width: SIZE, height: SIZE }}>
      {say && <span className="atrav-say" role="status">{say}</span>}
      <div className="atrav-body" ref={body}
        onMouseEnter={() => { st.current.over = true; }} onMouseLeave={() => { st.current.over = false; }}
        onDoubleClick={() => { st.current.home = true; setSay("Home sweet home!"); setMood("cheer"); }}
        title="Double-click to send Aria home (or press Escape)">
        <span className="aria-orb" ref={orb} style={{ width: SIZE, height: SIZE }}><AriaFace mood={mood} /></span>
      </div>
    </div>, document.body);
}
