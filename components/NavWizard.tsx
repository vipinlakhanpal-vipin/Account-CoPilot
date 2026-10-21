"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { REGIONS } from "@/lib/icpDefinition.mjs";
import HomeWorkspace from "@/components/HomeWorkspace";
import type { Access } from "@/lib/access";

const STEPS = [
  { n: 1, title: "Region and size" }, { n: 2, title: "Add data" }, { n: 3, title: "Domains" },
  { n: 4, title: "Daily plan" }, { n: 5, title: "Data sources" }, { n: 6, title: "Review" },
];

// The Setup wizard as a page in the right pane: a short description, the six steps as tabs, and the open step below. Back and Next move the step in the address too, so the left panel highlights the same one.
export default function NavWizard({ access, step }: { access: Access; step: number }) {
  const router = useRouter();
  const n = step >= 1 && step <= STEPS.length ? step : 1;
  // The country the wizard works on from step 2 on (upload, targeting, daily plan). Step 1 still lists every region.
  const mine = useMemo(() => REGIONS.filter((r) => access.isSuper || access.regions.includes(r.key)), [access]);
  const [focus, setFocus] = useState(() => { try { const v = localStorage.getItem("wiz-country"); if (v && mine.some((r) => r.key === v)) return v; } catch { /* optional */ } return mine[0]?.key || ""; });
  const pick = (k: string) => { setFocus(k); try { localStorage.setItem("wiz-country", k); } catch { /* optional */ } };
  return (
    <>
      <h1 className="nav-h">Setup wizard</h1>
      <p className="wiz-brief">Tell the agent where to look, what counts and who to find. Six short steps, about five minutes; nothing is saved until Review. {access.isSuper ? "You can change it any time in Settings → Define ICP." : "You can read every step; only a Super Admin or Admin can save."}</p>
      {mine.length > 0 && <div className="wiz-country">
        <label>Country <select value={focus} onChange={(e) => pick(e.target.value)} aria-label="Country the wizard is working on">{mine.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select></label>
        <span>{n === 1 ? "Step 1 lists every region. From step 2, everything you set or upload applies to this country only." : "Your list upload, targeting and daily plan below are for this country only. Switch country to set up another."}</span>
      </div>}
      <div className="settabs-wrap">
        <nav className="settabs" aria-label="Setup wizard steps">
          {STEPS.map((s) => <Link key={s.n} href={`/nav/wizard?step=${s.n}`} scroll={false} className={n === s.n ? "on" : ""} aria-current={n === s.n ? "step" : undefined}>{s.n} {s.title}</Link>)}
        </nav>
      </div>
      <HomeWorkspace access={access} layout="wizard" forceStep={n} focus={focus} onStepChange={(m) => { if (m !== n) router.replace(`/nav/wizard?step=${m}`, { scroll: false }); }} />
    </>
  );
}
