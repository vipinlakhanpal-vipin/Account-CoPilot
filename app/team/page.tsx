import { requirePageUser } from "@/lib/auth";
import Hero from "@/components/Hero";
import TeamSettings from "@/components/TeamSettings";
import { getAccess, ROLE_LABEL } from "@/lib/access";

export const dynamic = "force-dynamic";

// Setup → Team: people, their role (Super Admin / Standard User) and region(s). Managed by Super Admins only.
export default async function TeamPage() {
  const user = await requirePageUser();
  const access = await getAccess(user);
  return (
    <div className="wrap">
      <Hero title="Team" text="Invite colleagues and decide what each person can see: Super Admins see every region; Standard Users work only on their region(s), by that region's ICP." />
      {access.isSuper ? <TeamSettings />
        : <section className="panel" style={{ marginTop: 16 }}><h2>Your access</h2>
            <p><b>{ROLE_LABEL[access.role]}</b> for <b>{access.regions.join(", ") || "no region yet"}</b>. Your Super Admin manages the team, roles and regions.</p></section>}
    </div>
  );
}
