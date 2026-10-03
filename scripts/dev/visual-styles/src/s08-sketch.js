// 8 · Sketchbook: a coach's notebook. Pencil on graph paper with a line that boils, the climber as a gesture
// figure with faint onion-skin poses behind, and handwritten notes for the move, the odds, the slips and the fall.
STYLES.sketch = (function () {
  const PPM = 140, Y0 = -0.9, Y1 = 4.95;
  const LEAD = 'rgba(58,55,50,0.82)', LEAD_L = 'rgba(58,55,50,0.35)', BLUE = '#2B4C9B', RED = '#C2412D', HIGHLIGHT = 'rgba(255,226,64,0.45)';
  const VARIANTS = 3, FPS = 8;

  /** A wobbly pencil line from a to b, drawn twice, slightly apart. */
  function jline(x, a, b, r, amp = 1.2, passes = 2) {
    for (let p = 0; p < passes; p++) {
      const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 14));
      x.beginPath();
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const px = a[0] + (b[0] - a[0]) * t + (r() - 0.5) * amp * 2, py = a[1] + (b[1] - a[1]) * t + (r() - 0.5) * amp * 2;
        i ? x.lineTo(px, py) : x.moveTo(px + (r() - 0.5) * 3, py + (r() - 0.5) * 3);
      }
      x.stroke();
    }
  }
  function jpath(x, pts, r, amp = 1.2, closed = true, passes = 2) {
    for (let p = 0; p < passes; p++) {
      x.beginPath();
      pts.forEach((q, i) => { const px = q[0] + (r() - 0.5) * amp * 2, py = q[1] + (r() - 0.5) * amp * 2; i ? x.lineTo(px, py) : x.moveTo(px, py); });
      if (closed) x.closePath();
      x.stroke();
    }
  }

  function paper(x, W, Hh, r) {
    x.fillStyle = '#F4EFE3'; x.fillRect(0, 0, W, Hh);
    // Graph lines.
    x.strokeStyle = 'rgba(110,150,200,0.18)'; x.lineWidth = 1;
    for (let gx = 8; gx < W; gx += 14) { x.beginPath(); x.moveTo(gx + 0.5, 0); x.lineTo(gx + 0.5, Hh); x.stroke(); }
    for (let gy = 6; gy < Hh; gy += 14) { x.beginPath(); x.moveTo(0, gy + 0.5); x.lineTo(W, gy + 0.5); x.stroke(); }
    // Grain.
    for (let i = 0; i < W * Hh * 0.01; i++) { x.fillStyle = `rgba(120,100,70,${0.04 + r() * 0.06})`; x.fillRect(r() * W, r() * Hh, 1, 1); }
  }

  function init(env) {
    const { C, K, W, dpr, scene } = env;
    const Hh = (Y1 - Y0) * PPM;
    const S = K.cam(W, Hh, PPM, 0, (Y0 + Y1) / 2);
    const proj = C.views.front;
    const layers = [];
    const pr = C.rng(99);
    const base = K.layer(W, Hh, dpr);
    paper(base.x, W, Hh, pr);
    // A coffee ring.
    const cr = S([1.05, 3.6]);
    base.x.strokeStyle = 'rgba(150,100,50,0.16)'; base.x.lineWidth = 5; base.x.beginPath(); base.x.arc(cr[0], cr[1], 46, 0.3, Math.PI * 2.1); base.x.stroke();
    base.x.lineWidth = 1.5; base.x.beginPath(); base.x.arc(cr[0] + 2, cr[1] + 1, 41, 0, Math.PI * 2); base.x.stroke();
    for (let v = 0; v < VARIANTS; v++) {
      const L = K.layer(W, Hh, dpr);
      const x = L.x;
      x.drawImage(base.c, 0, 0, W, Hh);
      const r = C.rng(500 + v * 17);
      x.lineCap = 'round'; x.lineJoin = 'round';
      // The ground and the pads.
      x.strokeStyle = LEAD; x.lineWidth = 1.3;
      const gl = S([0, 0.35]);
      jline(x, [6, gl[1] + 4], [W - 6, gl[1] - 2], r, 1.5);
      for (let i = 0; i < 18; i++) { const px = r() * W, py = gl[1] + 8 + r() * 140; x.strokeStyle = LEAD_L; jline(x, [px, py], [px + 6, py - 5], r, 0.6, 1); }
      for (const pad of K.pads) {
        const f = K.boxFaces(pad, proj, S);
        x.strokeStyle = LEAD; x.lineWidth = 1.3; jpath(x, f.top, r, 1.2); jpath(x, f.front, r, 1.0);
        x.strokeStyle = LEAD_L; x.lineWidth = 1;
        const [a, b, c, d] = f.front;
        for (let t = 0.05; t < 1; t += 0.07) jline(x, [C.lerp(a[0], b[0], t), a[1]], [C.lerp(d[0], c[0], t) + 5, d[1]], r, 0.6, 1);
      }
      // The block: outline, cap, a few contours, hatching on the shaded side and under the steep part.
      const out = K.outlinePx(S, proj);
      x.strokeStyle = LEAD; x.lineWidth = 1.5; jpath(x, out, r, 1.4, false);
      const cap = K.capPx(S, proj, 1.3);
      x.lineWidth = 1.2; jpath(x, cap.slice(Math.floor(cap.length / 2)), r, 1.2, false);
      x.save(); K.path(x, out); x.clip();
      const xs = out.map((p) => p[0]), ys = out.map((p) => p[1]);
      const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
      x.strokeStyle = LEAD_L; x.lineWidth = 1;
      for (let px = bx1 - 70; px < bx1 + 40; px += 5) jline(x, [px, by0 + 30], [px - 40, by1], r, 0.8, 1);
      const over = scene.wall.segments.find((s) => s.angle > 90);
      if (over) { const a = S(proj([0, over.y1, 0])), b = S(proj([0, over.y0, 0])); for (let px = bx0; px < bx1; px += 7) jline(x, [px, a[1] + 8], [px + 20, b[1] - 10], r, 0.6, 1); }
      x.restore();
      x.strokeStyle = LEAD; x.lineWidth = 1;
      for (const [a, b] of [[[-0.6, 0.9], [-0.35, 0.6]], [[0.7, 1.9], [0.85, 1.55]], [[0.5, 0.5], [0.75, 0.4]]]) jline(x, S(proj([a[0], a[1], 0])), S(proj([b[0], b[1], 0])), r, 1, 1);
      // Holds.
      for (const h of scene.holds) {
        const c = S(proj([h.x, h.y, h.z]));
        const [w0, h0] = K.dims(h);
        const w = w0 * PPM, hh = Math.max(3, h0 * PPM);
        x.strokeStyle = LEAD; x.lineWidth = 1.2;
        if (h.type === 'sloper') { jpath(x, Array.from({ length: 10 }, (_, i) => [c[0] + Math.cos(Math.PI + (i / 9) * Math.PI) * w * 0.5, c[1] + Math.sin(Math.PI + (i / 9) * Math.PI) * hh * 0.6]), r, 0.8, false); }
        else { jline(x, [c[0] - w / 2, c[1] - hh / 2], [c[0] + w / 2, c[1] - hh / 2], r, 0.6); x.strokeStyle = LEAD_L; jline(x, [c[0] - w / 2 + 1, c[1] + hh / 2], [c[0] + w / 2 - 1, c[1] + hh / 2], r, 0.6, 1); }
      }
      layers.push(L);
    }
    return { layers };
  }

  /** The figure as a gesture drawing: joints as small circles, a curved spine, an oval head. */
  function figure(x, env, S, pose, r, col, width, alpha) {
    const { C, K } = env;
    const proj = C.views.front;
    const body = K.parts(pose, proj, S, K.depths.front);
    const b = body.b, P = body.P;
    x.save(); x.globalAlpha = alpha; x.strokeStyle = col; x.lineWidth = width; x.lineCap = 'round'; x.lineJoin = 'round';
    const J = (k) => P(b[k]);
    for (const [s, e, end] of [['shL', 'elL', 'LH'], ['shR', 'elR', 'RH'], ['hipL', 'knL', 'LF'], ['hipR', 'knR', 'RF']]) {
      jline(x, J(s), J(e), r, 0.7); jline(x, J(e), J(end), r, 0.7);
      const m = J(e); x.beginPath(); x.arc(m[0], m[1], 2.2, 0, Math.PI * 2); x.stroke();
      const ee = J(end);
      if (end[1] === 'H') { x.beginPath(); x.ellipse(ee[0], ee[1], 4, 3, 0, 0, Math.PI * 2); x.stroke(); }
      else { jline(x, [ee[0] - 4, ee[1] + 2], [ee[0] + 5, ee[1] + 1], r, 0.4, 1); }
    }
    // Shoulder and hip girdles, a curved spine.
    jline(x, J('shL'), J('shR'), r, 0.7); jline(x, J('hipL'), J('hipR'), r, 0.7);
    const sh = J('sh'), hp = J('hip'), nk = J('neck');
    x.beginPath(); x.moveTo(nk[0], nk[1]); x.quadraticCurveTo((sh[0] + hp[0]) / 2 + 5, (sh[1] + hp[1]) / 2, hp[0], hp[1]); x.stroke();
    // Ribcage and pelvis as loose ovals.
    const rib = [C.lerp(sh[0], hp[0], 0.3), C.lerp(sh[1], hp[1], 0.3)];
    x.beginPath(); x.ellipse(rib[0], rib[1], 0.13 * PPM * body.k, 0.12 * PPM * body.k, 0, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.ellipse(hp[0], hp[1] - 3, 0.1 * PPM * body.k, 0.06 * PPM * body.k, 0, 0, Math.PI * 2); x.stroke();
    const hd = J('head');
    for (let i = 0; i < 2; i++) { x.beginPath(); x.ellipse(hd[0] + (r() - 0.5) * 2, hd[1] + (r() - 0.5) * 2, 0.085 * PPM * body.k, 0.105 * PPM * body.k, (r() - 0.5) * 0.2, 0, Math.PI * 2); x.stroke(); }
    x.restore();
    return body;
  }

  function note(ctx, text, x, y, col, size = 19, rot = -0.03, align = 'left') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.font = `500 ${size}px Caveat, cursive`; ctx.fillStyle = col; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    const w = ctx.measureText(text).width;
    ctx.restore();
    return w;
  }
  /** A hand-drawn arrow from a to b, curving by `bend`. */
  function arrow(ctx, a, b, col, bend = 20, r) {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const c = [mx - (dy / l) * bend, my + (dx / l) * bend];
    ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]); ctx.stroke();
    const ang = Math.atan2(b[1] - c[1], b[0] - c[0]);
    ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] - Math.cos(ang - 0.45) * 9, b[1] - Math.sin(ang - 0.45) * 9); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] - Math.cos(ang + 0.45) * 9, b[1] - Math.sin(ang + 0.45) * 9); ctx.stroke();
  }

  function draw(ctx, env) {
    const { C, K, W, H, dpr, cache, sm, time } = env;
    const proj = C.views.front;
    const half = H / PPM / 2;
    const cy = C.clamp(C.followY(time, proj, -9, 9) + 0.3, Y0 + half, Y1 - half);
    const off = (Y1 - cy) * PPM - H / 2;
    const tick = K.tick(time, FPS);
    ctx.drawImage(cache.layers[tick % VARIANTS].c, 0, Math.round(off * dpr), W * dpr, H * dpr, 0, 0, W, H);
    const S = K.cam(W, H, PPM, 0, cy);
    const r = C.rng(1000 + (tick % 5) * 31);
    const hud = C.hudOf(sm);
    const ev = C.event(sm);
    // Highlighter on the crux hold.
    const crux = C.hold.top;
    const cc = S(proj([crux.x, crux.y, crux.z]));
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = HIGHLIGHT; ctx.beginPath(); ctx.ellipse(cc[0], cc[1], 26, 11, -0.08, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    note(ctx, 'crux', cc[0] - 34, cc[1] - 18, BLUE, 18, -0.08, 'right');
    // Touched holds get a tick of chalk: a light scribble.
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2.5;
    for (const id of C.touched(sm)) { const h = C.hold[id]; const c = S(proj([h.x, h.y, h.z])); ctx.beginPath(); ctx.moveTo(c[0] - 6, c[1] - 2); ctx.lineTo(c[0] + 5, c[1] - 3); ctx.stroke(); }
    // Onion skin: where the body was a moment ago, in blue pencil.
    if (sm.seg.kind === 'step' || sm.seg.kind === 'reach' || sm.seg.kind === 'fall' || sm.seg.kind === 'mantle') {
      for (const [dt, a] of [[0.5, 0.16], [0.25, 0.26]]) {
        const s2 = C.sample(time - dt);
        if (s2.ai !== sm.ai) continue;
        figure(ctx, env, S, s2.pose, C.rng(7), '#5B7DB8', 1.2, a);
      }
    }
    const body = figure(ctx, env, S, sm.pose, r, '#3A3732', 1.6, 0.92);
    // Notes.
    const tg = C.target(sm);
    const MOVE = { static: 'static', high_step: 'high step', deadpoint: 'deadpoint!', dyno: 'dyno!', mantle: 'mantle' };
    if (tg && (sm.seg.kind === 'step' || sm.seg.kind === 'reach' || sm.seg.kind === 'intro')) {
      const c = S(proj([tg.hold.x, tg.hold.y, tg.hold.z]));
      const from = body.P(body.b[tg.limb]);
      const right = c[0] < W * 0.55;
      const lx = right ? Math.max(c[0], from[0]) + 52 : Math.min(c[0], from[0]) - 52;
      const ly = c[1] - 26;
      const label = `${MOVE[tg.cls] || tg.cls}${hud.p != null && sm.seg.kind === 'step' ? `  p≈${hud.p}%` : ''}`;
      note(ctx, label, lx, ly, BLUE, 19, -0.04, right ? 'left' : 'right');
      arrow(ctx, [lx + (right ? -6 : 6), ly + 6], [c[0] + (right ? 9 : -9), c[1] - 4], BLUE, right ? -14 : 14, r);
      if (tg.cls === 'deadpoint' && sm.seg.kind === 'step') {
        const a0 = S(proj(sm.seg.from.ends[tg.limb]));
        ctx.setLineDash([3, 4]); ctx.strokeStyle = BLUE; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.quadraticCurveTo((a0[0] + c[0]) / 2 - 24, Math.min(a0[1], c[1]) - 22, c[0], c[1]); ctx.stroke(); ctx.setLineDash([]);
        if (sm.seg.style.commit === 'apex') note(ctx, 'caught it at the apex', c[0] + 20, c[1] + 28, BLUE, 17, 0.03);
      }
    }
    if (ev === 'sketchy' && sm.u > 0.55) {
      const c = body.P(body.b[sm.seg.style.limb]);
      ctx.strokeStyle = RED; ctx.lineWidth = 1.6;
      ctx.beginPath(); for (let i = 0; i <= 26; i++) { const a = (i / 24) * Math.PI * 2; ctx.lineTo(c[0] + Math.cos(a) * (15 + (i % 2) * 2), c[1] + Math.sin(a) * (12 + (i % 3))); } ctx.stroke();
      note(ctx, 'sketchy!', c[0] + 22, c[1] + 18, RED, 19, 0.06);
    }
    if (ev === 'slip' && sm.u > 0.48) {
      const c = body.P(body.b[sm.seg.style.limb]);
      ctx.strokeStyle = RED; ctx.lineWidth = 1.6;
      ctx.beginPath(); for (let i = 0; i < 7; i++) ctx.lineTo(c[0] - 14 + i * 5, c[1] + 10 + (i % 2 ? 6 : 0)); ctx.stroke();
      note(ctx, `${sm.seg.style.limb[1] === 'F' ? 'foot' : 'hand'} popped. held it.`, c[0] + (c[0] > W / 2 ? -14 : 14), c[1] + 32, RED, 18, 0.04, c[0] > W / 2 ? 'right' : 'left');
    }
    if (hud.fearUp && sm.u > 0.45) {
      const hp = body.P(body.b.hip);
      note(ctx, `fear +${hud.fearUp.d} (${hud.fearUp.label})`, hp[0] - 52, hp[1] - 18, RED, 17, -0.05, 'right');
    }
    if (hud.pump >= 12 && sm.seg.kind === 'step') {
      const el = body.P(body.b.elR);
      note(ctx, `pump ${hud.pump}%`, el[0] + 30, el[1] + 6, BLUE, 16, 0.05);
    }
    if (sm.seg.kind === 'fall' || sm.seg.kind === 'land') {
      const c = cc;
      ctx.strokeStyle = RED; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(c[0] - 8, c[1] - 8); ctx.lineTo(c[0] + 8, c[1] + 8); ctx.moveTo(c[0] + 8, c[1] - 8); ctx.lineTo(c[0] - 8, c[1] + 8); ctx.stroke();
      note(ctx, `off here (${Math.round(100 * sm.attempt.result.progress)}%)`, c[0] + 16, Math.max(20, c[1] - 4), RED, 19, -0.04);
      if (sm.seg.kind === 'land') note(ctx, 'left hand came off the sloper', W / 2, Math.min(H - 70, body.P(body.b.head)[1] - 50), RED, 18, -0.02, 'center');
    }
    if (sm.seg.kind === 'cheer') {
      const hd = body.P(body.b.head);
      ctx.strokeStyle = BLUE; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hd[0] - 62, hd[1] - 50); ctx.lineTo(hd[0] - 52, hd[1] - 40); ctx.lineTo(hd[0] - 34, hd[1] - 66); ctx.stroke();
      note(ctx, 'SENT. 2nd go', hd[0] - 26, hd[1] - 52, BLUE, 26, -0.06);
    }
    // The margin: attempts so far.
    const done = env.scene.attempts.filter((A, i) => i < sm.ai || (i === sm.ai && (sm.seg.kind === 'land' || sm.seg.kind === 'cheer')));
    done.forEach((A, i) => note(ctx, `${A.n} · ${A.mode} — ${A.result.outcome === 'sent' ? 'sent' : `off at ${Math.round(100 * A.result.progress)}%`}`, 14, H - 44 + i * 22, A.result.outcome === 'sent' ? BLUE : RED, 19, -0.02));
  }

  return { name: 'Sketchbook', fonts: ["500 19px Caveat"], init, draw };
})();
