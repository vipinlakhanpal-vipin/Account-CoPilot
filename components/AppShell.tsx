"use client";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import NavPanel from "@/components/NavPanel";

// Every signed-in page sits to the right of the left panel (Find and search, About CoPilot, Daily run, Market intelligence, Buying signals, Setup wizard, Team, Settings, Aria, profile).
// Sign-in pages have no panel.
export default function AppShell({ isSuper, children }: { isSuper: boolean; children: React.ReactNode }) {
  const path = usePathname();
  if (path.startsWith("/login") || path.startsWith("/auth")) return <>{children}</>;
  return (
    <div className="navapp">
      <Suspense fallback={null}><NavPanel isSuper={isSuper} /></Suspense>
      <main className="navmain">{children}</main>
    </div>
  );
}
