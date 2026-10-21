// Sounds and voices for the hourly break (components/HourlyBreak.tsx). Everything is made in the browser: no files, no API cost.

export const ALARMS = [
  { key: "cuckoo", label: "Cuckoo clock" },
  { key: "bell", label: "Soft bell" },
  { key: "chime", label: "Wind chime" },
  { key: "dd", label: "Ding-dong" },
  { key: "marimba", label: "Marimba" },
  { key: "harp", label: "Gentle harp" },
  { key: "bowl", label: "Singing bowl" },
  { key: "kalimba", label: "Kalimba" },
  { key: "glass", label: "Glass ping" },
  { key: "three", label: "Three-note chime" },
  { key: "church", label: "Church bell" },
  { key: "twinkle", label: "Twinkle" },
  { key: "gong", label: "Soft gong" },
] as const;
export type AlarmKey = (typeof ALARMS)[number]["key"];

type Partial = [number, number]; // [multiple of the base pitch, loudness]
export function playAlarm(kind: string) {
  try {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const c = new C(); if (c.state === "suspended") c.resume().catch(() => {});
    const tone = (f: number, t0: number, dur: number, vol: number, type: OscillatorType = "sine", parts: Partial[] = [[1, 1]]) => {
      const g = c.createGain(); g.connect(c.destination);
      g.gain.setValueAtTime(0.0001, c.currentTime + t0); g.gain.exponentialRampToValueAtTime(vol, c.currentTime + t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
      parts.forEach(([m, l]) => { const o = c.createOscillator(), pg = c.createGain(); o.type = type; o.frequency.value = f * m; pg.gain.value = l; o.connect(pg); pg.connect(g); o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + 0.05); });
    };
    let total = 2;
    if (kind === "bell") { tone(523.25, 0, 2.6, 0.35, "sine", [[1, 1], [2.76, 0.35], [5.4, 0.15]]); total = 3; }
    else if (kind === "chime") { [784, 988, 1175, 1319, 1568].forEach((f, i) => tone(f, i * 0.16, 1.8, 0.18, "sine", [[1, 1], [3, 0.12]])); total = 3; }
    else if (kind === "dd") { tone(659.25, 0, 1.2, 0.3, "sine", [[1, 1], [2, 0.2]]); tone(523.25, 0.5, 1.8, 0.3, "sine", [[1, 1], [2, 0.2]]); total = 3; }
    else if (kind === "marimba") { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.14, 0.45, 0.3, "triangle", [[1, 1], [4, 0.08]])); total = 1.5; }
    else if (kind === "harp") { [1047, 880, 784, 659, 523].forEach((f, i) => tone(f, i * 0.18, 1.6, 0.16, "sine", [[1, 1], [2, 0.18]])); total = 3; }
    else if (kind === "bowl") { tone(220, 0, 4.5, 0.3, "sine", [[1, 1], [2.01, 0.5], [3.02, 0.25]]); total = 5; }
    else if (kind === "kalimba") { [659, 784, 988, 784].forEach((f, i) => tone(f, i * 0.22, 1.1, 0.22, "sine", [[1, 1], [6, 0.06]])); total = 2.5; }
    else if (kind === "glass") { tone(1568, 0, 1.8, 0.2, "sine", [[1, 1], [2.4, 0.3], [4.1, 0.12]]); tone(1568, 0.45, 1.8, 0.12, "sine", [[1, 1], [2.4, 0.3]]); total = 2.5; }
    else if (kind === "three") { [523.25, 659.25, 783.99].forEach((f, i) => tone(f, i * 0.3, 1.4, 0.26, "sine", [[1, 1], [2, 0.2]])); total = 2.6; }
    else if (kind === "church") { [0, 1.6, 3.2].forEach((t) => tone(392, t, 2.2, 0.3, "sine", [[1, 1], [2.4, 0.4], [4.2, 0.2], [0.5, 0.35]])); total = 5.6; }
    else if (kind === "twinkle") { [1319, 1568, 1976, 1568, 2093].forEach((f, i) => tone(f, i * 0.11, 0.7, 0.12, "sine", [[1, 1], [2, 0.15]])); total = 1.6; }
    else if (kind === "gong") { tone(130.8, 0, 5, 0.38, "sine", [[1, 1], [1.5, 0.3], [2.02, 0.4], [3.1, 0.2]]); total = 5.5; }
    else { tone(784, 0, 0.32, 0.3); tone(659, 0.38, 0.5, 0.3); total = 1.5; } // cuckoo
    setTimeout(() => c.close().catch(() => {}), total * 1000 + 500);
  } catch { /* the browser blocks sound until the page has had a click */ }
}

// Voices come from the device. Women's voices only, soft ones first: Premium / Enhanced / Natural / Neural beat the plain system ones.
const NOT_A_PERSON = /albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|pipe|trinoids|whisper|zarvox|superstar|fred|junior|ralph|kathy|eddy|grandpa|reed|rocko|wobble/i;
const WOMAN = /female|woman|samantha|ava\b|allison|susan|victoria|karen|moira|tessa|fiona|serena|kate\b|zoe|joanna|nicky|jenny|aria\b|sonia|libby|michelle|emma|amy\b|ivy|kendra|kimberly|salli|matilda|catherine|alice|amelie|anna|ellen|laura|veena|nora|princess|vicki|agnes|flo\b|sandy|shelley|grandma|clara|sara\b|natasha|neerja|heera|mia\b|maisie|olivia|hazel|grace|elsa|siri/i;
const MAN = /\bmale\b|daniel|alex\b|tom\b|oliver|aaron|arthur|gordon|rishi|lee\b|evan|guy\b|ryan|james|george|mark\b|david|richard|thomas|ravi|liam|connor|brian|eric|christopher|davis/i;
export type Lady = { name: string; lang: string; soft: boolean };
const qualityOf = (v: SpeechSynthesisVoice) => (/premium|enhanced|natural|neural|online/i.test(v.name) ? 3 : /google/i.test(v.name) ? 2 : v.localService ? 1 : 0);

export function ladyVoices(): Lady[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  const en = window.speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang) && !NOT_A_PERSON.test(v.name));
  const women = en.filter((v) => (WOMAN.test(v.name) && !MAN.test(v.name)) || /female/i.test(v.name));
  const list = women.length ? women : en;
  return list.map((v) => ({ v, q: qualityOf(v) })).sort((a, b) => b.q - a.q || a.v.name.localeCompare(b.v.name)).map(({ v, q }) => ({ name: v.name, lang: v.lang, soft: q >= 2 }));
}

/** Speaks softly and a little slowly. Returns false when the browser has no voice at all. */
export function speak(text: string, name: string, onState?: (speaking: boolean) => void): boolean {
  try {
    const synth = window.speechSynthesis; if (!synth) return false;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = synth.getVoices().find((x) => x.name === name) || synth.getVoices().find((x) => x.name === ladyVoices()[0]?.name);
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = 0.88; u.pitch = 1.05; u.volume = 0.85;
    u.onstart = () => onState?.(true); u.onend = () => onState?.(false); u.onerror = () => onState?.(false);
    synth.speak(u); return true;
  } catch { return false; }
}
export function stopSpeaking() { try { window.speechSynthesis?.cancel(); } catch { /* optional */ } }
