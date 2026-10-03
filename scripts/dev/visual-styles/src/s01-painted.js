// 1 · Painted realism: Fontainebleau in the morning. Brushed sandstone with lichen and streaks, a soft forest out of
// focus, pads on white sand, a climber in muted colours. The mechanics show only as the eye would see them: chalk on
// the holds touched, forearms flushing with pump, the edges darkening as fear rises, dust when a foot skates.
STYLES.painted = (function () {
  const PPM = 150, Y0 = -0.9, Y1 = 4.75;
  const SKIN = '#C98F6B', SKIN_D = '#9E6A4D', SKIN_L = '#E2B18F', SHIRT = '#A9503A', SHIRT_D = '#7C3626', SHIRT_L = '#C9735A';
  const PANTS = '#3D4A5E', PANTS_D = '#283243', PANTS_L = '#5A6A82', HAIR = '#3A281D', SHOE = '#222225', RAND = '#B23A2E';

  function init(env) {
    const { C, K, W, dpr, scene } = env;
    const Hh = (Y1 - Y0) * PPM;
    const L = K.layer(W, Hh, dpr);
    const S = K.cam(W, Hh, PPM, 0, (Y0 + Y1) / 2);
    const x = L.x;
    const proj = C.views.front;
    const r = C.rng(5);
    // Sky into a warm haze.
    const sky = x.createLinearGradient(0, 0, 0, S([0, 0.6])[1]);
    sky.addColorStop(0, '#8FA9B8'); sky.addColorStop(0.55, '#C9D2C8'); sky.addColorStop(1, '#E9E2CC');
    x.fillStyle = sky; x.fillRect(0, 0, W, Hh);
    // Forest, three depths, out of focus.
    const trees = (n, base, h0, h1, col, trunk, blur, seed) => {
      const rr = C.rng(seed);
      // Drawn small and scaled up: the softness of a background out of focus, without a blur filter.
      const T = K.layer(W, Hh, dpr / (1 + blur));
      const x0 = x;
      { const x = T.x;
      for (let i = 0; i < n; i++) {
        const cx = -1.7 + (i + rr()) * (3.4 / n), h = h0 + rr() * (h1 - h0);
        const b = S([cx, base]), t = S([cx, base + h]);
        x.strokeStyle = trunk; x.lineWidth = 3 + rr() * 5; x.beginPath(); x.moveTo(b[0], b[1]); x.lineTo(t[0] + (rr() - 0.5) * 10, t[1] + 30); x.stroke();
        for (let j = 0; j < 14; j++) {
          const yy = t[1] + 10 + rr() * (b[1] - t[1]) * 0.55, xx = t[0] + (rr() - 0.5) * (40 + (yy - t[1]) * 0.5);
          x.fillStyle = col; x.globalAlpha = 0.55 + rr() * 0.35;
          x.beginPath(); x.ellipse(xx, yy, 14 + rr() * 26, 9 + rr() * 16, rr() * Math.PI, 0, Math.PI * 2); x.fill();
        }
        x.globalAlpha = 1;
      }
      }
      x0.drawImage(T.c, 0, 0, W, Hh);
    };
    trees(9, 0.8, 3.2, 4.6, '#93A79A', '#A7A496', 5, 21);
    trees(8, 0.6, 2.4, 3.6, '#6B8569', '#6E5F50', 3, 22);
    trees(5, 0.45, 2.0, 3.2, '#4C6449', '#4E3F33', 2, 23);
    // A few shafts of light through the trees.
    x.save(); x.globalCompositeOperation = 'screen';
    for (let i = 0; i < 4; i++) {
      const g = x.createLinearGradient(0, 0, W * 0.6, Hh * 0.6);
      g.addColorStop(0, 'rgba(255,240,205,0.16)'); g.addColorStop(1, 'rgba(255,240,205,0)');
      x.fillStyle = g; x.beginPath();
      const x0 = 30 + i * 85 + r() * 30;
      x.moveTo(x0, 0); x.lineTo(x0 + 26, 0); x.lineTo(x0 + 300, Hh * 0.75); x.lineTo(x0 + 230, Hh * 0.75); x.closePath(); x.fill();
    }
    x.restore();
    // White Font sand with leaf litter.
    const gTop = S([0, 0.62])[1];
    const sand = x.createLinearGradient(0, gTop, 0, Hh);
    sand.addColorStop(0, '#BDB49A'); sand.addColorStop(0.25, '#D8CDAE'); sand.addColorStop(1, '#E4D9BC');
    x.fillStyle = sand; x.fillRect(0, gTop, W, Hh - gTop);
    for (let i = 0; i < 260; i++) {
      const px = r() * W, py = gTop + 6 + r() * (Hh - gTop);
      x.fillStyle = ['#9C7A4E', '#7E6545', '#B48A55', '#6F7A55', '#C9BFA3'][Math.floor(r() * 5)];
      x.globalAlpha = 0.35 + r() * 0.4;
      x.beginPath(); x.ellipse(px, py, 1.5 + r() * 3, 0.8 + r() * 1.6, r() * Math.PI, 0, Math.PI * 2); x.fill();
    }
    x.globalAlpha = 1;
    // The block's shadow on the sand.
    const base = S(proj([0, 0, 0.3]));
    const sh = x.createRadialGradient(base[0] + 20, base[1], 10, base[0] + 20, base[1], 220);
    sh.addColorStop(0, 'rgba(60,50,35,0.45)'); sh.addColorStop(1, 'rgba(60,50,35,0)');
    x.fillStyle = sh; x.beginPath(); x.ellipse(base[0] + 20, base[1], 230, 34, 0, 0, Math.PI * 2); x.fill();
    // The block: a lit-to-shade base, then brush daubs.
    const out = K.outlinePx(S, proj);
    const xs = out.map((p) => p[0]), ys = out.map((p) => p[1]);
    const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
    x.save();
    K.smooth(x, out);
    const lit = x.createLinearGradient(bx0, 0, bx1, 0);
    lit.addColorStop(0, '#C3B8A1'); lit.addColorStop(0.55, '#A69B86'); lit.addColorStop(1, '#6E6556');
    x.fillStyle = lit; x.fill(); x.clip();
    const pal = ['#B5AA94', '#9C927F', '#C9BC9F', '#857C6D', '#B79F78', '#A28C6A', '#77806A', '#8F9478'];
    const n2 = C.noise2(9);
    for (let i = 0; i < 1500; i++) {
      const px = bx0 + r() * (bx1 - bx0), py = by0 + r() * (by1 - by0);
      const v = n2(px / 40, py / 40);
      x.fillStyle = pal[Math.floor((v * 0.6 + r() * 0.4) * pal.length) % pal.length];
      x.globalAlpha = 0.1 + r() * 0.22;
      x.beginPath(); x.ellipse(px, py, 2 + r() * 9, 4 + r() * 12, (r() - 0.5) * 0.6, 0, Math.PI * 2); x.fill();
    }
    // Dark streaks down from the top where water runs.
    for (let i = 0; i < 5; i++) {
      const px = bx0 + 40 + r() * (bx1 - bx0 - 80), len = 90 + r() * 200;
      const g = x.createLinearGradient(0, by0, 0, by0 + len);
      g.addColorStop(0, 'rgba(45,42,38,0.2)'); g.addColorStop(1, 'rgba(45,42,38,0)');
      x.fillStyle = g; x.globalAlpha = 1;
      x.beginPath(); x.ellipse(px, by0 + len / 2, 4 + r() * 14, len / 2, (r() - 0.5) * 0.08, 0, Math.PI * 2); x.fill();
    }
    // Soft blotches of colour and faint bedding lines.
    for (let i = 0; i < 40; i++) {
      const px = bx0 + r() * (bx1 - bx0), py = by0 + r() * (by1 - by0);
      const g = x.createRadialGradient(px, py, 1, px, py, 30 + r() * 50);
      const col = r() < 0.5 ? '190,160,115' : r() < 0.5 ? '120,112,100' : '214,204,182';
      g.addColorStop(0, `rgba(${col},0.22)`); g.addColorStop(1, `rgba(${col},0)`);
      x.fillStyle = g; x.fillRect(px - 80, py - 80, 160, 160);
    }
    x.strokeStyle = 'rgba(70,62,52,0.16)'; x.lineWidth = 1.2;
    for (let i = 0; i < 7; i++) {
      const py = by0 + 40 + r() * (by1 - by0 - 60);
      x.beginPath(); x.moveTo(bx0, py);
      for (let q = 0; q <= 8; q++) x.lineTo(bx0 + ((bx1 - bx0) * q) / 8, py + (r() - 0.5) * 8);
      x.stroke();
    }
    // Rounded scoops, the shapes Font sandstone weathers into.
    for (let i = 0; i < 7; i++) {
      const px = bx0 + 40 + r() * (bx1 - bx0 - 80), py = by0 + 50 + r() * (by1 - by0 - 120), rw = 22 + r() * 30, rh = 10 + r() * 12;
      const g = x.createRadialGradient(px, py - rh * 0.4, 1, px, py, rw);
      g.addColorStop(0, 'rgba(60,52,44,0.28)'); g.addColorStop(1, 'rgba(60,52,44,0)');
      x.fillStyle = g; x.beginPath(); x.ellipse(px, py, rw, rh, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = 'rgba(236,226,204,0.35)'; x.lineWidth = 1.5; x.beginPath(); x.ellipse(px, py + 1, rw * 0.9, rh, 0, 0.1 * Math.PI, 0.9 * Math.PI); x.stroke();
    }
    // Lichen.
    for (let i = 0; i < 70; i++) {
      const px = bx0 + r() * (bx1 - bx0), py = by0 + r() * (by1 - by0) * 0.9;
      x.fillStyle = r() < 0.6 ? '#A5AD84' : '#D6CFA0'; x.globalAlpha = 0.25 + r() * 0.35;
      x.beginPath(); x.arc(px, py, 1 + r() * 3.5, 0, Math.PI * 2); x.fill();
    }
    x.globalAlpha = 1;
    // Shade: the right flank, and the overhanging upper face a touch darker than the slab below.
    const shade = x.createLinearGradient(bx0, 0, bx1, 0);
    shade.addColorStop(0.6, 'rgba(40,34,28,0)'); shade.addColorStop(1, 'rgba(40,34,28,0.5)');
    x.fillStyle = shade; x.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    const over = scene.wall.segments.find((s) => s.angle > 90);
    if (over) {
      const a = S(proj([0, over.y1, 0])), b = S(proj([0, over.y0, 0]));
      const g = x.createLinearGradient(0, a[1], 0, b[1] + 30);
      g.addColorStop(0, 'rgba(40,34,28,0.0)'); g.addColorStop(0.75, 'rgba(40,34,28,0.16)'); g.addColorStop(1, 'rgba(40,34,28,0)');
      x.fillStyle = g; x.fillRect(bx0, a[1], bx1 - bx0, b[1] - a[1] + 30);
    }
    // Rounded top catches the light.
    const hl = x.createLinearGradient(0, by0, 0, by0 + 60);
    hl.addColorStop(0, 'rgba(255,248,230,0.35)'); hl.addColorStop(1, 'rgba(255,248,230,0)');
    x.fillStyle = hl; x.fillRect(bx0, by0, bx1 - bx0, 60);
    x.restore();
    // The top, with moss.
    const cap = K.capPx(S, proj, 1.4);
    x.save(); K.smooth(x, cap);
    const cg = x.createLinearGradient(0, Math.min(...cap.map((p) => p[1])), 0, Math.max(...cap.map((p) => p[1])));
    cg.addColorStop(0, '#B9B092'); cg.addColorStop(1, '#D3C8AC');
    x.fillStyle = cg; x.fill(); x.clip();
    for (let i = 0; i < 160; i++) {
      const p = cap[Math.floor(r() * cap.length)];
      x.fillStyle = r() < 0.5 ? '#7C8A55' : '#98A26A'; x.globalAlpha = 0.2 + r() * 0.3;
      x.beginPath(); x.ellipse(p[0] + (r() - 0.5) * 120, p[1] + (r() - 0.5) * 30, 3 + r() * 8, 2 + r() * 4, 0, 0, Math.PI * 2); x.fill();
    }
    x.globalAlpha = 1;
    x.restore();
    // Holds as features of the rock: a lit lip over a shadow.
    for (const h of scene.holds) {
      const c = S(proj([h.x, h.y, h.z]));
      const [w0, h0] = K.dims(h);
      const w = w0 * PPM, hh = h0 * PPM;
      if (h.type === 'sloper') {
        const g = x.createRadialGradient(c[0] - w * 0.15, c[1] - hh * 0.3, 1, c[0], c[1], w * 0.6);
        g.addColorStop(0, 'rgba(235,226,205,0.85)'); g.addColorStop(0.6, 'rgba(180,170,150,0.4)'); g.addColorStop(1, 'rgba(70,62,52,0)');
        x.fillStyle = g; x.beginPath(); x.ellipse(c[0], c[1], w * 0.62, hh * 0.75, 0, 0, Math.PI * 2); x.fill();
        x.strokeStyle = 'rgba(55,48,40,0.55)'; x.lineWidth = 2; x.beginPath(); x.ellipse(c[0], c[1] + hh * 0.2, w * 0.5, hh * 0.45, 0, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke();
      } else {
        x.fillStyle = 'rgba(40,35,30,0.75)';
        x.beginPath(); x.ellipse(c[0], c[1] + hh * 0.35, w * 0.52, Math.max(1.5, hh * 0.35), 0, 0, Math.PI); x.fill();
        x.fillStyle = 'rgba(232,222,200,0.9)';
        x.beginPath(); x.ellipse(c[0], c[1] - hh * 0.05, w * 0.5, Math.max(1.2, hh * 0.28), 0, Math.PI, 0); x.fill();
        x.strokeStyle = 'rgba(40,35,30,0.6)'; x.lineWidth = 1; x.beginPath(); x.moveTo(c[0] - w * 0.5, c[1] + hh * 0.15); x.lineTo(c[0] + w * 0.5, c[1] + hh * 0.15); x.stroke();
      }
    }
    // Two pads, one teal, one rust.
    const cols = [['#2F5D62', '#244A4E', '#3F7378'], ['#A9622F', '#844B22', '#C27843']];
    K.pads.forEach((pad, i) => {
      const f = K.boxFaces(pad, proj, S);
      const [c0, c1, c2] = cols[i];
      K.path(x, f.front); x.fillStyle = c1; x.fill();
      K.path(x, f.top);
      const g = x.createLinearGradient(f.top[0][0], f.top[0][1], f.top[2][0], f.top[2][1]);
      g.addColorStop(0, c2); g.addColorStop(1, c0);
      x.fillStyle = g; x.fill();
      x.strokeStyle = 'rgba(20,20,20,0.55)'; x.lineWidth = 2.5;
      for (const t of [0.3, 0.7]) {
        const a = [C.lerp(f.top[0][0], f.top[1][0], t), C.lerp(f.top[0][1], f.top[1][1], t)], b = [C.lerp(f.top[3][0], f.top[2][0], t), C.lerp(f.top[3][1], f.top[2][1], t)];
        K.line(x, a, b); x.stroke();
      }
      x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 1; x.setLineDash([3, 3]); K.path(x, f.top); x.stroke(); x.setLineDash([]);
    });
    return { L };
  }

  /** A painted limb: a shadow stroke, the base, then a highlight, tapering from `w0` to `w1`. */
  function paintBone(ctx, a, b, w0, w1, base, dark, light) {
    const seg = (col, wa, wb, dx, dy, alpha) => {
      ctx.globalAlpha = alpha; ctx.fillStyle = col;
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), nx = -Math.sin(ang), ny = Math.cos(ang);
      ctx.beginPath();
      ctx.moveTo(a[0] + nx * wa / 2 + dx, a[1] + ny * wa / 2 + dy); ctx.lineTo(b[0] + nx * wb / 2 + dx, b[1] + ny * wb / 2 + dy);
      ctx.arc(b[0] + dx, b[1] + dy, wb / 2, ang + Math.PI / 2, ang - Math.PI / 2, true);
      ctx.lineTo(a[0] - nx * wa / 2 + dx, a[1] - ny * wa / 2 + dy);
      ctx.arc(a[0] + dx, a[1] + dy, wa / 2, ang - Math.PI / 2, ang + Math.PI / 2, true);
      ctx.closePath(); ctx.fill();
    };
    seg(dark, w0 + 1, w1 + 1, 1.2, 1.2, 1);
    seg(base, w0, w1, 0, 0, 1);
    seg(light, w0 * 0.35, w1 * 0.35, -w0 * 0.18, -w0 * 0.18, 0.55);
    ctx.globalAlpha = 1;
  }

  /** A back seen from behind: an arch over the shoulders, the lats tapering to the waist. */
  function torso(ctx, q, shC, lift) {
    const [shL, shR, hipR, hipL] = q;
    const midR = [C2.lerp(shR[0], hipR[0], 0.55) - (shR[0] - hipR[0]) * 0.15, C2.lerp(shR[1], hipR[1], 0.55)];
    const midL = [C2.lerp(shL[0], hipL[0], 0.55) + (hipL[0] - shL[0]) * -0.15, C2.lerp(shL[1], hipL[1], 0.55)];
    ctx.beginPath();
    ctx.moveTo(shL[0], shL[1] + lift * 0.4);
    ctx.quadraticCurveTo(shL[0], shL[1] - lift * 0.6, C2.lerp(shL[0], shC[0], 0.5), shC[1] - lift * 0.5);
    ctx.quadraticCurveTo(shC[0], shC[1] - lift * 0.8, C2.lerp(shR[0], shC[0], 0.5), shC[1] - lift * 0.5);
    ctx.quadraticCurveTo(shR[0], shR[1] - lift * 0.6, shR[0], shR[1] + lift * 0.4);
    ctx.quadraticCurveTo(midR[0], midR[1], hipR[0], hipR[1]);
    ctx.lineTo(hipL[0], hipL[1]);
    ctx.quadraticCurveTo(midL[0], midL[1], shL[0], shL[1] + lift * 0.4);
    ctx.closePath();
  }
  const C2 = { lerp: (a, b, t) => a + (b - a) * t };

  function climber(ctx, env, S, sm, hud) {
    const { C, K } = env;
    const proj = C.views.front;
    const body = K.parts(sm.pose, proj, S, K.depths.front);
    const k = body.k, px = PPM * k;
    const facing = sm.seg.kind === 'land' || sm.seg.kind === 'cheer' || (sm.seg.kind === 'fall' && sm.u > 0.6);
    const pump = Math.min(1, hud.pump / 45);
    const limbs = {};
    for (const p of body.list) if (p.kind !== 'torso' && p.kind !== 'head') (limbs[p.limb] = limbs[p.limb] || []).push(p);
    const items = Object.entries(limbs).map(([limb, ps]) => ({ limb, ps, depth: ps.reduce((s, p) => s + p.depth, 0) / ps.length }));
    for (const p of body.list) if (p.kind === 'torso' || p.kind === 'head') items.push({ part: p, depth: p.depth });
    items.sort((a, b) => a.depth - b.depth);
    for (const it of items) {
      if (it.part && it.part.kind === 'torso') {
        const q = it.part.q;
        const g = ctx.createLinearGradient(q[0][0], 0, q[1][0], 0);
        g.addColorStop(0, SHIRT_L); g.addColorStop(0.5, SHIRT); g.addColorStop(1, SHIRT_D);
        ctx.fillStyle = g;
        torso(ctx, q, it.part.shC, 0.06 * px); ctx.fill();
        // Shoulder blades.
        ctx.strokeStyle = 'rgba(70,25,15,0.25)'; ctx.lineWidth = 1.4;
        for (const s of [-1, 1]) { const a = [C.lerp(it.part.shC[0], q[s < 0 ? 0 : 1][0], 0.5), it.part.shC[1] + 0.08 * px]; ctx.beginPath(); ctx.arc(a[0], a[1], 0.07 * px, s < 0 ? 0.2 * Math.PI : 0.4 * Math.PI, s < 0 ? 0.6 * Math.PI : 0.8 * Math.PI); ctx.stroke(); }
        // A fold down the back and the waistband.
        ctx.strokeStyle = 'rgba(70,25,15,0.35)'; ctx.lineWidth = 1.2;
        const sc = it.part.shC, hc = it.part.hipC;
        ctx.beginPath(); ctx.moveTo(sc[0] + 3, sc[1] + 6); ctx.quadraticCurveTo(sc[0] - 4, (sc[1] + hc[1]) / 2, hc[0] + 2, hc[1] - 4); ctx.stroke();
        ctx.fillStyle = PANTS_D; ctx.fillRect(q[3][0] - 2, q[3][1] - 4, q[2][0] - q[3][0] + 4, 6);
        // Chalk bag with a dusting of chalk.
        ctx.fillStyle = '#D7B65E'; ctx.beginPath(); ctx.ellipse(hc[0], hc[1] - 2, 0.04 * px, 0.05 * px, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(hc[0], hc[1] - 0.04 * px, 0.03 * px, 0.012 * px, 0, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      if (it.part && it.part.kind === 'head') {
        const c = it.part.c, n = it.part.neck, r = 0.1 * px;
        paintBone(ctx, n, [c[0], c[1] + r * 0.4], 0.055 * px, 0.055 * px, SKIN, SKIN_D, SKIN_L);
        const g = ctx.createRadialGradient(c[0] - r * 0.3, c[1] - r * 0.3, 1, c[0], c[1], r * 1.1);
        if (facing) {
          g.addColorStop(0, SKIN_L); g.addColorStop(1, SKIN_D);
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(c[0], c[1], r * 0.86, r, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = HAIR; ctx.beginPath(); ctx.ellipse(c[0], c[1] - r * 0.45, r * 0.95, r * 0.62, 0, Math.PI, 0); ctx.fill();
          ctx.fillStyle = '#2A1E17';
          ctx.beginPath(); ctx.arc(c[0] - r * 0.32, c[1] + r * 0.05, 1.4, 0, Math.PI * 2); ctx.arc(c[0] + r * 0.32, c[1] + r * 0.05, 1.4, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#7A4535'; ctx.lineWidth = 1.2; ctx.beginPath();
          if (sm.seg.kind === 'cheer') ctx.arc(c[0], c[1] + r * 0.35, r * 0.28, 0.1 * Math.PI, 0.9 * Math.PI); else { ctx.moveTo(c[0] - r * 0.2, c[1] + r * 0.5); ctx.lineTo(c[0] + r * 0.2, c[1] + r * 0.47); }
          ctx.stroke();
        } else {
          g.addColorStop(0, '#5A4232'); g.addColorStop(1, HAIR);
          ctx.fillStyle = SKIN_D; ctx.beginPath(); ctx.ellipse(c[0] - r * 0.92, c[1] + r * 0.1, r * 0.18, r * 0.26, 0, 0, Math.PI * 2); ctx.ellipse(c[0] + r * 0.92, c[1] + r * 0.1, r * 0.18, r * 0.26, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(c[0], c[1], r * 0.9, r, 0, 0, Math.PI * 2); ctx.fill();
        }
        continue;
      }
      const [up, lo] = it.ps[0].kind === 'upper' || it.ps[0].kind === 'thigh' ? it.ps : [it.ps[1], it.ps[0]];
      if (it.limb[1] === 'H') {
        // Short sleeve, bare arm.
        paintBone(ctx, up.a, up.b, 0.09 * px, 0.075 * px, SKIN, SKIN_D, SKIN_L);
        const sl = [C.lerp(up.a[0], up.b[0], 0.45), C.lerp(up.a[1], up.b[1], 0.45)];
        paintBone(ctx, up.a, sl, 0.11 * px, 0.1 * px, SHIRT, SHIRT_D, SHIRT_L);
        paintBone(ctx, lo.a, lo.b, 0.078 * px, 0.055 * px, SKIN, SKIN_D, SKIN_L);
        if (pump > 0.02) {
          // The forearm flushes with pump.
          ctx.save(); ctx.globalCompositeOperation = 'multiply';
          paintBone(ctx, lo.a, [C.lerp(lo.a[0], lo.b[0], 0.85), C.lerp(lo.a[1], lo.b[1], 0.85)], 0.07 * px, 0.05 * px, `rgba(200,70,60,${0.25 + 0.6 * pump})`, 'rgba(0,0,0,0)', 'rgba(0,0,0,0)');
          ctx.restore();
        }
        const e = lo.b;
        ctx.fillStyle = it.limb && body.b.on[it.limb] ? '#EDE6DA' : SKIN;
        ctx.beginPath(); ctx.ellipse(e[0], e[1], 0.04 * px, 0.035 * px, Math.atan2(lo.b[1] - lo.a[1], lo.b[0] - lo.a[0]), 0, Math.PI * 2); ctx.fill();
      } else {
        paintBone(ctx, up.a, up.b, 0.13 * px, 0.1 * px, PANTS, PANTS_D, PANTS_L);
        paintBone(ctx, lo.a, lo.b, 0.1 * px, 0.075 * px, PANTS, PANTS_D, PANTS_L);
        const e = lo.b;
        ctx.fillStyle = SHOE; ctx.beginPath(); ctx.ellipse(e[0], e[1] + 1, 0.05 * px, 0.035 * px, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = RAND; ctx.beginPath(); ctx.ellipse(e[0], e[1] + 0.022 * px, 0.045 * px, 0.012 * px, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    return body;
  }

  /** Particles of chalk or sand bursting from `c`, `v` of the way through their life. */
  function puff(ctx, c, v, seed, col, n = 18, spread = 34) {
    const r = (i) => { const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x); };
    for (let i = 0; i < n; i++) {
      const a = r(i) * Math.PI * 2, d = spread * v * (0.4 + r(i + 50) * 0.8);
      ctx.fillStyle = col; ctx.globalAlpha = Math.max(0, 0.28 * (1 - v)) * (0.5 + r(i + 9) * 0.5);
      ctx.beginPath(); ctx.arc(c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d * 0.45 - 6 * v, 2 + r(i + 3) * 4 + 10 * v, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function draw(ctx, env) {
    const { C, K, W, H, dpr, cache, sm, time } = env;
    const proj = C.views.front;
    const half = H / PPM / 2;
    const cy = C.clamp(C.followY(time, proj, -9, 9) + 0.25, Y0 + half, Y1 - half);
    const off = (Y1 - cy) * PPM - H / 2;
    // A shake when the body jolts.
    const jolt = sm.seg.kind === 'land' ? 4 * Math.max(0, 1 - sm.u * 4) * Math.sin(sm.u * 60) : 0;
    ctx.save(); ctx.translate(0, jolt);
    ctx.drawImage(cache.L.c, 0, Math.round(off * dpr), W * dpr, H * dpr, 0, 0, W, H);
    const S = K.cam(W, H, PPM, 0, cy);
    const hud = C.hudOf(sm);
    // Chalk on every hold touched so far: a powdery smear and finger marks.
    for (const id of C.touched(sm)) {
      const h = C.hold[id];
      const c = S(proj([h.x, h.y, h.z]));
      const [w0, h0] = K.dims(h);
      const w = w0 * PPM, hh = h0 * PPM;
      const g = ctx.createRadialGradient(c[0], c[1] - hh * 0.2, 1, c[0], c[1] - hh * 0.2, w * 0.55);
      g.addColorStop(0, 'rgba(250,250,247,0.55)'); g.addColorStop(1, 'rgba(250,250,247,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(c[0], c[1] - hh * 0.2, w * 0.55, Math.max(3, hh * 0.6), 0, 0, Math.PI * 2); ctx.fill();

    }
    // Motion: the moving hand leaves a trail on a deadpoint, the whole body on a fall.
    const ev = C.event(sm);
    if (ev === 'deadpoint' || ev === 'fall') {
      for (let i = 4; i >= 1; i--) {
        const s2 = C.sample(time - i * 0.035);
        if (s2.seg !== sm.seg) continue;
        ctx.globalAlpha = 0.12;
        const b = K.parts(s2.pose, proj, S, K.depths.front);
        if (ev === 'deadpoint') {
          const l = sm.seg.style.limb || 'LH';
          const e = b.P(b.b[l]);
          ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(e[0], e[1], 0.05 * PPM, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = SHIRT; K.path(ctx, b.list.find((p) => p.kind === 'torso').q); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
    const body = climber(ctx, env, S, sm, hud);
    // Dust where a limb skates off, and on the landing.
    if (ev === 'slip' && sm.u > 0.5) {
      const c = body.P(body.b[sm.seg.style.limb]);
      puff(ctx, c, C.clamp((sm.u - 0.5) / 0.5, 0, 1), sm.seg.i * 7 + sm.ai, 'rgba(250,248,240,1)', 16, 26);
    }
    if (ev === 'sketchy' && sm.u > 0.7) {
      const c = body.P(body.b[sm.seg.style.limb]);
      puff(ctx, c, C.clamp((sm.u - 0.7) / 0.3, 0, 1), 3, 'rgba(250,248,240,1)', 8, 16);
    }
    if (ev === 'land' && sm.u < 0.6) {
      const c = body.P(body.b.hip);
      puff(ctx, [c[0], c[1] + 18], sm.u / 0.6, 11, 'rgba(214,198,160,1)', 26, 110);
    }
    // Fear darkens the edges: more as it climbs past the middle of the climber's band.
    const mid = (hud.bandLo + hud.bandHi) / 2;
    const f = C.clamp((hud.fear - mid * 0.6) / 50, 0, 0.6);
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.75);
    vg.addColorStop(0, 'rgba(20,16,12,0)'); vg.addColorStop(1, `rgba(20,16,12,${0.25 + f})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    // Warm light at the top-out.
    if (sm.seg.kind === 'cheer' || sm.seg.kind === 'mantle') {
      const a = sm.seg.kind === 'cheer' ? Math.min(1, sm.u * 3) : sm.u;
      const g = ctx.createRadialGradient(W * 0.15, 0, 10, W * 0.15, 0, H * 0.9);
      g.addColorStop(0, `rgba(255,226,170,${0.45 * a})`); g.addColorStop(1, 'rgba(255,226,170,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  return { name: 'Painted realism', fonts: [], init, draw };
})();
