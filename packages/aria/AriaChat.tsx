"use client";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { AriaAction, AriaChoice } from "./types";

type Action = AriaAction;
type Conv = { id: string; at: number; title: string; msgs: { role: "user" | "assistant"; content: string; display?: string; mode?: string; note?: string; ms?: number }[] };
type Msg = { role: "user" | "assistant"; content: string; display?: string; actions?: Action[]; choices?: AriaChoice[]; mode?: string; note?: string; ms?: number };
const GIVE_UP_MS = 90_000;

const DEFAULT_EXAMPLES: [string, string][] = [
  ["Counts", "How many Verified companies do we have in each region?"],
  ["Find", "Which Verified UAE companies run SAP and have a CFO contact?"],
  ["Search anything", "Where does e-invoicing show up in our signals?"],
  ["Company brief", "Give me a PDF report on ADNOC"],
  ["Excel list", "I need an Excel contact list for campaigns"],
  ["Rules", "What is the ICP rule for KSA?"],
];

// A small markdown reader: paragraphs, bullets, **bold** and tables. That is all Aria writes.
function inline(t: string): ReactNode[] {
  return t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>));
}
function Md({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n"), out: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^\s*\|/.test(ln) && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i + 1] || "")) {
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(ln); i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
      i--;
      out.push(<div className="aria-tablewrap" key={`t${i}`}><table className="aria-table"><thead><tr>{head.map((h, j) => <th key={j}>{inline(h)}</th>)}</tr></thead>
        <tbody>{rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} className={c.length <= 26 && !/\s{2}/.test(c) ? "nw" : undefined}>{inline(c)}</td>)}</tr>)}</tbody></table></div>);
    } else if (/^\s*[-*•]\s+/.test(ln)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ""));
      i--;
      out.push(<ul key={`u${i}`}>{items.map((x, j) => <li key={j}>{inline(x)}</li>)}</ul>);
    } else if (ln.trim()) {
      out.push(<p key={`p${i}`}>{inline(ln.replace(/^#+\s*/, ""))}</p>);
    }
  }
  return <>{out}</>;
}
/** What is worth reading aloud: sentences only, not table rows or markdown marks. */
const speakable = (t: string) => t.split("\n").filter((l) => !/^\s*\|/.test(l)).join(" ").replace(/\*\*/g, "").replace(/\s+/g, " ").trim().slice(0, 600);

type SR = { start: () => void; stop: () => void; lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

export type AriaChatProps = {
  /** URL that receives POST { messages: [{role, content}] } and answers { text, actions?, choices? }. Default /api/aria. */
  endpoint?: string;
  /** How the question is sent: pass a function that asks for a PIN, adds auth headers, and so on. Default is plain fetch. */
  send?: (url: string, init: RequestInit) => Promise<Response>;
  /** What a file button does (for example a download). Receives the action your tools prepared. */
  onAction?: (action: AriaAction) => Promise<void> | void;
  /** Example questions on the welcome screen: [label, question]. */
  examples?: [string, string][];
  /** Shown under the message box, for example a cost note. */
  footerNote?: ReactNode;
  name?: string; tagline?: string; welcomeText?: ReactNode; placeholder?: string;
  /** Class on the icon button. Add your own to match neighbouring icons. */
  buttonClassName?: string;
  /** Used to remember the "read aloud" switch. */
  storageKey?: string;
};

export default function AriaChat({ endpoint = "/api/aria", send: sendFn, onAction, examples = DEFAULT_EXAMPLES, footerNote, name = "Aria",
  tagline = "Automatic Responsive Intelligent Assistant", welcomeText, placeholder, buttonClassName = "", storageKey = "aria-read-aloud" }: AriaChatProps) {
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const [mini, setMini] = useState(false); // minimized to a small bar; the chat stays as it is
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const winRef = useRef<HTMLElement>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [history, setHistory] = useState<Conv[]>([]);
  const convId = useRef<string | null>(null);
  const loaded = useRef<unknown>(null); // a chat just opened from History is not re-dated until something is added
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [filing, setFiling] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const [listening, setListening] = useState(false);
  const [voiceOK, setVoiceOK] = useState(false);
  const [readAloud, setReadAloud] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<SR | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendRef = useRef<(q: string) => void>(() => {});

  // Drag the window by its header, or resize it from any edge or corner. The position is kept in state so it
  // survives close/re-open, and is clamped so the header can never be lost off-screen.
  const startDrag = (mode: string) => (e: React.PointerEvent) => {
    if (e.button !== 0 || !winRef.current || mini) return;
    if (mode === "move" && (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const r = winRef.current.getBoundingClientRect();
    const o = { x: r.left, y: r.top, w: r.width, h: r.height };
    const sx = e.clientX, sy = e.clientY, MIN_W = 420, MIN_H = 360;
    setWide(false);
    setRect(o);
    document.body.style.userSelect = "none";
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      const vw = window.innerWidth, vh = window.innerHeight;
      let { x, y, w, h } = o;
      if (mode === "move") {
        x = Math.min(Math.max(o.x + dx, 140 - o.w), vw - 140);
        y = Math.min(Math.max(o.y + dy, 0), vh - 56);
      } else {
        if (mode.includes("e")) w = Math.min(Math.max(MIN_W, o.w + dx), vw - o.x);
        if (mode.includes("s")) h = Math.min(Math.max(MIN_H, o.h + dy), vh - o.y);
        if (mode.includes("w")) { const nw = Math.min(Math.max(MIN_W, o.w - dx), o.x + o.w); x = o.x + o.w - nw; w = nw; }
        if (mode.includes("n")) { const nh = Math.min(Math.max(MIN_H, o.h - dy), o.y + o.h); y = o.y + o.h - nh; h = nh; }
      }
      setRect({ x, y, w, h });
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.body.style.userSelect = "";
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  };
  // keep a dragged window reachable if the browser is shrunk
  useEffect(() => {
    const fit = () => setRect((r) => r && { ...r, x: Math.min(Math.max(r.x, 140 - r.w), window.innerWidth - 140), y: Math.min(Math.max(r.y, 0), window.innerHeight - 56) });
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    setVoiceOK(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    try { setReadAloud(localStorage.getItem(storageKey) === "1"); } catch { /* optional */ }
  }, []);
  // While checking, keep the "working" line in view. When the answer lands, start at the top of it (the question
  // that was asked, then the answer's own heading and table header) instead of jumping to the end of a long table.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    if (busy) { endRef.current?.scrollIntoView({ block: "end" }); return; }
    const nodes = body.querySelectorAll<HTMLElement>(".aria-msg");
    if (nodes.length === 0) return;
    const last = msgs[msgs.length - 1];
    const target = last?.role === "assistant" && nodes.length > 1 ? nodes[nodes.length - 2] : nodes[nodes.length - 1];
    const top = target.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 8;
    body.scrollTo({ top: Math.max(0, top) });
  }, [msgs, busy, open]);
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(id);
  }, [busy]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 60); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !mini) setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, mini]);

  const histKey = `${storageKey}-history`;
  useEffect(() => {
    try { const raw = JSON.parse(localStorage.getItem(histKey) || "[]"); if (Array.isArray(raw)) setHistory(raw); } catch { /* optional */ }
  }, [histKey]);
  const saveHistory = useCallback((list: Conv[]) => {
    setHistory(list);
    try { localStorage.setItem(histKey, JSON.stringify(list)); } catch { /* optional: private mode or full */ }
  }, [histKey]);
  // Every finished exchange is kept (without download buttons, which can't be reused later). Older than 90 days or beyond 100 chats is dropped.
  useEffect(() => {
    if (busy || msgs.length === 0 || msgs === loaded.current || !msgs.some((m) => m.role === "user")) return;
    if (!convId.current) convId.current = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const first = msgs.find((m) => m.role === "user")!;
    const conv: Conv = { id: convId.current, at: Date.now(), title: (first.display || first.content).slice(0, 120),
      msgs: msgs.map(({ role, content, display, mode, note, ms }) => ({ role, content, display, mode, note, ms })) };
    const keep = history.filter((h) => h.id !== conv.id && Date.now() - h.at < 90 * 864e5).slice(0, 99);
    saveHistory([conv, ...keep]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs, busy]);
  function fresh() {
    cancelledRef.current = true; abortRef.current?.abort();
    window.speechSynthesis?.cancel();
    convId.current = null; setMsgs([]); setText(""); setBusy(false); setListening(false); setView("chat"); setMini(false);
  }
  function openConv(c: Conv) { convId.current = c.id; loaded.current = c.msgs; setMsgs(c.msgs as Msg[]); setView("chat"); }
  const dayLabel = (t: number) => {
    const d = new Date(t), n = new Date(), start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((start(n) - start(d)) / 864e5);
    return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };

  const send = useCallback(async (q: string, shown?: string) => {
    let question = q.trim();
    if (!question || busy) return;
    // "Close this chat, start a new one": the old chat is already in History; the question runs in a clean chat
    let base = msgs, display = shown;
    if (question.startsWith("§new:")) { question = question.slice(5).trim(); base = []; display = undefined; convId.current = null; setView("chat"); }
    else if (question.startsWith("§keep:")) display = question.slice(6).trim(); // sent with the marker so the server keeps the earlier criteria, shown without it
    const next: Msg[] = [...base, { role: "user", content: question, display }];
    setMsgs(next); setText(""); setBusy(true);
    const started = Date.now(), ctl = new AbortController(), giveUp = setTimeout(() => ctl.abort(), GIVE_UP_MS);
    abortRef.current = ctl; cancelledRef.current = false;
    let reply: Msg;
    try {
      const history = next.slice(-14).map((m) => ({ role: m.role, content: m.content }));
      const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history, flow: shown !== undefined }), signal: ctl.signal };
      // Stop (or the 90 second limit) must always free the chat, even while a PIN box is open or the network hangs.
      const stopped = new Promise<never>((_, reject) => ctl.signal.addEventListener("abort", () => reject(new Error("stopped"))));
      const res = await Promise.race([sendFn ? sendFn(endpoint, init) : fetch(endpoint, init), stopped]);
      const j = await res.json().catch(() => ({}));
      reply = res.ok ? { role: "assistant", content: String(j.text || ""), actions: j.actions || [], choices: j.choices || [], mode: j.mode, note: j.note }
        : { role: "assistant", content: j.error || "I could not answer that just now. Try again." };
    } catch {
      reply = { role: "assistant", content: cancelledRef.current ? "Stopped. Ask again whenever you like." : ctl.signal.aborted ? "That took longer than a minute, so I stopped. Try again, or ask something more specific." : "I could not reach the server. Try again." };
    }
    clearTimeout(giveUp); abortRef.current = null;
    reply.ms = Date.now() - started;
    setMsgs([...next, reply]); setBusy(false);
    if (readAloud && "speechSynthesis" in window && reply.content) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(speakable(reply.content)));
    }
  }, [msgs, busy, readAloud, endpoint, sendFn]);
  sendRef.current = send;

  function toggleMic() {
    if (listening) { recRef.current?.stop(); return; }
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US"; rec.interimResults = true; rec.continuous = false;
    let heard = "";
    rec.onresult = (e) => { heard = Array.from(e.results).map((r) => r[0].transcript).join(" ").trim(); setText(heard); };
    rec.onend = () => { setListening(false); if (heard) sendRef.current(heard); };  // speak, and it sends when you stop
    rec.onerror = () => setListening(false);
    recRef.current = rec; setListening(true); setText("");
    window.speechSynthesis?.cancel();
    rec.start();
  }
  function toggleRead() {
    const v = !readAloud; setReadAloud(v);
    try { localStorage.setItem(storageKey, v ? "1" : "0"); } catch { /* optional */ }
    if (!v) window.speechSynthesis?.cancel();
  }
  function restart() {
    cancelledRef.current = true; abortRef.current?.abort();
    window.speechSynthesis?.cancel(); recRef.current?.stop();
    convId.current = null; setMsgs([]); setText(""); setBusy(false); setListening(false); setView("chat");
    setTimeout(() => inputRef.current?.focus(), 30);
  }
  async function file(a: Action, key: string) { setFiling(key); try { await onAction?.(a); } finally { setFiling(""); } }

  const last = msgs[msgs.length - 1];
  return (
    <>
      <button type="button" className={`aria-btn ${buttonClassName}`.trim()} onClick={() => { if (open && mini) { setMini(false); return; } if (!open) fresh(); setOpen((o) => !o); }} aria-expanded={open} aria-label={`${name} - Your interactive agent`}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="2.9" r="1.35" fill="#FFE08A" />
          <path d="M12 4.2v2.3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
          <rect x="4.6" y="6.4" width="14.8" height="11" rx="3.4" fill="#fff" />
          <rect x="2.3" y="9.6" width="1.9" height="4.6" rx="0.95" fill="#fff" />
          <rect x="19.8" y="9.6" width="1.9" height="4.6" rx="0.95" fill="#fff" />
          <circle cx="9.1" cy="11.4" r="1.7" fill="#5B4BC4" />
          <circle cx="14.9" cy="11.4" r="1.7" fill="#5B4BC4" />
          <path d="M9.4 14.9h5.2" stroke="#19D3B0" strokeWidth="1.6" strokeLinecap="round" />
          <rect x="8" y="18.4" width="8" height="2.6" rx="1.3" fill="#fff" />
        </svg>
        <span className="aria-tip" role="tooltip"><span className="aria-tip-dot" aria-hidden="true" />{name} - Your interactive agent</span>
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div className={`aria-backdrop${mini ? " mini" : ""}`} onClick={() => { if (!mini) setOpen(false); }}>
          <section ref={winRef} className={`aria-window${wide ? " wide" : ""}${mini ? " mini" : ""}`} style={mini ? ({ "--slot": 2 } as React.CSSProperties) : rect ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h } : undefined}
            role="dialog" aria-modal="true" aria-label={`${name}, your assistant`} onClick={(e) => e.stopPropagation()}>
            {["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((d) => <span key={d} className={`aria-rz ${d}`} onPointerDown={startDrag(d)} aria-hidden="true" />)}
            <header className="aria-top" onPointerDown={startDrag("move")} title="Drag to move the window anywhere. Drag any edge or corner to resize it.">
              <span className="aria-badge" aria-hidden="true">{name.charAt(0)}</span>
              <div className="aria-title"><b>{name}</b><small>{tagline}</small><small className="aria-hint">✥ Drag me anywhere on the screen, and resize me from any edge or corner</small></div>
              <div className="aria-top-actions">
                <button type="button" className={`aria-home${view === "history" ? " on" : ""}`} onClick={() => setView((v) => (v === "history" ? "chat" : "history"))} aria-pressed={view === "history"} title="Your earlier chats, by date">🕘 History</button>
                <button type="button" className="aria-home aria-minbtn aria-ic" onClick={() => setMini((m) => !m)} aria-label={mini ? "Restore the window" : "Minimize the window"} title={mini ? "Restore the window (+)" : "Minimize: shrink to a small bar so you can work on other things (–)"}>{mini ? "+" : "–"}</button>
                <button type="button" className="aria-home" onClick={() => { setRect(null); setWide((w) => !w); }} aria-pressed={wide} title="Make the window fill the screen, or back to its normal size. You can also drag the header to move it and any edge to resize it.">{wide ? "⤡ Smaller" : "⤢ Expand"}</button>
                {(msgs.length > 0 || view === "history") && <button type="button" className="aria-home" onClick={restart} title="Back to the start screen with the example questions">🏠 Home</button>}
                <button type="button" className={`aria-toggle${readAloud ? " on" : ""}`} onClick={toggleRead} aria-pressed={readAloud} title="Read answers aloud">🔊 {readAloud ? "Reading aloud" : "Read aloud"}</button>
                <button type="button" className="aria-home aria-close" onClick={() => setOpen(false)}>Close</button>
              </div>
            </header>
            <div className="aria-body" ref={bodyRef}>
              {view === "history" && (
                <div className="aria-hist">
                  <div className="aria-hist-head"><h2>Chat history</h2>{history.length > 0 && <button type="button" className="aria-home" onClick={() => { if (window.confirm("Delete all saved chats on this browser?")) saveHistory([]); }}>Clear all</button>}</div>
                  {history.length === 0 ? <p className="aria-hist-empty">Nothing here yet. Your questions are saved as you ask them.</p>
                    : history.map((c, i) => (
                      <Fragment key={c.id}>
                        {(i === 0 || dayLabel(history[i - 1].at) !== dayLabel(c.at)) && <h3 className="aria-hist-day">{dayLabel(c.at)}</h3>}
                        <div className="aria-hist-row">
                          <button type="button" onClick={() => openConv(c)} title="Open this chat">
                            <b>{c.title}</b>
                            <small>{new Date(c.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · {c.msgs.filter((m) => m.role === "user").length} question{c.msgs.filter((m) => m.role === "user").length === 1 ? "" : "s"}</small>
                          </button>
                          <button type="button" className="aria-hist-del" aria-label="Delete this chat" title="Delete this chat" onClick={() => saveHistory(history.filter((h) => h.id !== c.id))}>×</button>
                        </div>
                      </Fragment>))}
                </div>
              )}
              {view === "chat" && msgs.length === 0 && (
                <div className="aria-hello">
                  <h2>How can I help?</h2>
                  <p>{welcomeText || "Ask me anything and I will answer in tables. Type below, or tap the microphone and speak."}</p>
                  <div className="aria-cards">{examples.map(([k, q]) => <button type="button" key={q} onClick={() => send(q)}><small>{k}</small>{q}</button>)}</div>
                </div>
              )}
              {view === "chat" && msgs.map((m, i) => (
                <div key={i} className={`aria-msg ${m.role}`}>
                  {m.role === "assistant" && <span className="aria-avatar" aria-hidden="true">{name.charAt(0)}</span>}
                  <div className="aria-bubble">
                    {m.role === "assistant" ? <Md text={m.content} /> : <p>{m.display || m.content}</p>}
                    {m.actions && m.actions.length > 0 && (
                      <div className="aria-actions">{m.actions.map((a, j) => (
                        <button type="button" key={j} className="btn btn-dl big no-ic" disabled={filing === `${i}-${j}`} onClick={() => file(a, `${i}-${j}`)}>
                          {filing === `${i}-${j}` ? "Building…" : `⬇ ${a.label}`}</button>))}</div>
                    )}
                    {m.role === "assistant" && !busy && <button type="button" className="aria-clear" title="Remove this question and its answer from the screen" onClick={() => setMsgs((all) => all.filter((_, k) => k !== i && !(k === i - 1 && all[k].role === "user")))}>↩ Clear this answer</button>}
                    {m.note && <p className={`aria-note ${m.mode === "ai" ? "ai" : "free"}`}>{m.note}{m.ms !== undefined ? ` · ${(m.ms / 1000).toFixed(1)}s` : ""}</p>}
                    {m.choices && m.choices.length > 0 && i === msgs.length - 1 && !busy && (
                      <div className="aria-choices">{m.choices.map((c) => { const label = typeof c === "string" ? c : c.label, value = typeof c === "string" ? c : c.value;
                        if (typeof c !== "string" && c.number) return <form key={label + value} className="aria-num" onSubmit={(e) => { e.preventDefault(); const n = Math.floor(Number(new FormData(e.currentTarget).get("n"))); if (n >= 1 && n <= 500) send(value.replace("{n}", String(n)), `${n}`); }}>
                          <input name="n" type="number" min={1} max={500} inputMode="numeric" placeholder="Other number" aria-label="Enter how many companies" /><button type="submit">Go</button></form>;
                        return <button type="button" key={label + value} onClick={() => send(value, label)}>{label}</button>; })}</div>
                    )}
                  </div>
                </div>
              ))}
              {view === "chat" && busy && (
                <div className="aria-msg assistant"><span className="aria-avatar" aria-hidden="true">{name.charAt(0)}</span>
                  <div className="aria-bubble aria-wait" role="status" aria-live="polite">
                    <p className="aria-typing">{name} is checking your data<span className="aria-dots" /></p>
                    <div className="aria-bar" aria-hidden="true"><i /></div>
                    <span className={`aria-clock${elapsed >= 20 ? " slow" : ""}`}>{elapsed}s elapsed · {elapsed < 20 ? "free answers take about a second; AI answers usually 5 to 15 seconds" : "taking longer than usual, you can stop it"}</span>
                    <button type="button" className="aria-cancel" onClick={() => { cancelledRef.current = true; abortRef.current?.abort(); }}>Stop</button>
                  </div>
                </div>)}
              {view === "chat" && msgs.length > 0 && !busy && <button type="button" className="aria-restart" onClick={restart}>← Back to the start (example questions)</button>}
              <div ref={endRef} />
            </div>
            <footer className="aria-foot">
              {listening && <div className="aria-listening" role="status"><span className="aria-pulse" />Listening… speak now, and I&apos;ll send it when you stop.</div>}
              <form onSubmit={(e) => { e.preventDefault(); send(text); }}>
                <textarea ref={inputRef} rows={1} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} maxLength={600} aria-label={`Message to ${name}`}
                  placeholder={last?.choices?.length ? "Tap an option above, or type your answer…" : placeholder || "Ask a question…"}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }} />
                <button type="button" className={`aria-mic${listening ? " on" : ""}`} onClick={toggleMic} disabled={!voiceOK || busy} aria-pressed={listening}
                  title={voiceOK ? (listening ? "Stop listening" : `Speak to ${name}`) : "Voice needs Chrome, Edge or Safari"} aria-label={`Speak to ${name}`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 0 0-7 0v5A3.5 3.5 0 0 0 12 15Zm6-3.5a6 6 0 0 1-12 0M12 17.5V21M9 21h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <button type="submit" className="btn primary aria-send" disabled={busy || !text.trim()}>Send</button>
              </form>
              {footerNote && <div className="aria-cost">{footerNote}</div>}
            </footer>
          </section>
        </div>, document.body)}
    </>
  );
}
