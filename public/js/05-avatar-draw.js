function hexLighter(hex,a){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return`rgb(${Math.max(0,Math.min(255,r+a))},${Math.max(0,Math.min(255,g+a))},${Math.max(0,Math.min(255,b+a))})`;}
function hexDarker(hex,a){return hexLighter(hex,-a);}

function drawFullBody(ctx, cw, ch, skin, gender, highlightArea) {
  const padX=0.06, padY=0.02, bodyAsp=0.43;
  let bh,bw,bx,by;
  if(cw/ch < bodyAsp){bw=cw*(1-padX*2);bh=bw/bodyAsp;}else{bh=ch*(1-padY*2);bw=bh*bodyAsp;}
  bx=(cw-bw)/2; by=(ch-bh)/2;
  const X=nx=>bx+nx*bw, Y=ny=>by+ny*bh;
  const cx2=X(.5);

  // Palette
  const light=hexLighter(skin,58), mid=hexLighter(skin,22), dark=hexDarker(skin,48), vdark=hexDarker(skin,88), crease=hexDarker(skin,115);
  const nipCol=hexDarker(skin,68), areola=hexDarker(skin,50), hairCol=hexDarker(skin,145), lipCol=hexDarker(skin,32);

  function rg(x0,y0,x1,y1,c0=light,c1=dark){const g=ctx.createLinearGradient(x0,y0,x1,y1);g.addColorStop(0,c0);g.addColorStop(.5,skin);g.addColorStop(1,c1);return g;}
  function radG(cx,cy,r,c0=light,c1=dark){const g=ctx.createRadialGradient(cx-r*.25,cy-r*.28,0,cx,cy,r);g.addColorStop(0,c0);g.addColorStop(.52,skin);g.addColorStop(1,c1);return g;}
  function cylG(lx,rx){const g=ctx.createLinearGradient(lx,0,rx,0);g.addColorStop(0,dark);g.addColorStop(.18,dark);g.addColorStop(.38,skin);g.addColorStop(.5,light);g.addColorStop(.62,skin);g.addColorStop(.82,dark);g.addColorStop(1,dark);return g;}
  ctx.save();
  const isMale=gender==='male';

  // Proportions
  const sw2=bw*(isMale?.198:.186), ww2=bw*(isMale?.115:.120), hw2=bw*(isMale?.158:.180);
  const sY=Y(.162), wY=Y(.432), hpY=Y(.524);

  // ── LEGS (drawn first, behind torso) ──
  const tY1=Y(.748), knY=Y(.758), cY1=Y(.913), fY0=Y(.917), fY1=Y(.970);
  for(const s of[-1,1]){
    const lx=cx2+s*hw2*.56, tw0=bw*(isMale?.088:.093), tw1=bw*(isMale?.068:.073);
    // thigh
    ctx.beginPath();
    ctx.moveTo(lx-tw0*.52,hpY);ctx.lineTo(lx+tw0*.52,hpY);
    ctx.bezierCurveTo(lx+tw0*.56,hpY+(tY1-hpY)*.42,lx+tw1*.54,hpY+(tY1-hpY)*.78,lx+tw1*.46,tY1);
    ctx.lineTo(lx-tw1*.46,tY1);
    ctx.bezierCurveTo(lx-tw1*.54,hpY+(tY1-hpY)*.78,lx-tw0*.56,hpY+(tY1-hpY)*.42,lx-tw0*.52,hpY);
    ctx.closePath();
    ctx.fillStyle=cylG(lx-tw0*.62,lx+tw0*.62);ctx.fill();ctx.strokeStyle=vdark;ctx.lineWidth=.7;ctx.stroke();
    // quad highlight
    ctx.beginPath();ctx.ellipse(lx+s*tw0*.06,hpY+(tY1-hpY)*.26,tw0*.22,(tY1-hpY)*.12,s*.1,0,Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,.07)';ctx.fill();
    // inner thigh shadow
    ctx.beginPath();ctx.moveTo(lx-s*tw0*.38,hpY);ctx.bezierCurveTo(lx-s*tw0*.3,hpY+(tY1-hpY)*.5,lx-s*tw1*.26,tY1*.6+knY*.4,lx-s*tw1*.24,tY1);
    ctx.strokeStyle='rgba(0,0,0,.06)';ctx.lineWidth=1.2;ctx.stroke();
    // kneecap
    ctx.beginPath();ctx.ellipse(lx,knY,tw1*.54,bh*.018,0,0,Math.PI*2);
    ctx.fillStyle=hexDarker(skin,14);ctx.fill();ctx.strokeStyle=vdark;ctx.lineWidth=.65;ctx.stroke();
    ctx.beginPath();ctx.ellipse(lx-s*tw1*.10,knY-bh*.008,tw1*.18,bh*.009,0,0,Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,.10)';ctx.fill();
    // calf
    const cw0=bw*(isMale?.057:.059),cw1=bw*(isMale?.037:.039);
    ctx.beginPath();
    ctx.moveTo(lx-cw0*.5,knY+bh*.006);ctx.lineTo(lx+cw0*.5,knY+bh*.006);
    ctx.bezierCurveTo(lx+cw0*.55,knY+(cY1-knY)*.32,lx+cw1*.56,knY+(cY1-knY)*.62,lx+cw1*.44,cY1);
    ctx.lineTo(lx-cw1*.44,cY1);
    ctx.bezierCurveTo(lx-cw1*.56,knY+(cY1-knY)*.62,lx-cw0*.55,knY+(cY1-knY)*.32,lx-cw0*.5,knY+bh*.006);
    ctx.closePath();
    ctx.fillStyle=cylG(lx-cw0*.62,lx+cw0*.62);ctx.fill();ctx.strokeStyle=vdark;ctx.lineWidth=.7;ctx.stroke();
    // gastrocnemius highlight
    ctx.beginPath();ctx.ellipse(lx+s*cw0*.06,knY+(cY1-knY)*.26,cw0*.26,(cY1-knY)*.13,s*.12,0,Math.PI*2);
    ctx.fillStyle='rgba(0,0,0,.05)';ctx.fill();
    // shin line
    ctx.beginPath();ctx.moveTo(lx-s*cw0*.06,knY+(cY1-knY)*.06);ctx.lineTo(lx-s*cw0*.04,cY1-bh*.01);
    ctx.strokeStyle='rgba(0,0,0,.055)';ctx.lineWidth=.75;ctx.stroke();
    // ankle
    const aw=bw*.033;
    ctx.beginPath();ctx.ellipse(lx,fY0,aw*.55,aw*.40,0,0,Math.PI*2);
    ctx.fillStyle=hexDarker(skin,16);ctx.fill();ctx.strokeStyle=vdark;ctx.lineWidth=.6;ctx.stroke();
    // medial & lateral malleolus bumps
    for(const sb of[-1,1]){ctx.beginPath();ctx.ellipse(lx+sb*aw*.62,fY0+aw*.08,aw*.13,aw*.11,0,0,Math.PI*2);ctx.fillStyle=hexLighter(skin,28);ctx.fill();}
    // foot
    const ftX=lx+s*bw*.018, ftW=bw*(isMale?.065:.062), ftH=bh*.030;
    ctx.beginPath();
    ctx.moveTo(lx-aw*.38,fY0+aw*.28);
    ctx.bezierCurveTo(ftX-ftW*.52,fY0+ftH*.35,ftX-ftW*.52,fY1,ftX-ftW*.36,fY1+ftH*.08);
    ctx.bezierCurveTo(ftX,fY1+ftH*.22,ftX+ftW*.54,fY1,ftX+ftW*.52,fY1-ftH*.22);
    ctx.bezierCurveTo(ftX+ftW*.56,fY0+ftH*.18,lx+aw*.40,fY0+aw*.20,lx+aw*.38,fY0+aw*.28);
    ctx.closePath();
    const ftg=ctx.createLinearGradient(ftX-ftW*.5,fY0,ftX-ftW*.5,fY1+ftH*.2);
    ftg.addColorStop(0,skin);ftg.addColorStop(1,hexDarker(skin,22));
    ctx.fillStyle=ftg;ctx.fill();ctx.strokeStyle=vdark;ctx.lineWidth=.7;ctx.stroke();
    // arch shadow
    ctx.beginPath();ctx.ellipse(ftX-s*ftW*.12,fY1,ftW*.22,ftH*.1,s*.2,0,Math.PI*2);
    ctx.fillStyle='rgba(0,0,0,.06)';ctx.fill();
    // toes
    const toeW=[.11,.1,.09,.082,.072],toeH=[.26,.29,.27,.24,.20];
    for(let ti=0;ti<5;ti++){
      const tx=ftX-ftW*.38+ti*ftW*.205;
      ctx.beginPath();ctx.ellipse(tx,fY1+ftH*.02,ftW*toeW[ti],ftH*toeH[ti],s*-.1,0,Math.PI*2);
      ctx.fillStyle=skin;ctx.fill();ctx.strokeStyle=vdark;ctx.lineWidth=.5;ctx.stroke();
      // toenail
      ctx.beginPath();ctx.ellipse(tx,fY1-ftH*.04,ftW*toeW[ti]*.52,ftH*toeH[ti]*.36,-s*.06,0,Math.PI*2);
      ctx.fillStyle='rgba(255,255,255,.20)';ctx.fill();
    }
  }

  // ── TORSO ──
  ctx.beginPath();
  ctx.moveTo(cx2-sw2,sY);
  ctx.bezierCurveTo(cx2-sw2*1.11,sY+bh*.055,cx2-ww2*1.14,wY-bh*.038,cx2-ww2,wY);
  ctx.bezierCurveTo(cx2-ww2*.90,wY+bh*.022,cx2-hw2*.86,hpY-bh*.018,cx2-hw2,hpY);
  ctx.lineTo(cx2+hw2,hpY);
  ctx.bezierCurveTo(cx2+hw2*.86,hpY-bh*.018,cx2+ww2*.90,wY+bh*.022,cx2+ww2,wY);
  ctx.bezierCurveTo(cx2+ww2*1.14,wY-bh*.038,cx2+sw2*1.11,sY+bh*.055,cx2+sw2,sY);
  ctx.closePath();
  const tg=ctx.createLinearGradient(cx2-sw2,sY,cx2+sw2,sY);
  tg.addColorStop(0,dark);tg.addColorStop(.18,skin);tg.addColorStop(.5,light);tg.addColorStop(.82,skin);tg.addColorStop(1,dark);
  ctx.fillStyle=tg;ctx.fill();ctx.strokeStyle=vdark;ctx.lineWidth=.9;ctx.stroke();
  // sternum/linea alba
  ctx.beginPath();ctx.moveTo(cx2,Y(.178));ctx.lineTo(cx2,Y(isMale?.44:.38));
  ctx.strokeStyle='rgba(0,0,0,.065)';ctx.lineWidth=.9;ctx.stroke();
  // navel
  const navY=Y(.460);
  ctx.beginPath();ctx.ellipse(cx2,navY,bw*.018,bh*.013,0,0,Math.PI*2);ctx.fillStyle=crease;ctx.fill();
  ctx.beginPath();ctx.ellipse(cx2-bw*.006,navY-bh*.004,bw*.008,bh*.006,-.4,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.12)';ctx.fill();

  // ── UPPER ARMS ──
  for(const s of[-1,1]){
    const ax=cx2+s*(sw2+bw*.052), ay0=sY+bh*.022, ay1=Y(.385), aw=bw*(isMale?.073:.065);
    ctx.beginPath();
    ctx.moveTo(ax,ay0);
    ctx.bezierCurveTo(ax+s*aw*.60,ay0,ax+s*aw*.52,ay0*.54+ay1*.46,ax+s*aw*.46,ay1);
    ctx.lineTo(ax-s*aw*.46,ay1);
    ctx.bezierCurveTo(ax-s*aw*.52,ay0*.54+ay1*.46,ax-s*aw*.60,ay0,ax,ay0);
    ctx.closePath();
    ctx.fillStyle=cylG(ax-aw*.58,ax+aw*.58);ctx.fill();ctx.strokeStyle=vdark;ctx.lineWidth=.8;ctx.stroke();
    // bicep peak
    ctx.beginPath();ctx.ellipse(ax+s*aw*.06,ay0+bh*.065,aw*.24,bh*.024,s*.18,0,Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,.08)';ctx.fill();
    // elbow bump
    ctx.beginPath();ctx.ellipse(ax+s*aw*.08,ay1-bh*.006,aw*.28,bh*.014,s*.25,0,Math.PI*2);
    ctx.fillStyle=hexDarker(skin,18);ctx.fill();ctx.strokeStyle=vdark;ctx.lineWidth=.55;ctx.stroke();
  }

  // ── FOREARMS ──
  for(const s of[-1,1]){
    const fx=cx2+s*(sw2+bw*.050), fy0=Y(.385), fx1=cx2+s*(sw2+bw*.032), fy1=Y(.565), fw0=bw*(isMale?.062:.056), fw1=bw*(isMale?.043:.039);
    ctx.beginPath();
    ctx.moveTo(fx+s*fw0*.5,fy0);ctx.lineTo(fx-s*fw0*.5,fy0);
    ctx.bezierCurveTo(fx-s*fw1*.52,fy0*.45+fy1*.55,fx1-s*fw1*.52,fy0*.6+fy1*.4,fx1-s*fw1*.5,fy1);
    ctx.lineTo(fx1+s*fw1*.5,fy1);
    ctx.bezierCurveTo(fx1+s*fw1*.52,fy0*.6+fy1*.4,fx+s*fw1*.52,fy0*.45+fy1*.55,fx+s*fw0*.5,fy0);
    ctx.closePath();
    ctx.fillStyle=cylG(fx-fw0*.62,fx+fw0*.62);ctx.fill();ctx.strokeStyle=vdark;ctx.lineWidth=.8;ctx.stroke();
    // tendon lines
    for(const off of[-.14,0,.14]){
      ctx.beginPath();ctx.moveTo(fx+s*(fw0*off+fw0*.04),fy0+bh*.018);ctx.lineTo(fx1+s*(fw1*off+fw1*.04),fy1-bh*.018);
      ctx.strokeStyle='rgba(0,0,0,.04)';ctx.lineWidth=.6;ctx.stroke();
    }
  }

  // ── HANDS ──
  for(const s of[-1,1]){
    const hndx=cx2+s*(sw2+bw*.024), hdy=Y(.565), hndw=bw*(isMale?.056:.051), hndh=bh*.052;
    // palm
    ctx.beginPath();
    ctx.moveTo(hndx-hndw*.44,hdy);ctx.lineTo(hndx+hndw*.44,hdy);
    ctx.bezierCurveTo(hndx+hndw*.48,hdy+hndh*.5,hndx+hndw*.42,hdy+hndh,hndx+hndw*.26,hdy+hndh);
    ctx.lineTo(hndx-hndw*.26,hdy+hndh);
    ctx.bezierCurveTo(hndx-hndw*.42,hdy+hndh,hndx-hndw*.48,hdy+hndh*.5,hndx-hndw*.44,hdy);
    ctx.closePath();
    ctx.fillStyle=cylG(hndx-hndw*.52,hndx+hndw*.52);ctx.fill();ctx.strokeStyle=vdark;ctx.lineWidth=.7;ctx.stroke();
    // thumb
    ctx.beginPath();ctx.ellipse(hndx-s*hndw*.50,hdy+hndh*.20,hndw*.12,hndh*.26,s*.45,0,Math.PI*2);
    ctx.fillStyle=skin;ctx.fill();ctx.strokeStyle=vdark;ctx.lineWidth=.6;ctx.stroke();
    // 4 fingers
    const fws=[.094,.104,.098,.086],fhs=[.27,.31,.29,.25];
    for(let fi=0;fi<4;fi++){
      const foff=(fi-1.5)*hndw*.235;
      ctx.beginPath();ctx.ellipse(hndx+foff,hdy-hndh*fhs[fi]*.5,hndw*fws[fi],hndh*fhs[fi],0,0,Math.PI*2);
      ctx.fillStyle=skin;ctx.fill();ctx.strokeStyle=vdark;ctx.lineWidth=.55;ctx.stroke();
      for(const kk of[.24,.52]){
        ctx.beginPath();ctx.arc(hndx+foff,hdy-hndh*fhs[fi]*kk,hndw*fws[fi]*.64,Math.PI*.1,Math.PI*.9);
        ctx.strokeStyle='rgba(0,0,0,.09)';ctx.lineWidth=.55;ctx.stroke();
      }
    }
  }

  // ── SHOULDERS ──
  for(const s of[-1,1]){
    const shx=cx2+s*(sw2+bw*.042), shy=sY+bh*.022, shr=bw*(isMale?.060:.054);
    ctx.beginPath();ctx.ellipse(shx,shy,shr*1.14,shr*.86,s*.28,0,Math.PI*2);
    ctx.fillStyle=radG(shx,shy,shr*1.4);ctx.fill();ctx.strokeStyle=vdark;ctx.lineWidth=.8;ctx.stroke();
  }

  // ── NECK ──
  const nw=bw*(isMale?.098:.086), ny0=Y(.122), ny1=sY;
  ctx.beginPath();
  ctx.moveTo(cx2-nw*.50,ny0);
  ctx.bezierCurveTo(cx2-nw*.56,ny0+bh*.01,cx2-nw*.57,ny1-bh*.008,cx2-nw*.57,ny1);
  ctx.lineTo(cx2+nw*.57,ny1);
  ctx.bezierCurveTo(cx2+nw*.57,ny1-bh*.008,cx2+nw*.56,ny0+bh*.01,cx2+nw*.50,ny0);
  ctx.closePath();
  ctx.fillStyle=rg(cx2-nw*.62,ny0,cx2+nw*.62,ny0,skin,dark);ctx.fill();ctx.strokeStyle=vdark;ctx.lineWidth=.8;ctx.stroke();
  // SCM muscle lines
  for(const s of[-1,1]){
    ctx.beginPath();ctx.moveTo(cx2+s*nw*.14,ny0);ctx.lineTo(cx2+s*nw*.42,ny1);
    ctx.strokeStyle='rgba(0,0,0,.07)';ctx.lineWidth=.8;ctx.stroke();
  }

  // ── HEAD: skull + jaw shape ──
  const hx=X(.5), hy=Y(.062), hrx=bw*.120, hry=bh*.064;
  ctx.beginPath();
  ctx.moveTo(hx,hy-hry); // crown
  ctx.bezierCurveTo(hx+hrx*.97,hy-hry,hx+hrx,hy+hry*.08,hx+hrx*.88,hy+hry*.34);
  ctx.bezierCurveTo(hx+hrx*.70,hy+hry*.76,hx+hrx*.38,hy+hry,hx,hy+hry);
  ctx.bezierCurveTo(hx-hrx*.38,hy+hry,hx-hrx*.70,hy+hry*.76,hx-hrx*.88,hy+hry*.34);
  ctx.bezierCurveTo(hx-hrx,hy+hry*.08,hx-hrx*.97,hy-hry,hx,hy-hry);
  ctx.closePath();
  const hg=ctx.createRadialGradient(hx-hrx*.22,hy-hry*.28,0,hx,hy,hrx*1.12);
  hg.addColorStop(0,light);hg.addColorStop(.52,skin);hg.addColorStop(1,dark);
  ctx.fillStyle=hg;ctx.fill();ctx.strokeStyle=vdark;ctx.lineWidth=.9;ctx.stroke();
  // ears
  for(const s of[-1,1]){
    const ex2=hx+s*hrx*.94,ey2=hy+hry*.08,erx=hrx*.145,ery=hry*.29;
    ctx.beginPath();ctx.ellipse(ex2,ey2,erx,ery,0,0,Math.PI*2);ctx.fillStyle=skin;ctx.fill();ctx.strokeStyle=vdark;ctx.lineWidth=.6;ctx.stroke();
    ctx.beginPath();ctx.ellipse(ex2-s*erx*.22,ey2,erx*.62,ery*.68,0,0,Math.PI*2);ctx.strokeStyle=hexDarker(skin,28);ctx.lineWidth=.55;ctx.stroke();
    ctx.beginPath();ctx.ellipse(ex2-s*erx*.12,ey2+ery*.12,erx*.28,ery*.25,0,0,Math.PI*2);ctx.strokeStyle=hexDarker(skin,22);ctx.lineWidth=.5;ctx.stroke();
  }

  // ── HAIR ──
  if(isMale){
    // close crop — dark cap
    ctx.beginPath();
    ctx.moveTo(hx-hrx*.94,hy-hry*.30);
    ctx.bezierCurveTo(hx-hrx*.92,hy-hry*1.14,hx+hrx*.92,hy-hry*1.14,hx+hrx*.94,hy-hry*.30);
    ctx.bezierCurveTo(hx+hrx*.96,hy-hry*.06,hx,hy-hry*1.06,hx-hrx*.96,hy-hry*.06);
    ctx.closePath();
    ctx.fillStyle=hairCol;ctx.fill();
    // hairline
    ctx.beginPath();ctx.moveTo(hx-hrx*.80,hy-hry*.30);
    ctx.bezierCurveTo(hx-hrx*.65,hy-hry*.60,hx,hy-hry*.70,hx+hrx*.65,hy-hry*.60);
    ctx.lineTo(hx+hrx*.80,hy-hry*.30);
    ctx.strokeStyle='rgba(0,0,0,.13)';ctx.lineWidth=1.3;ctx.stroke();
  } else {
    // long hair panels
    for(const s of[-1,1]){
      ctx.beginPath();
      ctx.moveTo(hx+s*hrx*.44,hy-hry*.96);
      ctx.bezierCurveTo(hx+s*hrx*1.42,hy-hry*.46,hx+s*hrx*1.62,hy+hry*2.6,hx+s*hrx*1.22,sY+bh*.10);
      ctx.bezierCurveTo(hx+s*hrx*.90,sY+bh*.10,hx+s*hrx*.86,hy+hry*1.82,hx+s*hrx*.88,hy+hry*.48);
      ctx.bezierCurveTo(hx+s*hrx*.88,hy-hry*.08,hx+s*hrx*.42,hy-hry*.92,hx+s*hrx*.44,hy-hry*.96);
      ctx.closePath();ctx.fillStyle=hairCol;ctx.fill();
      // highlight streak
      ctx.beginPath();
      ctx.moveTo(hx+s*hrx*.58,hy-hry*.80);
      ctx.bezierCurveTo(hx+s*hrx*1.0,hy+hry*.5,hx+s*hrx*1.1,hy+hry*1.8,hx+s*hrx*.96,sY+bh*.05);
      ctx.strokeStyle='rgba(255,255,255,.06)';ctx.lineWidth=bw*.022;ctx.stroke();
    }
    // top cap
    ctx.beginPath();
    ctx.moveTo(hx-hrx*.90,hy-hry*.28);
    ctx.bezierCurveTo(hx-hrx*.92,hy-hry*1.12,hx+hrx*.92,hy-hry*1.12,hx+hrx*.90,hy-hry*.28);
    ctx.bezierCurveTo(hx+hrx*.88,hy-hry*.16,hx,hy-hry*1.06,hx-hrx*.88,hy-hry*.16);
    ctx.closePath();ctx.fillStyle=hairCol;ctx.fill();
    // center part
    ctx.beginPath();ctx.moveTo(hx,hy-hry*1.08);ctx.lineTo(hx,hy-hry*.14);
    ctx.strokeStyle='rgba(0,0,0,.16)';ctx.lineWidth=.85;ctx.stroke();
  }

  // ── FACE FEATURES ──
  const faceY=hy; // face center
  // Eyebrows
  for(const s of[-1,1]){
    const bx2=hx+s*hrx*.41, by2=hy-hry*.34;
    ctx.beginPath();
    ctx.moveTo(bx2-s*hrx*.22,by2+hry*.08);
    ctx.bezierCurveTo(bx2-s*hrx*.04,by2-hry*.10,bx2+s*hrx*.12,by2-hry*.08,bx2+s*hrx*.22,by2+hry*.04);
    ctx.strokeStyle=hairCol;ctx.lineWidth=isMale?1.7:1.3;ctx.lineCap='round';ctx.stroke();ctx.lineCap='butt';
  }
  // Eyes
  for(const s of[-1,1]){
    const ex2=hx+s*hrx*.40, ey2=hy-hry*.12, ew=hrx*.212, eh=hry*.130;
    // sclera
    ctx.beginPath();ctx.ellipse(ex2,ey2,ew,eh,0,0,Math.PI*2);ctx.fillStyle='#f5f0ea';ctx.fill();
    // iris gradient
    const irg=ctx.createRadialGradient(ex2-ew*.12,ey2-eh*.18,0,ex2,ey2,ew*.62);
    irg.addColorStop(0,'#7aaa82');irg.addColorStop(.48,'#3d6e44');irg.addColorStop(1,'#1e3a22');
    ctx.beginPath();ctx.ellipse(ex2,ey2,ew*.58,eh*.90,0,0,Math.PI*2);ctx.fillStyle=irg;ctx.fill();
    // pupil
    ctx.beginPath();ctx.ellipse(ex2,ey2,ew*.28,eh*.44,0,0,Math.PI*2);ctx.fillStyle='#080808';ctx.fill();
    // catchlight
    ctx.beginPath();ctx.ellipse(ex2-ew*.14,ey2-eh*.22,ew*.075,eh*.11,0,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.72)';ctx.fill();
    ctx.beginPath();ctx.ellipse(ex2+ew*.08,ey2+eh*.18,ew*.04,eh*.06,0,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.28)';ctx.fill();
    // upper eyelid (arc)
    ctx.beginPath();ctx.moveTo(ex2-ew,ey2);ctx.bezierCurveTo(ex2-ew*.5,ey2-eh*1.22,ex2+ew*.5,ey2-eh*1.22,ex2+ew,ey2);
    ctx.strokeStyle=hexDarker(skin,125);ctx.lineWidth=1.05;ctx.stroke();
    // upper eyelid crease (shadow)
    ctx.beginPath();ctx.moveTo(ex2-ew*.9,ey2-eh*.18);ctx.bezierCurveTo(ex2-ew*.35,ey2-eh*1.0,ex2+ew*.35,ey2-eh*1.0,ex2+ew*.9,ey2-eh*.18);
    ctx.strokeStyle='rgba(0,0,0,.10)';ctx.lineWidth=.7;ctx.stroke();
    // eyelashes (upper, 6 strokes)
    for(let li=0;li<6;li++){
      const t=li/5, ang=Math.PI*(1+t*.94)-.08;
      ctx.beginPath();ctx.moveTo(ex2+ew*Math.cos(ang),ey2-eh*Math.sin(ang)*1.04);
      ctx.lineTo(ex2+ew*Math.cos(ang)*1.14,ey2-eh*Math.sin(ang)*1.28);
      ctx.strokeStyle=hexDarker(skin,145);ctx.lineWidth=.7;ctx.stroke();
    }
    // lower lash line
    ctx.beginPath();ctx.moveTo(ex2-ew*.88,ey2+eh*.1);ctx.bezierCurveTo(ex2-ew*.3,ey2+eh*.68,ex2+ew*.3,ey2+eh*.68,ex2+ew*.88,ey2+eh*.1);
    ctx.strokeStyle='rgba(0,0,0,.11)';ctx.lineWidth=.55;ctx.stroke();
    // inner corner
    ctx.beginPath();ctx.ellipse(ex2-s*ew*.80,ey2,ew*.12,eh*.20,0,0,Math.PI*2);ctx.fillStyle='rgba(220,135,135,.28)';ctx.fill();
  }
  // Nose bridge & tip
  const nx=hx, nbaseY=hy+hry*.24;
  for(const s of[-1,1]){
    ctx.beginPath();ctx.moveTo(nx+s*hrx*.054,hy-hry*.08);ctx.bezierCurveTo(nx+s*hrx*.09,hy+hry*.10,nx+s*hrx*.112,nbaseY-hry*.10,nx+s*hrx*.118,nbaseY);
    ctx.strokeStyle='rgba(0,0,0,0.07)';ctx.lineWidth=.7;ctx.stroke();
  }
  // tip
  ctx.beginPath();ctx.ellipse(nx,nbaseY,hrx*.146,hry*.10,0,0,Math.PI*2);ctx.fillStyle=hexDarker(skin,20);ctx.fill();
  // nostrils
  for(const s of[-1,1]){
    ctx.beginPath();ctx.ellipse(nx+s*hrx*.135,nbaseY+hry*.04,hrx*.058,hry*.052,s*-.5,0,Math.PI*2);
    ctx.fillStyle=hexDarker(skin,58);ctx.fill();
  }
  // nose highlight
  ctx.beginPath();ctx.ellipse(nx-hrx*.02,nbaseY-hry*.04,hrx*.042,hry*.030,0,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.17)';ctx.fill();
  // philtrum
  ctx.beginPath();ctx.moveTo(nx-hrx*.062,nbaseY+hry*.12);ctx.lineTo(nx-hrx*.062,hy+hry*.52);
  ctx.moveTo(nx+hrx*.062,nbaseY+hry*.12);ctx.lineTo(nx+hrx*.062,hy+hry*.52);
  ctx.strokeStyle='rgba(0,0,0,.055)';ctx.lineWidth=.6;ctx.stroke();
  // Lips
  const lipY=hy+hry*.58, lipW=hrx*.295, lipUH=hry*.075, lipLH=hry*.108;
  // upper lip - cupid's bow
  ctx.beginPath();
  ctx.moveTo(hx-lipW,lipY);
  ctx.bezierCurveTo(hx-lipW*.5,lipY-lipUH*.55,hx-lipW*.18,lipY-lipUH,hx,lipY-lipUH*.28);
  ctx.bezierCurveTo(hx+lipW*.18,lipY-lipUH,hx+lipW*.5,lipY-lipUH*.55,hx+lipW,lipY);
  ctx.strokeStyle=lipCol;ctx.lineWidth=.75;ctx.stroke();
  // upper lip body
  ctx.beginPath();
  ctx.moveTo(hx-lipW,lipY);ctx.bezierCurveTo(hx-lipW*.5,lipY+lipUH*.42,hx+lipW*.5,lipY+lipUH*.42,hx+lipW,lipY);
  ctx.closePath();ctx.fillStyle=lipCol;ctx.fill();
  // lower lip
  ctx.beginPath();ctx.moveTo(hx-lipW,lipY);ctx.bezierCurveTo(hx-lipW*.48,lipY+lipLH*1.42,hx+lipW*.48,lipY+lipLH*1.42,hx+lipW,lipY);ctx.closePath();
  const lpg=ctx.createLinearGradient(hx,lipY,hx,lipY+lipLH*1.4);
  lpg.addColorStop(0,lipCol);lpg.addColorStop(.5,hexLighter(skin,-15));lpg.addColorStop(1,hexDarker(skin,38));
  ctx.fillStyle=lpg;ctx.fill();ctx.strokeStyle='rgba(0,0,0,.10)';ctx.lineWidth=.5;ctx.stroke();
  // lower lip highlight
  ctx.beginPath();ctx.ellipse(hx,lipY+lipLH*.75,lipW*.26,lipLH*.18,0,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.14)';ctx.fill();

  // ── GENDER CHEST / ABS / GENITALIA ──
  if(isMale){
    // pectorals
    for(const s of[-1,1]){
      const px=cx2+s*sw2*.46, py=Y(.205), prx=sw2*.40, pry=bh*.046;
      const pg=ctx.createRadialGradient(px+s*prx*.14,py-pry*.30,0,px,py,prx);
      pg.addColorStop(0,'rgba(255,255,255,.05)');pg.addColorStop(.6,'rgba(0,0,0,.0)');pg.addColorStop(1,'rgba(0,0,0,.08)');
      ctx.beginPath();ctx.ellipse(px,py,prx,pry,s*.10,0,Math.PI*2);ctx.fillStyle=pg;ctx.fill();
      // nipple
      ctx.beginPath();ctx.ellipse(px+s*prx*.06,py+pry*.38,prx*.068,pry*.10,0,0,Math.PI*2);ctx.fillStyle=areola;ctx.fill();
      ctx.beginPath();ctx.ellipse(px+s*prx*.06,py+pry*.38,prx*.030,pry*.045,0,0,Math.PI*2);ctx.fillStyle=nipCol;ctx.fill();
    }
    // abs (3 rows × 2 sides)
    for(let row=0;row<3;row++) for(const s of[-1,1]){
      ctx.beginPath();ctx.ellipse(cx2+s*ww2*.43,Y(.292+row*.050),ww2*.28,bh*.014,0,0,Math.PI*2);
      ctx.fillStyle='rgba(0,0,0,.065)';ctx.fill();
    }
    // oblique lines
    for(const s of[-1,1]) for(let r=0;r<3;r++){
      ctx.beginPath();ctx.moveTo(cx2+s*ww2*.54,Y(.282+r*.04));ctx.lineTo(cx2+s*sw2*.82,Y(.302+r*.04));
      ctx.strokeStyle='rgba(0,0,0,.05)';ctx.lineWidth=.7;ctx.stroke();
    }
    // genitalia — pubic mound
    const pmw=hw2*.68,pmh=bh*.024,pmY=hpY+pmh*.72;
    ctx.beginPath();ctx.ellipse(cx2,pmY,pmw,pmh*1.42,0,0,Math.PI*2);
    ctx.fillStyle=rg(cx2-pmw,pmY-pmh,cx2+pmw,pmY+pmh,skin,hexDarker(skin,22));ctx.fill();
    // scrotum
    const scrY=Y(.592), scrR=bw*.040;
    for(const s of[-1,1]){ctx.beginPath();ctx.ellipse(cx2+s*scrR*.58,scrY,scrR*.88,scrR*.80,s*.18,0,Math.PI*2);ctx.fillStyle=hexDarker(skin,32);ctx.fill();ctx.strokeStyle=vdark;ctx.lineWidth=.7;ctx.stroke();}
    ctx.beginPath();ctx.moveTo(cx2,scrY-scrR*.62);ctx.lineTo(cx2,scrY+scrR*.62);ctx.strokeStyle=vdark;ctx.lineWidth=.65;ctx.stroke();
    // shaft
    const pnW=bw*.050,pnH=bh*.072,pnY=Y(.548);
    const psg=ctx.createLinearGradient(cx2-pnW/2,0,cx2+pnW/2,0);
    psg.addColorStop(0,dark);psg.addColorStop(.28,skin);psg.addColorStop(.5,light);psg.addColorStop(.72,skin);psg.addColorStop(1,dark);
    ctx.beginPath();ctx.moveTo(cx2-pnW*.46,pnY);ctx.lineTo(cx2+pnW*.46,pnY);ctx.lineTo(cx2+pnW*.38,pnY+pnH);ctx.lineTo(cx2-pnW*.38,pnY+pnH);ctx.closePath();ctx.fillStyle=psg;ctx.fill();ctx.strokeStyle=vdark;ctx.lineWidth=.8;ctx.stroke();
    // dorsal vein
    ctx.beginPath();ctx.moveTo(cx2,pnY+pnH*.08);ctx.lineTo(cx2,pnY+pnH*.9);ctx.strokeStyle='rgba(0,0,0,.07)';ctx.lineWidth=.8;ctx.stroke();
    // glans
    const glanY=pnY+pnH, gR=pnW*.48;
    ctx.beginPath();ctx.ellipse(cx2,glanY+gR*.56,gR*1.06,gR*.72,0,0,Math.PI*2);ctx.fillStyle=hexDarker(skin,34);ctx.fill();ctx.strokeStyle=vdark;ctx.lineWidth=.8;ctx.stroke();
    // corona ridge
    ctx.beginPath();ctx.ellipse(cx2,glanY+gR*.08,gR*1.0,gR*.22,0,0,Math.PI*2);ctx.strokeStyle=vdark;ctx.lineWidth=.6;ctx.stroke();
    // meatus
    ctx.beginPath();ctx.ellipse(cx2,glanY+gR*1.06,gR*.12,gR*.08,0,0,Math.PI*2);ctx.fillStyle=vdark;ctx.fill();
    // glans highlight
    ctx.beginPath();ctx.ellipse(cx2-gR*.22,glanY+gR*.28,gR*.22,gR*.14,.6,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.09)';ctx.fill();
  } else {
    // breasts
    for(const s of[-1,1]){
      const brcx=cx2+s*sw2*.38, brcy=Y(.265), brrx=sw2*.390, brry=bh*.074;
      const brg=ctx.createRadialGradient(brcx+s*brrx*.18,brcy-brry*.32,0,brcx,brcy,brrx*1.12);
      brg.addColorStop(0,light);brg.addColorStop(.54,skin);brg.addColorStop(1,dark);
      ctx.beginPath();ctx.ellipse(brcx,brcy,brrx,brry,s*-.08,0,Math.PI*2);ctx.fillStyle=brg;ctx.fill();ctx.strokeStyle='rgba(0,0,0,.07)';ctx.lineWidth=.8;ctx.stroke();
      // under-breast shadow
      ctx.beginPath();ctx.ellipse(brcx,brcy+brry*.80,brrx*.88,bh*.012,s*-.05,0,Math.PI);ctx.strokeStyle='rgba(0,0,0,.10)';ctx.lineWidth=1.0;ctx.stroke();
      // areola
      ctx.beginPath();ctx.ellipse(brcx+s*brrx*.06,brcy+brry*.28,brrx*.135,brry*.135,0,0,Math.PI*2);ctx.fillStyle=areola;ctx.fill();
      // nipple
      ctx.beginPath();ctx.ellipse(brcx+s*brrx*.06,brcy+brry*.28,brrx*.050,brry*.050,0,0,Math.PI*2);ctx.fillStyle=nipCol;ctx.fill();
      // breast highlight
      ctx.beginPath();ctx.ellipse(brcx+s*brrx*.12,brcy-brry*.28,brrx*.28,brry*.22,.3*s,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.07)';ctx.fill();
    }
    // waist curves (subtle)
    ctx.beginPath();ctx.moveTo(cx2,Y(.39));ctx.lineTo(cx2,Y(.44));ctx.strokeStyle='rgba(0,0,0,.04)';ctx.lineWidth=.9;ctx.stroke();
    // female genitalia
    const monW=hw2*.65,monH=bh*.034,monY=hpY+monH;
    ctx.beginPath();ctx.ellipse(cx2,monY,monW,monH*1.44,0,0,Math.PI*2);
    ctx.fillStyle=rg(cx2-monW,monY-monH,cx2+monW,monY+monH,skin,hexDarker(skin,20));ctx.fill();
    const labY0=hpY+monH*.82, labH=bh*.080, labW=bw*.058;
    // labia majora
    for(const s of[-1,1]){
      ctx.beginPath();ctx.moveTo(cx2+s*labW*.14,labY0);
      ctx.bezierCurveTo(cx2+s*labW,labY0,cx2+s*labW*.88,labY0+labH*.52,cx2+s*labW*.72,labY0+labH*.84);
      ctx.bezierCurveTo(cx2+s*labW*.52,labY0+labH*1.06,cx2+s*labW*.15,labY0+labH,cx2,labY0+labH);
      ctx.closePath();ctx.fillStyle=hexDarker(skin,24);ctx.fill();ctx.strokeStyle=vdark;ctx.lineWidth=.7;ctx.stroke();
    }
    // labia minora
    for(const s of[-1,1]){
      ctx.save();ctx.globalAlpha=.62;
      ctx.beginPath();ctx.moveTo(cx2+s*labW*.08,labY0+labH*.12);
      ctx.bezierCurveTo(cx2+s*labW*.40,labY0+labH*.24,cx2+s*labW*.32,labY0+labH*.64,cx2+s*labW*.18,labY0+labH*.90);
      ctx.bezierCurveTo(cx2+s*labW*.08,labY0+labH*.97,cx2+s*labW*.02,labY0+labH*.94,cx2,labY0+labH);
      ctx.closePath();ctx.fillStyle=hexDarker(skin,56);ctx.fill();ctx.restore();
    }
    // clitoral hood
    ctx.beginPath();ctx.ellipse(cx2,labY0+labH*.08,labW*.23,labH*.074,0,0,Math.PI*2);ctx.fillStyle=hexDarker(skin,60);ctx.fill();
    // vaginal opening
    ctx.beginPath();ctx.ellipse(cx2,labY0+labH*.72,labW*.11,labH*.14,0,0,Math.PI*2);ctx.save();ctx.globalAlpha=.52;ctx.fillStyle=vdark;ctx.fill();ctx.restore();
  }

  // ── HIGHLIGHT ──
  if(highlightArea && CR_AREA_BOXES[highlightArea]){
    const [ax0,ay0,ax1,ay1]=CR_AREA_BOXES[highlightArea];
    const rx=bx+ax0*bw,ry=by+ay0*bh,rw=(ax1-ax0)*bw,rh=(ay1-ay0)*bh;
    ctx.save();ctx.strokeStyle='rgba(192,132,252,.92)';ctx.lineWidth=2.5;ctx.setLineDash([5,4]);
    ctx.strokeRect(rx-4,ry-4,rw+8,rh+8);ctx.fillStyle='rgba(192,132,252,.09)';ctx.fillRect(rx-4,ry-4,rw+8,rh+8);ctx.setLineDash([]);
    ctx.fillStyle='rgba(192,132,252,.92)';ctx.font=`bold ${Math.max(9,Math.round(bw*.048))}px sans-serif`;ctx.textAlign='center';
    ctx.fillText(highlightArea.charAt(0).toUpperCase()+highlightArea.slice(1),(2*rx+rw)/2,ry-7);
    ctx.restore();
  }

  ctx.restore();
  return {bx,by,bw,bh};
}


