import { createHash } from "node:crypto";

// Server-only helpers for Market intelligence: the same partner always gets the same id, however its name is spelled (LLC, Ltd, FZ-LLC ...).
export const nk = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").replace(/\b(llc|ltd|limited|fz|fze|fzco|co|company|inc|pjsc|plc|group|holding|holdings|the)\b/g, " ").replace(/\s+/g, " ").trim();
export const partnerId = (vendor: string, region: string, name: string) => createHash("sha1").update(`${vendor}|${region}|${nk(name)}`).digest("hex").slice(0, 14);
