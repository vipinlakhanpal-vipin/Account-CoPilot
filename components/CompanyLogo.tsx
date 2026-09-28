"use client";
import { useEffect, useRef, useState } from "react";
import type { Row } from "@/lib/data";

const domainOf = (a: Row) => String(a.domain || a.company_website || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[\/?#\s]/)[0].trim();
const initials = (name: string) => name.replace(/\(.*?\)/g, "").split(/\s+/).filter((w) => w && !/^(the|al|of|and|&|llc|pjsc|psc|group|holding|company|co\.?)$/i.test(w))
  .slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "·";
const LOGO_V = "3"; // bump to make browsers fetch logos afresh (ignores old cached "no logo" answers)

/** Small company logo (the website icon or logo) that fits inside a table row; neutral initials when there is none. */
export default function CompanyLogo({ a, size = 22 }: { a: Row; size?: number }) {
  const d = domainOf(a);
  const [failed, setFailed] = useState(!d);
  const img = useRef<HTMLImageElement>(null);
  // An image can fail before the page is interactive (onError then never fires): check once mounted.
  useEffect(() => { const el = img.current; if (el && el.complete && el.naturalWidth === 0) setFailed(true); }, []);
  return (
    <span className={`co-logo${failed ? " ini" : ""}`} style={failed ? { width: size, height: size } : { height: size, minWidth: size, maxWidth: size * 2 }} title={a.company_name}>
      {failed ? <span className="co-logo-ini" style={{ fontSize: Math.round(size * 0.42) }}>{initials(String(a.company_name || ""))}</span>
        // eslint-disable-next-line @next/next/no-img-element
        : <img ref={img} src={`/api/logo?d=${encodeURIComponent(d)}&v=${LOGO_V}`} alt="" loading="lazy" height={size} onError={() => setFailed(true)} />}
    </span>
  );
}
