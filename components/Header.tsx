"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Logo from "@/components/Logo";
import ProfileMenu from "@/components/ProfileMenu";
import EngineBell from "@/components/EngineBell";
import ThemeToggle from "@/components/ThemeToggle";
import { useNewVersionInfo } from "@/components/useVersion";
import { APP_VERSION } from "@/lib/version";

// Main tabs with sub-tabs underneath (Coupa-style). A main tab opens its first sub-tab.
const GROUPS: { label: string; items: [string, string][] }[] = [
  { label: "Home", items: [["/home", "Home"]] },
  { label: "Dashboard", items: [["/", "Dashboard"]] },
  { label: "Accounts", items: [["/?tab=pipeline", "Pipeline"], ["/?tab=accounts", "Accounts"], ["/?tab=signals", "S2P Signals"], ["/?tab=erp", "ERP & Apps"]] },
  { label: "Stakeholders", items: [["/?tab=stakeholders", "Stakeholders"]] },
  { label: "Data", items: [["/?tab=sources", "Sources"], ["/?tab=conflicts", "Conflicts"], ["/research", "Research Queue"]] },
  { label: "Setup", items: [["/icp", "Define ICP"], ["/settings", "Settings"], ["/guide", "Learn Me"], ["/team", "Team"]] },
];
const SUB_LABEL: Record<string, string> = { Accounts: "All accounts" };

const Spin = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const TAB_LABEL: Record<string, string> = { pipeline: "Pipeline", accounts: "Accounts", stakeholders: "Stakeholders", signals: "S2P Signals", erp: "ERP & Apps",
  conflicts: "Conflicts", sources: "Sources" };

const PAGE_LABEL: Record<string, string> = { "/research": "Research Queue", "/settings": "Settings", "/guide": "Learn Me", "/icp": "Define ICP", "/team": "Team", "/home": "Home" };

