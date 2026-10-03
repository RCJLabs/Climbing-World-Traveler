// Draws the cartoon wall (docs/25 §10): the forest (or the sea under a limestone crag), the problem's block and holds,
// the pads, on a pitch the bolts, quickdraws, rope and belayer (§10.8), the climber and the comic effects. Thick ink
// outlines, flat toon shading, a big-headed climber whose face shows the effort. Everything comes from the block, the
// joints and the effects it is handed; nothing here decides anything about the climb.

import { stream } from '../../sim/rng';
import type { CircuitColour, HoldType, SizeClass } from '../../sim/types';
import { zOfY, type RouteGeom } from '../../sim/wall';
import { faceEdges, tint, type Block } from './block';
import type { P2, Proj } from './camera';
import type { Face, Fx } from './moves';
import type { PitchMoment } from './playback';
import type { Pitch } from './pitch';
import { add3, mul3, norm3, rockOf, sub3, type Joints, type Rock, type V3 } from './rig';

export const INK = '#2B2340';
const C = {
  sky0: '#7FD3F7', sky1: '#D2F3FF', hill1: '#8AD27A', hill2: '#66BC5E', tree: '#4FAE4E', treeHi: '#6CCB64', trunk: '#9A6436',
  sand: '#F6DC93', sandDot: '#E2BE6C', skin: '#FFC9A0', skinShade: '#F2AE83', shirt: '#FFCC33', shirtShade: '#E9AF12', pants: '#4C6FD8',
  pantsShade: '#3B57B0', hair: '#6B3E26', band: '#E8453C', shoe: '#E8453C', mitt: '#FFFFFF', target: '#FFD93D', chalk: '#FFFFFF',
};
/** A figure's colours: the climber's, and the belayer's so the two never read as one. */
export interface Outfit { skin: string; skinShade: string; shirt: string; pants: string; hair: string; band: string | null; shoe: string; star: string | null }
const CLIMBER: Outfit = { skin: C.skin, skinShade: C.skinShade, shirt: C.shirt, pants: C.pants, hair: C.hair, band: C.band, shoe: C.shoe, star: '#FF8A3D' };
const BELAYER: Outfit = { skin: '#E9B48A', skinShade: '#D99B70', shirt: '#3CC6B4', pants: '#7A5BD1', hair: '#2E2A3A', band: null, shoe: '#5B6472', star: null };
const SEA = { sky0: '#4FC0F2', sky1: '#DDF6FF', sea0: '#5DB8EC', sea1: '#2C7FCB', foam: '#FFFFFF', isle: '#A99BD0', isleHi: '#BEB2DE', scrub: '#7DBA5C', scrubHi: '#98CF72', path: '#E9D7AE', stone: '#C9C2B4' };
const ROPE = { core: '#FF5F8F', fleck: '#FFE066', sling: ['#2EC4B6', '#FF9F1C', '#B49BF2'], metal: '#D5DCE6', metalShade: '#9AA5B5', tarp: '#E8453C' };
const CIRCUIT: Record<CircuitColour, string> = { yellow: '#F3C623', orange: '#F08A24', blue: '#2E7FD1', red: '#D63A2F', black: '#26232E', white: '#F7F7F7' };
const SIZE: Record<SizeClass, number> = { xs: 0.7, s: 0.85, m: 1, l: 1.2, xl: 1.4 };

export type ToScreen = (p: P2) => P2;

export interface ToonScene {
  proj: Proj;
  block: Block;
  geom: RouteGeom;
  joints: Joints;
  fx: Fx;
  /** Holds touched so far: chalked. */
  touched: ReadonlySet<string>;
  /** Hidden holds the climber has not found (05b §13): not drawn until a hand or foot is on them. */
  hidden?: ReadonlySet<string> | undefined;
  /** The hold being gone for, ringed while the move plays. */
  target: { at: V3; dynamic: boolean } | null;
  /** Seconds, for things that idle (clouds, sweat). */
  time: number;
  /** On a pitch: the bolts and the anchor, and the rope, the quickdraws and the belayer at this moment. */
  pitch?: (PitchMoment & { hardware: Pitch }) | undefined;
}

const rad = (d: number): number => (d * Math.PI) / 180;
const lerp2 = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function poly(ctx: CanvasRenderingContext2D, pts: P2[], close = true): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  if (close) ctx.closePath();
}

export function drawToon(ctx: CanvasRenderingContext2D, w: number, h: number, S: ToScreen, scale: number, sc: ToonScene): void {
  const P = (p: V3): P2 => S(sc.proj.view(p));
  const depth = sc.proj.depth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const view = { w, h };
  if (sc.block.look === 'sea') drawSea(ctx, w, h, S, scale, sc.block, sc.time); else drawScenery(ctx, w, h, S, scale, sc.block, sc.time);
  drawBlock(ctx, P, scale, sc.block, view);
  drawHolds(ctx, P, depth, scale, sc.block, sc.geom, sc.touched, sc.hidden, view);
  const pitch = sc.pitch;
  if (pitch) drawHardware(ctx, P, scale, pitch);
  if (sc.target) drawTarget(ctx, P(sc.target.at), scale, sc.target.dynamic, sc.time);
  drawPads(ctx, P, depth, scale, sc.block);
  const rock = rockOf(sc.block.route.wall);
  if (!pitch) {
    drawClimber(ctx, P, depth, scale, sc.joints, rock, sc.fx, sc.time);
  } else {
    // The rope runs behind the climber (between the body and the rock) and into the belayer's hands; the nearer
    // figure is drawn last.
    drawRopePile(ctx, P, scale, pitch);
    drawRope(ctx, P, scale, pitch);
    const belayerFirst = depth(pitch.belayer.hip) <= depth(sc.joints.hip);
    const still = { strain: 0.15, wobble: 0, squash: 1, face: 'focus' as const, stars: false, sweat: false };
    if (belayerFirst) drawClimber(ctx, P, depth, scale, pitch.belayer, FLAT_FRONT, still, sc.time, BELAYER, false);
    drawClimber(ctx, P, depth, scale, sc.joints, rock, sc.fx, sc.time, CLIMBER, true);
    if (!belayerFirst) drawClimber(ctx, P, depth, scale, pitch.belayer, FLAT_FRONT, still, sc.time, BELAYER, false);
  }
  drawFx(ctx, P, scale, sc.joints, sc.fx, sc.time);
}

/** The ground in front of a route, flat and vertical: the belayer's feet stand on it. */
const FLAT_FRONT: Rock = { z: () => 0, n: () => [0, 0, 1] };

/** Whether a screen point is on the canvas or within `m` px of it. */
const onCanvas = (p: P2, view: { w: number; h: number }, m: number): boolean => p[0] > -m && p[0] < view.w + m && p[1] > -m && p[1] < view.h + m;

// ---------------------------------------------------------------- scenery

