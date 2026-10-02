import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Limb } from '../../sim/types';
import { drawWall, hitHold, type FrameExtras, type Layout, type WallView } from './render';
import {
  drop, ease, fallenPose, frameFor, lerpPose, poseOf, toppedPose, wallBounds, ZOOM_RANGE, type MotionStyle, type P, type Pose,
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
  view: WallView; onTap: (t: WallTap) => void; label: string; motion: WallMotion; ending: Ending; reduceMotion: boolean; children?: ComponentChildren;
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
      banner = e.kind === 'send' ? { text: 'SENT', colour: '#8FCB9B', alpha: Math.min(1, t * 2), y: 0.78 }
        : { text: e.kind === 'off' ? 'OFF' : 'FELL', colour: '#F08A5D', alpha: Math.min(1, t * 2), y: 0.2 };
      running = running || t < 1;
    }
    shown.current = pose;
    const cam = frameFor(pose, cw, ch, wallBounds(v.geom), zoom.current, pan.current);
    layout.current = drawWall(ctx, cw, ch, v, pose, cam, { envelope: !a && !e, banner });
    return running;
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
    if (!reduce.current && shown.current && (moved || (stepped && props.motion.shake))) {
      const dynamic = props.motion.style.cls === 'dyno' || props.motion.style.cls === 'deadpoint';
      anim.current = {
        from: shown.current, to: target, t0: performance.now(), dur: moved ? (dynamic ? DYNAMIC_MS : MOVE_MS) : SHAKE_MS,
        style: moved ? props.motion.style : {}, shake: props.motion.shake ? 1 : 0, panFrom: pan.current,
      };
      loop();
    } else {
      if (moved) pan.current = [0, 0];
      paint();
    }
  });

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
    const [x, y] = local(e);
    canvas.current?.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x, y });
    const two = pointers.current.size === 2 ? spread() : null;
    gesture.current = { x0: x, y0: y, t0: performance.now(), moved: !!two || (gesture.current?.moved ?? false), pan0: [...pan.current], zoom0: zoom.current, d0: two?.d ?? 0, mid0: two?.mid ?? [x, y] };
  };
  const onMove = (e: PointerEvent) => {
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
