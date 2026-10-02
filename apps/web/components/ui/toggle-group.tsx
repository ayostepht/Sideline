"use client";

import * as TogglePrimitive from "@radix-ui/react-toggle-group";
import type { ComponentProps } from "react";
import { cn } from "../../lib/client/cn";

export function ToggleGroup({ className, ...props }: ComponentProps<typeof TogglePrimitive.Root>) {
  return (
    <TogglePrimitive.Root
      className={cn("inline-flex max-w-full gap-1 rounded-[8px] bg-muted p-1", className)}
      {...props}
    />
  );
}

export function ToggleGroupItem({
  className,
  ...props
}: ComponentProps<typeof TogglePrimitive.Item>) {
  return (
    <TogglePrimitive.Item
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-[6px] px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm data-[state=on]:ring-2 data-[state=on]:ring-inset data-[state=on]:ring-primary",
        className,
      )}
      {...props}
    />
  );
}
