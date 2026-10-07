import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Opens an InfoPopover by its testid. The Radix popover code loads after hydration (P7b.14); until
 * then the button is a plain placeholder with no `aria-haspopup`, so a click would do nothing.
 * Waiting for `aria-haspopup` is a real readiness signal, not a sleep. Returns the content locator.
 */
export async function openInfoPopover(
  page: Page,
  trigger: Locator,
  testid: string,
): Promise<Locator> {
  await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
  await trigger.click();
  const content = page.getByTestId(`${testid}-content`);
  await expect(content).toBeVisible();
  return content;
}
