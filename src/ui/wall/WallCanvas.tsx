import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { fly, gapAt, launchVelocity, SLAP_MS, type SPt, type SwingPerf, type SwingSetup } from '../../sim/swing';
import type { Limb } from '../../sim/types';
import { C, drawWall, hitHold, type FrameExtras, type Layout, type WallView } from './render';
import {
  drop, ease, fallenPose, flightPose, frameFor, lerpPose, loadedPose, poseOf, projectS, toppedPose, toScreen, wallBounds, ZOOM_RANGE,
  type MotionStyle, type P, type Pose,
} from './pose';

/** How the attempt ends, for the last animation before the result screen. */
export type Ending = 'fall' | 'send' | 'off' | null;

/** What a tap hit: the nearest hold, and a limb end if the tap was on the figure's hand or foot. */
export interface WallTap { hold: string | null; limb: Limb | null }

export interface WallMotion {
  /** Bumps on every resolved step, so a slip that does not move the body still shows. */
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
  swing?: SwingInput | null; children?: ComponentChildren;
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
    const cam = frameFor(pose, cw, ch, wallBounds(v.geom), zoom.current, pan.current);
    layout.current = drawWall(ctx, cw, ch, v, pose, cam, { envelope: !a && !e && !(swi && ph.k !== 'ready'), banner });
    if (swi) drawSwing(ctx, cw, ch, cam, now);
    return running;
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
    // A move that was just swung has already flown: settle onto the hold without another hop.
    const afterSwing = swung.current && (moved || stepped);
    if (afterSwing) swung.current = false;
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
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    const [x, y] = local(e);
    pointers.current.set(e.pointerId, { x, y });
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
