"use client";
import AppWindow from "@/components/AppWindow";
import OnlineNow from "@/components/OnlineNow";
import type { ReactNode } from "react";
import { logActivity } from "@/lib/activityClient";
import BuyingSignals from "@/components/BuyingSignals";
import MarketIntel from "@/components/MarketIntel";
import { PARTNERS_TIP, CUSTOMERS_TIP } from "@/lib/market";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { useNewVersionInfo } from "@/components/useVersion";
import { notify } from "@/components/Confirm";
import { APP_VERSION, TAGLINE, RELEASES, RELEASE_AUTHOR } from "@/lib/version";

// Main tabs with sub-tabs underneath (Coupa-style). A main tab opens its first sub-tab (items[0]), which also
// has to stay listed here so this group is found while standing on that page — hideLanding then drops it from
// what's actually shown, for a group (like Dashboard) where that first item is just the main tab's own page
// and has no other siblings worth presenting it alongside, unlike Accounts' 5 genuinely distinct pages.
const GROUPS: { label: string; items: [string, string][]; hideLanding?: boolean; icon?: boolean; tip?: string; glyph?: "search" | "pulse" | "network" | "home" | "dashboard" | "accounts" | "data" | "setup"; win?: "signals" | "market" }[] = [
  { label: "Dashboard", items: [["/", "Dashboard"], ["/?tab=reports", "Mission Control"]], hideLanding: true, glyph: "dashboard" },
  { label: "Accounts", items: [["/?tab=accounts", "Accounts"], ["/?tab=pipeline", "Pipeline"], ["/?tab=stakeholders", "Stakeholders"], ["/?tab=signals", "S2P Signals"], ["/?tab=erp", "ERP & Apps"]], glyph: "accounts" },
  { label: "Data", items: [["/?tab=sources", "Sources"], ["/?tab=conflicts", "Conflicts"], ["/research", "Research Queue"]], glyph: "data" },
];
const SUB_LABEL: Record<string, string> = { Accounts: "All accounts" };

const Spin = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const HistoryIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v5l3.5 2M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const TAB_LABEL: Record<string, string> = { pipeline: "Pipeline", accounts: "Accounts", stakeholders: "Stakeholders", signals: "S2P Signals", erp: "ERP & Apps",
  conflicts: "Conflicts", sources: "Sources", reports: "Mission Control" };

const PAGE_LABEL: Record<string, string> = { "/research": "Research Queue" };

