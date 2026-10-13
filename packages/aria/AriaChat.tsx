"use client";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { AriaAction } from "./types";

type Action = AriaAction;
type Msg = { role: "user" | "assistant"; content: string; actions?: Action[]; choices?: string[]; mode?: string; note?: string };

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
        <tbody>{rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{inline(c)}</td>)}</tr>)}</tbody></table></div>);
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
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [filing, setFiling] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceOK, setVoiceOK] = useState(false);
  const [readAloud, setReadAloud] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<SR | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendRef = useRef<(q: string) => void>(() => {});

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    setVoiceOK(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    try { setReadAloud(localStorage.getItem(storageKey) === "1"); } catch { /* optional */ }
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs, busy, open]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 60); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const send = useCallback(async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: question }];
    setMsgs(next); setText(""); setBusy(true);
    let reply: Msg;
    try {
      const history = next.slice(-14).map((m) => ({ role: m.role, content: m.content }));
      const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history }) };
      const res = await (sendFn ? sendFn(endpoint, init) : fetch(endpoint, init));
      const j = await res.json().catch(() => ({}));
      reply = res.ok ? { role: "assistant", content: String(j.text || ""), actions: j.actions || [], choices: j.choices || [], mode: j.mode, note: j.note }
        : { role: "assistant", content: j.error || "I could not answer that just now. Try again." };
    } catch { reply = { role: "assistant", content: "I could not reach the server. Try again." }; }
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
  async function file(a: Action, key: string) { setFiling(key); try { await onAction?.(a); } finally { setFiling(""); } }

  const last = msgs[msgs.length - 1];
  return (
    <>
      <button type="button" className={`aria-btn ${buttonClassName}`.trim()} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Ask ${name}`} title={`Ask ${name}`}>
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
        <span className="aria-tip">Ask {name}</span>
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="aria-backdrop" onClick={() => setOpen(false)}>
          <section className="aria-window" role="dialog" aria-modal="true" aria-label={`${name}, your assistant`} onClick={(e) => e.stopPropagation()}>
            <header className="aria-top">
              <span className="aria-badge" aria-hidden="true">{name.charAt(0)}</span>
              <div className="aria-title"><b>{name}</b><small>{tagline}</small></div>
              <div className="aria-top-actions">
                <button type="button" className={`aria-toggle${readAloud ? " on" : ""}`} onClick={toggleRead} aria-pressed={readAloud} title="Read answers aloud">🔊 {readAloud ? "Reading aloud" : "Read aloud"}</button>
                <button type="button" className="btn tiny btn-close" onClick={() => setOpen(false)}>Close</button>
              </div>
            </header>
            <div className="aria-body">
              {msgs.length === 0 && (
                <div className="aria-hello">
                  <h2>How can I help?</h2>
                  <p>{welcomeText || "Ask me anything and I will answer in tables. Type below, or tap the microphone and speak."}</p>
                  <div className="aria-cards">{examples.map(([k, q]) => <button type="button" key={q} onClick={() => send(q)}><small>{k}</small>{q}</button>)}</div>
                </div>
              )}
              {msgs.map((m, i) => (
                <div key={i} className={`aria-msg ${m.role}`}>
                  {m.role === "assistant" && <span className="aria-avatar" aria-hidden="true">{name.charAt(0)}</span>}
                  <div className="aria-bubble">
                    {m.role === "assistant" ? <Md text={m.content} /> : <p>{m.content}</p>}
                    {m.actions && m.actions.length > 0 && (
                      <div className="aria-actions">{m.actions.map((a, j) => (
                        <button type="button" key={j} className="btn primary tiny" disabled={filing === `${i}-${j}`} onClick={() => file(a, `${i}-${j}`)}>
                          {filing === `${i}-${j}` ? "Building…" : `${a.kind === "xlsx" ? "📊" : "📄"} ${a.label}`}</button>))}</div>
                    )}
                    {m.note && <p className={`aria-note ${m.mode === "ai" ? "ai" : "free"}`}>{m.note}</p>}
                    {m.choices && m.choices.length > 0 && i === msgs.length - 1 && !busy && (
                      <div className="aria-choices">{m.choices.map((c) => <button type="button" key={c} onClick={() => send(c)}>{c}</button>)}</div>
                    )}
                  </div>
                </div>
              ))}
              {busy && <div className="aria-msg assistant"><span className="aria-avatar" aria-hidden="true">{name.charAt(0)}</span><div className="aria-bubble"><p className="aria-typing">{name} is checking<span className="aria-dots" /></p></div></div>}
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
