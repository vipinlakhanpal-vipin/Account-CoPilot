"use client";
import { useEffect, useState } from "react";
import { APP_VERSION } from "@/lib/version";

/** Polls /api/version; returns the deployed version when it differs from the one running in this tab. */
export function useNewVersion() {
  const [latest, setLatest] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    const check = async () => {
      try {
        const j = await (await fetch("/api/version", { cache: "no-store" })).json();
        if (!stop && j.version) setLatest(j.version);
      } catch { /* offline */ }
    };
    check();
    const t = setInterval(check, 60_000);
    window.addEventListener("focus", check);
    return () => { stop = true; clearInterval(t); window.removeEventListener("focus", check); };
  }, []);
  return latest && latest !== APP_VERSION ? latest : null;
}
