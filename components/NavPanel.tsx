"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import ProfileMenu from "@/components/ProfileMenu";
import AccountCopilotAria from "@/components/AriaChat";
import AriaGame from "@/components/AriaGame";
import { usePathname, useSearchParams } from "next/navigation";

const STEPS = ["Region & size", "Add Data", "Domains", "Daily plan", "Data sources", "Review"];
type Mk = { vendors: string[]; partners: { vendor: string; region: string; presence_pending?: boolean }[]; regions: string[] };
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const ICON: Record<string, React.ReactNode> = {
  market: <><circle cx="12" cy="5" r="2.4" /><circle cx="5" cy="18" r="2.4" /><circle cx="19" cy="18" r="2.4" /><path d="M11 7.2 6.2 15.8M13 7.2l4.8 8.6M7.4 18h9.2" /></>,
  signals: <path d="M2.5 12h4.5l2.4-7 4.2 14 2.4-7h5.5" />,
  find: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.3 15.3 21 21" /></>,
  bell: <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /></>,
  team: <><circle cx="9" cy="8" r="3.2" /><path d="M2.8 20c.4-3.4 3-5.4 6.2-5.4s5.8 2 6.2 5.4" /><circle cx="17.5" cy="9" r="2.4" /><path d="M16.5 14.4c2.6-.2 4.4 1.4 4.7 4.4" /></>,
  history: <><path d="M12 7v5l3.5 2" /><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></>,
  about: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.6v.2" /></>,
  wizard: <><path d="M3.5 20.5 13.5 10.5" strokeWidth="2.1" /><path d="M16 3.2l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z" fill="currentColor" className="spark s1" /><path d="M20 12l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="currentColor" strokeWidth="0.6" className="spark s2" /><path d="M7.3 3.6l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" fill="currentColor" strokeWidth="0.6" className="spark s3" /><circle cx="20.2" cy="3.6" r=".9" fill="currentColor" stroke="none" className="spark s4" /><circle cx="11" cy="14.6" r=".7" fill="currentColor" stroke="none" className="spark s2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
};
const Ic = ({ n }: { n: string }) => <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" {...P}>{ICON[n]}</svg>;

