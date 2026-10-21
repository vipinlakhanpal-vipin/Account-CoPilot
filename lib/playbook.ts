// Playbook and Discovery Questions that travel with every Aria Excel / PDF when the search names a product (Coupa, SAP Ariba, another S2P vendor or an ERP).
// Pure functions and text only, shared by the Excel (lib/xlsxReport.ts) and the PDF (lib/pdfReport.ts).
// Wording is method, not statistics: it names what to test and listen for, and never states a figure or a customer story the app has not sourced.
import type { Row } from "@/lib/data";

export type Mode = "prospects" | "customers";
export type Detected = { products: string[]; mode: Mode };
type Kind = "coupa" | "ariba" | "s2p" | "erp";
const S2P_OTHERS: [RegExp, string][] = [[/\bivalua\b/, "Ivalua"], [/\bjaggaer\b/, "Jaggaer"], [/\bgep\b/, "GEP"], [/\bzycus\b/, "Zycus"], [/\bcoupa\b/, ""]];
const ERPS: [RegExp, string][] = [[/\bs\/?4 ?hana\b/, "SAP S/4HANA"], [/\bsap(?! ariba)\b/, "SAP"], [/\boracle\b/, "Oracle"], [/\bdynamics\b/, "Microsoft Dynamics"]];

/** Which product(s) a search is about. Coupa and SAP Ariba count even when the search only excludes them (a prospect list "excluding Coupa" is a Coupa / Ariba prospect list). */
export function detectProducts(text: string, f?: { platform?: string; exclude_platform?: string[]; erp_contains?: string }): Detected {
  const t = String(text || "").toLowerCase();
  const out: string[] = [];
  if (/\bcoupa\b/.test(t) || f?.platform === "coupa" || f?.exclude_platform?.includes("coupa")) out.push("Coupa");
  if (/\bariba\b/.test(t) || f?.platform === "ariba" || f?.exclude_platform?.includes("ariba")) out.push("SAP Ariba");
  const plain = t.replace(/\bexcluding [a-z0-9 /&-]+/g, " ").replace(/\bexcept [a-z0-9 /&-]+/g, " "); // "SAP users excluding Oracle" is about SAP, not Oracle
  for (const [re, name] of S2P_OTHERS) if (name && re.test(plain)) out.push(name);
  for (const [re, name] of ERPS) if (re.test(plain) && !out.some((x) => x.startsWith("SAP") && name.startsWith("SAP"))) { out.push(name); break; }
  const customers = !!f?.platform || /\b(coupa|ariba|ivalua|jaggaer|gep|zycus) customers\b/.test(t);
  return { products: [...new Set(out)].slice(0, 3), mode: customers ? "customers" : "prospects" };
}
const kindOf = (p: string): Kind => (p === "Coupa" ? "coupa" : p === "SAP Ariba" ? "ariba" : ["Ivalua", "Jaggaer", "GEP", "Zycus"].includes(p) ? "s2p" : "erp");

export type PlayRow = { section: string; point: string; detail: string; use: string };
export type Question = { topic: string; q: string; why: string; listen: string; who: string };
export type Starter = { company: string; status: string; erp: string; s2p: string; signal: string; play: string; lead: string };

const SCP = "SCP is the implementation and managed-services partner, so every play can pair the software with delivery: integration to the ERP, a phased rollout, and managed services after go-live (support, upgrades, adoption).";

