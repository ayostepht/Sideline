"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../../lib/client/cn";
import { DialogOverlay } from "./dialog";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

const sheetVariants = cva(
  "fixed z-50 flex flex-col gap-2 border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-card-foreground sl-anim-sheet",
  {
    variants: {
      side: {
        // bottom sheet under 1024px, right drawer from 1024px
        responsive:
          "inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-card border-b-0 lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[440px] lg:rounded-none lg:border-y-0 lg:border-r-0",
        bottom: "inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-card border-b-0",
        right: "inset-y-0 right-0 w-[min(440px,100vw)] overflow-y-auto border-y-0 border-r-0",
      },
    },
    defaultVariants: { side: "responsive" },
  },
);

export function SheetContent({
  className,
  side,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & VariantProps<typeof sheetVariants>) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content className={cn(sheetVariants({ side }), className)} {...props}>
        {side !== "right" ? (
          <span
            aria-hidden
            className={cn(
              "mx-auto -mt-1 mb-1 h-1 w-8 shrink-0 bg-muted-foreground/40",
              side === undefined || side === "responsive" ? "lg:hidden" : "",
            )}
          />
        ) : null}
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute right-2 top-2 inline-flex size-11 items-center justify-center rounded-control text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" aria-hidden />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 pr-12", className)} {...props} />;
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-xl font-semibold", className)} {...props} />;
}

export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
