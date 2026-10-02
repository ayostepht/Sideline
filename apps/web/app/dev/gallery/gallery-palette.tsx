import { Section } from "./gallery-core";

interface Swatch {
  token: string;
  light: string;
  dark: string;
  role: string;
  /** Text color token used on this swatch. */
  on: string;
}

const SWATCHES: Swatch[] = [
  { token: "background", light: "#FFFFFF", dark: "#2A2A2A", role: "Page ground", on: "foreground" },
  { token: "foreground", light: "#2A2A2A", dark: "#FFFFFF", role: "Text", on: "background" },
  { token: "card", light: "#FFFFFF", dark: "#333333", role: "Card surface", on: "foreground" },
  { token: "muted", light: "#F2F2F2", dark: "#3A3A3A", role: "Second surface", on: "foreground" },
  { token: "border", light: "#D9D9D9", dark: "#4A4A4A", role: "Thin dividers", on: "foreground" },
  {
    token: "muted-foreground",
    light: "#5A5A5A",
    dark: "#D9D9D9",
    role: "Muted text",
    on: "background",
  },
  {
    token: "primary",
    light: "#D5FC51",
    dark: "#D5FC51",
    role: "Lime fill: active, primary button",
    on: "primary-foreground",
  },
  {
    token: "accent-soft",
    light: "#F1FDC4",
    dark: "#3F4A1A",
    role: "Your team highlight",
    on: "accent-soft-foreground",
  },
  {
    token: "link",
    light: "#2147E8",
    dark: "#8FA8FF",
    role: "Electric blue: links, info, focus (light)",
    on: "background",
  },
  {
    token: "highlight",
    light: "#DF00FE",
    dark: "#DF00FE",
    role: "Neon purple: secondary accent, non-text only",
    on: "highlight-foreground",
  },
  { token: "positive", light: "#166534", dark: "#6EE7A0", role: "Gain", on: "background" },
  { token: "negative", light: "#B91C1C", dark: "#FF8A8A", role: "Error, injury", on: "background" },
  { token: "warning", light: "#8A4B08", dark: "#FBBF24", role: "Warning", on: "background" },
];

export function GalleryPalette() {
  return (
    <Section title="Palette">
      <ul
        className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
        data-testid="gallery-palette"
      >
        {SWATCHES.map((s) => (
          <li key={s.token} className="overflow-hidden rounded-card border">
            <div
              className="flex h-14 items-end px-2 pb-1 text-sm font-bold"
              style={{ background: `var(--${s.token})`, color: `var(--${s.on})` }}
            >
              Aa 123
            </div>
            <div className="p-2 text-xs">
              <p className="font-bold">{s.token}</p>
              <p className="text-muted-foreground">{s.role}</p>
              <p className="tabular-nums text-muted-foreground">
                Light {s.light} / Dark {s.dark}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
