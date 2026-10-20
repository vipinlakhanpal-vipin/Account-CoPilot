"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const STEPS = ["Region & size", "Add Data", "Domains", "Daily plan", "Data sources", "Review"];
type Mk = { vendors: string[]; partners: { vendor: string; region: string; presence_pending?: boolean }[]; regions: string[] };
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const ICON: Record<string, React.ReactNode> = {
  market: <><circle cx="12" cy="5" r="2.4" /><circle cx="5" cy="18" r="2.4" /><circle cx="19" cy="18" r="2.4" /><path d="M11 7.2 6.2 15.8M13 7.2l4.8 8.6M7.4 18h9.2" /></>,
  signals: <path d="M2.5 12h4.5l2.4-7 4.2 14 2.4-7h5.5" />,
  about: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.6v.2" /></>,
  wizard: <><path d="M4.5 19.5 14 10" /><path d="M17.5 2.5l1 2.3 2.3 1-2.3 1-1 2.3-1-2.3-2.3-1 2.3-1z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
};
const Ic = ({ n }: { n: string }) => <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" {...P}>{ICON[n]}</svg>;

// The New Layout's left panel: Market intelligence (with its vendors), Buying signals, About CoPilot, Setup wizard (with its steps) and, pinned at the bottom, Settings.
export default function NavPanel({ isSuper }: { isSuper: boolean }) {
  const path = usePathname(), params = useSearchParams();
  const [mk, setMk] = useState<Mk | null>(null);
  useEffect(() => { fetch("/api/market", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setMk(j)).catch(() => {}); }, []);
  const vendor = params.get("vendor") || "SAP", step = Number(params.get("step")) || 1;
  const onMarket = path.startsWith("/nav/market"), onWizard = path.startsWith("/nav/wizard"), onSettings = path.startsWith("/nav/settings");
  const count = (v: string) => (mk ? mk.partners.filter((p) => p.vendor === v && !p.presence_pending && mk.regions.includes(p.region)).length : null);
  const item = (href: string, icon: string, label: string, on: boolean) => <Link href={href} className={`navit${on ? " on" : ""}`} aria-current={on ? "page" : undefined}><Ic n={icon} />{label}</Link>;
  return (
    <aside className="navpanel" aria-label="New Layout">
      <nav>
        {item("/nav/market", "market", "Market intelligence", onMarket)}
        {onMarket && <div className="navsub">{(mk?.vendors || ["SAP", "Coupa", "Oracle", "Microsoft"]).map((v) => (
          <Link key={v} href={`/nav/market?vendor=${encodeURIComponent(v)}`} className={vendor === v ? "on" : ""}>{v}{count(v) !== null && <small>{count(v)}</small>}</Link>))}</div>}
        {item("/nav/signals", "signals", "Buying signals", path.startsWith("/nav/signals"))}
        {item("/nav/about", "about", "About CoPilot", path.startsWith("/nav/about"))}
        {item("/nav/wizard", "wizard", "Setup wizard", onWizard)}
        {onWizard && <div className="navsub">{STEPS.map((s, i) => <Link key={s} href={`/nav/wizard?step=${i + 1}`} className={step === i + 1 ? "on" : ""}>{i + 1} {s}</Link>)}</div>}
      </nav>
      <div className="navbot">
        {item("/nav/settings/icp", "settings", "Settings", onSettings)}
        {onSettings && <div className="navsub">
          <Link href="/nav/settings/icp" className={path.endsWith("/icp") ? "on" : ""}>Define ICP</Link>
          <Link href="/nav/settings/engine" className={path.endsWith("/engine") ? "on" : ""}>Engine and PIN</Link>
          <Link href="/nav/settings/team" className={path.endsWith("/team") ? "on" : ""}>Team</Link>
        </div>}
        {!isSuper && <small className="navnote">Some settings are read-only for you.</small>}
      </div>
    </aside>
  );
}
