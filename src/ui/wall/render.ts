// Canvas wall renderer (05a §1.4, 17 §2). Draws one frame from a camera and a pose; WallCanvas animates between
// them. The figure is posed from the same body points the engine uses for reach, so what you see is what the reach
// check measured.

import type { Athlete } from '../../sim/character';
import type { HoldType, Limb, SizeClass } from '../../sim/types';
import { bodyPoints, freeState, limbKind, reachRadius, type ClimbState, type HoldG, type RouteGeom } from '../../sim/wall';
import { K_LAT, LIMBS, project, projectS, toScreen, type Cam, type Pose } from './pose';

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
  /** Limb ends on screen, so a tap on the figure can pick a limb. */
  limbs: { limb: Limb; px: number; py: number }[];
  scale: number;
}

/** Extras for one frame: hide the reach shading mid-move, and a word over the wall at the end of an attempt. */
export interface FrameExtras { envelope: boolean; banner?: { text: string; colour: string; alpha: number; y: number } | undefined }

const SIZE_M: Record<SizeClass, number> = { xs: 0.05, s: 0.08, m: 0.12, l: 0.17, xl: 0.24 };

const C = {
  bg: '#101A16', ground: '#7D6F4E', pad: '#2B5C86', rockBody: '#665D4B', lip: '#4E4639',
  hold: '#D6CBB0', holdEdge: '#20302A', target: '#E9B85C', body: '#F2EEE4', bodyFar: '#A9A496', limbSel: '#E9B85C', text: '#EEF1EC',
};

