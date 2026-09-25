// Markets Account CoPilot covers. UAE first; the rest follow (see CLAUDE.md).
export const COUNTRIES = [
  { code: "UAE", name: "UAE", flag: "🇦🇪" }, { code: "KSA", name: "Saudi Arabia", flag: "🇸🇦" }, { code: "Qatar", name: "Qatar", flag: "🇶🇦" },
  { code: "Kuwait", name: "Kuwait", flag: "🇰🇼" }, { code: "Oman", name: "Oman", flag: "🇴🇲" }, { code: "Egypt", name: "Egypt", flag: "🇪🇬" },
] as const;
export const ALL = "All";
export const DEFAULT_COUNTRY = "UAE";

const ALIASES: Record<string, string> = { "united arab emirates": "UAE", uae: "UAE", "u.a.e.": "UAE", ksa: "KSA", "saudi arabia": "KSA", saudi: "KSA",
  qatar: "Qatar", kuwait: "Kuwait", oman: "Oman", egypt: "Egypt" };
/** Normalises a company's country value to one of the COUNTRIES codes (unknown values pass through). */
export const countryCode = (v: unknown) => { const s = String(v ?? "").trim(); return ALIASES[s.toLowerCase()] || s || "Unknown"; };
