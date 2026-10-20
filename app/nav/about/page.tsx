import { requirePageUser } from "@/lib/auth";
import { getAccess } from "@/lib/access";
import HomeWorkspace from "@/components/HomeWorkspace";
export const dynamic = "force-dynamic";
export default async function NavAbout() {
  const access = await getAccess(await requirePageUser());
  return (<><h1 className="nav-h">About Account CoPilot</h1><HomeWorkspace access={access} layout="about" /></>);
}
