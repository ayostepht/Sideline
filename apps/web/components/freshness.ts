/** Relative age text. `now` and `updatedAt` are passed in; no clock access here. */
export function formatAge(updatedAt: string | null, now: Date | number): string {
  if (updatedAt === null) return "Never updated";
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return "Never updated";
  const nowMs = typeof now === "number" ? now : now.getTime();
  const mins = Math.floor(Math.max(0, nowMs - t) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}
