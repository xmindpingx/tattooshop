/* ── Generate dispatcher ───────────────────────────────────────────── */
function onGenerate() {
  const activeTab = document.querySelector('.tab-pane.active');
  const tab = activeTab ? activeTab.dataset.tab : 'text';
  if (tab === 'text') doTextStencil();
  else if (tab === 'photo') doRender();
  else if (tab === 'ai') doAiRedraw();
  else showToast('Switch to Text, Photo, or AI tab to generate.', 3000);
}

/* ── Text stencil ──────────────────────────────────────────────────── */
function doTextStencil() {
  if (S._textRendering) { showToast('Already generating — wait for it to finish.', 2500); return; }
  const textEl = document.getElementById('text-input');
  const text = textEl ? textEl.value.trim() : '';
  if (!text) { showToast('Enter some text first.', 2500); return; }
  const sizeEl = document.getElementById('size-in');
  const size = sizeEl ? parseFloat(sizeEl.value) : 5;

  if (S.textMode === 'ai') {
    // Step 1: create a job dir with a text stencil, then launch AI generation
    S._textRendering = true;
    showOverlay('Preparing text job…', 5);
    fetch('/api/text-job', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ text, font: S.selectedFont, sizeIn: size, chips: [...S.activeChips].join(', ') })
    })
    .then(r => { if (!r.ok) return r.json().then(d => { throw new Error(d.error || 'Server error'); }); return r.json(); })
    .then(d => {
      S.jobId = d.jobId;
      S.hasTextJob = true;
      S._textRendering = false;
      // Step 2: kick off AI generation — reuse the same flow as the AI tab
      doAiRedraw();
    })
    .catch(e => { S._textRendering = false; hideOverlay(); showToast('Error: ' + e.message, 4000); });
    return;
  }

  S._textRendering = true;
  showOverlay('Creating stencil…', 0);
  fetch('/api/text-stencil', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      text, font: S.selectedFont, sizeIn: size,
      chips: [...S.activeChips].join(', ')
    })
  })
  .then(r => {
    if (!r.ok) return r.json().then(d => { throw new Error(d.error || 'Server error'); });
    return r.blob();
  })
  .then(blob => {
    S._textRendering = false;
    hideOverlay();
    const url = URL.createObjectURL(blob);
    showStencil(url);
  })
  .catch(e => { S._textRendering = false; hideOverlay(); showToast('Error: ' + e.message, 4000); });
}

