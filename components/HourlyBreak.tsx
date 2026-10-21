"use client";
import { useEffect, useRef, useState } from "react";
import { AriaFace } from "@/components/AriaFace";

// Hourly break reminder: between 10:00 and 18:00 (the person's own clock), on each full hour from 11:00 to 18:00, Aria peeks out
// from behind a clock, rings a cuckoo chime and says an hour has passed. Quiet mode (the switch under Aria) turns it off.
// Browser only: no API cost. Skipped while the person is typing, and only shown if the tab is in view within 5 minutes of the hour.
const FIRST = 11, LAST = 18; // 10:00 is the start of the window, so the first full hour that has passed is 11:00
const MESSAGE = "1 hour has passed. Take a 10 minute walk, or have a coffee and chill for some time, then come back.";

function cuckoo() {
  try {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const c = new C(); if (c.state === "suspended") c.resume().catch(() => {});
    const note = (f: number, t0: number, d: number) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = "sine"; o.frequency.value = f; o.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(0.0001, c.currentTime + t0); g.gain.exponentialRampToValueAtTime(0.3, c.currentTime + t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + d);
      o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + d + 0.05);
    };
    note(784, 0, 0.32); note(659, 0.38, 0.5);
    setTimeout(() => c.close().catch(() => {}), 1500);
  } catch { /* the browser blocked sound until a click: the card still shows */ }
}

export default function HourlyBreak() {
  const [show, setShow] = useState<{ hour: number } | null>(null), [up, setUp] = useState(false), [voice, setVoice] = useState(true);
  const lastKey = useRef(0), timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const quiet = useRef(false), pending = useRef<number | null>(null);

  useEffect(() => { try { setVoice(localStorage.getItem("hourly-voice") !== "0"); } catch { /* optional */ } }, []);
  // Quiet mode: the person's own choice wins, otherwise the Super Admin's default for everyone (same rule as Aria's roaming).
  useEffect(() => {
    let local: string | null = null; try { local = localStorage.getItem("aria-quiet"); } catch { /* optional */ }
    if (local === "1" || local === "0") { quiet.current = local === "1"; return; }
    fetch("/api/aria-prefs", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { quiet.current = !!j?.quietDefault; }).catch(() => {});
  }, []);
  useEffect(() => { const k = () => { lastKey.current = Date.now(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);

  const typing = () => { const a = document.activeElement as HTMLElement | null, t = a?.tagName; return (!!a && (t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || a.isContentEditable)) || Date.now() - lastKey.current < 4000; };
  const hide = () => { timers.current.forEach(clearTimeout); timers.current = []; setUp(false); try { window.speechSynthesis?.cancel(); } catch { /* optional */ } setTimeout(() => setShow(null), 600); };
  const open = (hour: number, spoken: boolean) => {
    setShow({ hour });
    timers.current.push(setTimeout(() => { setUp(true); cuckoo(); }, 250));
    if (spoken) timers.current.push(setTimeout(() => { try { const u = new SpeechSynthesisUtterance(MESSAGE); u.rate = 0.95; window.speechSynthesis.speak(u); } catch { /* optional */ } }, 1500));
    timers.current.push(setTimeout(hide, 26000));
  };

  useEffect(() => {
    const tick = () => {
      const d = new Date(), h = d.getHours(), key = `${d.toDateString()}-${h}`;
      if (h < FIRST || h > LAST || d.getMinutes() >= 5) { pending.current = null; return; }
      let done = ""; try { done = localStorage.getItem("hourly-last") || ""; if (sessionStorage.getItem("hourly-off") === d.toDateString()) return; } catch { /* optional */ }
      if (done === key || quiet.current) return;
      if (document.visibilityState !== "visible" || typing()) return; // waits, and tries again until five minutes past the hour
      try { localStorage.setItem("hourly-last", key); } catch { /* optional */ }
      let spoken = true; try { spoken = localStorage.getItem("hourly-voice") !== "0"; } catch { /* optional */ }
      open(h, spoken);
    };
    const t = setInterval(tick, 15000); tick();
    const test = () => open(new Date().getHours(), true); // window.dispatchEvent(new Event("hourly-break-test")) to see it now
    window.addEventListener("hourly-break-test", test);
    return () => { clearInterval(t); window.removeEventListener("hourly-break-test", test); timers.current.forEach(clearTimeout); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!show) return null;
  const hr = show.hour % 12, hourDeg = hr * 30;
  return (
    <div className="hb" role="status" aria-live="polite">
      <div className="hb-stage">
        <div className={`hb-aria${up ? " up" : ""}`}><AriaFace mood={up ? "cheer" : "happy"} /></div>
        <svg className="hb-clock" viewBox="0 0 300 148" aria-hidden="true">
          <circle cx="150" cy="104" r="44" className="hb-face" />
          {Array.from({ length: 12 }, (_, i) => <line key={i} x1="150" y1="64" x2="150" y2={i % 3 === 0 ? 72 : 69} className="hb-tick" transform={`rotate(${i * 30} 150 104)`} />)}
          <line x1="150" y1="104" x2="150" y2="72" className="hb-hand" />
          <line x1="150" y1="104" x2="150" y2="84" className="hb-hand hr" transform={`rotate(${hourDeg} 150 104)`} />
          <circle cx="150" cy="104" r="2.5" className="hb-pin" />
        </svg>
      </div>
      <p className="hb-msg">{MESSAGE}</p>
      <div className="hb-actions">
        <button type="button" className="btn primary" onClick={hide}>Got it</button>
        <button type="button" className="btn" onClick={() => { const n = !voice; setVoice(n); try { localStorage.setItem("hourly-voice", n ? "1" : "0"); if (!n) window.speechSynthesis?.cancel(); } catch { /* optional */ } }}>{voice ? "Voice off" : "Voice on"}</button>
        <button type="button" className="btn" onClick={() => { try { sessionStorage.setItem("hourly-off", new Date().toDateString()); } catch { /* optional */ } hide(); }}>Not today</button>
      </div>
    </div>
  );
}
