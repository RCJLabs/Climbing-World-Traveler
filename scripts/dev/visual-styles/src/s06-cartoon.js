// 6 · Cartoon: Saturday-morning colours, thick outlines and a big-headed climber. The simulation's events become
// gags: squash on the landing, a stretch on the slap, sound effects for slips and the catch, stars after a fall.
STYLES.cartoon = (function () {
  const PPM = 145, Y0 = -0.9, Y1 = 5.0;
  const INK = '#2B2340';
  const C0 = { sky0: '#7FD3F7', sky1: '#D2F3FF', hill1: '#8AD27A', hill2: '#66BC5E', rock: '#F0B46A', rockHi: '#F9D29A', rockSh: '#D18E4C', hold: '#F7C98B', sand: '#F6DC93', pad1: '#56C3EA', pad2: '#FF7F8E', shirt: '#FFCC33', pants: '#4C6FD8', skin: '#FFC9A0', hair: '#6B3E26', band: '#E8453C', shoe: '#E8453C' };

  function init(env) {
    const { C, K, W, dpr } = env;
    const Hh = (Y1 - Y0) * PPM;
    const L = K.layer(W, Hh, dpr);
    const S = K.cam(W, Hh, PPM, 0, (Y0 + Y1) / 2);
    const x = L.x;
    const proj = C.views.front;
    const g = x.createLinearGradient(0, 0, 0, Hh * 0.7);
    g.addColorStop(0, C0.sky0); g.addColorStop(1, C0.sky1);
    x.fillStyle = g; x.fillRect(0, 0, W, Hh);
    const r = C.rng(3);
    // Clouds.
    for (const [cx, cy, s] of [[60, 0.18, 1], [300, 0.1, 1.2], [210, 0.32, 0.8], [40, 0.45, 0.7], [330, 0.52, 0.9]]) {
      const y = cy * Hh;
      x.fillStyle = '#FFFFFF'; x.strokeStyle = INK; x.lineWidth = 3;
      x.beginPath();
      for (const [dx, dy, rr] of [[-30, 6, 18], [-10, -6, 24], [16, -2, 20], [34, 8, 14], [0, 10, 18]]) x.arc(cx + dx * s, y + dy * s, rr * s, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#D6EEFA'; x.beginPath(); x.ellipse(cx, y + 18 * s, 44 * s, 6 * s, 0, 0, Math.PI * 2); x.fill();
    }
    // Hills and lollipop trees.
    const hill = (base, amp, col, ph) => {
      x.fillStyle = col; x.strokeStyle = INK; x.lineWidth = 3;
      x.beginPath(); x.moveTo(-10, Hh);
      for (let i = 0; i <= 20; i++) { const px = (W + 20) * (i / 20) - 10; x.lineTo(px, S([0, base])[1] - amp * PPM * (0.5 + 0.5 * Math.sin(i * 0.7 + ph))); }
      x.lineTo(W + 10, Hh); x.closePath(); x.fill(); x.stroke();
    };
    hill(1.1, 0.5, C0.hill1, 1);
    for (const [tx, ty, s] of [[40, 1.55, 1], [350, 1.6, 1.15], [290, 1.4, 0.8], [110, 1.35, 0.75]]) {
      const b = S([0, ty]);
      x.strokeStyle = INK; x.lineWidth = 3; x.fillStyle = '#9A6436';
      x.beginPath(); x.rect(tx - 5 * s, b[1] - 40 * s, 10 * s, 60 * s); x.fill(); x.stroke();
      x.fillStyle = '#4FAE4E'; x.beginPath(); x.arc(tx, b[1] - 60 * s, 34 * s, 0, Math.PI * 2); x.fill(); x.stroke();
      x.fillStyle = '#6CCB64'; x.beginPath(); x.arc(tx - 10 * s, b[1] - 70 * s, 16 * s, 0, Math.PI * 2); x.fill();
    }
    hill(0.75, 0.3, C0.hill2, 3);
    // Sand.
    const s0 = S([0, 0.42]);
    x.fillStyle = C0.sand; x.strokeStyle = INK; x.lineWidth = 3;
    x.beginPath(); x.moveTo(-10, Hh); x.lineTo(-10, s0[1] + 8); x.quadraticCurveTo(W / 2, s0[1] - 18, W + 10, s0[1] + 8); x.lineTo(W + 10, Hh); x.closePath(); x.fill(); x.stroke();
    for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(200,150,80,0.5)'; x.beginPath(); x.arc(r() * W, s0[1] + 20 + r() * (Hh - s0[1]), 1.5 + r() * 2, 0, Math.PI * 2); x.fill(); }
    // The block: chunky, outlined, with a big highlight and a shadow side.
    const out = K.outlinePx(S, proj);
    x.save();
    K.smooth(x, out); x.fillStyle = C0.rock; x.fill(); x.clip();
    const xs = out.map((p) => p[0]), ys = out.map((p) => p[1]);
    const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
    x.fillStyle = C0.rockSh; x.beginPath(); x.ellipse(bx1 + 10, (by0 + by1) / 2 + 30, 70, (by1 - by0) * 0.62, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = C0.rockHi; x.beginPath(); x.ellipse(bx0 + 70, by0 + 70, 46, 30, -0.4, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#FFFFFF'; x.globalAlpha = 0.7; x.beginPath(); x.ellipse(bx0 + 60, by0 + 58, 14, 7, -0.4, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1;
    // Cracks.
    x.strokeStyle = INK; x.lineWidth = 2.5; x.lineCap = 'round'; x.lineJoin = 'round';
    for (const [sx, sy, n] of [[0.22, 0.62, 4], [0.8, 0.3, 3], [0.6, 0.85, 3]]) {
      let px = bx0 + sx * (bx1 - bx0), py = by0 + sy * (by1 - by0);
      x.beginPath(); x.moveTo(px, py);
      for (let i = 0; i < n; i++) { px += (r() - 0.5) * 18; py += 10 + r() * 8; x.lineTo(px, py); }
      x.stroke();
    }
    x.restore();
    const cap = K.capPx(S, proj, 1.3);
    K.smooth(x, cap); x.fillStyle = C0.rockHi; x.fill(); x.strokeStyle = INK; x.lineWidth = 4; x.stroke();
    K.smooth(x, out); x.strokeStyle = INK; x.lineWidth = 4; x.stroke();
    // Pads.
    K.pads.forEach((pad, i) => {
      const f = K.boxFaces(pad, proj, S);
      x.lineJoin = 'round'; x.strokeStyle = INK; x.lineWidth = 3;
      K.path(x, f.front); x.fillStyle = i ? '#E25A6C' : '#3BA5CF'; x.fill(); x.stroke();
      K.path(x, f.top); x.fillStyle = i ? C0.pad2 : C0.pad1; x.fill(); x.stroke();
      x.setLineDash([4, 4]); x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 2;
      const m = (a, b, t) => [C.lerp(a[0], b[0], t), C.lerp(a[1], b[1], t)];
      K.path(x, [m(f.top[0], f.top[2], 0.08), m(f.top[1], f.top[3], 0.08), m(f.top[2], f.top[0], 0.08), m(f.top[3], f.top[1], 0.08)]); x.stroke();
      x.setLineDash([]);
    });
    // Holds: outlined blobs with a shine.
    for (const h of env.scene.holds) {
      const c = S(proj([h.x, h.y, h.z]));
      K.holdPath(x, h, c, PPM, 2.5); x.fillStyle = C0.hold; x.fill(); x.strokeStyle = INK; x.lineWidth = 2.5; x.stroke();
      x.fillStyle = '#FFFFFF'; x.beginPath(); x.arc(c[0] - K.dims(h)[0] * PPM * 0.25, c[1] - 1.5, 1.6, 0, Math.PI * 2); x.fill();
    }
    return { L };
  }

  /** Bold comic lettering in a spiky burst. */
  function sfx(ctx, x, y, text, rot, fill, size = 26, alpha = 1) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = alpha;
    ctx.font = `${size}px Bangers, 'Baloo 2', sans-serif`;
    const w = ctx.measureText(text).width;
    ctx.beginPath();
    const n = 14;
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, rr = i % 2 ? 0.62 : 0.84; ctx.lineTo(Math.cos(a) * (w * rr + 6), Math.sin(a) * (size * rr + 4)); }
    ctx.closePath(); ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.fill(); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.strokeText(text, 0, 2);
    ctx.fillStyle = fill; ctx.fillText(text, 0, 2);
    ctx.restore();
  }
  function star(ctx, x, y, r, col) {
    ctx.beginPath();
    for (let j = 0; j < 10; j++) { const rr = j % 2 ? r * 0.45 : r, a = (j / 10) * Math.PI * 2 - Math.PI / 2; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.fill(); ctx.stroke();
  }

  function climber(ctx, env, S, sm, hud, time) {
    const { C, K } = env;
    const proj = C.views.front;
    const body = K.parts(sm.pose, proj, S, K.depths.front);
    const k = body.k, px = PPM * k;
    const kind = sm.seg.kind;
    const facing = kind === 'land' || kind === 'cheer' || (kind === 'fall' && sm.u > 0.55);
    const hip = body.P(body.b.hip);
    ctx.save();
    // Squash on the landing, a stretch on a slap.
    if (kind === 'land') {
      const v = Math.min(1, sm.u / 0.45);
      const sq = Math.exp(-5 * v) * Math.cos(v * 14);
      ctx.translate(hip[0], hip[1] + 20); ctx.scale(1 + 0.3 * sq, 1 - 0.3 * sq); ctx.translate(-hip[0], -hip[1] - 20);
    } else if (C.event(sm) === 'deadpoint') {
      const v = Math.sin(Math.PI * sm.u);
      ctx.translate(hip[0], hip[1]); ctx.scale(1 - 0.05 * v, 1 + 0.1 * v); ctx.translate(-hip[0], -hip[1]);
    }
    const limbs = {};
    for (const p of body.list) if (p.kind !== 'torso' && p.kind !== 'head') (limbs[p.limb] = limbs[p.limb] || []).push(p);
    const items = Object.entries(limbs).map(([limb, ps]) => ({ limb, ps, depth: ps.reduce((s, p) => s + p.depth, 0) / ps.length }));
    for (const p of body.list) if (p.kind === 'torso' || p.kind === 'head') items.push({ part: p, depth: p.depth + (p.kind === 'head' ? 1 : 0) });
    items.sort((a, b) => a.depth - b.depth);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const tube = (pts, w, col) => {
      ctx.strokeStyle = INK; ctx.lineWidth = w + 6; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
    };
    let headAt = null;
    for (const it of items) {
      if (it.part && it.part.kind === 'torso') {
        const q = it.part.q;
        const c = [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4];
        const w = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) * 0.62, h = Math.hypot(q[0][0] - q[3][0], q[0][1] - q[3][1]) * 0.62;
        const ang = Math.atan2(q[0][0] - q[3][0], -(q[0][1] - q[3][1]));
        ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(ang);
        ctx.fillStyle = C0.shirt; ctx.strokeStyle = INK; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = C0.pants; ctx.beginPath(); ctx.ellipse(0, h * 0.62, w * 0.8, h * 0.42, 0, 0, Math.PI); ctx.fill(); ctx.stroke();
        // A star on the shirt.
        if (!facing) star(ctx, 0, -h * 0.15, 9, '#FF8A3D'); else star(ctx, 0, -h * 0.15, 9, '#FF8A3D');
        ctx.restore();
        continue;
      }
      if (it.part && it.part.kind === 'head') { headAt = it.part; continue; }
      const [up, lo] = it.ps[0].kind === 'upper' || it.ps[0].kind === 'thigh' ? it.ps : [it.ps[1], it.ps[0]];
      const arm = it.limb[1] === 'H';
      tube([up.a, up.b, lo.b], (arm ? 0.085 : 0.11) * px, arm ? C0.skin : C0.pants);
      const e = lo.b;
      if (arm) {
        ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(e[0], e[1], 0.06 * px, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else {
        ctx.fillStyle = C0.shoe; ctx.strokeStyle = INK; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(e[0], e[1] + 3, 0.075 * px, 0.05 * px, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(e[0] - 0.05 * px, e[1] + 3 + 0.02 * px, 0.1 * px, 2);
      }
    }
    // The head, big: the back of it while climbing, the face once turned round.
    const neck = headAt.neck;
    const sp = body.b.spine;
    const hc = body.P(C.add3(body.b.neck, C.mul3(sp, 0.2 * k)));
    const R = 0.19 * px;
    ctx.fillStyle = C0.skin; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(hc[0], hc[1], R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (!facing) {
      ctx.fillStyle = C0.hair; ctx.beginPath(); ctx.arc(hc[0], hc[1] - R * 0.05, R * 0.98, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // Spiky crown and a headband.
      ctx.beginPath(); ctx.moveTo(hc[0] - R * 0.5, hc[1] - R * 0.82); ctx.lineTo(hc[0] - R * 0.2, hc[1] - R * 1.25); ctx.lineTo(hc[0], hc[1] - R * 0.9); ctx.lineTo(hc[0] + R * 0.3, hc[1] - R * 1.2); ctx.lineTo(hc[0] + R * 0.45, hc[1] - R * 0.82); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C0.band; ctx.fillRect(hc[0] - R * 0.97, hc[1] - R * 0.35, R * 1.94, R * 0.3); ctx.strokeRect(hc[0] - R * 0.97, hc[1] - R * 0.35, R * 1.94, R * 0.3);
      ctx.fillStyle = C0.skin;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(hc[0] + s * R * 1.0, hc[1] + R * 0.15, R * 0.2, R * 0.28, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    } else {
      ctx.fillStyle = C0.hair; ctx.beginPath(); ctx.arc(hc[0], hc[1] - R * 0.2, R * 1.0, Math.PI * 1.05, Math.PI * 1.95); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C0.band; ctx.fillRect(hc[0] - R * 0.95, hc[1] - R * 0.55, R * 1.9, R * 0.26); ctx.strokeRect(hc[0] - R * 0.95, hc[1] - R * 0.55, R * 1.9, R * 0.26);
      const ex = R * 0.38, ey = hc[1] + R * 0.05;
      if (kind === 'cheer') {
        ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(hc[0] - ex, ey + 3, R * 0.16, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.beginPath(); ctx.arc(hc[0] + ex, ey + 3, R * 0.16, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        ctx.fillStyle = '#9E2B3A'; ctx.beginPath(); ctx.arc(hc[0], hc[1] + R * 0.35, R * 0.32, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
      } else {
        // Dizzy spirals.
        ctx.lineWidth = 2;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          for (let i = 0; i < 30; i++) { const a = i * 0.45 + time * 6 * s, rr = (i / 30) * R * 0.2; ctx.lineTo(hc[0] + s * ex + Math.cos(a) * rr, ey + Math.sin(a) * rr); }
          ctx.stroke();
        }
        ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(hc[0], hc[1] + R * 0.5, R * 0.14, R * 0.1, 0, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 3; i++) { const a = time * 3 + (i * Math.PI * 2) / 3; star(ctx, hc[0] + Math.cos(a) * R * 1.3, hc[1] - R * 1.1 + Math.sin(a) * R * 0.3, 7, '#FFD93D'); }
      }
    }
    ctx.restore();
    return { body, hc, R };
  }

  function draw(ctx, env) {
    const { C, K, W, H, dpr, cache, sm, time } = env;
    const proj = C.views.front;
    const half = H / PPM / 2;
    const cy = C.clamp(C.followY(time, proj, -9, 9) + 0.3, Y0 + half, Y1 - half);
    const off = (Y1 - cy) * PPM - H / 2;
    ctx.drawImage(cache.L.c, 0, Math.round(off * dpr), W * dpr, H * dpr, 0, 0, W, H);
    const S = K.cam(W, H, PPM, 0, cy);
    const hud = C.hudOf(sm);
    const ev = C.event(sm);
    // Chalk puffs on touched holds.
    for (const id of C.touched(sm)) {
      const h = C.hold[id]; const c = S(proj([h.x, h.y, h.z]));
      ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(c[0] - 5, c[1] - 6, 3, 0, Math.PI * 2); ctx.arc(c[0] + 2, c[1] - 8, 3.5, 0, Math.PI * 2); ctx.arc(c[0] + 7, c[1] - 5, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // Speed lines behind a fast hand or a falling body.
    if (ev === 'deadpoint' || ev === 'fall') {
      const l = ev === 'deadpoint' ? sm.seg.style.limb || 'LH' : null;
      const now = l ? S(proj(sm.pose.ends[l])) : S(proj(sm.pose.hip));
      const prev = C.sample(time - 0.12);
      const was = l ? S(proj(prev.pose.ends[l])) : S(proj(prev.pose.hip));
      const dx = now[0] - was[0], dy = now[1] - was[1], len = Math.hypot(dx, dy);
      if (len > 2) {
        const ux = dx / len, uy = dy / len;
        ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        for (let i = -2; i <= 2; i++) {
          const ox = -uy * i * 7, oy = ux * i * 7;
          ctx.beginPath(); ctx.moveTo(now[0] - ux * 18 + ox, now[1] - uy * 18 + oy); ctx.lineTo(now[0] - ux * (36 + 10 * (i % 2)) + ox, now[1] - uy * (36 + 10 * (i % 2)) + oy); ctx.stroke();
        }
      }
    }
    const { body, hc, R } = climber(ctx, env, S, sm, hud, time);
    // Sweat drops when pumped or scared.
    if ((hud.pump >= 8 || hud.fear >= 40) && sm.seg.kind !== 'land' && sm.seg.kind !== 'cheer') {
      for (let i = 0; i < 2; i++) {
        const ph = (time * 1.4 + i * 0.5) % 1, s = i ? 1 : -1;
        const p = [hc[0] + s * (R + 6 + 18 * ph), hc[1] - R * 0.6 - 12 * Math.sin(Math.PI * ph) + 22 * ph];
        ctx.fillStyle = '#7FD3F7'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p[0], p[1] - 7); ctx.quadraticCurveTo(p[0] + 5, p[1] + 1, p[0], p[1] + 4); ctx.quadraticCurveTo(p[0] - 5, p[1] + 1, p[0], p[1] - 7); ctx.fill(); ctx.stroke();
      }
    }
    // A tremble when fear jumps.
    if (hud.fearUp && sm.u > 0.45) {
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        const a = -0.6 + i * 0.6, x0 = hc[0] + s * (R + 8) , y0 = hc[1] + a * R;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + s * 8, y0 + a * 4 + Math.sin(time * 40 + i) * 1.5); ctx.stroke();
      }
    }
    // Sound effects.
    if (ev === 'slip' && sm.u > 0.48 && sm.u < 0.95) {
      const c = body.P(body.b[sm.seg.style.limb]);
      const foot = sm.seg.style.limb[1] === 'F';
      sfx(ctx, c[0] + (c[0] > W / 2 ? -50 : 50), c[1] - 24, foot ? 'SKRRT!' : 'WHOA!', foot ? 0.15 : -0.15, '#FF6B5A', 24, Math.min(1, (0.95 - sm.u) * 5));
    }
    if (ev === 'sketchy' && sm.u > 0.6) {
      const c = body.P(body.b[sm.seg.style.limb]);
      sfx(ctx, c[0] - 54, c[1] - 10, 'NNGH!', -0.12, '#FFD93D', 22);
    }
    if (ev === 'deadpoint' && sm.seg.kind === 'step' && sm.u > 0.42) {
      const tg = C.target(sm);
      const c = S(proj([tg.hold.x, tg.hold.y, tg.hold.z]));
      sfx(ctx, c[0] + 62, c[1] - 30, 'SLAP!', 0.12, '#FFD93D', 30 + 6 * Math.sin(Math.PI * Math.min(1, (sm.u - 0.42) * 4)));
    }
    if (sm.seg.kind === 'fall') sfx(ctx, W * 0.76, H * 0.12, 'WAAAH!', 0.1, '#7FD3F7', 26);
    if (sm.seg.kind === 'land' && sm.u < 0.55) sfx(ctx, W * 0.5, H * 0.8, 'THUD!', -0.06, '#FF8A3D', 34, Math.min(1, (0.55 - sm.u) * 6));
    if (sm.seg.kind === 'cheer') sfx(ctx, hc[0], hc[1] - R * 3.2, 'YEAAH!', -0.08, '#FFD93D', 34);
  }

  return { name: 'Cartoon', fonts: ["26px Bangers"], init, draw };
})();
