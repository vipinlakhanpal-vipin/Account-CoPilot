"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

// Aria floats in the left panel. Clicking her opens the Game room page on the right (components/GameRoom.tsx). Now and then, while she sits idle, she flashes a funny message for a few seconds.
const MOODS = [
  "Talk to me, I'm bored 😢", "Psst… nobody has asked me anything in ages 🥲", "I know every account. Ask me one? 😞",
  "Is it just me, or is it quiet in here? 😔", "I could be useful right now… 😢", "Want to play? I'll go easy on you 🥺",
  "My jigsaw is lonely. So am I 😭", "Ask me for a list. Any list. Please 🥲", "Beep boop. Bored boop 😞", "I did my homework. Test me? 😢",
];
export default function AriaGame() {
  const router = useRouter(), path = usePathname();
  const [mood, setMood] = useState<string | null>(null), lastMood = useRef(-1);
  const [punched, setPunched] = useState(false);
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
  const go = () => { setMood(null); setPunched(true); setTimeout(() => { setPunched(false); if (!path.startsWith("/nav/games")) router.push("/nav/games"); }, 450); };
  return (
    <div className="agame">
      {!punched && (mood
        ? <span className="agame-bubble funny" role="status">{mood}</span>
        : <span className="agame-bubble" aria-hidden="true">Want to play? 🎮<br />Click me! 👆</span>)}
        <button type="button" className={`agame-bot${punched ? " punched" : ""}${mood && !punched ? " sad" : ""}`} onClick={go} aria-label="Aria: open the Game room">
          <svg viewBox="0 0 24 24" aria-hidden="true">
          <defs>
            <linearGradient id="ar-head" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="0.6" stopColor="#ECE8FF" /><stop offset="1" stopColor="#C9C2F2" /></linearGradient>
            <radialGradient id="ar-eye" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stopColor="#8E7CFF" /><stop offset="0.55" stopColor="#4B3BB8" /><stop offset="1" stopColor="#241A72" /></radialGradient>
            <radialGradient id="ar-ant" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stopColor="#FFF6C9" /><stop offset="1" stopColor="#FFC83D" /></radialGradient>
            <filter id="ar-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.55" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          <ellipse cx="12" cy="21.6" rx="6.4" ry="1.1" fill="#1A1260" opacity=".35" />
          <path d="M12 4.3v2.2" stroke="#E4E0FF" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="12" cy="2.9" r="1.45" fill="url(#ar-ant)" filter="url(#ar-glow)" />
          <rect x="2.3" y="9.6" width="2" height="4.8" rx="1" fill="url(#ar-head)" />
          <rect x="19.7" y="9.6" width="2" height="4.8" rx="1" fill="url(#ar-head)" />
          <rect x="4.6" y="6.4" width="14.8" height="11.2" rx="3.6" fill="url(#ar-head)" />
          <rect x="4.6" y="6.4" width="14.8" height="11.2" rx="3.6" fill="none" stroke="#FFFFFF" strokeOpacity=".9" strokeWidth=".5" />
          <path d="M6.2 8.4c1.2-1 3.4-1.4 5-1.3" stroke="#FFFFFF" strokeWidth="1" strokeLinecap="round" opacity=".9" fill="none" />
          <circle cx="9.1" cy="11.5" r="1.85" fill="url(#ar-eye)" /><circle cx="14.9" cy="11.5" r="1.85" fill="url(#ar-eye)" />
          <circle cx="8.5" cy="10.8" r=".55" fill="#fff" /><circle cx="14.3" cy="10.8" r=".55" fill="#fff" />
          <path d="M9.4 15h5.2" stroke="#19D3B0" strokeWidth="1.5" strokeLinecap="round" filter="url(#ar-glow)" />
          <rect x="8" y="18.4" width="8" height="2.6" rx="1.3" fill="url(#ar-head)" />
        </svg>
        </button>
    </div>
  );
}
