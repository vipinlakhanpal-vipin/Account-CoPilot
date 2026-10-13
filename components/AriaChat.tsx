"use client";
import AriaChat from "@/packages/aria/AriaChat";
import { paidFetch } from "@/components/Confirm";
import { downloadReport } from "@/components/ReportDialog";

// Twenty one-tap questions, four rows of five. All are answered free from your data, except the last (marked "uses AI").
const EXAMPLES: [string, string][] = [
  ["Counts", "How many Verified companies in each region?"],
  ["Counts", "How many companies by status?"],
  ["Counts", "How many Coupa customers do we have?"],
  ["Counts", "How many companies run SAP in each region?"],
  ["Rules", "What is the ICP rule for KSA?"],
  ["List", "List the top 10 Verified UAE companies"],
  ["List", "Show Verified KSA companies"],
  ["List", "Which Verified UAE companies run Oracle?"],
  ["List", "List companies with a very strong signal"],
  ["List", "Show our existing Coupa customers"],
  ["People", "Which Verified UAE companies have a CFO contact?"],
  ["People", "Who are the procurement heads in the UAE?"],
  ["Company", "Tell me about Majid Al Futtaim"],
  ["PDF", "PDF report for the top 10 Verified companies in KSA"],
  ["Excel", "I need an Excel contact list for campaigns"],
  ["Counts", "How many Ariba customers do we have?"],
  ["Rules", "What are the ICP rules for all regions?"],
  ["People", "Show CFO contacts at companies running SAP in the UAE"],
  ["PDF", "PDF report on Etihad Airways"],
  ["Search · uses AI", "Where does e-invoicing show up in our signals?"],
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
      buttonClassName="bell-btn"
    />
  );
}
