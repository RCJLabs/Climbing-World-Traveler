// 4 · Isometric diorama: the block on a floating tile of forest floor, seen whole, tilt-shifted like a miniature.
// The climber is small; what matters shows as status bubbles over their head and marks on the problem's line.
STYLES.iso = (function () {
  const PPM = 53;
  const proj = (p) => [(p[0] - p[2]) * 0.866, p[1] - (p[0] + p[2]) * 0.5];
  const depth = (p) => p[0] + p[2] + p[1] * 0.2;
  const CAM = [0.577, 0.577, 0.577];
  const LIGHT = (() => { const v = [-0.3, 0.85, 0.45]; const l = Math.hypot(...v); return v.map((c) => c / l); })();
  const shade = (c, n, k = 1) => {
    const d = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    const f = (0.62 + 0.45 * d) * k;
    return `rgb(${Math.min(255, Math.round(c[0] * f))},${Math.min(255, Math.round(c[1] * f))},${Math.min(255, Math.round(c[2] * f))})`;
  };
  const CX = 0.0, CY = 0.75;
  const T = 2.15; // half-size of the tile, metres

  function init(env) {
    const { C, K, W, H, dpr } = env;
    const S = K.cam(W, H, PPM, CX, CY);
    const P = (p) => S(proj(p));
    const L = K.layer(W, H, dpr);
    const x = L.x;
    const bg = x.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#EEF2EC'); bg.addColorStop(1, '#D9E4DC');
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    const poly = (pts, col, line) => { x.beginPath(); pts.forEach((p, i) => { const q = P(p); i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); }); x.closePath(); x.fillStyle = col; x.fill(); if (line) { x.strokeStyle = line; x.lineWidth = 1; x.stroke(); } };
    // Soft shadow under the tile.
    const sc = P([0, -0.9, 0]);
    const sh = x.createRadialGradient(sc[0], sc[1] + 30, 10, sc[0], sc[1] + 30, 200);
    sh.addColorStop(0, 'rgba(60,80,70,0.28)'); sh.addColorStop(1, 'rgba(60,80,70,0)');
    x.fillStyle = sh; x.beginPath(); x.ellipse(sc[0], sc[1] + 30, 200, 60, 0, 0, Math.PI * 2); x.fill();
    // The tile: soil sides in layers, then the forest floor.
    const d = -0.75;
    poly([[T, 0, -T], [T, 0, T], [T, d, T], [T, d, -T]], '#7E5D41');
    poly([[-T, 0, T], [T, 0, T], [T, d, T], [-T, d, T]], '#946E4D');
    poly([[T, -0.18, -T], [T, -0.18, T], [T, -0.08, T], [T, -0.08, -T]], '#6A4C35');
    poly([[-T, -0.18, T], [T, -0.18, T], [T, -0.08, T], [-T, -0.08, T]], '#7D5A3E');
    poly([[T, 0, -T], [T, 0, T], [T, -0.06, T], [T, -0.06, -T]], '#8DA35D');
    poly([[-T, 0, T], [T, 0, T], [T, -0.06, T], [-T, -0.06, T]], '#9DB56A');
    poly([[-T, 0, -T], [T, 0, -T], [T, 0, T], [-T, 0, T]], '#B8C982');
    // Sand around the block and under the pads.
    x.save();
    const sand = []; for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; sand.push([0.1 + Math.cos(a) * 1.75 * (0.92 + 0.1 * K.hash(i)), 0, 0.2 + Math.sin(a) * 1.6 * (0.92 + 0.1 * K.hash(i + 9))]); }
    poly(sand.map((p) => [C.clamp(p[0], -T, T), 0, C.clamp(p[2], -T, T)]), '#E6DCC0');
    x.restore();
    // Grass tufts and fallen needles.
    const r = C.rng(77);
    for (let i = 0; i < 90; i++) {
      const p = [-T + r() * 2 * T, 0, -T + r() * 2 * T];
      if (Math.hypot(p[0] - 0.1, p[2] - 0.15) < 1.9) continue;
      const q = P(p);
      x.strokeStyle = r() < 0.5 ? '#7E9A4E' : '#93AE5E'; x.lineWidth = 1.2;
      for (let j = 0; j < 3; j++) { x.beginPath(); x.moveTo(q[0], q[1]); x.lineTo(q[0] + (j - 1) * 2.5, q[1] - 4 - r() * 3); x.stroke(); }
    }
    // Two smaller blocks: other problems on the same sector.
    const others = [];
    const mesh = K.boulderMesh(41, { depth: 1.6, nf: 6, nb: 8, taper: 0.35 });
    const blocks = [{ mesh, off: [0, 0, 0], scale: 1, main: true }];
    for (const [ox, oz, sc] of [[-1.55, -1.45, 0.5], [1.5, -1.5, 0.42]]) blocks.push({ mesh: K.boulderMesh(50 + ox * 10, { depth: 1.5, nf: 4, nb: 7, taper: 0.4 }), off: [ox, 0, oz], scale: sc });
    // Pines at the back corners and a bush.
    const trees = [[-1.75, -1.9, 2.3], [-0.5, -1.95, 2.9], [1.85, -0.3, 2.0], [0.85, -1.95, 2.5], [-1.9, -0.2, 1.7]];
    const items = [];
    for (const b of blocks) {
      const centre = [b.off[0], 0.9 * b.scale, b.off[2] - 0.6 * b.scale];
      for (const t of b.mesh.tris) {
        const p = t.map((v) => [b.off[0] + v[0] * b.scale, v[1] * b.scale, b.off[2] + v[2] * b.scale]);
        const n = K.triNormal(p, centre);
        if (n[0] * CAM[0] + n[1] * CAM[1] + n[2] * CAM[2] <= 0) continue;
        items.push({ p, col: shade(b.main ? [222, 196, 160] : [204, 192, 172], n, 0.95 + K.hash(items.length) * 0.1), d: (depth(p[0]) + depth(p[1]) + depth(p[2])) / 3 });
      }
    }
    for (const [tx, tz, h] of trees) {
      for (let tier = 0; tier < 3; tier++) {
        const y0 = h * (0.2 + tier * 0.24), y1 = y0 + h * 0.45, rad = 0.62 - tier * 0.15;
        const ring = [];
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.4; ring.push([tx + Math.cos(a) * rad, y0, tz + Math.sin(a) * rad]); }
        const apex = [tx, y1, tz];
        ring.forEach((p, i) => {
          const tri = [p, ring[(i + 1) % 6], apex];
          const n = K.triNormal(tri, [tx, y0 + 0.1, tz]);
          if (n[0] * CAM[0] + n[1] * CAM[1] + n[2] * CAM[2] <= 0) return;
          items.push({ p: tri, col: shade([86, 146, 108], n), d: depth([tx, y0, tz]) + 0.3 * tier });
        });
      }
      items.push({ p: [[tx - 0.07, 0, tz], [tx + 0.07, 0, tz], [tx + 0.07, h * 0.25, tz], [tx - 0.07, h * 0.25, tz]], col: '#8A5E3E', d: depth([tx, 0, tz]) - 0.5 });
    }
    items.sort((a, b) => a.d - b.d);
    for (const it of items) poly(it.p, it.col, it.col);
    // Holds on the face.
    for (const h of env.scene.holds) {
      const q = P([h.x, h.y, h.z]);
      x.fillStyle = h.type === 'sloper' ? '#B79A74' : '#9B7F5C';
      x.beginPath(); x.ellipse(q[0], q[1], Math.max(1.6, K.dims(h)[0] * PPM * 0.45), 1.4, -0.52, 0, Math.PI * 2); x.fill();
    }
    // Pads, a bag and a brush on the ground.
    K.pads.forEach((pad, i) => {
      const col = i ? [236, 128, 88] : [86, 140, 196];
      const c = [[pad.x0, 0, pad.z0], [pad.x1, 0, pad.z0], [pad.x1, 0, pad.z1], [pad.x0, 0, pad.z1]];
      const t = c.map((p) => [p[0], pad.t, p[2]]);
      poly([t[1], t[2], c[2], c[1]], shade(col, [1, 0, 0]));
      poly([t[3], t[2], c[2], c[3]], shade(col, [0, 0, 1]));
      poly(t, shade(col, [0, 1, 0]));
    });
    const bag = [1.25, 0, 1.5];
    poly([[bag[0], 0, bag[2]], [bag[0] + 0.35, 0, bag[2]], [bag[0] + 0.35, 0.45, bag[2]], [bag[0], 0.45, bag[2]]], '#5E7FA8');
    poly([[bag[0] + 0.35, 0, bag[2] - 0.25], [bag[0] + 0.35, 0, bag[2]], [bag[0] + 0.35, 0.45, bag[2]], [bag[0] + 0.35, 0.45, bag[2] - 0.25]], '#4B6A90');
    poly([[bag[0], 0.45, bag[2] - 0.25], [bag[0] + 0.35, 0.45, bag[2] - 0.25], [bag[0] + 0.35, 0.45, bag[2]], [bag[0], 0.45, bag[2]]], '#7596BE');
    // The problem's line, dotted on the face.
    const line = C.linePath();
    x.fillStyle = 'rgba(214,77,60,0.75)';
    for (let i = 0; i + 1 < line.length; i++) for (let t = 0; t < 1; t += 0.2) { const q = P(C.mix3(line[i], line[i + 1], t)); x.beginPath(); x.arc(q[0], q[1], 1.2, 0, Math.PI * 2); x.fill(); }
    // Tilt-shift: blur the top and bottom of the picture.
    const B = K.layer(W, H, dpr * 0.25);
    B.x.drawImage(L.c, 0, 0, W, H);
    const M = K.layer(W, H, dpr);
    M.x.drawImage(B.c, 0, 0, W, H);
    M.x.globalCompositeOperation = 'destination-in';
    const mg = M.x.createLinearGradient(0, 0, 0, H);
    mg.addColorStop(0, 'rgba(0,0,0,1)'); mg.addColorStop(0.2, 'rgba(0,0,0,0)'); mg.addColorStop(0.8, 'rgba(0,0,0,0)'); mg.addColorStop(1, 'rgba(0,0,0,1)');
    M.x.fillStyle = mg; M.x.fillRect(0, 0, W, H);
    x.drawImage(M.c, 0, 0, W, H);
    return { L, S, P };
  }

  /** A small rounded status bubble above `c` with an icon drawn by `icon(ctx, cx, cy)`. */
  function bubble(ctx, c, fill, icon) {
    const w = 30, h = 24, x0 = c[0] - w / 2, y0 = c[1] - h - 8;
    ctx.fillStyle = 'rgba(40,50,46,0.18)'; ctx.beginPath(); ctx.ellipse(c[0], c[1] + 1, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = fill; ctx.strokeStyle = '#2D3A34'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x0 + 6, y0); ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, 6); ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, 6);
    ctx.lineTo(c[0] + 4, y0 + h); ctx.lineTo(c[0], y0 + h + 6); ctx.lineTo(c[0] - 4, y0 + h);
    ctx.arcTo(x0, y0 + h, x0, y0, 6); ctx.arcTo(x0, y0, x0 + w, y0, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    icon(ctx, c[0], y0 + h / 2);
  }

  function draw(ctx, env) {
    const { C, K, W, H, cache, sm, time } = env;
    ctx.drawImage(cache.L.c, 0, 0, W, H);
    const P = cache.P;
    const hud = C.hudOf(sm);
    // Chalk on touched holds.
    for (const id of C.touched(sm)) { const h = C.hold[id]; const q = P([h.x, h.y, h.z]); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.ellipse(q[0], q[1] - 0.5, 2.6, 1.6, -0.52, 0, Math.PI * 2); ctx.fill(); }
    // High points of earlier attempts on the line.
    for (const A of env.scene.attempts.slice(0, sm.ai + (sm.seg.kind === 'land' ? 1 : 0))) {
      if (A.result.outcome === 'sent') continue;
      const h = C.hold.top;
      const q = P([h.x, h.y, h.z]);
      ctx.strokeStyle = '#D64D3C'; ctx.lineWidth = 2;
      K.line(ctx, [q[0] - 4, q[1] - 4], [q[0] + 4, q[1] + 4]); ctx.stroke(); K.line(ctx, [q[0] + 4, q[1] - 4], [q[0] - 4, q[1] + 4]); ctx.stroke();
      ctx.font = "800 10px Nunito, sans-serif"; ctx.fillStyle = '#D64D3C'; ctx.fillText(`${Math.round(100 * A.result.progress)}%`, q[0] + 7, q[1] + 3);
    }
    // The climber, small and rounded.
    const body = K.parts(sm.pose, proj, (v) => cache.S(v), depth);
    const k = body.k;
    const COL = { shirt: '#F06E52', pants: '#3C5A8C', skin: '#F2C4A0', hair: '#4A3426', shoe: '#2E2E36' };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const p of body.list) {
      if (p.kind === 'torso') { ctx.fillStyle = COL.shirt; ctx.strokeStyle = COL.shirt; ctx.lineWidth = 4; K.path(ctx, p.q); ctx.fill(); ctx.stroke(); continue; }
      if (p.kind === 'head') { ctx.fillStyle = COL.skin; ctx.beginPath(); ctx.arc(p.c[0], p.c[1], 0.12 * PPM * k, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = COL.hair; ctx.beginPath(); ctx.arc(p.c[0], p.c[1] - 1, 0.12 * PPM * k, Math.PI * 0.95, Math.PI * 2.05); ctx.fill(); continue; }
      const arm = p.limb[1] === 'H';
      ctx.strokeStyle = arm ? (p.kind === 'upper' ? COL.shirt : COL.skin) : COL.pants;
      ctx.lineWidth = (arm ? 0.085 : 0.11) * PPM * k + 1;
      K.line(ctx, p.a, p.b); ctx.stroke();
      if (p.kind === 'shin') { ctx.fillStyle = COL.shoe; ctx.beginPath(); ctx.arc(p.b[0], p.b[1], 2.2, 0, Math.PI * 2); ctx.fill(); }
    }
    // Sweat flies off with pump.
    const head = body.P(body.b.head);
    if (hud.pump >= 8 && sm.seg.kind !== 'land' && sm.seg.kind !== 'cheer') {
      for (let i = 0; i < 2; i++) {
        const ph = ((time * 1.6 + i * 0.5) % 1);
        const dx = (i ? 1 : -1) * (6 + 14 * ph), dy = -8 - 10 * Math.sin(Math.PI * ph) + 10 * ph;
        ctx.fillStyle = `rgba(90,170,230,${1 - ph})`;
        ctx.beginPath(); ctx.moveTo(head[0] + dx, head[1] + dy - 3); ctx.quadraticCurveTo(head[0] + dx + 2.5, head[1] + dy + 1, head[0] + dx, head[1] + dy + 2); ctx.quadraticCurveTo(head[0] + dx - 2.5, head[1] + dy + 1, head[0] + dx, head[1] + dy - 3); ctx.fill();
      }
    }
    // Status bubble.
    const ev = C.event(sm);
    const at = [head[0], head[1] - 0.16 * PPM * k];
    const bob = Math.sin(time * 4) * 1.2;
    at[1] += bob;
    if (ev === 'slip' && sm.u > 0.45) bubble(ctx, at, '#FFD9D2', (c, x, y) => { c.fillStyle = '#D64D3C'; c.font = "800 15px Nunito, sans-serif"; c.textAlign = 'center'; c.fillText('!!', x, y + 5); c.textAlign = 'left'; });
    else if (ev === 'sketchy' && sm.u > 0.5) bubble(ctx, at, '#FFF1C9', (c, x, y) => { c.fillStyle = '#C98A12'; c.font = "800 15px Nunito, sans-serif"; c.textAlign = 'center'; c.fillText('!', x, y + 5); c.textAlign = 'left'; });
    else if (hud.fearUp && sm.u > 0.4) bubble(ctx, at, '#FFE4E8', (c, x, y) => {
      c.fillStyle = '#D6455E'; c.beginPath(); c.moveTo(x - 6, y - 1); c.arc(x - 3, y - 3, 3, Math.PI, 0); c.arc(x + 3, y - 3, 3, Math.PI, 0); c.lineTo(x, y + 5); c.closePath(); c.fill();
      c.font = "800 8px Nunito, sans-serif"; c.fillText(`+${hud.fearUp.d}`, x + 6, y + 7);
    });
    else if (ev === 'deadpoint') bubble(ctx, at, '#E3F1FF', (c, x, y) => { c.strokeStyle = '#2F6FB2'; c.lineWidth = 2; c.beginPath(); c.arc(x, y + 6, 8, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); c.fillStyle = '#2F6FB2'; c.beginPath(); c.moveTo(x + 7, y - 4); c.lineTo(x + 9, y + 2); c.lineTo(x + 3, y); c.closePath(); c.fill(); });
    else if (ev === 'fall') bubble(ctx, at, '#FFD9D2', (c, x, y) => { c.strokeStyle = '#D64D3C'; c.lineWidth = 2.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(x - 5, y - 5); c.lineTo(x + 5, y + 5); c.moveTo(x + 5, y - 5); c.lineTo(x - 5, y + 5); c.stroke(); });
    else if (ev === 'land') {
      // Stars circle the head.
      for (let i = 0; i < 3; i++) {
        const a = time * 3 + (i * Math.PI * 2) / 3;
        const p = [head[0] + Math.cos(a) * 10, head[1] - 9 + Math.sin(a) * 3];
        ctx.fillStyle = '#F4C542'; ctx.beginPath();
        for (let j = 0; j < 10; j++) { const rr = j % 2 ? 1.4 : 3.4, aa = (j / 10) * Math.PI * 2 - Math.PI / 2; ctx.lineTo(p[0] + Math.cos(aa) * rr, p[1] + Math.sin(aa) * rr); }
        ctx.closePath(); ctx.fill();
      }
    } else if (ev === 'top') {
      bubble(ctx, [at[0], at[1] - 8], '#DDF5D8', (c, x, y) => { c.strokeStyle = '#3E9B4F'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(x - 6, y); c.lineTo(x - 1, y + 5); c.lineTo(x + 7, y - 5); c.stroke(); });
      if (sm.seg.kind === 'cheer') {
        for (let i = 0; i < 24; i++) {
          const v = (sm.u * 1.4 + K.hash(i) * 0.3) % 1;
          const px = head[0] + (K.hash(i + 3) - 0.5) * 120, py = head[1] - 60 + v * 140;
          ctx.fillStyle = ['#F06E52', '#F4C542', '#5BB0E0', '#7CC47F'][i % 4];
          ctx.save(); ctx.translate(px, py); ctx.rotate(v * 8 + i); ctx.fillRect(-2, -1.2, 4, 2.4); ctx.restore();
        }
      }
    } else if (sm.seg.kind === 'step') {
      // The move being made, as a small icon.
      const cls = sm.seg.style.cls;
      bubble(ctx, at, '#FFFFFF', (c, x, y) => {
        c.fillStyle = '#3A4A44'; c.font = "800 9px Nunito, sans-serif"; c.textAlign = 'center';
        c.fillText(cls === 'high_step' ? 'STEP' : sm.seg.style.limb[1] === 'F' ? 'FOOT' : 'MOVE', x, y + 3); c.textAlign = 'left';
      });
    }
  }

  return { name: 'Isometric diorama', fonts: ["800 10px Nunito"], init, draw };
})();
