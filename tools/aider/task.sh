#!/bin/bash
# One-shot, non-interactive aider run for a single small task.
#   tools/aider/task.sh <preset> <prompt-file> [extra aider args]
# <preset> is the name in tools/aider/ctx-<preset>.load (server, generate, ui-logic, css, markup, engine, avatar, ...).
# The preset's "/add" files become editable files, "/read-only" files become read-only; a "#/no-architect" line
# in the preset forces --no-architect (required for engine.py and 05-avatar-draw.js which exceed the editor model's
# 16k window); then the prompt file is sent as the one message.  Work happens on a new branch aider/task-<time>,
# then tools/check.sh runs; if checks fail the branch is kept but clearly marked FAILED.
# Write ONE requirement per prompt file, in the BUG / WHERE / EXPECTED / CONSTRAINTS / DONE WHEN form
# (see tools/aider/prompts/bugfix.md or engine-bugfix.md for Python). Mention no file paths in the prompt:
# with --yes-always aider would auto-add any file the plan mentions, which derails the small editor model.
set -u
cd "$(dirname "$0")/../.." || exit 1
PRESET="${1:-}"; PROMPT="${2:-}"; [ $# -ge 2 ] && shift 2
LOAD="tools/aider/ctx-$PRESET.load"
[ -f "$LOAD" ] && [ -f "$PROMPT" ] || { echo "usage: $0 <preset> <prompt-file> [aider args]   (presets: $(ls tools/aider | sed -n 's/^ctx-\(.*\)\.load$/\1/p' | tr '\n' ' '))"; exit 2; }
VENV=/home/dad/ai-stacks/stacks/venvLM
[ -f "$VENV/bin/activate" ] || { echo "venv not found at $VENV"; exit 1; }
. "$VENV/bin/activate"
pgrep -f '[a]ider ' >/dev/null && echo "note: another aider process is running (VRAM is shared)" >&2

# Stash any uncommitted tracked changes so they don't ride onto the task branch
STASHED=0
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "note: stashing uncommitted changes before creating task branch"
  git stash push -u -m "task.sh auto-stash $(date +%H:%M:%S)" && STASHED=1
fi

FILES=()
NO_ARCHITECT=false
while read -r cmd arg; do
  case "$cmd" in
    /add)          FILES+=("$arg") ;;
    /read-only)    FILES+=(--read "$arg") ;;
    '#/no-architect') NO_ARCHITECT=true ;;
  esac
done < "$LOAD"
[ ${#FILES[@]} -gt 0 ] || { echo "preset $PRESET has no /add lines"; [ $STASHED -eq 1 ] && git stash pop; exit 2; }

BR="aider/task-$(date +%Y%m%d-%H%M%S)"
git checkout -q -b "$BR" || { [ $STASHED -eq 1 ] && git stash pop; exit 1; }

# Restore stash onto task branch so aider can see in-progress work if the user chose to stash
[ $STASHED -eq 1 ] && git stash pop

LOG="/tmp/aider-task-$(date +%H%M%S).log"
echo "branch $BR, log $LOG"
ARCH_FLAG=()
$NO_ARCHITECT && ARCH_FLAG=(--no-architect) && echo "note: --no-architect (gemma4:12b edits directly, 24k window)"
timeout 900 aider "${ARCH_FLAG[@]}" "${FILES[@]}" --yes-always --no-pretty --no-stream --message-file "$PROMPT" "$@" > "$LOG" 2>&1
RC=$?
echo "aider exit $RC"

N=$(git rev-list --count main.."$BR")
if [ "$N" -eq 0 ]; then
  echo "RESULT: NO COMMITS. aider changed nothing (exit code 0 does not mean success)."
  grep -q "did not conform\|failed to match" "$LOG" && echo "  the editor model's edit did not apply (see $LOG); try a smaller prompt or make the edit by hand"
  git checkout -q main && git branch -d "$BR" >/dev/null && echo "  empty branch $BR removed"
  exit 1
fi

git --no-pager log --oneline main.."$BR"
git --no-pager diff --stat main.."$BR"

CHECK_OUT=$(tools/check.sh 2>&1)
CHECK_RC=$?
echo "$CHECK_OUT" | tail -5
if [ $CHECK_RC -ne 0 ]; then
  echo ""
  echo "RESULT: CHECK FAILED (tools/check.sh exit $CHECK_RC) — branch $BR kept for inspection."
  echo "  review:  git diff main..$BR"
  echo "  fix:     edit, then: git add -A && git commit -m 'fix'"
  echo "  discard: git checkout main && git branch -D $BR"
  exit 1
fi

echo "review:  git diff main..$BR     merge:  git checkout main && git merge --ff-only $BR     discard:  git checkout main && git branch -D $BR"
