/* ── Photo upload ──────────────────────────────────────────────────── */
function onDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function onDrop(e) {
  e.preventDefault(); e.currentTarget.classList.remove('drag-over');
  const file = e.dataTransfer?.files?.[0];
  if (file) handlePhotoFile(file);
}
function onFileSelect(e) {
  const file = e.target?.files?.[0];
  if (file) handlePhotoFile(file);
}

function handlePhotoFile(file) {
  if (S._uploading) { showToast('Upload already in progress.', 2000); return; }
  if (!file.type.startsWith('image/')) { showToast('Please drop an image file.', 2500); return; }
  S._uploading = true;
  const fd = new FormData();
  fd.append('photo', file);
  showOverlay('Uploading photo…', 10);
  fetch('/api/prepare', { method:'POST', body: fd })
  .then(r => r.json())
  .then(d => {
    S._uploading = false;
    hideOverlay();
    if (d.error) { showToast('Upload error: ' + d.error, 4000); return; }
    S.hasPhoto = true;
    S.hasTextJob = false;  // new photo clears any pending text-job context
    S.jobId = d.jobId;
    // Show the overlay/preview returned by prepare
    const previewUrl = d.overlay || d.url || d.previewUrl;
    if (previewUrl) showStencil(previewUrl);
    setTab('photo');
    const ph = document.getElementById('preview-placeholder');
    if (ph) ph.style.display = 'none';
    showToast('Photo uploaded — adjust and Generate!', 2500);
  })
  .catch(e => { S._uploading = false; hideOverlay(); showToast('Upload failed: ' + e.message, 4000); });
}

/* ── Overlay helpers ───────────────────────────────────────────────── */
function showOverlay(title, pct) {
  const ov = document.getElementById('gen-overlay');
  const ot = document.getElementById('overlay-title');
  const om = document.getElementById('overlay-msg');
  if (ov) ov.style.display = 'flex';
  if (ot) ot.textContent = title;
  if (om) om.textContent = '';
  setOverlayProgress(pct || 0, '');
}

function setOverlayProgress(pct, msg) {
  const pf = document.getElementById('overlay-pfill');
  const om = document.getElementById('overlay-msg');
  if (pf) pf.style.width = Math.max(0, Math.min(100, pct)) + '%';
  if (om && msg) om.textContent = msg;
}

function hideOverlay() {
  const ov = document.getElementById('gen-overlay');
  if (ov) ov.style.display = 'none';
}

function cancelGen() {
  if (S.genJobId) {
    fetch('/api/gen/cancel/' + S.genJobId, { method:'POST' }).catch(() => {});
    S.genJobId = null;
  }
  S._rendering = false;
  S._textRendering = false;
  S._uploading = false;
  hideOverlay();
  showToast('Cancelled.', 2000);
}

/* ── Toast ─────────────────────────────────────────────────────────── */
let _toastTimer = null;
function showToast(msg, ms) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), ms || 3000);
}

/* ── Init ──────────────────────────────────────────────────────────── */
function init() {
  buildNolist();
  // Build font grid
  buildFontGrid();
  // Build chip banks
  buildChips(STYLE_CHIPS, 'style-chips', S.activeChips, 'text-style-prompt');
  buildChips(AI_CHIPS, 'ai-chips', S.activeAiChips, 'ai-prompt');
  // Size input listener
  const sizeIn = document.getElementById('size-in');
  if (sizeIn) sizeIn.addEventListener('input', e => onSizeChange(e.target.value));
  // Default tab
  setTab('text');
  setTextMode('outline');
  // Sync AI settings UI to S defaults (keeps Settings tab in sync with state)
  syncAiUi();
  // Default variation count = 2 so candidates tab always populates
  setVarCount(2);
  // Nolist badge color
  const badge = document.getElementById('nolist-badge');
  if (badge) badge.style.color = 'var(--green)';
  // Tab nav click handlers
  document.querySelectorAll('.tab-nav button[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });
  // Inner nav click handlers
  document.querySelectorAll('.inner-nav button[data-inner]').forEach(btn => {
    btn.addEventListener('click', () => {
      const scope = btn.closest('.inner-nav')?.dataset.scope;
      if (scope) setInner(scope, btn.dataset.inner);
    });
  });
  // Drop zone
  const dz = document.getElementById('drop-zone');
  if (dz) {
    dz.addEventListener('dragover', onDragOver);
    dz.addEventListener('dragleave', onDragLeave);
    dz.addEventListener('drop', onDrop);
  }
  // CR init
  initCR();
}

document.addEventListener('DOMContentLoaded', init);
