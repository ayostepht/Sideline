"use client";

import { HelpCircle } from "lucide-react";
import { useId, useState } from "react";
import { WhyBody, type WhySheetProps } from "./why-sheet";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";

/** Radix-backed sheet. Loaded by `WhySheet` after hydration. */
export default function WhySheetImpl({
  title,
  summary,
  reasons,
  trigger,
  open,
  onOpenChange,
  defaultOpen,
}: WhySheetProps) {
  const [inner, setInner] = useState(defaultOpen ?? false);
  const descId = useId();
  const isOpen = open ?? inner;
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(o) => {
        setInner(o);
        onOpenChange?.(o);
      }}
    >
      <SheetTrigger asChild>
        {trigger ?? (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 gap-1 px-2"
            data-testid="why-trigger"
          >
            <HelpCircle className="size-4" aria-hidden />
            Why?
          </Button>
        )}
      </SheetTrigger>
      <SheetContent aria-describedby={descId} data-testid="why-sheet">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription id={descId}>The numbers behind this pick.</SheetDescription>
        </SheetHeader>
        <WhyBody summary={summary} reasons={reasons} />
      </SheetContent>
    </Sheet>
  );
}
