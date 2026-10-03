// Shared playback core for the visual-style mockups. Pure functions over the exported scene: the timeline of an
// attempt sequence, 3D pose interpolation, the fall and top-out poses, two-bone IK in 3D, projections and the HUD.
// World axes: x across the face, y up, z out from the foot of the wall (towards the viewer).
function makeCore(scene) {
  const LIMBS = ['LH', 'RH', 'LF', 'RF'];
  const STEP = 0.8; // seconds per step at 1x
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm3 = (a) => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const hold = Object.fromEntries(scene.holds.map((h) => [h.id, h]));
  const top = scene.wall.top;

  /** A seeded random stream, so every frame of a style draws the same texture. */
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  /** Smooth value noise in 2D. */
  function noise2(seed) {
    const r = rng(seed);
    const N = 64;
    const g = new Float32Array(N * N);
    for (let i = 0; i < g.length; i++) g[i] = r();
    const at = (x, y) => g[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return lerp(lerp(at(xi, yi), at(xi + 1, yi), u), lerp(at(xi, yi + 1), at(xi + 1, yi + 1), u), v);
    };
  }
  /** The wall face's z at height y, from the profile's segments (angle > 90 leans out over the climber). */
  function faceZ(y) {
    let z = 0;
    for (const s of scene.wall.segments) {
      const a = Math.min(y, s.y1) - s.y0;
      if (a <= 0) break;
      z += a * Math.tan(((s.angle - 90) * Math.PI) / 180);
    }
    return z;
  }

  function clonePose(p) {
    return { sh: p.sh.slice(), hip: p.hip.slice(), ends: { LH: p.ends.LH.slice(), RH: p.ends.RH.slice(), LF: p.ends.LF.slice(), RF: p.ends.RF.slice() }, on: { ...p.on }, k: p.k };
  }
  /** The pose with one limb on a hold, the body following a share of the way (the reach for the last hold). */
  function reachPose(p, limb, h, share) {
    const q = clonePose(p);
    q.ends[limb] = [h.x, h.y, h.z];
    q.on[limb] = true;
    const dy = (h.y - p.ends[limb][1]) * share;
    q.sh[1] += dy * 0.5; q.hip[1] += dy * 0.5;
    return q;
  }
  /** Off the wall: everything lets go and the climber lands sitting on the pads. */
  function fallenPose(p) {
    const k = p.k;
    const hip = [p.hip[0] - 0.1, 0.16 * k, 0.72];
    const sh = [hip[0] - 0.05, hip[1] + 0.5 * k, 0.86];
    return {
      sh, hip, k, on: { LH: false, RH: false, LF: false, RF: false },
      ends: { LH: [sh[0] - 0.34, 0.12, 0.7], RH: [sh[0] + 0.32, 0.12, 0.72], LF: [hip[0] - 0.22, 0.04, 1.32], RF: [hip[0] + 0.24, 0.04, 1.36] },
    };
  }
  /** Over the lip: standing on top of the boulder, arms up. */
  function toppedPose(p) {
    const k = p.k;
    const hip = [p.hip[0] + 0.05, top + 0.86 * k, -0.35];
    const sh = [hip[0], hip[1] + 0.5 * k, -0.38];
    return {
      sh, hip, k, on: { LH: false, RH: false, LF: true, RF: true },
      ends: { LH: [sh[0] - 0.32, sh[1] + 0.42 * k, -0.34], RH: [sh[0] + 0.33, sh[1] + 0.44 * k, -0.34], LF: [hip[0] - 0.13, top + 0.02, -0.38], RF: [hip[0] + 0.15, top + 0.02, -0.33] },
    };
  }
  /** The pose `t` of the way from `a` to `b`: the moving limb arcs out and up; a deadpoint or dyno lifts the body. */
  function lerpPose(a, b, t, style) {
    const e = ease(t);
    const lift = style.cls === 'dyno' ? 0.22 * b.k : style.cls === 'deadpoint' ? 0.13 * b.k : 0;
    const up = lift * Math.sin(Math.PI * clamp(t * 1.15, 0, 1));
    const ends = {};
    for (const l of LIMBS) {
      const p = mix3(a.ends[l], b.ends[l], e);
      if (l === style.limb) {
        const d = Math.hypot(b.ends[l][0] - a.ends[l][0], b.ends[l][1] - a.ends[l][1]);
        const arc = Math.min(0.22, 0.35 * d) * Math.sin(Math.PI * e);
        ends[l] = [p[0], p[1] + 0.3 * arc, p[2] + arc];
      } else ends[l] = p;
    }
    const sh = mix3(a.sh, b.sh, e); sh[1] += up;
    const hip = mix3(a.hip, b.hip, e); hip[1] += up;
    const on = {};
    for (const l of LIMBS) on[l] = l === style.limb ? (t < 0.08 ? a.on[l] : t > 0.88 ? b.on[l] : false) : t < 1 ? a.on[l] : b.on[l];
    return { sh, hip, ends, on, k: b.k };
  }

  /**
   * The timeline: for each attempt an intro, a step per frame and the ending (the reach that failed and the fall, or
   * the mantle and the top-out). Each segment carries the frame the HUD shows.
   */
  function buildTimeline() {
    const segs = [];
    let t = 0;
    const push = (s) => { s.t0 = t; t += s.dur; segs.push(s); };
    scene.attempts.forEach((A, ai) => {
      const F = A.frames;
      push({ kind: 'intro', a: ai, dur: 1.4, from: F[0].pose, to: F[0].pose, hud: F[0], style: {} });
      for (let i = 0; i + 1 < F.length; i++) {
        const f = F[i + 1];
        const style = { limb: f.limb, cls: f.cls, slip: f.outcome === 'slip_recovered', sketchy: f.outcome === 'sketchy', commit: f.commit, target: f.outcome === 'slip_recovered' && F[i].next ? hold[F[i].next.hold] : null };
        const slow = (f.cls === 'deadpoint' || f.cls === 'dyno' ? 1.3 : 1) * (style.slip ? 1.35 : style.sketchy ? 1.15 : 1);
        push({ kind: 'step', a: ai, i: i + 1, dur: STEP * slow, from: F[i].pose, to: f.pose, hud: f, style });
      }
      const last = F[F.length - 1];
      const nx = last.next;
      const target = nx ? hold[nx.hold] : null;
      const endHud = { ...last, cls: nx ? nx.cls : null, limb: nx ? nx.limb : null };
      if (A.result.outcome === 'sent') {
        const reach = target ? reachPose(last.pose, nx.limb, target, 0.5) : last.pose;
        const up = toppedPose(reach);
        push({ kind: 'reach', a: ai, dur: 0.6, from: last.pose, to: reach, hud: { ...endHud, text: 'Mantle.' }, style: { limb: nx && nx.limb, cls: 'static' } });
        push({ kind: 'mantle', a: ai, dur: 1.6, from: reach, to: up, hud: { ...endHud, text: A.result.last }, style: {} });
        push({ kind: 'cheer', a: ai, dur: 2.6, from: up, to: up, hud: { ...endHud, text: A.result.text }, style: {} });
      } else {
        const reach = target ? reachPose(last.pose, nx.limb, target, 0.55) : last.pose;
        const down = fallenPose(reach);
        push({ kind: 'reach', a: ai, dur: 0.95, from: last.pose, to: reach, hud: { ...endHud, text: `${nx ? nx.cls[0].toUpperCase() + nx.cls.slice(1) : 'Reach'} for the top.` }, style: { limb: nx && nx.limb, cls: nx && nx.cls } });
        push({ kind: 'fall', a: ai, dur: 0.9, from: reach, to: down, hud: { ...endHud, text: A.result.last }, style: {} });
        push({ kind: 'land', a: ai, dur: 2.2, from: down, to: down, hud: { ...endHud, text: `${A.result.last} ${A.result.text}` }, style: {} });
      }
    });
    return { segs, total: t };
  }
  const TL = buildTimeline();

  /** Where the playback is at `time` (seconds, looping): the segment, its progress and the pose. */
  function sample(time) {
    const T = ((time % TL.total) + TL.total) % TL.total;
    let s = TL.segs[TL.segs.length - 1];
    for (const x of TL.segs) if (T >= x.t0 && T < x.t0 + x.dur) { s = x; break; }
    const u = clamp((T - s.t0) / s.dur, 0, 1);
    let pose;
    let drop = 0;
    if (s.kind === 'fall') {
      // The hand skids off the sloper, then an accelerating drop to the pads.
      const skid = clamp(u / 0.18, 0, 1);
      const e = Math.pow(clamp((u - 0.12) / 0.75, 0, 1), 2);
      const a = clonePose(s.from), b = s.to;
      for (const l of LIMBS) if (a.on[l] && (l === 'LH' || l === 'RH')) a.ends[l][1] -= 0.09 * skid;
      pose = { sh: mix3(a.sh, b.sh, e), hip: mix3(a.hip, b.hip, e), k: a.k, on: { LH: false, RH: false, LF: false, RF: false }, ends: {} };
      for (const l of LIMBS) pose.ends[l] = mix3(a.ends[l], b.ends[l], Math.min(1, e * 1.15));
      drop = e;
    } else if (s.kind === 'mantle') {
      const e = ease(u);
      const a = s.from, b = s.to;
      // Press up first, then step through onto the top.
      const lift = (p, q) => [lerp(p[0], q[0], e), lerp(p[1], q[1], Math.min(1, e * 1.3)), lerp(p[2], q[2], clamp(e * 1.7 - 0.7, 0, 1))];
      pose = { sh: lift(a.sh, b.sh), hip: lift(a.hip, b.hip), k: a.k, on: u < 0.55 ? { LH: true, RH: u < 0.3, LF: false, RF: false } : b.on, ends: {} };
      for (const l of LIMBS) pose.ends[l] = lift(a.ends[l], b.ends[l]);
    } else if (s.kind === 'step' || s.kind === 'reach') {
      pose = lerpPose(s.from, s.to, s.style.slip ? 1 : u, s.style);
      if (s.style.slip && s.style.limb) {
        // The limb goes for the hold, comes off it, and is caught back where it was.
        const l = s.style.limb;
        const home = s.from.ends[l];
        const tgt = s.style.target ? [s.style.target.x, s.style.target.y, s.style.target.z] : home;
        const side = l === 'LH' || l === 'LF' ? -1 : 1;
        let p;
        if (u < 0.38) p = mix3(home, tgt, ease(u / 0.38));
        else if (u < 0.52) p = tgt.slice();
        else if (u < 0.7) { const v = (u - 0.52) / 0.18; p = add3(tgt, [0.06 * side * v, -0.13 * v, 0.1 * Math.sin(Math.PI * v)]); }
        else { const v = ease((u - 0.7) / 0.3); p = mix3(add3(tgt, [0.06 * side, -0.13, 0]), home, v); }
        pose.ends[l] = p;
        pose.on[l] = (u > 0.34 && u < 0.54) || u > 0.95;
        // The body sags when the limb comes off.
        const sag = 0.05 * Math.sin(Math.PI * clamp((u - 0.5) / 0.4, 0, 1));
        pose.sh[1] -= sag; pose.hip[1] -= sag;
      }
    } else pose = clonePose(s.from);
    // A sketchy move or a slip shakes the body as it settles.
    let shake = 0;
    if (s.kind === 'step' && (s.style.sketchy || s.style.slip)) shake = 0.025 * Math.sin(u * Math.PI * 10) * Math.max(0, 1 - Math.abs(u - (s.style.slip ? 0.62 : 0.8)) * 4);
    if (shake) { pose.sh[0] += shake; pose.hip[0] += shake * 0.6; }
    return { seg: s, u, T, pose, hud: s.hud, attempt: scene.attempts[s.a], ai: s.a, drop, shake };
  }

  /** Two-bone IK in 3D: the joint between `a` and `b` for bones `l1`, `l2`, bending towards the `pole` direction. */
  function joint3(a, b, l1, l2, pole) {
    const ab = sub3(b, a);
    const d0 = len3(ab) || 1e-6;
    const d = Math.min(d0, l1 + l2 - 1e-4);
    const u = mul3(ab, 1 / d0);
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const off = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    let n = sub3(pole, mul3(u, dot3(pole, u)));
    if (len3(n) < 1e-6) n = [0, 0, 1];
    n = norm3(n);
    return add3(add3(a, mul3(u, along)), mul3(n, off));
  }

  /** The body's joints in 3D: shoulders and hips spread across, elbows and knees by IK, the head along the spine. */
  function body3(pose) {
    const k = pose.k;
    const shL = add3(pose.sh, [-0.18 * k, 0, 0]), shR = add3(pose.sh, [0.18 * k, 0, 0]);
    const hipL = add3(pose.hip, [-0.11 * k, 0, 0]), hipR = add3(pose.hip, [0.11 * k, 0, 0]);
    const E = pose.ends;
    const elbowPole = (s) => [0.75 * s, -0.55, 0.45];
    // Knees go out to the side and off the wall; with the feet out in front (sitting) they come up.
    const kneePole = (s, foot, hip) => { const w = clamp((foot[2] - hip[2]) / 0.4, 0, 1); return [s * lerp(0.8, 0.35, w), lerp(0.05, 1, w), lerp(0.6, 0.2, w)]; };
    const elL = joint3(shL, E.LH, 0.3 * k, 0.34 * k, elbowPole(-1));
    const elR = joint3(shR, E.RH, 0.3 * k, 0.34 * k, elbowPole(1));
    const knL = joint3(hipL, E.LF, 0.45 * k, 0.45 * k, kneePole(-1, E.LF, pose.hip));
    const knR = joint3(hipR, E.RF, 0.45 * k, 0.45 * k, kneePole(1, E.RF, pose.hip));
    const spine = norm3(sub3(pose.sh, pose.hip));
    const neck = add3(pose.sh, mul3(spine, 0.08 * k));
    const head = add3(pose.sh, mul3(spine, 0.24 * k));
    return { k, sh: pose.sh, hip: pose.hip, shL, shR, hipL, hipR, elL, elR, knL, knR, LH: E.LH, RH: E.RH, LF: E.LF, RF: E.RF, neck, head, spine, on: pose.on };
  }

  /** Projections from world metres to 2D view metres (y up). */
  const views = {
    // Front, from a little above: things out from the wall sit lower, so the ground and the pads show.
    front: (p) => [p[0], p[1] - 0.3 * p[2]],
    // A yawed and pitched camera; returns [x, y, depth] with depth growing towards the camera.
    orbit(yawDeg, pitchDeg) {
      const a = (yawDeg * Math.PI) / 180, b = (pitchDeg * Math.PI) / 180;
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      return (p) => {
        const xr = p[0] * ca + p[2] * sa;
        const zr = -p[0] * sa + p[2] * ca;
        return [xr, p[1] * cb - zr * sb, zr * cb + p[1] * sb];
      };
    },
    // Isometric: x runs down-right, z (out from the face) runs down-left, y up.
    iso: (p) => [(p[0] - p[2]) * 0.866, p[1] - (p[0] + p[2]) * 0.5],
  };

  /** A body projected for drawing: every joint as [px, py] through `proj` then `S`. */
  function skeleton(pose, proj, S) {
    const b = body3(pose);
    const P = (p) => S(proj(p));
    const out = { b3: b, k: b.k, on: b.on };
    for (const key of ['sh', 'hip', 'shL', 'shR', 'hipL', 'hipR', 'elL', 'elR', 'knL', 'knR', 'LH', 'RH', 'LF', 'RF', 'neck', 'head']) out[key] = P(b[key]);
    // Pixels per metre at the body (for line widths).
    const a = P(b.sh), c = P(add3(b.sh, [0, 0.1, 0]));
    out.px = Math.hypot(c[0] - a[0], c[1] - a[1]) * 10;
    return out;
  }

  /** A front outline for the boulder (authored for the mockups: the data has the wall profile, not the block's shape). */
  let outlineCache = null;
  function outlineFront() {
    if (outlineCache) return outlineCache;
    const { x0, x1 } = scene.wall;
    const ctrl = [
      [x0 - 0.42, 0], [x0 - 0.3, 0.55], [x0 - 0.16, 1.25], [x0 - 0.06, 1.85], [x0 + 0.16, top - 0.12], [x0 + 0.55, top + 0.01],
      [(x0 + x1) / 2 - 0.1, top + 0.05], [x1 - 0.45, top + 0.02], [x1 - 0.1, top - 0.16], [x1 + 0.06, 1.9], [x1 + 0.16, 1.2], [x1 + 0.26, 0.55], [x1 + 0.4, 0],
    ];
    const pts = [];
    for (let i = 0; i < ctrl.length - 1; i++) {
      const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
      for (let s = 0; s < 8; s++) {
        const t = s / 8, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    pts.push(ctrl[ctrl.length - 1]);
    outlineCache = pts;
    return pts;
  }
  /** The left and right edge of the face at height y (from the outline). */
  function faceSpan(y) {
    const o = outlineFront();
    let L = null, R = null;
    for (let i = 0; i + 1 < o.length; i++) {
      const a = o[i], b = o[i + 1];
      if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) {
        const x = a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
        if (L === null || x < L) L = x;
        if (R === null || x > R) R = x;
      }
    }
    return [L ?? scene.wall.x0, R ?? scene.wall.x1];
  }

  /** The problem's line through its hand holds, start to finish (3D points). */
  function linePath() {
    const starts = scene.holds.filter((h) => h.start && h.hands && h.y > 1);
    const mid = starts.length ? [starts.reduce((s, h) => s + h.x, 0) / starts.length, starts.reduce((s, h) => s + h.y, 0) / starts.length, -0.01] : [0, 1, 0];
    const hands = scene.line.filter((s) => s.limb === 'LH' || s.limb === 'RH').map((s) => hold[s.hold]);
    const seen = new Set();
    const pts = [mid];
    for (const h of hands) if (!seen.has(h.id)) { seen.add(h.id); pts.push([h.x, h.y, h.z]); }
    return pts;
  }

  function nearestHold(p) {
    let best = null, bd = 1e9;
    for (const h of scene.holds) { const d = Math.hypot(h.x - p[0], h.y - p[1], (h.z - p[2]) * 0.5); if (d < bd) { bd = d; best = h.id; } }
    return bd < 0.12 ? best : null;
  }
  /** Holds touched so far in the playback (chalked): earlier attempts and this one up to now. */
  function touched(sm) {
    const set = new Set();
    const add = (pose) => { for (const l of LIMBS) if (pose.on[l]) { const id = nearestHold(pose.ends[l]); if (id) set.add(id); } };
    for (const A of scene.attempts.slice(0, sm.ai)) for (const f of A.frames) add(f.pose);
    const F = sm.attempt.frames;
    const upto = sm.seg.kind === 'step' ? sm.seg.i : sm.seg.kind === 'intro' ? 0 : F.length - 1;
    for (let i = 0; i <= upto; i++) add(F[i].pose);
    if (sm.seg.kind === 'reach' && sm.u > 0.85) add(sm.seg.to);
    return set;
  }
  /** The hold the climber is going for now, and with which limb and move. */
  function target(sm) {
    const s = sm.seg;
    if (s.kind === 'step' && s.style.limb) {
      const id = s.style.slip && s.style.target ? s.style.target.id : nearestHold(s.to.ends[s.style.limb]);
      return id ? { hold: hold[id], limb: s.style.limb, cls: s.style.cls } : null;
    }
    if (s.kind === 'reach' || s.kind === 'intro') {
      const f = s.kind === 'intro' ? s.hud : sm.attempt.frames[sm.attempt.frames.length - 1];
      const n = f.next;
      return n ? { hold: hold[n.hold], limb: n.limb, cls: n.cls } : null;
    }
    return null;
  }

  /** What an event is, for the styles that mark them: 'slip', 'sketchy', 'deadpoint', 'fall', 'land', 'top', or null. */
  function event(sm) {
    const s = sm.seg;
    if (s.kind === 'fall') return 'fall';
    if (s.kind === 'land') return 'land';
    if (s.kind === 'mantle' || s.kind === 'cheer') return 'top';
    if (s.kind === 'reach') return s.style.cls === 'deadpoint' || s.style.cls === 'dyno' ? 'deadpoint' : null;
    if (s.kind === 'step') {
      if (s.style.slip) return 'slip';
      if (s.style.cls === 'deadpoint' || s.style.cls === 'dyno') return 'deadpoint';
      if (s.style.sketchy) return 'sketchy';
    }
    return null;
  }

  /** The time of the first segment matching `pred`, plus `frac` of it (for stills). */
  function timeOf(pred, frac = 0.5) {
    const s = TL.segs.find(pred);
    return s ? s.t0 + s.dur * frac : 0;
  }

  /** A camera height that follows the climber's hips, smoothed over two seconds, within [lo, hi]. */
  function followY(time, proj, lo, hi) {
    let sum = 0, n = 0;
    const T = ((time % TL.total) + TL.total) % TL.total;
    for (const d of [-1, -0.5, 0, 0.5, 1]) {
      const t = clamp(T + d, 0, TL.total - 1e-3);
      sum += proj(sample(t).pose.hip)[1]; n++;
    }
    return clamp(sum / n, lo, hi);
  }

  const MOVE = { static: 'Static', high_step: 'High step', deadpoint: 'Deadpoint', dyno: 'Dyno', mantle: 'Mantle', match: 'Match', bump: 'Bump' };
  const LIMB = { LH: 'left hand', RH: 'right hand', LF: 'left foot', RF: 'right foot' };
  /** The HUD for a sample: what the screen around the wall shows. */
  function hudOf(sm) {
    const f = sm.hud;
    const A = sm.attempt;
    const k = sm.seg.kind;
    const ended = k === 'land' || k === 'cheer';
    let text = f.text;
    if (k === 'intro') text = A.n === 1 ? 'Flash attempt: the climber has watched it done.' : 'Second go. The moves are known now.';
    const outcome = ended ? (A.result.outcome === 'sent' ? `Sent · ${A.mode}, try ${A.n}` : `Off at ${Math.round(100 * A.result.progress)}%`) : '';
    const tg = target(sm);
    // Fear that rose on this step, and why (the newest labelled source).
    let fearUp = null;
    if (k === 'step') {
      const prev = A.frames[sm.seg.i - 1];
      const d = f.fear - prev.fear;
      const src = (f.fear_sources || [])[f.fear_sources.length - 1];
      if (d > 0.5 && src) fearUp = { d: Math.round(d), label: src.label };
    }
    return {
      fearUp,
      attempt: `Attempt ${A.n} · ${A.mode === 'flash' ? 'flash' : 'redpoint'}`,
      n: A.n, mode: A.mode, kind: k, text,
      step: k === 'step' ? sm.seg.i : k === 'intro' ? 0 : A.frames.length - 1, steps: A.frames.length - 1,
      pump: Math.round(f.pump), power: Math.round((100 * f.power) / Math.max(1, f.power_max)), fear: Math.round(f.fear),
      bandLo: Math.round(f.band[0]), bandHi: Math.round(f.band[1]),
      move: tg ? `${MOVE[tg.cls] || tg.cls} · ${LIMB[tg.limb]}` : ended ? (A.result.outcome === 'sent' ? 'Topped out' : 'On the pads') : 'Start',
      p: f.p == null ? null : Math.round(100 * f.p), margin: f.margin,
      outcome, sent: ended && A.result.outcome === 'sent', fell: ended && A.result.outcome !== 'sent',
      fearSources: f.fear_sources || [],
    };
  }

  return {
    LIMBS, STEP, clamp, lerp, ease, easeOut, mix3, add3, sub3, mul3, norm3, len3, rng, noise2, faceZ, hold, top, TL, sample,
    joint3, body3, views, skeleton, outlineFront, faceSpan, linePath, touched, nearestHold, target, event, timeOf, followY,
    hudOf, fallenPose, toppedPose, clonePose,
  };
}
