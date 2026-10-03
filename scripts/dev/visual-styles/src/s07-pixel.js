// 7 · Pixel art: the scene drawn at a quarter of the resolution, snapped to a fixed palette with ordered dithering,
// then scaled up without smoothing. Mechanics are sprites: sweat drops, a "!" box, stars, a flag.
STYLES.pixel = (function () {
  const SC = 4; // screen px per art pixel
  const PPMB = 38; // art pixels per metre
  const Y0 = -0.9, Y1 = 5.0;
  const PAL = ['#1B1A2B', '#33304A', '#5FA8D3', '#9CD3E8', '#D6EEF2', '#F4F4F4', '#1F4D3A', '#2E7D4F', '#58A55C', '#9BC76A', '#5E5244', '#8C7B62', '#B3A07F', '#D6C6A2', '#EDE2C4', '#E9D8A6', '#C7AF7A', '#3B5DC9', '#7E9BE8', '#B13E53', '#E86A7E', '#F2B48C', '#C98762', '#EF7D57', '#29366F', '#5D3A2A', '#FFCD75', '#41A6F6'];
  const RGB = PAL.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

  /** Snaps a canvas's pixels to the palette (with `dither` of ordered noise); alpha below half is cut. */
  function quantize(x, w, h, dither) {
    const img = x.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      if (d[i + 3] < 128) { d[i + 3] = 0; continue; }
      const t = BAYER[(((p / w) | 0) & 3) * 4 + ((p % w) & 3)] * dither;
      const r = d[i] + t, g = d[i + 1] + t, b = d[i + 2] + t;
      let best = 0, bd = 1e12;
      for (let j = 0; j < RGB.length; j++) { const c = RGB[j]; const dr = r - c[0], dg = g - c[1], db = b - c[2]; const dd = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11; if (dd < bd) { bd = dd; best = j; } }
      const c = RGB[best]; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  }

  function init(env) {
    const { C, K, W, H } = env;
    const BW = Math.ceil(W / SC), BH = Math.ceil(H / SC);
    const WH = Math.ceil((Y1 - Y0) * PPMB);
    const world = K.layer(BW, WH, 1);
    const x = world.x;
    x.imageSmoothingEnabled = false;
    const S = K.cam(BW, WH, PPMB, 0, (Y0 + Y1) / 2);
    const proj = C.views.front;
    const sky = x.createLinearGradient(0, 0, 0, S([0, 0.9])[1]);
    sky.addColorStop(0, '#4F98C8'); sky.addColorStop(0.6, '#9CD3E8'); sky.addColorStop(1, '#E2F2F2');
    x.fillStyle = sky; x.fillRect(0, 0, BW, WH);
    // Clouds as clusters of discs.
    const r = C.rng(8);
    for (let i = 0; i < 6; i++) {
      const cx = r() * BW, cy = 8 + r() * WH * 0.45, s = 3 + r() * 3;
      x.fillStyle = '#F4F4F4';
      for (let j = 0; j < 5; j++) { x.beginPath(); x.arc(cx + (j - 2) * s * 0.9, cy + (j % 2) * 1.5, s * (j === 2 ? 1.4 : 1), 0, Math.PI * 2); x.fill(); }
      x.fillStyle = '#D6EEF2'; x.fillRect(cx - s * 2.5, cy + s * 0.6, s * 5, 1.5);
    }
    // Hills and pines.
    const hill = (base, amp, col, f) => { x.fillStyle = col; x.beginPath(); x.moveTo(0, WH); for (let i = 0; i <= BW; i += 2) x.lineTo(i, S([0, base])[1] - amp * PPMB * (0.5 + 0.5 * Math.sin(i * f))); x.lineTo(BW, WH); x.closePath(); x.fill(); };
    hill(1.0, 0.45, '#58A55C', 0.09);
    for (let i = 0; i < 9; i++) {
      const tx = 4 + i * (BW / 9) + r() * 6, b = S([0, 0.95])[1], h = 26 + r() * 22;
      x.fillStyle = '#5D3A2A'; x.fillRect(Math.round(tx), b - 6, 2, 8);
      for (let t = 0; t < 3; t++) { x.fillStyle = t === 1 ? '#2E7D4F' : '#1F4D3A'; x.beginPath(); x.moveTo(tx - 9 + t * 2, b - 4 - t * h * 0.28); x.lineTo(tx + 1, b - h * (0.55 + t * 0.2)); x.lineTo(tx + 11 - t * 2, b - 4 - t * h * 0.28); x.closePath(); x.fill(); }
    }
    hill(0.62, 0.2, '#2E7D4F', 0.13);
    // Sand.
    x.fillStyle = '#E9D8A6'; x.fillRect(0, S([0, 0.4])[1], BW, WH);
    x.fillStyle = '#C7AF7A';
    for (let i = 0; i < 60; i++) x.fillRect(Math.round(r() * BW), Math.round(S([0, 0.4])[1] + 2 + r() * (WH - S([0, 0.4])[1])), 1, 1);
    // The block: fill, light from the left, shadow on the right, a hard dark edge.
    const out = K.outlinePx(S, proj);
    x.save();
    K.path(x, out); x.fillStyle = '#B3A07F'; x.fill(); x.clip();
    const xs = out.map((p) => p[0]);
    const bx0 = Math.min(...xs), bx1 = Math.max(...xs);
    const g = x.createLinearGradient(bx0, 0, bx1, 0);
    g.addColorStop(0, '#D6C6A2'); g.addColorStop(0.45, '#B3A07F'); g.addColorStop(0.8, '#8C7B62'); g.addColorStop(1, '#5E5244');
    x.fillStyle = g; x.fillRect(0, 0, BW, WH);
    // Speckle and cracks.
    for (let i = 0; i < 160; i++) { x.fillStyle = r() < 0.5 ? '#8C7B62' : '#D6C6A2'; x.fillRect(Math.round(bx0 + r() * (bx1 - bx0)), Math.round(S([0, 2.5])[1] + r() * (S([0, 0])[1] - S([0, 2.5])[1])), 1, 1); }
    x.strokeStyle = '#5E5244'; x.lineWidth = 1;
    for (const [sx, sy] of [[0.25, 1.9], [0.75, 1.1], [0.55, 0.5]]) { const p = S([C.lerp(-1.2, 1.2, sx), sy]); x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(p[0] + 2, p[1] + 4); x.lineTo(p[0] - 1, p[1] + 8); x.stroke(); }
    x.restore();
    const cap = K.capPx(S, proj, 1.3);
    K.path(x, cap); x.fillStyle = '#EDE2C4'; x.fill();
    x.strokeStyle = '#33304A'; x.lineWidth = 1; K.path(x, out); x.stroke(); K.path(x, cap); x.stroke();
    // Pads.
    K.pads.forEach((pad, i) => {
      const f = K.boxFaces(pad, proj, S);
      K.path(x, f.front); x.fillStyle = i ? '#B13E53' : '#3B5DC9'; x.fill();
      K.path(x, f.top); x.fillStyle = i ? '#E86A7E' : '#7E9BE8'; x.fill();
      x.strokeStyle = '#1B1A2B'; K.path(x, [...f.top]); x.stroke();
    });
    // Holds: a light lip over a dark shadow pixel row.
    for (const h of env.scene.holds) {
      const c = S(proj([h.x, h.y, h.z]));
      const w = Math.max(2, Math.round(K.dims(h)[0] * PPMB)), hh = h.type === 'sloper' ? 2 : 1;
      x.fillStyle = '#5E5244'; x.fillRect(Math.round(c[0] - w / 2), Math.round(c[1]) + 1, w, 1);
      x.fillStyle = '#EDE2C4'; x.fillRect(Math.round(c[0] - w / 2), Math.round(c[1]) + 1 - hh, w, hh);
    }
    quantize(x, BW, WH, 24);
    const fb = K.layer(BW, BH, 1);
    const dyn = K.layer(BW, BH, 1);
    return { world, fb, dyn, BW, BH, WH };
  }

  /** A 1-px outlined sprite from a little pixel map: rows of characters, `pal` maps characters to colours. */
  function sprite(x, rows, px, py, pal) {
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const c = pal[row[i]]; if (c) { x.fillStyle = c; x.fillRect(px + i, py + j, 1, 1); } } });
  }
  const BANG = ['.kkkkk.', 'kwwrwwk', 'kwwrwwk', 'kwwrwwk', 'kwwwwwk', 'kwwrwwk', '.kkkkk.', '...k...'];
  const DROP = ['.b.', 'bbb', 'bbb', '.b.'];
  const STAR = ['..y..', '.yyy.', 'yyyyy', '.y.y.'];
  const SPAL = { k: '#1B1A2B', w: '#F4F4F4', r: '#B13E53', b: '#41A6F6', y: '#FFCD75' };

  function draw(ctx, env) {
    const { C, K, W, H, cache, sm, time } = env;
    const { world, fb, dyn, BW, BH } = cache;
    const proj = C.views.front;
    const half = BH / PPMB / 2;
    const cy = C.clamp(C.followY(time, proj, -9, 9) + 0.25, Y0 + half, Y1 - half);
    // Whole art pixels only.
    const top = Math.round((Y1 - (cy + half)) * PPMB);
    const cyS = Y1 - (top / PPMB) - half;
    fb.x.imageSmoothingEnabled = false;
    fb.x.clearRect(0, 0, BW, BH);
    fb.x.drawImage(world.c, 0, -top);
    const S = K.cam(BW, BH, PPMB, 0, cyS);
    const x = dyn.x;
    x.clearRect(0, 0, BW, BH);
    const hud = C.hudOf(sm);
    // Chalk.
    for (const id of C.touched(sm)) { const h = C.hold[id]; const c = S(proj([h.x, h.y, h.z])); x.fillStyle = '#F4F4F4'; const w = Math.max(2, Math.round(K.dims(h)[0] * PPMB)); x.fillRect(Math.round(c[0] - w / 2), Math.round(c[1]) - 1, w, 1); }
    // The climber: an ink outline pass, then colours.
    const body = K.parts(sm.pose, proj, S, K.depths.front);
    const k = body.k;
    const facing = sm.seg.kind === 'land' || sm.seg.kind === 'cheer' || (sm.seg.kind === 'fall' && sm.u > 0.6);
    x.lineCap = 'round'; x.lineJoin = 'round';
    const pass = (outline) => {
      for (const p of body.list) {
        if (p.kind === 'torso') { x.fillStyle = outline ? '#1B1A2B' : '#EF7D57'; x.strokeStyle = x.fillStyle; x.lineWidth = outline ? 3 : 1; K.path(x, p.q); x.fill(); x.stroke(); if (!outline) { x.fillStyle = '#29366F'; x.fillRect(Math.round(p.q[3][0]), Math.round(p.q[3][1]) - 1, Math.round(p.q[2][0] - p.q[3][0]) + 1, 2); } continue; }
        if (p.kind === 'head') {
          const r = 0.11 * PPMB * k;
          x.fillStyle = outline ? '#1B1A2B' : facing ? '#F2B48C' : '#5D3A2A';
          x.beginPath(); x.arc(p.c[0], p.c[1], r + (outline ? 1 : 0), 0, Math.PI * 2); x.fill();
          if (!outline && facing) { x.fillStyle = '#5D3A2A'; x.fillRect(Math.round(p.c[0] - r), Math.round(p.c[1] - r), Math.round(2 * r) + 1, 2); x.fillStyle = '#1B1A2B'; x.fillRect(Math.round(p.c[0] - 2), Math.round(p.c[1]), 1, 1); x.fillRect(Math.round(p.c[0] + 1), Math.round(p.c[1]), 1, 1); }
          continue;
        }
        const arm = p.limb[1] === 'H';
        const w = arm ? 2.2 : 3.2;
        x.strokeStyle = outline ? '#1B1A2B' : arm ? (p.kind === 'upper' ? '#EF7D57' : '#F2B48C') : '#29366F';
        x.lineWidth = w + (outline ? 2 : 0);
        K.line(x, p.a, p.b); x.stroke();
        if (!outline && p.kind === 'shin') { x.fillStyle = '#B13E53'; x.fillRect(Math.round(p.b[0]) - 1, Math.round(p.b[1]), 3, 2); }
      }
    };
    pass(true); pass(false);
    quantize(x, BW, BH, 0);
    // Sprites over the top.
    const head = body.P(body.b.head);
    const hx = Math.round(head[0]), hy = Math.round(head[1]);
    const ev = C.event(sm);
    if ((ev === 'slip' && sm.u > 0.45) || (ev === 'sketchy' && sm.u > 0.55) || (hud.fearUp && sm.u > 0.4)) sprite(x, BANG, hx + 5, hy - 14 + (Math.floor(time * 6) % 2), SPAL);
    if (hud.pump >= 8 && sm.seg.kind !== 'land' && sm.seg.kind !== 'cheer') { const ph = Math.floor(time * 8) % 6; sprite(x, DROP, hx - 7 - ph, hy - 4 + ph, SPAL); }
    if (sm.seg.kind === 'land') for (let i = 0; i < 3; i++) { const a = time * 4 + (i * Math.PI * 2) / 3; sprite(x, STAR, Math.round(hx - 2 + Math.cos(a) * 7), Math.round(hy - 8 + Math.sin(a) * 2), SPAL); }
    if (sm.seg.kind === 'cheer') {
      // A flag planted on the top.
      const fx = hx + 9, fy = hy - 10;
      x.fillStyle = '#1B1A2B'; x.fillRect(fx, fy, 1, 16);
      const wave = Math.floor(time * 6) % 2;
      x.fillStyle = '#B13E53'; x.fillRect(fx + 1, fy + wave, 7, 4); x.fillStyle = '#F4F4F4'; x.fillRect(fx + 3, fy + 1 + wave, 2, 2);
    }
    if (ev === 'slip' && sm.u > 0.48 && sm.u < 0.8) {
      const c = body.P(body.b[sm.seg.style.limb]);
      x.fillStyle = '#F4F4F4';
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, d = 3 + Math.floor((sm.u - 0.48) * 20); x.fillRect(Math.round(c[0] + Math.cos(a) * d), Math.round(c[1] + Math.sin(a) * d), 1, 1); }
    }
    fb.x.drawImage(dyn.c, 0, 0);
    // Up to the screen, crisp.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fb.c, 0, 0, BW * SC, BH * SC);
    // Pixel lettering on the screen.
    ctx.font = "8px 'Press Start 2P', monospace";
    ctx.textBaseline = 'top';
    const label = (t, x0, y0, col) => { ctx.fillStyle = '#1B1A2B'; ctx.fillText(t, x0 + 2, y0 + 2); ctx.fillStyle = col; ctx.fillText(t, x0, y0); };
    label(`TRY ${sm.attempt.n}`, 12, 12, '#F4F4F4');
    label(sm.attempt.mode === 'flash' ? 'FLASH' : 'REDPOINT', 12, 26, '#FFCD75');
    if (sm.seg.kind === 'cheer') { ctx.font = "16px 'Press Start 2P', monospace"; const t = 'SENT!'; const w = ctx.measureText(t).width; label(t, (W - w) / 2, 60, '#FFCD75'); }
    if (sm.seg.kind === 'land') { ctx.font = "16px 'Press Start 2P', monospace"; const t = 'OUCH'; const w = ctx.measureText(t).width; label(t, (W - w) / 2, 60, '#E86A7E'); }
  }

  return { name: 'Pixel art', fonts: ["8px 'Press Start 2P'"], init, draw };
})();
