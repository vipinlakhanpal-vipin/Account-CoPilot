import { requirePageUser } from "@/lib/auth";
import { getAccess } from "@/lib/access";
import NavPanel from "@/components/NavPanel";

export const dynamic = "force-dynamic";

// New Layout (an experiment next to the current tabs): a left panel holding Market intelligence, Buying signals, About CoPilot, Setup wizard and Settings, and the chosen page on the right.
export default async function NavLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const access = await getAccess(user);
  return (
    <div className="navapp">
      <NavPanel isSuper={access.isSuper} />
      <main className="navmain">{children}</main>
    </div>
  );
}
