import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { setTheme, type Theme } from "./theme";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

/**
 * Runs axe with WCAG 2.1 A and AA rules and fails on any serious or critical violation
 * (PLAN.md 6.6, UI2). Minor and moderate findings are not failures. Pass `theme` to emulate
 * light or dark before scanning. `include` limits the scan to a selector.
 */
export async function expectNoSeriousA11yViolations(
  page: Page,
  options: { theme?: Theme; include?: string } = {},
): Promise<void> {
  if (options.theme) await setTheme(page, options.theme);
  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  if (options.include) builder = builder.include(options.include);
  const results = await builder.analyze();
  const blocking = results.violations.filter((v) => v.impact && BLOCKING_IMPACTS.has(v.impact));
  const summary = blocking
    .map((v) => {
      const targets = v.nodes
        .slice(0, 5)
        .map((n) => `      - ${n.target.join(" ")}`)
        .join("\n");
      return `  [${v.impact ?? "unknown"}] ${v.id}: ${v.help} (${v.nodes.length} nodes)\n${targets}\n      ${v.helpUrl}`;
    })
    .join("\n");
  const where = `${page.url()}${options.theme ? ` (${options.theme})` : ""}`;
  expect(
    blocking.length,
    `axe found ${blocking.length} serious/critical violation(s) on ${where}:\n${summary}`,
  ).toBe(0);
}
