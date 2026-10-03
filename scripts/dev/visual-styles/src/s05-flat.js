// 5 · Flat Dusk 2: the game's wall view as it ships (docs/23 §4, src/ui/wall/render.ts): the oblique side view, the
// dusk palette, flat fills with no outlines. Added for the simulation: teal rings on the holds in use that turn coral
// with pump, the move and its odds at the hold being reached, the fear that rose and why, a deadpoint's arc and apex,
// and the word over the wall at the end of an attempt.
STYLES.flat = (function () {
  const F = {
    ink: '#1B1B3A', text: '#F5F2FF', target: '#FFE066', safe: '#2EC4B6', danger: '#FF8C6B', raised: '#2D2D55', muted: '#B9B4D6',
    sky: ['#2B2D42', '#46385E', '#7A4B6E', '#C0607A', '#F28F6B', '#F7B267'], sun: '#FFD08A', hills: '#3D3A5C', trees: '#26263F',
    ground: '#2A2A45', pad: '#1B998B', padTop: '#23B5A5', rockBody: '#8E3B46', rockEdge: '#C8553D', lip: '#FFC48A',
    hold: '#FFE8C2', holdShade: '#B8553E', jacket: '#2EC4B6', jacketShade: '#20A396', skin: '#F4C095', skinFar: '#E0A97F',
    trousers: '#1B1B3A', trousersFar: '#121230', shoe: '#FFE066', shoeFar: '#E6C84F', hair: '#1B1B3A',
  };
  const PPM = 150, CX = -0.2;
  // The shipped camera: X = −z + 0.5·x (overhangs lean left, the rock body sits to the right), Y = y.
  const proj = (p) => [-p[2] + 0.5 * p[0], p[1]];
  const SIZE_M = { xs: 0.05, s: 0.08, m: 0.12, l: 0.17, xl: 0.24 };
  const FACE = [[70, [246, 181, 110]], [90, [242, 166, 90]], [115, [229, 143, 78]], [150, [212, 106, 67]]];
  const MOVE = { static: 'STATIC', high_step: 'HIGH STEP', deadpoint: 'DEADPOINT', dyno: 'DYNO', mantle: 'MANTLE' };

  function faceColour(angle) {
    const a = Math.min(FACE[FACE.length - 1][0], Math.max(FACE[0][0], angle));
    let i = 0;
    while (i < FACE.length - 2 && a > FACE[i + 1][0]) i++;
    const [a0, c0] = FACE[i], [a1, c1] = FACE[i + 1];
    const t = (a - a0) / (a1 - a0);
    return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * t)).join(',')})`;
  }
  function holdShape(ctx, type, x, y, r) {
    ctx.beginPath();
    if (type === 'crimp' || type === 'edge') ctx.roundRect(x - r, y - r * 0.28, 2 * r, r * 0.56, 2);
    else if (type === 'jug' || type === 'horn') ctx.roundRect(x - r, y - r * 0.6, 2 * r, r * 1.2, r * 0.4);
    else if (type === 'foot_chip') ctx.ellipse(x, y, r * 0.7, r * 0.42, 0, 0, Math.PI * 2);
    else ctx.ellipse(x, y, r * 1.1, r * 0.6, 0, 0, Math.PI * 2);
  }
  const holdR = (h) => Math.max(6, ((SIZE_M[h.size] || 0.12) * PPM) / 2);

  function pill(ctx, x, y, text, fg, align = 'left') {
    ctx.font = "600 12px 'IBM Plex Mono', monospace";
    const w = ctx.measureText(text).width + 14;
    const W = ctx.canvas.width / (ctx.getTransform().a || 1), H = ctx.canvas.height / (ctx.getTransform().d || 1);
    let x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    x0 = Math.max(6, Math.min(W - w - 6, x0));
    const y0 = Math.max(6, Math.min(H - 28, y - 11));
    ctx.fillStyle = F.raised; ctx.beginPath(); ctx.roundRect(x0, y0, w, 22, 6); ctx.fill();
    ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.fillText(text, x0 + 7, y0 + 11.5);
    ctx.textBaseline = 'alphabetic';
  }
  function banner(ctx, W, y, text, colour, alpha) {
    ctx.globalAlpha = alpha;
    ctx.font = "700 38px 'Barlow Condensed', 'Arial Narrow', sans-serif";
    ctx.textAlign = 'center'; ctx.lineWidth = 7; ctx.lineJoin = 'round';
    ctx.strokeStyle = F.ink; ctx.strokeText(text, W / 2, y);
    ctx.fillStyle = colour; ctx.fillText(text, W / 2, y);
    ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  }

  /** Two-bone limb in screen space, as the game's renderer does it: the joint on the side `prefer` points to. */
  function joint(a, b, l1, l2, prefer) {
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
    if (d >= l1 + l2 - 1e-6) return [a[0] + (dx * l1) / (l1 + l2), a[1] + (dy * l1) / (l1 + l2)];
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d), off = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    const ux = dx / d, uy = dy / d;
    let nx = -uy, ny = ux;
    if (nx * prefer[0] + ny * prefer[1] < 0) { nx = -nx; ny = -ny; }
    return [a[0] + ux * along + nx * off, a[1] + uy * along + ny * off];
  }

  /**
   * The figure exactly as the game draws it (src/ui/wall/render.ts drawFigure): far (left) limbs behind and a tone
   * darker, elbows dropping off the wall, knees toward it, a jacket capsule, the head and hair. Posed from the same
   * shoulder, hip and limb-end points the playback core gives every style.
   */
  function figure(ctx, env, S, pose, active, seated) {
    const k = pose.k;
    const P = (p) => S(proj(p));
    const sh = P(pose.sh), hip = P(pose.hip);
    const ax = sh[0] - hip[0], ay = sh[1] - hip[1], al = Math.hypot(ax, ay) || 1;
    let px = -ay / al, py = ax / al;
    if (px < 0) { px = -px; py = -py; }
    const shW = 0.18 * 0.5 * k * PPM, hipW = 0.12 * 0.5 * k * PPM;
    const shoulder = (sd) => [sh[0] + px * shW * sd, sh[1] + py * shW * sd];
    const hipAt = (sd) => [hip[0] + px * hipW * sd, hip[1] + py * hipW * sd];
    const upper = 0.31 * k * PPM, fore = 0.3 * k * PPM, thigh = 0.43 * k * PPM, shin = 0.42 * k * PPM;
    const arm = Math.max(4, 0.07 * k * PPM), leg = Math.max(5, 0.085 * k * PPM);
    const line = (pts, colour, width) => {
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    };
    const ends = {};
    const parts = [];
    for (const l of ['LH', 'RH', 'LF', 'RF']) {
      const sd = l === 'LH' || l === 'LF' ? -1 : 1;
      const end = P(pose.ends[l]);
      ends[l] = end;
      if (l[1] === 'H') { const s0 = shoulder(sd); parts.push({ l, far: sd < 0, pts: [s0, joint(s0, end, upper, fore, [-0.6 + 0.2 * sd, 1]), end] }); }
      else { const h0 = hipAt(sd); parts.push({ l, far: sd < 0, pts: [h0, joint(h0, end, thigh, shin, seated ? [-0.3, -1] : [1, -0.25 + 0.15 * sd]), end] }); }
    }
    const limb = (p) => {
      const sel = p.l === active;
      const [a, j, end] = p.pts;
      if (p.l[1] === 'H') {
        line([a, j], sel ? F.target : p.far ? F.jacketShade : F.jacket, arm * 1.15);
        line([j, end], sel ? F.target : p.far ? F.skinFar : F.skin, arm);
        ctx.beginPath(); ctx.arc(end[0], end[1], Math.max(3.5, 0.05 * k * PPM), 0, Math.PI * 2); ctx.fillStyle = sel ? F.target : p.far ? F.skinFar : F.skin; ctx.fill();
      } else {
        line(p.pts, sel ? F.target : p.far ? F.trousersFar : F.trousers, leg);
        ctx.beginPath(); ctx.ellipse(end[0] + 0.04 * k * PPM, end[1], Math.max(5, 0.08 * k * PPM), Math.max(2.5, 0.04 * k * PPM), 0, 0, Math.PI * 2);
        ctx.fillStyle = p.far ? F.shoeFar : F.shoe; ctx.fill();
      }
    };
    for (const p of parts.filter((q) => q.far)) limb(p);
    const chestW = Math.max(10, 0.2 * k * PPM), waistW = Math.max(9, 0.17 * k * PPM);
    const inset = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
    const chest = inset(sh, hip, Math.min(0.45, chestW / 2 / al)), waist = inset(hip, sh, Math.min(0.45, waistW / 2 / al));
    line([chest, inset(chest, waist, 0.5)], F.jacket, chestW);
    line([inset(chest, waist, 0.4), waist], F.jacket, waistW);
    line([[chest[0] + px * chestW * 0.3, chest[1] + py * chestW * 0.3], [waist[0] + px * waistW * 0.28, waist[1] + py * waistW * 0.28]], F.jacketShade, chestW * 0.3);
    for (const p of parts.filter((q) => !q.far)) limb(p);
    const head = [sh[0] + (ax / al) * 0.2 * k * PPM - 0.03 * PPM, sh[1] + (ay / al) * 0.2 * k * PPM], hr = Math.max(6, 0.095 * k * PPM);
    ctx.beginPath(); ctx.arc(head[0], head[1], hr, 0, Math.PI * 2); ctx.fillStyle = F.skin; ctx.fill();
    ctx.beginPath(); ctx.arc(head[0] - hr * 0.2, head[1] - hr * 0.25, hr * 0.92, Math.PI * 0.75, Math.PI * 1.85); ctx.closePath(); ctx.fillStyle = F.hair; ctx.fill();
    return { ends, head, on: pose.on };
  }

  function draw(ctx, env) {
    const { C, K, W, H, sm, time, scene } = env;
    const top = C.top;
    const half = H / PPM / 2;
    const cy = C.clamp(C.followY(time, proj, -9, 9) + 0.25, -0.75 + half, top + 1.95 - half);
    const S = K.cam(W, H, PPM, CX, cy);
    const E = (x, y) => S(proj([x, y, C.faceZ(Math.min(top, y))]));
    const gy = S([0, 0])[1];
    // Sky in bands fixed to the screen; sun, hills and trees stand on the ground line.
    const cuts = [0, 0.17, 0.32, 0.47, 0.61, 0.72, 1];
    F.sky.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, H * cuts[i], W, H * (cuts[i + 1] - cuts[i]) + 1); });
    if (gy < H * 1.2) {
      const u = Math.min(W, H);
      ctx.fillStyle = F.sun; ctx.beginPath(); ctx.arc(W * 0.18, gy - 0.1 * u, 0.1 * u, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = F.hills; ctx.beginPath(); ctx.moveTo(0, gy);
      [[0, 0.1], [0.15, 0.2], [0.33, 0.12], [0.51, 0.24], [0.72, 0.13], [1, 0.26]].forEach(([fx, fh]) => ctx.lineTo(W * fx, gy - u * fh));
      ctx.lineTo(W, gy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = F.trees;
      for (const [fx, fw, fh] of [[0.04, 0.06, 0.32], [0.12, 0.05, 0.22]]) { ctx.beginPath(); ctx.moveTo(W * fx, gy); ctx.lineTo(W * (fx + fw / 2), gy - u * fh); ctx.lineTo(W * (fx + fw), gy); ctx.closePath(); ctx.fill(); }
    }
    // The rock: body behind, the face band by band toned by angle, a shaded right edge, the lip.
    const xs = scene.holds.map((h) => h.x);
    const x0 = Math.min(-1.0, Math.min(...xs) - 0.25), x1 = Math.max(1.0, Math.max(...xs) + 0.25);
    const ys = []; for (let i = 0; i <= 24; i++) ys.push((top * i) / 24);
    const right = ys.map((y) => E(x1, y)), topRight = right[right.length - 1];
    ctx.fillStyle = F.rockBody; ctx.beginPath();
    ys.forEach((y, i) => { const p = E(x0, y); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
    ctx.lineTo(topRight[0] + 0.6 * PPM, topRight[1] + 0.1 * PPM); ctx.lineTo(Math.max(right[0][0], topRight[0]) + 0.6 * PPM, gy); ctx.closePath(); ctx.fill();
    const band = (xa, xb, y0, y1, fill) => {
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) { const p = E(xa, y0 + ((y1 - y0) * i) / 6); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
      for (let i = 6; i >= 0; i--) { const p = E(xb, y0 + ((y1 - y0) * i) / 6); ctx.lineTo(p[0], p[1]); }
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    };
    for (const seg of scene.wall.segments) { band(x0, x1, seg.y0, seg.y1, faceColour(seg.angle)); band(x1 - 0.18, x1, seg.y0, seg.y1, F.rockEdge); }
    ctx.strokeStyle = F.rockEdge; ctx.lineWidth = 2;
    for (const seg of scene.wall.segments.slice(1)) { const a = E(x0, seg.y0), b = E(x1, seg.y0); K.line(ctx, a, b); ctx.stroke(); }
    const lipL = E(x0, top);
    ctx.strokeStyle = F.lip; ctx.lineWidth = 4; K.line(ctx, lipL, topRight); ctx.stroke();
    // Ground and pads.
    ctx.fillStyle = F.ground; ctx.fillRect(0, gy, W, Math.max(0, H - gy));
    for (const pad of K.pads) {
      const a = S(proj([pad.x0, 0, pad.z1])), b = S(proj([pad.x1, 0, pad.z0]));
      ctx.fillStyle = F.pad; ctx.fillRect(a[0], gy - 0.09 * PPM, b[0] - a[0], 0.09 * PPM);
      ctx.fillStyle = F.padTop; ctx.fillRect(a[0], gy - 0.09 * PPM, b[0] - a[0], 0.03 * PPM);
    }
    // Holds: a shade under, the hold on top; chalk on the ones touched so far.
    const touched = C.touched(sm);
    const holds = scene.holds.slice().sort((a, b) => a.y - b.y);
    for (const h of holds) {
      const [x, y] = S(proj([h.x, h.y, h.z])), r = holdR(h);
      holdShape(ctx, h.type, x, y + Math.max(2, 0.02 * PPM), r); ctx.fillStyle = F.holdShade; ctx.fill();
      holdShape(ctx, h.type, x, y, r); ctx.fillStyle = F.hold; ctx.fill();
      if (touched.has(h.id)) { ctx.fillStyle = 'rgba(245,242,255,0.9)'; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(x + i * r * 0.45, y - r * 0.12, Math.max(1.5, r * 0.12), 0, Math.PI * 2); ctx.fill(); } }
    }
    const hud = C.hudOf(sm);
    const ev = C.event(sm);
    const tg = C.target(sm);
    const active = sm.seg.kind === 'step' || sm.seg.kind === 'reach' ? sm.seg.style.limb : null;
    // A deadpoint's path and its apex, under the figure.
    if (ev === 'deadpoint' && tg && sm.seg.kind === 'step') {
      const pts = [];
      let apex = null;
      for (let i = 0; i <= 16; i++) { const s2 = C.sample(sm.seg.t0 + (sm.seg.dur * i) / 16); const p = S(proj(s2.pose.ends[tg.limb])); pts.push(p); }
      for (let i = 0; i <= 16; i++) { const s2 = C.sample(sm.seg.t0 + (sm.seg.dur * i) / 16); const p = S(proj(s2.pose.hip)); if (!apex || p[1] < apex[1]) apex = p; }
      ctx.setLineDash([5, 4]); ctx.strokeStyle = F.target; ctx.lineWidth = 2; K.poly(ctx, pts); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = F.target; ctx.beginPath(); ctx.arc(apex[0], apex[1], 4, 0, Math.PI * 2); ctx.fill();
    }
    const fig = figure(ctx, env, S, sm.pose, active, sm.seg.kind === 'land' || (sm.seg.kind === 'fall' && sm.u > 0.45));
    // Rings on top, so the body never hides them: holds in use (teal, coral as pump rises), the target (yellow).
    const pump = hud.pump / 100;
    for (const l of ['LH', 'RH', 'LF', 'RF']) {
      if (!sm.pose.on[l]) continue;
      const id = C.nearestHold(sm.pose.ends[l]);
      if (!id) continue;
      const h = C.hold[id];
      const [x, y] = S(proj([h.x, h.y, h.z])), r = holdR(h) + 4;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = F.safe; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      if (l[1] === 'H' && pump > 0.01) { ctx.strokeStyle = F.danger; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * Math.min(1, pump * 2)); ctx.stroke(); }
    }
    const fin = C.hold[scene.holds.find((h) => h.finish).id];
    {
      const [x, y] = S(proj([fin.x, fin.y, fin.z]));
      ctx.font = "700 11px 'Barlow Condensed', 'Arial Narrow', sans-serif"; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = F.ink;
      ctx.strokeText('TOP', x, y - holdR(fin) - 7); ctx.fillStyle = F.text; ctx.fillText('TOP', x, y - holdR(fin) - 7); ctx.textAlign = 'left';
    }
    if (tg && (sm.seg.kind === 'step' || sm.seg.kind === 'reach' || sm.seg.kind === 'intro')) {
      const [x, y] = S(proj([tg.hold.x, tg.hold.y, tg.hold.z])), r = holdR(tg.hold) + 7;
      ctx.strokeStyle = F.target; ctx.lineWidth = 3;
      if (tg.cls === 'deadpoint' || tg.cls === 'dyno') ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      const odds = sm.seg.kind === 'step' && hud.p != null ? ` · ${hud.p}%` : '';
      pill(ctx, x + r + 6, y, `${MOVE[tg.cls] || tg.cls.toUpperCase()}${odds}`, F.target);
    }
    // Events.
    if (ev === 'sketchy' && tg && sm.u > 0.55) {
      const [x, y] = S(proj([tg.hold.x, tg.hold.y, tg.hold.z]));
      const v = Math.sin(Math.PI * C.clamp((sm.u - 0.55) / 0.45, 0, 1));
      ctx.strokeStyle = F.target; ctx.globalAlpha = v; ctx.lineWidth = 2;
      ctx.beginPath(); for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? 16 : 25; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.stroke();
      ctx.globalAlpha = 1;
      pill(ctx, x + 32, y + 28, 'SKETCHY', F.target);
    }
    if (ev === 'slip' && sm.u > 0.48 && sm.u < 0.95) {
      const l = sm.seg.style.limb, c = fig.ends[l], v = (sm.u - 0.48) / 0.47;
      ctx.strokeStyle = F.danger; ctx.globalAlpha = 1 - v; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(c[0], c[1], 12 + 20 * v, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      pill(ctx, c[0] + 22, c[1] + 22, `${l[1] === 'H' ? 'HAND' : 'FOOT'} POPPED · HELD`, F.danger);
    }
    if (ev === 'deadpoint' && sm.seg.kind === 'step' && sm.seg.style.commit === 'apex' && sm.u > 0.5) {
      const [x, y] = S(proj([tg.hold.x, tg.hold.y, tg.hold.z]));
      pill(ctx, x + 26, y - 30, 'CAUGHT AT THE APEX', F.safe);
    }
    if (hud.fearUp && sm.u > 0.45) {
      const hd = fig.head;
      pill(ctx, hd[0] - 22, hd[1] + 4 - 14 * (sm.u - 0.45), `FEAR +${hud.fearUp.d} · ${hud.fearUp.label.toUpperCase()}`, F.text, 'right');
    }
    // The word over the wall at the end of an attempt, as the game shows it.
    if (sm.seg.kind === 'land') banner(ctx, W, H * 0.24, `OFF AT ${Math.round(100 * sm.attempt.result.progress)}%`, F.danger, Math.min(1, sm.u * 4));
    if (sm.seg.kind === 'cheer') banner(ctx, W, H * 0.78, 'SENT', F.target, Math.min(1, sm.u * 4));
  }

  return { name: 'Flat Dusk 2', fonts: ["600 12px 'IBM Plex Mono'", "700 38px 'Barlow Condensed'"], init: () => ({}), draw };
})();