function drawScenery(ctx: CanvasRenderingContext2D, w: number, h: number, S: ToScreen, scale: number, block: Block, time: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, C.sky0);
  sky.addColorStop(1, C.sky1);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const r = stream('toon-scenery', block.seed);
  const anchor = S([0, 0]);
  const par = (f: number): number => (anchor[0] - w / 2) * f;
  // Clouds drift.
  for (let i = 0; i < 4; i++) {
    const s = r.range(0.7, 1.2);
    const x = ((r.range(0, w * 1.6) + time * 6 * s + par(0.1)) % (w * 1.6)) - w * 0.3;
    const y = r.range(0.06, 0.4) * h + Math.min(0, (anchor[1] - h) * 0.15);
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (const [dx, dy, rr] of [[-26, 6, 15], [-8, -6, 20], [14, -2, 17], [30, 7, 12], [0, 9, 15]] as const) ctx.arc(x + dx * s, y + dy * s, rr * s, 0, Math.PI * 2);
    ctx.fill();
  }
  // Hills and lollipop trees stand on the ground behind the block, moving a little slower than it.
  const horizon = S([0, 1.25])[1];
  const hills = (base: number, amp: number, col: string, ph: number, f: number) => {
    ctx.fillStyle = col;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-10, h + 10);
    for (let i = 0; i <= 24; i++) {
      const x = (w + 20) * (i / 24) - 10;
      ctx.lineTo(x, base - amp * (0.5 + 0.5 * Math.sin(i * 0.65 + ph + par(f) * 0.01)));
    }
    ctx.lineTo(w + 10, h + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };
  hills(horizon - 0.15 * scale, 0.55 * scale, C.hill1, block.seed % 7, 0.25);
  for (let i = 0; i < 6; i++) {
    const s = r.range(0.75, 1.2) * Math.min(1.3, scale / 130);
    const x = ((r.range(0, w * 1.4) + par(0.4)) % (w * 1.4)) - w * 0.2;
    const by = horizon + r.range(-0.1, 0.25) * scale;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.fillStyle = C.trunk;
    ctx.beginPath(); ctx.rect(x - 5 * s, by - 44 * s, 10 * s, 52 * s); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.tree;
    ctx.beginPath(); ctx.arc(x, by - 62 * s, 32 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.treeHi;
    ctx.beginPath(); ctx.arc(x - 10 * s, by - 72 * s, 13 * s, 0, Math.PI * 2); ctx.fill();
  }
  hills(horizon + 0.25 * scale, 0.28 * scale, C.hill2, (block.seed % 5) + 2, 0.35);
  // Sand from just behind the block forward.
  const g0 = S([0, 0.55])[1];
  ctx.fillStyle = C.sand;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-10, h + 10);
  ctx.lineTo(-10, g0 + 10);
  ctx.quadraticCurveTo(w / 2, g0 - 14, w + 10, g0 + 10);
  ctx.lineTo(w + 10, h + 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.sandDot;
  for (let i = 0; i < 26; i++) {
    const x = ((r.range(0, w * 1.3) + par(1)) % (w * 1.3)) - w * 0.15;
    const y = g0 + 18 + r.range(0, Math.max(10, h - g0));
    ctx.beginPath(); ctx.arc(x, y, r.range(1.5, 3), 0, Math.PI * 2); ctx.fill();
  }
}

/**
 * The sea under a limestone crag (§10.8): sky, an island on the horizon, the sea, and the dusty path at the foot of
 * the rock. The horizon stays near the screen's middle and drops a little as the camera climbs the pitch; the path
 * belongs to the ground and scrolls away below.
 */