/* ── Photo render ──────────────────────────────────────────────────── */
function doRender() {
  if (S._rendering) { showToast('Already rendering — wait for it to finish.', 2500); return; }
  if (!S.hasPhoto) { showToast('Upload a photo first.', 2500); return; }
  S._rendering = true;
  showOverlay('Rendering stencil…', 10);
  if (!S.jobId) { hideOverlay(); S._rendering = false; showToast('Session lost — re-upload the photo.', 3000); return; }
  const body = {
    jobId: S.jobId, sizeIn: S.sizeIn, detail: S.detail, cleanup: S.cleanup,
    smooth: S.smooth, texture: S.texture, skin: S.skin,
    fills: S.fills, shadows: S.shadows, stubble: S.stubble, light: S.light
  };
  fetch('/api/render', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
  .then(r => r.json())
  .then(d => {
    S._rendering = false;
    hideOverlay();
    if (d.error) { showToast('Error: ' + d.error, 4000); return; }
    const url = (d.files && d.files.png) || d.url || d.path;
    showStencil(url);
    if (d.files && d.files.pdf) S.lastServerPdf = d.files.pdf;  // set AFTER showStencil so it isn't cleared
    // Show printed size from engine response
    if (d.inches && d.inches.length === 2) {
      const [wi, hi] = d.inches;
      const orient = d.orientation || 'portrait';
      showToast(`Output: ${wi}" × ${hi}" — fits US Letter (${orient})`, 3500);
    }
    const ppPhoto = document.getElementById('post-photo');
    const ppAi = document.getElementById('post-ai-panel');
    if (ppPhoto) ppPhoto.classList.add('visible');
    if (ppAi) ppAi.classList.add('visible');
  })
  .catch(e => { S._rendering = false; hideOverlay(); showToast('Request failed: ' + e.message, 4000); });
}

/* ── AI redraw ─────────────────────────────────────────────────────── */
function doAiRedraw() {
  if (S.genJobId) { showToast('Already generating — wait for it to finish.', 2500); return; }
  if (!S.hasStencil && !S.hasPhoto && !S.hasTextJob) { showToast('Generate or upload a stencil first.', 2500); return; }
  if (!S.jobId) { showToast('Session lost — re-upload or regenerate first.', 3000); return; }
  // Merge prompts from both text-tab and AI-tab fields: whichever has content wins;
  // text-tab fields take priority when both are filled (user is working in the Text tab).
  const textPos = (document.getElementById('text-prompt-pos')?.value || '').trim();
  const textNeg = (document.getElementById('text-prompt-neg')?.value || '').trim();
  const aiPos   = (document.getElementById('prompt-pos')?.value      || '').trim();
  const aiNeg   = (document.getElementById('prompt-neg')?.value      || '').trim();
  const prompt   = (S.hasTextJob && textPos) ? textPos : (aiPos || textPos);
  const negative = (S.hasTextJob && textNeg) ? textNeg : (aiNeg || textNeg);
  const nolist = S.nolistOn ? nolistValue() : '';
  showOverlay('AI Redraw starting…', 5);
  const body = {
    jobId: S.jobId, prompt, negative, nolist,
    base: S.aiModel, lora: S.aiLora, loraWeight: S.aiLoraW,
    guidance: S.aiCfg, scale: S.aiCnScale, steps: S.aiSteps, count: S.aiCount,
    goal: S.aiGoal, sizeIn: S.sizeIn
  };
  fetch('/api/gen/start', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
  .then(r => r.json())
  .then(d => {
    if (d.error) { hideOverlay(); showToast('Error: ' + d.error, 4000); return; }
    S.genJobId = d.genId;
    pollJob(d.genId);
  })
  .catch(e => { hideOverlay(); showToast('Request failed: ' + e.message, 4000); });
}

/* ── Job polling ───────────────────────────────────────────────────── */
function pollJob(id) {
  let elapsed = 0;
  const interval = setInterval(() => {
    // Self-cancel if user already cancelled (genJobId cleared by cancelGen)
    if (S.genJobId !== id) { clearInterval(interval); return; }
    elapsed += 2;
    fetch('/api/gen/status/' + id)
      .then(r => r.json())
      .then(d => {
        if (S.genJobId !== id) { clearInterval(interval); return; }  // cancelled mid-flight
        const pct = Math.min(90, 10 + elapsed * 2);
        setOverlayProgress(pct, d.seconds ? Math.round(d.seconds) + 's elapsed' : '');
        if (d.status === 'done') {
          clearInterval(interval);
          S.genJobId = null;
          hideOverlay();
          // Collect all images (batch or single) and always show in candidates tab
          let allUrls = [];
          if (d.images && d.images.length > 0) {
            allUrls = d.images.map(img => img.url || img);
          } else if (d.image) {
            allUrls = [d.image];
          }
          if (allUrls.length > 0) {
            showStencil(allUrls[0]);
            loadCandidates(id, allUrls, allUrls.length > 1);
          } else {
            showToast('Generation complete but no image returned.', 4000);
          }
        } else if (d.status === 'cancelled') {
          clearInterval(interval);
          S.genJobId = null;
          hideOverlay();
        } else if (d.status === 'error') {
          clearInterval(interval);
          S.genJobId = null;
          hideOverlay();
          showToast('Error: ' + (d.error || 'Generation failed'), 5000);
        }
      })
      .catch(() => {
        clearInterval(interval);
        S.genJobId = null;
        hideOverlay();
        showToast('Connection lost during generation.', 4000);
      });
  }, 2000);
}

/* ── Show stencil in preview ───────────────────────────────────────── */
function showStencil(url) {
  S.hasStencil = true;
  const ph = document.getElementById('preview-placeholder');
  const oc = document.getElementById('output-canvas');
  if (ph) ph.style.display = 'none';
  if (oc) {
    oc.style.display = 'block';
    const img = new Image();
    img.onload = () => {
      oc.width = img.width; oc.height = img.height;
      oc.getContext('2d').drawImage(img, 0, 0);
    };
    img.src = url;
  }
  S.currentBlob = url;  // may be blob: or /output/ path
  _crImg = null;        // reset so Changing Room loads the new stencil
  if (url.startsWith('/output/')) {
    // Only keep lastServerPdf paired with the PNG that was rendered with it.
    // If a new /output/ image appears (AI gen result or a different render),
    // clear the PDF unless it was set as part of this same server result.
    if (S.lastServerPng && url !== S.lastServerPng) S.lastServerPdf = null;
    S.lastServerPng = url;
  } else {
    // blob: URL (text outline stencil) — invalidate PDF
    S.lastServerPdf = null;
    S.lastServerPng = null;
  }
  const er = document.getElementById('export-row');
  if (er) er.style.display = '';
}

/* ── Export / post-process ─────────────────────────────────────────── */
function doExport(type) {
  if (!S.currentBlob) { showToast('Generate a stencil first.', 2500); return; }
  let targetUrl;
  if (type === 'pdf') {
    if (!S.lastServerPdf || S.currentBlob !== S.lastServerPng) { showToast('PDF only available for the latest Photo Render — run Render first.', 3500); return; }
    targetUrl = S.lastServerPdf;
  } else {
    targetUrl = S.currentBlob;
  }
  const a = document.createElement('a');
  a.href = targetUrl;
  a.download = 'stencil.' + type;
  a.click();
}

function doFlash() {
  if (S._rendering) { showToast('Already rendering — wait for it to finish.', 2500); return; }
  if (!S.jobId) { showToast('Upload a photo first.', 2500); return; }
  // Derive genId from the current blob URL: /api/gen/image/<jobId>/<genId>
  const m = S.currentBlob && S.currentBlob.match(/\/api\/gen\/image\/[^/]+\/([0-9a-f]{8}(?:_\d+)?)$/);
  if (!m) { showToast('Flash Stencil requires an AI-generated image — run AI Redraw first, then select a candidate.', 3500); return; }
  const genId = m[1];
  S._rendering = true;
  showOverlay('Converting flash to stencil…', 20);
  fetch('/api/flash', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ jobId: S.jobId, genId, sizeIn: S.sizeIn }) })
  .then(r => r.json())
  .then(d => {
    S._rendering = false; hideOverlay();
    const url = d.files?.png || d.url;
    if (url) { showStencil(url); if (d.files?.pdf) S.lastServerPdf = d.files.pdf; }
    else showToast(d.error || 'Flash conversion failed', 4000);
  })
  .catch(e => { S._rendering = false; hideOverlay(); showToast('Failed: ' + e.message, 4000); });
}

