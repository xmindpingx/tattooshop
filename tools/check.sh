#!/bin/bash
# Fast project check -- no GPU, no model loading, a few seconds. Aider's /test runs this (see .aider.conf.yml).
#   tools/check.sh          everything
# Exit 0 = all good, 1 = something to fix (output says what and where).
cd "$(dirname "$0")/.." || exit 2
ROOT=$PWD
PORT=${PORT:-3030}
rc=0
hdr() { printf '\n== %s ==\n' "$1"; }

hdr "JavaScript: syntax, undefined names, duplicate declarations (public/js/*.js + server.js)"
node tools/lint_js.js && echo "ok" || rc=1

hdr "Python: syntax + undefined names (engine.py gen_worker.py worker.py)"
PYBIN=venv/bin/python; [ -x "$PYBIN" ] || PYBIN=python3
FLAKE8=/home/dad/ai-stacks/stacks/venvLM/bin/flake8; command -v flake8 >/dev/null 2>&1 && FLAKE8=$(command -v flake8)
"$PYBIN" -m py_compile engine.py gen_worker.py worker.py && echo "py_compile ok" || rc=1
if [ -x "$FLAKE8" ]; then
  "$FLAKE8" --isolated --select=E9,F63,F7,F82 engine.py gen_worker.py worker.py && echo "flake8 (syntax + undefined names) ok" || rc=1
else
  echo "flake8 not found -- skipped undefined-name check"
fi

hdr "Browser smoke test: load the page in headless Chrome, fail on console errors, confirm init() ran"
CHROME=$(command -v google-chrome || command -v chromium || command -v chromium-browser)
if [ -z "$CHROME" ]; then
  echo "SKIPPED: no Chrome/Chromium found"
elif ! curl -sf --max-time 5 "http://127.0.0.1:$PORT/api/health" >/dev/null; then
  echo "SKIPPED: the app is not answering on port $PORT (pm2 restart tattooshop)"
else
  TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
  timeout 60 "$CHROME" --headless=new --no-sandbox --disable-gpu --user-data-dir="$TMP/profile" \
      --virtual-time-budget=8000 --enable-logging=stderr --v=0 --dump-dom "http://127.0.0.1:$PORT/" \
      >"$TMP/dom.html" 2>"$TMP/log.txt"
  errs=$(grep -a "CONSOLE" "$TMP/log.txt" | grep -aiE "uncaught|error|failed to load|404" | sed 's/^.*CONSOLE:/console:/' | head -10)
  if [ -n "$errs" ]; then echo "$errs"; echo "FAIL: the page logged errors"; rc=1
  elif ! grep -aq 'id="font-grid"><div class="font-cat-label"' "$TMP/dom.html"; then
    echo "FAIL: init() did not build the font grid (the page script probably stopped early)"; rc=1
  else echo "ok (no console errors, UI built)"; fi
fi

echo
[ $rc -eq 0 ] && echo "ALL CHECKS PASSED" || echo "CHECKS FAILED"
exit $rc
