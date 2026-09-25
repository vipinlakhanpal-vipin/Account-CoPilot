"use client";
import { useEffect, useState } from "react";
import { APP_VERSION } from "@/lib/version";

/** Shows the running version and a Refresh button. A red badge appears when a newer version is deployed. */
export default function VersionBadge() {
  const [latest, setLatest] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    const check = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const j = await r.json();
        if (!stop && j.version) setLatest(j.version);
      } catch { /* offline: keep current state */ }
    };
    check();
    const t = setInterval(check, 60_000);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => { stop = true; clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, []);
  const update = latest && latest !== APP_VERSION;
  return (
    <span className="version">
      <span className="vtag" title={`Account CoPilot v${APP_VERSION}`}>v{APP_VERSION}</span>
      <button type="button" className={`refresh${update ? " has-update" : ""}`} onClick={() => window.location.reload()}
        title={update ? `Version v${latest} is available. Click to load it.` : "Reload the latest data"}>
        ↻ Refresh
        {update && <span className="badge" aria-label={`New version v${latest} available`}>v{latest}</span>}
      </button>
    </span>
  );
}
