"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import HomeWorkspace from "@/components/HomeWorkspace";
import type { Access } from "@/lib/access";

const STEPS: { n: number; title: string; tag: string; what: string }[] = [
  { n: 1, title: "Region and size", tag: "Required", what: "Tick the regions the agent should work on and set each region's size rule: the minimum revenue, the minimum staff, whether a stock listing is needed, and which entities count (group headquarters only, or major subsidiaries too)." },
  { n: 2, title: "Add data", tag: "Required", what: "Optionally upload your own list of companies (a spreadsheet; a template is provided) so the agent checks those first. If you have no list, you skip this and the agent finds companies itself." },
  { n: 3, title: "Domains", tag: "Required", what: "Choose which departments' people matter to you (Finance, Procurement and Source-to-Pay, Supply chain, Logistics, HR, Technology, ERP). They decide which contacts are found and how buyers are matched." },
  { n: 4, title: "Daily plan", tag: "Required", what: "Set how many new companies the agent finds and how many it verifies each morning, per region, and whether to switch the region on now. It starts at the next 6am Dubai run." },
  { n: 5, title: "Data sources", tag: "Information", what: "See and extend the public sources the agent may read: annual reports, stock-exchange filings, company websites, business press, supplier portals and job posts. You can add your own." },
  { n: 6, title: "Review", tag: "Finish", what: "A summary of every choice in one place. Save and apply stores them as the region's ICP, recalculates every account's status straight away and switches on the regions you ticked." },
];

// What the Setup wizard is, before any step is shown. Clicking Setup wizard lands here; a step in the left panel (or Start) opens the wizard itself.
function Intro({ canChange }: { canChange: boolean }) {
  return (
    <>
      <h1 className="nav-h">Setup wizard</h1>
      <section className="panel wiz-intro">
        <p className="wiz-lead">Tell the agent <b>where to look, what counts, and who to find</b>. Six short steps, about five minutes. When you finish, Account CoPilot works on its own every morning, region by region, using the rules you chose.</p>
        <div className="wiz-cols">
          <div><h3>What the wizard does</h3>
            <ul>
              <li><b>Sets your ICP</b> (Ideal Customer Profile) for each region: which companies are worth tracking, by revenue, staff, listing and entity level.</li>
              <li><b>Chooses the people</b> to find at those companies, by department, so contacts and buyer matches follow your focus.</li>
              <li><b>Plans the daily run</b>: how many new companies the agent finds and how many it checks each morning.</li>
              <li><b>Switches regions on</b>, so the engine starts working them.</li>
            </ul></div>
          <div><h3>How it works</h3>
            <ol>
              <li>Pick a step in the left panel, or press <b>Start</b> below.</li>
              <li>Answer in plain choices. Nothing is saved until the last step.</li>
              <li>On <b>Review</b>, press Save and apply. Every account&apos;s status is recalculated at once.</li>
              <li>At the next 6am Dubai run the agent finds and verifies companies by your rules, and posts what it did in <b>Daily run</b>.</li>
            </ol></div>
          <div><h3>Good to know</h3>
            <ul>
              <li><b>It costs nothing extra.</b> The daily run uses your Claude plan, not the paid API.</li>
              <li><b>You can change it any time</b> in Settings → Define ICP, which holds the same rules in full.</li>
              <li><b>Every figure keeps its source</b> and a confidence label (Fact, Likely, Unverified, Unknown).</li>
              <li>{canChange ? "You can save changes to every region." : "Only a Super Admin or Admin can save wizard changes. You can read every step."}</li>
            </ul></div>
        </div>
        <Link href="/nav/wizard?step=1" className="btn primary wiz-start">Start with step 1</Link>
      </section>
      <h2 className="wiz-h2">The six steps</h2>
      <div className="wiz-steps">
        {STEPS.map((s) => (
          <Link key={s.n} href={`/nav/wizard?step=${s.n}`} className="wiz-step">
            <span className="wiz-n">{s.n}</span>
            <span><b>{s.title}</b><em>{s.tag}</em><span className="wiz-what">{s.what}</span></span>
          </Link>))}
      </div>
    </>
  );
}

// The Setup wizard as a page in the right pane: its introduction first, then a step once one is chosen. Back and Next move the step in the address too, so the left panel highlights the same one.
export default function NavWizard({ access, step }: { access: Access; step: number }) {
  const router = useRouter();
  if (!step) return <Intro canChange={access.isSuper} />;
  return (
    <>
      <h1 className="nav-h">Setup wizard <small className="wiz-crumb">Step {step} of 6</small></h1>
      <HomeWorkspace access={access} layout="wizard" forceStep={step} onStepChange={(n) => { if (n !== step) router.replace(`/nav/wizard?step=${n}`, { scroll: false }); }} />
    </>
  );
}
