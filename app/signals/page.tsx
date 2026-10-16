import { requirePageUser } from "@/lib/auth";
import BuyingSignals from "@/components/BuyingSignals";

export const dynamic = "force-dynamic";

// Buying signals: who is shopping for ERP / S2P right now, open tenders and RFPs, and SAP ECC owners who need an S/4HANA partner.
export default async function SignalsPage() {
  await requirePageUser();
  return <div className="wrap"><BuyingSignals /></div>;
}