function doDestubble() {
  if (S._rendering) { showToast('Already rendering — wait for it to finish.', 2500); return; }
  if (!S.jobId) { showToast('Upload a photo first.', 2500); return; }
  S._rendering = true;
  showOverlay('Removing stubble…', 30);
  fetch('/api/render', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ jobId: S.jobId, sizeIn: S.sizeIn, detail: S.detail, cleanup: S.cleanup,
      smooth: S.smooth, texture: S.texture, skin: S.skin, fills: S.fills, shadows: S.shadows, stubble: 0, light: S.light }) })
  .then(r => r.json())
  .then(d => { S._rendering = false; hideOverlay(); const url = d.files?.png || d.url; if (url) { showStencil(url); if (d.files?.pdf) S.lastServerPdf = d.files.pdf; } else showToast(d.error || 'Failed', 4000); })
  .catch(e => { S._rendering = false; hideOverlay(); showToast('Failed: ' + e.message, 4000); });
}

function doRelight() {
  if (S._rendering) { showToast('Already rendering — wait for it to finish.', 2500); return; }
  if (!S.jobId) { showToast('Upload a photo first.', 2500); return; }
  S._rendering = true;
  showOverlay('Relighting…', 30);
  fetch('/api/render', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ jobId: S.jobId, sizeIn: S.sizeIn, detail: S.detail, cleanup: S.cleanup,
      smooth: S.smooth, texture: S.texture, skin: S.skin, fills: S.fills, shadows: S.shadows,
      stubble: S.stubble, light: Math.max(S.light, 30) }) })
  .then(r => r.json())
  .then(d => { S._rendering = false; hideOverlay(); const url = d.files?.png || d.url; if (url) { showStencil(url); if (d.files?.pdf) S.lastServerPdf = d.files.pdf; } else showToast(d.error || 'Failed', 4000); })
  .catch(e => { S._rendering = false; hideOverlay(); showToast('Failed: ' + e.message, 4000); });
}

