"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "@/components/Logo";
import ProfileMenu from "@/components/ProfileMenu";
import EngineBell from "@/components/EngineBell";
import { useNewVersion } from "@/components/useVersion";
import { APP_VERSION } from "@/lib/version";

// Main tabs with sub-tabs underneath (Coupa-style). A main tab opens its first sub-tab.
const GROUPS: { label: string; items: [string, string][] }[] = [
  { label: "Dashboard", items: [["/", "Dashboard"]] },
  { label: "Accounts", items: [["/?tab=pipeline", "Pipeline"], ["/?tab=accounts", "Accounts"], ["/?tab=signals", "S2P Signals"], ["/?tab=erp", "ERP & Apps"]] },
  { label: "Stakeholders", items: [["/?tab=stakeholders", "Stakeholders"]] },
  { label: "Data", items: [["/?tab=sources", "Sources"], ["/?tab=conflicts", "Conflicts"], ["/research", "Research Queue"]] },
  { label: "Admin", items: [["/settings", "Settings"], ["/guide", "Guide"]] },
];
const SUB_LABEL: Record<string, string> = { Accounts: "All accounts" };

const Spin = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const TAB_LABEL: Record<string, string> = { pipeline: "Pipeline", accounts: "Accounts", stakeholders: "Stakeholders", signals: "S2P Signals", erp: "ERP & Apps",
  conflicts: "Conflicts", sources: "Sources" };

export default function Header({ active, subtitle }: { active: string; subtitle: string }) {
  const latest = useNewVersion();
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
  const current = path === "/" ? TAB_LABEL[params.get("tab") || ""] || "Dashboard" : active;
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
  return (
    <>
      {latest && !upgraded && (
        <div className="update-bar" role="status">
          <span>{upgrading ? <>Upgrading <b>Account CoPilot</b> to v{latest}…</> : <>A new version of <b>Account CoPilot</b> (v{latest}) is available.</>}</span>
          <button type="button" className={upgrading ? "upgrading" : undefined} disabled={upgrading} onClick={upgrade}>
            {upgrading ? `Upgrading to v${latest}…` : `Click Refresh to upgrade to v${latest}`}</button>
        </div>
      )}
      {upgraded && (
        <div className="update-bar done" role="status"><span>Updated to <b>Account CoPilot v{upgraded}</b> ✓</span></div>
      )}
      <header className="top">
        <div className="navbar has-sub">
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
            <EngineBell />
            <ProfileMenu />
          </div>
        </div>
        {(() => { const g = GROUPS.find((x) => x.items.some(([, l]) => l === current));
          return g ? (
            <nav className="subtabs" aria-label={`${g.label} sections`}>
              {g.items.map(([href, label]) => <Link key={href} href={href} prefetch className="subtab" aria-selected={label === current} onClick={(e) => go(e, href)}>{SUB_LABEL[label] || label}</Link>)}
            </nav>) : null; })()}
      </header>
    </>
  );
}