function playbook(p: string, mode: Mode): PlayRow[] {
  const k = kindOf(p), customers = mode === "customers";
  const R = (section: string, point: string, detail: string, use = ""): PlayRow => ({ section, point, detail, use });
  const rows: PlayRow[] = [];
  // ---- 1. Positioning ----
  if (k === "coupa" && !customers) rows.push(
    R("1. Positioning", "One-line pitch", "Coupa gives finance and procurement one connected place to buy, contract, receive and pay, with spend visible before it is committed, on top of the ERP you already run.", "Opening of any email or call"),
    R("1. Positioning", "Why Coupa", "Buyer-friendly requisitioning drives adoption, so more spend flows through the system. Supplier onboarding, contracts, invoices and payments sit on one supplier record. Spend analytics and supplier risk are in the same platform, not bolted on.", "Business case"),
    R("1. Positioning", "Why a partner", SCP, "Implementation and services slide"));
  if (k === "coupa" && customers) rows.push(
    R("1. Positioning", "One-line pitch", "You already run Coupa. The next gain is in adoption, the modules you have not switched on, and a team that keeps the platform healthy after go-live.", "Opening of any email or call"),
    R("1. Positioning", "Why now", "Renewals, new releases, new entities or acquisitions and changes of owner are the natural moments to review what is live and what is not.", "Timing"),
    R("1. Positioning", "Why a partner", SCP, "Managed services slide"));
  if (k === "ariba" && !customers) rows.push(
    R("1. Positioning", "One-line pitch", "SAP Ariba connects procurement to the Ariba Network and to SAP S/4HANA. SCP implements it and then runs it, so the programme lands on time and keeps working.", "Opening of any email or call"),
    R("1. Positioning", "Why SAP Ariba", "Best when the company runs SAP (ECC or S/4HANA) and values the Ariba Network and SAP integration. Position as the SAP-native choice; qualify against Coupa where the buyer experience or speed matters more.", "Business case"),
    R("1. Positioning", "Why a partner", SCP, "Implementation and services slide"));
  if (k === "ariba" && customers) rows.push(
    R("1. Positioning", "One-line pitch", "You already run SAP Ariba. SCP can take on the running of it (support, upgrades, supplier enablement) or help you review whether it still fits.", "Opening of any email or call"),
    R("1. Positioning", "Two motions", "Managed services on the Ariba estate, and a Coupa review only where the owner reports pain in adoption, cost or flexibility. Lead with managed services; raise Coupa only when asked or when the contract end is near.", "Choosing the play"),
    R("1. Positioning", "Why a partner", SCP, "Managed services slide"));
  if (k === "s2p") rows.push(
    R("1. Positioning", "One-line pitch", `These accounts run ${p}. Lead with what they get from changing, or from having SCP run the platform they have: adoption, supplier experience, cost of ownership.`, "Opening of any email or call"),
    R("1. Positioning", "Two motions", `Managed services on ${p}, or a displacement to Coupa or SAP Ariba. Choose from the owner's pain and the contract end date, never from the brand.`, "Choosing the play"),
    R("1. Positioning", "Why a partner", SCP, "Services slide"));
  if (k === "erp") rows.push(
    R("1. Positioning", "One-line pitch", `${p} runs the books. Source-to-pay on top of it (Coupa or SAP Ariba) is where spend control, supplier management and invoice automation come from.`, "Opening of any email or call"),
    R("1. Positioning", "Two options", "Coupa when buyer experience and speed to value lead; SAP Ariba when SAP integration and the Ariba Network lead. Qualify before you choose.", "Choosing the platform"),
    R("1. Positioning", "Why a partner", SCP, "Services slide"));
  // ---- 2. People ----
  rows.push(
    R("2. Who to talk to", "Chief Procurement Officer / Head of Procurement", "Owns the process and the savings number. Cares about spend under management, compliance, cycle time and supplier performance.", "First call, business owner"),
    R("2. Who to talk to", "CFO / Finance Director", "Owns cash, control and the audit. Cares about invoice accuracy, payment terms, accruals and visibility of commitments.", "Economic buyer"),
    R("2. Who to talk to", "CIO / Head of IT / ERP lead", "Owns integration and the ERP roadmap. Cares about fit with S/4HANA or Oracle, security, support load and who runs it.", "Technical buyer and blocker"),
    R("2. Who to talk to", "Shared services / AP lead; Transformation lead", "Feels the daily pain (invoice exceptions, supplier queries). Often the champion who starts the project.", "Champion"));
  // ---- 3. Triggers ----
  rows.push(
    R("3. Triggers to listen for", "Programme or tender", "A published RFP, an S2P or procurement-transformation project, a procurement consulting award.", "Buying signals tab in the app"),
    R("3. Triggers to listen for", "ERP change", "SAP ECC owners heading to S/4HANA, a new ERP, a carve-out or merger, a new entity.", "Timing: the S2P layer is decided alongside the ERP"),
    R("3. Triggers to listen for", "New leader", "A new CPO, CFO or CIO in the last 12 months usually reviews tools and partners.", "Contact status and job moves in the app"),
    R("3. Triggers to listen for", "Regulation and reporting", "E-invoicing and tax reporting changes, supplier-diversity or local-content reporting (for example in KSA and South Africa). Check current dates and rules with the client before quoting any.", "Compliance angle"),
    R("3. Triggers to listen for", "Contract end", customers ? `Renewal date of the current ${p} contract.` : "Renewal date of the current platform, where one exists.", "Ask early; it sets the timeline"));
  // ---- 4. Motion ----
  rows.push(
    R("4. Sales motion", "Step 1: research", "Read the account page: ICP status, ERP, S2P platform, signals, people. Confirm who owns procurement and finance.", "Before any outreach"),
    R("4. Sales motion", "Step 2: first contact", "One short email to the procurement or finance lead, naming one trigger from section 3 and one question from the Discovery Questions. No attachment.", "Week 1"),
    R("4. Sales motion", "Step 3: discovery", "Use the Discovery Questions. Aim to leave with the pain in the buyer's words, the process map, the systems, the decision path and a date.", "Meeting 1"),
    R("4. Sales motion", "Step 4: business case", "Build it from their numbers: invoice volume, supplier count, spend under management, cycle time. Label anything the app estimated as an estimate.", "After discovery"),
    R("4. Sales motion", "Step 5: proof", "Offer a reference call, a demo on their own process, or a scoped pilot. Use only references SCP can supply and the customer has agreed to.", "Before proposal"),
    R("4. Sales motion", "Step 6: proposal and next phase", "Software, implementation and managed services as one proposal, with a phased plan and named owners.", "Proposal"));
  // ---- 5. Objections ----
  rows.push(
    R("5. Objections", "We already have an ERP that does this", "The ERP records the transaction; S2P manages the buying that happens before it. Ask where requisitions, approvals and supplier onboarding happen today and how much of it is on email or spreadsheets.", "Ask, then show the gap"),
    R("5. Objections", "No budget this year", "Ask what the manual process costs today in people and rework, and whether the project can start with one process (for example invoices or onboarding) and grow.", "Phase it"),
    R("5. Objections", "We tried a tool and nobody used it", "Adoption is a design and change problem. Ask who was meant to use it and why they did not; show the plan for training, support and managed services after go-live.", "Listen first"),
    R("5. Objections", "Too big a project for our team", "Phase it, keep the ERP, put SCP delivery and managed services around the team.", "Reduce the risk"),
    R("5. Objections", "We are happy with the current vendor", customers ? "Fine: then the conversation is about running it better. Offer a health check of adoption and open improvements." : "Ask what they would change if they could. Offer a short comparison on their own process rather than a pitch.", "Stay curious"));
  // ---- 6. Competition ----
  if (k === "coupa") rows.push(
    R("6. Competition", "SAP Ariba", "Strong where SAP integration and the Ariba Network lead. Coupa is usually positioned on buyer experience, one platform for spend, and speed of change. Test which matters to this buyer.", ""),
    R("6. Competition", "Oracle, GEP, Jaggaer, Ivalua, Zycus", "Compare on their own process: onboarding, sourcing, contracts, invoices. Do not argue features; ask the buyer to rank their three must-haves.", ""),
    R("6. Competition", "Spreadsheets, email and ERP purchasing", "The most common competitor. The case is control and visibility, not software.", ""));
  if (k === "ariba") rows.push(
    R("6. Competition", "Coupa", "Often shortlisted against Ariba. Be ready to say where Ariba wins for this account (SAP integration, Ariba Network reach) and where the buyer's pain points to something else.", ""),
    R("6. Competition", "Oracle, GEP, Jaggaer, Ivalua, Zycus", "Compare on their own process; ask the buyer to rank three must-haves.", ""),
    R("6. Competition", "Spreadsheets, email and ERP purchasing", "The most common competitor. The case is control and visibility.", ""));
  if (k === "s2p" || k === "erp") rows.push(
    R("6. Competition", "Coupa and SAP Ariba", "SCP's two platforms. Pick the one that fits the account's ERP, buyer experience and supplier network needs.", ""),
    R("6. Competition", k === "s2p" ? p : "Other S2P vendors", "Find out who owns the current tool, what it covers and when the contract ends before you position.", ""),
    R("6. Competition", "Spreadsheets, email and ERP purchasing", "The most common competitor.", ""));
  // ---- 7. Proof ----
  rows.push(
    R("7. Proof to bring", "Reference customers", "SCP's agreed references in the same region and sector. This sheet lists none: add them from SCP's own approved list.", "Before the meeting"),
    R("7. Proof to bring", "Their own numbers", "Invoice count, supplier count, approval steps, cycle time, spend under management. Ask the client for them; the app's spend and transaction figures are estimates.", "Business case"),
    R("7. Proof to bring", "A scoped pilot", "One process, one entity, a fixed date and a success measure agreed in writing.", "Reduces the risk"));
  // ---- 8. Messages ----
  rows.push(
    R("8. Messages that fit", "Control", "See what is being bought before it is committed, across every entity.", ""),
    R("8. Messages that fit", "Speed", "Shorter time from request to order, and from invoice to payment.", ""),
    R("8. Messages that fit", "Suppliers", "One place to onboard, assess and manage suppliers, with risk in view.", ""),
    R("8. Messages that fit", "Delivery", "A partner that implements it and then runs it with you.", ""));
  return rows;
}

