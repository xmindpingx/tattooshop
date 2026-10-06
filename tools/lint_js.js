#!/usr/bin/env node
// Static check for the browser scripts (public/js/*.js) and server.js.
//   node tools/lint_js.js [file ...]      (no files = check everything)
// Used by aider as its JavaScript lint-cmd (see .aider.conf.yml) and by tools/check.sh.
//
// Why a custom wrapper: the browser files are classic <script> tags that share one global scope,
// so a per-file lint would flag every cross-file function as "not defined". Instead all of
// public/js/*.js are linted as ONE combined program (the way the browser runs them) and each
// finding is mapped back to its real file:line. Only syntax errors, undefined names, duplicate
// top-level declarations and a few other real-bug rules are enabled -- no style rules.
//
// Needs eslint@8 in .devtools/ (cd .devtools && npm install eslint@8). Without it, falls back to a
// syntax-only check.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const want = process.argv.slice(2).map(f => path.relative(root, path.resolve(process.cwd(), f)));
const jsDir = path.join(root, 'public/js');
const browserFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort().map(f => 'public/js/' + f);
const show = f => want.length === 0 || want.includes(f);

const RULES = {
  'no-undef': 'error', 'no-redeclare': 'error', 'no-const-assign': 'error', 'no-dupe-keys': 'error',
  'no-dupe-args': 'error', 'no-func-assign': 'error', 'no-import-assign': 'error', 'no-self-assign': 'error',
  'no-unreachable': 'error', 'no-unsafe-negation': 'error', 'use-isnan': 'error', 'valid-typeof': 'error',
  'no-dupe-else-if': 'error', 'no-unused-labels': 'error', 'no-cond-assign': 'error'
};

let ESLint = null;
try { ({ ESLint } = require(path.join(root, '.devtools/node_modules/eslint'))); } catch (_) { /* fall back below */ }

const problems = [];
const add = (file, line, col, sev, msg, rule) => problems.push({ file, line, col, sev, msg, rule });

function syntaxOnly(file, text) {
  try { new vm.Script(text, { filename: file }); }
  catch (e) {
    const m = /:(\d+)/.exec(String(e.stack || '')); add(file, m ? +m[1] : 1, 1, 'error', 'SyntaxError: ' + e.message, 'syntax');
  }
}

async function run() {
  // ---- browser files: one combined program, findings mapped back to file:line ----
  const parts = [];
  let combined = '', offset = 0;
  for (const f of browserFiles) {
    let t = fs.readFileSync(path.join(root, f), 'utf8');
    if (!t.endsWith('\n')) t += '\n';
    const n = t.split('\n').length - 1;
    parts.push({ file: f, from: offset + 1, to: offset + n });
    offset += n;
    combined += t;
  }
  const mapBack = line => parts.find(p => line >= p.from && line <= p.to) || parts[parts.length - 1];

  // ---- server.js (node) ----
  const serverText = fs.existsSync(path.join(root, 'server.js')) ? fs.readFileSync(path.join(root, 'server.js'), 'utf8') : null;

  if (ESLint) {
    const mk = env => new ESLint({
      useEslintrc: false,
      overrideConfig: { root: true, env, parserOptions: { ecmaVersion: 2022, sourceType: 'script' }, rules: RULES }
    });
    const b = await mk({ browser: true, es2022: true }).lintText(combined, { filePath: path.join(root, 'public/js/__combined__.js') });
    for (const m of b[0].messages) {
      const p = mapBack(m.line || 1);
      add(p.file, (m.line || 1) - p.from + 1, m.column || 1, m.severity === 2 ? 'error' : 'warning', m.message, m.ruleId || 'parse');
    }
    if (serverText !== null) {
      const s = await mk({ node: true, es2022: true }).lintText(serverText, { filePath: path.join(root, 'server.js') });
      for (const m of s[0].messages) add('server.js', m.line || 1, m.column || 1, m.severity === 2 ? 'error' : 'warning', m.message, m.ruleId || 'parse');
    }
  } else {
    console.error('lint_js: eslint not installed in .devtools/ -- syntax check only (cd .devtools && npm install eslint@8)');
    for (const p of parts) syntaxOnly(p.file, fs.readFileSync(path.join(root, p.file), 'utf8'));
    if (serverText !== null) syntaxOnly('server.js', serverText);
  }

  const shown = problems.filter(p => show(p.file));
  for (const p of shown) console.log(`${p.file}:${p.line}:${p.col}: ${p.sev}: ${p.msg} [${p.rule}]`);
  process.exit(shown.some(p => p.sev === 'error') ? 1 : 0);
}
run().catch(e => { console.error('lint_js crashed:', e.message); process.exit(2); });
