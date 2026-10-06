#!/bin/bash
# Start aider for /home/dad/www/tattooshop with the local Ollama models, tuned for this machine
# (AMD RX 6800 16 GB VRAM, 15 GB RAM). Same models and pre-warm logic as ~/wwwhotel/start_aider.sh.
#   ./start_aider.sh                                  # normal: architect + editor
#   ./start_aider.sh --no-architect                   # single model (gemma4:12b edits directly, 24k-token window)
#   ./start_aider.sh --model ollama_chat/gemma4:e4b   # smaller/faster architect
#   ./start_aider.sh --branch                         # work on a fresh aider/<timestamp> git branch (not passed to aider)
# Inside aider:  /load tools/aider/ctx-<name>.load   then paste a template from tools/aider/prompts/
#                /test  runs tools/check.sh          see tools/aider/README.md
#
# What it does: activates the venv, checks Ollama/models/eslint, warns about anything else holding the
# GPU, pre-loads BOTH models into VRAM (editor first, then architect, so they stay resident together),
# runs aider, and unloads the models on exit so the GPU is free for the app's own AI redraw.
set -uo pipefail

PROJECT=/home/dad/www/tattooshop
VENV=/home/dad/ai-stacks/stacks/venvLM
OLLAMA=http://127.0.0.1:11434
ARCHITECT=ollama_chat/gemma4:12b
EDITOR_MODEL=ollama_chat/qwen2.5-coder:7b-instruct
# must match num_ctx in ~/.aider.model.settings.yml (a different num_ctx forces a reload)
ARCHITECT_CTX=24576
EDITOR_CTX=16384
KEEP_ALIVE=30m

say()  { printf '\033[1;34m[start_aider]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[start_aider] WARNING:\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[start_aider] ERROR:\033[0m %s\n' "$*"; exit 1; }

# our own flag: --branch (everything else goes to aider); --model X changes which architect is pre-warmed
NEWBRANCH=0; ARGS=()
for a in "$@"; do if [ "$a" = "--branch" ]; then NEWBRANCH=1; else ARGS+=("$a"); fi; done
for ((i=0; i<${#ARGS[@]}; i++)); do
  if [ "${ARGS[$i]}" = "--model" ]; then ARCHITECT="${ARGS[$((i+1))]}"; fi
done
A_NAME=${ARCHITECT#*/}; E_NAME=${EDITOR_MODEL#*/}   # strip the ollama_chat/ prefix

cd "$PROJECT" || die "cannot cd to $PROJECT"
[ -f "$VENV/bin/activate" ] || die "venv not found at $VENV"
# shellcheck disable=SC1091
source "$VENV/bin/activate"
export OLLAMA_API_BASE="$OLLAMA"

# ---- sanity checks ---------------------------------------------------------------------
python3 -c "import aider" 2>/dev/null || die "venv python3 cannot import aider (run: pip install -U aider-chat)"
curl -sf --max-time 5 "$OLLAMA/api/version" >/dev/null || die "Ollama is not reachable at $OLLAMA (sudo systemctl start ollama)"
for m in "$A_NAME" "$E_NAME"; do
  ollama list 2>/dev/null | awk '{print $1}' | grep -qx "$m" || die "model $m is not pulled (ollama pull $m)"
done
[ -f .devtools/node_modules/eslint/package.json ] || warn "ESLint is missing, so the JavaScript lint only checks syntax. Fix: (cd .devtools && npm install eslint@8)"
if [ -f .git/index.lock ] && ! pgrep -x git >/dev/null 2>&1; then
  warn ".git/index.lock exists and no git process is running (stale lock). Removing it."
  rm -f .git/index.lock
fi

# ---- this is the LIVE site: say what state we are in ------------------------------------
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ "$NEWBRANCH" = 1 ]; then
  BRANCH="aider/$(date +%Y%m%d-%H%M%S)"
  git checkout -q -b "$BRANCH" || die "could not create branch $BRANCH"
fi
say "git branch: $BRANCH  (public/ files are served live from this working tree; server.js/engine.py need: pm2 restart tattooshop)"
dirty=$(git status --short 2>/dev/null | grep -v '^??' | wc -l)
[ "$dirty" -gt 0 ] && warn "$dirty tracked file(s) have uncommitted changes; aider commits its own edits separately (dirty-commits)."

# ---- GPU contention --------------------------------------------------------------------
if pgrep -f "gen_worker.py" >/dev/null 2>&1; then
  warn "gen_worker.py (the app's SDXL image generator) is running and holds VRAM. It exits by itself ~8 min after the last AI redraw; until then the aider models will not both fit."
fi
if command -v rocm-smi >/dev/null 2>&1; then
  used=$(rocm-smi --showmeminfo vram 2>/dev/null | grep "Used" | grep -oE "[0-9]+$")
  if [ -n "$used" ] && [ "$used" -gt $((2200*1048576)) ]; then
    warn "$((used/1048576)) MiB of VRAM is already in use by something else."
    warn "Both aider models need ~14.9 GB together; expect Ollama to swap them (slower) until that is freed."
  fi
fi

# ---- pre-warm both models so the first turn is fast and they stay resident -------------
load() { # model ctx
  curl -s --max-time 180 "$OLLAMA/api/generate" \
    -d "{\"model\":\"$1\",\"options\":{\"num_ctx\":$2},\"keep_alive\":\"$KEEP_ALIVE\"}" >/dev/null
}
say "loading editor    $E_NAME (num_ctx $EDITOR_CTX) ..."; load "$E_NAME" "$EDITOR_CTX"
say "loading architect $A_NAME (num_ctx $ARCHITECT_CTX) ..."; load "$A_NAME" "$ARCHITECT_CTX"
resident=$(ollama ps 2>/dev/null | awk 'NR>1{print $1}' | tr '\n' ' ')
case "$resident" in
  *"$A_NAME"*"$E_NAME"*|*"$E_NAME"*"$A_NAME"*) say "both models resident on the GPU: $resident" ;;
  *) warn "only [$resident] is loaded; Ollama will reload models between architect and editor turns." ;;
esac
say "note: the app itself uses $A_NAME for photo analysis (default context) and unloads it when an AI redraw starts; if you use the app while aider is open, the next aider turn reloads the model (a few seconds)."

cleanup() {
  say "unloading models to free VRAM ..."
  curl -s --max-time 30 "$OLLAMA/api/generate" -d "{\"model\":\"$A_NAME\",\"keep_alive\":0}" >/dev/null
  curl -s --max-time 30 "$OLLAMA/api/generate" -d "{\"model\":\"$E_NAME\",\"keep_alive\":0}" >/dev/null
}
trap cleanup EXIT

# ---- run aider (models, edit formats and context limits come from ~/.aider.* files) ----
say "starting aider in $PROJECT"
aider "${ARGS[@]}"
