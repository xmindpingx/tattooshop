# Feature template (paste into aider after /load tools/aider/ctx-<name>.load)

```
FEATURE: <one sentence: what the user can do afterwards>
BEHAVIOUR: <numbered list of exact behaviours, defaults, and limits (ranges, max lengths)>
WHERE: <files in the chat and the functions/elements to extend; name anything that must stay unchanged>
DATA: <new fields on S, new element ids, new request fields; say which already exist>
CONSTRAINTS: smallest change, no new dependencies, follow the existing style, update every caller if a name changes.
DONE WHEN: <command that must pass> and <how to try it in the browser>
```

Rules of thumb (measured on this setup, see tools/aider/README.md):
- Keep the files in the chat under about 8k tokens in total. The 7B editor has a 16k window and already
  spends ~1.3k on the rules plus its own prompt. If a feature needs markup AND logic, add index.html plus
  ONE js file, not two.
- Split big features into steps that each touch one or two files, and run /test between them.
- A feature that adds both a UI control and a server field is two steps: server first, then UI.
