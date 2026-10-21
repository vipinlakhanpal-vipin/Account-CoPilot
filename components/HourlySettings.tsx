"use client";
import { useEffect, useState } from "react";
import { ALARMS, ladyVoices, playAlarm, speak, stopSpeaking, type Lady } from "@/lib/hourlyAudio";
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from "@/lib/hourlyPrefs";

const HELLO = "Hello, I will remind you to take a short break.";

/** The hourly break choices inside Aria Setup: reminder on or off, the alarm, and a lady's voice. */
export default function HourlySettings() {
  const [p, setP] = useState<Prefs>(DEFAULT_PREFS), [ladies, setLadies] = useState<Lady[]>([]);
  useEffect(() => { setP(loadPrefs()); }, []);
  useEffect(() => {
    if (!window.speechSynthesis) return;
    const load = () => setLadies(ladyVoices());
    load(); window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => { window.speechSynthesis.removeEventListener("voiceschanged", load); stopSpeaking(); };
  }, []);
  const set = (patch: Partial<Prefs>) => { const n = { ...p, ...patch }; setP(n); savePrefs(n); };
  const chosen = p.voice && ladies.some((l) => l.name === p.voice) ? p.voice : "";
  return (
    <div className="as-box">
      <b className="as-title">Hourly break, 10am to 6pm</b>
      <label className="as-row"><input type="checkbox" checked={p.on} onChange={(e) => set({ on: e.target.checked })} /> Remind me every hour</label>
      <label className="as-lab" htmlFor="as-alarm">Alarm</label>
      <div className="as-pick">
        <select id="as-alarm" value={p.sound} onChange={(e) => { set({ sound: e.target.value }); if (e.target.value !== "off") playAlarm(e.target.value); }}>
          <option value="off">No sound</option>
          {ALARMS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
        </select>
        <button type="button" className="btn tiny" disabled={p.sound === "off"} onClick={() => playAlarm(p.sound)}>Play</button>
      </div>
      <label className="as-row"><input type="checkbox" checked={p.voiceOn} onChange={(e) => { set({ voiceOn: e.target.checked }); if (!e.target.checked) stopSpeaking(); }} /> Speak the message</label>
      <label className="as-lab" htmlFor="as-voice">Lady&apos;s voice</label>
      <div className="as-pick">
        <select id="as-voice" value={chosen} disabled={!p.voiceOn || !ladies.length} onChange={(e) => { set({ voice: e.target.value }); speak(HELLO, e.target.value); }}>
          <option value="">{ladies.length ? "Softest available" : "No voices on this device"}</option>
          {ladies.map((l) => <option key={l.name} value={l.name}>{l.name}{l.soft ? " (natural)" : ""}</option>)}
        </select>
      </div>
      <div className="as-pick">
        <button type="button" className="btn tiny" disabled={!p.voiceOn || !ladies.length} onClick={() => speak(HELLO, chosen)}>Hear it</button>
        <button type="button" className="btn tiny" onClick={stopSpeaking}>Stop voice</button>
        <button type="button" className="btn tiny" onClick={() => window.dispatchEvent(new Event("hourly-break-test"))}>Test it now</button>
      </div>
      <p className="as-note">Voices come from your device. For a softer, natural voice on a Mac, add a Premium voice in System Settings, Accessibility, Spoken Content, System voice, Manage voices.</p>
    </div>
  );
}
