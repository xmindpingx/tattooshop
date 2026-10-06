# Bug fix template (paste into aider after /load tools/aider/ctx-<name>.load)

Fill every line. Short and concrete beats long. The files named in WHERE must already be in the chat.

```
BUG: <what the user sees, one or two sentences. Include any error text exactly.>
WHERE: <file and function names, and the helpers that already exist there that the fix should use>
EXPECTED: <what should happen instead, including the awkward case (cancelled, empty, error, double click)>
CONSTRAINTS: smallest change, only <file(s)>, follow the existing style.
DONE WHEN: <command that must pass, e.g. node tools/lint_js.js server.js> and <what to look at in the browser/API>
```

Why this shape: the architect (Gemini or gemma4:12b) plans from the text and the repo map, and the 7B editor
sees only the architect's plan plus the files in the chat. Naming the helpers and the edge case in the prompt is
what keeps both from inventing names or fixing only the happy path. Fixed bugs worth keeping go in BUGS.md.
