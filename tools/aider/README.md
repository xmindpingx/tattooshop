# Managing TattooShop with aider

## Start it
- Desktop icon **Aider Projects**, then **9) tattooshop** (the launcher finds `~/bin/aider-tattooshop` by itself).
- Or run `~/bin/aider-tattooshop` or `./start_aider.sh` in this folder.
- The extra-parameters box (or the command line) accepts any aider flag, plus `--branch` (work on a new `aider/<timestamp>` git branch).
  Useful: `--no-architect` (gemma4:12b edits directly with its 24k window), `--model ollama_chat/gemma4:e4b` (smaller architect).

The script checks Ollama and the models, loads both models into VRAM so they stay resident together, starts aider with this
folder's `.aider.conf.yml`, and unloads the models when you quit.

## Use it
1. `/load tools/aider/ctx-<name>.load` puts the right small set of files in the chat (list below).
2. Paste a template from `tools/aider/prompts/` (`bugfix.md` for JS/server, `engine-bugfix.md` for Python; `feature.md`; `review.md` is for `/ask`).
3. Read the architect's plan, answer `y` to apply, then check the diff aider shows.
4. `/test` runs `tools/check.sh`: JavaScript and Python static checks plus a headless-Chrome load of the live page (about 2 seconds, no GPU).
   Aider also lints every file it edits (`tools/lint_js.js` for JavaScript, aider's built-in flake8 for Python).
5. `public/` changes show on a browser reload. `server.js`, `engine.py`, `worker.py` need `pm2 restart tattooshop`.

| Preset | Files | Tokens (aider's counter) | Notes |
|---|---|---|---|
| ctx-markup | public/index.html | ~6.5k | |
| ctx-css | public/css/app.css | ~2.9k | |
| ctx-ui-logic | 01-state.js, 02-builders.js | ~2.4k | |
| ctx-generate | 03-generate.js, 07-app.js | ~4.3k | |
| ctx-changing-room | 04-changing-room-state.js, 06-changing-room.js | ~2.5k | |
| ctx-server | server.js | ~5.8k | |
| ctx-gpu | gen_worker.py | ~3.1k | |
| ctx-engine | engine.py | ~12k | **--no-architect required** — see below |
| ctx-docs | BUGS.md, TODO.md (read-only) | ~2k | |

`public/js/05-avatar-draw.js` (~10k tokens) is in `.aiderignore` — see that file for the workaround.

## Editing engine.py (--no-architect)
`engine.py` is ~12k tokens. With the rules and the editor's own prompt, it exceeds the 7B editor's 16k window.
Always edit it without architect mode so gemma4:12b (24k window) edits directly:

```bash
aider --no-architect engine.py
# or for a one-shot task:
tools/aider/task.sh engine tools/aider/prompts/engine-bugfix.md
# task.sh detects the '#/no-architect' line in ctx-engine.load and adds the flag automatically
```

Use `tools/aider/prompts/engine-bugfix.md` as the prompt template (shorter than bugfix.md — the 24k window fills up fast).

## One-shot tasks (task.sh)
```bash
tools/aider/task.sh <preset> <prompt-file> [extra aider args]
```
Works on a new `aider/task-<time>` branch, runs `tools/check.sh` at the end, prints merge/discard instructions.
Presets with `#/no-architect` in their .load file automatically run with `--no-architect` (ctx-engine does this).

## Why it is set up this way (measured on this machine)
- `public/index.html` was a single 28,806-token file, larger than both the architect (24,576) and editor (16,384) windows, so it was split into
  `index.html` + `css/app.css` + `js/01..07-*.js`. Re-inlining the pieces gives back the original file byte for byte.
- In architect mode the editor model receives the read-only rules and every file in the chat, starts with an empty history, and gets only the
  architect's plan as its message (checked in aider's source). So `CONVENTIONS.md` + `ARCHITECTURE.md` (1,329 tokens together) are kept short, and a prompt
  that touches several files must stay under what 16,384 tokens can hold.
- With both models loaded, VRAM was at 16.72 of 17.16 GB, so the contexts in `~/.aider.model.settings.yml` cannot grow and are left alone.
- `.aider.model.settings.yml` in this folder overrides the architect for this project only, with `think: false`. With thinking on, gemma4:12b used its whole
  4,096-token output budget on self-checks and returned an empty plan. Raising the budget to 8,192 did not help: it used all 8.2k tokens and again returned
  an empty answer (tested on the same prompt). Observed downside of thinking off: for a two-part bug, the plan covered only the first part and wrongly said the
  second part was already handled. Giving each requirement its own prompt worked: the route and the `.catch` guard for `/api/gen/cancel` were two prompts of
  about 1 minute each, and both edits were correct. Always read the diff against your list.

## Things that go wrong
- Aider asks "Add X to the chat?" when the plan mentions a file that is not in the chat. In one test with `--yes-always` that auto-yes re-ran the architect, its
  next reply was no longer a plan, and nothing was edited. Answer `n` unless the plan really needs the file, then `/add` it yourself and ask again.
- The app itself uses gemma4:12b for photo analysis, and an AI redraw unloads it. Using the app while aider is open makes the next aider turn reload the model.
- `public/` is served live from this working tree, so switching git branches changes the live page.
- With `--no-architect`, if the edit doesn't apply, check the log for "did not conform" — the model's diff syntax was off. Retry with a shorter prompt or edit by hand.

## When the app changes
Keep `ARCHITECTURE.md` true (route list, file roles, API fields, flags). Aider is told to trust the code over it, but a stale file wastes tokens in both models.
