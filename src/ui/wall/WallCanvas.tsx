import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { ReachPerf } from '../../sim/reach';
import { fly, gapAt, launchVelocity, SLAP_MS, type SPt, type SwingPerf, type SwingSetup } from '../../sim/swing';
import type { Limb } from '../../sim/types';
import { otherHand } from '../../sim/wall';
import { C, drawWall, hitHold, type FrameExtras, type Layout, type WallView } from './render';
import {
  drop, ease, fallenPose, flightPose, frameFor, lerpPose, loadedPose, poseOf, project, projectS, reachingPose, toppedPose, toScreen, wallBounds,
  ZOOM_RANGE, type Cam, type MotionStyle, type P, type Pose,
} from './pose';

/** How the attempt ends, for the last animation before the result screen. */
export type Ending = 'fall' | 'send' | 'off' | null;

/** What a tap hit: the nearest hold, and a limb end if the tap was on the figure's hand or foot. */
export interface WallTap { hold: string | null; limb: Limb | null }

export interface WallMotion {
  /** Changes on every resolved step (the attempt's wall time), so a slip that does not move the body still shows. */
  step: number;
  style: MotionStyle;
  shake: boolean;
}

/**
 * Swing and Catch on a pending dyno (docs/23 §2.3): drag back anywhere to load, let go to launch, tap to catch.
 * `rate` is the playback speed (game seconds per screen second); the catch time reported is in game time.
 */
export interface SwingInput {
  setup: SwingSetup;
  limb: Limb;
  rate: number;
  haptics: boolean;
  /** The pull while aiming (0–1), or null; `flying` once launched. */
  onAim: (power: number | null, flying: boolean) => void;
  onDone: (perf: SwingPerf) => void;
}

/**
 * Two-Thumb Grip on a Reach move (docs/23 §2.1): drag anywhere and the moving limb follows by the same amount; let go
 * over the ring to place it. In two-thumb mode the holding hand's pad must be held for the drag to start and to last.
 */
export interface ReachInput {
  limb: Limb;
  hold: string;
  /** Grip budget (ms) on a hand move, null on a foot move (no clock: both hands hold). */
  budget: number | null;
  /** Time already spent off the hold on earlier tries at this move (ms). */
  spent: number;
  /** The hand whose pad must be held (two-thumb mode), or null. */
  grip: Limb | null;
  gripHeld: () => boolean;
  haptics: boolean;
  onNeedGrip: () => void;
  /** Let go away from the ring, or the grip pad was released: the limb goes back. */
  onMiss: (spent_ms: number) => void;
  onDone: (perf: ReachPerf) => void;
}

/** The placement ring's radius on screen (px); a release up to `SNAP` rings out still lands, on the edge. (tune) */
export const PLACE_RING_PX = 24;
const SNAP = 1.5;

type ReachDrag = { id: number; down: [number, number]; t0: number; hand0: [number, number]; at: [number, number]; cam: Cam; warned: boolean };

/** Drag length for a full pull, as a share of the shorter canvas side. */
const PULL_SHARE = 0.38;
/** How much of the flight the aim preview shows (s). (tune, docs/23 open questions) */
const AIM_PREVIEW_S = 0.2;

type SwingPhase =
  | { k: 'ready' }
  | { k: 'aim'; from: [number, number]; to: [number, number] }
  | { k: 'fly'; power: number; angle: number; v: SPt; t0: number; end: number }
  | { k: 'done' };

/** 17 §2: a move animates in 250 ms; a dynamic move gets longer so the launch reads. */
export const MOVE_MS = 250;
const DYNAMIC_MS = 420;
const SHAKE_MS = 320;
export const ENDING_MS = 700;

interface Anim { from: Pose; to: Pose; t0: number; dur: number; style: MotionStyle; shake: number; panFrom: P }

/**
 * The wall. Poses animate between states; the camera follows the climber and can be pinched (0.6–2.5×), dragged
 * and double-tapped back to the climber (17 §2). Taps resolve on release, so a drag never picks a hold.
 */
