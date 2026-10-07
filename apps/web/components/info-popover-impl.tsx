"use client";

import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { InfoButton } from "./info-popover";

/** Radix-backed popover. Loaded after hydration so its code stays out of the route's first load. */
export default function InfoPopoverImpl({
  label,
  text,
  testid,
}: {
  label: string;
  text: string;
  testid?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <InfoButton label={label} testid={testid} />
      </PopoverTrigger>
      <PopoverContent data-testid={testid ? `${testid}-content` : undefined}>{text}</PopoverContent>
    </Popover>
  );
}
