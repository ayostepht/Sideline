"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

const subscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const value = mounted ? (theme ?? "system") : "";
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && setTheme(v)}
      aria-label="Theme"
      data-testid="theme-toggle"
    >
      <ToggleGroupItem value="light" aria-label="Light theme" data-testid="theme-toggle-light">
        <Sun className="size-4" aria-hidden /> <span className="hidden sm:inline">Light</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" aria-label="Dark theme" data-testid="theme-toggle-dark">
        <Moon className="size-4" aria-hidden /> <span className="hidden sm:inline">Dark</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="system" aria-label="System theme" data-testid="theme-toggle-system">
        <Monitor className="size-4" aria-hidden /> <span className="hidden sm:inline">System</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