/** Face colour by angle: pale on slabs, darker as the rock steepens, so steepness reads at a glance. */
function faceColour(angle: number): string {
  const t = Math.min(1, Math.max(0, (angle - 75) / 90));
  const a = [168, 157, 130];
  const b = [92, 84, 68];
  const c = a.map((v, i) => Math.round(v + (b[i]! - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function drawWall(ctx: CanvasRenderingContext2D, w: number, h: number, v: WallView, pose: Pose, cam: Cam, extras: FrameExtras): Layout {
  const { geom } = v;
  const wall = geom.route.wall;
  const top = wall[wall.length - 1]!.y1;
  const S = toScreen(cam, w, h);
  const scale = cam.scale;
  const xs = geom.list.map((hd) => hd.x);
  const x0 = Math.min(-1.0, Math.min(...xs) - 0.25);
  const x1 = Math.max(1.0, Math.max(...xs) + 0.25);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);

  // Rock body behind the face, then the face segment by segment, shaded by steepness.
  const edge = (x: number, y: number) => S(...project(wall, x, y));
  const ys: number[] = [];
  for (let i = 0; i <= 24; i++) ys.push((top * i) / 24);
  const right = ys.map((y) => edge(x1, y));
  const topRight = right[right.length - 1]!;
  const [, gy] = S(0, 0);
  ctx.fillStyle = C.rockBody;
  ctx.beginPath();
  ys.forEach((y, i) => { const p = edge(x0, y); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
  ctx.lineTo(topRight[0] + 0.6 * scale, topRight[1] + 0.1 * scale);
  ctx.lineTo(Math.max(right[0]![0] + 0.6 * scale, topRight[0] + 0.6 * scale), gy);
  ctx.closePath();
  ctx.fill();
  for (const seg of wall) {
    const n = 6;
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) pts.push(edge(x0, seg.y0 + ((seg.y1 - seg.y0) * i) / n));
    for (let i = n; i >= 0; i--) pts.push(edge(x1, seg.y0 + ((seg.y1 - seg.y0) * i) / n));
    ctx.fillStyle = faceColour(seg.angle);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = C.lip;
  ctx.lineWidth = 2;
  for (const seg of wall.slice(1)) {
    const a = edge(x0, seg.y0);
    const b = edge(x1, seg.y0);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  const lipL = edge(x0, top);
  ctx.strokeStyle = '#B9AE93';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(lipL[0], lipL[1]); ctx.lineTo(topRight[0], topRight[1]); ctx.stroke();

  // Ground and pads.
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, gy, w, Math.max(0, h - gy));
  for (const p of geom.route.protection.filter((x) => x.kind === 'pad_zone')) {
    const pw = p.width_m ?? 2;
    const [a] = S(...project(wall, (p.x ?? 0) - pw / 2, 0));
    ctx.fillStyle = C.pad;
    ctx.fillRect(a - 0.7 * scale, gy - 0.09 * scale, pw * 0.5 * scale + 0.9 * scale, 0.09 * scale);
  }

  // Reach envelope for the selected limb (a circle in surface space, projected).
  if (v.limb && extras.envelope) {
    const kind = limbKind(v.limb);
    const bp = bodyPoints(geom, v.ath, freeState(v.climb, v.limb));
    const c = kind === 'hand' ? bp.shoulder : bp.hip;
    const R = reachRadius(v.ath, kind, v.climb.posture);
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * Math.PI * 2;
      const [sx, sy] = S(...projectS(wall, c.x + R * Math.cos(t), Math.max(0, c.s + R * Math.sin(t))));
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

  // Holds, then the figure, then rings and labels on top so the body never hides a target.
  const occupied = new Set(Object.values(v.climb.anchors));
  const layout: Layout['holds'] = [];
  const sorted = [...geom.list].sort((a, b) => a.y - b.y).filter((hd) => v.visible(hd.id));
  for (const hold of sorted) {
    const [sx, sy] = S(...project(wall, hold.x, hold.y));
    layout.push({ id: hold.id, px: sx, py: sy });
    drawHold(ctx, hold, sx, sy, scale);
  }
  const limbs = drawFigure(ctx, pose, S, scale, v.limb);
  for (const hold of sorted) {
    const [sx, sy] = S(...project(wall, hold.x, hold.y));
    drawRings(ctx, hold, sx, sy, scale, {
      occupied: occupied.has(hold.id), target: v.targets.get(hold.id), selected: v.selected === hold.id, finish: hold.id === geom.route.finish_hold,
    });
  }
  drawLimbTags(ctx, limbs, scale, v.limb);

  if (extras.banner && extras.banner.alpha > 0) {
    ctx.globalAlpha = extras.banner.alpha;
    ctx.font = '700 34px "Barlow Condensed", "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 6;
    ctx.strokeStyle = C.bg;
    ctx.strokeText(extras.banner.text, w / 2, h * extras.banner.y);
    ctx.fillStyle = extras.banner.colour;
    ctx.fillText(extras.banner.text, w / 2, h * extras.banner.y);
    ctx.globalAlpha = 1;
  }
  return { holds: layout, limbs, scale };
}

function holdRadius(hold: HoldG, scale: number): number {
  return Math.max(6, (SIZE_M[hold.size] * scale) / 2);
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

function drawHold(ctx: CanvasRenderingContext2D, hold: HoldG, x: number, y: number, scale: number): void {
  const r = holdRadius(hold, scale);
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
}

function drawRings(
  ctx: CanvasRenderingContext2D, hold: HoldG, x: number, y: number, scale: number,
  o: { occupied: boolean; target: TargetKind | undefined; selected: boolean; finish: boolean },
): void {
  const r = holdRadius(hold, scale);
  if (o.finish) {
    // The top hold is marked in white, not the amber that means "you can move here".
    ctx.fillStyle = C.text;
    ctx.font = '600 10px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('▲ TOP', x, y - r - 6);
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

/** Two-bone limb: the joint goes on the side `prefer` points to (screen vector), or straight if out of reach. */
function joint(a: [number, number], b: [number, number], l1: number, l2: number, prefer: [number, number]): [number, number] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const d = Math.hypot(dx, dy) || 1;
  if (d >= l1 + l2 - 1e-6) return [a[0] + (dx * l1) / (l1 + l2), a[1] + (dy * l1) / (l1 + l2)];
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const off = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const ux = dx / d;
  const uy = dy / d;
  let nx = -uy;
  let ny = ux;
  if (nx * prefer[0] + ny * prefer[1] < 0) { nx = -nx; ny = -ny; }
  return [a[0] + ux * along + nx * off, a[1] + uy * along + ny * off];
}

/**
 * The figure: torso, head, two-bone arms and legs with hands and feet. The far-side limbs (left, seen from the
 * climber's right) are drawn behind the torso in a darker tone so the four limbs stay distinguishable. Returns the limb
 * ends on screen.
 */
function drawFigure(
  ctx: CanvasRenderingContext2D, pose: Pose, S: (X: number, Y: number) => [number, number], scale: number, selected: Limb | null,
): Layout['limbs'] {
  const k = pose.k;
  const sh = S(...pose.sh);
  const hip = S(...pose.hip);
  const ax = sh[0] - hip[0];
  const ay = sh[1] - hip[1];
  const al = Math.hypot(ax, ay) || 1;
  // Across the torso, screen-left to screen-right.
  let px = -ay / al;
  let py = ax / al;
  if (px < 0) { px = -px; py = -py; }
  // Shoulders about 0.36 m across and hips 0.24 m, seen at the view's lateral compression.
  const shW = 0.18 * K_LAT * k * scale;
  const hipW = 0.12 * K_LAT * k * scale;
  const shoulder = (side: number): [number, number] => [sh[0] + px * shW * side, sh[1] + py * shW * side];
  const hipAt = (side: number): [number, number] => [hip[0] + px * hipW * side, hip[1] + py * hipW * side];
  const upper = 0.31 * k * scale;
  const fore = 0.3 * k * scale;
  const thigh = 0.43 * k * scale;
  const shin = 0.42 * k * scale;
  const bone = Math.max(3.5, 0.06 * k * scale);
  const line = (pts: [number, number][], colour: string, width: number) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  const ends: Layout['limbs'] = [];
  const parts: { limb: Limb; far: boolean; pts: [number, number][] }[] = [];
  for (const l of LIMBS) {
    const side = l === 'LH' || l === 'LF' ? -1 : 1;
    const end = S(...pose.ends[l]);
    if (limbKind(l) === 'hand') {
      const s0 = shoulder(side);
      // Seen from the side, elbows drop and sit back off the wall.
      const el = joint(s0, end, upper, fore, [-0.6 + 0.2 * side, 1]);
      parts.push({ limb: l, far: side < 0, pts: [s0, el, end] });
    } else {
      const h0 = hipAt(side);
      // Knees point into the wall and a little up, as on a climber seen from the side.
      const kn = joint(h0, end, thigh, shin, [1, -0.25 + 0.15 * side]);
      parts.push({ limb: l, far: side < 0, pts: [h0, kn, end] });
    }
    ends.push({ limb: l, px: end[0], py: end[1] });
  }
  const limb = (p: (typeof parts)[number]) => {
    const colour = p.limb === selected ? C.limbSel : p.far ? C.bodyFar : C.body;
    line(p.pts, C.bg, bone + 3);
    line(p.pts, colour, bone);
    const end = p.pts[2]!;
    if (limbKind(p.limb) === 'hand') {
      ctx.beginPath();
      ctx.arc(end[0], end[1], Math.max(3, 0.04 * k * scale), 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.fill();
    } else {
      // The foot points into the wall (+x on screen).
      line([end, [end[0] + 0.1 * k * scale, end[1] + 0.01 * scale]], colour, Math.max(3, bone * 0.8));
    }
  };
  // Far limbs, torso, near limbs, head.
  for (const p of parts.filter((q) => q.far)) limb(p);
  // The torso is a rounded capsule from hip to shoulder, slightly wider at the chest.
  const chestW = Math.max(9, 0.17 * k * scale);
  const waistW = Math.max(8, 0.14 * k * scale);
  const inset = (p: [number, number], q: [number, number], f: number): [number, number] => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  const chest = inset(sh, hip, Math.min(0.45, (chestW / 2) / al));
  const waist = inset(hip, sh, Math.min(0.45, (waistW / 2) / al));
  line([chest, waist], C.bg, chestW + 3);
  line([chest, inset(chest, waist, 0.5)], C.body, chestW);
  line([inset(chest, waist, 0.4), waist], C.body, waistW);
  for (const p of parts.filter((q) => !q.far)) limb(p);
  const head: [number, number] = [sh[0] + (ax / al) * 0.2 * k * scale - 0.03 * scale, sh[1] + (ay / al) * 0.2 * k * scale];
  ctx.beginPath();
  ctx.arc(head[0], head[1], Math.max(5, 0.085 * k * scale), 0, Math.PI * 2);
  ctx.fillStyle = C.body;
  ctx.fill();
  ctx.strokeStyle = C.bg;
  ctx.lineWidth = 2;
  ctx.stroke();
  return ends;
}

/** Limb tags beside each end; at small scales only the selected limb is tagged, so tags never pile up. */
function drawLimbTags(ctx: CanvasRenderingContext2D, ends: Layout['limbs'], scale: number, selected: Limb | null): void {
  ctx.font = '600 9px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  for (const e of ends) {
    if (scale < 110 && e.limb !== selected) continue;
    const lx = e.px - 16;
    const ly = e.py + (limbKind(e.limb) === 'hand' ? -12 : 14);
    ctx.fillStyle = e.limb === selected ? C.limbSel : C.bg;
    ctx.beginPath();
    ctx.roundRect(lx - 11, ly - 8, 22, 15, 4);
    ctx.fill();
    ctx.fillStyle = e.limb === selected ? '#1A1408' : C.text;
    ctx.fillText(e.limb, lx, ly + 3);
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

