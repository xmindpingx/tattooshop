function setCrArea(area) {
  S.crArea = area;
  document.querySelectorAll('[data-area]').forEach(b => {
    b.classList.toggle('on', b.dataset.area === area);
  });
  refreshCR();
}

function setCrGender(g) {
  _crGender = g;
  document.getElementById('cr-gender-m')?.classList.toggle('on', g === 'male');
  document.getElementById('cr-gender-f')?.classList.toggle('on', g === 'female');
  refreshCR();
}

function toggleCrFullBody() {
  _crFullBody = !_crFullBody;
  const btn = document.getElementById('btn-cr-fullbody');
  if (btn) btn.classList.toggle('on', _crFullBody);
  refreshCR();
}

function setCrSkin(hex) {
  _crSkin = hex;
  document.querySelectorAll('[onclick^="setCrSkin"]').forEach(b => {
    b.style.border = b.getAttribute('onclick').includes(hex)
      ? '2px solid var(--accent)' : '2px solid transparent';
  });
  refreshCR();
}

function onCrSlider() {
  S.crScale = parseFloat(document.getElementById('sl-cr-scale')?.value || 100);
  S.crOpacity = parseFloat(document.getElementById('sl-cr-opacity')?.value || 80);
  const lbl1 = document.getElementById('sv-cr-scale');
  const lbl2 = document.getElementById('sv-cr-opacity');
  if (lbl1) lbl1.textContent = S.crScale + '%';
  if (lbl2) lbl2.textContent = S.crOpacity + '%';
  refreshCR();
}

function _loadCrImg(url) {
  _crImg = null;
  const img = new Image();
  img.onload = () => { _crImg = img; refreshCR(); };
  img.src = url;
}

function toggleCrPreview() {
  _crShowStencil = !_crShowStencil;
  const btn = document.getElementById('btn-cr-toggle');
  if (btn) btn.textContent = _crShowStencil ? '⏹ Hide' : '▶ Preview';
  const canvas = document.getElementById('cr-canvas');
  if (canvas) canvas.style.cursor = _crShowStencil ? 'grab' : 'default';
  if (_crShowStencil && S.currentBlob) {
    // Always reload in case currentBlob changed since last toggle
    if (!_crImg || _crImg.src !== S.currentBlob) {
      _loadCrImg(S.currentBlob);
      return; // refreshCR fires in onload
    }
  }
  refreshCR();
}

function resetCrPosition() {
  _crDragX = 0.5; _crDragY = 0.45;
  refreshCR();
}


