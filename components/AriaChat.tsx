"use client";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { paidFetch } from "@/components/Confirm";
import { downloadReport } from "@/components/ReportDialog";
import CostNote from "@/components/CostNote";

type Action = { kind: "xlsx" | "pdf"; label: string; body: Record<string, unknown> };
type Msg = { role: "user" | "assistant"; content: string; actions?: Action[]; choices?: string[] };

const EXAMPLES: [string, string][] = [
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

export default function AriaChat() {
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
    try { setReadAloud(localStorage.getItem("aria-read-aloud") === "1"); } catch { /* optional */ }
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
      const res = await paidFetch("/api/aria", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history }) }, "Asking Aria");
      const j = await res.json().catch(() => ({}));
      reply = res.ok ? { role: "assistant", content: String(j.text || ""), actions: j.actions || [], choices: j.choices || [] }
        : { role: "assistant", content: j.error || "Aria could not answer that just now. Try again." };
    } catch { reply = { role: "assistant", content: "I could not reach the server. Try again." }; }
    setMsgs([...next, reply]); setBusy(false);
    if (readAloud && "speechSynthesis" in window && reply.content) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(speakable(reply.content)));
    }
  }, [msgs, busy, readAloud]);
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
    try { localStorage.setItem("aria-read-aloud", v ? "1" : "0"); } catch { /* optional */ }
    if (!v) window.speechSynthesis?.cancel();
  }
  async function file(a: Action, key: string) { setFiling(key); await downloadReport(a.body, a.kind); setFiling(""); }

  const last = msgs[msgs.length - 1];
  return (
    <>
      <button type="button" className="bell-btn aria-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Ask Aria" title="Ask Aria: search your data, build Excel and PDF reports">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4.6 17.2 19h-2.6l-.95-2.9H10.4L9.4 19H6.8L12 4.6Zm-.05 4.1-1.9 5.4h3.8l-1.9-5.4Z" fill="currentColor" />
          <path d="M19.6 2.4l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6.6-1.7Z" fill="#FFE08A" />
        </svg>
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="aria-backdrop" onClick={() => setOpen(false)}>
          <section className="aria-window" role="dialog" aria-modal="true" aria-label="Aria, your Account CoPilot assistant" onClick={(e) => e.stopPropagation()}>
            <header className="aria-top">
              <span className="aria-badge" aria-hidden="true">A</span>
              <div className="aria-title"><b>Aria</b><small>Automatic Responsible Intelligent Assistant</small></div>
              <div className="aria-top-actions">
                <button type="button" className={`aria-toggle${readAloud ? " on" : ""}`} onClick={toggleRead} aria-pressed={readAloud} title="Read Aria's answers aloud">🔊 {readAloud ? "Reading aloud" : "Read aloud"}</button>
                <button type="button" className="btn tiny btn-close" onClick={() => setOpen(false)}>Close</button>
              </div>
            </header>
            <div className="aria-body">
              {msgs.length === 0 && (
                <div className="aria-hello">
                  <h2>How can I help?</h2>
                  <p>Ask me anything that lives in Account CoPilot: companies, contacts, signals, technology, sources, ICP rules, engine runs. I answer in tables, and I can build a detailed <b>PDF</b> or an <b>Excel</b> contact list for you. Type below, or tap the microphone and speak.</p>
                  <div className="aria-cards">{EXAMPLES.map(([k, q]) => <button type="button" key={q} onClick={() => send(q)}><small>{k}</small>{q}</button>)}</div>
                </div>
              )}
              {msgs.map((m, i) => (
                <div key={i} className={`aria-msg ${m.role}`}>
                  {m.role === "assistant" && <span className="aria-avatar" aria-hidden="true">A</span>}
                  <div className="aria-bubble">
                    {m.role === "assistant" ? <Md text={m.content} /> : <p>{m.content}</p>}
                    {m.actions && m.actions.length > 0 && (
                      <div className="aria-actions">{m.actions.map((a, j) => (
                        <button type="button" key={j} className="btn primary tiny" disabled={filing === `${i}-${j}`} onClick={() => file(a, `${i}-${j}`)}>
                          {filing === `${i}-${j}` ? "Building…" : `${a.kind === "xlsx" ? "📊" : "📄"} ${a.label}`}</button>))}</div>
                    )}
                    {m.choices && m.choices.length > 0 && i === msgs.length - 1 && !busy && (
                      <div className="aria-choices">{m.choices.map((c) => <button type="button" key={c} onClick={() => send(c)}>{c}</button>)}</div>
                    )}
                  </div>
                </div>
              ))}
              {busy && <div className="aria-msg assistant"><span className="aria-avatar" aria-hidden="true">A</span><div className="aria-bubble"><p className="aria-typing">Aria is checking your data<span className="aria-dots" /></p></div></div>}
              <div ref={endRef} />
            </div>
            <footer className="aria-foot">
              {listening && <div className="aria-listening" role="status"><span className="aria-pulse" />Listening… speak now, and I&apos;ll send it when you stop.</div>}
              <form onSubmit={(e) => { e.preventDefault(); send(text); }}>
                <textarea ref={inputRef} rows={1} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} maxLength={600} aria-label="Message to Aria"
                  placeholder={last?.choices?.length ? "Tap an option above, or type your answer…" : "Ask about companies, contacts, platforms, signals…"}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }} />
                <button type="button" className={`aria-mic${listening ? " on" : ""}`} onClick={toggleMic} disabled={!voiceOK || busy} aria-pressed={listening}
                  title={voiceOK ? (listening ? "Stop listening" : "Speak to Aria") : "Voice needs Chrome, Edge or Safari"} aria-label="Speak to Aria">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 0 0-7 0v5A3.5 3.5 0 0 0 12 15Zm6-3.5a6 6 0 0 1-12 0M12 17.5V21M9 21h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <button type="submit" className="btn primary aria-send" disabled={busy || !text.trim()}>Send</button>
              </form>
              <div className="aria-cost"><CostNote cost="≈ $0.02–0.10 per question" /></div>
            </footer>
          </section>
        </div>, document.body)}
    </>
  );
}
