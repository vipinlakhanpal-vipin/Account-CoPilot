"use client";
import { useState } from "react";
import type { Row } from "@/lib/data";

const domainOf = (a: Row) => String(a.domain || a.company_website || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[\/?#\s]/)[0].trim();
const initials = (name: string) => name.replace(/\(.*?\)/g, "").split(/\s+/).filter((w) => w && !/^(the|al|of|and|&|llc|pjsc|psc|group|holding|company|co\.?)$/i.test(w))
  .slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "·";

/** Small company logo (the website icon) that fits inside a table row; neutral initials when there is none. */
export default function CompanyLogo({ a, size = 22 }: { a: Row; size?: number }) {
  const d = domainOf(a);
  const [failed, setFailed] = useState(!d);
  return (
    <span className={`co-logo${failed ? " ini" : ""}`} style={failed ? { width: size, height: size } : { height: size, minWidth: size, maxWidth: size * 2 }} title={a.company_name}>
      {failed ? <span className="co-logo-ini" style={{ fontSize: Math.round(size * 0.42) }}>{initials(String(a.company_name || ""))}</span>
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={`/api/logo?d=${encodeURIComponent(d)}`} alt="" loading="lazy" width={size} height={size} onError={() => setFailed(true)} />}
    </span>
  );
}