const P = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;
// Short outline icons for the main tabs (16 px grid). Home, Find company, Buying signals and Market intelligence show only the icon; the others sit beside their title.
function Glyph({ g }: { g?: string }) {
  const svg = (children: ReactNode, w = 1.7) => <svg viewBox="0 0 16 16" aria-hidden="true" strokeWidth={w} {...P}>{children}</svg>;
  switch (g) {
    case "pulse": return svg(<path d="M1.5 8h3l1.6-4.5 3 9L11 8h3.5" />, 1.8);
    case "network": return svg(<><circle cx="8" cy="3.2" r="1.9" /><circle cx="3" cy="12.4" r="1.9" /><circle cx="13" cy="12.4" r="1.9" /><path d="M7 5 4 10.6M9 5l3 5.6M5 12.4h6" /></>, 1.5);
    case "home": return svg(<path d="M1.8 7.6 8 2.2l6.2 5.4M3.4 6.6V13.4h3.2V9.6h2.8v3.8h3.2V6.6" />);
    case "dashboard": return svg(<><rect x="2" y="2" width="5" height="6" rx="1" /><rect x="9" y="2" width="5" height="3.5" rx="1" /><rect x="9" y="7.5" width="5" height="6.5" rx="1" /><rect x="2" y="10" width="5" height="4" rx="1" /></>, 1.5);
    case "accounts": return svg(<><path d="M2.5 14V3.2h6.2V14M8.7 7h4.8V14M1.5 14h13" /><path d="M5 5.6h1.2M5 8.2h1.2M5 10.8h1.2" /></>, 1.5);
    case "data": return svg(<><ellipse cx="8" cy="4" rx="5" ry="2" /><path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" /></>, 1.5);
    case "setup": return <svg viewBox="0 0 24 24" aria-hidden="true" strokeWidth={1.8} {...P}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>;
    default: return svg(<><circle cx="7" cy="7" r="4.6" strokeWidth={1.8} /><path d="M10.6 10.6 14 14" strokeWidth={1.8} /></>);
  }
}
const Badge = ({ sig }: { sig: { new: number; hot: number } | null }) => (sig && sig.new > 0 ? <span className={`sig-badge${sig.hot ? " hot" : ""}`} aria-label={`${sig.new} new buying signals`}>{sig.new > 99 ? "99+" : sig.new}</span> : null);

// Rendered once in the root layout, so it stays put across page changes (no rebuild, no jump).
export default function Header({ meta }: { meta: string }) {
  const { latest, releases, author } = useNewVersionInfo();
  const [showChanges, setShowChanges] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sig, setSig] = useState({ new: 0, hot: 0 });
  const [win, setWin] = useState<"signals" | "market" | null>(null);
  useEffect(() => { window.dispatchEvent(new CustomEvent("act-view", { detail: win ? `/${win === "market" ? "market" : "signals"}` : null })); }, [win]);
  // The left panel opens the version history from its own item.
  useEffect(() => { const on = () => setShowHistory(true); window.addEventListener("history-open", on); return () => window.removeEventListener("history-open", on); }, []);
  // The New Layout pages can pop Market intelligence or Buying signals out as the floating window.
  useEffect(() => { const on = (e: Event) => { const w = (e as CustomEvent<string>).detail; if (w === "market" || w === "signals") setWin(w); }; const off = () => setWin(null); window.addEventListener("appwin-open", on); window.addEventListener("appwin-close", off); return () => { window.removeEventListener("appwin-open", on); window.removeEventListener("appwin-close", off); }; }, []);
  // In-app alert: how many unseen Hot / Warm buying signals are waiting in the user's regions.
  useEffect(() => {
    let off = false;
    const load = () => fetch("/api/signals?count=1", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && !off) setSig({ new: j.new || 0, hot: j.hot || 0 }); }).catch(() => {});
    load(); const t = setInterval(load, 120000); window.addEventListener("signals-changed", load);
    return () => { off = true; clearInterval(t); window.removeEventListener("signals-changed", load); };
  }, []);
  const history = RELEASES.filter((r) => r.changes?.length).slice(0, 60);
  // Open the "what's new" window once per new version (per browser session); the user can close it and reopen it from the banner.
  useEffect(() => {
    if (!latest || !releases.some((r) => r.changes?.length)) return;
    try { if (sessionStorage.getItem("changesSeen") === latest) return; sessionStorage.setItem("changesSeen", latest); } catch {}
    setShowChanges(true);
  }, [latest, releases]);
  useEffect(() => {
    if (!showChanges && !showHistory) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setShowChanges(false); setShowHistory(false); } };
    window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc);
  }, [showChanges, showHistory]);
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
  // The export builds the workbook fresh (not cached) and can take a few seconds — show progress so the click doesn't look dead.
  const [downloading, setDownloading] = useState(false);
  const downloadMasterBook = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/export");
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const name = /filename="?([^";]+)"?/.exec(res.headers.get("content-disposition") || "")?.[1] || "Account_CoPilot_Master_Book.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { notify("Could not download the Master Book. Try again.", "error"); }
    setDownloading(false);
  };
  const path = usePathname();
  const params = useSearchParams();
  // On the dashboard page, tabs switch instantly on the client (the data is already loaded).
  const current = path === "/" ? TAB_LABEL[params.get("tab") || ""] || "Dashboard" : PAGE_LABEL[path] ?? "";
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
                <button type="button" className="btn btn-close" onClick={() => setShowChanges(false)}>Close</button>
                <button type="button" className="btn primary" disabled={upgrading} onClick={() => { setShowChanges(false); upgrade(); }}>Upgrade to v{latest}</button>
              </span>
            </div>
          </div>
        </div>
      )}
      <AppWindow slot={0} open={win === "signals"} onClose={() => setWin(null)} title="Buying signals" subtitle="Tenders, RFPs, ERP and S2P intent, ECC to S/4HANA" badge="B" actions={<button type="button" className="aria-home aria-scan" title="Start a free scan now instead of waiting for the daily run" onClick={() => window.dispatchEvent(new CustomEvent("appwin-scan", { detail: "signals" }))}>Scan now</button>}><BuyingSignals embedded /></AppWindow>
      <AppWindow slot={1} open={win === "market"} onClose={() => setWin(null)} title="Market intelligence" subtitle="SAP, Coupa, Oracle and Microsoft partners and their customers" badge="M" actions={<>
        <button type="button" className="aria-home aria-scan" onClick={() => window.dispatchEvent(new CustomEvent("appwin-scan", { detail: "market-partners" }))}>Scan Partners</button>
        <span className="find-i hdr" tabIndex={0} role="note" aria-label={PARTNERS_TIP}>i<span className="find-i-pop">{PARTNERS_TIP}</span></span>
        <button type="button" className="aria-home aria-scan" onClick={() => window.dispatchEvent(new CustomEvent("appwin-scan", { detail: "market-customers" }))}>Scan Customers</button>
        <span className="find-i hdr" tabIndex={0} role="note" aria-label={CUSTOMERS_TIP}>i<span className="find-i-pop">{CUSTOMERS_TIP}</span></span>
      </>}><MarketIntel embedded /></AppWindow>
      {showHistory && (
        <div className="wn-backdrop" onClick={() => setShowHistory(false)}>
          <div className="wn" role="dialog" aria-modal="true" aria-labelledby="vh-title" onClick={(e) => e.stopPropagation()}>
            <div className="wn-head">
              <div><p className="wn-kicker">Version History for last 60 Upgrades</p><h2 id="vh-title">What's changed, release by release</h2></div>
              <button type="button" className="wn-close" onClick={() => setShowHistory(false)} aria-label="Close">×</button>
            </div>
            <div className="wn-body">
              {history.map((r) => (
                <section key={r.version}>
                  <h3>v{r.version} · {r.date}</h3>
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
              <span className="wn-by">Changes/upgrades were made by — <b>{RELEASE_AUTHOR}</b></span>
              <span className="wn-actions"><button type="button" className="btn btn-close" onClick={() => setShowHistory(false)}>Close</button></span>
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
            <Link href="/" className="brand-home" aria-label="Account CoPilot home: the Dashboard" title="Home: the Dashboard"><Logo /></Link>
            <div className="brand-text">
              <div className="brand-row">
                <Link href="/" className="appname-link" title="Home: the Dashboard"><span className="appname">Account CoPilot</span></Link>
              </div>
              <span className="brand-sub">{TAGLINE}</span>
            </div>
            <span className="version">
              <button type="button" className="refresh" onClick={() => window.location.reload()}
                title={latest ? `Version v${latest} is available. Click to load it.` : "Reload the latest data"}>
                <Spin />v{APP_VERSION}{latest && <span className="dot" aria-label={`New version v${latest} available`} />}
              </button>
              <OnlineNow />
            </span>
          </div>
          <nav className="tabs" aria-label="Sections">
            {GROUPS.map((g) => (g.win ? (
              <button type="button" key={g.label} className="tab tab-icon" aria-label={g.label} aria-haspopup="dialog" aria-expanded={win === g.win} onClick={() => setWin((w) => (w === g.win ? null : g.win!))}>
                <Glyph g={g.glyph} /><Badge sig={g.win === "signals" ? sig : null} />
                <span className="tip-pill" role="tooltip"><span className="tip-dot" aria-hidden="true" />{g.tip}{g.win === "signals" && sig.new > 0 ? ` (${sig.new} new${sig.hot ? `, ${sig.hot} hot` : ""})` : ""}</span>
              </button>
            ) : (
              <Link key={g.label} href={g.items[0][0]} className={`tab${g.icon ? " tab-icon" : ""}`} aria-label={g.icon ? g.label : undefined} aria-selected={g.items.some(([, l]) => l === current)} onClick={(e) => go(e, g.items[0][0])}>
                {g.icon ? <>
                  <Glyph g={g.glyph} />
                  <span className="tip-pill" role="tooltip"><span className="tip-dot" aria-hidden="true" />{g.tip}</span>
                </> : <><Glyph g={g.glyph} />{g.label}</>}
              </Link>
            )))}
          </nav>
          <div className="nav-actions">
            <button type="button" className="btn btn-dl dl no-ic" onClick={downloadMasterBook} disabled={downloading} title="Download Master Book (.xlsx)">
              {downloading ? <span className="btn-spin">Preparing…</span> : <>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8m0 0-3-3m3 3 3-3M3 13h10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span>Master Book</span></>}
            </button>
            <ThemeToggle />
          </div>
        </div>
        {(() => { const g = GROUPS.find((x) => x.items.some(([, l]) => l === current));
          return g ? (
            <nav className="subtabs" aria-label={`${g.label} sections`}>
              <div className="subtabs-row" ref={subRef} style={{ marginLeft: subOffset ?? 0, visibility: subOffset === null ? "hidden" : "visible" }}>
                {g.items.length > 1
                  ? (g.hideLanding ? g.items.filter(([, l]) => l !== g.label) : g.items)
                      .map(([href, label]) => <Link key={href} href={href} className="subtab" aria-selected={label === current} onClick={(e) => go(e, href)}>{SUB_LABEL[label] || label}</Link>)
                  : <span className="subtab" aria-hidden="true" style={{ visibility: "hidden" }}>&nbsp;</span> /* keeps the bar's height so nothing jumps */}
              </div>
              {meta && <span className="subtabs-meta">{meta}</span>}
            </nav>) : null; })()}
      </header>
    </>
  );
}
