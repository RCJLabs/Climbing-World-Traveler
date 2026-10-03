// 10 · Blueprint: the simulation's own view. A front elevation with the holds by id, the climber as a jointed
// skeleton, the reach envelope of the moving limb, joint angles, the centre of mass over the feet, a side section with
// the wall's angles and the body's distance from it, and the odds and margin of each move in a title block.
STYLES.blueprint = (function () {
  const PPM = 135, Y0 = -0.9, Y1 = 5.0;
  const BG = '#123E6B', LN = '#DDEFFF', DIM = 'rgba(221,239,255,0.55)', HI = '#FFD27A', WARN = '#FF8C7A';
  const MONO = "'Space Mono', 'IBM Plex Mono', monospace";

  function init(env) {
    const { C, K, W, dpr, scene } = env;
    const Hh = (Y1 - Y0) * PPM;
    const L = K.layer(W, Hh, dpr);
    const S = K.cam(W, Hh, PPM, 0, (Y0 + Y1) / 2);
    const x = L.x;
    const proj = C.views.front;
    x.fillStyle = BG; x.fillRect(0, 0, W, Hh);
    const r = C.rng(4);
    for (let i = 0; i < W * Hh * 0.004; i++) { x.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.03})`; x.fillRect(r() * W, r() * Hh, 1.5, 1.5); }
    // Grid in world metres: 0.1 minor, 0.5 major.
    for (let m = Math.floor(-2 / 0.1); m <= Math.ceil(2 / 0.1); m++) { const p = S([m * 0.1, 0]); x.strokeStyle = m % 5 ? 'rgba(221,239,255,0.07)' : 'rgba(221,239,255,0.18)'; x.lineWidth = 1; x.beginPath(); x.moveTo(p[0] + 0.5, 0); x.lineTo(p[0] + 0.5, Hh); x.stroke(); }
    for (let m = Math.floor(Y0 / 0.1); m <= Math.ceil(Y1 / 0.1); m++) { const p = S([0, m * 0.1]); x.strokeStyle = m % 5 ? 'rgba(221,239,255,0.07)' : 'rgba(221,239,255,0.18)'; x.beginPath(); x.moveTo(0, p[1] + 0.5); x.lineTo(W, p[1] + 0.5); x.stroke(); }
    // Ground, the block, its top edge.
    const g = S(proj([0, 0, 0]));
    x.strokeStyle = LN; x.lineWidth = 1.5; x.beginPath(); x.moveTo(0, g[1]); x.lineTo(W, g[1]); x.stroke();
    x.strokeStyle = DIM; x.lineWidth = 1;
    for (let px = -20; px < W; px += 9) { x.beginPath(); x.moveTo(px, g[1] + 9); x.lineTo(px + 9, g[1]); x.stroke(); }
    const out = K.outlinePx(S, proj);
    x.strokeStyle = LN; x.lineWidth = 1.6; K.smooth(x, out); x.stroke();
    x.setLineDash([6, 3, 1, 3]); x.lineWidth = 1; K.smooth(x, K.capPx(S, proj, 1.3).slice(14), false); x.stroke(); x.setLineDash([]);
    // Pads as hidden lines.
    for (const pad of K.pads) { const f = K.boxFaces(pad, proj, S); x.setLineDash([4, 3]); x.strokeStyle = DIM; K.path(x, f.top); x.stroke(); x.setLineDash([]); }
    // Wall segments: dash-dot boundaries, angle labels with leaders.
    x.font = `400 10px ${MONO}`; x.fillStyle = LN;
    const xr = scene.wall.x1 + 0.12;
    for (const s of scene.wall.segments) {
      const [L0, R0] = C.faceSpan(Math.max(0.02, s.y0));
      const a = S(proj([L0, s.y0, 0])), b = S(proj([R0, s.y0, 0]));
      if (s.y0 > 0) { x.setLineDash([10, 3, 2, 3]); x.strokeStyle = DIM; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); x.setLineDash([]); }
      const m = S(proj([R0 - 0.05, (s.y0 + s.y1) / 2, 0])), lab = S([xr, (s.y0 + s.y1) / 2]);
      x.strokeStyle = DIM; x.beginPath(); x.moveTo(m[0], m[1]); x.lineTo(lab[0] - 4, lab[1]); x.stroke();
      x.fillText(`${s.angle}°`, lab[0] - 2, lab[1] + 3);
    }
    // Height dimension on the left.
    const dx = W - 10;
    const d0 = S([0, 0])[1], d1 = S([0, scene.wall.top])[1];
    x.strokeStyle = LN; x.lineWidth = 1;
    x.beginPath(); x.moveTo(dx, d0); x.lineTo(dx, d1); x.stroke();
    for (const yy of [d0, d1]) { x.beginPath(); x.moveTo(dx - 5, yy); x.lineTo(dx + 5, yy); x.stroke(); x.beginPath(); x.moveTo(dx - 4, yy + (yy === d0 ? -4 : 4)); x.lineTo(dx, yy); x.lineTo(dx + 4, yy + (yy === d0 ? -4 : 4)); x.stroke(); }
    x.save(); x.translate(dx - 5, (d0 + d1) / 2); x.rotate(-Math.PI / 2); x.textAlign = 'center'; x.fillStyle = BG; x.fillRect(-26, -9, 52, 12); x.fillStyle = LN; x.fillText(`${scene.wall.top.toFixed(2)} m`, 0, 0); x.restore();
    // Holds with their ids.
    x.font = `400 8px ${MONO}`;
    for (const h of scene.holds) {
      const c = S(proj([h.x, h.y, h.z]));
      K.holdPath(x, h, c, PPM); x.strokeStyle = LN; x.lineWidth = 1; x.stroke();
      x.fillStyle = DIM; x.fillText(h.id, c[0] + K.dims(h)[0] * PPM * 0.5 + 3, c[1] + 3);
    }
    return { L };
  }

  const deg = (a, b, c) => {
    const u = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    const d = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / ((Math.hypot(...u) * Math.hypot(...v)) || 1);
    return Math.round((Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI);
  };

  function draw(ctx, env) {
    const { C, K, W, H, dpr, cache, sm, time } = env;
    const proj = C.views.front;
    const half = H / PPM / 2;
    const cy = C.clamp(C.followY(time, proj, -9, 9) + 0.15, Y0 + half, Y1 - half);
    const off = (Y1 - cy) * PPM - H / 2;
    ctx.drawImage(cache.L.c, 0, Math.round(off * dpr), W * dpr, H * dpr, 0, 0, W, H);
    const S = K.cam(W, H, PPM, 0, cy);
    const P = (p) => S(proj(p));
    const hud = C.hudOf(sm);
    const b = C.body3(sm.pose);
    const k = b.k;
    ctx.font = `400 9px ${MONO}`;
    // Touched holds filled.
    for (const id of C.touched(sm)) { const h = C.hold[id]; K.holdPath(ctx, h, P([h.x, h.y, h.z]), PPM); ctx.fillStyle = 'rgba(221,239,255,0.45)'; ctx.fill(); }
    // The moving limb: reach envelope from its root, the target with a crosshair, the distance.
    const tg = C.target(sm);
    if (tg && (sm.seg.kind === 'step' || sm.seg.kind === 'reach' || sm.seg.kind === 'intro')) {
      const hand = tg.limb[1] === 'H';
      const root = tg.limb === 'LH' ? b.shL : tg.limb === 'RH' ? b.shR : tg.limb === 'LF' ? b.hipL : b.hipR;
      const reach = (hand ? 0.64 : 0.9) * k;
      const rc = P(root);
      ctx.setLineDash([5, 4]); ctx.strokeStyle = HI; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(rc[0], rc[1], reach * PPM, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      const tc = P([tg.hold.x, tg.hold.y, tg.hold.z]);
      ctx.strokeStyle = HI; ctx.beginPath(); ctx.moveTo(tc[0] - 10, tc[1]); ctx.lineTo(tc[0] + 10, tc[1]); ctx.moveTo(tc[0], tc[1] - 10); ctx.lineTo(tc[0], tc[1] + 10); ctx.stroke();
      ctx.beginPath(); ctx.arc(tc[0], tc[1], 6, 0, Math.PI * 2); ctx.stroke();
      const from = sm.seg.kind === 'step' ? sm.seg.from.ends[tg.limb] : sm.pose.ends[tg.limb];
      const fc = P(from);
      const dist = Math.hypot(tg.hold.x - from[0], tg.hold.y - from[1]);
      if (dist > 0.04) {
        ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(fc[0], fc[1]); ctx.lineTo(tc[0], tc[1]); ctx.stroke(); ctx.setLineDash([]);
        const m = [(fc[0] + tc[0]) / 2, (fc[1] + tc[1]) / 2];
        ctx.fillStyle = HI; ctx.fillText(`${Math.round(dist * 100)} cm`, m[0] + 6, m[1] - 4);
      }
      ctx.fillStyle = HI; ctx.fillText(`${tg.hold.id} · ${tg.limb} · ${tg.cls.toUpperCase()}`, tc[0] + 12, tc[1] - 10);
    }
    // The deadpoint: the hip's path through the move, its apex.
    if (C.event(sm) === 'deadpoint' && sm.seg.kind === 'step') {
      const pts = [];
      let apex = null;
      for (let i = 0; i <= 20; i++) { const s2 = C.sample(sm.seg.t0 + (sm.seg.dur * i) / 20); const p = P(s2.pose.hip); pts.push(p); if (!apex || p[1] < apex[1]) apex = p; }
      ctx.strokeStyle = HI; ctx.setLineDash([3, 3]); K.poly(ctx, pts); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(apex[0], apex[1], 3, 0, Math.PI * 2); ctx.fillStyle = HI; ctx.fill();
      ctx.fillText(sm.seg.style.commit === 'apex' ? 'APEX: CAUGHT' : 'APEX', apex[0] + 8, apex[1] - 6);
    }
    // The skeleton.
    ctx.strokeStyle = LN; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    const J = (p) => P(p);
    for (const [a, c, e] of [[b.shL, b.elL, b.LH], [b.shR, b.elR, b.RH], [b.hipL, b.knL, b.LF], [b.hipR, b.knR, b.RF]]) { K.poly(ctx, [J(a), J(c), J(e)]); ctx.stroke(); }
    K.path(ctx, [J(b.shL), J(b.shR), J(b.hipR), J(b.hipL)]); ctx.stroke();
    K.line(ctx, J(b.neck), J(b.head)); ctx.stroke();
    const hd = J(b.head); ctx.beginPath(); ctx.arc(hd[0], hd[1], 0.1 * PPM * k, 0, Math.PI * 2); ctx.stroke();
    for (const p of [b.shL, b.shR, b.elL, b.elR, b.hipL, b.hipR, b.knL, b.knR]) { const q = J(p); ctx.fillStyle = BG; ctx.beginPath(); ctx.arc(q[0], q[1], 3.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = LN; ctx.beginPath(); ctx.arc(q[0], q[1], 1, 0, Math.PI * 2); ctx.fill(); }
    for (const l of ['LH', 'RH', 'LF', 'RF']) { const q = J(b[l]); ctx.fillStyle = b.on[l] ? LN : BG; ctx.beginPath(); ctx.rect(q[0] - 3, q[1] - 3, 6, 6); ctx.fill(); ctx.stroke(); }
    // Elbow angles.
    ctx.fillStyle = DIM;
    for (const [s, e, h] of [[b.shL, b.elL, b.LH], [b.shR, b.elR, b.RH]]) { const q = J(e); ctx.fillText(`${deg(s, e, h)}°`, q[0] + (q[0] < J(b.sh)[0] ? -26 : 6), q[1] + 12); }
    // Centre of mass, its plumb line, and the feet it should sit over.
    const com = C.add3(C.mul3(b.hip, 0.55), C.mul3(b.sh, 0.45));
    const cm = J(com);
    ctx.strokeStyle = HI; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cm[0], cm[1], 6, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cm[0], cm[1]); ctx.arc(cm[0], cm[1], 6, 0, Math.PI / 2); ctx.closePath(); ctx.fillStyle = HI; ctx.fill();
    ctx.beginPath(); ctx.moveTo(cm[0], cm[1]); ctx.arc(cm[0], cm[1], 6, Math.PI, Math.PI * 1.5); ctx.closePath(); ctx.fill();
    const feet = ['LF', 'RF'].filter((l) => b.on[l]).map((l) => J(b[l]));
    if (feet.length && sm.seg.kind !== 'land') {
      const fy = Math.max(...feet.map((f) => f[1])) + 8;
      ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(cm[0], cm[1] + 6); ctx.lineTo(cm[0], fy); ctx.stroke(); ctx.setLineDash([]);
      const xs = feet.map((f) => f[0]);
      const lo = Math.min(...xs), hi = Math.max(...xs);
      const over = cm[0] >= lo - 2 && cm[0] <= hi + 2;
      ctx.strokeStyle = over ? HI : WARN; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lo, fy); ctx.lineTo(Math.max(hi, lo + 2), fy); ctx.stroke();
      ctx.fillStyle = over ? HI : WARN; ctx.fillText(over ? 'COM OVER FEET' : 'COM OUTSIDE FEET', Math.min(W - 110, hi + 8), fy + 3);
    }
    // Events.
    const ev = C.event(sm);
    if (ev === 'slip' && sm.u > 0.45) { const q = J(b[sm.seg.style.limb]); ctx.fillStyle = WARN; ctx.fillText(`${sm.seg.style.limb} SLIP · RECOVERED`, q[0] + 10, q[1] + 16); }
    if (ev === 'sketchy' && sm.u > 0.5) { const q = J(b.sh); ctx.fillStyle = WARN; ctx.fillText('SKETCHY: MARGIN < 0', q[0] - 150, q[1] + 30); }
    if (sm.seg.kind === 'fall' || sm.seg.kind === 'land') {
      const top = P([C.hold.top.x, C.hold.top.y, C.hold.top.z]);
      ctx.fillStyle = WARN; ctx.fillText(`OFF AT ${Math.round(100 * sm.attempt.result.progress)}%`, Math.min(W - 90, top[0] + 16), Math.max(14, top[1] - 12)); ctx.fillText('LH OFF THE SLOPER', Math.min(W - 120, top[0] + 16), Math.max(26, top[1]));
      const fs = C.TL.segs.find((s) => s.a === sm.ai && s.kind === 'fall');
      const fall = fs.from.hip[1] - fs.to.hip[1];
      if (sm.seg.kind === 'land') { const q = J(b.hip); ctx.fillText(`FALL ${(Math.abs(fall)).toFixed(1)} m · PADS`, q[0] + 30, q[1] - 20); }
    }
    // Side section, top right: the wall profile and the body's distance from it.
    const sx = 8, sy = 10, sw = 96, sh = 140;
    ctx.fillStyle = 'rgba(18,62,107,0.92)'; ctx.fillRect(sx, sy, sw, sh); ctx.strokeStyle = LN; ctx.lineWidth = 1; ctx.strokeRect(sx + 0.5, sy + 0.5, sw, sh);
    ctx.fillStyle = LN; ctx.fillText('SECTION A-A', sx + 6, sy + 13);
    const sc = 42;
    const base = [sx + 24, sy + sh - 14];
    const Z = (p) => [base[0] + p[2] * sc * 1.0, base[1] - (p[1] - Math.max(0, sm.pose.hip[1] - 1.2)) * sc];
    ctx.save(); ctx.beginPath(); ctx.rect(sx + 1, sy + 18, sw - 2, sh - 20); ctx.clip();
    ctx.strokeStyle = LN; ctx.lineWidth = 1.4; ctx.beginPath();
    let zz = 0; ctx.moveTo(...Z([0, 0, 0]));
    for (const s of env.scene.wall.segments) { zz += (s.y1 - s.y0) * Math.tan(((s.angle - 90) * Math.PI) / 180); ctx.lineTo(...Z([0, s.y1, zz])); }
    ctx.lineTo(...Z([0, env.scene.wall.top, -1.5])); ctx.stroke();
    // The body in profile.
    const side = (p) => Z(p);
    ctx.strokeStyle = HI; ctx.lineWidth = 1.2;
    for (const [a, c, e] of [[b.shL, b.elL, b.LH], [b.hipL, b.knL, b.LF]]) { K.poly(ctx, [side(a), side(c), side(e)]); ctx.stroke(); }
    K.line(ctx, side(b.sh), side(b.hip)); ctx.stroke();
    const hs = side(b.head); ctx.beginPath(); ctx.arc(hs[0], hs[1], 0.1 * sc * k, 0, Math.PI * 2); ctx.stroke();
    const hp = side(b.hip), wz = side([0, b.hip[1], C.faceZ(b.hip[1])]);
    ctx.strokeStyle = DIM; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(wz[0], hp[1]); ctx.lineTo(hp[0], hp[1]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = HI; ctx.fillText(`${(b.hip[2] - C.faceZ(b.hip[1])).toFixed(2)}`, hp[0] + 4, hp[1] + 3);
    ctx.restore();
    // Title block.
    const ty = H - 58;
    ctx.fillStyle = 'rgba(18,62,107,0.94)'; ctx.fillRect(8, ty, W - 16, 50); ctx.strokeStyle = LN; ctx.strokeRect(8.5, ty + 0.5, W - 17, 50);
    ctx.beginPath(); ctx.moveTo(8, ty + 17); ctx.lineTo(W - 8, ty + 17); ctx.moveTo(W * 0.52, ty + 17); ctx.lineTo(W * 0.52, ty + 50); ctx.stroke();
    ctx.fillStyle = LN; ctx.font = `700 9px ${MONO}`;
    ctx.fillText(`${env.scene.source.name.toUpperCase()} ${env.scene.source.grade} · TRY ${sm.attempt.n} ${sm.attempt.mode.toUpperCase()} · MOVE ${String(hud.step).padStart(2, '0')}/${hud.steps}`, 14, ty + 12);
    ctx.font = `400 9px ${MONO}`;
    ctx.fillText(`p ${hud.p == null ? '—' : (hud.p / 100).toFixed(2)}   MARGIN ${hud.margin == null ? '—' : (hud.margin >= 0 ? '+' : '') + hud.margin.toFixed(2)}`, 14, ty + 31);
    ctx.fillText(hud.move.toUpperCase().slice(0, 26), 14, ty + 44);
    ctx.fillText(`PUMP ${hud.pump}  POWER ${hud.power}%`, W * 0.52 + 8, ty + 31);
    ctx.fillStyle = hud.fear > hud.bandHi || hud.fear < hud.bandLo ? WARN : LN;
    ctx.fillText(`FEAR ${hud.fear} [${hud.bandLo}-${hud.bandHi}]`, W * 0.52 + 8, ty + 44);
  }

  return { name: 'Blueprint', fonts: ["400 9px 'Space Mono'", "700 9px 'Space Mono'"], init, draw };
})();
