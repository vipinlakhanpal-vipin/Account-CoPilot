import Link from "next/link";

// Shown next to every button that calls Claude through the Anthropic API key. Links to Settings → Costs & usage.
export default function CostNote({ cost }: { cost: string }) {
  return (
    <Link href="/settings#costs" className="cost-note" title="This action uses the Anthropic API. Click to see how costs are calculated.">
      <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M8 7v4M8 4.8v.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
      <span><b>Cost impact</b> · this action uses the Anthropic API ({cost}). Click to know more.</span>
    </Link>
  );
}