function refreshCR() {
  const canvas = document.getElementById('cr-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const grad = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, Math.max(w, h) * 0.7);
  grad.addColorStop(0, 'rgba(30,18,48,0.88)');
  grad.addColorStop(1, 'rgba(10,6,18,0.97)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const _hiArea = _crFullBody ? S.crArea : null;
  const fb = drawFullBody(ctx, w, h, _crSkin, _crGender, _hiArea);

  if (!_crFullBody && CR_AREA_BOXES[S.crArea]) {
    // zoom into the highlighted area
    const [ax0,ay0,ax1,ay1] = CR_AREA_BOXES[S.crArea];
    const rx=fb.bx+ax0*fb.bw, ry=fb.by+ay0*fb.bh, rw=(ax1-ax0)*fb.bw, rh=(ay1-ay0)*fb.bh;
    // clone canvas, scale to show area
    const tmp = document.createElement('canvas'); tmp.width=w; tmp.height=h;
    const tctx = tmp.getContext('2d'); tctx.drawImage(canvas,0,0);
    ctx.clearRect(0,0,w,h);
    const grad2 = ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,Math.max(w,h)*.7);
    grad2.addColorStop(0,'rgba(30,18,48,0.88)');grad2.addColorStop(1,'rgba(10,6,18,0.97)');
    ctx.fillStyle=grad2; ctx.fillRect(0,0,w,h);
    const pad=0.10, zw=rw*(1+pad*2), zh=rh*(1+pad*2), zx=rx-rw*pad, zy=ry-rh*pad;
    ctx.drawImage(tmp, zx,zy,zw,zh, 0,0,w,h);
  }

  if (_crShowStencil && _crImg) {
    let sx,sy,sw,sh;
    if (_crFullBody) {
      const baseSize = Math.min(w, h) * 0.35 * (S.crScale / 100);
      const ratio = _crImg.naturalWidth / (_crImg.naturalHeight || 1);
      sw = ratio >= 1 ? baseSize : baseSize * ratio;
      sh = ratio < 1 ? baseSize : baseSize / ratio;
      sx = _crDragX * w - sw / 2;
      sy = _crDragY * h - sh / 2;
    } else if (CR_AREA_BOXES[S.crArea]) {
      const [ax0,ay0,ax1,ay1] = CR_AREA_BOXES[S.crArea];
      const rx=fb.bx+ax0*fb.bw, ry=fb.by+ay0*fb.bh, rw=(ax1-ax0)*fb.bw, rh=(ay1-ay0)*fb.bh;
      const pad=0.10, zw=rw*(1+pad*2), zh=rh*(1+pad*2), zx=rx-rw*pad, zy=ry-rh*pad;
      const scaleX=w/zw, scaleY=h/zh;
      const baseSize = Math.min(w,h) * 0.35 * (S.crScale/100);
      const ratio = _crImg.naturalWidth / (_crImg.naturalHeight || 1);
      sw = (ratio >= 1 ? baseSize : baseSize * ratio) * scaleX;
      sh = (ratio < 1 ? baseSize : baseSize / ratio) * scaleY;
      sx = (_crDragX * w - sw / 2);
      sy = (_crDragY * h - sh / 2);
    } else { sx=sy=0; sw=sh=100; }
    // Invert stencil so black lines → white (visible on dark bg via 'screen' blend)
    const tmpC = document.createElement('canvas');
    tmpC.width = _crImg.naturalWidth; tmpC.height = _crImg.naturalHeight;
    const tmpCtx = tmpC.getContext('2d');
    tmpCtx.filter = 'invert(1)';
    tmpCtx.drawImage(_crImg, 0, 0);
    ctx.save();
    ctx.globalAlpha = S.crOpacity / 100;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(tmpC, sx, sy, sw, sh);
    ctx.restore();
  } else if (_crShowStencil) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Generate or upload a stencil first', w / 2, h - 16);
  }

}

function initCR() {
  const canvas = document.getElementById('cr-canvas');
  if (!canvas) return;
  const wrap = document.getElementById('cr-fullscreen-wrap');
  if (wrap) {
    canvas.width = wrap.clientWidth || 800;
    canvas.height = wrap.clientHeight || 400;
  }

  function getPos(e) {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  }
  function onStart(e) {
    if (!_crShowStencil) return;
    e.preventDefault();
    _crDragging = true;
    const p = getPos(e);
    _crDragOX = p.x / canvas.width - _crDragX;
    _crDragOY = p.y / canvas.height - _crDragY;
    canvas.style.cursor = 'grabbing';
  }
  function onMove(e) {
    if (!_crDragging) return;
    e.preventDefault();
    const p = getPos(e);
    _crDragX = Math.max(0.05, Math.min(0.95, p.x / canvas.width - _crDragOX));
    _crDragY = Math.max(0.05, Math.min(0.95, p.y / canvas.height - _crDragOY));
    refreshCR();
  }
  function onEnd() {
    _crDragging = false;
    canvas.style.cursor = _crShowStencil ? 'grab' : 'default';
  }
  canvas.addEventListener('mousedown', onStart);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseup', onEnd);
  canvas.addEventListener('mouseleave', onEnd);
  canvas.addEventListener('touchstart', onStart, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  canvas.addEventListener('touchend', onEnd);

  window.addEventListener('resize', () => {
    if (wrap) { canvas.width = wrap.clientWidth || 800; canvas.height = wrap.clientHeight || 400; }
    refreshCR();
  });

  refreshCR();
}

