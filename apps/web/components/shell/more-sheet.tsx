"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { cn } from "../../lib/client/cn";
import { isNavActive, moreItems, navHref } from "../../lib/client/nav";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "../ui/sheet";
import { NAV_ICONS } from "./nav-icons";

/** Loaded on first tap of More (keeps the Radix dialog out of the initial JS). */
export default function MoreSheet({
  leagueId,
  week,
  pathname,
  trigger,
}: {
  leagueId: string;
  week: number | null;
  pathname: string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom" data-testid="nav-more-sheet" aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>More</SheetTitle>
        </SheetHeader>
        <ul className="mt-2 flex flex-col gap-1">
          {moreItems().map((item) => {
            const active = isNavActive(pathname, leagueId, item);
            const Icon = NAV_ICONS[item.key];
            return (
              <li key={item.key}>
                <Link
                  href={navHref(leagueId, item, week)}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  data-testid={`nav-more-${item.key}`}
                  className={cn(
                    "relative flex min-h-12 items-center gap-2 rounded-control px-3 text-base",
                    active ? "bg-primary font-bold text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
