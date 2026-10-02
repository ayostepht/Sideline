/** Relative age text. `now` and `updatedAt` are passed in; no clock access here. */
export function formatAge(updatedAt: string | null, now: Date | number): string {
  if (updatedAt === null) return "Never updated";
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return "Never updated";
  const nowMs = typeof now === "number" ? now : now.getTime();
  const mins = Math.floor(Math.max(0, nowMs - t) / 60_000);
  if (mins < 1) return "just now";
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"} ago`;
  if (mins < 60) return unit(mins, "minute");
  const hours = Math.floor(mins / 60);
  if (hours < 24) return unit(hours, "hour");
  return unit(Math.floor(hours / 24), "day");
}
