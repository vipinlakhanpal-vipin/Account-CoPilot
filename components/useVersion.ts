"use client";
import { useEffect, useState } from "react";
import { APP_VERSION, type Change } from "@/lib/version";

export type ReleaseInfo = { version: string; date: string; notes: string; changes?: Change[] };
type Info = { latest: string | null; releases: ReleaseInfo[]; author: string };

/** Polls /api/version; returns the deployed version (when it differs from the one running in this tab) and what changed since this tab's version. */
export function useNewVersionInfo(): Info {
  const [info, setInfo] = useState<Info>({ latest: null, releases: [], author: "" });
  useEffect(() => {
    let stop = false;
    const check = async () => {
      try {
        const j = await (await fetch(`/api/version?since=${APP_VERSION}`, { cache: "no-store" })).json();
        if (!stop && j.version) setInfo({ latest: j.version, releases: j.releases || [], author: j.author || "" });
      } catch { /* offline */ }
    };
    check();
    const t = setInterval(check, 60_000);
    window.addEventListener("focus", check);
    return () => { stop = true; clearInterval(t); window.removeEventListener("focus", check); };
  }, []);
  return info.latest && info.latest !== APP_VERSION ? info : { latest: null, releases: [], author: "" };
}

export function useNewVersion() {
  return useNewVersionInfo().latest;
}
