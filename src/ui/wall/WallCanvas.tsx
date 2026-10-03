import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { easeCam, frameFor, toScreen, ZOOM_RANGE, type Cam, type P2 } from './camera';
import { ease } from './moves';
import { AFTER_MS, momentAt, type Playback } from './playback';
import { drawToon } from './toon';
/** The camera follows the climber with this time constant (ms), and a drag eases back to the climber over this long. */
const FOLLOW_MS = 140;
const PAN_BACK_MS = 500;

interface Clock {
  /** The step playing, how far into it (ms at 1×), the ending's progress (ms, −1 before it), done. */
  i: number;
  ms: number;
  ending: number;
  done: boolean;
  last: number;
  /** A drag in force when this step started, eased back to the climber; `held` while the player keeps one. */
  panFrom: P2;
  held: boolean;
}

/**
 * The cartoon wall playing a simulated attempt (docs/24 §5, 25 §10). It keeps the playback clock: each step plays for
 * its time (`Playback.ms`, quicker for a pitch's routine moves) divided by the speed and holds briefly, then the ending
 * plays. The camera follows the climber and can be pinched (0.6–2.5×, out to the whole route on a pitch), dragged and
 * double-tapped back to the climber (17 §2). Nothing on the wall changes the climb.
 */
export function WallCanvas(props: {
  pb: Playback;
  /** Hidden holds the climber has not found: not drawn. */
  hidden: ReadonlySet<string>;
  label: string;
  /** Playback speed: 1, 2 or 4. */
  speed: number;
  /** Each step snaps to its end pose. */
  reduceMotion: boolean;
  /** A step has started: frame `i` is on the wall. */
  onStep: (i: number) => void;
  /** The ending has started. */
  onEnding: () => void;
  /** The ending has played. */
  onDone: () => void;
  children?: ComponentChildren;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  live.current = props;
  const raf = useRef(0);
  const zoom = useRef(1);
  const pan = useRef<P2>([0, 0]);
  const cam = useRef<Cam | null>(null);
  const clock = useRef<Clock>({ i: 0, ms: 0, ending: -1, done: false, last: 0, panFrom: [0, 0], held: false });
  const touching = useRef(false);

  const paint = (now: number, dt: number) => {
    const c = canvas.current;
    const w = wrap.current;
    if (!c || !w) return;
    // Two device pixels per CSS pixel at most: the cartoon's thick lines do not need three, and fill costs per pixel.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = w.clientWidth;
    const ch = w.clientHeight;
    if (cw === 0 || ch === 0) return;
    if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) {
      c.width = Math.round(cw * dpr);
      c.height = Math.round(ch * dpr);
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { pb, reduceMotion, hidden } = live.current;
    const k = clock.current;
    const last = pb.bodies.length - 1;
    const m = k.ending >= 0 && pb.ending
      ? momentAt(pb, last, 1, reduceMotion ? 1 : Math.min(1, k.ending / Math.max(1, pb.ending.ms)))
      : momentAt(pb, k.i, k.i === 0 || reduceMotion ? 1 : Math.min(1, k.ms / Math.max(1, pb.ms[k.i]!)));
    if (!touching.current && !k.held) {
      const back = 1 - ease(Math.min(1, k.ms / PAN_BACK_MS));
      pan.current = [k.panFrom[0] * back, k.panFrom[1] * back];
    }
    const target = frameFor(m.focus, cw, ch, pb.bounds, zoom.current, pan.current, pb.frameMin);
    cam.current = cam.current && !touching.current && !reduceMotion ? easeCam(cam.current, target, 1 - Math.exp(-dt / FOLLOW_MS)) : target;
    const cm = cam.current;
    drawToon(ctx, cw, ch, toScreen(cm, cw, ch), cm.scale, { proj: pb.proj, block: pb.block, geom: pb.geom, joints: m.joints, fx: m.fx, touched: m.touched, hidden, target: m.target, time: now / 1000, pitch: pb.pitch && m.pitch ? { hardware: pb.pitch, ...m.pitch } : undefined });
  };

  const tick = (now: number) => {
    const k = clock.current;
    const { pb, speed } = live.current;
    const dt = k.last ? Math.min(100, now - k.last) : 0;
    k.last = now;
    if (!k.done) {
      if (k.ending < 0) {
        k.ms += dt * speed;
        const dur = pb.ms[k.i]! + pb.dwell[k.i]!;
        if (k.ms >= dur) {
          if (k.i < pb.bodies.length - 1) {
            k.i++;
            k.ms = 0;
            k.panFrom = [...pan.current];
            k.held = false;
            live.current.onStep(k.i);
          } else if (pb.ending) {
            k.ending = 0;
            live.current.onEnding();
          } else {
            k.done = true;
            live.current.onDone();
          }
        }
      } else {
        k.ending += dt * speed;
        if (!pb.ending || k.ending >= pb.ending.ms + AFTER_MS * speed) {
          k.done = true;
          live.current.onDone();
        }
      }
    }
    paint(now, dt);
    if (!k.done) raf.current = requestAnimationFrame(tick);
  };

  // A new attempt starts the clock from its first frame.
  useEffect(() => {
    clock.current = { i: 0, ms: 0, ending: -1, done: false, last: 0, panFrom: [0, 0], held: false };
    cam.current = null;
    zoom.current = 1;
    pan.current = [0, 0];
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [props.pb]);

  useEffect(() => {
    // The comic lettering's font, before the first word goes up.
    void document.fonts?.load('20px Bangers').catch(() => undefined);
    const ro = new ResizeObserver(() => { if (clock.current.done) paint(performance.now(), 0); });
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  // Gestures: one finger pans, two fingers pinch; double-tap recentres.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x0: number; y0: number; moved: boolean; pan0: P2; zoom0: number; d0: number; mid0: [number, number] } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const local = (e: PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const spread = () => {
    const ps = [...pointers.current.values()];
    return { d: Math.hypot(ps[0]!.x - ps[1]!.x, ps[0]!.y - ps[1]!.y), mid: [(ps[0]!.x + ps[1]!.x) / 2, (ps[0]!.y + ps[1]!.y) / 2] as [number, number] };
  };
  const repaint = () => { if (clock.current.done) paint(performance.now(), 0); };
  const onDown = (e: PointerEvent) => {
    const [x, y] = local(e);
    canvas.current?.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x, y });
    const two = pointers.current.size === 2 ? spread() : null;
    gesture.current = { x0: x, y0: y, moved: !!two || (gesture.current?.moved ?? false), pan0: [...pan.current], zoom0: zoom.current, d0: two?.d ?? 0, mid0: two?.mid ?? [x, y] };
  };
  const onMove = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    const [x, y] = local(e);
    pointers.current.set(e.pointerId, { x, y });
    const scale = cam.current?.scale ?? 100;
    if (pointers.current.size >= 2 && g.d0 > 0) {
      const { d, mid } = spread();
      zoom.current = Math.min(ZOOM_RANGE[1], Math.max(live.current.pb.zoomMin, (g.zoom0 * d) / g.d0));
      pan.current = [g.pan0[0] - (mid[0] - g.mid0[0]) / scale, g.pan0[1] + (mid[1] - g.mid0[1]) / scale];
    } else if (pointers.current.size === 1) {
      if (!g.moved && Math.hypot(x - g.x0, y - g.y0) < 8) return;
      pan.current = [g.pan0[0] - (x - g.x0) / scale, g.pan0[1] + (y - g.y0) / scale];
    } else return;
    g.moved = true;
    touching.current = true;
    clock.current.held = true;
    repaint();
  };
  const onUp = (e: PointerEvent) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) return;
    gesture.current = null;
    touching.current = false;
    if (!g || g.moved) return;
    const [x, y] = local(e);
    const now = performance.now();
    const prev = lastTap.current;
    lastTap.current = { t: now, x, y };
    if (prev && now - prev.t < 300 && Math.hypot(prev.x - x, prev.y - y) < 30) {
      // Double-tap: back to the climber at the default zoom.
      zoom.current = 1;
      pan.current = [0, 0];
      clock.current.panFrom = [0, 0];
      clock.current.held = false;
      lastTap.current = null;
      repaint();
    }
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    zoom.current = Math.min(ZOOM_RANGE[1], Math.max(live.current.pb.zoomMin, zoom.current * Math.exp(-e.deltaY * 0.0015)));
    repaint();
  };

  return (
    <div class="wall-wrap" ref={wrap}>
      <canvas
        ref={canvas} role="img" aria-label={props.label}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel} onContextMenu={(e) => e.preventDefault()}
      />
      {props.children}
    </div>
  );
}
