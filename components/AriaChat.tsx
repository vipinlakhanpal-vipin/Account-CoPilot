"use client";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { paidFetch, notify } from "@/components/Confirm";
import { downloadReport } from "@/components/ReportDialog";
import CostNote from "@/components/CostNote";

type Action = { kind: "xlsx" | "pdf"; label: string; body: Record<string, unknown> };
type Msg = { role: "user" | "assistant"; content: string; actions?: Action[] };

const SUGGESTIONS = [
  "How many Verified companies do we have in each region?",
  "Which Verified UAE companies run SAP and have a CFO contact?",
  "Give me a PDF report on ADNOC",
  "Excel contact list for the top 10 Qatar companies",
];

// A very small markdown reader: paragraphs, bullets, **bold** and tables. That is all Aria writes.
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

export default function AriaChat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [filing, setFiling] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs, busy, open]);

  async function send(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: question }];
    setMsgs(next); setText(""); setBusy(true);
    try {
      // Only the words go back to the server (the last few turns); files are separate buttons.
      const history = next.slice(-12).map((m) => ({ role: m.role, content: m.content }));
      const res = await paidFetch("/api/aria", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history }) }, "Asking Aria");
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsgs([...next, { role: "assistant", content: j.error || "Aria could not answer that just now. Try again." }]); }
      else setMsgs([...next, { role: "assistant", content: String(j.text || ""), actions: j.actions || [] }]);
    } catch { setMsgs([...next, { role: "assistant", content: "I could not reach the server. Try again." }]); }
    setBusy(false);
  }
  async function file(a: Action, key: string) {
    setFiling(key);
    await downloadReport(a.body, a.kind);
    setFiling("");
  }

  return (
    <>
      <button type="button" className="aria-launch" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Ask Aria about your accounts, or have her build an Excel or PDF">
        <span className="aria-dot" aria-hidden="true">A</span><span className="aria-launch-text">Ask Aria</span>
      </button>
      {open && (
        <section className="aria-panel" role="dialog" aria-label="Aria, your Account CoPilot assistant">
          <header className="aria-head">
            <span className="aria-dot big" aria-hidden="true">A</span>
            <div><b>Aria</b><small>Automatic Responsible Intelligent Assistant</small></div>
            <button type="button" className="btn tiny btn-close" onClick={() => setOpen(false)}>Close</button>
          </header>
          <div className="aria-body">
            {msgs.length === 0 && (
              <div className="aria-hello">
                <p>Hi, I&apos;m <b>Aria</b>. Ask me about your accounts, contacts, signals and platforms, or have me build an Excel contact list or a detailed PDF, for one company or a whole region.</p>
                <div className="aria-sugs">{SUGGESTIONS.map((q) => <button type="button" key={q} onClick={() => send(q)}>{q}</button>)}</div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`aria-msg ${m.role}`}>
                {m.role === "assistant" ? <Md text={m.content} /> : <p>{m.content}</p>}
                {m.actions && m.actions.length > 0 && (
                  <div className="aria-actions">{m.actions.map((a, j) => (
                    <button type="button" key={j} className="btn primary tiny" disabled={filing === `${i}-${j}`} onClick={() => file(a, `${i}-${j}`)}>
                      {filing === `${i}-${j}` ? "Building…" : `${a.kind === "xlsx" ? "📊" : "📄"} ${a.label}`}</button>))}</div>
                )}
              </div>
            ))}
            {busy && <div className="aria-msg assistant"><p className="aria-typing">Aria is checking your data…</p></div>}
            <div ref={endRef} />
          </div>
          <footer className="aria-foot">
            <form onSubmit={(e) => { e.preventDefault(); send(text); }}>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about companies, contacts, platforms…" aria-label="Message to Aria" disabled={busy} maxLength={600} />
              <button type="submit" className="btn primary" disabled={busy || !text.trim()}>Send</button>
            </form>
            <div className="aria-cost"><CostNote cost="≈ $0.02–0.10 per question" /></div>
          </footer>
        </section>
      )}
    </>
  );
}
