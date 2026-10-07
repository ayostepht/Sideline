"use client";

import type { TradeEvaluateResponse } from "@sideline/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { PositionBadge } from "../../../../../components/position-badge";
import { Button } from "../../../../../components/ui/button";
import { apiJson } from "../../../../../lib/client/api";
import { AnalyzerErrorView, AnalyzerResult } from "./analyzer-result";
import {
  buildEvaluateUrl,
  buildTradesQuery,
  resultAnnouncement,
  toggleId,
  TRADE_MAX_PER_SIDE,
  type TradeSelection,
} from "./format";

export interface AnalyzerPlayer {
  playerId: string;
  name: string;
  position: string | null;
  nflTeam: string | null;
  /** Roster slot; IR and taxi players are marked but stay selectable. */
  slot: "starter" | "bench" | "ir" | "taxi";
}

export interface AnalyzerTeam {
  rosterId: number;
  teamName: string;
  isMine: boolean;
  players: AnalyzerPlayer[];
}

const SLOT_NOTE: Partial<Record<AnalyzerPlayer["slot"], string>> = { ir: "IR", taxi: "Taxi" };

export function PlayerPicker({
  legend,
  players,
  selected,
  onToggle,
  testid,
}: {
  legend: string;
  players: readonly AnalyzerPlayer[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  testid: string;
}) {
  const full = selected.length >= TRADE_MAX_PER_SIDE;
  return (
    <fieldset className="min-w-0" data-testid={testid}>
      <legend className="text-sm font-semibold">
        {legend}{" "}
        <span className="font-normal text-muted-foreground tabular-nums">
          ({selected.length} of {TRADE_MAX_PER_SIDE})
        </span>
      </legend>
      {players.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">No players on this roster.</p>
      ) : (
        <ul className="mt-1 max-h-80 overflow-y-auto rounded-control border">
          {players.map((p) => {
            const checked = selected.includes(p.playerId);
            const disabled = full && !checked;
            const note = SLOT_NOTE[p.slot];
            return (
              <li key={p.playerId} className="border-b last:border-b-0">
                <label
                  className={`flex min-h-11 cursor-pointer items-center gap-2 px-3 py-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring ${disabled ? "opacity-50" : "hover:bg-muted"}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onToggle(p.playerId)}
                    className="size-5 shrink-0 accent-[var(--primary)]"
                    data-testid="analyzer-player"
                    data-player-id={p.playerId}
                  />
                  <PositionBadge position={p.position} />
                  <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                  {p.nflTeam ? (
                    <span className="shrink-0 text-xs text-muted-foreground">{p.nflTeam}</span>
                  ) : null}
                  {note ? (
                    <span className="shrink-0 rounded-control border px-1.5 text-xs text-muted-foreground">
                      {note}
                    </span>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}

export function Analyzer({
  leagueId,
  teams,
  initial,
}: {
  leagueId: string;
  teams: readonly AnalyzerTeam[];
  initial: TradeSelection;
}) {
  const mine = teams.find((t) => t.isMine) ?? null;
  const others = teams.filter((t) => !t.isMine);
  const validInitialOther =
    initial.other !== null && others.some((t) => t.rosterId === initial.other)
      ? initial.other
      : null;
  const [other, setOther] = useState<number | null>(validInitialOther);
  const [give, setGive] = useState<string[]>(() =>
    initial.give.filter((id) => mine?.players.some((p) => p.playerId === id)),
  );
  const [get, setGet] = useState<string[]>(() => {
    const t = others.find((x) => x.rosterId === validInitialOther);
    return initial.get.filter((id) => t?.players.some((p) => p.playerId === id));
  });
  const [result, setResult] = useState<TradeEvaluateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [announce, setAnnounce] = useState("");
  const seq = useRef(0);

  const theirTeam = others.find((t) => t.rosterId === other) ?? null;
  const selection: TradeSelection = { other, give, get };
  const url = buildEvaluateUrl(leagueId, selection);

  const mirror = (next: TradeSelection) => {
    const q = buildTradesQuery("analyzer", next);
    window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
  };
  const change = (next: TradeSelection) => {
    seq.current += 1;
    setLoading(false);
    setResult(null);
    setError(null);
    setAnnounce("");
    mirror(next);
  };

  const evaluate = useCallback(async (target: string) => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    setAnnounce("Evaluating trade.");
    const res = await apiJson(target, "TradeEvaluateResponseSchema");
    if (id !== seq.current) return;
    setLoading(false);
    if (res.ok) {
      setResult(res.data);
      setAnnounce(resultAnnouncement(res.data.fairness, res.data.mine, res.data.theirs));
    } else {
      setResult(null);
      setError(res.message);
      setAnnounce(`Could not evaluate the trade. ${res.message}`);
    }
  }, []);

  // Open with a full selection in the URL: evaluate once on arrival.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    if (url !== null && initial.give.length > 0) void evaluate(url);
    // Runs once on mount by design.
  }, []);

  if (mine === null) return null;

  return (
    <div className="flex flex-col gap-4" data-testid="analyzer">
      <div className="flex flex-col gap-1">
        <label htmlFor="analyzer-team-select" className="text-sm font-semibold">
          Trade with
        </label>
        <select
          id="analyzer-team-select"
          data-testid="analyzer-team-select"
          value={other === null ? "" : String(other)}
          onChange={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            setOther(v);
            setGet([]);
            change({ other: v, give, get: [] });
          }}
          className="min-h-11 w-full max-w-sm rounded-control border bg-card px-3 text-sm"
        >
          <option value="">Choose a team</option>
          {others.map((t) => (
            <option key={t.rosterId} value={String(t.rosterId)}>
              {t.teamName}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PlayerPicker
          legend="You give"
          players={mine.players}
          selected={give}
          testid="analyzer-give"
          onToggle={(id) => {
            const next = toggleId(give, id, TRADE_MAX_PER_SIDE);
            setGive(next);
            change({ other, give: next, get });
          }}
        />
        {theirTeam ? (
          <PlayerPicker
            legend="You get"
            players={theirTeam.players}
            selected={get}
            testid="analyzer-get"
            onToggle={(id) => {
              const next = toggleId(get, id, TRADE_MAX_PER_SIDE);
              setGet(next);
              change({ other, give, get: next });
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="analyzer-pick-team">
            Choose a team to see their players.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={url === null || loading}
          onClick={() => {
            if (url !== null) void evaluate(url);
          }}
          data-testid="analyzer-evaluate"
        >
          {loading ? "Evaluating..." : "Evaluate trade"}
        </Button>
        {url === null ? (
          <p className="text-sm text-muted-foreground">
            Pick a team, then 1 to {TRADE_MAX_PER_SIDE} players on each side.
          </p>
        ) : null}
      </div>

      <div role="status" aria-live="polite" className="sr-only" data-testid="analyzer-live">
        {announce}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2" aria-hidden data-testid="analyzer-loading">
          <div className="sl-skeleton h-8 w-48" />
          <div className="sl-skeleton h-28 w-full" />
          <div className="sl-skeleton h-28 w-full" />
        </div>
      ) : null}

      {error !== null ? (
        <AnalyzerErrorView
          message={error}
          onRetry={url !== null ? () => void evaluate(url) : undefined}
        />
      ) : null}

      {result !== null && !loading ? (
        <AnalyzerResult result={result} theirTeamName={theirTeam?.teamName ?? "Their team"} />
      ) : null}
    </div>
  );
}
