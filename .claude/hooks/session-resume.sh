#!/bin/sh
# SessionStart hook (matcher: clear|compact). Prints the resume context; Claude Code adds stdout to the new session.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
echo "RESUME CONTEXT (loaded by .claude/hooks/session-resume.sh after /clear or compaction)."
echo "Follow docs/HANDOFF.md section 1. HANDOFF and the Rules in force are below; do not re-read them. When Steph says go, continue with HANDOFF section 4."
echo
echo "== git =="
git branch --show-current
git status --short
git log --oneline -5
echo
echo "== docs/HANDOFF.md =="
cat docs/HANDOFF.md
echo
echo "== docs/DECISIONS.md: Rules in force =="
sed -n '/^## Rules in force/,/^## ADR-000/p' docs/DECISIONS.md | sed '$d'
exit 0