function drawSea(ctx: CanvasRenderingContext2D, w: number, h: number, S: ToScreen, scale: number, block: Block, time: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, SEA.sky0);
  sky.addColorStop(1, SEA.sky1);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const r = stream('toon-scenery', block.seed);
  const anchor = S([0, 0]);
  const par = (f: number): number => (anchor[0] - w / 2) * f;
  for (let i = 0; i < 4; i++) {
    const s = r.range(0.7, 1.2);
    const x = ((r.range(0, w * 1.6) + time * 6 * s + par(0.1)) % (w * 1.6)) - w * 0.3;
    const y = r.range(0.05, 0.3) * h;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    for (const [dx, dy, rr] of [[-26, 6, 15], [-8, -6, 20], [14, -2, 17], [30, 7, 12], [0, 9, 15]] as const) ctx.arc(x + dx * s, y + dy * s, rr * s, 0, Math.PI * 2);
    ctx.fill();
  }
  const below = Math.max(0, anchor[1] - h);
  const horizon = Math.min(h * 0.8, h * 0.42 + below * 0.03);
  // An island on the horizon, lit from the left.
  const iw = w * r.range(0.5, 0.75), ih = Math.min(h * 0.2, iw * 0.32);
  const ix = ((r.range(0, w) + par(0.04)) % (w * 1.3)) - w * 0.1;
  const isle = (): void => {
    ctx.beginPath();
    ctx.moveTo(ix - iw / 2, horizon);
    ctx.quadraticCurveTo(ix - iw * 0.32, horizon - ih * 0.55, ix - iw * 0.12, horizon - ih);
    ctx.quadraticCurveTo(ix, horizon - ih * 0.8, ix + iw * 0.1, horizon - ih * 0.88);
    ctx.quadraticCurveTo(ix + iw * 0.3, horizon - ih * 0.45, ix + iw / 2, horizon);
    ctx.closePath();
  };
  isle();
  ctx.fillStyle = SEA.isle;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.fill();
  ctx.stroke();
  ctx.save();
  isle();
  ctx.clip();
  ctx.fillStyle = SEA.isleHi;
  ctx.beginPath(); ctx.ellipse(ix - iw * 0.22, horizon - ih * 0.55, iw * 0.16, ih * 0.6, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  const sea = ctx.createLinearGradient(0, horizon, 0, h);
  sea.addColorStop(0, SEA.sea0);
  sea.addColorStop(1, SEA.sea1);
  ctx.fillStyle = sea;
  ctx.fillRect(-10, horizon, w + 20, h - horizon + 10);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  poly(ctx, [[-10, horizon], [w + 10, horizon]], false);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 16; i++) {
    const f = r.range(0, 1) ** 1.6;
    const y = horizon + 6 + f * (h - horizon);
    const x = ((r.range(0, w * 1.3) + time * (3 + 6 * f) + par(0.15 + 0.3 * f)) % (w * 1.3)) - w * 0.15;
    const len = 5 + 14 * f;
    poly(ctx, [[x, y], [x + len, y]], false);
    ctx.stroke();
  }
  // The path at the foot of the crag, with stones and scrub.
  const g0 = S([0, 0.55])[1];
  if (g0 > h + 30) return;
  ctx.fillStyle = SEA.path;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-10, h + 10);
  ctx.lineTo(-10, g0 + 10);
  ctx.quadraticCurveTo(w / 2, g0 - 14, w + 10, g0 + 10);
  ctx.lineTo(w + 10, h + 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  for (let i = 0; i < 7; i++) {
    const x = ((r.range(0, w * 1.4) + par(0.9)) % (w * 1.4)) - w * 0.2, y = g0 + r.range(-4, 8);
    const s = r.range(0.7, 1.2) * Math.min(1.3, scale / 130);
    ctx.fillStyle = SEA.scrub;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (const [dx, dy, rr] of [[-12, 0, 11], [0, -7, 13], [12, 0, 10]] as const) ctx.arc(x + dx * s, y + dy * s, rr * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SEA.scrubHi;
    ctx.beginPath(); ctx.arc(x - 3 * s, y - 11 * s, 4 * s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = SEA.stone;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const x = ((r.range(0, w * 1.3) + par(1)) % (w * 1.3)) - w * 0.15;
    const y = g0 + 16 + r.range(0, Math.max(10, h - g0));
    const rr = r.range(2.5, 6);
    ctx.beginPath(); ctx.ellipse(x, y, rr * 1.4, rr, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}

// ---------------------------------------------------------------- the block

const LIGHT = norm3([-0.35, 0.8, 0.5]);

/** Toon shade for a face at `angle`: four flat tones, lit from above and the left. */
function faceTone(block: Block, angle: number): string {
  const a = rad(angle);
  const nd = Math.cos(a) * LIGHT[1] + Math.sin(a) * LIGHT[2];
  const p = block.palette;
  return nd > 0.62 ? p.light : nd > 0.38 ? p.base : nd > 0.12 ? p.shade : p.deep;
}

function drawBlock(ctx: CanvasRenderingContext2D, P: (p: V3) => P2, scale: number, block: Block, view: { w: number; h: number }): void {
  const rows = block.rows;
  const last = rows[rows.length - 1]!;
  const xAt = (y: number, side: 0 | 1): number => faceEdges(block, Math.min(block.top, Math.max(0, y)))[side];
  // The side the camera sees: the profile in cross-section, from the face round the top and down the back.
  const side: P2[] = [...rows.map((w) => P([w.xl, w.y, w.z])), ...block.back.map(([y, z]) => P([xAt(y, 0) + block.inset, y, z]))];
  const crown = block.back.filter(([y]) => y >= block.top - 0.02);
  const top: P2[] = [
    P([last.xl, last.y, last.z]), P([last.xr, last.y, last.z]),
    ...crown.map(([y, z]) => P([last.xr - block.inset, y, z])),
    ...crown.slice().reverse().map(([y, z]) => P([last.xl + block.inset, y, z])),
  ];
  const faceOutline: P2[] = [...rows.map((w) => P([w.xl, w.y, w.z])), ...rows.slice().reverse().map((w) => P([w.xr, w.y, w.z]))];
  // A soft contact shadow on the sand.
  const b0 = P([(rows[0]!.xl + rows[0]!.xr) / 2, 0, rows[0]!.z + 0.4]);
  ctx.fillStyle = 'rgba(43,35,64,0.18)';
  ctx.beginPath();
  ctx.ellipse(b0[0], b0[1], ((rows[0]!.xr - rows[0]!.xl) * 0.65 + 0.6) * scale, 0.22 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  // Ink first, wide; fills over it leave the ink only round the outside.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  for (const shape of [side, top, faceOutline]) { poly(ctx, shape); ctx.stroke(); }
  ctx.fillStyle = block.palette.side;
  poly(ctx, side); ctx.fill();
  ctx.fillStyle = block.palette.top;
  poly(ctx, top); ctx.fill();
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = rows[i]!, b = rows[i + 1]!;
    const strip = [P([a.xl, a.y, a.z]), P([a.xr, a.y, a.z]), P([b.xr, b.y, b.z]), P([b.xl, b.y, b.z])];
    // A tall face: only the strips on the canvas.
    if (block.pitch && (strip.every((p) => p[1] < -20) || strip.every((p) => p[1] > view.h + 20))) continue;
    const tone = faceTone(block, (a.angle + b.angle) / 2);
    ctx.fillStyle = tone;
    ctx.strokeStyle = tone;
    ctx.lineWidth = 1;
    poly(ctx, strip);
    ctx.fill();
    ctx.stroke();
  }
  // Creases: where the face changes tone, along the arête and the lip.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]!, b = rows[i]!;
    if (faceTone(block, a.angle) !== faceTone(block, b.angle)) { poly(ctx, [P([b.xl, b.y, b.z]), P([b.xr, b.y, b.z])], false); ctx.stroke(); }
  }
  ctx.lineWidth = 3;
  poly(ctx, rows.map((w) => P([w.xl, w.y, w.z])), false); ctx.stroke();
  poly(ctx, [P([last.xl, last.y, last.z]), P([last.xr, last.y, last.z])], false); ctx.stroke();
  const zAt = (y: number): number => zOfY(block.wall, Math.max(0, Math.min(block.top, y)));
  // A soft shine high on the left of the face, where the light catches it.
  const shineY = block.top * 0.74;
  const [sxl, sxr] = faceEdges(block, shineY);
  onFace(ctx, P, [sxl + (sxr - sxl) * 0.2, shineY, zAt(shineY)], rows[Math.round(rows.length * 0.6)]!.angle, () => {
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.min(0.45, (sxr - sxl) * 0.16), Math.min(0.3, block.top * 0.12), -0.5, 0, Math.PI * 2);
  });
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fill();
  for (const m of block.marks) {
    const pts = m.pts.map(([x, y]) => P([x, y, zAt(y)]));
    if (block.pitch && !pts.some((p) => onCanvas(p, view, 0.5 * scale)) && m.kind !== 'streak' && m.kind !== 'tufa') continue;
    ctx.strokeStyle = INK;
    if (m.kind === 'streak') { drawStreak(ctx, pts, (m.w ?? 0.2) * scale, !!m.warm); continue; }
    if (m.kind === 'tufa') { drawTufa(ctx, pts, (m.w ?? 0.2) * scale, block); continue; }
    if (m.kind === 'crack') { ctx.lineWidth = 2; poly(ctx, pts, false); ctx.stroke(); }
    else if (m.kind === 'scoop') { ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pts[0]![0], pts[0]![1]); ctx.quadraticCurveTo(pts[1]![0], pts[1]![1] + 0.05 * scale, pts[2]![0], pts[2]![1]); ctx.stroke(); }
    else if (m.kind === 'texture') { ctx.globalAlpha = 0.45; ctx.lineWidth = 1.6; poly(ctx, pts, false); ctx.stroke(); ctx.globalAlpha = 1; }
    else if (m.kind === 'hueco') { const p = pts[0]!; ctx.fillStyle = block.palette.deep; ctx.beginPath(); ctx.ellipse(p[0], p[1], 0.07 * scale, 0.05 * scale, 0, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 2; ctx.stroke(); }
    else if (m.kind === 'ledge') { ctx.lineWidth = 4; poly(ctx, pts, false); ctx.stroke(); }
  }
  // Moss on the top.
  for (const [x, dz, rr] of block.moss) {
    const p = P([x, block.top + 0.03, last.z + dz]);
    ctx.fillStyle = '#7CC36A';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(p[0], p[1], rr * scale, rr * 0.45 * scale, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // The circuit's paint mark by the start: a disc and an arrow up, in the circuit's colour.
  if (block.circuit) {
    const c = P(block.circuit.at), up = P(add3(block.circuit.at, [0, 0.16, 0]));
    const col = CIRCUIT[block.circuit.colour];
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(c[0], c[1], 0.045 * scale, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(2.5, 0.025 * scale);
    poly(ctx, [[c[0], c[1] - 0.06 * scale], up], false); ctx.stroke();
    poly(ctx, [[up[0] - 0.035 * scale, up[1] + 0.04 * scale], up, [up[0] + 0.035 * scale, up[1] + 0.04 * scale]], false); ctx.stroke();
  }
}

/** A streak of colour down limestone: a soft band, orange or blue-grey, fading at its ends. */
function drawStreak(ctx: CanvasRenderingContext2D, pts: P2[], w: number, warm: boolean): void {
  const [a, b] = [pts[0]!, pts[pts.length - 1]!];
  const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
  const col = warm ? '233,150,82' : '96,112,140';
  g.addColorStop(0, `rgba(${col},0)`);
  g.addColorStop(0.2, `rgba(${col},0.32)`);
  g.addColorStop(0.75, `rgba(${col},0.22)`);
  g.addColorStop(1, `rgba(${col},0)`);
  ctx.strokeStyle = g;
  ctx.lineWidth = Math.max(4, w);
  ctx.lineCap = 'round';
  poly(ctx, pts, false);
  ctx.stroke();
}

/** A tufa: a column standing out of the face, lit on the left, inked on both edges. */
function drawTufa(ctx: CanvasRenderingContext2D, pts: P2[], w: number, block: Block): void {
  const width = Math.max(6, w);
  ctx.lineCap = 'round';
  poly(ctx, pts, false);
  ctx.strokeStyle = INK;
  ctx.lineWidth = width + 5;
  ctx.stroke();
  ctx.strokeStyle = tint(block.palette.light, -0.04);
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.strokeStyle = tint(block.palette.light, 0.35);
  ctx.lineWidth = width * 0.3;
  poly(ctx, pts.map(([x, y]) => [x - width * 0.22, y] as P2), false);
  ctx.stroke();
}

// ---------------------------------------------------------------- holds

/** Draws `fn`'s path in the face's own plane at a point: x across, y up the face, both in metres. */
function onFace(ctx: CanvasRenderingContext2D, P: (p: V3) => P2, at: V3, angle: number, fn: () => void): void {
  const a = rad(angle);
  const up: V3 = [0, Math.sin(a), -Math.cos(a)];
  const c = P(at), ex = P(add3(at, [0.1, 0, 0])), ey = P(add3(at, mul3(up, 0.1)));
  ctx.save();
  ctx.transform((ex[0] - c[0]) / 0.1, (ex[1] - c[1]) / 0.1, -(ey[0] - c[0]) / 0.1, -(ey[1] - c[1]) / 0.1, c[0], c[1]);
  fn();
  ctx.restore();
}

function holdShape(ctx: CanvasRenderingContext2D, type: HoldType, s: number, orientation: number): void {
  ctx.beginPath();
  switch (type) {
    case 'crimp': ctx.roundRect(-0.045 * s, -0.012 * s, 0.09 * s, 0.024 * s, 0.008 * s); break;
    case 'edge': ctx.roundRect(-0.045 * s, -0.016 * s, 0.09 * s, 0.032 * s, 0.01 * s); break;
    case 'jug': case 'horn': ctx.ellipse(0, 0, 0.065 * s, 0.04 * s, 0, 0, Math.PI * 2); break;
    case 'sloper': ctx.ellipse(0, 0.005 * s, 0.08 * s, 0.045 * s, 0, 0, Math.PI * 2); break;
    case 'pinch': case 'sidepull': case 'gaston': ctx.ellipse(0, 0, 0.022 * s, 0.055 * s, rad(orientation) * 0.25, 0, Math.PI * 2); break;
    case 'undercling': ctx.ellipse(0, 0, 0.055 * s, 0.022 * s, 0, 0, Math.PI * 2); break;
    case 'pocket1': case 'pocket2': case 'pocket3': ctx.ellipse(0, 0, 0.03 * s, 0.022 * s, 0, 0, Math.PI * 2); break;
    case 'volume': ctx.moveTo(-0.09 * s, -0.05 * s); ctx.lineTo(0, 0.07 * s); ctx.lineTo(0.09 * s, -0.05 * s); ctx.closePath(); break;
    case 'foot_chip': ctx.ellipse(0, 0, 0.03 * s, 0.016 * s, 0, 0, Math.PI * 2); break;
    case 'smear': ctx.ellipse(0, 0, 0.06 * s, 0.035 * s, 0, 0, Math.PI * 2); break;
    default: ctx.roundRect(-0.012 * s, -0.08 * s, 0.024 * s, 0.16 * s, 0.01 * s);
  }
}

/** Holds are drawn this much bigger than they are, so they read at phone size. */
const HOLD_BIG = 1.5;

function drawHolds(ctx: CanvasRenderingContext2D, P: (p: V3) => P2, depth: (p: V3) => number, scale: number, block: Block, geom: RouteGeom, touched: ReadonlySet<string>, hidden: ReadonlySet<string> | undefined, view: { w: number; h: number }): void {
  const holds = geom.list
    .filter((h) => (!hidden?.has(h.id) || touched.has(h.id)) && onCanvas(P([h.x, h.y, h.z]), view, 0.3 * scale))
    .sort((a, b) => depth([a.x, a.y, a.z]) - depth([b.x, b.y, b.z]));
  const ink = Math.max(1.6, Math.min(3, 0.018 * scale));
  for (const h of holds) {
    const s = (SIZE[h.size] ?? 1) * HOLD_BIG;
    const at: V3 = [h.x, h.y, h.z];
    const chalked = touched.has(h.id);
    if (h.type === 'smear') {
      // A smear is blank rock: a rubber scuff once a foot has been on it.
      if (chalked) { onFace(ctx, P, at, h.angle, () => { ctx.beginPath(); ctx.ellipse(0, 0, 0.05, 0.02, 0, 0, Math.PI * 2); }); ctx.fillStyle = 'rgba(43,35,64,0.25)'; ctx.fill(); }
      continue;
    }
    const hole = h.type.startsWith('pocket');
    // A shadow under the hold, the hold, a shine; pockets are dark holes with a rim.
    onFace(ctx, P, add3(at, [0, -0.014 * s, 0]), h.angle, () => holdShape(ctx, h.type, s, h.orientation));
    ctx.fillStyle = 'rgba(43,35,64,0.3)';
    ctx.fill();
    onFace(ctx, P, at, h.angle, () => holdShape(ctx, h.type, s, h.orientation));
    ctx.fillStyle = hole ? block.palette.deep : h.type === 'foot_chip' ? block.palette.shade : tint(block.palette.light, 0.1);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = ink;
    ctx.stroke();
    const c = P(at);
    if (!hole && h.type !== 'foot_chip') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.ellipse(c[0] - 0.022 * s * scale, c[1] - 0.004 * s * scale, Math.max(1.5, 0.012 * s * scale), Math.max(1, 0.006 * s * scale), -0.3, 0, Math.PI * 2); ctx.fill();
    }
    if (chalked && !hole) {
      // Chalk: white popcorn along the top of the hold.
      const r = Math.max(2, 0.011 * s * scale);
      ctx.fillStyle = C.chalk;
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1, ink * 0.55);
      for (const [dx, dy] of [[-0.024, 0.012], [0, 0.018], [0.022, 0.011]] as const) {
        ctx.beginPath(); ctx.arc(c[0] + dx * s * scale, c[1] - dy * s * scale, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
  }
}

function drawTarget(ctx: CanvasRenderingContext2D, c: P2, scale: number, dynamic: boolean, time: number): void {
  const r = Math.max(12, 0.11 * scale) + 2 * Math.sin(time * 7);
  ctx.save();
  ctx.setLineDash(dynamic ? [6, 5] : [2, 6]);
  ctx.lineDashOffset = -time * 24;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = C.target;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- pads

function drawPads(ctx: CanvasRenderingContext2D, P: (p: V3) => P2, depth: (p: V3) => number, scale: number, block: Block): void {
  const pads = [...block.pads].sort((a, b) => depth([a.x1, 0, a.z0]) - depth([b.x1, 0, b.z0]));
  for (const p of pads) {
    const topF = [P([p.x0, p.t, p.z0]), P([p.x1, p.t, p.z0]), P([p.x1, p.t, p.z1]), P([p.x0, p.t, p.z1])];
    const front = [P([p.x0, p.t, p.z1]), P([p.x1, p.t, p.z1]), P([p.x1, 0, p.z1]), P([p.x0, 0, p.z1])];
    const left = [P([p.x0, p.t, p.z0]), P([p.x0, p.t, p.z1]), P([p.x0, 0, p.z1]), P([p.x0, 0, p.z0])];
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    for (const [shape, col] of [[left, tint(p.trim, -0.12)], [front, p.trim], [topF, p.colour]] as const) { poly(ctx, shape); ctx.fillStyle = col; ctx.fill(); ctx.stroke(); }
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1.5, 0.012 * scale);
    const inset = (a: P2, b: P2) => lerp2(a, b, 0.08);
    poly(ctx, [inset(topF[0]!, topF[2]!), inset(topF[1]!, topF[3]!), inset(topF[2]!, topF[0]!), inset(topF[3]!, topF[1]!)]);
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- bolts, quickdraws, the rope (§10.8)

/** A metal part: a hanger, a ring. */
function metal(ctx: CanvasRenderingContext2D, c: P2, r: number, ink: number, hole = true): void {
  ctx.fillStyle = ROPE.metal;
  ctx.strokeStyle = INK;
  ctx.lineWidth = ink;
  ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (hole) { ctx.fillStyle = ROPE.metalShade; ctx.beginPath(); ctx.arc(c[0], c[1] + r * 0.15, r * 0.4, 0, Math.PI * 2); ctx.fill(); }
}

/** A karabiner: an upright oval with a gap for the gate. */
function biner(ctx: CanvasRenderingContext2D, c: P2, r: number, ink: number): void {
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, r * 0.75) + 2;
  ctx.beginPath(); ctx.ellipse(c[0], c[1], r * 0.62, r, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = ROPE.metal;
  ctx.lineWidth = Math.max(1.5, r * 0.75);
  ctx.stroke();
  void ink;
}

function drawHardware(ctx: CanvasRenderingContext2D, P: (p: V3) => P2, scale: number, pm: PitchMoment & { hardware: Pitch }): void {
  const hw = pm.hardware;
  // Drawn bigger than they are, as the holds are, so they read at phone size.
  const r = Math.max(4, 0.045 * scale);
  const ink = Math.max(1.5, Math.min(2.5, 0.016 * scale));
  hw.bolts.forEach((b, i) => {
    const h = P(b.hanger);
    metal(ctx, h, r, ink);
    if (!pm.draws.has(i)) return;
    const lo = P(b.biner);
    tube(ctx, [lerp2(h, lo, 0.26), lerp2(h, lo, 0.72)], Math.max(4, 0.042 * scale), ROPE.sling[i % ROPE.sling.length]!, ink * 0.8);
    biner(ctx, lerp2(h, lo, 0.12), r * 0.75, ink);
    biner(ctx, lo, r * 0.9, ink);
  });
  if (hw.anchor) {
    const L = P(hw.anchor.left), R = P(hw.anchor.right), ring = P(hw.anchor.ring);
    for (const end of [L, R]) {
      // The chain: three links from the hanger to the ring.
      for (let j = 1; j <= 3; j++) {
        const c = lerp2(end, ring, j / 4);
        ctx.strokeStyle = INK;
        ctx.lineWidth = ink + 2;
        ctx.beginPath(); ctx.ellipse(c[0], c[1], r * 0.4, r * 0.6, Math.atan2(ring[1] - end[1], ring[0] - end[0]) + Math.PI / 2, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = ROPE.metalShade;
        ctx.lineWidth = ink;
        ctx.stroke();
      }
      metal(ctx, end, r, ink);
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = r * 0.55 + 3;
    ctx.beginPath(); ctx.arc(ring[0], ring[1], r * 1.1, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = ROPE.metal;
    ctx.lineWidth = r * 0.55;
    ctx.stroke();
    if (pm.anchor >= 1) biner(ctx, [ring[0], ring[1] + r * 1.1], r * 0.9, ink);
  }
}

/** The rope: the belayer's device, the quickdraws it is clipped to, the climber; it sags as it slackens. */
function drawRope(ctx: CanvasRenderingContext2D, P: (p: V3) => P2, scale: number, pm: PitchMoment): void {
  const pts = pm.rope.map(P);
  if (pts.length < 2) return;
  const w = Math.max(2.2, 0.02 * scale);
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const sag = (1 - pm.tight) * Math.min(0.6 * scale, 0.16 * d);
    ctx.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag, b[0], b[1]);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = w + 3;
  ctx.stroke();
  ctx.strokeStyle = ROPE.core;
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.save();
  ctx.setLineDash([w * 0.9, w * 2.4]);
  ctx.strokeStyle = ROPE.fleck;
  ctx.lineWidth = w * 0.45;
  ctx.stroke();
  ctx.restore();
}

/** The rope bag by the belayer's feet: a tarp, the coils, and the slack end up to the belayer's brake hand. */
function drawRopePile(ctx: CanvasRenderingContext2D, P: (p: V3) => P2, scale: number, pm: PitchMoment & { hardware: Pitch }): void {
  const at: V3 = add3(pm.hardware.belay, [0.55, 0, 0.25]);
  const tarp = [P(add3(at, [-0.32, 0, -0.25])), P(add3(at, [0.32, 0, -0.25])), P(add3(at, [0.36, 0, 0.3])), P(add3(at, [-0.36, 0, 0.3]))];
  poly(ctx, tarp);
  ctx.fillStyle = ROPE.tarp;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.fill();
  ctx.stroke();
  const w = Math.max(2, 0.018 * scale);
  const c = P(add3(at, [0, 0.03, 0]));
  for (let i = 0; i < 4; i++) {
    const rx = (0.17 - 0.025 * i) * scale, ry = rx * 0.38;
    ctx.beginPath(); ctx.ellipse(c[0] + (i % 2 ? 2 : -2), c[1] - i * w * 0.9, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = INK; ctx.lineWidth = w + 3; ctx.stroke();
    ctx.strokeStyle = ROPE.core; ctx.lineWidth = w; ctx.stroke();
  }
  const brake = P(pm.belayer.RH), dev = P(pm.rope[0]!);
  ctx.beginPath();
  ctx.moveTo(c[0], c[1] - 3 * w);
  ctx.quadraticCurveTo(c[0] - 0.1 * scale, (c[1] + brake[1]) / 2 + 0.15 * scale, brake[0], brake[1]);
  ctx.lineTo(dev[0], dev[1]);
  ctx.strokeStyle = INK; ctx.lineWidth = w + 3; ctx.stroke();
  ctx.strokeStyle = ROPE.core; ctx.lineWidth = w; ctx.stroke();
}

// ---------------------------------------------------------------- the climber

function tube(ctx: CanvasRenderingContext2D, pts: P2[], w: number, col: string, ink = 3): void {
  poly(ctx, pts, false);
  ctx.strokeStyle = INK;
  ctx.lineWidth = w + 2 * ink;
  ctx.stroke();
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.stroke();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, ink = 2): void {
  ctx.beginPath();
  for (let j = 0; j < 10; j++) { const rr = j % 2 ? r * 0.45 : r, a = (j / 10) * Math.PI * 2 - Math.PI / 2; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.strokeStyle = INK;
  ctx.lineWidth = ink;
  ctx.fill();
  ctx.stroke();
}

function drawClimber(ctx: CanvasRenderingContext2D, P0: (p: V3) => P2, depth: (p: V3) => number, scale: number, j: Joints, rock: Rock, fx: Fx, time: number, look: Outfit = CLIMBER, harness = false): void {
  const k = j.k;
  const P = (p: V3): P2 => P0(add3(p, [fx.wobble, 0, 0]));
  const hip = P(j.hip);
  ctx.save();
  if (fx.squash !== 1) {
    ctx.translate(hip[0], hip[1] + 0.3 * k * scale);
    ctx.scale(1 + (1 - fx.squash) * 0.8, fx.squash);
    ctx.translate(-hip[0], -hip[1] - 0.3 * k * scale);
  }
  const ink = inkOf(scale);
  const arm = Math.max(6, 0.105 * k * scale), leg = Math.max(8, 0.14 * k * scale);
  type Part = { d: number; draw: () => void };
  const parts: Part[] = [];
  const mean = (...ps: V3[]): number => ps.reduce((s, p) => s + depth(p), 0) / ps.length;
  for (const [s0, el, end] of [[j.shL, j.elL, j.LH], [j.shR, j.elR, j.RH]] as const) {
    parts.push({
      d: mean(s0, el, end),
      draw: () => {
        const a = P(s0), e = P(el), f = P(end);
        tube(ctx, [a, e, f], arm, look.skin, ink);
        // A chalky white hand.
        ctx.fillStyle = C.mitt;
        ctx.strokeStyle = INK;
        ctx.lineWidth = ink * 0.75;
        ctx.beginPath(); ctx.arc(f[0], f[1], Math.max(5, 0.068 * k * scale), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      },
    });
  }
  for (const [h0, kn, end, f] of [[j.hipL, j.knL, j.LF, 'LF'], [j.hipR, j.knR, j.RF, 'RF']] as const) {
    parts.push({
      d: mean(h0, kn, end),
      draw: () => {
        tube(ctx, [P(h0), P(kn), P(end)], leg, look.pants, ink);
        drawShoe(ctx, P, scale, j, rock, f, kn, end, ink, look);
      },
    });
  }
  parts.push({ d: mean(j.sh, j.hip) + 0.02, draw: () => drawTorso(ctx, P, scale, j, ink, look, harness) });
  parts.push({ d: mean(j.head) + (j.facingOut ? 0.3 : 0.06), draw: () => drawHead(ctx, P, scale, j, fx.face, time, ink, look) });
  parts.sort((a, b) => a.d - b.d);
  for (const p of parts) p.draw();
  ctx.restore();
}

/** Ink line width for the climber and the props at a scale (px per metre). */
const inkOf = (scale: number): number => Math.max(2.5, Math.min(4.5, 0.028 * scale));

function drawShoe(ctx: CanvasRenderingContext2D, P: (p: V3) => P2, scale: number, j: Joints, rock: Rock, f: 'LF' | 'RF', kn: V3, end: V3, ink: number, look: Outfit): void {
  const k = j.k;
  const style = j.foot[f];
  const side = f === 'LF' ? -1 : 1;
  const n = rock.n(end[1]);
  const up: V3 = [0, n[2], -n[1]];
  // Toes into the rock on a hold; up and out on a heel hook; along the rock on a toe hook; pointed down hanging free;
  // towards us standing on top; up sitting on the pads.
  const into: V3 = j.facingOut ? (end[1] < 0.5 && j.hip[1] < 0.6 ? [0, 1, 0.3] : [0, -0.1, 1])
    : style === 'heel' ? add3(add3(mul3(n, 0.7), [side * 0.5, 0, 0]), mul3(up, 0.35))
      : style === 'toe' ? add3(add3([side * 0.8, 0, 0], mul3(up, 0.4)), mul3(n, -0.25))
        : style === 'free' ? add3(mul3(norm3(sub3(end, kn)), 0.5), mul3(n, -0.8))
          : add3(mul3(n, -1), mul3(up, -0.2));
  const tip = P(add3(end, mul3(norm3(into), 0.14 * k)));
  const c = P(end);
  const ang = Math.atan2(tip[1] - c[1], tip[0] - c[0]);
  const L = Math.max(11, Math.hypot(tip[0] - c[0], tip[1] - c[1]) + 0.1 * k * scale), H = Math.max(7, 0.085 * k * scale);
  ctx.save();
  ctx.translate((c[0] + tip[0]) / 2, (c[1] + tip[1]) / 2);
  ctx.rotate(ang);
  ctx.fillStyle = look.shoe;
  ctx.strokeStyle = INK;
  ctx.lineWidth = ink * 0.8;
  ctx.beginPath(); ctx.ellipse(0, 0, L / 2, H / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.roundRect(-L * 0.3, H * 0.12, L * 0.62, Math.max(2, H * 0.18), 2); ctx.fill();
  ctx.restore();
}

function drawTorso(ctx: CanvasRenderingContext2D, P: (p: V3) => P2, scale: number, j: Joints, ink: number, look: Outfit, harness: boolean): void {
  const k = j.k;
  const sh = P(j.sh), hip = P(j.hip);
  const len = Math.max(0.2 * k * scale, Math.hypot(sh[0] - hip[0], sh[1] - hip[1]));
  const ang = Math.atan2(sh[1] - hip[1], sh[0] - hip[0]);
  const halfW = Math.max(10, 0.19 * k * scale);
  // The egg runs from just below the hips to above the shoulders, so the thighs show where they leave the hips.
  const below = 0.03 * k * scale, above = 0.09 * k * scale;
  const halfL = (len + below + above) / 2;
  ctx.save();
  ctx.translate((sh[0] + hip[0]) / 2, (sh[1] + hip[1]) / 2);
  ctx.rotate(ang - Math.PI / 2);
  // The body runs along +y after the rotation, shoulders at +len/2: a yellow egg with the shorts band at the bottom.
  const egg = () => { ctx.beginPath(); ctx.ellipse(0, (above - below) / 2, halfW, halfL, 0, 0, Math.PI * 2); };
  egg();
  ctx.fillStyle = look.shirt;
  ctx.fill();
  ctx.save();
  egg();
  ctx.clip();
  ctx.fillStyle = look.pants;
  // The shorts: from the bottom of the egg to a hand's width above the hips.
  const bottom = -len / 2 - below - 4, band = -len / 2 + 0.13 * k * scale;
  ctx.fillRect(-halfW - 2, bottom, halfW * 2 + 4, band - bottom);
  ctx.strokeStyle = INK;
  ctx.lineWidth = ink * 0.6;
  poly(ctx, [[-halfW, band], [halfW, band]], false);
  ctx.stroke();
  if (harness) {
    // On a rope: the harness's waist belt over the band, a gear loop either side.
    const bh = Math.max(3, 0.05 * k * scale);
    ctx.fillStyle = '#4A4F63';
    ctx.fillRect(-halfW - 2, band - bh * 0.6, halfW * 2 + 4, bh);
    ctx.strokeRect(-halfW - 2, band - bh * 0.6, halfW * 2 + 4, bh);
    ctx.fillStyle = ROPE.metal;
    for (const sx of [-0.62, 0.62]) { ctx.beginPath(); ctx.ellipse(sx * halfW, band - bh * 0.9, bh * 0.35, bh * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  }
  ctx.restore();
  egg();
  ctx.strokeStyle = INK;
  ctx.lineWidth = ink;
  ctx.stroke();
  if (look.star) star(ctx, 0, len * 0.16, Math.max(6, halfW * 0.4), look.star, ink * 0.6);
  ctx.restore();
}

function drawHead(ctx: CanvasRenderingContext2D, P: (p: V3) => P2, scale: number, j: Joints, face: Face, time: number, ink: number, outfit: Outfit = CLIMBER): void {
  const k = j.k;
  const c = P(j.head);
  const R = Math.max(11, 0.19 * k * scale);
  tube(ctx, [P(j.neck), c], Math.max(6, 0.08 * k * scale), outfit.skin, ink);
  const g = P(add3(j.head, mul3(j.gaze, 0.3)));
  let gx = g[0] - c[0], gy = g[1] - c[1];
  const gl = Math.hypot(gx, gy) || 1;
  gx /= gl; gy /= gl;
  const disc = () => { ctx.beginPath(); ctx.arc(c[0], c[1], R, 0, Math.PI * 2); };
  if (j.facingOut) {
    // Facing us: ears, the face, hair on top, the headband, the expression.
    for (const s of [-1, 1]) { ctx.fillStyle = outfit.skin; ctx.strokeStyle = INK; ctx.lineWidth = ink * 0.7; ctx.beginPath(); ctx.ellipse(c[0] + s * R * 0.98, c[1] + R * 0.08, R * 0.2, R * 0.26, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    disc(); ctx.fillStyle = outfit.skin; ctx.fill();
    ctx.save(); disc(); ctx.clip();
    ctx.fillStyle = outfit.hair;
    ctx.beginPath(); ctx.ellipse(c[0], c[1] - R * 0.78, R * 1.2, R * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    if (outfit.band) { ctx.fillStyle = outfit.band; ctx.fillRect(c[0] - R, c[1] - R * 0.42, R * 2, R * 0.24); }
    ctx.restore();
    disc(); ctx.strokeStyle = INK; ctx.lineWidth = ink; ctx.stroke();
    for (const s of [-1, 1]) eye(ctx, c[0] + s * R * 0.36, c[1] + R * 0.08, R, face, time, s);
    mouth(ctx, c[0], c[1] + R * 0.48, R, face);
    return;
  }
  // Facing the rock: the back of the head, all hair, with spikes on the crown and the headband round it. As the climber
  // looks to one side the face comes round on that side: a cheek, an eye, the nose.
  const turn = Math.max(-1, Math.min(1, gx * 1.4));
  const s = turn >= 0 ? 1 : -1, a = Math.abs(turn);
  const look = Math.max(-1, Math.min(1, -gy));
  ctx.fillStyle = outfit.hair;
  ctx.strokeStyle = INK;
  ctx.lineWidth = ink * 0.8;
  for (const [dx, h] of [[-0.42, 1.18], [0, 1.32], [0.4, 1.16]] as const) {
    const x = c[0] + (dx - turn * 0.15) * R;
    ctx.beginPath(); ctx.moveTo(x - R * 0.26, c[1] - R * 0.75); ctx.lineTo(x + R * 0.05, c[1] - R * h); ctx.lineTo(x + R * 0.26, c[1] - R * 0.75); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // Ears: the far one slides in behind as the head turns.
  for (const e of [-1, 1]) {
    const away = e === s;
    if (away && a > 0.35) continue;
    const ex = c[0] + e * R * (away ? 0.98 : 0.98 - 0.75 * a);
    ctx.fillStyle = outfit.skin; ctx.strokeStyle = INK; ctx.lineWidth = ink * 0.7;
    ctx.beginPath(); ctx.ellipse(ex, c[1] + R * 0.1 - look * R * 0.15, R * 0.2, R * 0.27, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  disc(); ctx.fillStyle = outfit.hair; ctx.fill();
  ctx.save(); disc(); ctx.clip();
  if (a > 0.12) {
    // The face's side.
    ctx.fillStyle = outfit.skin;
    ctx.beginPath(); ctx.ellipse(c[0] + s * R * (1.32 - 0.62 * a), c[1] + R * 0.12 - look * R * 0.12, R * 0.95, R * 1.0, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (outfit.band) { ctx.fillStyle = outfit.band; ctx.fillRect(c[0] - R - 2, c[1] - R * 0.36 + look * R * 0.22, R * 2 + 4, R * 0.26); }
  ctx.restore();
  disc(); ctx.strokeStyle = INK; ctx.lineWidth = ink; ctx.stroke();
  // The visible ear sits over the hair.
  if (a > 0.12) {
    const ex = c[0] - s * R * (0.98 - 0.75 * a);
    ctx.fillStyle = outfit.skin; ctx.strokeStyle = INK; ctx.lineWidth = ink * 0.7;
    ctx.beginPath(); ctx.ellipse(ex, c[1] + R * 0.1 - look * R * 0.15, R * 0.17, R * 0.24, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  if (a > 0.45) {
    // Nose, eye and mouth on the turned side.
    const fx0 = c[0] + s * R * (0.98 - 0.08 * (1 - a));
    ctx.fillStyle = outfit.skin; ctx.strokeStyle = INK; ctx.lineWidth = ink * 0.7;
    ctx.beginPath(); ctx.ellipse(fx0 + s * R * 0.08, c[1] + R * 0.12 - look * R * 0.2, R * 0.16, R * 0.13, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    eye(ctx, c[0] + s * R * (0.4 + 0.25 * a), c[1] - R * 0.02 - look * R * 0.22, R, face, time, s);
    mouth(ctx, c[0] + s * R * (0.55 + 0.2 * a), c[1] + R * 0.5 - look * R * 0.15, R * 0.75, face);
  }
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, face: Face, time: number, side: number): void {
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 2.5;
  const r = R * 0.13;
  if (face === 'happy') { ctx.beginPath(); ctx.arc(x, y + r, r * 1.3, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); return; }
  if (face === 'dizzy') {
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 26; i++) { const a = i * 0.5 + time * 6 * side, rr = (i / 26) * r * 1.6; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.stroke();
    return;
  }
  if (face === 'strain') {
    ctx.beginPath(); ctx.moveTo(x - r * 1.3, y - r); ctx.lineTo(x + r * 0.6 * side, y); ctx.lineTo(x - r * 1.3, y + r); ctx.stroke();
    brow(ctx, x, y - r * 2.2, r, -0.35 * side);
    return;
  }
  if (face === 'calm') { ctx.beginPath(); ctx.moveTo(x - r * 1.2, y); ctx.lineTo(x + r * 1.2, y); ctx.stroke(); return; }
  const big = face === 'scared' || face === 'surprised';
  if (big) {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.6, r * 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(x + r * 0.4 * side, y, r * 0.7, 0, Math.PI * 2); ctx.fill();
    brow(ctx, x, y - r * 3, r, face === 'scared' ? 0.3 * side : 0);
    return;
  }
  ctx.beginPath(); ctx.ellipse(x, y, r * 0.9, r * 1.4, 0, 0, Math.PI * 2); ctx.fill();
  brow(ctx, x, y - r * 2.4, r, -0.1 * side);
}

function brow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, tilt: number): void {
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x - r * 1.5, y + tilt * r * 2); ctx.lineTo(x + r * 1.5, y - tilt * r * 2); ctx.stroke();
}

function mouth(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, face: Face): void {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  const r = R * 0.22;
  if (face === 'happy') {
    ctx.fillStyle = '#9E2B3A';
    ctx.beginPath(); ctx.arc(x, y - r * 0.4, r * 1.3, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (face === 'surprised' || face === 'scared' || face === 'dizzy') {
    ctx.fillStyle = '#9E2B3A';
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.55, r * (face === 'surprised' ? 0.8 : 0.5), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (face === 'strain') {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.roundRect(x - r, y - r * 0.35, r * 2, r * 0.7, 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(x - r * 0.7, y); ctx.quadraticCurveTo(x, y + (face === 'calm' ? r * 0.5 : 0.1), x + r * 0.7, y); ctx.stroke();
  }
}

// ---------------------------------------------------------------- effects

const TONE: Record<string, string> = { hit: '#FFD93D', oops: '#FF6B5A', effort: '#7FD3F7', joy: '#FFD93D' };

function drawFx(ctx: CanvasRenderingContext2D, P: (p: V3) => P2, scale: number, j: Joints, fx: Fx, time: number): void {
  const k = j.k;
  const head = P(j.head);
  const R = Math.max(10, 0.165 * k * scale);
  if (fx.speed) {
    const at = P(fx.speed.at), ahead = P(add3(fx.speed.at, mul3(fx.speed.dir, 0.1)));
    let dx = ahead[0] - at[0], dy = ahead[1] - at[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    for (let i = -2; i <= 2; i++) {
      const ox = -dy * i * 7, oy = dx * i * 7, len = 16 + 8 * ((i + 4) % 2);
      poly(ctx, [[at[0] - dx * 16 + ox, at[1] - dy * 16 + oy], [at[0] - dx * (16 + len) + ox, at[1] - dy * (16 + len) + oy]], false);
      ctx.stroke();
    }
  }
  if (fx.puff) {
    // Chalk: a small round cloud. Dust: clouds rolling out to both sides along the pads.
    const c = P(fx.puff.at);
    const t = fx.puff.t;
    ctx.globalAlpha = Math.max(0, 1 - t * t);
    ctx.fillStyle = fx.puff.dust ? '#F3E3B8' : '#FFFFFF';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    const puffs: [number, number, number][] = fx.puff.dust
      ? [[-0.25, 0, 0.1], [0.25, 0, 0.1], [-0.5, -0.04, 0.08], [0.5, -0.04, 0.08], [-0.12, -0.1, 0.07], [0.14, -0.11, 0.07]]
      : [[0, 0, 0.045], [-0.05, -0.03, 0.035], [0.05, -0.035, 0.035], [0, -0.07, 0.03]];
    for (const [dx, dy, r] of puffs) {
      const spread = fx.puff.dust ? 0.5 + t : 0.7 + 0.6 * t;
      ctx.beginPath(); ctx.arc(c[0] + dx * spread * scale, c[1] + (dy - (fx.puff.dust ? 0.06 * t : 0.04 * t)) * scale, r * (0.7 + 0.6 * t) * scale, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (fx.sweat) {
    for (let i = 0; i < 2; i++) {
      const ph = (time * 1.5 + i * 0.5) % 1, s = i ? 1 : -1;
      const p: P2 = [head[0] + s * (R + 6 + 18 * ph), head[1] - R * 0.6 - 12 * Math.sin(Math.PI * ph) + 22 * ph];
      ctx.fillStyle = C.sky0;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p[0], p[1] - 7); ctx.quadraticCurveTo(p[0] + 5, p[1] + 1, p[0], p[1] + 4); ctx.quadraticCurveTo(p[0] - 5, p[1] + 1, p[0], p[1] - 7); ctx.fill(); ctx.stroke();
    }
  }
  if (fx.strain > 0.75) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const a = -0.6 + i * 0.6, x0 = head[0] + s * (R + 8), y0 = head[1] + a * R;
      poly(ctx, [[x0, y0], [x0 + s * 8, y0 + a * 4 + Math.sin(time * 40 + i) * 1.5]], false);
      ctx.stroke();
    }
  }
  if (fx.stars) for (let i = 0; i < 3; i++) { const a = time * 3 + (i * Math.PI * 2) / 3; star(ctx, head[0] + Math.cos(a) * R * 1.3, head[1] - R * 1.1 + Math.sin(a) * R * 0.3, 7, '#FFD93D'); }
  if (fx.sfx) {
    const t = fx.sfx.t;
    const pop = t < 0.18 ? 0.6 + 0.55 * (t / 0.18) : t < 0.3 ? 1.15 - 0.15 * ((t - 0.18) / 0.12) : 1;
    const alpha = t > 0.8 ? Math.max(0, 1 - (t - 0.8) / 0.2) : 1;
    const c = P(fx.sfx.at);
    const size = Math.round(Math.max(20, Math.min(34, 0.2 * scale)) * pop);
    const W = ctx.canvas.width / (ctx.getTransform().a || 1);
    sfx(ctx, Math.max(60, Math.min(W - 60, c[0] + 0.25 * scale)), Math.max(30, c[1] - 0.22 * scale), fx.sfx.text, fx.sfx.tone === 'oops' ? 0.14 : -0.12, TONE[fx.sfx.tone] ?? '#FFD93D', size, alpha);
  }
}

/** Bold comic lettering in a spiky burst. */
function sfx(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, rot: number, fill: string, size: number, alpha: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.font = `${size}px Bangers, 'Baloo 2', 'Arial Black', sans-serif`;
  const w = ctx.measureText(text).width;
  ctx.beginPath();
  const n = 14;
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, rr = i % 2 ? 0.62 : 0.84; ctx.lineTo(Math.cos(a) * (w * rr + 6), Math.sin(a) * (size * rr + 4)); }
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5;
  ctx.strokeText(text, 0, 2);
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 2);
  ctx.restore();
}
