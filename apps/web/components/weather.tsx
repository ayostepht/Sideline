import type { GameWeather, Reason } from "@sideline/shared";
import { WEATHER_THRESHOLDS } from "@sideline/shared";
import { CloudRain, Info, CloudSnow, Home, Snowflake, Thermometer, Wind } from "lucide-react";
import { cn } from "../lib/client/cn";

export const WEATHER_NOTE = "Weather is for context. It does not change projections.";

export type WeatherKind = "wind" | "rain" | "snow" | "cold";

const KIND_ICON = { wind: Wind, rain: CloudRain, snow: CloudSnow, cold: Thermometer } as const;

export interface WeatherChipData {
  kind: WeatherKind;
  label: string;
}

/** Picks an icon from a lineup WEATHER reason label ("Wind 18 mph", "Rain likely (70%)", ...). */
export function kindFromLabel(label: string): WeatherKind {
  const l = label.toLowerCase();
  if (l.startsWith("wind") || l.startsWith("gust")) return "wind";
  if (l.includes("snow") || l.includes("mixed")) return "snow";
  if (l.includes("rain") || l.includes("precip")) return "rain";
  return "cold";
}

export function weatherChipsFromReasons(reasons: ReadonlyArray<Reason>): WeatherChipData[] {
  return reasons
    .filter((r) => r.code === "WEATHER")
    .map((r) => ({ kind: kindFromLabel(r.label), label: r.label }));
}

/** Chips for flagged parts of a forecast. Nothing for indoors, unavailable, null or clean. */
export function weatherChipsFromWeather(w: GameWeather | null | undefined): WeatherChipData[] {
  if (!w || w.status !== "forecast") return [];
  const out: WeatherChipData[] = [];
  if (w.flags.includes("wind")) {
    if (w.windMph !== null && w.windMph >= WEATHER_THRESHOLDS.windMph) {
      out.push({ kind: "wind", label: `Wind ${Math.round(w.windMph)} mph` });
    }
    if (w.gustMph !== null && w.gustMph >= WEATHER_THRESHOLDS.gustMph) {
      out.push({ kind: "wind", label: `Gusts ${Math.round(w.gustMph)} mph` });
    }
  }
  if (w.flags.includes("precip") && w.precipProbability !== null) {
    const word =
      w.precipType === "snow" ? "Snow" : w.precipType === "mixed" ? "Mixed precip" : "Rain";
    out.push({
      kind: w.precipType === "snow" || w.precipType === "mixed" ? "snow" : "rain",
      label: `${word} likely (${Math.round(w.precipProbability)}%)`,
    });
  }
  if (w.flags.includes("cold") && w.temperatureF !== null) {
    out.push({ kind: "cold", label: `Cold: ${Math.round(w.temperatureF)}°F` });
  }
  return out;
}

export function WeatherChip({ kind, label }: WeatherChipData) {
  const Icon = KIND_ICON[kind];
  return (
    <li
      className="inline-flex max-w-full min-w-0 items-start gap-1 rounded-control border bg-muted px-2 py-1.5 text-[13px] leading-4 text-foreground sm:py-1 sm:text-xs"
      data-testid="weather-chip"
    >
      <Icon className="size-3 shrink-0 translate-y-0.5" aria-hidden />
      <span className="min-w-0 break-words tabular-nums">{label}</span>
    </li>
  );
}

export function WeatherChips({
  chips,
  className,
}: {
  chips: ReadonlyArray<WeatherChipData>;
  className?: string;
}) {
  if (chips.length === 0) return null;
  return (
    <ul
      className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}
      aria-label="Weather"
      data-testid="weather-chips"
    >
      {chips.map((c) => (
        <WeatherChip key={c.label} {...c} />
      ))}
    </ul>
  );
}

function Part({
  flagged,
  icon: Icon,
  children,
}: {
  flagged: boolean;
  icon: typeof Wind;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 tabular-nums",
        flagged && "font-semibold text-foreground",
      )}
    >
      {flagged ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
      {children}
      {flagged ? <span className="sr-only"> (flagged)</span> : null}
    </span>
  );
}

/** Compact forecast line for the player card. Null renders nothing. */
export function WeatherLine({ weather }: { weather: GameWeather | null | undefined }) {
  if (!weather) return null;
  if (weather.status === "indoors") {
    return (
      <p
        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
        data-testid="weather-line"
      >
        <Home className="size-3.5" aria-hidden />
        Indoors
      </p>
    );
  }
  if (weather.status === "unavailable") {
    return (
      <p className="text-xs text-muted-foreground" data-testid="weather-line">
        No forecast
      </p>
    );
  }
  const f = weather.flags;
  const snowy = weather.precipType === "snow" || weather.precipType === "mixed";
  const PrecipIcon = snowy ? CloudSnow : CloudRain;
  const noun =
    weather.precipType === "snow" ? "snow" : weather.precipType === "mixed" ? "mixed" : "rain";
  return (
    <p
      className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground"
      data-testid="weather-line"
    >
      {weather.temperatureF !== null ? (
        <Part flagged={f.includes("cold")} icon={f.includes("cold") ? Snowflake : Thermometer}>
          {Math.round(weather.temperatureF)}°F
        </Part>
      ) : null}
      {weather.windMph !== null ? (
        <Part flagged={f.includes("wind")} icon={Wind}>
          wind {Math.round(weather.windMph)} mph
        </Part>
      ) : null}
      {weather.precipProbability !== null ? (
        <Part flagged={f.includes("precip")} icon={PrecipIcon}>
          {Math.round(weather.precipProbability)}% {noun}
        </Part>
      ) : null}
    </p>
  );
}

/** Zero-JS variant of the explanation (native disclosure) for routes without the popover. */
export function WeatherNote() {
  return (
    <details className="text-xs text-muted-foreground" data-testid="weather-info">
      <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-control px-1 hover:bg-muted">
        <Info className="size-4" aria-hidden />
        About weather
      </summary>
      <p className="px-1 pb-2">{WEATHER_NOTE}</p>
    </details>
  );
}
