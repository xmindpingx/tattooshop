# Managing TattooShop with aider

## Start it
- Desktop icon **Aider Projects**, then **9) tattooshop** (the launcher finds `~/bin/aider-tattooshop` by itself).
- Or run `~/bin/aider-tattooshop` or `./start_aider.sh` in this folder.
- The extra-parameters box (or the command line) accepts any aider flag, plus:
  - `--branch` — work on a new `aider/<timestamp>` git branch
  - `--flash` — use `gemini-2.5-flash` as architect instead of `gemini-2.5-pro` (faster, cheaper)
  - `--no-architect` — gemini-2.5-pro edits directly (needed for large files; see below)
  - `--model ollama_chat/gemma4:12b` — fall back to local Ollama architect if Gemini is unavailable

The script sources `~/.aider-secrets` for the `GEMINI_API_KEY`, loads the editor model into VRAM,
starts aider with this folder's `.aider.conf.yml`, and unloads models when you quit.
For local Ollama architects it also pre-warms the model; for Gemini it skips that step.

## Use it
1. `/load tools/aider/ctx-<name>.load` puts the right small set of files in the chat (list below).
2. Paste a template from `tools/aider/prompts/` (`bugfix.md` for JS/server, `engine-bugfix.md` for Python; `feature.md`; `review.md` is for `/ask`).
3. Read the architect's plan, answer `y` to apply, then check the diff aider shows.
4. `/test` runs `tools/check.sh`: JavaScript and Python static checks plus a headless-Chrome load of the live page (about 2 seconds, no GPU).
   Aider also lints every file it edits (`tools/lint_js.js` for JavaScript, aider's built-in flake8 for Python).
5. `public/` changes show on a browser reload. `server.js`, `engine.py`, `worker.py` need `pm2 restart tattooshop`.

| Preset | Files | Tokens (aider's counter) | Notes |
|---|---|---|---|
| ctx-markup | public/index.html | ~7k | Text tab: Outline + AI Stylized modes; #text-ai-extra panel |
| ctx-css | public/css/app.css | ~2.9k | |
| ctx-ui-logic | 01-state.js, 02-builders.js | ~2.6k | setGoal syncs both goal toggles; setVarCount syncs vc-N + tvc-N |
| ctx-generate | 03-generate.js, 07-app.js | ~4.5k | doAiRedraw reads text-prompt-pos/neg when S.hasTextJob |
| ctx-changing-room | 04-changing-room-state.js, 06-changing-room.js | ~2.5k | |
| ctx-avatar | public/js/05-avatar-draw.js | ~10k | **--no-architect required** — see below; file is in .aiderignore |
| ctx-server | server.js | ~6k | /api/text-job, /api/text-stencil, /api/gen/start, /api/prepare |
| ctx-gpu | gen_worker.py | ~3.2k | control_image() checks stencil.png first (text-AI shortcut) |
| ctx-engine | engine.py | ~12k | **--no-architect required** — see below; cmd_text_job, cmd_text_stencil |
| ctx-docs | BUGS.md, TODO.md (read-only) | ~2k | |

## Editing engine.py (--no-architect)
`engine.py` is ~12k tokens. With the rules and the editor's own prompt, it exceeds the 7B editor's 16k window.
Always edit it without architect mode so the architect edits directly (Gemini has a much larger window):

```bash
aider --no-architect engine.py
# or for a one-shot task:
tools/aider/task.sh engine tools/aider/prompts/engine-bugfix.md
# task.sh detects the '#/no-architect' line in ctx-engine.load and adds the flag automatically
```

Use `tools/aider/prompts/engine-bugfix.md` as the prompt template.

## Editing 05-avatar-draw.js (--no-architect)
`public/js/05-avatar-draw.js` is ~10k tokens and is in `.aiderignore` (the repo map won't include it).
Same constraint as engine.py — must use `--no-architect` and always name the function in WHERE:

```bash
aider --no-architect public/js/05-avatar-draw.js
# or for a one-shot task:
tools/aider/task.sh avatar tools/aider/prompts/bugfix.md
# task.sh detects '#/no-architect' in ctx-avatar.load automatically
```

After editing, a browser reload is enough — no `pm2 restart` needed.

## One-shot tasks (task.sh)
```bash
tools/aider/task.sh <preset> <prompt-file> [extra aider args]
```
Works on a new `aider/task-<time>` branch, runs `tools/check.sh` at the end, prints merge/discard instructions.
Presets with `#/no-architect` in their .load file automatically run with `--no-architect` (ctx-engine and ctx-avatar do this).

## Why it is set up this way (measured on this machine)
- `public/index.html` was a single 28,806-token file, larger than both the architect (24,576) and editor (16,384) windows, so it was split into
  `index.html` + `css/app.css` + `js/01..07-*.js`. Re-inlining the pieces gives back the original file byte for byte.
- In architect mode the editor model receives the read-only rules and every file in the chat, starts with an empty history, and gets only the
  architect's plan as its message (checked in aider's source). So `CONVENTIONS.md` + `ARCHITECTURE.md` (1,329 tokens together) are kept short, and a prompt
  that touches several files must stay under what 16,384 tokens can hold.
- With both models loaded, VRAM was at 16.72 of 17.16 GB, so the contexts in `~/.aider.model.settings.yml` cannot grow and are left alone.
- The default architect is now `gemini/gemini-2.5-pro` (cloud API, no VRAM, larger context than local Ollama).
  The editor is still `ollama_chat/qwen2.5-coder:7b-instruct` on the local GPU.
  Use `--flash` for faster/cheaper edits; use `--model ollama_chat/gemma4:12b` to go fully local.
- `.aider.model.settings.yml` in this folder sets `think: false` for gemma4:12b. For Gemini this setting is ignored.

## Things that go wrong
- Aider asks "Add X to the chat?" when the plan mentions a file that is not in the chat. In one test with `--yes-always` that auto-yes re-ran the architect, its
  next reply was no longer a plan, and nothing was edited. Answer `n` unless the plan really needs the file, then `/add` it yourself and ask again.
- The app itself uses gemma4:12b for photo analysis, and an AI redraw unloads it. Using the app while aider is open and `--model ollama_chat/gemma4:12b` is set
  makes the next aider turn reload the model (not an issue when using Gemini as architect).
- `public/` is served live from this working tree, so switching git branches changes the live page.
- With `--no-architect`, if the edit doesn't apply, check the log for "did not conform" — the model's diff syntax was off. Retry with a shorter prompt or edit by hand.
- `05-avatar-draw.js` is in `.aiderignore` — if aider says it can't find the file, you must `/add public/js/05-avatar-draw.js` manually (or use `ctx-avatar.load`
  which does this). The file won't appear in the repo map even after `/add`.
- Gemini rate-limit errors (429): wait ~60s or switch to `--flash` for the session.

## When the app changes
Keep `ARCHITECTURE.md` true (route list, file roles, API fields, flags). Aider is told to trust the code over it, but a stale file wastes tokens in both models.
