"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AriaFace } from "@/components/AriaFace";
import { playAlarm, speak, stopSpeaking } from "@/lib/hourlyAudio";
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from "@/lib/hourlyPrefs";

// Hourly break reminder: between 10:00 and 18:00 (the person's own clock), on each full hour from 11:00 to 18:00, Aria peeks out
// from behind a clock, rings an alarm and says an hour has passed. Everyone chooses their own alarm and lady's voice (or none) in
// Aria Setup (left panel, under Aria, or the Settings link on the card). Quiet mode (the switch under Aria) turns it off.
// Browser only: no API cost. Skipped while the person is typing, and only shown if the tab is in view within 15 minutes of the hour (a missed alarm appears when you come back).
const FIRST = 11, LAST = 18; // 10:00 is the start of the window, so the first full hour that has passed is 11:00
const MESSAGE = "1 hour has passed. Take a 10 minute walk, or have a coffee and chill for some time, then come back.";
const SPOKEN = "One hour has passed. Take a ten minute walk, or have a coffee, and relax for a little while. Then come back.";

export default function HourlyBreak() {
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS), prefsRef = useRef<Prefs>(DEFAULT_PREFS);
  const [show, setShow] = useState<{ hour: number } | null>(null), [up, setUp] = useState(false), [speaking, setSpeaking] = useState(false);
  const lastKey = useRef(0), timers = useRef<ReturnType<typeof setTimeout>[]>([]), quiet = useRef(false);

  const setPrefs = (patch: Partial<Prefs>) => savePrefs({ ...prefsRef.current, ...patch });
  useEffect(() => { const read = () => { const p = loadPrefs(); prefsRef.current = p; setPrefsState(p); }; read(); window.addEventListener("hourly-prefs-changed", read); return () => window.removeEventListener("hourly-prefs-changed", read); }, []);
  // Quiet mode: the person's own choice wins, otherwise the Super Admin's default for everyone (same rule as Aria's roaming).
  useEffect(() => {
    let local: string | null = null; try { local = localStorage.getItem("aria-quiet"); } catch { /* optional */ }
    if (local === "1" || local === "0") { quiet.current = local === "1"; return; }
    fetch("/api/aria-prefs", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { quiet.current = !!j?.quietDefault; }).catch(() => {});
  }, []);
  useEffect(() => { const k = () => { lastKey.current = Date.now(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);

  const typing = () => Date.now() - lastKey.current < 4000; // only while keys are being pressed: a box left in focus must not block the alarm
  const hide = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; setUp(false); stopSpeaking(); setSpeaking(false); setTimeout(() => setShow(null), 600); }, []);
  const open = useCallback((hour: number) => {
    const p = prefsRef.current;
    setShow({ hour });
    timers.current.push(setTimeout(() => { setUp(true); if (p.sound !== "off") playAlarm(p.sound); }, 250));
    if (p.voiceOn) timers.current.push(setTimeout(() => { speak(SPOKEN, p.voice, setSpeaking); }, 2200));
    timers.current.push(setTimeout(hide, 30000));
  }, [hide]);

  useEffect(() => {
    const tick = () => {
      const d = new Date(), h = d.getHours(), key = `${d.toDateString()}-${h}`;
      if (!prefsRef.current.on || h < FIRST || h > LAST || d.getMinutes() >= 15) return;
      let done = ""; try { done = localStorage.getItem("hourly-last") || ""; if (sessionStorage.getItem("hourly-off") === d.toDateString()) return; } catch { /* optional */ }
      if (done === key || quiet.current) return;
      if (document.visibilityState !== "visible" || typing()) return; // waits, and tries again until a quarter past the hour
      try { localStorage.setItem("hourly-last", key); } catch { /* optional */ }
      open(h);
    };
    const t = setInterval(tick, 15000); tick();
    const back = () => { if (document.visibilityState === "visible") tick(); }; // coming back to the tab shows a missed alarm at once
    document.addEventListener("visibilitychange", back); window.addEventListener("focus", back);
    const test = () => open(new Date().getHours()); // window.dispatchEvent(new Event("hourly-break-test")) to see it now
    window.addEventListener("hourly-break-test", test);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", back); window.removeEventListener("focus", back); window.removeEventListener("hourly-break-test", test); timers.current.forEach(clearTimeout); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const hourDeg = ((show?.hour ?? 0) % 12) * 30;
  return (
    <>
      {show && (
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
            {speaking && <button type="button" className="btn" onClick={() => { stopSpeaking(); setSpeaking(false); }}>Stop voice</button>}
            <button type="button" className="btn" onClick={() => { try { sessionStorage.setItem("hourly-off", new Date().toDateString()); } catch { /* optional */ } hide(); }}>Not today</button>
          </div>
          <div className="hb-quick">
            <label><input type="checkbox" checked={prefs.sound !== "off"} onChange={(e) => setPrefs({ sound: e.target.checked ? (prefs.sound === "off" ? "cuckoo" : prefs.sound) : "off" })} /> Alarm sound</label>
            <label><input type="checkbox" checked={prefs.voiceOn} onChange={(e) => { setPrefs({ voiceOn: e.target.checked }); if (!e.target.checked) { stopSpeaking(); setSpeaking(false); } }} /> Voice</label>
            <button type="button" className="link" onClick={() => { hide(); window.dispatchEvent(new Event("aria-setup-open")); }}>Aria Setup…</button>
          </div>
        </div>
      )}
    </>
  );
}
