# UX review: fix/news-usage, player card News (2026-10-07)

Reviewer: ux-reviewer. Source review only. `pnpm screens` ran, but the seeded fixtures have no `player_news` rows, so no "Latest" block could render. The standalone build also predated 3601c36.

VERDICT: CHANGES REQUIRED (one Major)

## Findings
- **[M1] Major**: `news-section.tsx` LatestNote uses `rounded-lg border bg-card p-3` inside a Section that is already `rounded-card border bg-card p-3`. That is a card inside a card with a double border. `rounded-lg` also breaks ADR-011 (corners at most 4px, `--radius-card`), and it loses about 12px per side at 390px. Fix: no border, radius or background. Use `border-l-2 border-foreground pl-3` (or `sl-mark`), make the "Latest" label `sl-label`, and put a `border-b pb-2` divider before the list.
- **[m1] Minor**: The toggle's `focus-visible:outline-2 outline-offset-2` has no color and may override the global ring (globals.css:159). Fix: remove those classes and use the global ring.
- **[m2] Minor**: "Read on ESPN" sits under RotoWire notes, and the same link text repeats in the block and the list. Fix: a more specific label and sr-only context (headline).
- **[m3] Minor**: The Show more toggle is gated by a 240-char count, but the clamp depends on width. The toggle can do nothing on desktop, or text can be hidden with no toggle on mobile. Fix: measure overflow (scrollHeight against clientHeight, re-check on resize).
- **[n1] Nit**: The headline and the analysis have the same weight. Fix: make the headline `font-semibold`.
- **[n2] Nit**: The footer source text changes between players. Consider fixed text.

## Verified from source
Real button with aria-expanded/controls, `min-h-11`, sr-only "opens in new tab", `break-words`, no hex colors.

## Disposition
M1, m1, m2, m3 and n1 go to frontend-engineer (NEWS-UI-2). Seeding news fixtures for screens and a11y goes to devops-engineer (NEWS-SEED), followed by a re-review. n2: footer fixed to "News from ESPN and RotoWire" whenever any note is present (keep as is).
