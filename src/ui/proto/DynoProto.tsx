// Throwaway dyno prototype (docs/23 §6), opened with #proto-dyno. Flat Dusk look, three-quarter view, Swing and Catch
// controls: drag back anywhere to load, release to launch, tap anywhere to catch. Not part of the game: it exists to
// judge the feel (flight speed, window sizes, how much aim to show) on a phone before the engine changes.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { stream } from '../../sim/rng';
import {
  autoDyno, bestLaunch, comAt, fly, gapAt, judge, launch, MODERATE, reachOf, ROCKET, shoulderAt, vMax,
  type CatchResult, type DynoScene, type DynoStats, type V2,
} from './dyno';

// Virtual canvas (px) and the world-to-screen mapping: 100 px per metre, ground at y = 430.
const W = 390;
const H = 470;
const PX = 100;
const sx = (x: number) => -20 + PX * x;
const sy = (y: number) => 430 - PX * y;
/** Drag length for full power (virtual px). */
const MAX_PULL = 140;
/** How much of the flight the aim preview shows unless the whole arc is switched on (s). */
const AIM_PREVIEW_S = 0.2;

const C = {
  ink: '#1B1B3A', panel: '#26264A', raised: '#2D2D55', text: '#F5F2FF', muted: '#B9B4D6',
  yellow: '#FFE066', teal: '#2EC4B6', tealDark: '#20A396', coral: '#FF8C6B',
  hold: '#FFE8C2', holdShade: '#B8553E', skin: '#F4C095', skinFar: '#E0A97F', pants: '#1B1B3A', pantsFar: '#121230', shoe: '#FFE066', shoeFar: '#E6C84F',
};
const SKY = [['#2B2D42', 0, 80], ['#46385E', 80, 150], ['#7A4B6E', 150, 220], ['#C0607A', 220, 285], ['#F28F6B', 285, 340], ['#F7B267', 340, 470]] as const;

const LAUNCH_HOLDS = { LH: { x: 2.38, y: 1.85 }, RH: { x: 2.52, y: 1.85 } };
const FEET = { LF: { x: 2.75, y: 0.9 }, RF: { x: 2.9, y: 0.7 } };

type Pt = [number, number];
type Limb3 = [Pt, Pt, Pt];
type Pose = { head: V2; sh: V2; hip: V2; lh: V2; rh: V2; lf: V2; rf: V2; cut: boolean };

type Phase =
  | { k: 'ready' }
  | { k: 'aim'; from: Pt; to: Pt }
  | { k: 'fly'; v: V2; t0: number; power: number; angle: number }
  | { k: 'done'; v: V2; tEnd: number; at: number; result: CatchResult; caught: boolean };

interface Try { n: number; power: number; windowMs: number | null; offsetMs: number | null; result: CatchResult }

const add = (a: V2, b: V2, k = 1): V2 => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
const unit = (a: V2): V2 => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };
const rot = (a: V2, deg: number): V2 => { const r = (deg * Math.PI) / 180; return { x: a.x * Math.cos(r) - a.y * Math.sin(r), y: a.x * Math.sin(r) + a.y * Math.cos(r) }; };

/** Pull vector (virtual px, screen axes) to power fraction and launch angle (degrees from +X, Y up). */
function pullToLaunch(from: Pt, to: Pt): { power: number; angle: number } {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  return { power: Math.min(1, Math.hypot(dx, dy) / MAX_PULL), angle: (Math.atan2(dy, -dx) * 180) / Math.PI };
}

/** The pose while loaded on the launch holds; `p` sinks it as the pull grows. */
function loadedPose(p: number): Pose {
  const hip = { x: 2.34, y: 0.92 - 0.1 * p };
  const sh = { x: 2.12, y: 1.5 - 0.08 * p };
  return { hip, sh, head: { x: sh.x - 0.1, y: sh.y + 0.19 }, lh: LAUNCH_HOLDS.LH, rh: LAUNCH_HOLDS.RH, lf: FEET.LF, rf: FEET.RF, cut: false };
}

