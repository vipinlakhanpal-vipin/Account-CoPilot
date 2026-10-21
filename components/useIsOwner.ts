"use client";
import { useEffect, useState } from "react";

// True only for the Super Admin (the owner). Used to show buttons that delete or cancel things; the server enforces the same rule.
let cached: boolean | null = null;
export default function useIsOwner(): boolean {
  const [v, setV] = useState<boolean>(cached ?? false);
  useEffect(() => {
    if (cached !== null) return;
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((j) => { cached = !!j?.isOwner; setV(cached); }).catch(() => {});
  }, []);
  return v;
}
