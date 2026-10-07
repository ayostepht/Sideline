# UX review: fix/news-ids, player card Next opponents (2026-10-07)

Reviewer: ux-reviewer. Screens: `.screens/l-1000000000000000001-players-4046/{390,768,1280}-{light,dark}.png` (fresh build at f3b9399). The fixture showed a graded state: Wk 5 Bye, then B, F, D. Empty and ungraded states were judged from source.

VERDICT: PASS (no Blocker or Major)

- [m1] The info button is 24px. That passes WCAG 2.5.8 but misses the project's 44px rule, and its tooltip repeats the visible explainer. Fix: plain text with an aria-hidden icon.
- [m2] At 1280 the chip is pushed about 600px from the opponent by `ml-auto`. Fix: place the chip after the opponent, or cap the width.
- [n1] "pts/g" is unexplained shorthand. Fix: "pts per game".
- [n2] The explainer sits above the list (three lines at 390). Fix: move it below as a footnote.
- [n3] `pl-14`/`w-12` hand coupling. Fix: a grid.

Checked OK: MATCH-4 (letter, label and icon, plus the number), same `MatchupGrade` as Lineup, grades consistent with ranks, no horizontal scroll at 390, no em dashes, "Player ID links" label consistent.

Disposition: m1, m2, n1 and n2 go to frontend-engineer (OPP-3). n3 is optional.
