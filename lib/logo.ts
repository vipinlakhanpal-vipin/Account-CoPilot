// Company logos = the website icon of the company's domain (Google's public favicon service; 404 when a site has none).
// Used by /api/logo (app tables) and the Master Book export. Missing logos show neutral initials instead.
import type { Row } from "@/lib/data";

export const logoDomain = (a: Row): string => String(a.domain || a.company_website || "").toLowerCase()
  .replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[\/?#\s]/)[0].trim();

type Logo = { buf: Buffer; ext: "png" | "jpeg" | "gif" | "svg" | "ico" | "webp"; type: string };
const cache = new Map<string, Logo | null>();
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/126 Safari/537.36" };
const EXT: Record<string, Logo["ext"]> = { "image/png": "png", "image/jpeg": "jpeg", "image/jpg": "jpeg", "image/gif": "gif", "image/svg+xml": "svg",
  "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico", "image/webp": "webp" };

async function image(url: string, headers?: Record<string, string>): Promise<Logo | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(4000), redirect: "follow", headers });
  const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const ext = EXT[type] || (/\.ico(\?|$)/i.test(url) && res.ok ? "ico" : undefined);
  if (!res.ok || !ext) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length > 60 && buf.length < 600_000 ? { buf, ext, type: type || "image/x-icon" } : null;
}
/** The icon or logo the company's homepage declares (link rel=icon / apple-touch-icon, a logo image, or og:image). */
async function fromHomepage(domain: string): Promise<Logo | null> {
  const res = await fetch(`https://${domain}/`, { signal: AbortSignal.timeout(5000), redirect: "follow", headers: UA });
  if (!res.ok) return null;
  const html = (await res.text()).slice(0, 300_000), base = res.url;
  const links = [...html.matchAll(/<link[^>]+>/gi)].map((m) => m[0]).filter((t) => /rel=["'][^"']*(icon|apple-touch-icon)[^"']*["']/i.test(t));
  // Prefer the largest declared icon (apple-touch-icon / sizes), then any icon, then a logo image, then og:image.
  const size = (t: string) => Number((t.match(/sizes=["'](\d+)/i) || [])[1] || (/apple-touch/i.test(t) ? 180 : 16));
  const hrefs = links.sort((x, y) => size(y) - size(x)).map((t) => (t.match(/href=["']([^"']+)["']/i) || [])[1]).filter(Boolean) as string[];
  const logoImg = (html.match(/<img[^>]+src=["']([^"']*logo[^"']*)["']/i) || [])[1];
  const og = (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || [])[1];
  for (const c of [...hrefs, logoImg, og].filter(Boolean) as string[]) {
    try { const l = await image(new URL(c, base).href, UA); if (l) return l; } catch { /* try the next one */ }
  }
  return null;
}

/** A company's logo: Google's icon service for the domain, then for www.domain, then whatever the homepage declares. Cached per server instance. */
export async function fetchLogo(domain: string): Promise<Logo | null> {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  if (cache.has(domain)) return cache.get(domain)!;
  let out: Logo | null = null;
  for (const step of [
    () => image(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`),
    () => (domain.startsWith("www.") ? Promise.resolve(null) : image(`https://www.google.com/s2/favicons?domain=www.${encodeURIComponent(domain)}&sz=64`)),
    () => fromHomepage(domain),
  ]) {
    try { out = await step(); } catch { out = null; }
    if (out) break;
  }
  cache.set(domain, out);
  return out;
}

/** Fetch many logos with limited parallelism (for the export). */
export async function fetchLogos(domains: string[], parallel = 24) {
  const out = new Map<string, { buf: Buffer; ext: "png" | "jpeg" | "gif" }>(); // formats Excel can embed
  const list = [...new Set(domains.filter(Boolean))];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(parallel, list.length) }, async () => {
    while (i < list.length) { const d = list[i++]; const l = await fetchLogo(d); if (l && (l.ext === "png" || l.ext === "jpeg" || l.ext === "gif")) out.set(d, { buf: l.buf, ext: l.ext }); }
  }));
  return out;
}
