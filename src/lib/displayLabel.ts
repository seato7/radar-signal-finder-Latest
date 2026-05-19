/**
 * Converts snake_case / SCREAMING_SNAKE_CASE database values to Title Case
 * for safe display in the UI. Preserves common acronyms (AI, ETF, etc).
 *
 * Display-layer only — do NOT use to mutate or persist values.
 */
const ACRONYMS = new Set([
  "AI", "API", "ETF", "OTC", "P&L", "SOX", "EU", "US", "UK", "AU",
  "USD", "EUR", "GBP", "AUD", "NASDAQ", "NYSE", "IPO", "SPAC",
  "CEO", "CFO", "AML", "KYC",
]);

export function toDisplayLabel(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => {
      const upper = word.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