// Rendered once in the root layout, so it stays put across page changes (no rebuild, no jump).
export default function Header({ subtitle }: { subtitle: string }) {
  const { latest, releases, author } = useNewVersionInfo();
  const [showChanges, setShowChanges] = useState(false);
  // Open the "what's new" window once per new version (per browser session); the user can close it and reopen it from the banner.
  useEffect(() => {
    if (!latest || !releases.some((r) => r.changes?.length)) return;
    try { if (sessionStorage.getItem("changesSeen") === latest) return; sessionStorage.setItem("changesSeen", latest); } catch {}
    setShowChanges(true);
  }, [latest, releases]);
  useEffect(() => {
    if (!showChanges) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setShowChanges(false); };
    window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc);
  }, [showChanges]);
  // Sub-tabs sit right under the active main tab: the row is right-aligned so its last sub-tab ends beneath the active tab.
  const barRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const [subOffset, setSubOffset] = useState<number | null>(null); // null = not measured yet (row hidden, so it never slides into place)
  // Upgrade feedback: the button flashes while the new version loads, then a steady "Updated" bar confirms it.
  const [upgrading, setUpgrading] = useState(false);
  const [upgraded, setUpgraded] = useState("");
  useEffect(() => {
    try {
      const v = sessionStorage.getItem("upgradedTo");
      if (v) { sessionStorage.removeItem("upgradedTo"); setUpgraded(v); const t = setTimeout(() => setUpgraded(""), 5000); return () => clearTimeout(t); }
    } catch {}
  }, []);
  const upgrade = () => {
    if (!latest || upgrading) return;
    setUpgrading(true);
    try { sessionStorage.setItem("upgradedTo", latest); } catch {}
    setTimeout(() => window.location.reload(), 900);
  };
  const path = usePathname();
  const params = useSearchParams();
  // On the dashboard page, tabs switch instantly on the client (the data is already loaded).
  const current = path === "/" ? TAB_LABEL[params.get("tab") || ""] || "Dashboard" : PAGE_LABEL[path] || "Dashboard";
  useLayoutEffect(() => {
    const place = () => {
      const bar = barRef.current, row = subRef.current;
      const tab = bar?.querySelector<HTMLElement>('nav.tabs .tab[aria-selected="true"]');
      if (!bar || !row || !tab) return;
      const barLeft = bar.getBoundingClientRect().left, tabRight = tab.getBoundingClientRect().right;
      setSubOffset(Math.max(0, tabRight - barLeft - row.scrollWidth));
    };
    place();
    window.addEventListener("resize", place);
    const t = setTimeout(place, 300); // after web fonts settle
    return () => { window.removeEventListener("resize", place); clearTimeout(t); };
  }, [current]);
  const go = (e: React.MouseEvent, href: string) => {
    if (path === "/" && href.startsWith("/?") || (path === "/" && href === "/")) {
      e.preventDefault();
      // Keep the selected country when switching tabs.
      const country = params.get("country");
      const url = country ? `${href}${href.includes("?") ? "&" : "?"}country=${encodeURIComponent(country)}` : href;
      window.history.pushState(null, "", url);
      window.scrollTo({ top: 0 });
    }
  };
  if (path.startsWith("/login") || path.startsWith("/auth")) return null;
  return (
    <>
      {latest && !upgraded && (
        <div className="update-bar" role="status">
          <div className="update-head">
            <span>{upgrading ? <>Upgrading <b>Account CoPilot</b> to v{latest}…</> : <>Update available: <b>Account CoPilot v{latest}</b></>}</span>
            <button type="button" className={upgrading ? "upgrading" : undefined} disabled={upgrading} onClick={upgrade}>
              {upgrading ? `Upgrading to v${latest}…` : `Click Refresh to upgrade to v${latest}`}</button>
            {releases.some((r) => r.changes?.length) && (
              <button type="button" className="link" onClick={() => setShowChanges(true)}>What&apos;s changing?</button>)}
          </div>
        </div>
      )}
      {latest && showChanges && releases.some((r) => r.changes?.length) && (
        <div className="wn-backdrop" onClick={() => setShowChanges(false)}>
          <div className="wn" role="dialog" aria-modal="true" aria-labelledby="wn-title" onClick={(e) => e.stopPropagation()}>
            <div className="wn-head">
              <div><p className="wn-kicker">Update available</p><h2 id="wn-title">What&apos;s new in Account CoPilot v{latest}</h2></div>
              <button type="button" className="wn-close" onClick={() => setShowChanges(false)} aria-label="Close">×</button>
            </div>
            <div className="wn-body">
              {releases.filter((r) => r.changes?.length).map((r) => (
                <section key={r.version}>
                  {releases.filter((x) => x.changes?.length).length > 1 && <h3>v{r.version} · {r.date}</h3>}
                  <ol>
                    {r.changes!.map((c, i) => (
                      <li key={i}><p className="wn-what">{c.what}</p>
                        <p className="wn-meta"><span className="wn-tag where">Where</span>{c.where}</p>
                        <p className="wn-meta"><span className="wn-tag why">Why</span>{c.why}</p></li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
            <div className="wn-foot">
              {author && <span className="wn-by">Changes/upgrades were made by — <b>{author}</b></span>}
              <span className="wn-actions">
                <button type="button" className="btn" onClick={() => setShowChanges(false)}>Close</button>
                <button type="button" className="btn primary" disabled={upgrading} onClick={() => { setShowChanges(false); upgrade(); }}>Upgrade to v{latest}</button>
              </span>
            </div>
          </div>
        </div>
      )}
      {upgraded && (
        <div className="update-bar done" role="status"><span>Updated to <b>Account CoPilot v{upgraded}</b> ✓</span></div>
      )}
      <header className="top">
        <div className="navbar has-sub" ref={barRef}>
          <div className="brand">
            <Logo />
            <div className="brand-text">
              <div className="brand-row">
                <span className="appname">Account CoPilot</span>
                <span className="version">
                  <button type="button" className="refresh" onClick={() => window.location.reload()}
                    title={latest ? `Version v${latest} is available. Click to load it.` : "Reload the latest data"}>
                    <Spin />v{APP_VERSION}{latest && <span className="dot" aria-label={`New version v${latest} available`} />}
                  </button>
                  <EngineBell />
                </span>
              </div>
              <span className="brand-sub">{subtitle}</span>
            </div>
          </div>
          <nav className="tabs" aria-label="Sections">
            {GROUPS.map((g) => (
              <Link key={g.label} href={g.items[0][0]} prefetch className="tab" aria-selected={g.items.some(([, l]) => l === current)} onClick={(e) => go(e, g.items[0][0])}>{g.label}</Link>
            ))}
          </nav>
          <div className="nav-actions">
            <a className="btn primary dl" href="/api/export" title="Download Master Book (.xlsx)">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8m0 0-3-3m3 3 3-3M3 13h10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span>Master Book</span></a>
            <ThemeToggle />
            <ProfileMenu />
          </div>
        </div>
        {(() => { const g = GROUPS.find((x) => x.items.some(([, l]) => l === current));
          return g ? (
            <nav className="subtabs" aria-label={`${g.label} sections`}>
              <div className="subtabs-row" ref={subRef} style={{ marginLeft: subOffset ?? 0, visibility: subOffset === null ? "hidden" : "visible" }}>
                {g.items.length > 1
                  ? g.items.map(([href, label]) => <Link key={href} href={href} prefetch className="subtab" aria-selected={label === current} onClick={(e) => go(e, href)}>{SUB_LABEL[label] || label}</Link>)
                  : <span className="subtab" aria-hidden="true" style={{ visibility: "hidden" }}>&nbsp;</span> /* keeps the bar's height so nothing jumps */}
              </div>
            </nav>) : null; })()}
      </header>
    </>
  );
}
