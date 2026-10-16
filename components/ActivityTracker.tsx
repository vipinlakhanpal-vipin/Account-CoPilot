"use client";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { logActivity } from "@/lib/activityClient";

// Records page opens, one "opened the app" per browser session, and a heartbeat every 45 seconds while the tab is in view (for the online-now list). Not shown on sign-in pages.
export default function ActivityTracker() {
  const path = usePathname(), params = useSearchParams();
  const tab = params.get("tab") || "";
  const skip = path.startsWith("/login") || path.startsWith("/auth");
  // The Buying signals and Market intelligence windows are used on top of whatever page is open: while one is open it counts as the place the person is in.
  const view = useRef<string | null>(null);
  const here = () => view.current || location.pathname + location.search;
  useEffect(() => {
    if (skip) return;
    try { if (!sessionStorage.getItem("act-visit")) { sessionStorage.setItem("act-visit", "1"); logActivity("visit"); } } catch { /* optional */ }
    view.current = null; logActivity("page");
  }, [path, tab, skip]);
  useEffect(() => {
    const on = (e: Event) => { const v = (e as CustomEvent<string | null>).detail; view.current = v; logActivity("page", "", here()); };
    window.addEventListener("act-view", on);
    return () => window.removeEventListener("act-view", on);
  }, []);
  useEffect(() => {
    if (skip) return;
    const beat = () => { if (document.visibilityState === "visible") fetch("/api/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "ping", path: here() }) }).catch(() => {}); };
    const t = setInterval(beat, 45000);
    document.addEventListener("visibilitychange", beat);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", beat); };
  }, [skip]);
  return null;
}
