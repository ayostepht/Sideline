"use client";

import { HelpCircle, Search } from "lucide-react";
import { ThemeToggle } from "../../../components/theme-toggle";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "../../../components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../../../components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "../../../components/ui/toggle-group";
import { Tooltip } from "../../../components/ui/tooltip";
import { ErrorState } from "../../../components/empty-state";
import { WhySheet } from "../../../components/why-sheet";
import { Section } from "./gallery-core";
import { MANY_REASONS } from "./gallery-data";

export function GalleryClient({
  part,
  open,
}: {
  part: "theme" | "primitives" | "why";
  /** Preopen one overlay for screenshots and axe: "sheet", "dialog" or "why". */
  open?: string | undefined;
}) {
  if (part === "theme") return <ThemeToggle />;
  if (part === "why") {
    return (
      <Section title="WhySheet, ErrorState retry (interactive)">
        <div className="flex flex-wrap items-center gap-3">
          <WhySheet
            defaultOpen={open === "why"}
            title="Why start Sample Runner"
            summary={{ label: "Projected points", value: "14.2" }}
            reasons={MANY_REASONS}
          />
          <ErrorState
            title="Could not load picks"
            detail="Tap retry to try again."
            onRetry={() => undefined}
            className="py-4"
          />
        </div>
      </Section>
    );
  }
  return (
    <>
      <Section title="Button">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" variant="outline" aria-label="Search">
            <Search className="size-4" aria-hidden />
          </Button>
        </div>
      </Section>
      <Section title="Badge">
        <div className="flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          <Badge variant="accent">Accent</Badge>
          <Badge variant="positive">Positive</Badge>
          <Badge variant="negative">Negative</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="info">Info</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </Section>
      <Section title="Card">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>This week</CardTitle>
            <CardDescription>Two lineup changes would add points.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">Card content goes here.</CardContent>
        </Card>
      </Section>
      <Section title="Sheet, Dialog, Popover, Tooltip">
        <div className="flex flex-wrap items-center gap-2">
          <Sheet defaultOpen={open === "sheet"}>
            <SheetTrigger asChild>
              <Button variant="outline" data-testid="gallery-sheet-trigger">
                Open sheet
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Why this pick</SheetTitle>
                <SheetDescription>Bottom sheet on phones, side drawer on desktop.</SheetDescription>
              </SheetHeader>
              <p className="py-2 text-sm">Sheet body.</p>
            </SheetContent>
          </Sheet>
          <Dialog defaultOpen={open === "dialog"}>
            <DialogTrigger asChild>
              <Button variant="outline">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>Sync now?</DialogTitle>
              <DialogDescription>This fetches the latest league data.</DialogDescription>
              <div className="mt-4 flex justify-end">
                <Button>Sync</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">Open popover</Button>
            </PopoverTrigger>
            <PopoverContent>Popover content with a short explanation.</PopoverContent>
          </Popover>
          <Tooltip content="Points above a typical replacement player.">
            <Button variant="ghost" size="icon" aria-label="What is VORP?">
              <HelpCircle className="size-4" aria-hidden />
            </Button>
          </Tooltip>
        </div>
      </Section>
      <Section title="Tabs and ToggleGroup">
        <Tabs defaultValue="mine" className="max-w-full">
          <TabsList>
            <TabsTrigger value="mine">For my team</TabsTrigger>
            <TabsTrigger value="best">Best available</TabsTrigger>
          </TabsList>
          <TabsContent value="mine" className="text-sm">
            Waiver picks for your roster.
          </TabsContent>
          <TabsContent value="best" className="text-sm">
            Top free agents overall.
          </TabsContent>
        </Tabs>
        <ToggleGroup type="single" defaultValue="projected" aria-label="Lineup mode">
          <ToggleGroupItem value="projected">Projected</ToggleGroupItem>
          <ToggleGroupItem value="safe">Safe</ToggleGroupItem>
          <ToggleGroupItem value="upside">Upside</ToggleGroupItem>
        </ToggleGroup>
      </Section>
    </>
  );
}
