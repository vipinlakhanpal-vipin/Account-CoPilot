import { requirePageUser } from "@/lib/auth";
import Hero from "@/components/Hero";
import TeamSettings from "@/components/TeamSettings";
import InactiveUsers from "@/components/InactiveUsers";
import ActivityLog from "@/components/ActivityLog";
import { getAccess, ROLE_LABEL } from "@/lib/access";

export const dynamic = "force-dynamic";

// Setup → Team: people, their role and region(s). Opened by the Super Admin (owner) only; Admins and Standard Users do not see it.
export default async function TeamPage() {
  const user = await requirePageUser();
  const access = await getAccess(user);
  return (
    <div className="wrap">
      <Hero title="Team" text="Invite colleagues and decide what each person can see: Super Admins see every region; Standard Users work only on their region(s), by that region's ICP." />
      {access.isOwner ? <><InactiveUsers /><TeamSettings isOwner /><ActivityLog /></>
        : <section className="panel" style={{ marginTop: 16 }}><h2>Team</h2>
            <p>Only the Super Admin opens the Team tab. You are <b>{ROLE_LABEL[access.role]}</b> for <b>{access.isSuper ? "every region" : access.regions.join(", ") || "no region yet"}</b>. Consult Super Admin if any change is required.</p></section>}
    </div>
  );
}
