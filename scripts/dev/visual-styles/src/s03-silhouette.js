// 3 · Cinematic silhouette: a side-on shot against the low sun. The block's profile shows the wall's real angles
// (88°, 90°, 93° here) and how far the hips hang off the rock. Fear is a heartbeat at the edges, pump a glow in the
// forearms; the crux and the fall drop into slow motion with the bars closing in, and the commentary runs as subtitles.
STYLES.silhouette = (function () {
  const PPM = 128, Y0 = -0.7, Y1 = 4.9;
  const INK = '#0B0710', FAR = '#2A1B2E', RIM = '#FFB36A';
  const proj = (p) => [p[2], p[1] * 0.9986 + -p[0] * 0.0523 * 0];
  const depth = (p) => -p[0];

  function init(env) {
    const { C, K, W, dpr } = env;
    // The backdrop: sky, sun and hills, taller than the screen for a slow parallax.
    const BH = 900;
    const B = K.layer(W, BH, dpr);
    const x = B.x;
    const sky = x.createLinearGradient(0, 0, 0, BH);
    sky.addColorStop(0, '#15142E'); sky.addColorStop(0.32, '#4A2453'); sky.addColorStop(0.55, '#B2435A'); sky.addColorStop(0.72, '#F08A4B'); sky.addColorStop(0.84, '#FFD58A'); sky.addColorStop(1, '#FFE9B8');
    x.fillStyle = sky; x.fillRect(0, 0, W, BH);
    const sunY = BH * 0.8, sunX = W * 0.74;
    const glow = x.createRadialGradient(sunX, sunY, 10, sunX, sunY, 260);
    glow.addColorStop(0, 'rgba(255,236,190,0.95)'); glow.addColorStop(0.2, 'rgba(255,200,130,0.5)'); glow.addColorStop(1, 'rgba(255,170,100,0)');
    x.fillStyle = glow; x.fillRect(0, 0, W, BH);
    x.fillStyle = '#FFF1CC'; x.beginPath(); x.arc(sunX, sunY, 34, 0, Math.PI * 2); x.fill();
    const r = C.rng(41);
    const ridge = (base, amp, col, n, seed) => {
      const rr = C.rng(seed);
      x.fillStyle = col; x.beginPath(); x.moveTo(0, BH);
      for (let i = 0; i <= n; i++) x.lineTo((W * i) / n, base - amp * (0.4 + 0.6 * Math.sin(i * 0.9 + seed) * 0.5 + rr() * 0.5));
      x.lineTo(W, BH); x.closePath(); x.fill();
    };
    ridge(BH * 0.82, 60, 'rgba(120,52,84,0.75)', 9, 2);
    ridge(BH * 0.86, 50, 'rgba(70,32,64,0.9)', 12, 5);
    // Pines on the near ridge.
    x.fillStyle = '#1E1024';
    for (let i = 0; i < 26; i++) {
      const px = r() * W, base = BH * 0.9 + r() * 10, h = 40 + r() * 70;
      x.beginPath(); x.moveTo(px, base - h);
      for (let t = 1; t <= 4; t++) { x.lineTo(px + (t * h) / 14, base - h + (t * h) / 4); x.lineTo(px + (t * h) / 30, base - h + (t * h) / 4 - 4); }
      for (let t = 4; t >= 1; t--) { x.lineTo(px - (t * h) / 30, base - h + (t * h) / 4 - 4); x.lineTo(px - (t * h) / 14, base - h + (t * h) / 4); }
      x.closePath(); x.fill();
    }
    x.fillStyle = '#1E1024'; x.fillRect(0, BH * 0.92, W, BH * 0.08);
    // The block in profile: the low-poly mesh flattened to one shape.
    const mesh = K.boulderMesh(23, { depth: 2.2, nf: 5, nb: 10, taper: 0.55, ys: [0, 0.4, 0.8, 1.2, 1.6, 1.95, 2.2, C.top - 0.04] });
    return { B, BH, mesh, sunX, sunFrac: 0.8 };
  }

  function speedAt(sm) {
    const k = sm.seg.kind;
    if (k === 'fall') return 0.45;
    if ((k === 'step' || k === 'reach') && (sm.seg.style.cls === 'deadpoint' || sm.seg.style.cls === 'dyno')) return 0.4;
    return 1;
  }

  function limbStroke(ctx, pts, w0, w1, col) {
    ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = w0; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.stroke();
    ctx.lineWidth = w1; ctx.beginPath(); ctx.moveTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[2][0], pts[2][1]); ctx.stroke();
  }

  function draw(ctx, env) {
    const { C, K, W, H, dpr, cache, sm, time } = env;
    const half = H / PPM / 2;
    const cy = C.clamp(C.followY(time, proj, -9, 9) + 0.2, Y0 + half, Y1 - half);
    // Backdrop with a slow parallax.
    const par = (cy - (Y0 + half)) / (Y1 - Y0 - 2 * half);
    const by = (cache.BH - H) * (1 - par * 0.35) - 40;
    ctx.drawImage(cache.B.c, 0, Math.round(by * dpr), W * dpr, H * dpr, 0, 0, W, H);
    const S = K.cam(W, H, PPM, 0.55, cy);
    const P = (p) => S(proj(p));
    const sun = [cache.sunX, cache.sunFrac * cache.BH - by];
    // Toward the sun on screen: where the rim light falls.
    const rimAt = (c) => { const dx = sun[0] - c[0], dy = sun[1] - c[1], l = Math.hypot(dx, dy) || 1; return [(dx / l) * 1.8, (dy / l) * 1.8]; };
    // Ground and pads.
    const g0 = P([0, 0, 0]);
    ctx.fillStyle = INK; ctx.fillRect(0, g0[1], W, H - g0[1]);
    for (const pad of K.pads.slice(0, 1)) {
      const a = P([0, pad.t, pad.z0]), b = P([0, 0, pad.z1 + 0.06]);
      ctx.fillStyle = RIM; ctx.fillRect(a[0] + 1.5, a[1] - 1.5, b[0] - a[0], b[1] - a[1]);
      ctx.fillStyle = INK; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1] + 2);
    }
    // Grass tufts.
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    for (let i = 0; i < 30; i++) {
      const px = (K.hash(i) * W * 1.2) - W * 0.1, h = 6 + K.hash(i + 99) * 12;
      ctx.beginPath(); ctx.moveTo(px, g0[1] + 1); ctx.lineTo(px + (K.hash(i + 7) - 0.5) * 8, g0[1] - h); ctx.stroke();
    }
    // The block: rim pass, then the dark mass.
    const tris = cache.mesh.tris;
    const c0 = P([0, 1.2, -0.8]);
    const off = rimAt(c0);
    for (const [col, dx, dy] of [[RIM, off[0], off[1]], [INK, 0, 0]]) {
      ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.lineJoin = 'round';
      for (const t of tris) { const a = P(t[0]), b = P(t[1]), c = P(t[2]); ctx.beginPath(); ctx.moveTo(a[0] + dx, a[1] + dy); ctx.lineTo(b[0] + dx, b[1] + dy); ctx.lineTo(c[0] + dx, c[1] + dy); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    }
    // The climber: far limbs a shade lighter, then the body, then the near limbs; each with a rim toward the sun.
    const b = C.body3(sm.pose);
    const k = b.k;
    const J = (p) => P(p);
    const limbs = [
      { pts: [b.shR, b.elR, b.RH], w: [0.09, 0.075], far: true, fore: true },
      { pts: [b.hipR, b.knR, b.RF], w: [0.13, 0.1], far: true },
      { pts: [b.shL, b.elL, b.LH], w: [0.09, 0.075], far: false, fore: true },
      { pts: [b.hipL, b.knL, b.LF], w: [0.13, 0.1], far: false },
    ];
    if (depth(b.shR) > depth(b.shL)) for (const l of limbs) l.far = !l.far;
    const hud = C.hudOf(sm);
    const drawLimb = (l, col, dx, dy) => limbStroke(ctx, l.pts.map((p) => { const q = J(p); return [q[0] + dx, q[1] + dy]; }), l.w[0] * PPM * k, l.w[1] * PPM * k, col);
    const bodyShape = (col, dx, dy) => {
      const sh = J(b.sh), hp = J(b.hip), hd = J(b.head), nk = J(b.neck);
      ctx.strokeStyle = col; ctx.lineCap = 'round';
      ctx.lineWidth = 0.27 * PPM * k; ctx.beginPath(); ctx.moveTo(sh[0] + dx, sh[1] + dy + 4); ctx.lineTo(hp[0] + dx, hp[1] + dy - 2); ctx.stroke();
      ctx.lineWidth = 0.07 * PPM * k; ctx.beginPath(); ctx.moveTo(nk[0] + dx, nk[1] + dy); ctx.lineTo(hd[0] + dx, hd[1] + dy); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(hd[0] + dx, hd[1] + dy, 0.105 * PPM * k, 0, Math.PI * 2); ctx.fill();
      // A ponytail at the back of the head, and the chalk bag.
      const back = J(C.add3(b.head, [0, -0.06, 0.12])), tail = J(C.add3(b.head, [0, -0.2, 0.17]));
      ctx.lineWidth = 0.05 * PPM * k; ctx.beginPath(); ctx.moveTo(back[0] + dx, back[1] + dy); ctx.quadraticCurveTo(tail[0] + 6 + dx, back[1] + dy, tail[0] + dx, tail[1] + dy); ctx.stroke();
      const bag = J(C.add3(b.hip, [0, 0.02, 0.13]));
      ctx.beginPath(); ctx.ellipse(bag[0] + dx, bag[1] + dy, 0.05 * PPM * k, 0.06 * PPM * k, 0, 0, Math.PI * 2); ctx.fill();
    };
    const offB = rimAt(J(b.sh));
    for (const l of limbs.filter((l) => l.far)) { drawLimb(l, RIM, offB[0] * 0.6, offB[1] * 0.6); drawLimb(l, FAR, 0, 0); }
    bodyShape(RIM, offB[0], offB[1]); bodyShape(INK, 0, 0);
    for (const l of limbs.filter((l) => !l.far)) { drawLimb(l, RIM, offB[0], offB[1]); drawLimb(l, INK, 0, 0); }
    // Pump glows in the forearms.
    const pump = hud.pump / 100;
    if (pump > 0.01) {
      ctx.save(); ctx.shadowColor = 'rgba(255,90,40,0.9)'; ctx.shadowBlur = 10;
      for (const l of limbs.filter((l) => l.fore)) {
        const a = J(l.pts[1]), e = J(l.pts[2]);
        ctx.strokeStyle = `rgba(255,${Math.round(120 - 60 * pump)},50,${Math.min(0.85, 0.2 + pump * 3)})`; ctx.lineWidth = 0.035 * PPM * k; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(C.lerp(a[0], e[0], 0.15), C.lerp(a[1], e[1], 0.15)); ctx.lineTo(C.lerp(a[0], e[0], 0.8), C.lerp(a[1], e[1], 0.8)); ctx.stroke();
      }
      ctx.restore();
    }
    // Breath in the cold air, quicker as the effort climbs.
    if (sm.seg.kind !== 'land') {
      const period = 2.2 - 1.2 * Math.min(1, hud.pump / 30 + (hud.fear - 25) / 60);
      const ph = (time % period) / period;
      const mouth = J(C.add3(b.head, [0, -0.03, -0.12]));
      for (let i = 0; i < 4; i++) {
        const v = ph - i * 0.06;
        if (v < 0 || v > 0.7) continue;
        ctx.fillStyle = `rgba(255,236,214,${0.22 * (1 - v / 0.7)})`;
        ctx.beginPath(); ctx.arc(mouth[0] - 14 * v - i * 3, mouth[1] - 10 * v, 3 + 10 * v, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Dust at the landing.
    if (sm.seg.kind === 'land' && sm.u < 0.7) {
      const c = J(b.hip);
      for (let i = 0; i < 22; i++) {
        const v = sm.u / 0.7, a = K.hash(i) * Math.PI, d = 20 + 70 * v * K.hash(i + 30);
        ctx.fillStyle = `rgba(40,22,40,${0.5 * (1 - v)})`;
        ctx.beginPath(); ctx.arc(c[0] + Math.cos(a) * d * (K.hash(i + 5) > 0.5 ? 1 : -1), g0[1] - Math.sin(a) * d * 0.35, 3 + 6 * v, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Lens flare at the top-out.
    if (sm.seg.kind === 'cheer') {
      const a = Math.min(1, sm.u * 2.5);
      const c = [W / 2, H / 2];
      for (const [t, r, al] of [[0.3, 18, 0.25], [0.55, 9, 0.35], [0.8, 26, 0.15], [1.2, 12, 0.3]]) {
        const p = [sun[0] + (c[0] - sun[0]) * t, sun[1] + (c[1] - sun[1]) * t];
        ctx.fillStyle = `rgba(255,214,160,${al * a})`; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Heartbeat at the edges: faster and redder with fear.
    const bpm = 70 + hud.fear * 1.4;
    const beat = Math.pow(Math.max(0, Math.sin((time * bpm * Math.PI) / 60)), 8);
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.72);
    vg.addColorStop(0, 'rgba(120,0,20,0)'); vg.addColorStop(1, `rgba(120,0,20,${(0.12 + 0.25 * beat) * Math.min(1, hud.fear / 40)})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    // Bars close in during slow motion.
    const slow = 1 - speedAt(sm);
    const bar = 22 + 30 * slow * Math.sin(Math.PI * Math.min(1, sm.u * 1.3 + 0.1));
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
    // Subtitles.
    ctx.font = "italic 500 17px 'Cormorant Garamond', serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const lines = K.wrap(ctx, hud.text, W - 60);
    lines.forEach((ln, i) => {
      const y = H - bar - 12 - (lines.length - 1 - i) * 20;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(ln, W / 2 + 1, y + 1);
      ctx.fillStyle = '#FFF4E2'; ctx.fillText(ln, W / 2, y);
    });
    ctx.textAlign = 'left';
  }

  return { name: 'Cinematic silhouette', fonts: ["italic 500 17px 'Cormorant Garamond'"], init, draw, speedAt };
})();
