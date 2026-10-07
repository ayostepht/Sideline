"use client";

import { InfoPopover } from "../../../../../components/info-popover";

/** Tap-to-open info button (popover), used for fairness and best-lineup explanations. */
export function InfoTip({ label, text, testid }: { label: string; text: string; testid?: string }) {
  return <InfoPopover label={label} text={text} {...(testid ? { testid } : {})} />;
}
