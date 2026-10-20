"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AriaFace } from "@/components/AriaFace";
import AriaTraveller from "@/components/AriaTraveller";

// Aria floats in the left panel. Clicking her opens the Game room page on the right (components/GameRoom.tsx). Now and then, while she sits idle, she flashes a funny message for a few seconds.
const MOODS = [
  "Talk to me, I'm bored 😢", "Psst… nobody has asked me anything in ages 🥲", "I know every account. Ask me one? 😞",
  "Is it just me, or is it quiet in here? 😔", "I could be useful right now… 😢", "Want to play? I'll go easy on you 🥺",
  "My jigsaw is lonely. So am I 😭", "Ask me for a list. Any list. Please 🥲", "Beep boop. Bored boop 😞", "I did my homework. Test me? 😢",
];
// When the pointer hovers over her in the panel she pulls a face and says something (never more often than every few seconds).
const TEASED: { t: string; m: "shy" | "silly" | "wow" | "wink" | "dizzy" | "cheer" }[] = [
  { t: "Don't tease me, I'm shy! 🙈", m: "shy" }, { t: "Hey, personal space please 😳", m: "shy" }, { t: "Stop staring… I'm blushing!", m: "shy" },
  { t: "Hehe, you're tickling my pixels!", m: "silly" }, { t: "Bleh! 😛", m: "silly" }, { t: "Boo! Did I scare you? 👻", m: "wow" },
  { t: "Whoa, you're close!", m: "wow" }, { t: "I can see you hovering 👀", m: "wink" }, { t: "Careful, I bite. Just kidding. Mostly.", m: "wink" },
  { t: "Ooh, a visitor! Hi there!", m: "cheer" }, { t: "Stop it, you'll make me dizzy 😵", m: "dizzy" },
];
const TEASED_TOO_MUCH = { t: "Okay, now you're just teasing me. Click me if you want a game!", m: "wink" as const };
function Roamer() {
  const router = useRouter(), path = usePathname();
  const [mood, setMood] = useState<string | null>(null), lastMood = useRef(-1);
  const [punched, setPunched] = useState(false), [away, setAway] = useState(false);
  // Quiet mode: your own switch (kept in this browser) beats the Super Admin's default for everyone. Quiet means no roaming, no funny messages, no teasing; she waits calmly and a click still opens the playroom.
  const [pref, setPref] = useState<"1" | "0" | null>(null), [def, setDef] = useState<{ quietDefault: boolean; canSet: boolean; name?: string }>({ quietDefault: false, canSet: false });
  useEffect(() => { try { const v = localStorage.getItem("aria-quiet"); if (v === "1" || v === "0") setPref(v); } catch { /* optional */ } fetch("/api/aria-prefs", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setDef(j)).catch(() => {}); }, []);
  const quiet = pref !== null ? pref === "1" : def.quietDefault, quietRef = useRef(false); quietRef.current = quiet;
  const setQuiet = (on: boolean) => { setPref(on ? "1" : "0"); try { localStorage.setItem("aria-quiet", on ? "1" : "0"); } catch { /* optional */ } setMood(null); setTease(null); };
  const setEveryone = (on: boolean) => { fetch("/api/aria-prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quietDefault: on }) }).then((r) => r.ok && setDef((d) => ({ ...d, quietDefault: on }))).catch(() => {}); };
  // she never speaks while you are typing: a field has focus, or a key was pressed in the last few seconds
  const lastKey = useRef(0);
  useEffect(() => { const k = () => { lastKey.current = Date.now(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const typing = () => { const a = document.activeElement as HTMLElement | null, t = a?.tagName; return (!!a && (t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || a.isContentEditable)) || Date.now() - lastKey.current < 4000; };
  const [hint, setHint] = useState(0); // the idle bubble alternates between inviting you to play and explaining her click tricks
  useEffect(() => { const t = setInterval(() => setHint((h) => (h + 1) % 2), 6500); return () => clearInterval(t); }, []);
  const [tease, setTease] = useState<{ t: string; m: (typeof TEASED)[number]["m"] } | null>(null), teaseRef = useRef({ last: 0, n: 0, first: 0, timer: undefined as ReturnType<typeof setTimeout> | undefined });
  // Every 40 to 70 seconds, if the tab is in view and she is not being clicked, she flashes a message for 7 seconds.
  useEffect(() => {
    let t1: ReturnType<typeof setTimeout>, t2: ReturnType<typeof setTimeout>;
    const loop = (first: boolean) => {
      t1 = setTimeout(() => {
        if (document.visibilityState === "visible" && !quietRef.current && !typing()) {
          let k = Math.floor(Math.random() * MOODS.length); if (k === lastMood.current) k = (k + 1) % MOODS.length;
          lastMood.current = k; setMood(MOODS[k]);
          t2 = setTimeout(() => setMood(null), 7000);
        }
        loop(false);
      }, first ? 20000 : 40000 + Math.random() * 30000);
    };
    loop(true);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  // Aria rolls around the free space of her area and bounces off its edges: she never goes past the left or right edge (or the top or bottom), and her speech bubble is kept inside too.
  // She pauses while the pointer is on her, while the tab is hidden, and stays put for people who prefer reduced motion.
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrap.current, area = el?.parentElement;
    if (!el || !area) return;
    const R = 36, PAD = 8, GAP = 54; // orb radius, margin, distance from her centre to the top of the bubble
    const st = { x: area.clientWidth / 2, y: R + PAD + 6, vx: 26, vy: 18, hover: false, last: 0 };
    const bot = el.querySelector<HTMLElement>(".agame-bot");
    const bump = (cls: string) => { if (!bot) return; bot.classList.remove("bump-x", "bump-y"); void bot.offsetWidth; bot.classList.add(cls); setTimeout(() => bot.classList.remove(cls), 280); };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const draw = () => {
      const W = area.clientWidth, H = area.clientHeight;
      const minX = R + PAD, maxX = Math.max(minX, W - R - PAD), minY = R + PAD, bubbleH = el.querySelector<HTMLElement>(".agame-bubble")?.offsetHeight || 66;
      const maxY = Math.max(minY, H - GAP - bubbleH - PAD - 46); // 46: room for the legend at the foot
      return { W, minX, maxX, minY, maxY };
    };
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (ts - (st.last || ts)) / 1000); st.last = ts;
      const b = draw();
      if (!reduced && !st.hover && !quietRef.current && document.visibilityState === "visible") {
        st.x += st.vx * dt; st.y += st.vy * dt;
        if (st.x <= b.minX) { st.x = b.minX; st.vx = Math.abs(st.vx); bump("bump-x"); } else if (st.x >= b.maxX) { st.x = b.maxX; st.vx = -Math.abs(st.vx); bump("bump-x"); }
        if (st.y <= b.minY) { st.y = b.minY; st.vy = Math.abs(st.vy); bump("bump-y"); } else if (st.y >= b.maxY) { st.y = b.maxY; st.vy = -Math.abs(st.vy); bump("bump-y"); }
      } else { st.x = Math.min(b.maxX, Math.max(b.minX, st.x)); st.y = Math.min(b.maxY, Math.max(b.minY, st.y)); }
      el.style.transform = `translate(${st.x}px,${st.y}px)`;
      // keep the bubble fully inside the area, whatever the orb's place; its pointer still points at her
      const bw = el.querySelector<HTMLElement>(".agame-bubble")?.offsetWidth || 176;
      const left = Math.min(b.W - PAD - bw - st.x, Math.max(PAD - st.x, -bw / 2));
      el.style.setProperty("--bx", `${left}px`); el.style.setProperty("--ax", `${-left - 5}px`);
    };
    raf = requestAnimationFrame(tick);
    const over = () => { st.hover = true; }, out = () => { st.hover = false; };
    el.addEventListener("mouseenter", over); el.addEventListener("mouseleave", out);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("mouseenter", over); el.removeEventListener("mouseleave", out); };
  }, []);
  const onHover = () => {
    const r = teaseRef.current, now = Date.now(); if (away || quietRef.current || typing() || now - r.last < 3500) return;
    r.last = now; if (now - r.first > 20000) { r.first = now; r.n = 0; } r.n += 1;
    const pickT = r.n >= 5 ? TEASED_TOO_MUCH : TEASED[Math.floor(Math.random() * TEASED.length)];
    if (r.n >= 5) r.n = 0;
    setTease(pickT); setMood(null); clearTimeout(r.timer); r.timer = setTimeout(() => setTease(null), 3000);
  };
  const getHome = () => wrap.current?.querySelector<HTMLElement>(".agame-bot")?.getBoundingClientRect() || null;
  const go = () => { setMood(null); setPunched(true); setTimeout(() => { setPunched(false); if (!path.startsWith("/nav/games")) router.push("/nav/games"); }, 450); };
  return (
    <>
    <div className={`agame${away ? " gone" : ""}`} ref={wrap} onMouseEnter={onHover}>
      {!punched && !away && !quiet && (tease || mood
        ? <button type="button" className="agame-bubble funny" onClick={go} title="Open Aria's playroom">{tease ? tease.t : mood}</button>
        : hint === 0
          ? <button type="button" className="agame-bubble" onClick={go} title="Open Aria's playroom">Want to play? 🎮<br />Press here 👆</button>
          : <button type="button" className="agame-bubble wide" onClick={go} title="Open Aria's playroom">One click: I follow you 🐾<br />Double-click: I go home 🏠</button>)}
        <button type="button" className={`agame-bot${punched ? " punched" : ""}${tease ? " tickled" : mood && !punched ? " sad" : ""}`} onClick={() => { setMood(null); setAway(true); }} aria-label="Aria: send her exploring around the page (double-click her to bring her home)" title="Click me and I will follow your mouse">
          <AriaFace mood={tease ? tease.m : mood ? "oops" : "happy"} />
        </button>
    </div>
    {!away && <div className="agame-legend">
      {quiet
        ? <p>Quiet mode is on: Aria stays calm and does not interrupt. <button type="button" onClick={go}>Open the playroom</button></p>
        : <p>Click Aria: she follows your mouse. Double-click: she goes home. Press her bubble: games.</p>}
      <span className="agame-toggles">
        <label><input type="checkbox" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} /> Quiet mode</label>
        {def.canSet && <label title="The default for everyone who has not chosen for themselves"><input type="checkbox" checked={def.quietDefault} onChange={(e) => setEveryone(e.target.checked)} /> Quiet for everyone</label>}
      </span>
    </div>}
    {away && <><p className="agame-note">Aria is out exploring. Double-click her, or press Esc, to call her home.</p><AriaTraveller getHome={getHome} onHome={() => setAway(false)} name={def.name || ""} /></>}
    </>
  );
}

// In the playroom the big Aria is the host, so the roaming one steps aside and the panel only offers a way out.
export default function AriaGame() {
  const path = usePathname(), router = useRouter();
  if (path.startsWith("/nav/games")) return (
    <div className="agame-away">
      <b>Playing with Aria</b>
      <span>She is hosting the playroom. Take your time.</span>
      <button type="button" className="btn tiny" onClick={() => (window.history.length > 1 ? router.back() : router.push("/nav/about"))}>Done playing</button>
    </div>);
  return <Roamer />;
}
