"use client";

import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { lazy, Suspense, useState } from "react";
import {
  isNavActive,
  moreItems,
  navHref,
  primaryItems,
  NAV_ITEMS,
  type NavItem,
} from "../../lib/client/nav";
import { cn } from "../../lib/client/cn";
import { NAV_ICONS } from "./nav-icons";
import { useExplicitWeek } from "./use-week";

const MoreSheet = lazy(() => import("./more-sheet"));

interface Props {
  leagueId: string;
}

export function SidebarNav({ leagueId }: Props) {
  const pathname = usePathname();
  const week = useExplicitWeek();
  return (
    <nav aria-label="Main" data-testid="nav-sidebar" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = isNavActive(pathname, leagueId, item);
        const Icon = NAV_ICONS[item.key];
        return (
          <Link
            key={item.key}
            href={navHref(leagueId, item, week)}
            aria-current={active ? "page" : undefined}
            data-testid={`nav-link-${item.key}`}
            className={cn(
              "relative flex min-h-11 items-center gap-2 rounded-control px-3 text-sm transition-colors",
              active
                ? "bg-primary font-bold text-primary-foreground"
                : "text-foreground hover:bg-muted",
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Tab({
  item,
  leagueId,
  week,
  pathname,
}: {
  item: NavItem;
  leagueId: string;
  week: number | null;
  pathname: string;
}) {
  const active = isNavActive(pathname, leagueId, item);
  const Icon = NAV_ICONS[item.key];
  return (
    <Link
      href={navHref(leagueId, item, week)}
      aria-current={active ? "page" : undefined}
      data-testid={`nav-tab-${item.key}`}
      className={tabClass(active)}
    >
      <TabInner active={active} icon={<Icon className="size-5" aria-hidden />} label={item.label} />
    </Link>
  );
}

const tabClass = (active: boolean) =>
  cn(
    "relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs",
    active ? "font-bold text-foreground" : "text-muted-foreground",
  );

function TabInner({
  active,
  icon,
  label,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <>
      {active ? (
        <span aria-hidden className="absolute inset-x-5 top-0 h-[3px] bg-highlight" />
      ) : null}
      <span
        className={cn(
          "flex h-7 w-12 items-center justify-center rounded-control",
          active ? "bg-primary text-primary-foreground" : "",
        )}
      >
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </>
  );
}

export function BottomTabs({ leagueId }: Props) {
  const pathname = usePathname();
  const week = useExplicitWeek();
  const [armed, setArmed] = useState(false);
  const more = moreItems();
  const moreActive = more.some((i) => isNavActive(pathname, leagueId, i));
  const moreTrigger = (
    <button
      type="button"
      onClick={() => setArmed(true)}
      aria-haspopup="dialog"
      aria-current={moreActive ? "page" : undefined}
      data-testid="nav-tab-more"
      className={tabClass(moreActive)}
    >
      <TabInner
        active={moreActive}
        icon={<Ellipsis className="size-5" aria-hidden />}
        label="More"
      />
    </button>
  );
  return (
    <nav
      aria-label="Primary"
      data-testid="nav-bottom-tabs"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="mx-auto flex w-full max-w-md px-2">
        {primaryItems().map((item) => (
          <Tab key={item.key} item={item} leagueId={leagueId} week={week} pathname={pathname} />
        ))}
        {armed ? (
          <Suspense fallback={moreTrigger}>
            <MoreSheet leagueId={leagueId} week={week} pathname={pathname} trigger={moreTrigger} />
          </Suspense>
        ) : (
          moreTrigger
        )}
      </div>
    </nav>
  );
}
