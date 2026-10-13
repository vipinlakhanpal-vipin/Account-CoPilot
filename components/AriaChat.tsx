"use client";
import AriaChat from "@/packages/aria/AriaChat";
import { paidFetch } from "@/components/Confirm";
import { downloadReport } from "@/components/ReportDialog";
import CostNote from "@/components/CostNote";

const EXAMPLES: [string, string][] = [
  ["Counts", "How many Verified companies do we have in each region?"],
  ["Find", "Which Verified UAE companies run SAP and have a CFO contact?"],
  ["Search anything", "Where does e-invoicing show up in our signals?"],
  ["Company brief", "Give me a PDF report on ADNOC"],
  ["Excel list", "I need an Excel contact list for campaigns"],
  ["Rules", "What is the ICP rule for KSA?"],
];

// Account CoPilot's Aria: the shared chat (packages/aria) plus this app's PIN prompt, file downloads and cost note.
export default function AccountCopilotAria() {
  return (
    <AriaChat
      endpoint="/api/aria"
      send={(url, init) => paidFetch(url, init, "Asking Aria")}
      onAction={async (a) => { await downloadReport(a.body, a.kind === "xlsx" ? "xlsx" : "pdf"); }}
      examples={EXAMPLES}
      welcomeText={<>Ask me anything that lives in Account CoPilot: companies, contacts, signals, technology, sources, ICP rules, engine runs. I answer in tables, and I can build a detailed <b>PDF</b> or an <b>Excel</b> contact list for you. Type below, or tap the microphone and speak.</>}
      placeholder="Ask about companies, contacts, platforms, signals…"
      footerNote={<CostNote cost="≈ $0.02–0.10 per question" />}
      buttonClassName="bell-btn"
    />
  );
}