const Q = (topic: string, q: string, why: string, listen: string, who: string): Question => ({ topic, q, why, listen, who });
function questions(p: string, mode: Mode): Question[] {
  const k = kindOf(p), customers = mode === "customers";
  const out: Question[] = [
    Q("Goals", "What is driving procurement and finance to look at this now?", "Finds the trigger and the sponsor.", "A programme, a new leader, an ERP change, an audit finding, a savings target.", "CPO, CFO"),
    Q("Goals", "If this works, what will be different in 12 months? How will you measure it?", "Gets the success measure in their words.", "A number or a date, not a feature.", "CPO, CFO"),
    Q("Current process", "Walk me through how a purchase goes from request to payment today.", "Maps the process and the manual steps.", "Email, spreadsheets, paper approvals, re-keying into the ERP.", "Procurement, AP"),
    Q("Current process", "Where does spend happen outside the process (off-contract, after the fact, by card)?", "Sizes the compliance gap.", "Retrospective POs, tail spend, many small suppliers.", "CPO"),
    Q("Current process", "How many purchase orders and invoices do you handle a month, and how many need manual touches?", "Volume for the business case.", "Exceptions and rework as a share of volume.", "AP, shared services"),
    Q("Suppliers", "How do you onboard and assess a new supplier, and how long does it take?", "Supplier management pain.", "Weeks, several teams, no single supplier record.", "Procurement"),
    Q("Suppliers", "How do you see supplier risk, certificates and performance today?", "Risk and compliance need.", "Spreadsheets, reviews once a year, surprises.", "Procurement, risk"),
    Q("Contracts", "Where do contracts live, and how do you know what you are committed to?", "Contract management need.", "Shared drives, unknown renewal dates, no link to spend.", "Legal, procurement"),
    Q("Invoices and payment", "What share of invoices arrive as paper or PDF, and how are they matched to orders and receipts?", "Invoice automation need.", "Manual matching, late-payment disputes, missed discounts.", "AP, finance"),
    Q("Invoices and payment", "How do you handle e-invoicing and tax rules in the countries you operate in?", "Compliance driver.", "A mandate with a date, or a plan that depends on the ERP.", "Finance, IT"),
    Q("Spend visibility", "Can you see spend by category, supplier and entity today? How long does a report take?", "Spend analytics need.", "Reports built by hand; numbers that do not agree.", "CPO, CFO"),
    Q("Systems", "Which ERP runs finance, and what are the plans for it (upgrade, move, replace)?", "Integration and timing.", "ECC to S/4HANA, a new ERP, several ERPs after acquisitions.", "CIO, ERP lead"),
    Q("Systems", "Which other tools touch procurement (sourcing, contracts, supplier portal, AP automation)?", "Landscape and what could be retired.", "Point tools with overlapping scope.", "CIO, procurement"),
    Q("People", "Who would use it daily, and who needs to agree for it to work?", "Adoption and champions.", "A named owner in each function.", "CPO, transformation lead"),
    Q("People", "What happened with the last tool or project of this kind?", "Lessons and risks.", "Low adoption, scope creep, a partner that left.", "Any"),
    Q("Decision", "How are decisions like this made here, and who signs?", "Decision path.", "A steering group, a budget owner, a procurement of the procurement tool.", "CPO, CFO"),
    Q("Decision", "Is there a budget or a date this is tied to? What happens if nothing changes?", "Urgency and funding.", "A budget cycle, an audit date, a go-live of another programme.", "CFO"),
    Q("Delivery", "Who would run the platform after go-live, and do you have the skills in-house?", "Opens the managed-services conversation.", "No named owner, a thin team, reliance on the ERP team.", "CIO, procurement"),
  ];
  if (k === "coupa" && !customers) out.push(
    Q("Coupa fit", "How easy is it today for an employee to find what to buy and raise a request?", "Buyer experience, which drives adoption.", "Frustration, workarounds, requests by email.", "Procurement, business users"),
    Q("Coupa fit", "Which would help most first: spend visibility, supplier onboarding, contracts or invoices?", "Starting module and phasing.", "One clear first process.", "CPO"),
    Q("Coupa fit", "How would a pilot in one entity or one category work for you?", "Tests appetite for a phased start.", "A named entity and a date.", "CPO, CIO"));
  if (k === "coupa" && customers) out.push(
    Q("Coupa health", "Which Coupa modules are live, and which did you buy but not switch on?", "Expansion map.", "Licensed but unused modules.", "Procurement owner"),
    Q("Coupa health", "What share of spend and invoices goes through Coupa today?", "Adoption gap.", "A number well below total spend.", "CPO, AP"),
    Q("Coupa health", "When does your Coupa contract renew, and who owns that decision?", "Timing and owner.", "A date within 12 months.", "Procurement, CFO"),
    Q("Coupa health", "Who supports the platform day to day, and what is hard to get done?", "Managed-services need.", "A backlog, a single admin, release changes nobody has time to test.", "Procurement owner, IT"));
  if (k === "ariba" && !customers) out.push(
    Q("Ariba fit", "How important is integration with SAP and the Ariba Network to this decision?", "Tests the SAP-native case.", "S/4HANA plans; suppliers already on the Network.", "CIO, procurement"),
    Q("Ariba fit", "Which suppliers already trade with you through Ariba or another network?", "Network benefit.", "Large suppliers already connected.", "Procurement"),
    Q("Ariba fit", "Do you want one platform for the whole process or a staged start?", "Scope of the first phase.", "A first process and a date.", "CPO, CIO"));
  if (k === "ariba" && customers) out.push(
    Q("Ariba health", "Which Ariba modules are live, and where does the process still run outside them?", "Gap map.", "Manual steps next to the system.", "Procurement owner"),
    Q("Ariba health", "Who supports Ariba today, and how long do changes and upgrades take?", "Managed-services need.", "Long queues, key-person risk.", "Procurement owner, IT"),
    Q("Ariba health", "When does the Ariba contract end, and has anyone reviewed the alternatives?", "Timing and openness.", "A date in the next 12 to 18 months.", "Procurement, CFO"),
    Q("Ariba health", "What would you change about the platform if you could?", "Opens the review without pushing Coupa.", "Usability, speed, cost, supplier adoption.", "CPO, users"));
  if (k === "s2p") out.push(
    Q(`${p} health`, `Which ${p} modules are live, and what is still done outside them?`, "Gap map.", "Manual steps next to the system.", "Procurement owner"),
    Q(`${p} health`, `Who runs ${p} day to day, and when does the contract end?`, "Managed services and timing.", "A thin team; a date in the next 12 to 18 months.", "Procurement owner, CIO"),
    Q(`${p} health`, "What would you change about it if you could?", "Opens the conversation on change or support.", "Usability, cost, supplier adoption.", "CPO, users"));
  if (k === "erp") out.push(
    Q(`${p} and S2P`, `How much of procurement runs inside ${p} today, and how much outside it?`, "Where S2P adds value.", "Approvals, onboarding and sourcing outside the ERP.", "CIO, procurement"),
    Q(`${p} and S2P`, "Is there an ERP upgrade or move planned, and when would a procurement platform be decided?", "Timing.", "A programme with a date.", "CIO, ERP lead"),
    Q(`${p} and S2P`, "Have you looked at Coupa or SAP Ariba before? What came of it?", "History and competitors.", "A past evaluation, a stalled project.", "CPO, CIO"));
  return out;
}

