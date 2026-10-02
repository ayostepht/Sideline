"use client";

import type { LeagueChoice } from "@sideline/shared";
import { Search } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LeagueSwitcher } from "./league-switcher";
import { activeNavKey, NAV_ITEMS } from "../../lib/client/nav";
import { HeaderDetailProvider, useHeaderDetail } from "./header-detail";
import { BottomTabs, SidebarNav } from "./nav-links";
import { WeekSelector } from "./week-selector";

// cmdk and the dialog load on first open, not in the route's initial JS.
const SearchDialog = dynamic(() => import("./search-dialog"), { ssr: false });

interface Props {
  leagueId: string;
  leagueName: string;
  currentWeek: number | null;
  leagues: LeagueChoice[];
  children: ReactNode;
}

/* Bottom tab bar: min-h-14 (3.5rem) plus 1px top border plus safe area; main pads that plus 1.5rem. */
const iconBtn =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-control text-foreground hover:bg-muted";

function pageTitle(pathname: string, leagueId: string): string {
  const base = `/l/${encodeURIComponent(leagueId)}/league/teams/`;
  if (pathname.startsWith(base)) return "League";
  const key = activeNavKey(pathname, leagueId);
  return NAV_ITEMS.find((i) => i.key === key)?.label ?? "";
}

export function AppShell(props: Props) {
  return (
    <HeaderDetailProvider>
      <ShellInner {...props} />
    </HeaderDetailProvider>
  );
}

function ShellInner({ leagueId, leagueName, currentWeek, leagues, children }: Props) {
  const pathname = usePathname();
  const detail = useHeaderDetail();
  const base = pageTitle(pathname, leagueId);
  const title = detail ? `${base} / ${detail}` : base;
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoaded, setSearchLoaded] = useState(false);

  const openSearch = useCallback(() => {
    setSearchLoaded(true);
    setSearchOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSearch]);

  // Move focus to the page content after navigating (not on first load).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only z-[60] rounded-control bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-3 border-r bg-background p-3 lg:flex">
        <LeagueSwitcher
          leagueId={leagueId}
          leagueName={leagueName}
          leagues={leagues}
          variant="popover"
        />
        <button
          type="button"
          onClick={openSearch}
          data-testid="search-trigger-desktop"
          className="flex min-h-11 items-center gap-2 rounded-control border border-input bg-background px-3 text-sm text-muted-foreground hover:bg-muted"
        >
          <Search className="size-4" aria-hidden />
          <span className="flex-1 text-left">Search players</span>
          <kbd className="rounded-control border px-1.5 text-xs">
            <span className="sr-only">Command or Control </span>
            <span aria-hidden>Ctrl K</span>
          </kbd>
        </button>
        <Suspense fallback={null}>
          <SidebarNav leagueId={leagueId} />
        </Suspense>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="mx-auto flex min-h-14 w-full max-w-5xl items-center gap-1 px-2 md:px-8">
            <div className="min-w-0 flex-1 py-1 lg:hidden">
              <LeagueSwitcher
                leagueId={leagueId}
                leagueName={leagueName}
                leagues={leagues}
                variant="sheet"
              />
              {/* Decorative page label under the league name; each page renders its own h1. */}
              <p
                aria-hidden
                data-testid="header-title-mobile"
                className="sl-label -mt-1 truncate px-3 leading-4"
              >
                {title}
              </p>
            </div>
            {/* Decorative label; each page renders its own h1. */}
            <p
              aria-hidden
              data-testid="header-title"
              className="hidden min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground lg:block"
            >
              {title}
            </p>
            <button
              type="button"
              onClick={openSearch}
              aria-label="Search players"
              data-testid="search-trigger-mobile"
              className={`${iconBtn} lg:hidden`}
            >
              <Search className="size-5" aria-hidden />
            </button>
            <Suspense fallback={<div className="h-11 w-40" aria-hidden />}>
              <WeekSelector currentWeek={currentWeek} />
            </Suspense>
          </div>
        </header>

        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className="mx-auto w-full max-w-5xl px-4 pb-[calc(3.5rem+1px+1.5rem+env(safe-area-inset-bottom))] pt-4 outline-none md:px-8 lg:px-8 lg:pb-10 lg:pt-6"
        >
          {children}
        </main>
      </div>

      <Suspense fallback={null}>
        <BottomTabs leagueId={leagueId} />
      </Suspense>

      {searchLoaded ? (
        <SearchDialog leagueId={leagueId} open={searchOpen} onOpenChange={setSearchOpen} />
      ) : null}
    </div>
  );
}
