/**
 * Remembers the element that opened the player pop-up so focus can go back to it on close.
 * Safari does not focus links on click, so Radix's own "previously focused" element is the body.
 */
let trigger: HTMLElement | null = null;

export function rememberTrigger(el: HTMLElement | null): void {
  trigger = el;
}

/** Focus the remembered trigger if it is still in the page. Returns whether it did. */
export function restoreTriggerFocus(): boolean {
  const el = trigger;
  trigger = null;
  if (el === null || !el.isConnected) return false;
  el.focus({ preventScroll: true });
  return true;
}
