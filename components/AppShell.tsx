"use client";
import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import NavPanel from "@/components/NavPanel";

// Every signed-in page sits to the right of the left panel (Find and search, About CoPilot, Daily run, Market intelligence, Buying signals, Setup wizard, Team, Settings, Aria, profile).
// Sign-in pages have no panel.
export default function AppShell({ isSuper, isOwner, children }: { isSuper: boolean; isOwner: boolean; children: React.ReactNode }) {
  const path = usePathname();
  // The panel sticks just under the sticky top bar: its top offset follows the bar's real height, so at rest it starts level with the page beside it.
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>("header.top"); if (!bar) return;
    const set = () => document.documentElement.style.setProperty("--hdr", `${Math.round(bar.getBoundingClientRect().height)}px`);
    set(); const ro = new ResizeObserver(set); ro.observe(bar); window.addEventListener("resize", set);
    return () => { ro.disconnect(); window.removeEventListener("resize", set); };
  }, [path]);
  if (path.startsWith("/login") || path.startsWith("/auth")) return <>{children}</>;
  return (
    <div className="navapp">
      <Suspense fallback={null}><NavPanel isSuper={isSuper} isOwner={isOwner} /></Suspense>
      <main className="navmain">{children}</main>
    </div>
  );
}
