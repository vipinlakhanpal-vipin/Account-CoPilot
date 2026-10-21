"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AriaFace } from "@/components/AriaFace";
import { ALARMS, ladyVoices, playAlarm, speak, stopSpeaking, type Lady } from "@/lib/hourlyAudio";

// Hourly break reminder: between 10:00 and 18:00 (the person's own clock), on each full hour from 11:00 to 18:00, Aria peeks out
// from behind a clock, rings an alarm and says an hour has passed. Everyone chooses their own alarm and lady's voice (or none) in
// "Hourly break settings" (under Aria's Tips and settings, or the link on the card). Quiet mode (the switch under Aria) turns it off.
// Browser only: no API cost. Skipped while the person is typing, and only shown if the tab is in view within 5 minutes of the hour.
const FIRST = 11, LAST = 18; // 10:00 is the start of the window, so the first full hour that has passed is 11:00
const MESSAGE = "1 hour has passed. Take a 10 minute walk, or have a coffee and chill for some time, then come back.";
const SPOKEN = "One hour has passed. Take a ten minute walk, or have a coffee, and relax for a little while. Then come back.";

type Prefs = { on: boolean; sound: string; voiceOn: boolean; voice: string }; // sound "off" = no alarm; voice "" = the softest lady's voice found
const DEFAULTS: Prefs = { on: true, sound: "cuckoo", voiceOn: true, voice: "" };
const loadPrefs = (): Prefs => {
  try {
    const p = { ...DEFAULTS, ...JSON.parse(localStorage.getItem("hourly-prefs") || "{}") };
    if (localStorage.getItem("hourly-voice") === "0" && !localStorage.getItem("hourly-prefs")) p.voiceOn = false; // from the first release
    return p;
  } catch { return DEFAULTS; }
};

export default function HourlyBreak() {
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULTS), prefsRef = useRef<Prefs>(DEFAULTS);
  const [show, setShow] = useState<{ hour: number } | null>(null), [up, setUp] = useState(false), [speaking, setSpeaking] = useState(false);
  const [settings, setSettings] = useState(false), [ladies, setLadies] = useState<Lady[]>([]);
  const lastKey = useRef(0), timers = useRef<ReturnType<typeof setTimeout>[]>([]), quiet = useRef(false);

  const setPrefs = (patch: Partial<Prefs>) => { const n = { ...prefsRef.current, ...patch }; prefsRef.current = n; setPrefsState(n); try { localStorage.setItem("hourly-prefs", JSON.stringify(n)); } catch { /* optional */ } };
  useEffect(() => { const p = loadPrefs(); prefsRef.current = p; setPrefsState(p); }, []);
  // Voices load a moment after the page does.
  useEffect(() => {
    if (!window.speechSynthesis) return;
    const load = () => setLadies(ladyVoices());
    load(); window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  // Quiet mode: the person's own choice wins, otherwise the Super Admin's default for everyone (same rule as Aria's roaming).
  useEffect(() => {
    let local: string | null = null; try { local = localStorage.getItem("aria-quiet"); } catch { /* optional */ }
    if (local === "1" || local === "0") { quiet.current = local === "1"; return; }
    fetch("/api/aria-prefs", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { quiet.current = !!j?.quietDefault; }).catch(() => {});
  }, []);
  useEffect(() => { const k = () => { lastKey.current = Date.now(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  useEffect(() => { const o = () => setSettings(true); window.addEventListener("hourly-break-settings", o); return () => window.removeEventListener("hourly-break-settings", o); }, []);

  const typing = () => { const a = document.activeElement as HTMLElement | null, t = a?.tagName; return (!!a && (t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || a.isContentEditable)) || Date.now() - lastKey.current < 4000; };
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
      if (!prefsRef.current.on || h < FIRST || h > LAST || d.getMinutes() >= 5) return;
      let done = ""; try { done = localStorage.getItem("hourly-last") || ""; if (sessionStorage.getItem("hourly-off") === d.toDateString()) return; } catch { /* optional */ }
      if (done === key || quiet.current) return;
      if (document.visibilityState !== "visible" || typing()) return; // waits, and tries again until five minutes past the hour
      try { localStorage.setItem("hourly-last", key); } catch { /* optional */ }
      open(h);
    };
    const t = setInterval(tick, 15000); tick();
    const test = () => open(new Date().getHours()); // window.dispatchEvent(new Event("hourly-break-test")) to see it now
    window.addEventListener("hourly-break-test", test);
    return () => { clearInterval(t); window.removeEventListener("hourly-break-test", test); timers.current.forEach(clearTimeout); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const hourDeg = ((show?.hour ?? 0) % 12) * 30;
  const chosen = prefs.voice && ladies.some((l) => l.name === prefs.voice) ? prefs.voice : "";
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
            <button type="button" className="link" onClick={() => { hide(); setSettings(true); }}>Settings…</button>
          </div>
        </div>
      )}
      {settings && (
        <div className="hb-set" role="dialog" aria-label="Hourly break settings">
          <div className="hb-set-head"><b>Hourly break settings</b><button type="button" className="hb-x" aria-label="Close" onClick={() => { stopSpeaking(); setSettings(false); }}>×</button></div>
          <label className="hb-row"><input type="checkbox" checked={prefs.on} onChange={(e) => setPrefs({ on: e.target.checked })} /> Remind me every hour, 10am to 6pm</label>
          <div className="hb-field"><span>Alarm</span>
            <div className="hb-pick">
              <select value={prefs.sound} onChange={(e) => { setPrefs({ sound: e.target.value }); if (e.target.value !== "off") playAlarm(e.target.value); }} aria-label="Alarm sound">
                <option value="off">No sound</option>
                {ALARMS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
              <button type="button" className="btn" disabled={prefs.sound === "off"} onClick={() => playAlarm(prefs.sound)}>Play</button>
            </div></div>
          <label className="hb-row"><input type="checkbox" checked={prefs.voiceOn} onChange={(e) => { setPrefs({ voiceOn: e.target.checked }); if (!e.target.checked) stopSpeaking(); }} /> Speak the message</label>
          <div className="hb-field"><span>Lady&apos;s voice</span>
            <div className="hb-pick">
              <select value={chosen} disabled={!prefs.voiceOn || !ladies.length} onChange={(e) => { setPrefs({ voice: e.target.value }); speak("Hello, I will remind you to take a short break.", e.target.value); }} aria-label="Lady's voice">
                <option value="">{ladies.length ? "Softest available (automatic)" : "No voices found on this device"}</option>
                {ladies.map((l) => <option key={l.name} value={l.name}>{l.name}{l.soft ? " (natural)" : ""}</option>)}
              </select>
              <button type="button" className="btn" disabled={!prefs.voiceOn || !ladies.length} onClick={() => speak(SPOKEN, chosen)}>Hear it</button>
              <button type="button" className="btn" onClick={stopSpeaking}>Stop</button>
            </div></div>
          <p className="hb-note">Voices come from your device. For the softest, most natural voice on a Mac, add a Premium voice in System Settings, Accessibility, Spoken Content, System voice, Manage voices. Microsoft Edge has natural voices built in. Your choices are kept in this browser.</p>
        </div>
      )}
    </>
  );
}
