"use client";

import * as TogglePrimitive from "@radix-ui/react-toggle-group";
import type { ComponentProps } from "react";
import { cn } from "../../lib/client/cn";

export function ToggleGroup({ className, ...props }: ComponentProps<typeof TogglePrimitive.Root>) {
  return (
    <TogglePrimitive.Root
      className={cn("inline-flex max-w-full gap-0.5 rounded-control bg-muted p-0.5", className)}
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
        "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground ",
        className,
      )}
      {...props}
    />
  );
}
