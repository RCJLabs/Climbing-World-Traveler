// 2 · Low-poly 3D: the same attempt as a real-time 3D scene, faceted and flat-shaded, seen from a slowly drifting
// three-quarter camera. The body, the block and the holds are geometry; the meters float over the climber.
STYLES.lowpoly = (function () {
  const PPM = 128;
  const LIGHT = (() => { const v = [-0.45, 0.8, 0.55]; const l = Math.hypot(...v); return v.map((c) => c / l); })();
  const SKY0 = '#9FD0DF', SKY1 = '#F4E9D0';
  const COL = { rock: [204, 170, 128], hold: [176, 132, 92], chalk: [242, 238, 230], ground: [150, 182, 116], sand: [226, 211, 166], tree: [74, 138, 104], trunk: [138, 90, 59], pad1: [52, 98, 140], pad2: [216, 108, 64], shirt: [232, 102, 74], pants: [47, 75, 124], skin: [231, 176, 138], shoe: [52, 52, 60], hair: [70, 48, 36] };

  const shade = (c, n, k = 1) => {
    const d = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    const f = (0.5 + 0.55 * d) * k;
    return `rgb(${Math.min(255, Math.round(c[0] * f))},${Math.min(255, Math.round(c[1] * f))},${Math.min(255, Math.round(c[2] * f))})`;
  };
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];

  function init(env) {
    const { C, K } = env;
    const r = C.rng(31);
    const mesh = K.boulderMesh(17, { depth: 1.8, nf: 7, nb: 9, taper: 0.3 });
    const centre = [0, 1.1, -0.8];
    const tris = mesh.tris.map((t) => ({ p: t, n: K.triNormal(t, centre), tint: 0.94 + r() * 0.12, col: COL.rock }));
    // Holds: small faceted bumps on the face.
    const holds = env.scene.holds.map((h) => {
      const [w, hh] = K.dims(h);
      const c = [h.x, h.y, h.z + 0.005];
      const apex = [h.x, h.y + hh * 0.1, h.z + Math.max(0.02, hh * 0.6)];
      const pts = [];
      const n = h.type === 'sloper' ? 6 : 4;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + 0.3; pts.push([c[0] + Math.cos(a) * w * 0.55, c[1] + Math.sin(a) * hh * 0.7, c[2]]); }
      return { h, faces: pts.map((p, i) => [p, pts[(i + 1) % n], apex]) };
    });
    // Ground: a jittered grid, sand near the block, grass further out.
    const G = [];
    const N = 9;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) G.push([-3.6 + (7.2 * i) / N + (i && i < N ? (r() - 0.5) * 0.4 : 0), (r() - 0.5) * 0.05, -4.2 + (7.0 * j) / N + (j && j < N ? (r() - 0.5) * 0.4 : 0)]);
    const ground = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const a = G[i * (N + 1) + j], b = G[(i + 1) * (N + 1) + j], c = G[(i + 1) * (N + 1) + j + 1], d = G[i * (N + 1) + j + 1];
      for (const t of [[a, b, c], [a, c, d]]) {
        const m = [(t[0][0] + t[1][0] + t[2][0]) / 3, 0, (t[0][2] + t[1][2] + t[2][2]) / 3];
        const near = Math.hypot(m[0] * 0.8, m[2] + 0.2) < 2.1;
        ground.push({ p: t, n: [0, 1, 0], tint: 0.92 + r() * 0.16, col: near ? COL.sand : COL.ground });
      }
    }
    // Pines behind and beside the block.
    const trees = [];
    for (const [x, z, h] of [[-2.6, -2.8, 3.2], [-1.2, -3.6, 4.0], [0.4, -3.9, 3.6], [1.9, -3.2, 4.2], [3.0, -2.2, 3.0], [-3.2, -1.2, 2.6], [-0.4, -4.3, 2.8]]) {
      const parts = [];
      const trunk = { a: [x, 0, z], b: [x, h * 0.35, z], w: 0.14 };
      for (let tier = 0; tier < 3; tier++) {
        const y0 = h * (0.25 + tier * 0.22), y1 = y0 + h * 0.42, rad = 0.85 - tier * 0.2;
        const ring = [];
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + tier; ring.push([x + Math.cos(a) * rad, y0, z + Math.sin(a) * rad]); }
        const apex = [x, y1, z];
        ring.forEach((p, i) => parts.push({ p: [p, ring[(i + 1) % 6], apex], col: COL.tree }));
      }
      trees.push({ trunk, parts, z });
    }
    return { mesh, tris, holds, ground, trees, centre };
  }

  /** A box-section prism along a bone: its six faces in world space. */
  function prism(a, b, w, d, col, up0 = [0, 0, 1]) {
    const dir = C3.norm(C3.sub(b, a));
    let s = cross(dir, up0);
    if (Math.hypot(...s) < 1e-3) s = cross(dir, [1, 0, 0]);
    s = C3.norm(s);
    const u = cross(s, dir);
    const corners = (p) => [
      C3.add(p, C3.add(C3.mul(s, w / 2), C3.mul(u, d / 2))), C3.add(p, C3.add(C3.mul(s, -w / 2), C3.mul(u, d / 2))),
      C3.add(p, C3.add(C3.mul(s, -w / 2), C3.mul(u, -d / 2))), C3.add(p, C3.add(C3.mul(s, w / 2), C3.mul(u, -d / 2))),
    ];
    const A = corners(a), B = corners(b);
    const faces = [];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; faces.push({ p: [A[i], A[j], B[j], B[i]], col }); }
    faces.push({ p: [A[3], A[2], A[1], A[0]], col }, { p: [B[0], B[1], B[2], B[3]], col });
    return faces;
  }
  const C3 = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k], norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  };
  function faceNormal(p) {
    const n = cross(C3.sub(p[1], p[0]), C3.sub(p[2], p[0]));
    return C3.norm(n);
  }
  /** A faceted head: an octahedron stretched a little, eight shaded faces. */
  function headFaces(c, r, col, hair) {
    const X = [r, 0, 0], Y = [0, r * 1.15, 0], Z = [0, 0, r];
    const v = { px: C3.add(c, X), nx: C3.sub(c, X), py: C3.add(c, Y), ny: C3.sub(c, Y), pz: C3.add(c, Z), nz: C3.sub(c, Z) };
    const faces = [];
    for (const [a, b] of [['px', 'pz'], ['pz', 'nx'], ['nx', 'nz'], ['nz', 'px']]) {
      faces.push({ p: [v[a], v[b], v.py], col: hair });
      faces.push({ p: [v[b], v[a], v.ny], col: b === 'pz' || a === 'pz' ? hair : col });
    }
    return faces;
  }

  function draw(ctx, env) {
    const { C, K, W, H, cache, sm, time } = env;
    const yaw = 26 + 7 * Math.sin((2 * Math.PI * time) / 26);
    const proj = C.views.orbit(yaw, 13);
    const a = (yaw * Math.PI) / 180, b = (13 * Math.PI) / 180;
    const camV = [-Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b)];
    const half = H / PPM / 2;
    const cy = C.clamp(C.followY(time, proj, -9, 9) + 0.2, -0.5 + half, 4.9 - half);
    const S = K.cam(W, H, PPM, 0.1, cy);
    const P = (p) => S(proj(p));
    const depth = (p) => proj(p)[2];
    // Sky.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, SKY0); g.addColorStop(1, SKY1);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const fillPoly = (pts, col) => { ctx.beginPath(); pts.forEach((p, i) => { const q = P(p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 0.6; ctx.fill(); ctx.stroke(); };
    const facing = (n) => n[0] * camV[0] + n[1] * camV[1] + n[2] * camV[2] > 0;
    // Ground first, then the trees behind the block, back to front.
    for (const t of cache.ground) fillPoly(t.p, shade(t.col, t.n, t.tint));
    const treeFaces = [];
    for (const tr of cache.trees) {
      for (const f of prism(tr.trunk.a, tr.trunk.b, tr.trunk.w, tr.trunk.w, COL.trunk, [1, 0, 0])) treeFaces.push(f);
      for (const f of tr.parts) treeFaces.push(f);
    }
    const tf = treeFaces.map((f) => ({ ...f, n: faceNormal(f.p), d: f.p.reduce((s, p) => s + depth(p), 0) / f.p.length }));
    tf.sort((x, y) => x.d - y.d);
    for (const f of tf) { let n = f.n; if (!facing(n)) n = [-n[0], -n[1], -n[2]]; fillPoly(f.p, shade(f.col, n)); }
    // The block.
    const bt = cache.tris.filter((t) => facing(t.n)).map((t) => ({ ...t, d: (depth(t.p[0]) + depth(t.p[1]) + depth(t.p[2])) / 3 }));
    bt.sort((x, y) => x.d - y.d);
    for (const t of bt) fillPoly(t.p, shade(t.col, t.n, t.tint));
    // Holds: chalked once touched.
    const touched = C.touched(sm);
    for (const hd of cache.holds) {
      const col = touched.has(hd.h.id) ? COL.chalk : COL.hold;
      for (const f of hd.faces) { const n = faceNormal(f); if (facing(n)) fillPoly(f, shade(col, n)); }
    }
    // Pads.
    K.pads.forEach((pad, i) => {
      const col = i ? COL.pad2 : COL.pad1;
      const c = [[pad.x0, 0, pad.z0], [pad.x1, 0, pad.z0], [pad.x1, 0, pad.z1], [pad.x0, 0, pad.z1]];
      const t = c.map((p) => [p[0], pad.t, p[2]]);
      const faces = [{ p: t, n: [0, 1, 0] }, { p: [t[3], t[2], c[2], c[3]], n: [0, 0, 1] }, { p: [t[1], t[2], c[2], c[1]], n: [1, 0, 0] }, { p: [t[0], t[3], c[3], c[0]], n: [-1, 0, 0] }];
      for (const f of faces) if (facing(f.n)) fillPoly(f.p, shade(col, f.n));
    });
    // The target hold: a ring on the face and a marker above it.
    const tg = C.target(sm);
    if (tg) {
      const h = tg.hold;
      const ring = [];
      for (let i = 0; i < 20; i++) { const an = (i / 20) * Math.PI * 2; ring.push(P([h.x + Math.cos(an) * 0.1, h.y + Math.sin(an) * 0.1, h.z + 0.01])); }
      ctx.strokeStyle = 'rgba(255,214,90,0.95)'; ctx.lineWidth = 2.5; K.path(ctx, ring); ctx.stroke();
      const m = P([h.x, h.y + 0.2 + 0.03 * Math.sin(time * 5), h.z + 0.05]);
      ctx.fillStyle = '#FFD65A'; ctx.strokeStyle = '#7A5A10'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(m[0] - 7, m[1] - 8); ctx.lineTo(m[0] + 7, m[1] - 8); ctx.lineTo(m[0], m[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // The climber: prisms for the bones, a box for the torso, a faceted head.
    const bd = C.body3(sm.pose);
    const k = bd.k;
    const faces = [];
    const push = (fs) => { for (const f of fs) faces.push(f); };
    const outFrom = (p) => [0, 0, 1];
    push(prism(bd.shL, bd.elL, 0.09 * k, 0.09 * k, COL.skin, outFrom()));
    push(prism(bd.elL, bd.LH, 0.075 * k, 0.075 * k, COL.skin, outFrom()));
    push(prism(bd.shR, bd.elR, 0.09 * k, 0.09 * k, COL.skin, outFrom()));
    push(prism(bd.elR, bd.RH, 0.075 * k, 0.075 * k, COL.skin, outFrom()));
    push(prism(bd.hipL, bd.knL, 0.12 * k, 0.12 * k, COL.pants, outFrom()));
    push(prism(bd.knL, bd.LF, 0.095 * k, 0.095 * k, COL.pants, outFrom()));
    push(prism(bd.hipR, bd.knR, 0.12 * k, 0.12 * k, COL.pants, outFrom()));
    push(prism(bd.knR, bd.RF, 0.095 * k, 0.095 * k, COL.pants, outFrom()));
    // Sleeves and shoes.
    push(prism(bd.shL, C.mix3(bd.shL, bd.elL, 0.45), 0.11 * k, 0.11 * k, COL.shirt, outFrom()));
    push(prism(bd.shR, C.mix3(bd.shR, bd.elR, 0.45), 0.11 * k, 0.11 * k, COL.shirt, outFrom()));
    for (const [kn, ft] of [[bd.knL, bd.LF], [bd.knR, bd.RF]]) push(prism(C.mix3(kn, ft, 0.82), C.add3(ft, [0, -0.02, 0.02]), 0.1 * k, 0.1 * k, COL.shoe, outFrom()));
    // Torso: shoulders to hips, 0.2 m deep.
    const spine = C.norm3(C.sub3(bd.sh, bd.hip));
    push(prism(C.add3(bd.hip, C.mul3(spine, -0.04)), C.add3(bd.sh, C.mul3(spine, 0.04)), 0.32 * k, 0.2 * k, COL.shirt, [1, 0, 0]).map((f) => ({ ...f, torso: true })));
    push(headFaces(bd.head, 0.12 * k, COL.skin, COL.hair));
    const cf = faces.map((f) => ({ ...f, n: faceNormal(f.p), d: f.p.reduce((s, p) => s + depth(p), 0) / f.p.length })).filter((f) => facing(f.n));
    cf.sort((x, y) => x.d - y.d);
    const hud = C.hudOf(sm);
    const pump = Math.min(1, hud.pump / 40);
    for (const f of cf) {
      let col = f.col;
      if (col === COL.skin && pump > 0 && !f.torso) col = [col[0], col[1] - 60 * pump, col[2] - 50 * pump];
      fillPoly(f.p, shade(col, f.n));
    }
    // Events: a burst on a slip, an arc on the deadpoint, a flag at the top.
    const ev = C.event(sm);
    if (ev === 'slip' && sm.u > 0.45 && sm.u < 0.9) {
      const c = P(sm.pose.ends[sm.seg.style.limb]);
      const v = (sm.u - 0.45) / 0.45;
      ctx.strokeStyle = `rgba(255,90,70,${1 - v})`; ctx.lineWidth = 3;
      for (let i = 0; i < 8; i++) { const an = (i / 8) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(c[0] + Math.cos(an) * (8 + 14 * v), c[1] + Math.sin(an) * (8 + 14 * v)); ctx.lineTo(c[0] + Math.cos(an) * (14 + 18 * v), c[1] + Math.sin(an) * (14 + 18 * v)); ctx.stroke(); }
    }
    if (ev === 'deadpoint' && tg) {
      const from = sm.seg.from.ends[tg.limb], to = [tg.hold.x, tg.hold.y, tg.hold.z];
      ctx.strokeStyle = 'rgba(255,214,90,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) { const t = i / 16; const p = P([C.lerp(from[0], to[0], t), C.lerp(from[1], to[1], t) + 0.12 * Math.sin(Math.PI * t), C.lerp(from[2], to[2], t) + 0.15 * Math.sin(Math.PI * t)]); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    // Floating meters over the climber: pump (warm) and power (cool) arcs, a heartbeat dot for fear.
    if (sm.seg.kind !== 'cheer' && sm.seg.kind !== 'land') {
      const away = sm.seg.style && sm.seg.style.limb && sm.seg.style.limb[0] === 'R' ? -1 : 1;
      const hc = P(C.add3(bd.head, [0.42 * away * k, 0.12 * k, 0.1]));
      const R = 15;
      ctx.lineCap = 'round';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(20,30,40,0.35)'; ctx.beginPath(); ctx.arc(hc[0], hc[1], R, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#FF8A3D'; ctx.beginPath(); ctx.arc(hc[0], hc[1], R, Math.PI / 2, Math.PI / 2 + Math.PI * Math.max(0.03, hud.pump / 100)); ctx.stroke();
      ctx.strokeStyle = '#4FC3F7'; ctx.beginPath(); ctx.arc(hc[0], hc[1], R, Math.PI / 2, Math.PI / 2 - Math.PI * Math.max(0.03, hud.power / 100), true); ctx.stroke();
      const beat = 0.5 + 0.5 * Math.pow(Math.max(0, Math.sin(time * Math.PI * 2 * (0.9 + hud.fear / 60))), 6);
      ctx.fillStyle = hud.fear > hud.bandHi || hud.fear < hud.bandLo ? '#FF5A46' : '#FFFFFF';
      ctx.beginPath(); ctx.arc(hc[0], hc[1], 3 + 3 * beat, 0, Math.PI * 2); ctx.fill();
    }
    if (sm.seg.kind === 'cheer') {
      const top = P(C.add3(bd.head, [0.5, 0.5, 0]));
      ctx.strokeStyle = '#3A3A3A'; ctx.lineWidth = 2; K.line(ctx, top, [top[0], top[1] + 40]); ctx.stroke();
      ctx.fillStyle = '#FFD65A'; ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(top[0] + 26, top[1] + 8); ctx.lineTo(top[0], top[1] + 16); ctx.closePath(); ctx.fill();
    }
  }

  return { name: 'Low-poly 3D', fonts: [], init, draw };
})();
