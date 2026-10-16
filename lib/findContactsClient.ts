import { notify } from "@/components/Confirm";

// "Find contacts": queues a free job (a scheduled Claude session, public web search only, no API spend, no Seamless credits).
export async function queueFindContacts(slug: string, region: string, company: string): Promise<boolean> {
  try {
    const r = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "queue", region, count: 1, mode: "contacts", slug }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      notify(j.trigger === "ok" ? `Searching for ${company}'s contacts now. New people appear on the account in a few minutes.`
        : `Queued for ${company}. The instant trigger is not working (${j.trigger === "not_set" ? "GITHUB_JOBS_TOKEN is not set in Vercel" : `GitHub said ${j.trigger}`}), so it will run at the next daily run.`, j.trigger === "ok" ? "ok" : "error");
      return true;
    }
    notify(j.error || "Could not start the search.", "error");
  } catch { notify("Could not reach the server. Try again.", "error"); }
  return false;
}
