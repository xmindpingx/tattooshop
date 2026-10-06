/* ── Changing Room ─────────────────────────────────────────────────── */
let _crImg = null, _crDragX = 0.5, _crDragY = 0.45;
let _crDragging = false, _crDragOX = 0, _crDragOY = 0;
let _crShowStencil = false, _crSkin = '#c4956a';
let _crGender = 'male', _crFullBody = false;

// Area bounding boxes in normalized body coords [x0,y0,x1,y1] (body fits 0..1 x 0..1)
const CR_AREA_BOXES = {
  arm:     [0.60, 0.13, 1.00, 0.58],
  forearm: [0.62, 0.35, 0.99, 0.60],
  chest:   [0.20, 0.13, 0.80, 0.42],
  back:    [0.20, 0.13, 0.80, 0.44],
  leg:     [0.28, 0.53, 0.57, 0.97],
  neck:    [0.38, 0.09, 0.62, 0.20],
  hand:    [0.61, 0.54, 0.98, 0.67],
  ankle:   [0.29, 0.82, 0.55, 0.97],
  abdomen: [0.26, 0.38, 0.74, 0.54],
  head:    [0.30, 0.00, 0.70, 0.12],
};

