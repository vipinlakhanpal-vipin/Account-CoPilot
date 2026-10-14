import { requirePageUser } from "@/lib/auth";
import FindCompany from "@/components/FindCompany";

export const dynamic = "force-dynamic";

// Find company: the single place to search. ?mode=new|search, ?q= or ?company= (prefills the box), ?region=
export default async function FindPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageUser();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";
  const mode = one(sp.mode) === "new" ? "new" : "search";
  const text = one(sp.company) || one(sp.q);
  return <div className="wrap"><FindCompany initialMode={one(sp.company) ? "new" : mode} initialQuery={text} initialRegion={one(sp.region)} /></div>;
}