/* ── Candidates grid ───────────────────────────────────────────────── */
function loadCandidates(jobId, images, autoSwitch) {
  const empty = document.getElementById('candidates-empty');
  const grid = document.getElementById('candidates-grid');
  if (!grid) return;
  if (!images || images.length === 0) {
    if (empty) empty.style.display = '';
    grid.style.display = 'none'; return;
  }
  if (empty) empty.style.display = 'none';
  grid.style.display = '';
  grid.innerHTML = images.map((url, i) =>
    `<div class="cand-thumb" data-url="${url}" onclick="selectCandidate(this.dataset.url)">
      <img src="${url}" alt="Candidate ${i+1}" loading="lazy">
      <div class="cand-label">Option ${i+1}</div>
    </div>`
  ).join('');
  if (autoSwitch !== false) setTab('previews');
}

function selectCandidate(url) {
  showStencil(url);
  // Go to AI tab so user can re-run or export; text-job users can go back to text manually
  setTab('ai');
  showToast('Candidate selected — ready to export or re-run!', 2500);
  document.querySelectorAll('.cand-thumb').forEach(t => {
    t.classList.toggle('selected', t.dataset.url === url);
  });
}

/* ── No-list toggle ────────────────────────────────────────────────── */
function toggleNolist() {
  S.nolistOn = !S.nolistOn;
  const body = document.getElementById('nolist-body');
  const badge = document.getElementById('nolist-badge');
  if (body) body.style.display = S.nolistOn ? 'block' : 'none';
  if (badge) { badge.textContent = S.nolistOn ? 'ON ▾' : 'OFF ▸'; badge.style.color = S.nolistOn ? 'var(--green)' : 'var(--muted)'; }
}

/* ── Size controls ─────────────────────────────────────────────────── */
function onSizeChange(val) {
  if (val === undefined) val = document.getElementById('size-in')?.value ?? 5;
  S.sizeIn = parseFloat(val);
  const cmEl = document.getElementById('size-cm');
  if (cmEl) cmEl.textContent = '(' + (S.sizeIn * 2.54).toFixed(1) + ' cm)';
  document.querySelectorAll('.size-chips button').forEach(b => {
    b.classList.toggle('on', parseFloat(b.dataset.s) === S.sizeIn);
  });
}

function setSizeChip(s) {
  S.sizeIn = s;
  const sizeEl = document.getElementById('size-in');
  if (sizeEl) { sizeEl.value = s; onSizeChange(s); }
}


function buildNolist() {
  const box = document.getElementById('nolist-terms');
  if (!box || box.children.length) return;
  NOLIST_TERMS.forEach(t => {
    const l = document.createElement('label');
    l.className = 'nolist-term';
    const c = document.createElement('input');
    c.type = 'checkbox'; c.checked = true; c.value = t;
    l.appendChild(c); l.appendChild(document.createTextNode(' ' + t));
    box.appendChild(l);
  });
}
function nolistValue() {
  const on = Array.from(document.querySelectorAll('#nolist-terms input:checked')).map(c => c.value);
  const extra = (document.getElementById('nolist-text')?.value || '').trim();
  return on.concat(extra ? [extra] : []).join(', ');
}
