// Rough running time of each kind of free cloud-session job, in seconds: used only to draw the progress gauge (it never goes past 95% until the job really finishes).
type J = { mode: string; phase?: string; customer?: string; partner?: string; contacts_only?: boolean; slug?: string; seamless?: boolean; count?: number | string };
export function expectedSecs(j: J): number {
  if (j.mode === "market") return j.customer ? 180 : j.partner || j.contacts_only ? 300 : j.phase === "partners" ? 240 : 360;
  if (j.mode === "signals") return j.slug ? 180 : (j as { lane?: string }).lane ? 240 : 360;
  if (j.mode === "contacts") return j.seamless ? 240 : 180;
  if (j.mode === "pitch") return 240;
  if (j.mode === "company") return 150;
  if (j.mode === "discover") return 240;
  if (j.mode === "verify") return Math.min(900, 60 * (typeof j.count === "number" ? j.count : 10));
  return 420;
}
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
