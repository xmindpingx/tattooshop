# Conventions for aider in tattooshop

You maintain a small production web app that is live right now. ARCHITECTURE.md (loaded automatically) describes it; if the code disagrees with it, trust the code and say so.

## Hard limits: never do these without the user's explicit confirmation
- Never read, print, or edit `.env` or any credentials. Never touch `node_modules/`, `.devtools/`, `venv/`, `venv-gen/`, `models/`, `jobs/`, `output/`, `uploads/`.
- Never delete files or run `rm`, `kill`, `pm2 delete|stop`, `git reset|clean|push --force`. Never add npm/pip dependencies.
- Never start `gen_worker.py` or an SDXL generation to "test": the GPU is full of the aider models.
- Stencil output is pure black on white for a thermal printer: no grey, gradients or anti-aliased soft edges.

## Editing rules
- Smallest change that solves the task. Edit only files that are in the chat; if another file is needed, say which one and ask the user to /add it.
- Never rewrite or reformat a whole file. Never write "// ... rest unchanged".
- Match the existing style: 2-space indent, single quotes, semicolons, function declarations, plain JS (no frameworks, no modules, no build step).
- Names are shared: a function used from index.html `onclick` or from another js file is public. If you rename or remove one, update every use.
- Do not invent names. Every function you call and every `S.xxx` field you read must already exist in the chat or the repo map; if unsure, ask.
- Request functions follow one pattern: return early if the in-flight flag is set, set it, clear it on success AND error.
- server.js: wrap async routes with `wrap()`, clamp inputs with `rng`/`numIn`/`clip`, answer errors as `{error}` with a status code.
- Python: `engine.cmd_*` receive keyword args from server.js. A new command also needs a server.js route that calls `worker.call('<name>', {...})`.
- engine.py is ~12k tokens — it exceeds the editor model's window. If you are asked to edit it, say: "engine.py requires --no-architect mode; run: aider --no-architect engine.py" and stop. Do not attempt the edit in architect mode.
- public/js/05-avatar-draw.js is ~10k tokens and is in .aiderignore (not in the repo map). If you are asked to edit it, say: "05-avatar-draw.js requires --no-architect mode and an explicit /add; run: aider --no-architect public/js/05-avatar-draw.js" and stop. Do not attempt the edit in architect mode.

## When you finish
1. Say in one line what changed and how the user can see it.
2. Say what to reload or restart: files in `public/` need only a browser reload; `server.js`, `engine.py`, `worker.py` need `pm2 restart tattooshop`.
3. Suggest `/test` (runs tools/check.sh). Do not claim something works unless it was run.
