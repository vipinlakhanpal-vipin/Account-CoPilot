import { requirePageUser } from "@/lib/auth";
import Hero from "@/components/Hero";

const T = ({ head, rows }: { head: string[]; rows: (string | number)[][] }) => (
  <div className="tablewrap"><table><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="wrap">{c}</td>)}</tr>)}</tbody></table></div>);

// v1.43: read-only view of the ICP the agent follows today. The full per-region editor arrives in v1.44.
export default async function DefineIcpPage() {
  await requirePageUser();
  return (
    <div className="wrap guide">
      <Hero title="Define ICP" text="Your Ideal Customer Profile: the rules the agent follows when it searches, verifies, scores and profiles companies." />
      <section className="panel">
        <p className="note"><b>Coming in the next version:</b> an editor for each region (UAE, KSA, Qatar, Kuwait, Oman, Egypt, then Europe and USA). You will be able to set every parameter below, and the agent will follow exactly what you set. Until then, these are the rules in force.</p>
        <h2>Current ICP (all regions)</h2>
        <T head={["Rule", "Value in force"]} rows={[
          ["Revenue", "USD 250M or more (net revenue; banks: total operating income; insurers: insurance revenue or GWP)"],
          ["Employees", "100 or more"],
          ["Stock listing", "Not required; recorded separately as listed / private / government-owned / subsidiary"],
          ["Company level", "Group headquarters only"],
          ["Excluded", "Ministries and government bodies, single hotels / hospitals / schools / attractions, local branches of foreign groups"],
          ["Verified", "Revenue from an official source: annual report, results, exchange or regulator filing, bond prospectus, rating report, or reputable press quoting the company"],
          ["Likely", "USD 250M or more on your data, Seamless or estimates only"],
          ["Not ICP (estimate)", "Estimate below USD 100M and 1,000 staff or fewer"],
          ["Seamless revenue bands", "Count only when headcount agrees: 1,001+ staff → Likely; 201–1,000 → Needs check"],
          ["Re-check", "Every non-Verified company is re-checked 180 days after its last revenue check"],
          ["Currency", "AED 3.6725 per USD"],
          ["Pipeline", "ICP Match 70 or more, not Not ICP; rank = 50% match + 30% opportunity + 20% Coupa fit"],
          ["Daily engine", "UAE: find 5 new companies and verify 25 each morning at 6am Dubai time"],
        ]} />
        <h2>Regions</h2>
        <T head={["Region", "Status"]} rows={[
          ["UAE", "Active — daily discovery and verification"],
          ["Saudi Arabia (KSA)", "Accounts held; daily run not switched on yet"],
          ["Qatar · Kuwait · Oman · Egypt", "Accounts held where known; daily run not switched on yet"],
          ["Europe · USA", "Next phase — each will have its own ICP and parameters"],
        ]} />
      </section>
    </div>
  );
}
