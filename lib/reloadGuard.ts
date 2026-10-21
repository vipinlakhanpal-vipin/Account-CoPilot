"use client";
import { useEffect } from "react";

// Anything that would lose the person's work if the page reloaded registers here (a chosen file, an upload,
// an unsaved ICP edit). The silent auto-update (components/AutoUpdate.tsx) never reloads while one is active.
const active = new Map<symbol, string>();

export function useReloadGuard(on: boolean, reason: string) {
  useEffect(() => {
    if (!on) return;
    const id = Symbol(reason);
    active.set(id, reason);
    return () => { active.delete(id); };
  }, [on, reason]);
}

/** Why a reload is not safe right now, or "" when it is. */
export function reloadBlocker(): string {
  const first = active.values().next();
  if (!first.done) return first.value;
  if (document.querySelector('[role="dialog"], [aria-modal="true"], .wn-backdrop, .confirm-backdrop')) return "a dialog is open";
  for (const f of Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'))) if (f.files && f.files.length) return "a file is chosen";
  const a = document.activeElement as HTMLElement | null;
  if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable)) return "the person is typing";
  return "";
}
