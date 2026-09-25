import { requirePageUser } from "@/lib/auth";
import Header from "@/components/Header";
import ResearchQueue from "@/components/ResearchQueue";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  await requirePageUser();
  return (
    <>
      <Header active="Research Queue" subtitle="Research a company across the public web with Claude" />
      <div className="wrap"><ResearchQueue /></div>
    </>
  );
}