// The New Layout's left panel: Market intelligence (with its vendors), Buying signals, About CoPilot, Setup wizard (with its steps) and, pinned at the bottom, Settings.
export default function NavPanel({ isSuper, isOwner = false }: { isSuper: boolean; isOwner?: boolean }) {
  const path = usePathname(), params = useSearchParams();
  const [mk, setMk] = useState<Mk | null>(null);
  useEffect(() => { fetch("/api/market", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setMk(j)).catch(() => {}); }, []);
  // The bell's red badge moves here: runs posted since you last opened Daily run.
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const load = () => fetch("/api/engine?only=log", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j) return; let seen = ""; try { seen = localStorage.getItem("engine-seen") || ""; } catch { /* optional */ }
      setUnread((j.entries || []).filter((e: { at: string }) => e.at > seen).length);
    }).catch(() => {});
    load(); const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [path]);
  // Super Admin: the Team item shows how many people are inactive and suspended.
  const [inactive, setInactive] = useState(0);
  useEffect(() => {
    if (!isOwner) return;
    const load = () => fetch("/api/inactive?count=1", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setInactive(j.n || 0)).catch(() => {});
    load(); const t = setInterval(load, 300000); window.addEventListener("inactive-changed", load);
    return () => { clearInterval(t); window.removeEventListener("inactive-changed", load); };
  }, [isOwner]);
  const vendor = params.get("vendor") || "SAP", step = Number(params.get("step")) || 1;
  // Drop-downs: Market intelligence, Setup wizard and Settings open and close with their arrow (remembered in this browser) and open by themselves when you go into them.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => { try { const r = JSON.parse(localStorage.getItem("nav-open") || "{}"); if (r && typeof r === "object") setOpen(r); } catch { /* optional */ } }, []);
  const flip = (k: string, v?: boolean) => setOpen((cur) => { const n = { ...cur, [k]: v ?? !cur[k] }; try { localStorage.setItem("nav-open", JSON.stringify(n)); } catch { /* optional */ } return n; });
  const onMarket = path.startsWith("/nav/market"), onWizard = path.startsWith("/nav/wizard"), onSettings = path.startsWith("/nav/settings");
  // Going into a section opens its list; after that the arrow can close it, even while you stay on that page.
  useEffect(() => { if (onMarket) flip("market", true); if (onWizard) flip("wizard", true); if (onSettings) flip("settings", true); }, [onMarket, onWizard, onSettings]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (v: string) => (mk ? mk.partners.filter((p) => p.vendor === v && !p.presence_pending && mk.regions.includes(p.region)).length : null);
  const group = (key: string, href: string, icon: string, label: string, on: boolean, kids: React.ReactNode) => {
    const isOpen = open[key] ?? on; // an explicit open or close wins, even on that page
    return (<>
      <div className={`navrow${on ? " on" : ""}`}>
        <Link href={href} className={`navit${on ? " on" : ""}`} aria-current={on ? "page" : undefined} onClick={() => flip(key, true)}><Ic n={icon} />{label}</Link>
        <button type="button" className="navchev" aria-expanded={isOpen} aria-label={`${isOpen ? "Close" : "Open"} ${label}`} onClick={() => flip(key, !isOpen)}>
          <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true" style={{ transform: isOpen ? "none" : "rotate(-90deg)", transition: "transform .15s" }}><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      {isOpen && kids}
    </>);
  };
  const item = (href: string, icon: string, label: string, on: boolean, badge = 0) => <Link href={href} className={`navit${on ? " on" : ""}`} aria-current={on ? "page" : undefined}><Ic n={icon} />{label}{badge > 0 && <span className="navbadge" aria-label={`${badge} new`}>{badge > 99 ? "99+" : badge}</span>}</Link>;
  return (
    <aside className="navpanel" aria-label="New Layout">
      <nav>
        {item("/nav/find", "find", "Find and search", path.startsWith("/nav/find"))}
        {item("/nav/about", "about", "About CoPilot", path.startsWith("/nav/about"))}
        {item("/nav/daily-run", "bell", "Daily run", path.startsWith("/nav/daily-run"), path.startsWith("/nav/daily-run") ? 0 : unread)}
        {group("market", "/nav/market", "market", "Market intelligence", onMarket,
          <div className="navsub">{(mk?.vendors || ["SAP", "Coupa", "Oracle", "Microsoft"]).map((v) => (
            <Link key={v} href={`/nav/market?vendor=${encodeURIComponent(v)}`} className={onMarket && vendor === v ? "on" : ""}>{v}{count(v) !== null && <small>{count(v)}</small>}</Link>))}</div>)}
        {item("/nav/signals", "signals", "Buying signals", path.startsWith("/nav/signals"))}
      </nav>
      <div className="navmid">
        <AriaGame onChat={() => document.querySelector<HTMLButtonElement>(".nav-aria-mini")?.click()} />
        <div hidden><AccountCopilotAria buttonClassName="nav-aria-mini" /></div>
      </div>
      <div className="navbot">
        {group("wizard", "/nav/wizard", "wizard", "Setup wizard", onWizard,
          <div className="navsub">{STEPS.map((s, i) => <Link key={s} href={`/nav/wizard?step=${i + 1}`} className={onWizard && step === i + 1 ? "on" : ""}>{i + 1} {s}</Link>)}</div>)}
        {item("/nav/team", "team", "Team", path.startsWith("/nav/team"), inactive)}
        {group("settings", "/nav/settings/icp", "settings", "Settings", onSettings,
          <div className="navsub">
            <Link href="/nav/settings/icp" className={path.endsWith("/icp") ? "on" : ""}>Define ICP</Link>
            <Link href="/nav/settings/engine" className={path.endsWith("/engine") ? "on" : ""}>Engine and PIN</Link>
            <Link href="/nav/settings/guide" className={path.endsWith("/guide") ? "on" : ""}>Learn me</Link>
          </div>)}
        <button type="button" className="navit navbtn" onClick={() => window.dispatchEvent(new CustomEvent("history-open"))} title="What changed in each update"><Ic n="history" />Version history</button>
        {item("/nav/suggestions", "bulb", "Suggestions", path.startsWith("/nav/suggestions"))}
        {!isSuper && <small className="navnote">Some settings are read-only for you.</small>}
        <div className="navprof-wrap"><ProfileMenu variant="panel" /></div>
      </div>
    </aside>
  );
}
