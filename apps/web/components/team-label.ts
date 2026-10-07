/** Team subline text: "FA" for free agents, nothing for team defenses. */
export function teamLabel(
  position: string | null | undefined,
  team: string | null | undefined,
): string | null {
  if (position === "DEF") return null;
  return team ? team : "FA";
}
