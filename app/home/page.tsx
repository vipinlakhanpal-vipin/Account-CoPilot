import { requirePageUser } from "@/lib/auth";
import { getAccess } from "@/lib/access";
import Hero from "@/components/Hero";
import SetupWizard from "@/components/SetupWizard";
import Link from "next/link";

// Home: a short, plain-English orientation to Account CoPilot, plus the Setup Wizard.
// The deep reference (scoring formulas, engine steps, cost tables) stays in Setup → Learn Me.
export default async function HomePage() {
  const user = await requirePageUser();
  const access = await getAccess(user);

  return (
    <div className="wrap">
      <Hero title="Home" text="Get to know your Account CoPilot AI Agent, and set it up in a few minutes." />

      <section className="panel">
        <h2>What is Account CoPilot?</h2>
        <p>
          Account CoPilot is an <b>AI Agent</b> — it works on its own, not just when you ask it something. Every morning it wakes up by
          itself, looks for new companies that fit your Ideal Customer Profile (ICP), checks their revenue and size against official
          sources, and updates your database — no one has to click anything. You can also ask it, any time, to look up one company, verify
          a batch of existing ones, or find a whole new set of prospects.
        </p>
        <p>
          It never invents facts. Every figure it records carries a source and a confidence label (Fact, Likely, Unverified, or Unknown),
          so you always know how solid a number is and where it came from.
        </p>
      </section>

      <section className="panel">
        <h2>What each tab does</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Tab</th><th>What you'll find there</th></tr></thead>
          <tbody>
            <tr><td><b>Dashboard</b></td><td className="muted">The big picture: how many accounts you have, their ICP status, priority accounts to work next, and clickable tiles that drill into the records behind every number.</td></tr>
            <tr><td><b>Accounts</b></td><td className="muted">Every company you're tracking, one row each, with ICP status, revenue, S2P/ERP signals, and a Pipeline ranking of who to go after first.</td></tr>
            <tr><td><b>Stakeholders</b></td><td className="muted">The people — contacts at each company, their seniority and department, and how well they match your buyer personas.</td></tr>
            <tr><td><b>Data</b></td><td className="muted">Where the data came from (Sources), where two sources disagree (Conflicts), what technology each company runs, and the Research Queue for paid, on-demand company lookups.</td></tr>
            <tr><td><b>Setup</b></td><td className="muted">Everything that controls how the Agent behaves: Define ICP (your targeting rules, per region), Settings (the daily engine, API costs, contact tiers), Learn Me (the full reference guide), and Team (who has access to what).</td></tr>
          </tbody>
        </table></div>
      </section>

      <section className="panel">
        <h2>Tokens, API costs, and what's free</h2>
        <p>Two completely separate things pay for this Agent's work — it's worth knowing which is which:</p>
        <ul className="plain">
          <li><b>Your Claude plan</b> — the daily 6am run, and anything you queue under Setup → Settings → Search companies, run as ordinary Claude sessions. They read the web themselves and write results into the app. This costs nothing extra beyond your existing Claude plan; it doesn't touch the Anthropic API key at all.</li>
          <li><b>The Anthropic API key</b> — a handful of specific, opt-in actions call this directly and cost real (small) amounts of money: Research Queue, Research more, Draft pitch plan, and the paid Refresh. Each one shows its estimated cost before you confirm, and a Super Admin can require a PIN before any of them can spend anything.</li>
        </ul>
        <p className="note">Full worked examples and a line-by-line cost table are in Setup → Learn Me → Costs &amp; usage.</p>
      </section>

      <section className="panel">
        <h2>How it finds, checks and verifies companies</h2>
        <ol className="plain">
          <li><b>Find</b> — searches the open web, stock-exchange filings, company sites, business press and job postings for companies that could fit your ICP.</li>
          <li><b>Check</b> — reads each candidate's official numbers where they exist (annual reports, filings, investor results) before ever relying on an estimate.</li>
          <li><b>Verify</b> — labels every fact by how solid it is: <b>Fact</b> (from an official source), <b>Likely</b> (a credible estimate), <b>Unverified</b>, or <b>Unknown</b> — and always keeps the source link.</li>
          <li><b>Re-check</b> — nothing is checked once and forgotten. Anything short of Verified gets re-examined periodically, so a growing company moves up in status automatically.</li>
        </ol>
      </section>

      <section className="panel">
        <h2>What "ICP" means here</h2>
        <p>
          Your Ideal Customer Profile (ICP) is the set of rules that decides which companies are worth tracking at all — by default, net
          revenue of at least $250M and at least 100 employees, though a stock listing is never required. You set this per region under{" "}
          <b>Setup → Define ICP</b>, and every part of the app — the daily run, in-app research, the Pipeline ranking, and this wizard — reads
          the same rules, so there's never a mismatch between what you define and what the Agent actually does.
        </p>
      </section>

      <SetupWizard access={access} />

      <section className="panel">
        <p className="note">Want the full detail — scoring formulas, the engine's exact daily steps, every cost line — instead of the short version above? Open <Link href="/guide">Setup → Learn Me →</Link></p>
      </section>
    </div>
  );
}
