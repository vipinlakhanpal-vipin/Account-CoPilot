// Company logos = the website icon of the company's domain (Google's public favicon service; 404 when a site has none).
// Used by /api/logo (app tables) and the Master Book export. Missing logos show neutral initials instead.
import type { Row } from "@/lib/data";

export const logoDomain = (a: Row): string => String(a.domain || a.company_website || "").toLowerCase()
  .replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[\/?#\s]/)[0].trim();

const cache = new Map<string, { buf: Buffer; ext: "png" | "jpeg" } | null>();

/** Fetches a 64px icon for a domain; null when the site has none or it takes too long. Cached in memory per server instance. */
export async function fetchLogo(domain: string): Promise<{ buf: Buffer; ext: "png" | "jpeg" } | null> {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  if (cache.has(domain)) return cache.get(domain)!;
  try {
    const res = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`, { signal: AbortSignal.timeout(3500), redirect: "follow" });
    const type = res.headers.get("content-type") || "";
    const out = res.ok && /image\/(png|jpeg)/.test(type) ? { buf: Buffer.from(await res.arrayBuffer()), ext: (type.includes("jpeg") ? "jpeg" : "png") as "png" | "jpeg" } : null;
    cache.set(domain, out);
    return out;
  } catch { return null; }
}

/** Fetch many logos with limited parallelism (for the export). */
export async function fetchLogos(domains: string[], parallel = 24) {
  const out = new Map<string, { buf: Buffer; ext: "png" | "jpeg" }>();
  const list = [...new Set(domains.filter(Boolean))];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(parallel, list.length) }, async () => {
    while (i < list.length) { const d = list[i++]; const l = await fetchLogo(d); if (l) out.set(d, l); }
  }));
  return out;
}
