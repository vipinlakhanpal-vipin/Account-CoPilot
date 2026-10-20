"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import { ask, notify } from "@/components/Confirm";
import { fmtDateTime } from "@/lib/dates";

type Line = { what: string; n: number | null };
type Idle = { id: string; email: string; name: string; role: string; regions: string[]; last_active: string; days_idle: number; suspended_at: string | null; removes: Line[]; stays: Line[] };
type Arch = { id: string; email: string; name: string; role: string; regions: string[]; last_active: string | null; archived_at: string; archived_by: string; reactivated_at: string | null };
const ROLE: Record<string, string> = { super_admin: "Super Admin", admin: "Admin", standard: "Standard User" };

// Team (Super Admin only): people with no activity for 15 days are suspended and listed here. Keep restarts their 15 days; Archive and delete saves a snapshot first; Archived users can be downloaded or reactivated.
export default function InactiveUsers() {
  const [data, setData] = useState<{ days: number; idle: Idle[]; archives: Arch[] } | null>(null);
  const [busy, setBusy] = useState("");
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [reply, setReply] = useState<{ message: string; tempPassword?: string; draftEmail?: { subject: string; body: string } } | null>(null);
  const load = useCallback(() => fetch("/api/inactive", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setData(j)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  async function post(body: Record<string, unknown>) {
    setBusy(String(body.id || body.archiveId));
    const r = await fetch("/api/inactive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (r.ok) { notify(j.message || "Done.", "ok"); if (j.tempPassword) setReply(j); await load(); window.dispatchEvent(new CustomEvent("inactive-changed")); } else notify(j.error || "Could not do that.", "error");
  }
  async function archiveDelete(u: Idle) {
    const yes = await ask({ title: `Archive and delete ${u.name || u.email}?`, tone: "danger", confirm: "Archive, then delete",
      body: `${u.email} has had no activity for ${u.days_idle} days. A snapshot is saved first, so they can be reactivated later.`,
      points: [...u.removes.map((x) => `Removes: ${x.what}${x.n !== null ? ` (${x.n})` : ""}`), ...u.stays.map((x) => `Stays: ${x.what}${x.n !== null ? ` (${x.n})` : ""}`),
        "The archive keeps their profile, role, regions, activity log, saved filters, suggestions and jobs. Only you can download it or reactivate them."] });
    if (yes) await post({ action: "archive_delete", id: u.id, confirm: true });
  }
  async function reactivate(a: Arch) {
    const yes = await ask({ title: `Reactivate ${a.name || a.email}?`, confirm: "Reactivate", body: `This creates their sign-in again as ${ROLE[a.role] || a.role}${a.role === "standard" ? ` for ${a.regions.join(", ")}` : ""}, restores their saved filters, and gives you a temporary password to send them. Their activity history stays in the archive.` });
    if (yes) await post({ action: "reactivate", archiveId: a.id });
  }
  async function dropArchive(a: Arch) {
    const yes = await ask({ title: "Delete this archive?", tone: "danger", confirm: "Delete the archive", body: `The saved snapshot of ${a.email} is removed for good, and they can no longer be reactivated from it.` });
    if (yes) await post({ action: "delete_archive", archiveId: a.id, confirm: true });
  }
  if (!data || (!data.idle.length && !data.archives.length)) return reply ? <Reply r={reply} onClose={() => setReply(null)} /> : null;
  return (
    <>
      {data.idle.length > 0 && (
        <div className="panel inactive-card" style={{ marginTop: 16 }}>
          <h2 className="with-count">Inactive users <span className="count">{data.idle.length}</span></h2>
          <p className="note">No activity for {data.days} days (no sign-in, page, search or action). They are <b>suspended</b>: they cannot sign in, and nothing has been deleted. Choose what happens to each.</p>
          <div className="tablewrap"><table className="inactive-table">
            <thead><tr><th></th><th>Person</th><th>Role</th><th>Email</th><th>Last active</th><th>Idle</th><th>Suspended</th><th></th></tr></thead>
            <tbody>{data.idle.map((u) => {
              const isOpen = !!show[u.id], d = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
              return (
                <Fragment key={u.id}>
                  <tr>
                    <td><button type="button" className="inactive-tog" aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} what would be removed for ${u.email}`} onClick={() => setShow((m) => ({ ...m, [u.id]: !m[u.id] }))}>{isOpen ? "▾" : "▸"}</button></td>
                    <td><b>{u.name || "—"}</b></td>
                    <td><span className={`role-tag ${u.role}`}>{ROLE[u.role] || u.role}</span></td>
                    <td className="mono">{u.email}</td>
                    <td className="mono">{d(u.last_active)}</td>
                    <td>{u.days_idle} days</td>
                    <td className="mono">{u.suspended_at ? d(u.suspended_at) : "—"}</td>
                    <td className="inactive-acts">
                      <button type="button" className="btn tiny" disabled={busy === u.id} onClick={() => post({ action: "keep", id: u.id })} title="Let them sign in again and restart their 15 days">Keep</button>
                      <button type="button" className="btn tiny danger" disabled={busy === u.id} onClick={() => archiveDelete(u)}>Archive and delete…</button></td>
                  </tr>
                  {isOpen && (
                    <tr className="inactive-more"><td></td><td colSpan={7}>
                      <div className="inactive-lists">
                        <div><small>Would be removed</small><ul>{u.removes.map((x) => <li key={x.what}>{x.what}{x.n !== null ? ` (${x.n})` : ""}</li>)}</ul></div>
                        <div><small>Stays</small><ul>{u.stays.map((x) => <li key={x.what}>{x.what}{x.n !== null ? ` (${x.n})` : ""}</li>)}</ul></div>
                      </div></td></tr>)}
                </Fragment>);
            })}</tbody></table></div>
        </div>)}
      {data.archives.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h2 className="with-count">Archived users <span className="count">{data.archives.length}</span></h2>
          <p className="note">Saved snapshots, kept for 12 months from the archive date, then yours to delete.</p>
          <div className="tablewrap"><table className="inactive-table"><thead><tr><th>Person</th><th>Role</th><th>Last active</th><th>Archived</th><th></th></tr></thead>
            <tbody>{data.archives.map((a) => (
              <tr key={a.id}><td><b>{a.name || "—"}</b><div className="muted">{a.email}</div></td><td>{ROLE[a.role] || a.role}</td>
                <td className="mono team-dt">{a.last_active ? fmtDateTime(a.last_active) : "—"}</td>
                <td className="mono team-dt">{fmtDateTime(a.archived_at)}{a.reactivated_at ? <div className="muted">Reactivated {fmtDateTime(a.reactivated_at)}</div> : null}</td>
                <td className="inactive-acts">
                  <a className="btn tiny" href={`/api/inactive?archive=${a.id}`}>Download</a>
                  {!a.reactivated_at && <button type="button" className="btn tiny primary" disabled={busy === a.id} onClick={() => reactivate(a)}>Reactivate</button>}
                  <button type="button" className="btn tiny danger" disabled={busy === a.id} onClick={() => dropArchive(a)}>Delete archive</button></td></tr>))}</tbody></table></div>
        </div>)}
      {reply && <Reply r={reply} onClose={() => setReply(null)} />}
    </>
  );
}

function Reply({ r, onClose }: { r: { message: string; tempPassword?: string; draftEmail?: { subject: string; body: string } }; onClose: () => void }) {
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <p><b>{r.message}</b></p>
      {r.tempPassword && <p>Temporary password: <code>{r.tempPassword}</code></p>}
      {r.draftEmail && <pre className="team-draft" style={{ whiteSpace: "pre-wrap" }}>{`Subject: ${r.draftEmail.subject}\n\n${r.draftEmail.body}`}</pre>}
      <button type="button" className="btn tiny" onClick={onClose}>Close</button>
    </div>
  );
}
