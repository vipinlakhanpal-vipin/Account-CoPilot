import Header from "@/components/Header";
import ResearchQueue from "@/components/ResearchQueue";

export const dynamic = "force-dynamic";

export default function ResearchPage() {
  return (
    <>
      <Header active="Research Queue" subtitle="Research a company across the public web with Claude" />
      <div className="wrap"><ResearchQueue /></div>
    </>
  );
}
