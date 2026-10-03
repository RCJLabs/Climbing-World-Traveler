// 9 · Guidebook topo: the block as a guidebook draws it. The line in red with its number, neighbouring lines as
// numbered placeholders, a steepness glyph from the wall profile. The attempt is the climbed part of the line, a small
// figure on it, the high point of each try, and the crux marked.
STYLES.topo = (function () {
  const PPM = 100, CX = 0.05, CY = 1.98;
  const INK = '#1E1E1E', RED = '#D23C2E', GREY = '#9A968C', PAPER = '#FAF8F2';

  function init(env) {
    const { C, K, W, H, dpr, scene } = env;
    const S = K.cam(W, H, PPM, CX, CY);
    const proj = C.views.front;
    const L = K.layer(W, H, dpr);
    const x = L.x;
    x.fillStyle = PAPER; x.fillRect(0, 0, W, H);
    // Ground line with a few tufts, and the landing marked.
    const g = S(proj([0, 0, 0]));
    x.strokeStyle = INK; x.lineWidth = 1.5; x.beginPath(); x.moveTo(10, g[1] + 2); x.lineTo(W - 10, g[1] + 2); x.stroke();
    x.lineWidth = 1;
    for (let i = 0; i < 16; i++) { const px = 16 + K.hash(i) * (W - 32); x.beginPath(); x.moveTo(px, g[1] + 2); x.lineTo(px - 2, g[1] - 4); x.moveTo(px, g[1] + 2); x.lineTo(px + 3, g[1] - 5); x.stroke(); }
    // The block: outline, the top edge, the shaded flank stippled, a few features.
    const out = K.outlinePx(S, proj);
    x.save(); K.smooth(x, out); x.clip();
    const xs = out.map((p) => p[0]); const bx1 = Math.max(...xs);
    for (let i = 0; i < 900; i++) {
      const px = bx1 - Math.pow(K.hash(i), 1.8) * 90, py = S([0, top() - 0.1])[1] + K.hash(i + 3000) * (g[1] - S([0, top()])[1]);
      x.fillStyle = 'rgba(30,30,30,0.35)'; x.fillRect(px, py, 1, 1);
    }
    x.restore();
    x.strokeStyle = INK; x.lineWidth = 2.2; x.lineJoin = 'round'; K.smooth(x, out); x.stroke();
    const cap = K.capPx(S, proj, 1.3);
    x.lineWidth = 1.4; K.smooth(x, cap.slice(Math.floor(cap.length / 2) - 1), false); x.stroke();
    x.lineWidth = 1;
    for (const [a, b] of [[[-0.75, 0.95], [-0.5, 0.62]], [[0.78, 1.95], [0.95, 1.5]], [[0.45, 0.42], [0.8, 0.3]]]) { const p = S(proj([a[0], a[1], 0])), q = S(proj([b[0], b[1], 0])); x.beginPath(); x.moveTo(p[0], p[1]); x.quadraticCurveTo((p[0] + q[0]) / 2 + 6, (p[1] + q[1]) / 2, q[0], q[1]); x.stroke(); }
    // Where the face tips past vertical.
    for (const s of scene.wall.segments) if (s.angle > 90) {
      const [L0, R0] = C.faceSpan(s.y0);
      const a = S(proj([L0 + 0.1, s.y0, 0])), b = S(proj([R0 - 0.1, s.y0, 0]));
      x.save(); x.setLineDash([1, 4]); x.strokeStyle = GREY; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); x.restore();
    }
    // Holds, small.
    for (const h of scene.holds) { const c = S(proj([h.x, h.y, h.z])); K.holdPath(x, h, c, PPM); x.strokeStyle = GREY; x.lineWidth = 1; x.stroke(); }
    // Neighbouring problems: placeholders, numbered.
    const nb = [
      { n: 2, pts: [[-0.95, 0.35], [-1.0, 1.1], [-0.92, 1.8], [-0.6, top() - 0.05]] },
      { n: 3, pts: [[0.85, 0.35], [0.95, 1.0], [0.92, 1.7], [0.72, top() - 0.12]] },
    ];
    for (const l of nb) {
      const pts = l.pts.map(([a, b]) => S(proj([a, b, 0])));
      x.save(); x.setLineDash([6, 4]); x.strokeStyle = GREY; x.lineWidth = 2; K.smooth(x, pts, false); x.stroke(); x.restore();
      badge(x, pts[0][0], pts[0][1] + 16, l.n, GREY);
    }
    // The main line: start marks, the line, the top-out arrow, the number.
    const raw = C.linePath();
    const mids = [raw[0]];
    for (let i = 1; i + 1 < raw.length; i++) mids.push(C.mix3(raw[i], raw[i + 1], 0.5));
    mids.push(raw[raw.length - 1]);
    const line = mids.map((p) => S(proj(p)));
    const startH = scene.holds.filter((h) => h.start && h.hands && h.y > 1).map((h) => S(proj([h.x, h.y, h.z])));
    x.strokeStyle = RED; x.lineWidth = 2;
    for (const c of startH) { x.beginPath(); x.moveTo(c[0] - 6, c[1] + 9); x.lineTo(c[0] - 2, c[1] + 4); x.moveTo(c[0] + 6, c[1] + 9); x.lineTo(c[0] + 2, c[1] + 4); x.stroke(); }
    x.save(); x.setLineDash([2, 5]); x.strokeStyle = RED; x.lineWidth = 2.5; K.smooth(x, line, false); x.stroke(); x.restore();
    const tp = line[line.length - 1];
    x.strokeStyle = RED; x.lineWidth = 2.5; x.beginPath(); x.moveTo(tp[0], tp[1]); x.lineTo(tp[0] + 4, tp[1] - 34); x.stroke();
    x.beginPath(); x.moveTo(tp[0] - 4, tp[1] - 26); x.lineTo(tp[0] + 4, tp[1] - 36); x.lineTo(tp[0] + 11, tp[1] - 25); x.stroke();
    badge(x, line[0][0], g[1] - 18, 1, RED);
    x.strokeStyle = RED; x.lineWidth = 2; x.setLineDash([2, 3]); x.beginPath(); x.moveTo(line[0][0], g[1] - 30); x.lineTo(line[0][0], line[0][1] + 10); x.stroke(); x.setLineDash([]);
    // The crux, marked with a bolt.
    const crux = S(proj([C.hold.top.x, C.hold.top.y, C.hold.top.z]));
    bolt(x, crux[0] - 30, crux[1] + 2, RED);
    // A steepness glyph: the wall profile, angles labelled.
    glyph(x, scene, W - 70, 22);
    // Legend.
    x.textAlign = 'left';
    const ly = 24;
    badge(x, 22, ly, 1, RED); x.fillStyle = INK; x.font = "700 13px 'Archivo Narrow', sans-serif"; x.fillText(`${scene.source.name}`, 36, ly + 4);
    x.font = "600 13px 'Archivo Narrow', sans-serif"; x.fillText(scene.source.grade, 36 + x.measureText(`${scene.source.name}  `).width + 10, ly + 4);
    badge(x, 22, ly + 22, '2·3', GREY, 12); x.fillStyle = GREY; x.font = "500 12px 'Archivo Narrow', sans-serif"; x.fillText('[other problems] [grades]', 40, ly + 26);
    return { L, S, line, raw: raw.map((p) => S(proj(p))) };
    function top() { return C.top; }
  }
  function badge(x, cx, cy, n, col, r = 9) {
    x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#FFFFFF'; x.font = `700 ${String(n).length > 1 ? 8 : 11}px 'Archivo Narrow', sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), cx, cy + 0.5); x.textBaseline = 'alphabetic'; x.textAlign = 'left';
  }
  function bolt(x, cx, cy, col) {
    x.fillStyle = col; x.beginPath(); x.moveTo(cx + 2, cy - 9); x.lineTo(cx - 5, cy + 1); x.lineTo(cx, cy + 1); x.lineTo(cx - 3, cy + 9); x.lineTo(cx + 5, cy - 2); x.lineTo(cx, cy - 2); x.closePath(); x.fill();
  }
  function glyph(x, scene, gx, gy) {
    const segs = scene.wall.segments, top = scene.wall.top;
    const sc = 26; // px per metre, height
    x.strokeStyle = INK; x.lineWidth = 1.6;
    let zz = 0;
    const pts = [[gx, gy + top * sc]];
    for (const s of segs) { zz += (s.y1 - s.y0) * Math.tan(((s.angle - 90) * Math.PI) / 180) * 4; pts.push([gx + zz * sc, gy + (top - s.y1) * sc]); }
    x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke();
    x.strokeStyle = GREY; x.lineWidth = 1; x.beginPath(); x.moveTo(gx - 8, gy + top * sc); x.lineTo(gx + 30, gy + top * sc); x.stroke();
    x.font = "600 10px 'Archivo Narrow', sans-serif"; x.fillStyle = INK; x.textAlign = 'left';
    segs.forEach((s, i) => { const a = pts[i], b = pts[i + 1]; x.fillText(`${s.angle}°`, Math.max(a[0], b[0]) + 6, (a[1] + b[1]) / 2 + 3); });
    x.fillStyle = GREY; x.fillText('profile ×4', gx - 8, gy + top * sc + 14);
  }

  function draw(ctx, env) {
    const { C, K, W, H, cache, sm, time } = env;
    ctx.drawImage(cache.L.c, 0, 0, W, H);
    const S = cache.S;
    const proj = C.views.front;
    const hud = C.hudOf(sm);
    // How far up the line this attempt has got: the line solid to the highest hand hold reached.
    const touched = C.touched(sm);
    const line = cache.line;
    const handIds = [...new Set(env.scene.line.filter((s) => s.limb[1] === 'H').map((s) => s.hold))];
    let reached = 0;
    const F = sm.attempt.frames;
    const upto = sm.seg.kind === 'step' ? sm.seg.i : sm.seg.kind === 'intro' ? 0 : F.length - 1;
    for (let i = 0; i <= upto; i++) for (const l of ['LH', 'RH']) if (F[i].pose.on[l]) { const id = C.nearestHold(F[i].pose.ends[l]); const j = handIds.indexOf(id); if (j + 1 > reached) reached = j + 1; }
    if (sm.seg.kind === 'reach' && sm.u > 0.8) reached = Math.max(reached, handIds.length);
    if (sm.seg.kind === 'mantle' || sm.seg.kind === 'cheer') reached = handIds.length;
    const climbed = () => { ctx.strokeStyle = RED; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; K.smooth(ctx, line.slice(0, Math.min(line.length, reached + 1)), false); ctx.stroke(); };
    // High points of tries that came off.
    env.scene.attempts.forEach((A, i) => {
      if (A.result.outcome === 'sent' || i > sm.ai || (i === sm.ai && sm.seg.kind !== 'land')) return;
      const c = S(proj([C.hold.top.x, C.hold.top.y, C.hold.top.z]));
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(c[0] + 10, c[1] - 4); ctx.lineTo(c[0] + 18, c[1] + 4); ctx.moveTo(c[0] + 18, c[1] - 4); ctx.lineTo(c[0] + 10, c[1] + 4); ctx.stroke();
      ctx.font = "700 11px 'Archivo Narrow', sans-serif"; ctx.fillStyle = INK; ctx.fillText(`try ${A.n}: ${Math.round(100 * A.result.progress)}%`, c[0] + 22, c[1] + 4);
    });
    // The figure, solid and small, like a guidebook's illustration.
    const body = K.parts(sm.pose, proj, S, K.depths.front);
    const k = body.k;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.72;
    for (const p of body.list) {
      ctx.strokeStyle = '#55524C'; ctx.fillStyle = '#55524C';
      if (p.kind === 'torso') { ctx.lineWidth = 5; K.path(ctx, p.q); ctx.fill(); ctx.stroke(); continue; }
      if (p.kind === 'head') { ctx.beginPath(); ctx.arc(p.c[0], p.c[1], 0.1 * PPM * k, 0, Math.PI * 2); ctx.fill(); continue; }
      ctx.lineWidth = (p.limb[1] === 'H' ? 0.065 : 0.09) * PPM * k; K.line(ctx, p.a, p.b); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    climbed();
    // The current move, as a guidebook note on the line.
    const tg = C.target(sm);
    if (tg && sm.seg.kind === 'step') {
      const c = S(proj([tg.hold.x, tg.hold.y, tg.hold.z]));
      const t = `${hud.move.split(' · ')[0].toLowerCase()} ${hud.p != null ? hud.p + '%' : ''}`;
      ctx.font = "600 11px 'Archivo Narrow', sans-serif";
      const w = ctx.measureText(t).width + 10;
      const lx = c[0] < W / 2 ? c[0] - w - 16 : c[0] + 16;
      ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.fillRect(lx, c[1] - 9, w, 18); ctx.strokeRect(lx, c[1] - 9, w, 18);
      ctx.fillStyle = INK; ctx.fillText(t, lx + 5, c[1] + 4);
      ctx.beginPath(); ctx.moveTo(c[0] < W / 2 ? lx + w : lx, c[1]); ctx.lineTo(c[0] + (c[0] < W / 2 ? -6 : 6), c[1]); ctx.stroke();
    }
    if (sm.seg.kind === 'cheer') {
      const c = S(proj([C.hold.top.x, C.hold.top.y, C.hold.top.z]));
      ctx.strokeStyle = '#1F7A3A'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(c[0] - 34, c[1]); ctx.lineTo(c[0] - 28, c[1] + 7); ctx.lineTo(c[0] - 16, c[1] - 8); ctx.stroke();
      ctx.font = "700 12px 'Archivo Narrow', sans-serif"; ctx.fillStyle = '#1F7A3A'; ctx.textAlign = 'right'; ctx.fillText(`sent, try ${sm.attempt.n}`, c[0] - 40, c[1] + 4); ctx.textAlign = 'left';
    }
  }

  return { name: 'Guidebook topo', fonts: ["600 11px 'Archivo Narrow'", "700 13px 'Archivo Narrow'"], init, draw };
})();
