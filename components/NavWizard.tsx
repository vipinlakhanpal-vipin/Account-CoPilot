"use client";
import { useRouter } from "next/navigation";
import HomeWorkspace from "@/components/HomeWorkspace";
import type { Access } from "@/lib/access";

// The Setup wizard as a page in the New Layout's right pane. The left panel lists its six steps; Back and Next move the step in the address too, so the panel highlights the same one.
export default function NavWizard({ access, step }: { access: Access; step: number }) {
  const router = useRouter();
  return (
    <>
      <h1 className="nav-h">Setup wizard</h1>
      <HomeWorkspace access={access} layout="wizard" forceStep={step} onStepChange={(n) => { if (n !== step) router.replace(`/nav/wizard?step=${n}`, { scroll: false }); }} />
    </>
  );
}
