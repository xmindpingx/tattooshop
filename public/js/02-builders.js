/* ── Build font grid ───────────────────────────────────────────────── */
function buildFontGrid() {
  const grid = document.getElementById('font-grid');
  if (!grid) return;
  let html = '';
  const cats = ['bold','gothic','script','fineline'];
  cats.forEach(cat => {
    const label = {bold:'Bold/Display',gothic:'Gothic/Medieval',script:'Script/Cursive',fineline:'Fineline/Mono'}[cat];
    html += `<div class="font-cat-label">${label}</div>`;
    FONTS.filter(f => f.cat === cat).forEach(f => {
      const active = f.name === S.selectedFont ? ' on' : '';
      html += `<div class="font-card${active}" style="font-family:'${f.name}',sans-serif"
        onclick="selectFont('${f.name}')" title="${f.name}">${f.name}</div>`;
    });
  });
  grid.innerHTML = html;
}

function selectFont(name) {
  S.selectedFont = name;
  document.querySelectorAll('.font-card').forEach(c => {
    c.classList.toggle('on', c.title === name);
  });
  const prev = document.getElementById('text-preview');
  if (prev) prev.style.fontFamily = `'${name}', sans-serif`;
}

/* ── Build chip banks ──────────────────────────────────────────────── */
function buildChips(arr, containerId, stateSet, promptId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = arr.map(c =>
    `<button class="chip" onclick="toggleChip(this,'${c.replace(/'/g,"\\'")}','${containerId}','${promptId}')">${c}</button>`
  ).join('');
}

function toggleChip(btn, chip, containerId, promptId) {
  const set = containerId.includes('ai') ? S.activeAiChips : S.activeChips;
  if (set.has(chip)) { set.delete(chip); btn.classList.remove('on'); }
  else { set.add(chip); btn.classList.add('on'); }
  syncPromptFromChips(set, promptId);
}

function syncPromptFromChips(set, promptId) {
  const ta = document.getElementById(promptId);
  if (!ta) return;
  const base = ta.dataset.base || '';
  const chips = [...set].join(', ');
  ta.value = chips ? (base ? base + ', ' + chips : chips) : base;
}

/* ── AI settings sync ──────────────────────────────────────────────── */
function updateAi(el, key, factor) {
  const v = parseFloat(el.value) * (factor || 1);
  S[key] = v;
  document.querySelectorAll(`[data-ai="${key}"]`).forEach(x => {
    if (x !== el) x.value = el.value;
    const lbl = document.getElementById(`lbl-${key}-${x.closest('[id]')?.id || ''}`);
    if (lbl) lbl.textContent = el.value;
  });
  const disp = document.getElementById('lbl-' + key);
  if (disp) disp.textContent = el.value;
}

function setVarCount(n) {
  S.aiCount = n;
  const cfg = document.getElementById('cfg-count');
  if (cfg) cfg.value = n;
  const sl = document.getElementById('sl-count');
  if (sl) { sl.value = n; const sv = document.getElementById('sv-count'); if (sv) sv.textContent = n; }
  for (let i = 1; i <= 4; i++) {
    const b = document.getElementById('vc-' + i);
    if (b) b.classList.toggle('on', i === n);
    const tb = document.getElementById('tvc-' + i);
    if (tb) tb.classList.toggle('on', i === n);
  }
}

function onLoraChange(val) {
  S.aiLora = val;
  document.querySelectorAll('[data-ai="lora"]').forEach(x => { if (x !== event.target) x.value = val; });
}

function syncAiUi() {
  ['aiModel','aiLora','aiLoraW','aiCfg','aiCnScale','aiSteps','aiCount'].forEach(k => {
    document.querySelectorAll(`[data-ai="${k}"]`).forEach(el => { el.value = S[k]; });
  });
}

function onTextInput() {}

/* ── Photo sliders ─────────────────────────────────────────────────── */
function onSlider(el, key) {
  S[key] = parseFloat(el.value);
  const sv = document.getElementById('sv-' + key);
  if (sv) sv.textContent = el.value;
}

const PHOTO_PRESETS = {
  portrait: {detail:80, cleanup:20, smooth:10, texture:0, skin:5, fills:0, shadows:0, stubble:20, light:0},
  bold:     {detail:65, cleanup:35, smooth:15, texture:0, skin:0, fills:20, shadows:5, stubble:30, light:0},
  fineline: {detail:85, cleanup:15, smooth:10, texture:0, skin:5, fills:0, shadows:0, stubble:15, light:0}
};
function applyPhotoPreset(name) {
  const p = PHOTO_PRESETS[name]; if (!p) return;
  Object.entries(p).forEach(([key, val]) => {
    S[key] = val;
    const sl = document.getElementById('sl-' + key);
    if (sl) sl.value = val;
    const sv = document.getElementById('sv-' + key);
    if (sv) sv.textContent = val;
  });
  ['portrait','bold','fineline'].forEach(n => {
    const b = document.getElementById('pp-' + n);
    if (b) b.classList.toggle('on', n === name);
  });
  if (S.hasPhoto) doRender();
}

