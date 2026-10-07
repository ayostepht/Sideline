/** Whole number with thousands separators ("59,800"). Non-finite values read as an en dash. */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return "–";
  return Math.round(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
