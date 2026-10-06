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
# ── Gemini API key (set in ~/.aider-secrets) ────────────────────────────────
source ~/.aider-secrets 2>/dev/null || true

PROJECT=/home/dad/www/tattooshop
VENV=/data/venvs/aider   # venvs consolidated 2026-10-05 (old venvLM path is a symlink here)
OLLAMA=http://127.0.0.1:11434
ARCHITECT=gemini/gemini-2.5-pro
OWN_ARCHITECT=ollama_chat/gemma4:12b  # local fallback when GPU is free

EDITOR_MODEL=ollama_chat/qwen2.5-coder:7b-instruct
# must match num_ctx in ~/.aider.model.settings.yml (a different num_ctx forces a reload)
ARCHITECT_CTX=24576
EDITOR_CTX=16384
KEEP_ALIVE=30m

say()  { printf '\033[1;34m[start_aider]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[start_aider] WARNING:\033[0m %s\n' "$*"; }
shout(){ printf '\033[1;41;37m[start_aider] %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m[start_aider] ERROR:\033[0m %s\n' "$*"; exit 1; }

# our own flag: --branch (everything else goes to aider); --model X changes which architect is pre-warmed
NEWBRANCH=0; ARGS=()
for a in "$@"; do
  case "$a" in
    --branch) NEWBRANCH=1 ;;
    --flash)  ARCHITECT=gemini/gemini-2.5-flash ;;
    *)        ARGS+=("$a") ;;
  esac
