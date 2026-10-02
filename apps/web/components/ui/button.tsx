import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "../../lib/client/cn";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[8px] text-sm font-medium transition-colors duration-150 active:brightness-95 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:ring-1 disabled:ring-inset disabled:ring-border disabled:hover:bg-muted disabled:hover:opacity-100 disabled:active:brightness-100",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:opacity-90 active:opacity-80",
        secondary: "bg-muted text-foreground hover:bg-border active:bg-border",
        outline: "border border-input bg-card text-foreground hover:bg-muted",
        ghost: "px-3 text-foreground hover:bg-muted active:bg-border",
        link: "px-1 text-primary underline underline-offset-4 hover:decoration-2 active:opacity-80",
      },
      size: {
        sm: "min-h-11 px-3",
        md: "min-h-11 px-4",
        lg: "min-h-12 px-6 text-base",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ className, variant, size, asChild, ref, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
