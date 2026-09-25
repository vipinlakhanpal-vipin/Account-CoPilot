import Link from "next/link";
import VersionBadge from "@/components/VersionBadge";

const NAV = [["/", "Dashboard"], ["/?tab=accounts", "Accounts"], ["/?tab=stakeholders", "Stakeholders"], ["/?tab=signals", "S2P Signals"],
  ["/?tab=erp", "ERP & Apps"], ["/?tab=conflicts", "Conflicts"], ["/?tab=sources", "Sources"], ["/research", "Research Queue"], ["/settings", "Settings"]];

export default function Header({ active, subtitle }: { active: string; subtitle: string }) {
  return (
    <header className="top">
      <div className="top-inner">
        <div className="brand"><div className="brand-row"><b>Account <i>CoPilot</i></b><VersionBadge /></div><span>{subtitle}</span></div>
        <div className="nav-actions">
          <a className="btn primary" href="/api/export">Download Master Book (.xlsx)</a>
        </div>
      </div>
      <nav className="tabs" aria-label="Sections">
        {NAV.map(([href, label]) => (
          <Link key={href} href={href} className="tab" aria-selected={active === label}>{label}</Link>
        ))}
      </nav>
    </header>
  );
}
