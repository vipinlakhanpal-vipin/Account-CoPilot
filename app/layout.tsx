import "./globals.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import Header from "@/components/Header";
import ConfirmHost from "@/components/Confirm";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Account CoPilot", description: "B2B procurement intelligence" };

/** Light header subtitle: account count and last update (cheap queries; blank if not signed in). */
async function subtitle() {
  try {
    const sb = await supabaseServer();
    const { count } = await sb.from("companies").select("id", { count: "exact", head: true });
    const { data } = await sb.from("companies").select("updated_at").order("updated_at", { ascending: false }).limit(1);
    if (!count) return "B2B procurement intelligence";
    return `B2B procurement intelligence · ${count} accounts · data updated ${String(data?.[0]?.updated_at || "").slice(0, 10)}`;
  } catch { return "B2B procurement intelligence"; }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved light/dark choice before first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}" }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" />
      </head>
      <body><Suspense fallback={null}><Header subtitle={await subtitle()} /></Suspense>{children}<ConfirmHost /><footer className="site-footer">Designed and developed by <b>Vipin</b></footer></body>
    </html>
  );
}
