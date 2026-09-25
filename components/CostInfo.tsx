const ROWS: [string, string, string, string][] = [
  ["Opening the app, dashboard, filters, account briefs", "No", "—", "$0"],
  ["Download Master Book (Excel)", "No", "Built from the database", "$0"],
  ["Signing in, inviting colleagues, editing settings", "No", "—", "$0"],
  ["Draft pitch plan (account brief)", "Yes", "~3,000 tokens read + ~1,500 written (incl. thinking)", "≈ $0.05–0.10"],
  ["Research Queue — Quick (up to 5 searches)", "Yes", "~60,000 read + ~8,000 written + 5 searches", "≈ $0.55"],
  ["Research Queue — Standard (up to 10 searches)", "Yes", "~150,000 read + ~15,000 written + 10 searches", "≈ $1.20–1.50"],
  ["Research Queue — Deep (up to 20 searches)", "Yes", "~350,000 read + ~30,000 written + 20 searches", "≈ $2.50–3.50"],
  ["Refresh research on an account", "Yes", "Same as a Standard run", "≈ $1.20–1.50"],
  ["Revenue check script (per company)", "Yes", "Measured: Al Batha 42,000 read + 2,400 written + 6 searches", "$0.33 (Al Ghurair: $1.59)"],
];

export default function CostInfo() {
  return (
    <div className="panel" id="costs" style={{ marginTop: 16 }}>
      <h2>Costs &amp; usage</h2>
      <p>The app calls Claude through your <b>Anthropic API key</b> only when it has to read the web or write something new. Browsing, filtering and exporting never cost anything.</p>
      <div className="formula">
        <b>Cost per Claude call</b> = (tokens read × $5 ÷ 1,000,000) + (tokens written × $25 ÷ 1,000,000) + (web searches × $10 ÷ 1,000)
        <div className="note">Prices for Claude Opus 5. A token is roughly ¾ of a word, so 1,000 tokens ≈ 750 words ≈ 1.5 pages.</div>
      </div>
      <h4 className="sub">What counts as reading and writing</h4>
      <ul className="plain">
        <li><b>Tokens read (input)</b> is everything Claude looks at: its instructions, the account facts we send, and <b>every search result and web page it opens</b>. Long annual reports and news pages are the biggest cost driver.</li>
        <li><b>Tokens written (output)</b> is everything Claude produces: research notes, the structured record, a pitch plan, plus its internal reasoning (thinking).</li>
        <li><b>Web searches</b> cost $10 per 1,000 searches ($0.01 each), on top of the tokens needed to read the results.</li>
      </ul>
      <h4 className="sub">Worked example</h4>
      <p className="note">Revenue check for Al Batha Group: 42,000 tokens read ($0.21) + 2,400 tokens written ($0.06) + 6 searches ($0.06) = <b>$0.33</b>. For Al Ghurair Group, Claude opened long pages (274,000 tokens read), so the same check cost <b>$1.59</b>.</p>
      <h4 className="sub">What each action costs</h4>
      <div className="tablewrap"><table>
        <thead><tr><th>Action</th><th>Uses API?</th><th>Typical usage</th><th>Typical cost</th></tr></thead>
        <tbody>{ROWS.map(([a, u, t, c]) => <tr key={a}><td><b>{a}</b></td><td>{u}</td><td className="muted">{t}</td><td className="mono">{c}</td></tr>)}</tbody>
      </table></div>
      <h4 className="sub">Other costs to know</h4>
      <ul className="plain">
        <li><b>Seamless.ai:</b> searching companies and contacts is free. <b>Researching a contact</b> (email, phone, job history) uses 1 Seamless credit per new contact; re-checking an already-researched contact is usually free. Seamless runs through Claude sessions, not through this app.</li>
        <li><b>Claude Code sessions</b> (where the data was researched and the app is built) run on your Claude plan, not this API key.</li>
        <li><b>Vercel and Supabase</b> free tiers cover this app's current size. Deep research may need Vercel Pro (longer function time).</li>
        <li>Figures in the table are estimates from typical runs; the Anthropic Console (console.anthropic.com → Usage) shows actual spend.</li>
      </ul>
    </div>
  );
}
