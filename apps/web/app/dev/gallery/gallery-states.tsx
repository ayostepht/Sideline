import { Inbox, Search } from "lucide-react";
import type { ReactNode } from "react";
import { DataFreshness } from "../../../components/data-freshness";
import { EmptyState, ErrorState } from "../../../components/empty-state";
import { ReasonChips } from "../../../components/reason-chips";
import {
  CardSkeleton,
  PlayerRowSkeleton,
  StatCardSkeleton,
  TableSkeleton,
} from "../../../components/skeletons";
import { Sparkline } from "../../../components/sparkline";
import { StaleBanner } from "../../../components/stale-banner";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { WhyBody } from "../../../components/why-sheet";
import { Section } from "./gallery-core";
import { ago, FEW_REASONS, GALLERY_NOW, MANY_REASONS } from "./gallery-data";

export function GalleryStates() {
  return (
    <>
      <Section title="ReasonChips">
        <div className="flex flex-col gap-3">
          <ReasonChips
            reasons={[]}
            trailing={
              <span className="text-xs text-muted-foreground">
                No reasons: renders only the trailing slot
              </span>
            }
          />
          <ReasonChips reasons={FEW_REASONS} />
          <ReasonChips reasons={MANY_REASONS} />
          <ReasonChips reasons={MANY_REASONS} max={3} />
        </div>
      </Section>
      <Section title="WhySheet (static open preview)">
        <Card className="max-w-md p-4" data-testid="gallery-why-static">
          <h3 className="text-xl font-semibold">Why start Sample Runner</h3>
          <WhyBody summary={{ label: "Projected points", value: "14.2" }} reasons={MANY_REASONS} />
        </Card>
      </Section>
      <Section title="Sparkline">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <SparkExample name="Normal">
            <Sparkline
              label="Points by week, rising"
              values={[8, 11, 9, 14, 17]}
              labels={["Wk 1", "Wk 2", "Wk 3", "Wk 4", "Wk 5"]}
              reference={11}
              referenceLabel="Season average"
            />
          </SparkExample>
          <SparkExample name="Gaps">
            <Sparkline label="Points by week with a bye" values={[12, 9, null, 15, 10]} />
          </SparkExample>
          <SparkExample name="Flat">
            <Sparkline label="Flat scoring" values={[7, 7, 7, 7]} />
          </SparkExample>
          <SparkExample name="Single point">
            <Sparkline label="One game played" values={[12]} />
          </SparkExample>
          <SparkExample name="Empty">
            <Sparkline label="No games yet" values={[]} />
          </SparkExample>
        </div>
      </Section>
      <Section title="DataFreshness and StaleBanner">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <DataFreshness freshness={{ updatedAt: ago(0), stale: false }} now={GALLERY_NOW} />
            <DataFreshness freshness={{ updatedAt: ago(12), stale: false }} now={GALLERY_NOW} />
            <DataFreshness freshness={{ updatedAt: ago(180), stale: true }} now={GALLERY_NOW} />
            <DataFreshness freshness={{ updatedAt: null, stale: true }} now={GALLERY_NOW} />
          </div>
          <StaleBanner
            freshness={{ updatedAt: ago(180), stale: true }}
            now={GALLERY_NOW}
            action={
              <Button size="sm" variant="outline">
                Sync now
              </Button>
            }
          />
          <StaleBanner freshness={{ updatedAt: null, stale: true }} now={GALLERY_NOW} />
          <p className="text-sm text-muted-foreground">A fresh result renders no banner.</p>
          <StaleBanner freshness={{ updatedAt: ago(5), stale: false }} now={GALLERY_NOW} />
        </div>
      </Section>
      <Section title="EmptyState and ErrorState">
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <EmptyState
              title="No waiver picks yet"
              message="Picks show up once the season starts and your league has synced."
              action={
                <Button variant="outline" size="sm">
                  Open settings
                </Button>
              }
            />
          </Card>
          <Card>
            <EmptyState icon={Search} title="Nothing matches" message="Try clearing a filter." />
          </Card>
          <Card>
            <ErrorState
              title="Could not load your roster"
              detail="The server did not respond. Check that it is running."
              retryHref="#"
            />
          </Card>
          <Card>
            <EmptyState
              icon={Inbox}
              title="Preseason"
              message="Projections start after the NFL schedule is set."
            />
          </Card>
        </div>
      </Section>
      <Section title="Skeletons">
        <div className="grid gap-3 lg:grid-cols-2">
          <CardSkeleton />
          <div className="grid grid-cols-2 gap-3">
            <StatCardSkeleton />
            <StatCardSkeleton />
          </div>
          <Card className="p-1">
            <PlayerRowSkeleton count={4} />
          </Card>
          <Card className="p-4">
            <TableSkeleton rows={5} cols={4} />
          </Card>
        </div>
      </Section>
    </>
  );
}

function SparkExample({ name, children }: { name: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="text-xs text-muted-foreground">{name}</figcaption>
      {children}
    </figure>
  );
}
