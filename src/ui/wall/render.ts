// Canvas wall renderer (05a §1.4, 17 §2). Oblique side view: screen_x = −k_z·z(y) + k_lat·x, screen_y = y.
// The climber is posed from the four anchors and the body points the engine uses for reach, so what you see is
// what the reach check measured.

import type { Athlete } from '../../sim/character';
import type { HoldType, Limb, SizeClass } from '../../sim/types';
import {
  bodyPoints, freeState, limbKind, reachRadius, yOfS, zOfY, type ClimbState, type HoldG, type RouteGeom,
} from '../../sim/wall';

export const K_LAT = 0.5;
const K_Z = 1.0;
const OUT_SHOULDER = 0.28;
const OUT_HIP = 0.22;

export type TargetKind = 'legal' | 'dynamic' | 'mantle';

export interface WallView {
  geom: RouteGeom;
  ath: Athlete;
  climb: ClimbState;
  visible: (id: string) => boolean;
  limb: Limb | null;
  targets: Map<string, TargetKind>;
  selected: string | null;
  feetCut: boolean;
}

export interface Layout {
  holds: { id: string; px: number; py: number }[];
  toScreen: (X: number, Y: number) => [number, number];
}

const SIZE_M: Record<SizeClass, number> = { xs: 0.05, s: 0.08, m: 0.12, l: 0.17, xl: 0.24 };

const C = {
  bg: '#101A16', ground: '#7D6F4E', pad: '#2B5C86', padSeam: '#1C3F5E', rockBody: '#7A705A', face: '#8E836C', faceHi: '#A3987F',
  lip: '#5E5544', hold: '#D6CBB0', holdEdge: '#20302A', chalk: '#FFFFFF', reach: '#86C8F2', target: '#E9B85C', body: '#F2EEE4', limbSel: '#E9B85C',
};

function project(geom: RouteGeom, x: number, y: number): [number, number] {
  return [-K_Z * zOfY(geom.route.wall, y) + K_LAT * x, y];
}

function projectS(geom: RouteGeom, x: number, s: number, out = 0): [number, number] {
  const y = yOfS(geom.route.wall, s);
  const [X, Y] = project(geom, x, y);
  return [X - out, Y];
}

