import { requirePageUser } from "@/lib/auth";
import MarketIntel from "@/components/MarketIntel";

export const dynamic = "force-dynamic";

// Market intelligence: SAP, Coupa, Oracle and Microsoft partners per region and the customers they publish.
export default async function MarketPage() {
  await requirePageUser();
  return <div className="wrap"><MarketIntel /></div>;
}
