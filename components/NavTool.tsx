"use client";
import { useEffect, useState } from "react";
import MarketIntel from "@/components/MarketIntel";
import BuyingSignals from "@/components/BuyingSignals";
import { PARTNERS_TIP, CUSTOMERS_TIP } from "@/lib/market";

// Market intelligence or Buying signals as a page in the New Layout's right pane, with its scan buttons and a Pop out button that opens the same page as the floating window.
// While it is popped out the pane shows a note instead of a second live copy.
export default function NavTool({ kind, vendor }: { kind: "market" | "signals"; vendor?: string }) {
  const [popped, setPopped] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setPopped((e as CustomEvent<string | null>).detail === `/${kind}`);
    window.addEventListener("act-view", on);
    return () => window.removeEventListener("act-view", on);
  }, [kind]);
  const scan = (d: string) => window.dispatchEvent(new CustomEvent("appwin-scan", { detail: d }));
  const title = kind === "market" ? `Market intelligence${vendor ? ` / ${vendor}` : ""}` : "Buying signals";
  return (
    <div className={`navtool nav-${kind}`}>
      <div className="navtool-head">
        <h1 className="nav-h">{title}</h1>
        <span className="navtool-actions">
          {kind === "market" ? (<>
            <button type="button" className="btn tiny" onClick={() => scan("market-partners")} title={PARTNERS_TIP}>Scan partners</button>
            <button type="button" className="btn tiny" onClick={() => scan("market-customers")} title={CUSTOMERS_TIP}>Scan customers</button>
          </>) : <button type="button" className="btn tiny" onClick={() => scan("signals")} title="Start a free scan now instead of waiting for the daily run">Scan now</button>}
          <button type="button" className="btn tiny navpop" onClick={() => window.dispatchEvent(new CustomEvent("appwin-open", { detail: kind }))} title="Open this page as a floating window you can drag, resize and minimise over any other page">Pop out</button>
        </span>
      </div>
      {popped ? (
        <div className="navpopped" role="status">
          <b>{kind === "market" ? "Market intelligence" : "Buying signals"} is open in a window.</b> Scans keep running there.
          <button type="button" className="btn tiny" onClick={() => window.dispatchEvent(new CustomEvent("appwin-close"))}>Bring it back here</button>
        </div>
      ) : kind === "market" ? <MarketIntel embedded key={vendor} initialVendor={vendor} /> : <BuyingSignals embedded />}
    </div>
  );
}
