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
2. Paste a template from `tools/aider/prompts/` (`bugfix.md`, `feature.md`; `review.md` is for `/ask`).
3. Read the architect's plan, answer `y` to apply, then check the diff aider shows.
4. `/test` runs `tools/check.sh`: JavaScript and Python static checks plus a headless-Chrome load of the live page (about 2 seconds, no GPU).
   Aider also lints every file it edits (`tools/lint_js.js` for JavaScript, aider's built-in flake8 for Python).
5. `public/` changes show on a browser reload. `server.js`, `engine.py`, `worker.py` need `pm2 restart tattooshop`.

| Preset | Files | Tokens (aider's counter) |
|---|---|---|
| ctx-markup | public/index.html | 6,506 |
| ctx-css | public/css/app.css | 2,909 |
| ctx-ui-logic | 01-state.js, 02-builders.js | 1,199 + 1,228 |
| ctx-generate | 03-generate.js, 07-app.js | 3,135 + 1,140 |
| ctx-changing-room | 04-changing-room-state.js, 06-changing-room.js | 377 + 2,074 |
| ctx-server | server.js | 5,837 |
| ctx-gpu | gen_worker.py | 3,131 |
| ctx-docs | BUGS.md, TODO.md (read-only) | 573 + 1,483 |

`engine.py` is 12,199 tokens and has no preset: with the rules and the editor's own prompt it leaves almost nothing of the editor's 16,384-token window.
`public/js/05-avatar-draw.js` (10,323 tokens) is in `.aiderignore` for the same reason.

## Why it is set up this way (measured on this machine)
- `public/index.html` was a single 28,806-token file, larger than both the architect (24,576) and editor (16,384) windows, so it was split into
  `index.html` + `css/app.css` + `js/01..07-*.js`. Re-inlining the pieces gives back the original file byte for byte.
- In architect mode the editor model receives the read-only rules and every file in the chat, starts with an empty history, and gets only the
  architect's plan as its message (checked in aider's source). So `CONVENTIONS.md` + `ARCHITECTURE.md` (1,329 tokens together) are kept short, and a prompt
  that touches several files must stay under what 16,384 tokens can hold.
- With both models loaded, VRAM was at 16.72 of 17.16 GB, so the contexts in `~/.aider.model.settings.yml` cannot grow and are left alone.
- `.aider.model.settings.yml` in this folder overrides the architect for this project only, with `think: false`. With thinking on, gemma4:12b used its whole
  4,096-token output budget on self-checks and returned an empty plan. Observed downside of thinking off: for a two-part bug, the plan covered only the first part.
  Give one requirement per prompt, or re-check the diff against your list.

## Things that go wrong
- Aider asks "Add X to the chat?" when the plan mentions a file that is not in the chat. In one test with `--yes-always` that auto-yes re-ran the architect, its
  next reply was no longer a plan, and nothing was edited. Answer `n` unless the plan really needs the file, then `/add` it yourself and ask again.
- The app itself uses gemma4:12b for photo analysis, and an AI redraw unloads it. Using the app while aider is open makes the next aider turn reload the model.
- `public/` is served live from this working tree, so switching git branches changes the live page.

## When the app changes
Keep `ARCHITECTURE.md` true (route list, file roles, flags). Aider is told to trust the code over it, but a stale file wastes tokens in both models.