export function drawWall(ctx: CanvasRenderingContext2D, w: number, h: number, v: WallView): Layout {
  const { geom } = v;
  const wall = geom.route.wall;
  const top = wall[wall.length - 1]!.y1;
  // The face spans the route width around the line, which the generator centres on x = 0.
  const xs = geom.list.map((hd) => hd.x);
  const x0 = Math.min(-1.0, Math.min(...xs) - 0.25);
  const x1 = Math.max(1.0, Math.max(...xs) + 0.25);
  // Bounds in projected metres.
  const ys: number[] = [];
  for (let i = 0; i <= 24; i++) ys.push((top * i) / 24);
  let minX = Infinity, maxX = -Infinity;
  for (const y of ys) {
    const a = project(geom, x0, y)[0];
    const b = project(geom, x1, y)[0];
    minX = Math.min(minX, a, b);
    maxX = Math.max(maxX, a, b);
  }
  minX -= 0.9; // room for the climber's body off the wall
  maxX += 0.5;
  const minY = -0.25;
  const maxY = top + 0.6;
  const scale = Math.min(w / (maxX - minX), h / (maxY - minY));
  const ox = (w - (maxX - minX) * scale) / 2;
  const toScreen = (X: number, Y: number): [number, number] => [ox + (X - minX) * scale, h - (Y - minY) * scale - (h - (maxY - minY) * scale) / 2];

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);

  // Rock body: the face's left edge up to the top, across, and down behind.
  const left = ys.map((y) => toScreen(...project(geom, x0, y)));
  const right = ys.map((y) => toScreen(...project(geom, x1, y)));
  const gy = toScreen(minX, 0)[1];
  const [gx1] = toScreen(maxX, 0);
  ctx.fillStyle = C.rockBody;
  ctx.beginPath();
  ctx.moveTo(left[0]![0], left[0]![1]);
  for (const p of left) ctx.lineTo(p[0], p[1]);
  const topRight = right[right.length - 1]!;
  ctx.lineTo(topRight[0] + 0.6 * scale, topRight[1] + 0.1 * scale);
  ctx.lineTo(Math.max(gx1, topRight[0] + 0.6 * scale), gy);
  ctx.closePath();
  ctx.fill();
  // The climbable face band.
  ctx.fillStyle = C.face;
  ctx.beginPath();
  left.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i]![0], right[i]![1]);
  ctx.closePath();
  ctx.fill();
  // Segment breaks and the lip.
  ctx.strokeStyle = C.lip;
  ctx.lineWidth = 2;
  for (const seg of wall.slice(1)) {
    const a = toScreen(...project(geom, x0, seg.y0));
    const b = toScreen(...project(geom, x1, seg.y0));
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  ctx.strokeStyle = C.faceHi;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(left[left.length - 1]![0], left[left.length - 1]![1]); ctx.lineTo(topRight[0], topRight[1]); ctx.stroke();

  // Ground and pads.
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, gy, w, h - gy);
  for (const p of geom.route.protection.filter((x) => x.kind === 'pad_zone')) {
    const [a] = toScreen(...project(geom, (p.x ?? 0) - (p.width_m ?? 2) / 2, 0));
    const pw = (p.width_m ?? 2) * K_LAT * scale + 0.9 * scale;
    ctx.fillStyle = C.pad;
    ctx.fillRect(a - 0.7 * scale, gy - 0.08 * scale, pw, 0.08 * scale);
  }

  // Reach envelope for the selected limb (a circle in surface space, projected).
  if (v.limb) {
    const kind = limbKind(v.limb);
    const bp = bodyPoints(geom, v.ath, freeState(v.climb, v.limb));
    const c = kind === 'hand' ? bp.shoulder : bp.hip;
    const R = reachRadius(v.ath, kind, v.climb.posture);
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * Math.PI * 2;
      const [X, Y] = projectS(geom, c.x + R * Math.cos(t), Math.max(0, c.s + R * Math.sin(t)));
      const [sx, sy] = toScreen(X, Y);
      if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(134, 200, 242, 0.13)';
    ctx.fill();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(134, 200, 242, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Holds.
  const occupied = new Set(Object.values(v.climb.anchors));
  const layout: Layout['holds'] = [];
  const sorted = [...geom.list].sort((a, b) => a.y - b.y);
  for (const hold of sorted) {
    if (!v.visible(hold.id)) continue;
    const [sx, sy] = toScreen(...project(geom, hold.x, hold.y));
    layout.push({ id: hold.id, px: sx, py: sy });
    const target = v.targets.get(hold.id);
    drawHold(ctx, hold, sx, sy, scale, {
      occupied: occupied.has(hold.id), target, selected: v.selected === hold.id, finish: hold.id === geom.route.finish_hold,
    });
  }

  drawClimber(ctx, v, toScreen, scale);
  return { holds: layout, toScreen };
}

function holdShape(ctx: CanvasRenderingContext2D, type: HoldType, x: number, y: number, r: number, orientation: number): void {
  ctx.beginPath();
  switch (type) {
    case 'crimp': case 'edge':
      ctx.roundRect(x - r, y - r * 0.28, 2 * r, r * 0.56, 2);
      break;
    case 'jug': case 'horn':
      ctx.roundRect(x - r, y - r * 0.6, 2 * r, r * 1.2, r * 0.4);
      break;
    case 'pinch': case 'sidepull': case 'gaston':
      ctx.ellipse(x, y, r * 0.38, r * 0.9, (orientation * Math.PI) / 180 * 0.25, 0, Math.PI * 2);
      break;
    case 'undercling':
      ctx.ellipse(x, y, r, r * 0.4, 0, 0, Math.PI);
      ctx.closePath();
      break;
    case 'pocket1': case 'pocket2': case 'pocket3':
      ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
      break;
    case 'volume':
      ctx.moveTo(x - r * 1.1, y + r * 0.7); ctx.lineTo(x, y - r * 0.9); ctx.lineTo(x + r * 1.1, y + r * 0.7); ctx.closePath();
      break;
    case 'smear':
      ctx.ellipse(x, y, r * 0.9, r * 0.5, 0, 0, Math.PI * 2);
      break;
    case 'foot_chip':
      ctx.ellipse(x, y, r * 0.7, r * 0.42, 0, 0, Math.PI * 2);
      break;
    default:
      ctx.ellipse(x, y, r * 1.1, r * 0.6, 0, 0, Math.PI * 2);
  }
}

function drawHold(
  ctx: CanvasRenderingContext2D, hold: HoldG, x: number, y: number, scale: number,
  o: { occupied: boolean; target: TargetKind | undefined; selected: boolean; finish: boolean },
): void {
  const r = Math.max(6, (SIZE_M[hold.size] * scale) / 2);
  holdShape(ctx, hold.type, x, y, r, hold.orientation);
  if (hold.type === 'smear') {
    ctx.fillStyle = 'rgba(214, 203, 176, 0.35)';
    ctx.fill();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = 'rgba(238, 241, 236, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.fillStyle = hold.type.startsWith('pocket') ? '#3B352A' : C.hold;
    ctx.fill();
    ctx.strokeStyle = C.holdEdge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  if (o.finish) {
    ctx.fillStyle = C.target;
    ctx.font = '600 10px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TOP', x, y - r - 5);
  }
  if (o.occupied) {
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (o.target) {
    ctx.beginPath();
    ctx.arc(x, y, r + 6, 0, Math.PI * 2);
    ctx.strokeStyle = C.target;
    ctx.lineWidth = o.selected ? 4 : 2;
    if (o.target === 'dynamic') ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (o.selected) {
      ctx.beginPath();
      ctx.arc(x, y, r + 14, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(233, 184, 92, 0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

function drawClimber(ctx: CanvasRenderingContext2D, v: WallView, toScreen: Layout['toScreen'], scale: number): void {
  const { geom, ath, climb } = v;
  const bp = bodyPoints(geom, ath, climb);
  const sh = toScreen(...projectS(geom, bp.shoulder.x, bp.shoulder.s, OUT_SHOULDER));
  const hip = toScreen(...projectS(geom, bp.hip.x, bp.hip.s, OUT_HIP));
  const anchorAt = (l: Limb): [number, number] | null => {
    const id = climb.anchors[l];
    if (!id || (climb.feet_cut && limbKind(l) === 'foot')) return null;
    const hd = geom.holds.get(id);
    return hd ? toScreen(...project(geom, hd.x, hd.y)) : null;
  };
  const limbPath = (from: [number, number], to: [number, number] | null, kind: 'arm' | 'leg', side: number): [number, number][] => {
    const L = (kind === 'arm' ? 0.62 : 0.8) * (ath.body.height_cm / 170) * scale;
    const end: [number, number] = to ?? [from[0] - 0.08 * scale * side, from[1] + (kind === 'arm' ? 0.45 : 0.6) * scale];
    const mx = (from[0] + end[0]) / 2;
    const my = (from[1] + end[1]) / 2;
    const d = Math.hypot(end[0] - from[0], end[1] - from[1]);
    const bend = Math.sqrt(Math.max(0, (L / 2) ** 2 - (d / 2) ** 2));
    // Bend the joint away from the wall (towards −x on screen).
    const nx = -(end[1] - from[1]) / (d || 1);
    const ny = (end[0] - from[0]) / (d || 1);
    const sign = nx < 0 ? 1 : -1;
    return [from, [mx + sign * nx * bend, my + sign * ny * bend], end];
  };
  const parts: { pts: [number, number][]; limb: Limb }[] = [
    { pts: limbPath(sh, anchorAt('LH'), 'arm', 1), limb: 'LH' },
    { pts: limbPath(sh, anchorAt('RH'), 'arm', -1), limb: 'RH' },
    { pts: limbPath(hip, anchorAt('LF'), 'leg', 1), limb: 'LF' },
    { pts: limbPath(hip, anchorAt('RF'), 'leg', -1), limb: 'RF' },
  ];
  const stroke = (pts: [number, number][], colour: string, width: number) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  const w = Math.max(4, 0.06 * scale);
  // Outline pass, then fill pass; the selected limb in amber.
  stroke([sh, hip], C.bg, w + 4);
  for (const p of parts) stroke(p.pts, C.bg, w + 4);
  stroke([sh, hip], C.body, w);
  for (const p of parts) stroke(p.pts, p.limb === v.limb ? C.limbSel : C.body, w);
  // Head, offset up and away from the wall.
  const hx = sh[0] - 0.06 * scale;
  const hy = sh[1] - 0.2 * scale;
  ctx.beginPath();
  ctx.arc(hx, hy, Math.max(7, 0.1 * scale), 0, Math.PI * 2);
  ctx.fillStyle = C.body;
  ctx.fill();
  ctx.strokeStyle = C.bg;
  ctx.lineWidth = 3;
  ctx.stroke();
  // Limb tags at the ends.
  ctx.font = '600 9px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  for (const p of parts) {
    const end = p.pts[p.pts.length - 1]!;
    const lx = end[0] - 16;
    const ly = end[1] + (limbKind(p.limb) === 'hand' ? -12 : 14);
    ctx.fillStyle = p.limb === v.limb ? C.limbSel : C.bg;
    ctx.beginPath();
    ctx.roundRect(lx - 11, ly - 8, 22, 15, 4);
    ctx.fill();
    ctx.fillStyle = p.limb === v.limb ? '#1A1408' : '#EEF1EC';
    ctx.fillText(p.limb, lx, ly + 3);
  }
}

/** Nearest visible hold to a tap, within `radius` px. */
export function hitHold(layout: Layout, x: number, y: number, radius = 28): string | null {
  let best: string | null = null;
  let bestD = radius;
  for (const h of layout.holds) {
    const d = Math.hypot(h.px - x, h.py - y);
    if (d < bestD) { bestD = d; best = h.id; }
  }
  return best;
}
