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
  // Aria rides a clock dial in the free space of her area: she sits on the minute hand's tip and glides round as the time ticks, so her place tells the time (12 at the top, 3 right, 6 bottom, 9 left; the compass letters N, E, S, W sit beside them).
  // The dial is drawn faint and light on the panel. She pauses while the pointer is on her.
  const wrap = useRef<HTMLDivElement>(null), dial = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const el = wrap.current, area = el?.parentElement, svg = dial.current;
    if (!el || !area || !svg) return;
    const PAD = 8;
    const hourH = svg.querySelector<SVGLineElement>(".dl-hour"), minH = svg.querySelector<SVGLineElement>(".dl-min"), secD = svg.querySelector<SVGCircleElement>(".dl-sec");
    const st = { hover: false, first: true };
    const tick = () => {
      const W = area.clientWidth;
      const legendH = area.querySelector<HTMLElement>(".agame-legend")?.offsetHeight || 46;
      // The dome always gets room: the area is at least the legend plus the smallest dome, so on a short laptop window the panel scrolls instead of the dome running over the buttons.
      const DMIN = 52, need = Math.ceil(legendH + 6 + 2 * PAD + 2.2 * DMIN);
      if (area.style.minHeight !== `${need}px`) area.style.minHeight = `${need}px`;
      const free = Math.max(area.clientHeight, need) - (legendH + 6); // height above the legend
      // The glass dome takes the free space, whatever the screen: as wide as the panel allows and as tall as the free height allows (shadow included), up to 170 px so it never looks huge on a 32 inch monitor.
      // Aria and her speech bubbles scale with the dome (--as): 18 to 50 px orb radius.
      const D = Math.max(DMIN, Math.min(170, W / 2 - PAD, (free - 2 * PAD) / 2.2)), R = Math.min(50, Math.max(18, 0.27 * D)), rho = D - R - 5;
      area.style.setProperty("--as", String(R / 36));
      const cx = W / 2, cy = (free - 2.2 * D) / 2 + D;
      svg.style.left = `${cx - 1.06 * D}px`; svg.style.top = `${cy - 1.06 * D}px`; svg.style.width = `${2.12 * D}px`; svg.style.height = `${2.32 * D}px`;
      const now = new Date(), s = now.getSeconds() + now.getMilliseconds() / 1000, m = now.getMinutes() + s / 60, h = (now.getHours() % 12) + m / 60;
      const pt = (deg: number, k: number) => ({ x: Math.sin((deg * Math.PI) / 180) * k, y: -Math.cos((deg * Math.PI) / 180) * k });
      const mp = pt(m * 6, rho / D), hp = pt(h * 30, 0.34), sp = pt(s * 6, 0.8);
      if (minH) { minH.setAttribute("x2", String(mp.x)); minH.setAttribute("y2", String(mp.y)); }
      if (hourH) { hourH.setAttribute("x2", String(hp.x)); hourH.setAttribute("y2", String(hp.y)); }
      if (secD) { secD.setAttribute("cx", String(sp.x)); secD.setAttribute("cy", String(sp.y)); }
      if (st.hover) return;
      el.style.transition = st.first ? "none" : "transform 1s linear"; st.first = false;
      el.style.transform = `translate(${cx + mp.x * D}px,${cy + mp.y * D}px)`;
      // keep the bubble fully inside the area, whatever the orb's place; its pointer still points at her
      const bw = el.querySelector<HTMLElement>(".agame-bubble")?.offsetWidth || 176, x = cx + mp.x * D;
      const left = Math.min(W - PAD - bw - x, Math.max(PAD - x, -bw / 2));
      el.style.setProperty("--bx", `${left}px`); el.style.setProperty("--ax", `${-left - 5}px`);
    };
    tick();
    const id = setInterval(tick, 1000), ro = new ResizeObserver(() => { st.first = true; tick(); }); ro.observe(area);
    const over = () => { st.hover = true; }, out = () => { st.hover = false; };
    el.addEventListener("mouseenter", over); el.addEventListener("mouseleave", out);
    return () => { clearInterval(id); ro.disconnect(); el.removeEventListener("mouseenter", over); el.removeEventListener("mouseleave", out); };
  }, []);
  const onHover = () => {
    const r = teaseRef.current, now = Date.now(); if (away || quietRef.current || typing() || now - r.last < 3500) return;
    r.last = now; if (now - r.first > 20000) { r.first = now; r.n = 0; } r.n += 1;
    const pickT = r.n >= 5 ? TEASED_TOO_MUCH : TEASED[Math.floor(Math.random() * TEASED.length)];
    if (r.n >= 5) r.n = 0;
    setTease(pickT); setMood(null); clearTimeout(r.timer); r.timer = setTimeout(() => setTease(null), 3000);
  };
  const [tips, setTips] = useState(false);
  useEffect(() => { try { setTips(localStorage.getItem("aria-tips-open") === "1"); } catch { /* optional */ } }, []);
  const openChat = () => document.querySelector<HTMLButtonElement>(".nav-aria-mini")?.click(); // Aria's data chat (the assistant that answers questions about the accounts, contacts and signals)
  const getHome = () => wrap.current?.querySelector<HTMLElement>(".agame-bot")?.getBoundingClientRect() || null;
  const go = () => { setMood(null); setPunched(true); setTimeout(() => { setPunched(false); if (!path.startsWith("/nav/games")) router.push("/nav/games"); }, 450); };
  return (
    <>
    <svg className="agame-dial" ref={dial} viewBox="-1.06 -1.06 2.12 2.32" aria-hidden="true">
      <defs>
        <radialGradient id="ad-g" cx="36%" cy="28%" r="80%"><stop offset="0" stopColor="#fff" stopOpacity=".34" /><stop offset=".5" stopColor="#7FA2E8" stopOpacity=".16" /><stop offset="1" stopColor="#0B1233" stopOpacity=".7" /></radialGradient>
        <linearGradient id="ad-h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".5" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>
      <ellipse cx="0" cy="1.1" rx=".74" ry=".09" className="dl-shadow" />
      <circle r="1" className="dl-dome" fill="url(#ad-g)" />
      <circle r=".8" className="dl-ring" />
      {Array.from({ length: 60 }, (_, i) => { const a = (i * 6 * Math.PI) / 180, big = i % 5 === 0, r1 = big ? 0.74 : 0.77; return <line key={i} className={big ? "dl-tick big" : "dl-tick"} x1={Math.sin(a) * r1} y1={-Math.cos(a) * r1} x2={Math.sin(a) * 0.8} y2={-Math.cos(a) * 0.8} />; })}
      {([["12", 0, -0.6, "N", 0, -0.44], ["3", 0.6, 0.05, "E", 0.44, 0.04], ["6", 0, 0.65, "S", 0, 0.48], ["9", -0.6, 0.05, "W", -0.44, 0.04]] as const).map(([n, nx, ny, d, dx, dy]) => <g key={n}><text className="dl-num" x={nx} y={ny}>{n}</text><text className="dl-dir" x={dx} y={dy}>{d}</text></g>)}
      <line className="dl-hour" x1="0" y1="0" x2="0" y2="-0.34" /><line className="dl-min" x1="0" y1="0" x2="0" y2="-0.7" /><circle className="dl-sec" r=".032" cx="0" cy="-0.8" /><circle className="dl-hub" r=".04" />
      <ellipse cx="-.34" cy="-.6" rx=".56" ry=".26" fill="url(#ad-h)" opacity=".5" transform="rotate(-28 -.34 -.6)" />
    </svg>
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
      <div className="agame-actions">
        <button type="button" className="agame-ask" onClick={openChat}>💬 Ask Aria about your data</button>
        <button type="button" className="agame-play" onClick={go}>🎮 Play games with Aria</button>
      </div>
      <button type="button" className="agame-more" aria-expanded={tips} onClick={() => { const n = !tips; setTips(n); try { localStorage.setItem("aria-tips-open", n ? "1" : "0"); } catch { /* optional */ } }}>
        <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true" style={{ transform: tips ? "none" : "rotate(-90deg)", transition: "transform .15s" }}><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg> Tips and settings</button>
      {tips && <div className="agame-more-body">
        {quiet ? <p>Quiet mode is on: Aria stays calm and does not interrupt.</p> : <p>Click Aria: she follows your mouse. Double-click: she goes home.</p>}
        <span className="agame-toggles">
          <label title="Only for you, in this browser: no roaming, teasing or funny messages"><input type="checkbox" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} /> Quiet mode (just me)</label>
          {def.canSet && <label title="The default for every other user who has not chosen for themselves. Their own switch still wins."><input type="checkbox" checked={def.quietDefault} onChange={(e) => setEveryone(e.target.checked)} /> Quiet for everyone (default for other users)</label>}
        </span>
      </div>}
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
      <button type="button" className="btn tiny" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}>Done playing</button>
    </div>);
  return <Roamer />;
}
