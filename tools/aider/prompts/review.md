# Review / question template (use with /ask, which changes nothing)

Use `/ask` for anything where you want an answer, not an edit. Nothing is written to disk in ask mode.

```
/ask Review <file or function> for <what to look for: race conditions, missing error handling, unclamped
inputs, a function used but never defined>. For each problem give: the line or function, what goes wrong with a
concrete input, and the smallest fix. If you are not sure something is a bug, say so. Do not edit anything.
```

Then, to apply one finding, switch back with `/code` or `/architect` and paste a bugfix.md prompt that quotes
the finding.

Other useful /ask prompts:
- `/ask Which function sends <request> and where is the response handled?` (the repo map helps)
- `/ask List every place that reads S.<field>.`
- `/ask Does <change> break any caller? Check index.html onclick handlers too.`