/** Playbook rows and discovery questions for each detected product, in the order detected. */
export function playbookFor(d: Detected) {
  return d.products.map((p) => ({ product: p, rows: playbook(p, d.mode), questions: questions(p, d.mode) }));
}

const platformKind = (v: string) => (/coupa/i.test(v) ? "Coupa" : /ariba/i.test(v) ? "SAP Ariba" : /ivalua|jaggaer|gep|zycus|oracle|coupa|ariba|sap|basware|tungsten|icertis/i.test(v) ? v : "");
const clean = (v: unknown) => { const t = String(v ?? "").trim(); return /^(unknown|no evidence|none|n\/a|not[ _](identified|found|public))$/i.test(t) ? "" : t; };
/** A starting play for each account in the file, worked out from what the app holds (ERP, S2P platform, signal). Rule-based; nothing is invented. */
export function startersFor(accounts: Row[], d: Detected): Starter[] {
  const lead = (a: Row) => (/strong/i.test(String(a.s2p_signal_level)) ? "CPO or Head of Procurement; CFO as economic buyer" : "Procurement lead first, then CFO");
  return accounts.map((a) => {
    const s2p = clean(a.existing_s2p_product), erp = clean(a.erp).replace(/\s*\(.*$/, ""), sig = String(a.s2p_signal_level || "").trim();
    const pk = platformKind(s2p);
    let play: string;
    if (/coupa/i.test(s2p)) play = "Existing Coupa customer: review adoption and unused modules, offer managed services, check the renewal date.";
    else if (/ariba/i.test(s2p)) play = d.products.includes("SAP Ariba") && d.mode === "customers" ? "Existing SAP Ariba customer: lead with managed services; review the contract end." : "Runs SAP Ariba: lead with managed services; raise Coupa only where there is pain or the contract is near its end.";
    else if (pk) play = `Runs ${s2p}: managed services on it, or a Coupa / SAP Ariba review if the owner reports pain. Find the contract end.`;
    else if (/sap/i.test(erp)) play = "No S2P suite on file, SAP ERP: position S2P on top of it; ask about ECC to S/4HANA timing.";
    else if (/oracle/i.test(erp)) play = "No S2P suite on file, Oracle ERP: test how much procurement runs outside the ERP; position S2P on top.";
    else if (erp) play = `No S2P suite on file, ${erp}: test how much procurement runs outside the ERP; position S2P on top.`;
    else play = "No ERP or S2P platform on file: start with the Discovery Questions on current process and systems; research the ERP first.";
    if (/strong/i.test(sig)) play = `Active buying signal (${sig.toLowerCase()}): ${play}`;
    return { company: String(a.company_name || ""), status: String(a.icp_status || "").replace("ICP — ", ""), erp, s2p, signal: sig || "—", play, lead: lead(a) };
  });
}

/** Short heading text for the sheet / section, e.g. "Coupa and SAP Ariba". */
export const productsLabel = (d: Detected) => d.products.join(" and ");
