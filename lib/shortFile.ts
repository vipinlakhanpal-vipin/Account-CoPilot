/** A file name as its first two words (without .xlsx / .xls); the full name belongs in a hover title. */
export const shortFile = (name: unknown): string => {
  const base = String(name ?? "").replace(/\.(xlsx|xls)$/i, "").trim(), words = base.split(/[\s_]+/).filter(Boolean);
  return words.length > 2 ? `${words.slice(0, 2).join(" ")}…` : base;
};
