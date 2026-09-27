import { requirePageUser } from "@/lib/auth";
import ResearchQueue from "@/components/ResearchQueue";
import Hero from "@/components/Hero";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  await requirePageUser();
  return (
    <>
      <div className="wrap"><Hero title="Research Queue" text="Research any company across the public web. Claude finds decision makers, S2P signals and ERP evidence, and adds them without overwriting existing data." /><ResearchQueue /></div>
    </>
  );
}
