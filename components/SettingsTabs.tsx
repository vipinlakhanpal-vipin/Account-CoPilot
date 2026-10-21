"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/nav/settings/icp", label: "Define ICP" },
  { href: "/nav/settings/engine", label: "Engine and PIN" },
  { href: "/nav/settings/aria", label: "Aria Setup" },
  { href: "/nav/settings/guide", label: "Learn me" },
];

/** The Settings pages as tabs on the right, so the left panel needs no Settings sub-menu. */
export default function SettingsTabs() {
  const path = usePathname() || "";
  return (
    <div className="wrap settabs-wrap">
      <nav className="settabs" aria-label="Settings">
        {TABS.map((t) => <Link key={t.href} href={t.href} className={path.startsWith(t.href) ? "on" : ""} aria-current={path.startsWith(t.href) ? "page" : undefined}>{t.label}</Link>)}
      </nav>
    </div>
  );
}