/** In the air: the body points at the hold, the catching hand reaches for it, the feet hang. */
function flightPose(scene: DynoScene, s: DynoStats, com: V2, t: number): Pose {
  const u = unit(sub(scene.hold, com));
  const sh = add(com, u, scene.shoulder);
  const hip = add(com, u, -0.22);
  const toHold = sub(scene.hold, sh);
  const reach = Math.min(reachOf(scene, s), Math.hypot(toHold.x, toHold.y));
  const sway = 0.05 * Math.sin(t * 9);
  return {
    sh, hip, head: add(add(sh, u, 0.2), rot(u, 90), -0.05),
    rh: add(sh, unit(toHold), reach), lh: add(sh, rot(u, 35), 0.5),
    lf: { x: hip.x + 0.02 + sway, y: hip.y - 0.8 }, rf: { x: hip.x + 0.12 - sway, y: hip.y - 0.78 }, cut: true,
  };
}

/** Hanging from the hold after a catch, both hands on it. */
function hangPose(scene: DynoScene, com: V2): Pose {
  const u = unit(sub(scene.hold, com));
  const sh = add(com, u, scene.shoulder);
  const hip = add(com, u, -0.22);
  return { sh, hip, head: add(add(sh, u, 0.2), rot(u, 90), -0.05), rh: scene.hold, lh: add(scene.hold, { x: 0.08, y: -0.02 }), lf: { x: hip.x + 0.02, y: hip.y - 0.8 }, rf: { x: hip.x + 0.12, y: hip.y - 0.78 }, cut: true };
}

/** Two-bone joint toward `prefer` (screen vector), straight if out of reach. */
function joint(a: Pt, b: Pt, l1: number, l2: number, prefer: Pt): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const d = Math.hypot(dx, dy) || 1;
  if (d >= l1 + l2 - 1e-6) return [a[0] + (dx * l1) / (l1 + l2), a[1] + (dy * l1) / (l1 + l2)];
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const off = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  let nx = -dy / d;
  let ny = dx / d;
  if (nx * prefer[0] + ny * prefer[1] < 0) { nx = -nx; ny = -ny; }
  return [a[0] + (dx / d) * along + nx * off, a[1] + (dy / d) * along + ny * off];
}

function drawScene(ctx: CanvasRenderingContext2D, scene: DynoScene, other: DynoScene) {
  for (const [c, y0, y1] of SKY) { ctx.fillStyle = c; ctx.fillRect(0, y0, W, y1 - y0); }
  const poly = (pts: number[], fill: string) => {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, pts[i]!, pts[i + 1]!);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  ctx.fillStyle = '#FFD08A';
  ctx.beginPath(); ctx.arc(70, 352, 44, 0, Math.PI * 2); ctx.fill();
  poly([0, 382, 60, 334, 130, 372, 200, 324, 280, 366, 390, 314, 390, 470, 0, 470], '#3D3A5C');
  poly([10, 434, 34, 310, 58, 434], '#26263F');
  poly([50, 434, 70, 350, 90, 434], '#26263F');
  ctx.fillStyle = '#2A2A45'; ctx.fillRect(0, 430, W, 40);
  poly([213, 120, 390, 102, 390, 430, 335, 430, 325, 280], '#8E3B46');
  poly([123, 120, 213, 120, 390, 102, 390, 94, 163, 108], '#FFB37A');
  poly([123, 120, 213, 120, 325, 280, 235, 280], '#E58F4E');
  poly([199, 120, 213, 120, 325, 280, 311, 280], '#C8553D');
  poly([235, 280, 325, 280, 335, 430, 245, 430], '#F2A65A');
  poly([315, 280, 325, 280, 335, 430, 325, 430], '#C8553D');
  ctx.strokeStyle = '#FFC48A'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(123, 120); ctx.lineTo(213, 120); ctx.stroke();
  ctx.fillStyle = '#1B998B'; ctx.fillRect(150, 420, 220, 14);
  ctx.fillStyle = '#23B5A5'; ctx.fillRect(150, 420, 220, 5);
  const hold = (p: V2, w: number, h: number) => {
    for (const [fill, dy] of [[C.holdShade, 3], [C.hold, 0]] as const) {
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.roundRect(sx(p.x) - w / 2, sy(p.y) - h / 2 + dy, w, h, Math.min(6, h / 2)); ctx.fill();
    }
  };
  hold(LAUNCH_HOLDS.LH, 8, 20); hold(LAUNCH_HOLDS.RH, 20, 7);
  hold(FEET.LF, 14, 8); hold(FEET.RF, 14, 8);
  hold({ x: 2.2, y: 2.6 }, 14, 7); hold({ x: 2.75, y: 0.35 }, 14, 8);
  hold(other.hold, 30, 13);
  hold(scene.hold, 34, 14);
}

