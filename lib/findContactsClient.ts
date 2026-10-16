import { logActivity } from "@/lib/activityClient";
import { notify } from "@/components/Confirm";
import { FIND_CONTACTS_EVENT } from "@/components/ContactsJobTracker";

// "Find contacts": queues a free job (a scheduled Claude session, public web search only, no API spend, no Seamless credits).
export async function queueFindContacts(slug: string, region: string, company: string, seamless = false, quiet = false): Promise<boolean> {
  logActivity("contacts", `${company}${seamless ? " (with Seamless)" : ""}`);
  try {
    const r = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "queue", region, count: 1, mode: "contacts", slug, ...(seamless ? { seamless: true } : {}) }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { if (!quiet) window.dispatchEvent(new CustomEvent(FIND_CONTACTS_EVENT, { detail: { slug, company, region, trigger: String(j.trigger || ""), seamless } })); return true; }
    // Already searching for this company: follow that job instead of showing an error.
    if (r.status === 409) { if (!quiet) window.dispatchEvent(new CustomEvent(FIND_CONTACTS_EVENT, { detail: { slug, company, region, trigger: "ok", seamless, at: Date.now() - 6 * 36e5 } })); return true; }
    notify(j.error || "Could not start the search.", "error");
  } catch { notify("Could not reach the server. Try again.", "error"); }
  return false;
}
