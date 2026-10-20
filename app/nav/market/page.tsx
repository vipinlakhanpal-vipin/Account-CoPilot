import NavTool from "@/components/NavTool";
export const dynamic = "force-dynamic";
export default async function NavMarket({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams; const v = Array.isArray(sp.vendor) ? sp.vendor[0] : sp.vendor;
  return <NavTool kind="market" vendor={v || "SAP"} />;
}
