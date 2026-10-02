"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentProps } from "react";
import { cn } from "../../lib/client/cn";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "inline-flex max-w-full gap-0.5 overflow-x-auto rounded-control bg-muted p-0.5",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-control px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:ring-1 data-[state=active]:ring-inset data-[state=active]:ring-border",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("mt-3", className)} {...props} />;
}
