// Drawing kit shared by the styles: offscreen layers, cameras, paths, hold shapes and the body split into
// depth-sorted parts, so every style draws the same simulated body its own way.
function makeKit(C, scene) {
  const top = C.top;
  const SIZE = { s: 0.75, m: 1, l: 1.15, xl: 1.35 };
  const DIMS = { crimp: [0.085, 0.02], edge: [0.08, 0.03], sloper: [0.15, 0.075], foot_chip: [0.045, 0.022], jug: [0.12, 0.06], pinch: [0.035, 0.1], pocket1: [0.03, 0.025], pocket2: [0.04, 0.028], pocket3: [0.05, 0.03] };
  /** A hold's footprint on the face in metres: [width, height]. */
  function dims(h) { const s = SIZE[h.size] || 1; const d = DIMS[h.type] || [0.07, 0.04]; return [d[0] * s, d[1] * s]; }

  /** An offscreen canvas `w`×`h` CSS px at `dpr`, its context scaled so drawing is in CSS px. */
  function layer(w, h, dpr = 1) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * dpr)); c.height = Math.max(1, Math.ceil(h * dpr));
    const x = c.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c, x, w, h, dpr };
  }
  /** A camera: view metres (y up) to canvas px, `ppm` px per metre, (cx, cy) in view metres at the canvas centre. */
  function cam(W, H, ppm, cx, cy) {
    const S = (v) => [W / 2 + (v[0] - cx) * ppm, H / 2 - (v[1] - cy) * ppm];
    S.ppm = ppm; S.cx = cx; S.cy = cy;
    S.inv = (p) => [cx + (p[0] - W / 2) / ppm, cy - (p[1] - H / 2) / ppm];
    return S;
  }
  function path(ctx, pts, close = true) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    if (close) ctx.closePath();
  }
  /** A smooth path through `pts` (quadratic curves between midpoints). */
  function smooth(ctx, pts, close = true) {
    ctx.beginPath();
    const n = pts.length;
    if (n < 3) return path(ctx, pts, close);
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (close) {
      let m = mid(pts[n - 1], pts[0]);
      ctx.moveTo(m[0], m[1]);
      for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; m = mid(p, q); ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]); }
      ctx.closePath();
    } else {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < n - 1; i++) { const m = mid(pts[i], pts[i + 1]); ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
      ctx.lineTo(pts[n - 1][0], pts[n - 1][1]);
    }
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function line(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  function poly(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); }
  const hash = (i) => { let x = (i * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };

  /** A hold's silhouette path in px at `c` (px centre) for `ppm` px per metre, by type. `grow` pads it. */
  function holdPath(ctx, h, c, ppm, grow = 0) {
    const [w0, h0] = dims(h);
    const w = w0 * ppm + grow * 2, hh = h0 * ppm + grow * 2;
    const [x, y] = c;
    ctx.beginPath();
    if (h.type === 'sloper') {
      ctx.ellipse(x, y, w / 2, hh / 2, 0, Math.PI, 0);
      ctx.quadraticCurveTo(x + w / 2, y + hh * 0.25, x, y + hh * 0.22);
      ctx.quadraticCurveTo(x - w / 2, y + hh * 0.25, x - w / 2, y);
      ctx.closePath();
    } else if (h.type === 'foot_chip') {
      ctx.ellipse(x, y, w / 2, hh / 2, 0, 0, Math.PI * 2);
    } else {
      // Edges and crimps: a flat top and a rounded underside.
      const r = Math.min(hh / 2, w / 4);
      rrect(ctx, x - w / 2, y - hh / 2, w, hh, r);
    }
  }

  /** The front outline in view metres (y up). */
  const outline = C.outlineFront();

  /**
   * The body as parts for drawing, sorted back to front by `depth` (a function of a world point, larger = nearer):
   * each part {name, kind: 'bone'|'torso'|'head', a, b (px), a3, b3 (world), side, limb, depth}.
   */
  function parts(pose, proj, S, depth) {
    const b = C.body3(pose);
    const P = (p) => S(proj(p));
    const out = [];
    const bone = (name, a3, b3, side, limb, kind) => out.push({ name, kind, a3, b3, a: P(a3), b: P(b3), side, limb, depth: (depth(a3) + depth(b3)) / 2 });
    bone('upperL', b.shL, b.elL, -1, 'LH', 'upper');
    bone('foreL', b.elL, b.LH, -1, 'LH', 'fore');
    bone('upperR', b.shR, b.elR, 1, 'RH', 'upper');
    bone('foreR', b.elR, b.RH, 1, 'RH', 'fore');
    bone('thighL', b.hipL, b.knL, -1, 'LF', 'thigh');
    bone('shinL', b.knL, b.LF, -1, 'LF', 'shin');
    bone('thighR', b.hipR, b.knR, 1, 'RF', 'thigh');
    bone('shinR', b.knR, b.RF, 1, 'RF', 'shin');
    const quad = [b.shL, b.shR, b.hipR, b.hipL];
    out.push({ name: 'torso', kind: 'torso', q3: quad, q: quad.map(P), depth: quad.reduce((s, p) => s + depth(p), 0) / 4 + 0.02, neck: P(b.neck), hipC: P(b.hip), shC: P(b.sh) });
    out.push({ name: 'head', kind: 'head', c3: b.head, c: P(b.head), neck: P(b.neck), depth: depth(b.head) + 0.03 });
    out.sort((p, q) => p.depth - q.depth);
    const px = (() => { const a = P(b.sh), c = P(C.add3(b.sh, [0, 0.1, 0])); return Math.hypot(c[0] - a[0], c[1] - a[1]) * 10; })();
    return { list: out, b, P, px, k: b.k };
  }

  /** The view-depth functions that go with the projections. */
  const depths = {
    front: (p) => p[2] + 0.3 * p[1],
    orbit: (proj) => (p) => proj(p)[2],
    iso: (p) => p[0] + p[2] + p[1] * 0.2,
  };

  /** Wall face shading bands: the profile's segments as px polygons across the face span (front view). */
  function faceBands(S, proj) {
    const bands = [];
    for (const s of scene.wall.segments) {
      const ys = [];
      for (let i = 0; i <= 6; i++) ys.push(s.y0 + ((s.y1 - s.y0) * i) / 6);
      const left = ys.map((y) => { const [L] = C.faceSpan(y); return S(proj([L, y, C.faceZ(y)])); });
      const right = ys.map((y) => { const [, R] = C.faceSpan(y); return S(proj([R, y, C.faceZ(y)])); });
      bands.push({ seg: s, pts: [...left, ...right.reverse()] });
    }
    return bands;
  }

  /** The outline as px through a front-style camera (outline points are on the face, z from the profile). */
  function outlinePx(S, proj) { return outline.map(([x, y]) => S(proj([x, Math.max(0, y), C.faceZ(Math.max(0, Math.min(top, y)))]))); }
  /** The top cap: the outline's upper rim pushed back over the block (seen from a little above). */
  function capPx(S, proj, depthM = 1.5) {
    const rim = outline.filter(([, y]) => y > top - 0.3);
    const xL = rim[0][0], xR = rim[rim.length - 1][0];
    const cx = (xL + xR) / 2, a = ((xR - xL) / 2) * 0.94;
    const back = [];
    for (let i = 0; i <= 14; i++) { const th = (i / 14) * Math.PI; back.push([cx + a * Math.cos(th), top + 0.02, -depthM * Math.sin(th)]); }
    const pts = [...rim.map(([x, y]) => [x, y, C.faceZ(Math.min(top, y))]), ...back];
    return pts.map((p) => S(proj(p)));
  }

  /** Font sand pads: two pads under the problem (world rectangles on the ground). */
  const pads = [
    { x0: -0.95, x1: 0.05, z0: 0.12, z1: 1.32, t: 0.1 },
    { x0: 0.0, x1: 1.0, z0: 0.18, z1: 1.38, t: 0.1 },
  ];
  /** A ground-plane box (pads, bags) as px faces for a projection: top and front faces. */
  function boxFaces(b, proj, S) {
    const P = (x, y, z) => S(proj([x, y, z]));
    const topF = [P(b.x0, b.t, b.z0), P(b.x1, b.t, b.z0), P(b.x1, b.t, b.z1), P(b.x0, b.t, b.z1)];
    const front = [P(b.x0, b.t, b.z1), P(b.x1, b.t, b.z1), P(b.x1, 0, b.z1), P(b.x0, 0, b.z1)];
    const side = [P(b.x1, b.t, b.z0), P(b.x1, b.t, b.z1), P(b.x1, 0, b.z1), P(b.x1, 0, b.z0)];
    return { top: topF, front, side };
  }

  /** Chalk marks: an alpha in [0, 1] per touched hold. */
  function chalked(sm) { return C.touched(sm); }

  /** A clock for "boiling" line styles: changes `fps` times a second. */
  const tick = (time, fps) => Math.floor(time * fps);

  /** The low-poly boulder: rings of points around the block, the face following the profile. */
  function boulderMesh(seed = 7, opts = {}) {
    const r = C.rng(seed);
    const depth = opts.depth ?? 1.7;
    const ys = opts.ys ?? [0, 0.45, 0.9, 1.35, 1.8, 2.15, top - 0.06];
    const nf = opts.nf ?? 6, nb = opts.nb ?? 8;
    const rings = ys.map((y, j) => {
      const [L, R] = C.faceSpan(Math.min(y, top - 0.05));
      const z0 = C.faceZ(Math.min(y, top));
      const shrink = j === ys.length - 1 ? 0.92 : 1;
      const pts = [];
      for (let i = 0; i < nf; i++) {
        const t = i / (nf - 1);
        pts.push([C.lerp(L, R, t) * shrink, y, z0 + (i > 0 && i < nf - 1 ? (r() - 0.5) * 0.02 : 0)]);
      }
      const taper = 1 - (opts.taper ?? 0) * Math.pow(y / top, 2);
      const cx = (L + R) / 2, a = ((R - L) / 2) * shrink, D = depth * taper * (j === ys.length - 1 ? 0.88 : 1) * (0.95 + r() * 0.1);
      for (let i = 1; i < nb; i++) {
        const th = (i / nb) * Math.PI;
        const n = 1 + (r() - 0.5) * 0.12;
        pts.push([cx + a * Math.cos(th) * n, y + (j > 0 ? (r() - 0.5) * 0.08 : 0), z0 - D * Math.sin(th) * n]);
      }
      return pts;
    });
    const tris = [];
    for (let j = 0; j + 1 < rings.length; j++) {
      const A = rings[j], B = rings[j + 1], n = A.length;
      for (let i = 0; i < n; i++) {
        const i2 = (i + 1) % n;
        // Skip the seam across the front's ends going round the back... the ring is closed, so every quad is real.
        tris.push([A[i], A[i2], B[i2]], [A[i], B[i2], B[i]]);
      }
    }
    // The top: a fan to a centre a little above the last ring.
    const last = rings[rings.length - 1];
    const cx = last.reduce((s, p) => s + p[0], 0) / last.length, cz = last.reduce((s, p) => s + p[2], 0) / last.length;
    const apex = [cx, top + 0.05, cz];
    for (let i = 0; i < last.length; i++) tris.push([last[i], last[(i + 1) % last.length], apex]);
    return { rings, tris, apex };
  }
  /** A triangle's normal (unit), facing out of the block. */
  function triNormal(t, centre) {
    const u = C.sub3(t[1], t[0]), v = C.sub3(t[2], t[0]);
    let n = C.norm3([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
    const m = [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3];
    const out = C.sub3(m, centre);
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = [-n[0], -n[1], -n[2]];
    return n;
  }

  /** Text wrapped to `maxW` px; returns the lines. */
  function wrap(ctx, text, maxW) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  return { dims, layer, cam, path, smooth, rrect, line, poly, hash, holdPath, outline, parts, depths, faceBands, outlinePx, capPx, pads, boxFaces, chalked, tick, boulderMesh, triNormal, wrap };
}