done
for ((i=0; i<${#ARGS[@]}; i++)); do
  if [ "${ARGS[$i]}" = "--model" ]; then ARCHITECT="${ARGS[$((i+1))]}"; fi
done
A_NAME=${ARCHITECT#*/}; E_NAME=${EDITOR_MODEL#*/}   # strip the ollama_chat/ prefix
is_local() { [[ "$1" == ollama_chat/* ]] || [[ "$1" == ollama/* ]]; }
# Auto-fallback: if Gemini Pro quota is exhausted, switch to Flash automatically
if [[ "$ARCHITECT" == gemini/gemini-2.5-pro ]]; then
  _qcheck=$(curl -s --max-time 10 \
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"contents":[{"parts":[{"text":"hi"}]}]}' 2>&1)
  if echo "$_qcheck" | grep -qiE 'RESOURCE_EXHAUSTED|"code"[[:space:]]*:[[:space:]]*429|quota'; then
    warn "Gemini Pro quota exhausted — auto-switching to gemini/gemini-2.5-flash"
    ARCHITECT=gemini/gemini-2.5-flash
  fi
  unset _qcheck
fi
# GPU-dynamic selection: if GPU is free, prefer the project's own local model.
# Gemini Pro is used only when GPU VRAM is occupied by something else.
# (Skip if user explicitly passed --flash or --model <something-else>)
if [[ "$ARCHITECT" == gemini/gemini-2.5-pro ]]; then
  _vram_used=$(rocm-smi --showmeminfo vram 2>/dev/null | grep -i "used" | grep -oE "[0-9]+$" | head -1)
  if [ -n "$_vram_used" ] && [ "$_vram_used" -lt $((2000*1048576)) ]; then
    say "GPU is free ($((_vram_used/1048576)) MiB used) → local architect: ${OWN_ARCHITECT#*/}"
    say "  Gemini available in-session: /ask gemini/gemini-2.5-pro \"your question\""
    ARCHITECT="$OWN_ARCHITECT"
  else
    if [ -n "${_vram_used:-}" ]; then
      say "GPU busy ($((_vram_used/1048576)) MiB used) → Gemini Pro architect (no VRAM needed)"
    else
      say "GPU info unavailable → using Gemini Pro architect"
    fi
  fi
  unset _vram_used
fi
# Re-derive model names after all architect-selection logic
A_NAME=${ARCHITECT#*/}; E_NAME=${EDITOR_MODEL#*/}

cd "$PROJECT" || die "cannot cd to $PROJECT"
[ -f "$VENV/bin/activate" ] || die "venv not found at $VENV"
# shellcheck disable=SC1091
source "$VENV/bin/activate"
export OLLAMA_API_BASE="$OLLAMA"

# ---- sanity checks ---------------------------------------------------------------------
python3 -c "import aider" 2>/dev/null || die "venv python3 cannot import aider (run: pip install -U aider-chat)"
curl -sf --max-time 5 "$OLLAMA/api/version" >/dev/null || die "Ollama is not reachable at $OLLAMA (sudo systemctl start ollama)"
if is_local "$ARCHITECT"; then
  for m in "$A_NAME" "$E_NAME"; do
    ollama list 2>/dev/null | awk '{print $1}' | grep -qx "$m" || die "model $m is not pulled (ollama pull $m)"
  done
fi
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
# (skipped when both models are already loaded, e.g. by another aider session: that VRAM is ours)
ps_now=$(ollama ps 2>/dev/null | awk 'NR>1{print $1}' | tr '\n' ' ')
ALREADY=0; case "$ps_now" in *"$A_NAME"*) case "$ps_now" in *"$E_NAME"*) ALREADY=1 ;; esac ;; esac
if [ "$ALREADY" = 0 ] && command -v rocm-smi >/dev/null 2>&1; then
  used=$(rocm-smi --showmeminfo vram 2>/dev/null | grep "Used" | grep -oE "[0-9]+$")
  if [ -n "$used" ] && [ "$used" -gt $((2200*1048576)) ]; then
    warn "$((used/1048576)) MiB of VRAM is already in use by something else."
    warn "Both aider models need ~14.9 GB together; expect Ollama to swap them (slower) until that is freed."
  fi
fi

# -- GPU VRAM pre-flight (unload / wait / continue / abort if tight) --------
source /home/dad/bin/aider-gpu-guard.sh
_guard_models=("$E_NAME"); is_local "$ARCHITECT" && _guard_models+=("$A_NAME")
gpu_guard "$OLLAMA" "${COMFY:-}" "${_guard_models[@]}" || exit 1

# ---- pre-warm both models so the first turn is fast and they stay resident -------------
load() { # model ctx
  curl -s --max-time 180 "$OLLAMA/api/generate" \
    -d "{\"model\":\"$1\",\"options\":{\"num_ctx\":$2},\"keep_alive\":\"$KEEP_ALIVE\"}" >/dev/null
}
say "loading editor    $E_NAME (num_ctx $EDITOR_CTX) ..."; load "$E_NAME" "$EDITOR_CTX"
if is_local "$ARCHITECT"; then
  say "loading architect $A_NAME (num_ctx $ARCHITECT_CTX) ..."; load "$A_NAME" "$ARCHITECT_CTX"
else
  say "architect: ${ARCHITECT} (Gemini API — no VRAM, no pre-warm needed)"
fi
resident=$(ollama ps 2>/dev/null | awk 'NR>1{print $1}' | tr '\n' ' ')
case "$resident" in
  *"$A_NAME"*"$E_NAME"*|*"$E_NAME"*"$A_NAME"*) say "both models resident on the GPU: $resident" ;;
  *) warn "only [$resident] is loaded; Ollama will reload models between architect and editor turns." ;;
esac
say "note: the app itself uses $A_NAME for photo analysis (default context) and unloads it when an AI redraw starts; if you use the app while aider is open, the next aider turn reloads the model (a few seconds)."

START_SHA=$(git rev-parse HEAD 2>/dev/null || echo "")

cleanup() {
  local rc=$?
  say "unloading models to free VRAM ..."
  if is_local "$ARCHITECT"; then
    curl -s --max-time 30 "$OLLAMA/api/generate" -d "{\"model\":\"$A_NAME\",\"keep_alive\":0}" >/dev/null 2>&1
  fi
  curl -s --max-time 30 "$OLLAMA/api/generate" -d "{\"model\":\"$E_NAME\",\"keep_alive\":0}" >/dev/null 2>&1

  local end_sha changed dirty
  end_sha=$(git rev-parse HEAD 2>/dev/null || echo "")
  changed=""
  if [ -n "$START_SHA" ] && [ -n "$end_sha" ] && [ "$end_sha" != "$START_SHA" ]; then
    changed=$(git diff --name-only "$START_SHA" "$end_sha" -- . ':!tests' 2>/dev/null)
  fi
  dirty=$(git status --porcelain 2>/dev/null)
  if [ -n "$changed" ] || [ -n "$dirty" ]; then
    echo
    shout "FILES CHANGED THIS SESSION — remember to deploy:"
    { [ -n "$changed" ] && echo "$changed"; [ -n "$dirty" ] && echo "$dirty" | awk '{print $2}'; } \
      | sort -u | sed 's/^/    /'
    shout "JS/server changes: pm2 restart tattooshop && pm2 logs tattooshop --lines 20"
    [ -n "$dirty" ] && warn "uncommitted changes — review with 'git diff' first."
  else
    say "no files changed this session."
  fi
}
trap cleanup EXIT

# ---- run aider (models, edit formats and context limits come from ~/.aider.* files) ----
say "starting aider in $PROJECT"
aider --read /home/dad/AAAaiderstacks/PORTS.md "${ARGS[@]}"