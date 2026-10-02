import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { drawWall, hitHold, type Layout, type WallView } from './render';

/** The wall, redrawn whenever the view changes; taps resolve to the nearest visible hold. */
export function WallCanvas(props: { view: WallView; onHold: (id: string | null) => void; label: string; children?: ComponentChildren }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layout = useRef<Layout | null>(null);
  const view = useRef(props.view);
  view.current = props.view;

  const paint = () => {
    const c = canvas.current;
    const w = wrap.current;
    if (!c || !w) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
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
    layout.current = drawWall(ctx, cw, ch, view.current);
  };

  useEffect(() => {
    const ro = new ResizeObserver(() => paint());
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { paint(); });

  const onPointer = (e: PointerEvent) => {
    const c = canvas.current;
    if (!c || !layout.current) return;
    const r = c.getBoundingClientRect();
    props.onHold(hitHold(layout.current, e.clientX - r.left, e.clientY - r.top));
  };

  return (
    <div class="wall-wrap" ref={wrap}>
      <canvas ref={canvas} role="img" aria-label={props.label} onPointerDown={onPointer} />
      {props.children}
    </div>
  );
}
