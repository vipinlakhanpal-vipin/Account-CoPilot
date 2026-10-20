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
function Roamer() {
  const router = useRouter(), path = usePathname();
  const [mood, setMood] = useState<string | null>(null), lastMood = useRef(-1);
  const [punched, setPunched] = useState(false), [away, setAway] = useState(false);
  // Every 40 to 70 seconds, if the tab is in view and she is not being clicked, she flashes a message for 7 seconds.
  useEffect(() => {
    let t1: ReturnType<typeof setTimeout>, t2: ReturnType<typeof setTimeout>;
    const loop = (first: boolean) => {
      t1 = setTimeout(() => {
        if (document.visibilityState === "visible") {
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
      const maxY = Math.max(minY, H - GAP - bubbleH - PAD);
      return { W, minX, maxX, minY, maxY };
    };
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (ts - (st.last || ts)) / 1000); st.last = ts;
      const b = draw();
      if (!reduced && !st.hover && document.visibilityState === "visible") {
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
  const getHome = () => wrap.current?.querySelector<HTMLElement>(".agame-bot")?.getBoundingClientRect() || null;
  const go = () => { setMood(null); setPunched(true); setTimeout(() => { setPunched(false); if (!path.startsWith("/nav/games")) router.push("/nav/games"); }, 450); };
  return (
    <>
    <div className={`agame${away ? " gone" : ""}`} ref={wrap}>
      {!punched && !away && (mood
        ? <button type="button" className="agame-bubble funny" onClick={go} title="Open Aria's playroom">{mood}</button>
        : <button type="button" className="agame-bubble" onClick={go} title="Open Aria's playroom">Want to play? 🎮<br />Press here 👆</button>)}
        <button type="button" className={`agame-bot${punched ? " punched" : ""}${mood && !punched ? " sad" : ""}`} onClick={() => { setMood(null); setAway(true); }} aria-label="Aria: send her exploring around the page (double-click her to bring her home)" title="Click me and I will follow your mouse">
          <AriaFace mood={mood ? "oops" : "happy"} />
        </button>
    </div>
    {away && <><p className="agame-note">Aria is out exploring. Double-click her, or press Esc, to call her home.</p><AriaTraveller getHome={getHome} onHome={() => setAway(false)} /></>}
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
