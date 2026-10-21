"use client";
import { useEffect, useRef } from "react";
import { useNewVersionInfo } from "@/components/useVersion";
import { reloadBlocker } from "@/lib/reloadGuard";

const IDLE_MS = 90_000; // no click, key or scroll for this long = idle
const AWAY_MS = 30_000; // a tab hidden this long counts as "come back" when it is shown again

/** Loads the newest version by itself, quietly. It reloads only at a safe moment: the tab has just come back into view
 *  or the person has been idle, and nothing needs saving (no chosen file, upload, ICP edit, open dialog or typing).
 *  It tries once per version, so a stale cache can never cause a reload loop; the version badge keeps its red dot. */
export default function AutoUpdate() {
  const { latest } = useNewVersionInfo();
  const lastInput = useRef(Date.now());
  const hiddenAt = useRef<number | null>(null);
  const justBack = useRef(false);

  useEffect(() => {
    const touch = () => { lastInput.current = Date.now(); justBack.current = false; };
    const vis = () => {
      if (document.hidden) { hiddenAt.current = Date.now(); return; }
      if (hiddenAt.current && Date.now() - hiddenAt.current >= AWAY_MS) justBack.current = true;
      hiddenAt.current = null;
    };
    const ev = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    ev.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    document.addEventListener("visibilitychange", vis);
    return () => { ev.forEach((e) => window.removeEventListener(e, touch)); document.removeEventListener("visibilitychange", vis); };
  }, []);

  useEffect(() => {
    if (!latest) return;
    let tried = "";
    try { tried = sessionStorage.getItem("autoUpdateTried") || ""; } catch {}
    if (tried === latest) return;
    const t = setInterval(() => {
      if (document.hidden) return;
      if (!justBack.current && Date.now() - lastInput.current < IDLE_MS) return;
      if (reloadBlocker()) return;
      try { sessionStorage.setItem("autoUpdateTried", latest); sessionStorage.setItem("upgradedTo", latest); } catch {}
      window.location.reload();
    }, 3000);
    return () => clearInterval(t);
  }, [latest]);

  return null;
}