function drawClimber(ctx: CanvasRenderingContext2D, p: Pose) {
  const P = (v: V2): Pt => [sx(v.x), sy(v.y)];
  const sh = P(p.sh);
  const hip = P(p.hip);
  const line = (pts: Pt[], colour: string, width: number) => {
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
    ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  };
  const arm = (end: V2, side: number): Limb3 => { const e = P(end); const s0: Pt = [sh[0] + 4 * side, sh[1]]; return [s0, joint(s0, e, 31, 30, [-0.6 + 0.2 * side, 1]), e]; };
  const leg = (end: V2, side: number): Limb3 => { const e = P(end); const h0: Pt = [hip[0] + 3 * side, hip[1]]; return [h0, joint(h0, e, 43, 42, p.cut ? [1, 0.2] : [1, -0.25 + 0.15 * side]), e]; };
  const lh = arm(p.lh, -1);
  const rh = arm(p.rh, 1);
  const lf = leg(p.lf, -1);
  const rf = leg(p.rf, 1);
  line(lh, C.tealDark, 8); line([lh[1], lh[2]], C.skinFar, 6.5);
  line(lf, C.pantsFar, 10);
  ctx.fillStyle = C.shoeFar; ctx.beginPath(); ctx.ellipse(lf[2][0] + 4, lf[2][1], 8, 4, 0, 0, Math.PI * 2); ctx.fill();
  line([sh, hip], C.teal, 26);
  line([[sh[0] + 8, sh[1] + 2], [hip[0] + 6, hip[1] - 4]], C.tealDark, 8);
  line(rf, C.pants, 10.5);
  ctx.fillStyle = C.shoe; ctx.beginPath(); ctx.ellipse(rf[2][0] + 4, rf[2][1], 9, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  line(rh, C.teal, 8.5); line([rh[1], rh[2]], C.skin, 7);
  ctx.fillStyle = C.skinFar; ctx.beginPath(); ctx.arc(lh[2][0], lh[2][1], 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(rh[2][0], rh[2][1], 5, 0, Math.PI * 2); ctx.fill();
  const head = P(p.head);
  ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(head[0], head[1], 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(head[0] - 3, head[1] - 4, 10, Math.PI * 0.9, Math.PI * 1.9); ctx.fill();
}

const RESULT: Record<CatchResult, { word: string; colour: string; line: string }> = {
  deadpoint: { word: 'DEADPOINT', colour: C.teal, line: 'Caught at the dead point: the cleanest catch.' },
  caught: { word: 'CAUGHT', colour: C.teal, line: 'Caught, but moving fast: it cost grip.' },
  slap: { word: 'SLAP', colour: C.coral, line: 'Touched it, could not hold it: too early, too late or too fast.' },
  missed: { word: 'MISSED', colour: C.coral, line: 'In reach, but no catch in time.' },
  short: { word: 'SHORT', colour: C.coral, line: 'Never got there: more power, or aim higher.' },
};

export function DynoProto() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const phase = useRef<Phase>({ k: 'ready' });
  const raf = useRef(0);
  const [, setTick] = useState(0);
  const rerender = () => setTick((n) => n + 1);
  const [stats, setStats] = useState<DynoStats>({ power: 70, contact: 60, commitment: 65, pump: 10, ape: 1.03 });
  const [rocket, setRocket] = useState(true);
  const [slow, setSlow] = useState(0.6);
  const [fullArc, setFullArc] = useState(false);
  const [log, setLog] = useState<Try[]>([]);
  const scene = rocket ? ROCKET : MODERATE;
  const live = useRef({ stats, scene, slow, fullArc });
  live.current = { stats, scene, slow, fullArc };
  const best = useMemo(() => bestLaunch(scene, stats), [scene, stats]);

  const gameT = (t0: number, now: number) => ((now - t0) / 1000) * live.current.slow;

  const paint = (now: number): boolean => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return false;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = c.clientWidth;
    if (c.width !== Math.round(cw * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(((cw * H) / W) * dpr); }
    ctx.setTransform((dpr * cw) / W, 0, 0, (dpr * cw) / W, 0, 0);
    const { stats: s, scene: sc, fullArc: full } = live.current;
    drawScene(ctx, sc, sc === ROCKET ? MODERATE : ROCKET);
    const ph = phase.current;
    let running = false;
    // Reach zone: the shoulder has to come inside this circle for the hand to reach the hold.
    const reachZone = (alpha: number) => {
      ctx.save(); ctx.globalAlpha = alpha; ctx.setLineDash([5, 5]); ctx.strokeStyle = C.teal; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx(sc.hold.x), sy(sc.hold.y), reachOf(sc, s) * PX, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    };
    if (ph.k === 'ready' || ph.k === 'aim') {
      const pull = ph.k === 'aim' ? pullToLaunch(ph.from, ph.to) : null;
      drawClimber(ctx, loadedPose(pull?.power ?? 0));
      reachZone(0.6);
      ctx.strokeStyle = C.yellow; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(sx(sc.hold.x), sy(sc.hold.y), 22, 0, Math.PI * 2); ctx.stroke();
      if (ph.k === 'aim' && pull) {
        const v = launch(s, pull.power, pull.angle);
        // By default only the start of the arc shows: aiming the rest is the skill.
        const end = full ? 0.9 : AIM_PREVIEW_S;
        ctx.save(); ctx.setLineDash([2, 8]); ctx.lineCap = 'round'; ctx.strokeStyle = C.yellow; ctx.lineWidth = 4;
        ctx.beginPath();
        for (let t = 0; t <= end; t += 0.01) { const q = shoulderAt(sc, v, t); (t ? ctx.lineTo : ctx.moveTo).call(ctx, sx(q.x), sy(q.y)); }
        ctx.stroke(); ctx.restore();
        // The pull itself, drawn from the hands like a slingshot.
        const hands: Pt = [sx(2.45), sy(1.85)];
        const k = Math.min(1, Math.hypot(ph.to[0] - ph.from[0], ph.to[1] - ph.from[1]) / MAX_PULL) * 70;
        const a = Math.atan2(ph.to[1] - ph.from[1], ph.to[0] - ph.from[0]);
        const thumb: Pt = [hands[0] + Math.cos(a) * k, hands[1] + Math.sin(a) * k];
        ctx.strokeStyle = C.yellow; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hands[0], hands[1]); ctx.lineTo(thumb[0], thumb[1]); ctx.stroke();
        ctx.fillStyle = C.yellow; ctx.beginPath(); ctx.arc(thumb[0], thumb[1], 10, 0, Math.PI * 2); ctx.fill();
      }
    } else if (ph.k === 'fly') {
      const t = gameT(ph.t0, now);
      const f = fly(sc, s, ph.v);
      const end = f.window ? f.window[1] + 0.06 : null;
      // No catch in time: the flight ends on its own.
      if ((end !== null && t > end) || (!f.window && (t > 0.9 || comAt(sc, ph.v, t).y < 0.5))) {
        finish(ph, t, null);
        return false;
      }
      drawClimber(ctx, flightPose(sc, s, comAt(sc, ph.v, t), t));
      reachZone(0.35);
      const g = gapAt(sc, s, ph.v, t);
      const hx = sx(sc.hold.x);
      const hy = sy(sc.hold.y);
      ctx.fillStyle = 'rgba(46, 196, 182, 0.25)'; ctx.beginPath(); ctx.arc(hx, hy, 16, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.teal; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(hx, hy, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = C.yellow; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(hx, hy, 16 + Math.max(0, g) * PX, 0, Math.PI * 2); ctx.stroke();
      running = true;
    } else {
      const tt = gameT(ph.at, now);
      if (ph.caught) {
        const c0 = comAt(sc, ph.v, ph.tEnd);
        const hang = { x: sc.hold.x + 0.12, y: sc.hold.y - 1.05 };
        const e = Math.exp(-3 * tt);
        drawClimber(ctx, hangPose(sc, { x: hang.x + (c0.x - hang.x) * e * Math.cos(7 * tt), y: hang.y + (c0.y - hang.y) * Math.exp(-4 * tt) }));
        running = tt < 1.5;
      } else {
        const t = ph.tEnd + tt;
        const com = comAt(sc, ph.v, t);
        const landed = com.y <= 0.55;
        const at = landed ? { x: com.x, y: 0.55 } : com;
        drawClimber(ctx, landed ? { ...flightPose(sc, s, at, t), lh: { x: at.x - 0.2, y: 0.9 }, rh: { x: at.x + 0.15, y: 0.9 }, lf: { x: at.x - 0.15, y: 0.08 }, rf: { x: at.x + 0.15, y: 0.08 } } : flightPose(sc, s, com, t));
        running = !landed;
      }
      const r = RESULT[ph.result];
      ctx.font = '800 34px Archivo, "Barlow Condensed", sans-serif';
      ctx.textAlign = 'center'; ctx.lineWidth = 6; ctx.strokeStyle = C.ink;
      ctx.strokeText(r.word, W / 2, 70); ctx.fillStyle = r.colour; ctx.fillText(r.word, W / 2, 70);
    }
    return running;
  };

  const loop = () => {
    cancelAnimationFrame(raf.current);
    const tick = (now: number) => { if (paint(now)) raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
  };

  const finish = (ph: Extract<Phase, { k: 'fly' }>, t: number, tap: number | null) => {
    const { scene: sc, stats: s } = live.current;
    const j = judge(sc, s, ph.v, tap);
    const caught = j.result === 'deadpoint' || j.result === 'caught';
    phase.current = { k: 'done', v: ph.v, tEnd: tap ?? t, at: performance.now(), result: j.result, caught };
    if (caught) navigator.vibrate?.(25);
    const w = j.flight.window;
    setLog((l) => [{ n: (l[0]?.n ?? 0) + 1, power: ph.power, windowMs: w ? Math.round((w[1] - w[0]) * 1000) : null, offsetMs: tap !== null && j.flight.slowest !== null ? Math.round((tap - j.flight.slowest) * 1000) : null, result: j.result }, ...l].slice(0, 8));
    rerender();
    loop();
  };

  const start = (power: number, angle: number) => {
    phase.current = { k: 'fly', v: launch(live.current.stats, power, angle), t0: performance.now(), power, angle };
    navigator.vibrate?.(15);
    rerender();
    loop();
  };

  const local = (e: PointerEvent): Pt => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * W) / r.width];
  };
  const onDown = (e: PointerEvent) => {
    const ph = phase.current;
    if (ph.k === 'fly') { finish(ph, gameT(ph.t0, performance.now()), gameT(ph.t0, performance.now())); return; }
    if (ph.k !== 'ready' || !canvas.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = local(e);
    phase.current = { k: 'aim', from: p, to: p };
    rerender();
    loop();
  };
  const onMove = (e: PointerEvent) => {
    const ph = phase.current;
    if (ph.k !== 'aim') return;
    phase.current = { ...ph, to: local(e) };
    rerender();
    paint(performance.now());
  };
  const onUp = () => {
    const ph = phase.current;
    if (ph.k !== 'aim') return;
    const { power, angle } = pullToLaunch(ph.from, ph.to);
    if (power < 0.08) { phase.current = { k: 'ready' }; rerender(); loop(); return; }
    start(power, angle);
  };

  const again = () => { phase.current = { k: 'ready' }; rerender(); loop(); };
  const auto = () => {
    const a = autoDyno(live.current.scene, live.current.stats, stream('proto-dyno', log.length, live.current.stats.power), best);
    start(a.power, a.angle);
    if (a.tap !== null) {
      const t0 = (phase.current as Extract<Phase, { k: 'fly' }>).t0;
      const wait = (a.tap / live.current.slow) * 1000;
      window.setTimeout(() => { const ph = phase.current; if (ph.k === 'fly' && ph.t0 === t0) finish(ph, a.tap!, a.tap); }, wait);
    }
  };

  useEffect(() => {
    const onResize = () => paint(performance.now());
    window.addEventListener('resize', onResize);
    loop();
    return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(raf.current); };
  }, []);
  useEffect(() => { loop(); }, [stats, rocket, fullArc]);

  const ph = phase.current;
  const aim = ph.k === 'aim' ? pullToLaunch(ph.from, ph.to) : null;
  const last = log[0];
  const hint = ph.k === 'ready' ? 'Drag back anywhere on the wall to load, then let go.'
    : ph.k === 'aim' ? 'Let go to launch. Aim the dotted line into the dashed circle.'
      : ph.k === 'fly' ? 'Tap anywhere as the yellow ring meets the teal one.'
        : RESULT[ph.result].line;
  const slider = (label: string, key: keyof DynoStats, min: number, max: number, step = 1, scale = 1) => (
    <label style={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr) 40px', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
      <span style={{ color: C.muted }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={stats[key] * scale} style={{ accentColor: C.teal }}
        onInput={(e) => setStats({ ...stats, [key]: Number((e.target as HTMLInputElement).value) / scale })} />
      <span style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{(stats[key] * scale).toFixed(0)}</span>
    </label>
  );

  return (
    <div data-proto="dyno" style={{ minHeight: '100vh', background: C.ink, color: C.text, fontFamily: 'var(--font)', maxWidth: '480px', margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
        <div>
          <div style={{ fontFamily: 'var(--cond)', fontWeight: 700, fontSize: '22px', letterSpacing: '0.02em' }}>{rocket ? 'RAINBOW ROCKET' : 'MODERATE DYNO'} {rocket && <span style={{ color: C.coral }}>8A</span>}</div>
          <div style={{ fontSize: '12px', color: C.muted }}><span style={{ background: C.coral, color: C.ink, borderRadius: '6px', padding: '1px 7px', fontWeight: 800, fontSize: '10.5px', letterSpacing: '0.08em', marginRight: '8px' }}>DYNO PROTOTYPE</span>Swing and Catch</div>
        </div>
        <a href="#" onClick={() => { location.hash = ''; location.reload(); }} style={{ color: C.muted, fontSize: '13px' }}>Back to the game</a>
      </div>
      <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} style={{ touchAction: 'none', userSelect: 'none' }}>
        <canvas ref={canvas} role="img" aria-label="Dyno prototype wall" style={{ width: '100%', aspectRatio: `${W} / ${H}`, display: 'block' }} />
        <div style={{ padding: '10px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
          <Stat label="POWER" value={aim ? `${Math.round(aim.power * 100)}%` : ph.k === 'fly' ? `${Math.round(ph.power * 100)}%` : last ? `${Math.round(last.power * 100)}%` : '—'} colour={C.coral} />
          <Stat label="GOOD LAUNCH" value={best ? `${Math.round(best.power * 100)}%` : 'out of reach'} />
          <Stat label="WINDOW" value={last?.windowMs != null ? `${last.windowMs} ms` : '—'} colour={C.teal} />
          <Stat label="VS DEAD POINT" value={last?.offsetMs != null ? `${last.offsetMs > 0 ? '+' : ''}${last.offsetMs} ms` : '—'} />
        </div>
        <div style={{ padding: '10px 16px 0', minHeight: '40px', fontSize: '14px', lineHeight: 1.4 }}>{hint}</div>
        {ph.k === 'fly' && <div style={{ margin: '8px 16px 0', height: '96px', borderRadius: '24px', background: C.yellow, color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '32px', letterSpacing: '0.06em' }}>CATCH</div>}
      </div>
      {ph.k !== 'fly' && (
        <div style={{ display: 'flex', gap: '10px', padding: '10px 16px 0' }}>
          <button onClick={again} disabled={ph.k !== 'done'} style={btn(ph.k === 'done' ? C.yellow : C.raised, ph.k === 'done' ? C.ink : C.muted)}>AGAIN</button>
          <button onClick={auto} disabled={ph.k === 'aim' || !best} style={btn(C.raised, C.text)}>AUTO</button>
        </div>
      )}
      <details style={{ margin: '14px 16px 0', background: C.panel, borderRadius: '14px', padding: '10px 12px' }}>
        <summary style={{ fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>Tuning</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
          <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px' }}>
            <input type="checkbox" checked={rocket} onChange={() => { setRocket(!rocket); again(); }} style={{ width: '20px', height: '20px', accentColor: C.teal }} />Rainbow Rocket (off: the moderate dyno)
          </label>
          {slider('Power', 'power', 0, 100)}
          {slider('Contact', 'contact', 0, 100)}
          {slider('Commitment', 'commitment', 0, 100)}
          {slider('Pump', 'pump', 0, 100)}
          {slider('Ape × 100', 'ape', 94, 110, 1, 100)}
          <label style={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr) 40px', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <span style={{ color: C.muted }}>Speed</span>
            <input type="range" min={30} max={100} value={slow * 100} style={{ accentColor: C.teal }} onInput={(e) => setSlow(Number((e.target as HTMLInputElement).value) / 100)} />
            <span style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{Math.round(slow * 100)}%</span>
          </label>
          <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px' }}>
            <input type="checkbox" checked={fullArc} onChange={() => setFullArc(!fullArc)} style={{ width: '20px', height: '20px', accentColor: C.teal }} />Show the whole arc while aiming
          </label>
          <div style={{ fontSize: '12px', color: C.muted }}>Top launch speed {vMax(stats).toFixed(2)} m/s. Windows are in game time; at {Math.round(slow * 100)}% speed they last {Math.round(100 / slow)}% as long on screen.</div>
        </div>
      </details>
      <div style={{ margin: '12px 16px 24px', fontSize: '13px' }}>
        <div style={{ color: C.muted, fontWeight: 700, letterSpacing: '0.06em', fontSize: '11px', marginBottom: '6px' }}>LAST TRIES</div>
        {log.length === 0 ? <div style={{ color: C.muted }}>None yet.</div> : log.map((l) => (
          <div key={l.n} style={{ display: 'grid', gridTemplateColumns: '28px 52px 70px 70px minmax(0, 1fr)', gap: '6px', fontFamily: 'var(--mono)', padding: '3px 0' }}>
            <span style={{ color: C.muted }}>{l.n}</span><span>{Math.round(l.power * 100)}%</span><span>{l.windowMs ?? '—'} ms</span>
            <span>{l.offsetMs != null ? `${l.offsetMs > 0 ? '+' : ''}${l.offsetMs}` : '—'}</span><span style={{ color: RESULT[l.result].colour }}>{RESULT[l.result].word.toLowerCase()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat(props: { label: string; value: string; colour?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
      <span style={{ fontWeight: 800, fontSize: '17px', color: props.colour ?? C.text, whiteSpace: 'nowrap' }}>{props.value}</span>
      <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', color: C.muted }}>{props.label}</span>
    </div>
  );
}

const btn = (bg: string, fg: string) => ({ flexGrow: 1, height: '50px', borderRadius: '16px', border: 'none', background: bg, color: fg, fontWeight: 800, fontSize: '15px', letterSpacing: '0.06em', fontFamily: 'var(--font)' });
