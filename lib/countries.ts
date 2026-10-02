// Markets Account CoPilot covers. UAE first; the rest follow (see CLAUDE.md).
export const COUNTRIES = [
  { code: "UAE", name: "UAE", flag: "🇦🇪" }, { code: "KSA", name: "Saudi Arabia", flag: "🇸🇦" }, { code: "Qatar", name: "Qatar", flag: "🇶🇦" },
  { code: "Kuwait", name: "Kuwait", flag: "🇰🇼" }, { code: "Oman", name: "Oman", flag: "🇴🇲" }, { code: "Bahrain", name: "Bahrain", flag: "🇧🇭" },
  { code: "Egypt", name: "Egypt", flag: "🇪🇬" }, { code: "USA", name: "USA", flag: "🇺🇸" },
  { code: "UK", name: "United Kingdom", flag: "🇬🇧" }, { code: "Germany", name: "Germany", flag: "🇩🇪" }, { code: "Morocco", name: "Morocco", flag: "🇲🇦" },
  { code: "Kenya", name: "Kenya", flag: "🇰🇪" }, { code: "SouthAfrica", name: "South Africa", flag: "🇿🇦" },
  { code: "Unknown", name: "Unknown", flag: "❓" }, // a country matching no defined region — surfaced here, never silently folded into UAE
] as const;
export const ALL = "All";
export const DEFAULT_COUNTRY = "UAE";

const ALIASES: Record<string, string> = { "united arab emirates": "UAE", uae: "UAE", "u.a.e.": "UAE", ksa: "KSA", "saudi arabia": "KSA", saudi: "KSA",
  qatar: "Qatar", kuwait: "Kuwait", oman: "Oman", egypt: "Egypt", uk: "UK", "united kingdom": "UK", germany: "Germany", morocco: "Morocco", kenya: "Kenya",
  "south africa": "SouthAfrica" };
/** Normalises a company's country value to one of the COUNTRIES codes (unknown values pass through). */
export const countryCode = (v: unknown) => { const s = String(v ?? "").trim(); return ALIASES[s.toLowerCase()] || s || "Unknown"; };
