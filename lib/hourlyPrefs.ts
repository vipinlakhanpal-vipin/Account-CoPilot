// The person's hourly-break choices, kept in this browser. Aria Setup (components/HourlySettings.tsx) writes them;
// the reminder (components/HourlyBreak.tsx) reads them and listens for "hourly-prefs-changed".
export type Prefs = { on: boolean; sound: string; voiceOn: boolean; voice: string }; // sound "off" = no alarm; voice "" = the softest lady's voice found
export const DEFAULT_PREFS: Prefs = { on: true, sound: "cuckoo", voiceOn: true, voice: "" };

export function loadPrefs(): Prefs {
  try {
    const p = { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem("hourly-prefs") || "{}") };
    if (localStorage.getItem("hourly-voice") === "0" && !localStorage.getItem("hourly-prefs")) p.voiceOn = false; // from the first release
    return p;
  } catch { return DEFAULT_PREFS; }
}
export function savePrefs(p: Prefs) {
  try { localStorage.setItem("hourly-prefs", JSON.stringify(p)); } catch { /* optional */ }
  window.dispatchEvent(new Event("hourly-prefs-changed"));
}
