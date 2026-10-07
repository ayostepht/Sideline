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

/** Number of mounted player pop-ups (the loading state and the loaded one are separate instances). */
let mountedModals = 0;

/** Called by PlayerModal on mount (true) and unmount (false). */
export function trackModalMount(mounted: boolean): void {
  mountedModals = Math.max(0, mountedModals + (mounted ? 1 : -1));
}

export function isModalMounted(): boolean {
  return mountedModals > 0;
}

/** Forget the remembered trigger (the user left for another page). */
export function clearTrigger(): void {
  trigger = null;
}

/**
 * Whether the shell should skip moving focus to main after a route change. Skip only when the
 * pop-up is opening or staying open (a player path with a pop-up mounted), or closing back to the
 * page underneath it (the trigger restore wins). Leaving for a different page, or leaving a
 * full-page player view, still moves focus.
 */
export function shouldSkipFocusMove(opts: {
  nextIsPlayerPath: boolean;
  modalMountedNow: boolean;
  modalWasMounted: boolean;
  /** The destination is the page that was underneath the pop-up (or that page is unknown). */
  nextIsUnderlyingPage: boolean;
}): boolean {
  if (opts.nextIsPlayerPath) return opts.modalMountedNow;
  return opts.modalWasMounted && opts.nextIsUnderlyingPage;
}
