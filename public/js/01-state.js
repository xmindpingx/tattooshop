/* ── State ─────────────────────────────────────────────────────────── */
const S = {
  base:'sdxl', baseId:'sdxl', prepCache:null,
  hasPhoto:false, bright:0, contrast:0, autoLevels:false,
  crop:null, aspect:'free', mode:'photo', points:[], rotation:0,
  flipH:false, flipV:false,
  style:'', textMode:'outline', selectedFont:'Bebas Neue',
  activeChips:new Set(), activeAiChips:new Set(),
  jobId:null, aiModel:'sdxl', aiLora:'tattoo', aiLoraW:0.65,
  aiCfg:7.5, aiCnScale:0.85, aiSteps:28, aiCount:2, aiGoal:'stencil',
  sizeIn:5, nolistOn:true, hasStencil:false, hasTextJob:false, currentBlob:null, lastServerPng:null, lastServerPdf:null,
  _rendering:false, _uploading:false, _textRendering:false, crArea:'arm', crScale:100, crOpacity:80, genJobId:null,
  detail:80, cleanup:20, smooth:10, texture:0, skin:5, fills:0, shadows:0, stubble:20, light:0
};

/* ── Font list ─────────────────────────────────────────────────────── */
const FONTS = [
  {name:'Bebas Neue',cat:'bold'},{name:'Anton',cat:'bold'},{name:'Black Ops One',cat:'bold'},
  {name:'Oswald',cat:'bold'},{name:'Barlow Condensed',cat:'bold'},{name:'Rajdhani',cat:'bold'},
  {name:'Cinzel Decorative',cat:'gothic'},{name:'Uncial Antiqua',cat:'gothic'},
  {name:'Pirata One',cat:'gothic'},{name:'MedievalSharp',cat:'gothic'},
  {name:'Dancing Script',cat:'script'},{name:'Great Vibes',cat:'script'},
  {name:'Satisfy',cat:'script'},{name:'Pacifico',cat:'script'},{name:'Parisienne',cat:'script'},
  {name:'Share Tech Mono',cat:'fineline'},{name:'Courier Prime',cat:'fineline'},
  {name:'Special Elite',cat:'fineline'},{name:'Permanent Marker',cat:'fineline'},
  {name:'Caveat',cat:'fineline'}
];

/* ── Style chips ───────────────────────────────────────────────────── */
const STYLE_CHIPS = [
  'bold black outlines','crisp hard edges','razor-sharp line art',
  'clean vector lines','thick ink strokes','pure black on white',
  'solid black fills','stark high contrast','comic ink style',
  'flash tattoo style','thermal stencil ready','geometric shapes',
  'tribal pattern','fine detail work','stipple texture'
];
const AI_CHIPS = [
  'bold black outlines','crisp hard edges','razor-sharp line art',
  'clean vector lines','thick ink strokes','pure black on white',
  'solid black fills','stark high contrast','comic ink style',
  'flash tattoo style','thermal stencil ready','traditional tattoo',
  'new school tattoo','blackwork','dotwork','geometric tattoo'
];

/* ── Tab switching ─────────────────────────────────────────────────── */
function setTab(tab) {
  document.querySelectorAll('.tab-nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-pane').forEach(p => {
    p.classList.toggle('active', p.dataset.tab === tab);
  });
  const nl = document.getElementById('nolist-wrap');
  if (nl) nl.style.display = (tab === 'text' || tab === 'ai') ? '' : 'none';
  const sgRow = document.getElementById('size-gen-row');
  const genTabs = ['text', 'photo', 'ai'];
  if (sgRow) sgRow.style.display = genTabs.includes(tab) ? '' : 'none';
  if (tab === 'room' && S.hasStencil && !_crShowStencil) {
    _crShowStencil = true;
    const btn = document.getElementById('btn-cr-toggle');
    if (btn) btn.textContent = '⏹ Hide';
    const canvas = document.getElementById('cr-canvas');
    if (canvas) canvas.style.cursor = 'grab';
    if (S.currentBlob && !_crImg) {
      const img = new Image();
      img.onload = () => { _crImg = img; refreshCR(); };
      img.src = S.currentBlob;
    } else { refreshCR(); }
  } else if (tab === 'room') { refreshCR(); }
}

function setInner(scope, inner) {
  const pane = document.querySelector(`.tab-pane.active`);
  if (!pane) return;
  pane.querySelectorAll(`.inner-nav[data-scope="${scope}"] button`).forEach(b => {
    b.classList.toggle('active', b.dataset.inner === inner);
  });
  pane.querySelectorAll(`.inner-pane[data-scope="${scope}"]`).forEach(p => {
    p.classList.toggle('active', p.dataset.inner === inner);
  });
}

function setTextMode(mode) {
  S.textMode = mode;
  document.querySelectorAll('#text-mode-toggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  const aiExtra = document.getElementById('text-ai-extra');
  if (aiExtra) aiExtra.style.display = mode === 'ai' ? '' : 'none';
  // Clear text-job flag when switching back to outline so AI Redraw
  // doesn't accidentally use text-tab prompts on a plain photo job
  if (mode === 'outline') S.hasTextJob = false;
}

function setGoal(goal) {
  S.aiGoal = goal;
  ['#goal-toggle', '#text-goal-toggle'].forEach(sel => {
    document.querySelectorAll(sel + ' button').forEach(b => {
      b.classList.toggle('active', b.dataset.goal === goal);
    });
  });
}


const NOLIST_TERMS = ["ambient light", "global illumination", "soft shading", "smooth gradients", "diffuse lighting", "subsurface scattering", "rim glow", "bokeh", "depth of field", "fog", "haze", "noise", "grain", "halftone", "stippling", "crosshatching", "watercolor wash", "airbrush", "soft focus", "blurry", "painterly", "photorealistic skin texture", "pores", "freckles", "wrinkles", "color", "grey tones", "mid-tones", "feathered edges"];
