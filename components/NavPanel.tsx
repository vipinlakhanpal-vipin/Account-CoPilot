"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import ProfileMenu from "@/components/ProfileMenu";
import AccountCopilotAria from "@/components/AriaChat";
import AriaGame from "@/components/AriaGame";
import { usePathname } from "next/navigation";

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
  wizard: <><g className="wand-wave"><path d="M3.5 20.5 13.5 10.5" strokeWidth="2.1" /><path d="M16 3.2l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z" fill="currentColor" className="spark s1" /></g><path d="M20 12l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="currentColor" strokeWidth="0.6" className="spark s2" /><path d="M7.3 3.6l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" fill="currentColor" strokeWidth="0.6" className="spark s3" /><circle cx="20.2" cy="3.6" r=".9" fill="currentColor" stroke="none" className="spark s4" /><circle cx="11" cy="14.6" r=".7" fill="currentColor" stroke="none" className="spark s2" /></>,
  games: <><rect x="2.5" y="7" width="19" height="11" rx="5" /><path d="M7.5 10.5v4M5.5 12.5h4" /><circle cx="15.5" cy="11.5" r="1" /><circle cx="18" cy="13.5" r="1" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
};
const Ic = ({ n }: { n: string }) => <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" {...P}>{ICON[n]}</svg>;

// The left panel: plain items only (Market intelligence, Settings and the Setup wizard show their own tabs on the right).
export default function NavPanel({ isSuper, isOwner = false }: { isSuper: boolean; isOwner?: boolean }) {
  const path = usePathname();
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
  const onMarket = path.startsWith("/nav/market"), onWizard = path.startsWith("/nav/wizard"), onSettings = path.startsWith("/nav/settings");
  // A count in a pill that says what it counts ("2 new", "3 to review"), so a bare number never has to be guessed at.
  const item = (href: string, icon: string, label: string, on: boolean, badge = 0, word = "new", tone = "new") => <Link href={href} className={`navit${on ? " on" : ""}`} aria-current={on ? "page" : undefined}><Ic n={icon} />{label}{badge > 0 && <span className={`navbadge ${tone}`}>{badge > 99 ? "99+" : badge} {word}</span>}</Link>;
  return (
    <aside className="navpanel" aria-label="New Layout">
      <nav>
        {item("/nav/find", "find", "Find and search", path.startsWith("/nav/find"))}
        {item("/nav/about", "about", "About CoPilot", path.startsWith("/nav/about"))}
        {item("/nav/daily-run", "bell", "Daily run", path.startsWith("/nav/daily-run"), path.startsWith("/nav/daily-run") ? 0 : unread)}
        {item("/nav/market", "market", "Market intelligence", onMarket)}
        {item("/nav/signals", "signals", "Buying signals", path.startsWith("/nav/signals"))}
        {item("/nav/games", "games", "Game room", path.startsWith("/nav/games"))}
      </nav>
      <div className="navmid">
        <AriaGame />
        <div hidden><AccountCopilotAria buttonClassName="nav-aria-mini" /></div>
      </div>
      <div className="navbot">
        {item("/nav/wizard", "wizard", "Setup wizard", onWizard)}
        {isOwner && item("/nav/team", "team", "Team", path.startsWith("/nav/team"), inactive, "to review", "review")}
        <button type="button" className="navit navbtn" onClick={() => window.dispatchEvent(new CustomEvent("history-open"))} title="What changed in each update"><Ic n="history" />Version history</button>
        {item("/nav/suggestions", "bulb", "Suggestions", path.startsWith("/nav/suggestions"))}
        {item("/nav/settings/icp", "settings", "Settings", onSettings)}
        {!isSuper && <small className="navnote">Some settings are read-only for you.</small>}
      </div>
      <div className="navprof-wrap"><ProfileMenu variant="panel" /></div>
    </aside>
  );
}