export function WallCanvas(props: {
  view: WallView; onTap: (t: WallTap) => void; label: string; motion: WallMotion; ending: Ending; reduceMotion: boolean;
  swing?: SwingInput | null; reach?: ReachInput | null; children?: ComponentChildren;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layout = useRef<Layout | null>(null);
  const view = useRef(props.view);
  view.current = props.view;
  const shown = useRef<Pose | null>(null);
  const anim = useRef<Anim | null>(null);
  const ending = useRef<{ kind: Exclude<Ending, null>; from: Pose; t0: number } | null>(null);
  const raf = useRef(0);
  const zoom = useRef(1);
  const pan = useRef<P>([0, 0]);
  const lastStep = useRef(props.motion.step);
  const lastKey = useRef('');
  const reduce = useRef(props.reduceMotion);
  reduce.current = props.reduceMotion;
  const swing = useRef<SwingInput | null>(props.swing ?? null);
  swing.current = props.swing ?? null;
  const sw = useRef<SwingPhase>({ k: 'ready' });
  /** The last pose in the air, held until the engine's verdict arrives, and a flag so that verdict does not hop again. */
  const flightLast = useRef<Pose | null>(null);
  const swung = useRef(false);
  const reach = useRef<ReachInput | null>(props.reach ?? null);
  reach.current = props.swing ? null : props.reach ?? null;
  const rd = useRef<ReachDrag | null>(null);
  const camNow = useRef<Cam | null>(null);
  /** The limb's last place in a landed reach, held until the engine's verdict moves the figure (or briefly, if none comes). */
  const placed = useRef<{ pose: Pose; until: number } | null>(null);

  /** Pull vector (CSS px) to power and launch angle: pulling down launches up the rock, pulling left launches right. */
  const pullOf = (ph: Extract<SwingPhase, { k: 'aim' }>) => {
    const w = wrap.current;
    const full = PULL_SHARE * Math.min(w?.clientWidth ?? 390, w?.clientHeight ?? 460);
    const dx = ph.to[0] - ph.from[0];
    const dy = ph.to[1] - ph.from[1];
    return { power: Math.min(1, Math.hypot(dx, dy) / full), angle: (Math.atan2(dy, -dx) * 180) / Math.PI };
  };

  const paint = (now = performance.now()) => {
    const c = canvas.current;
    const w = wrap.current;
    if (!c || !w) return false;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = w.clientWidth;
    const ch = w.clientHeight;
    if (cw === 0 || ch === 0) return false;
    if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) {
      c.width = Math.round(cw * dpr);
      c.height = Math.round(ch * dpr);
    }
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const v = view.current;
    const target = poseOf(v.geom, v.ath, v.climb);
    let pose = target;
    let running = false;
    const swi = swing.current;
    const ph = sw.current;
    if (swi && ph.k === 'aim') pose = loadedPose(target, pullOf(ph).power);
    if (swi && ph.k === 'fly') {
      const t = ((now - ph.t0) / 1000) * swi.rate;
      // No grab in time: the flight ends on its own and the engine judges it a miss.
      if (t > ph.end) { finishSwing(ph, null); return false; }
      pose = flightPose(v.geom.route.wall, swi.setup, ph.v, t, swi.limb, target);
      flightLast.current = pose;
      running = true;
    }
    if (swi && ph.k === 'done' && flightLast.current) pose = flightLast.current;
    const ri = reach.current;
    const drag = rd.current;
    if (ri && drag) {
      // The grip pad let go mid-reach: the limb goes back (two-thumb mode).
      if (ri.grip && !ri.gripHeld()) { missReach(now); return false; }
      const holdG = v.geom.holds.get(ri.hold);
      const holdP = holdG ? project(v.geom.route.wall, holdG.x, holdG.y) : target.ends[ri.limb];
      const end: P = [drag.cam.cx + (drag.at[0] - cw / 2) / drag.cam.scale, drag.cam.cy - (drag.at[1] - ch / 2) / drag.cam.scale];
      pose = reachingPose(target, ri.limb, end, holdP);
      const spent = ri.spent + (now - drag.t0);
      if (ri.budget && !drag.warned && spent > ri.budget) { drag.warned = true; if (ri.haptics) navigator.vibrate?.(30); }
      running = true;
    } else if (placed.current) {
      if (now < placed.current.until) pose = placed.current.pose;
      else placed.current = null;
    }
    let banner: FrameExtras['banner'];
    const a = anim.current;
    if (a) {
      const t = Math.min(1, (now - a.t0) / a.dur);
      pose = lerpPose(a.from, a.to, t, a.style);
      if (a.shake > 0) {
        const j = 0.035 * Math.sin(t * Math.PI * 7) * (1 - t);
        pose = { ...pose, sh: [pose.sh[0] + j, pose.sh[1]], hip: [pose.hip[0] + j, pose.hip[1]] };
      }
      pan.current = [a.panFrom[0] * (1 - t), a.panFrom[1] * (1 - t)];
      if (t >= 1) anim.current = null; else running = true;
    }
    const e = ending.current;
    if (e) {
      const t = Math.min(1, (now - e.t0) / ENDING_MS);
      const top = v.geom.route.wall[v.geom.route.wall.length - 1]!.y1;
      const to = e.kind === 'send' ? toppedPose(e.from, top) : fallenPose(e.from);
      // Falls accelerate; a top-out eases. The word goes where the body is not: below a top-out, above a fall.
      pose = lerpPose(e.from, to, t, {}, e.kind === 'send' ? ease : drop);
      banner = e.kind === 'send' ? { text: 'SENT', colour: C.safe, alpha: Math.min(1, t * 2), y: 0.78 }
        : { text: e.kind === 'off' ? 'OFF' : 'FELL', colour: C.danger, alpha: Math.min(1, t * 2), y: 0.2 };
      running = running || t < 1;
    }
    shown.current = pose;
    // The camera holds still while a limb is dragged, so the rock does not move under the thumb.
    const cam = drag ? drag.cam : frameFor(pose, cw, ch, wallBounds(v.geom), zoom.current, pan.current);
    camNow.current = cam;
    // Mid-drag, only the chosen hold keeps its ring.
    const shownView = ri && drag ? { ...v, targets: new Map([...v.targets].filter(([id]) => id === ri.hold)) } : v;
    layout.current = drawWall(ctx, cw, ch, shownView, pose, cam, { envelope: !a && !e && !(swi && ph.k !== 'ready') && !drag, banner });
    // Dev-only: where holds and limbs are on screen, for browser tests.
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__cwtWall = layout.current;
    if (swi) drawSwing(ctx, cw, ch, cam, now);
    else if (ri && !e) drawReach(ctx, cw, ch, cam, now);
    return running;
  };

  /** The placement ring on the target and, on a hand move, the grip budget draining round the holding hand. */
  const drawReach = (ctx: CanvasRenderingContext2D, cw: number, ch: number, cam: Cam, now: number) => {
    const ri = reach.current!;
    const v = view.current;
    const drag = rd.current;
    const S = toScreen(cam, cw, ch);
    const h = v.geom.holds.get(ri.hold);
    if (!h) return;
    const [hx, hy] = S(...project(v.geom.route.wall, h.x, h.y));
    const d = drag ? Math.hypot(drag.at[0] - hx, drag.at[1] - hy) : Infinity;
    ctx.save();
    if (d <= PLACE_RING_PX) { ctx.fillStyle = 'rgba(46, 196, 182, 0.35)'; ctx.beginPath(); ctx.arc(hx, hy, PLACE_RING_PX, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = C.target;
    ctx.lineWidth = 3;
    if (d > SNAP * PLACE_RING_PX) ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.arc(hx, hy, PLACE_RING_PX, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.target;
    ctx.beginPath(); ctx.arc(hx, hy, 3.5, 0, Math.PI * 2); ctx.fill();
    const holder = ri.budget ? otherHand(ri.limb) : null;
    const end = holder && v.climb.anchors[holder] ? layout.current?.limbs.find((l) => l.limb === holder) : undefined;
    if (end && ri.budget) {
      const used = (ri.spent + (drag ? now - drag.t0 : 0)) / ri.budget;
      const r = 15;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(27, 27, 58, 0.55)';
      ctx.beginPath(); ctx.arc(end.px, end.py, r, 0, Math.PI * 2); ctx.stroke();
      // Teal drains clockwise from the top while there is grip left; past it, coral fills toward letting go.
      const a0 = -Math.PI / 2;
      ctx.strokeStyle = used <= 1 ? C.safe : C.danger;
      const frac = used <= 1 ? 1 - used : Math.min(1, used - 1);
      if (frac > 0.005) { ctx.beginPath(); ctx.arc(end.px, end.py, r, a0, a0 + frac * Math.PI * 2); ctx.stroke(); }
    }
    ctx.restore();
  };

  const startReach = (id: number, down: [number, number], t0: number): boolean => {
    const ri = reach.current;
    const cam = camNow.current;
    const hand = layout.current?.limbs.find((l) => l.limb === ri?.limb);
    if (!ri || !cam || !hand) return false;
    if (ri.grip && !ri.gripHeld()) { ri.onNeedGrip(); return false; }
    placed.current = null;
    rd.current = { id, down, t0, hand0: [hand.px, hand.py], at: [hand.px, hand.py], cam, warned: false };
    loop();
    return true;
  };

  /** Let go away from the ring (or lost the grip pad): the limb goes back and the time spent is kept. */
  const missReach = (now: number) => {
    const ri = reach.current;
    const drag = rd.current;
    rd.current = null;
    if (!ri || !drag) return;
    if (shown.current) {
      const back = poseOf(view.current.geom, view.current.ath, view.current.climb);
      anim.current = { from: shown.current, to: back, t0: now, dur: MOVE_MS, style: {}, shake: 0, panFrom: pan.current };
      loop();
    }
    ri.onMiss(Math.round(ri.spent + (now - drag.t0)));
  };

  const endReach = (now: number) => {
    const ri = reach.current;
    const drag = rd.current;
    const cam = camNow.current;
    if (!ri || !drag || !cam || !wrap.current) { rd.current = null; return; }
    const h = view.current.geom.holds.get(ri.hold);
    const [hx, hy] = h ? toScreen(cam, wrap.current.clientWidth, wrap.current.clientHeight)(...project(view.current.geom.route.wall, h.x, h.y)) : [Infinity, Infinity];
    const d = Math.hypot(drag.at[0] - hx, drag.at[1] - hy);
    if (d > SNAP * PLACE_RING_PX) { missReach(now); return; }
    rd.current = null;
    if (shown.current) placed.current = { pose: shown.current, until: now + 1200 };
    setTimeout(() => paint(), 1250);
    swung.current = true;
    if (ri.haptics) navigator.vibrate?.(15);
    ri.onDone({ kind: 'reach', time_ms: Math.round(ri.spent + (now - drag.t0)), place: Math.round(1000 * Math.min(1, d / PLACE_RING_PX)) / 1000 });
  };

  /** The aim preview (the start of the hand's path) and, in flight, the rings closing on the hold. */
  const drawSwing = (ctx: CanvasRenderingContext2D, cw: number, ch: number, cam: ReturnType<typeof frameFor>, now: number) => {
    const swi = swing.current!;
    const ph = sw.current;
    const wall = view.current.geom.route.wall;
    const S = toScreen(cam, cw, ch);
    const st = swi.setup;
    const [hx, hy] = S(...projectS(wall, st.hold.x, st.hold.s));
    const handAt = (vv: SPt, t: number): P => {
      const c = { x: st.com0.x + vv.x * t, s: st.com0.s + vv.s * t - 4.905 * t * t };
      const dx = st.hold.x - c.x;
      const ds = st.hold.s - c.s;
      const d = Math.hypot(dx, ds) || 1;
      const r = Math.min(st.shoulder + st.reach, d);
      return projectS(wall, c.x + (dx / d) * r, c.s + (ds / d) * r);
    };
    if (ph.k === 'ready' || ph.k === 'aim') {
      ctx.strokeStyle = C.target;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(hx, hy, 20, 0, Math.PI * 2); ctx.stroke();
    }
    if (ph.k === 'aim') {
      const { power, angle } = pullOf(ph);
      const vv = launchVelocity(st, power, angle);
      ctx.save();
      ctx.setLineDash([2, 8]); ctx.lineCap = 'round'; ctx.strokeStyle = C.target; ctx.lineWidth = 4;
      ctx.beginPath();
      for (let t = 0; t <= AIM_PREVIEW_S + 1e-9; t += 0.01) { const [x, y] = S(...handAt(vv, t)); if (t) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
      ctx.restore();
      // The pull itself, like a slingshot from where the thumb went down.
      ctx.strokeStyle = 'rgba(255, 224, 102, 0.7)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ph.from[0], ph.from[1]); ctx.lineTo(ph.to[0], ph.to[1]); ctx.stroke();
      ctx.fillStyle = C.target; ctx.beginPath(); ctx.arc(ph.to[0], ph.to[1], 12, 0, Math.PI * 2); ctx.fill();
    }
    if (ph.k === 'fly') {
      const t = ((now - ph.t0) / 1000) * swi.rate;
      const g = gapAt(st, ph.v, t);
      ctx.fillStyle = 'rgba(46, 196, 182, 0.25)';
      ctx.beginPath(); ctx.arc(hx, hy, 16, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.safe; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(hx, hy, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = C.target; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(hx, hy, 16 + Math.max(0, g) * cam.scale, 0, Math.PI * 2); ctx.stroke();
    }
  };

  const finishSwing = (ph: Extract<SwingPhase, { k: 'fly' }>, catchS: number | null) => {
    const swi = swing.current;
    sw.current = { k: 'done' };
    swung.current = true;
    if (!swi) return;
    if (catchS !== null && swi.haptics) navigator.vibrate?.(25);
    swi.onDone({ power: ph.power, angle_deg: ph.angle, catch_ms: catchS === null ? null : Math.round(catchS * 1000) });
  };

  const launchSwing = (power: number, angle: number) => {
    const swi = swing.current!;
    const vv = launchVelocity(swi.setup, power, angle);
    const f = fly(swi.setup, vv);
    // Watch the flight until it leaves reach (plus the slap margin), or for a short hop if it never gets there.
    const end = f.window ? f.window[1] + SLAP_MS / 1000 : Math.max(0.35, (vv.s / 9.81) * 1.6);
    sw.current = { k: 'fly', power, angle, v: vv, t0: performance.now(), end };
    if (swi.haptics) navigator.vibrate?.(15);
    swi.onAim(null, true);
    loop();
  };

  const loop = () => {
    cancelAnimationFrame(raf.current);
    const tick = (now: number) => { if (paint(now)) raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    const ro = new ResizeObserver(() => paint());
    if (wrap.current) ro.observe(wrap.current);
    return () => { ro.disconnect(); cancelAnimationFrame(raf.current); };
  }, []);

  // A new state animates from what is on screen now; a slip that keeps the body in place still shakes it.
  useEffect(() => {
    const v = props.view;
    const key = JSON.stringify(v.climb);
    const target = poseOf(v.geom, v.ath, v.climb);
    const stepped = props.motion.step !== lastStep.current;
    lastStep.current = props.motion.step;
    const moved = lastKey.current !== '' && key !== lastKey.current;
    lastKey.current = key;
    // A move that was just swung or dragged is already there: settle onto the hold without another hop.
    const afterSwing = swung.current && (moved || stepped);
    if (afterSwing) swung.current = false;
    if (moved || stepped) placed.current = null;
    if (!reduce.current && shown.current && (moved || (stepped && props.motion.shake))) {
      const dynamic = !afterSwing && (props.motion.style.cls === 'dyno' || props.motion.style.cls === 'deadpoint');
      anim.current = {
        from: shown.current, to: target, t0: performance.now(), dur: moved ? (dynamic ? DYNAMIC_MS : MOVE_MS) : SHAKE_MS,
        style: moved && !afterSwing ? props.motion.style : {}, shake: props.motion.shake ? 1 : 0, panFrom: pan.current,
      };
      loop();
    } else {
      if (moved) pan.current = [0, 0];
      paint();
    }
  });

  // A new dyno to swing: start from the loaded pose.
  useEffect(() => { sw.current = { k: 'ready' }; flightLast.current = null; paint(); }, [props.swing?.setup]);

  useEffect(() => {
    if (props.ending && shown.current && !reduce.current) {
      ending.current = { kind: props.ending, from: shown.current, t0: performance.now() };
      loop();
    }
  }, [props.ending]);

  // Gestures: one finger taps or drags, two fingers pinch; double-tap recentres.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x0: number; y0: number; t0: number; moved: boolean; pan0: P; zoom0: number; d0: number; mid0: [number, number] } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const local = (e: PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const spread = () => {
    const ps = [...pointers.current.values()];
    return { d: Math.hypot(ps[0]!.x - ps[1]!.x, ps[0]!.y - ps[1]!.y), mid: [(ps[0]!.x + ps[1]!.x) / 2, (ps[0]!.y + ps[1]!.y) / 2] as [number, number] };
  };
  const onDown = (e: PointerEvent) => {
    const swi = swing.current;
    if (swi) {
      const ph = sw.current;
      if (ph.k === 'fly') { finishSwing(ph, ((performance.now() - ph.t0) / 1000) * swi.rate); return; }
      if (ph.k !== 'ready') return;
      canvas.current?.setPointerCapture?.(e.pointerId);
      const p = local(e);
      sw.current = { k: 'aim', from: p, to: p };
      return;
    }
    if (rd.current) return;
    const [x, y] = local(e);
    canvas.current?.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x, y });
    const two = pointers.current.size === 2 ? spread() : null;
    gesture.current = { x0: x, y0: y, t0: performance.now(), moved: !!two || (gesture.current?.moved ?? false), pan0: [...pan.current], zoom0: zoom.current, d0: two?.d ?? 0, mid0: two?.mid ?? [x, y] };
  };
  const onMove = (e: PointerEvent) => {
    const swi = swing.current;
    if (swi) {
      const ph = sw.current;
      if (ph.k !== 'aim') return;
      const next = { ...ph, to: local(e) };
      sw.current = next;
      swi.onAim(pullOf(next).power, false);
      paint();
      return;
    }
    const drag = rd.current;
    if (drag) {
      if (e.pointerId !== drag.id) return;
      const [x, y] = local(e);
      drag.at = [drag.hand0[0] + x - drag.down[0], drag.hand0[1] + y - drag.down[1]];
      return;
    }
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    const [x, y] = local(e);
    pointers.current.set(e.pointerId, { x, y });
    // With a Reach move armed, one finger dragging moves the limb instead of the camera.
    if (reach.current && pointers.current.size === 1 && !g.moved && Math.hypot(x - g.x0, y - g.y0) >= 8) {
      g.moved = true;
      if (startReach(e.pointerId, [g.x0, g.y0], g.t0)) {
        pointers.current.clear();
        gesture.current = null;
        rd.current!.at = [rd.current!.hand0[0] + x - g.x0, rd.current!.hand0[1] + y - g.y0];
      }
      return;
    }
    if (reach.current && pointers.current.size === 1 && g.moved && g.d0 === 0) return;
    const scale = layout.current?.scale ?? 100;
    if (pointers.current.size >= 2 && g.d0 > 0) {
      const { d, mid } = spread();
      zoom.current = Math.min(ZOOM_RANGE[1], Math.max(ZOOM_RANGE[0], (g.zoom0 * d) / g.d0));
      pan.current = [g.pan0[0] - (mid[0] - g.mid0[0]) / scale, g.pan0[1] + (mid[1] - g.mid0[1]) / scale];
      g.moved = true;
      paint();
    } else if (pointers.current.size === 1) {
      if (!g.moved && Math.hypot(x - g.x0, y - g.y0) < 8) return;
      g.moved = true;
      pan.current = [g.pan0[0] - (x - g.x0) / scale, g.pan0[1] + (y - g.y0) / scale];
      paint();
    }
  };
  const onUp = (e: PointerEvent) => {
    const swi = swing.current;
    if (swi) {
      const ph = sw.current;
      if (ph.k !== 'aim') return;
      const { power, angle } = pullOf(ph);
      if (power < 0.08) { sw.current = { k: 'ready' }; swi.onAim(null, false); paint(); return; }
      launchSwing(power, angle);
      return;
    }
    const drag = rd.current;
    if (drag) {
      // A cancelled touch (the system took the gesture) never places the limb.
      if (e.pointerId === drag.id) { if (e.type === 'pointercancel') missReach(performance.now()); else endReach(performance.now()); }
      return;
    }
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) return;
    gesture.current = null;
    if (!g || g.moved || !layout.current) return;
    const [x, y] = local(e);
    const now = performance.now();
    const prev = lastTap.current;
    lastTap.current = { t: now, x, y };
    if (prev && now - prev.t < 300 && Math.hypot(prev.x - x, prev.y - y) < 30) {
      // Double-tap: back to the climber at the default zoom.
      zoom.current = 1;
      pan.current = [0, 0];
      lastTap.current = null;
      paint();
      return;
    }
    const near = layout.current.limbs.filter((l) => Math.hypot(l.px - x, l.py - y) < 22).sort((a, b) => Math.hypot(a.px - x, a.py - y) - Math.hypot(b.px - x, b.py - y))[0];
    props.onTap({ hold: hitHold(layout.current, x, y), limb: near?.limb ?? null });
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    zoom.current = Math.min(ZOOM_RANGE[1], Math.max(ZOOM_RANGE[0], zoom.current * Math.exp(-e.deltaY * 0.0015)));
    paint();
  };

  return (
    <div class="wall-wrap" ref={wrap}>
      <canvas
        ref={canvas} role="img" aria-label={props.label}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}
      />
      {props.children}
    </div>
  );
}
