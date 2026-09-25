"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";
import ProfileMenu from "@/components/ProfileMenu";
import { useNewVersion } from "@/components/useVersion";
import { APP_VERSION } from "@/lib/version";

const NAV = [["/", "Dashboard"], ["/?tab=accounts", "Accounts"], ["/?tab=stakeholders", "Stakeholders"], ["/?tab=signals", "S2P Signals"],
  ["/?tab=erp", "ERP & Apps"], ["/?tab=conflicts", "Conflicts"], ["/?tab=sources", "Sources"], ["/research", "Research Queue"], ["/settings", "Settings"]];

const Spin = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const TAB_LABEL: Record<string, string> = { accounts: "Accounts", stakeholders: "Stakeholders", signals: "S2P Signals", erp: "ERP & Apps",
  conflicts: "Conflicts", sources: "Sources" };

export default function Header({ active, subtitle }: { active: string; subtitle: string }) {
  const latest = useNewVersion();
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
      {latest && (
        <div className="update-bar" role="status">
          <span>A new version of <b>Account CoPilot</b> (v{latest}) is available.</span>
          <button type="button" onClick={() => window.location.reload()}>Click Refresh to upgrade to v{latest}</button>
        </div>
      )}
      <header className="top">
        <div className="navbar">
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
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} prefetch className="tab" aria-selected={current === label} onClick={(e) => go(e, href)}>{label}</Link>
            ))}
          </nav>
          <div className="nav-actions">
            <a className="btn primary dl" href="/api/export" title="Download Master Book (.xlsx)">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8m0 0-3-3m3 3 3-3M3 13h10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span>Master Book</span></a>
            <ProfileMenu />
          </div>
        </div>
      </header>
    </>
  );
}
