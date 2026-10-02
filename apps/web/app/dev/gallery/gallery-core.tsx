import type { ReactNode } from "react";
import { InjuryBadge } from "../../../components/injury-badge";
import { INJURY_KEYS, injuryInfo } from "../../../components/injury";
import { MatchupGrade } from "../../../components/matchup-grade";
import type { Grade } from "../../../components/grade";
import { PlayerRow } from "../../../components/player-row";
import { PositionBadge } from "../../../components/position-badge";
import { POSITION_KEYS } from "../../../components/position";
import { StatCard } from "../../../components/stat-card";
import { TrendIndicator } from "../../../components/trend-indicator";
import { Card } from "../../../components/ui/card";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby={`g-${title}`}>
      <h2 id={`g-${title}`} className="text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

const GRADES: Grade[] = ["A", "B", "C", "D", "F"];

export function GalleryCore() {
  return (
    <>
      <Section title="PositionBadge">
        <div className="flex flex-wrap gap-2">
          {POSITION_KEYS.map((p) => (
            <PositionBadge key={p} position={p} />
          ))}
          <PositionBadge position="CB" />
          <PositionBadge position={null} />
        </div>
      </Section>
      <Section title="InjuryBadge">
        <div className="flex flex-wrap gap-2">
          {INJURY_KEYS.map((k) => (
            <InjuryBadge key={k} status={injuryInfo(k).full} />
          ))}
          <span className="text-sm text-muted-foreground">Healthy renders nothing:</span>
          <InjuryBadge status={null} />
        </div>
      </Section>
      <Section title="StatCard">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Projected points"
            value="112.4"
            sublabel="vs 104.1 opp"
            delta={{ value: 3.2, label: "vs last week" }}
          />
          <StatCard label="Win chance" value="63%" delta={{ value: -4.5, text: "-4.5 pts" }} />
          <StatCard label="Waiver score" value="78" delta={{ value: 0 }} />
          <StatCard label="Loading" value="" loading />
        </div>
      </Section>
      <Section title="PlayerRow">
        <Card className="p-1">
          <div className="flex flex-col divide-y">
            <PlayerRow
              name="Test Quarterback"
              position="QB"
              team="AAA"
              slot="QB"
              stat="21.4"
              statLabel="proj"
            />
            <PlayerRow
              name="Sample Runner"
              position="RB"
              team="BBB"
              slot="RB"
              injuryStatus="Questionable"
              stat="14.2"
              statLabel="proj"
              highlighted
            />
            <PlayerRow
              name="Placeholder Receiver With A Very Long Hyphenated-Surname Junior III"
              position="WR"
              team="CCC"
              slot="FLEX"
              injuryStatus="Doubtful"
              stat="9.8"
              statLabel="proj"
              href="#"
            />
            <PlayerRow name="No Team Tightend" position="TE" slot="BN" injuryStatus="IR" />
            <PlayerRow name="Fake Kicker" position="K" team="DDD" stat="7.1" />
            <PlayerRow
              name="Sample Defense"
              position="DEF"
              team="EEE"
              injuryStatus="Out"
              stat="8.0"
            />
            <PlayerRow name="Idp Lineman" position="DL" team="FFF" injuryStatus="Suspended" />
            <PlayerRow name="Unknown Position" position={null} team="GGG" injuryStatus="PUP" />
            <PlayerRow name="Not Active Guy" position="LB" team="HHH" injuryStatus="NA" />
          </div>
        </Card>
      </Section>
      <Section title="MatchupGrade">
        <div className="flex flex-wrap gap-2">
          {GRADES.map((g, i) => (
            <MatchupGrade key={g} grade={g} value={`${(5 - i * 2.5).toFixed(1)}`} />
          ))}
          {GRADES.map((g) => (
            <MatchupGrade key={`c${g}`} grade={g} compact />
          ))}
        </div>
      </Section>
      <Section title="TrendIndicator">
        <div className="flex flex-wrap gap-4">
          <TrendIndicator trend="rising" detail="+2.1 pts" />
          <TrendIndicator trend="steady" />
          <TrendIndicator trend="falling" detail="-3.4 pts" />
        </div>
      </Section>
    </>
  );
}
