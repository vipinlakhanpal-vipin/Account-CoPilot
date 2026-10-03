"use client";
import { useEffect } from "react";

// Settings shows a loading.tsx skeleton while its data loads, so the browser's native hash scroll (e.g. clicking
// a Cost impact note's #costs link) often fires before the real content — and the id it's looking for — exists
// in the DOM, landing at the top of the page instead. This retries briefly after mount until the target element
// appears, then scrolls to it; also re-runs on a hash change while already on the page.
export default function ScrollToHash() {
  useEffect(() => {
    const run = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      let tries = 0;
      const tick = () => {
        const el = document.getElementById(hash);
        if (el) { el.scrollIntoView({ block: "start" }); return; }
        if (++tries < 20) setTimeout(tick, 100);
      };
      tick();
    };
    run();
    window.addEventListener("hashchange", run);
    return () => window.removeEventListener("hashchange", run);
  }, []);
  return null;
}
