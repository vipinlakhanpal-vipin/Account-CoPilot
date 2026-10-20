import { requirePageUser } from "@/lib/auth";
import { getAccess } from "@/lib/access";
import NavWizard from "@/components/NavWizard";
export const dynamic = "force-dynamic";
export default async function NavWizardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await getAccess(await requirePageUser());
  const sp = await searchParams; const n = Number(Array.isArray(sp.step) ? sp.step[0] : sp.step) || 1;
  return <NavWizard access={access} step={n} />;
}
