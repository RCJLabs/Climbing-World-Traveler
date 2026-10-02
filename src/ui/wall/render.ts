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
  /** The state the selected move would leave, drawn as a ghost behind the climber (17 §2). */
  ghost?: ClimbState | null | undefined;
}

export interface Layout {
  holds: { id: string; px: number; py: number }[];
  /** Limb ends on screen, so a tap on the figure can pick a limb. */
  limbs: { limb: Limb; px: number; py: number }[];
  scale: number;
}

/** Extras for one frame: hide the reach shading mid-move, and a word over the wall at the end of an attempt. */
export interface FrameExtras { envelope: boolean; banner?: { text: string; colour: string; alpha: number; y: number } | undefined; ghost?: Pose | null | undefined }

const SIZE_M: Record<SizeClass, number> = { xs: 0.05, s: 0.08, m: 0.12, l: 0.17, xl: 0.24 };

/** Flat Dusk (docs/23 §4). Signals: yellow = where to go, teal = holding and safe, coral = danger. */
export const C = {
  ink: '#1B1B3A', text: '#F5F2FF', target: '#FFE066', safe: '#2EC4B6', danger: '#FF8C6B',
  sky: ['#2B2D42', '#46385E', '#7A4B6E', '#C0607A', '#F28F6B', '#F7B267'], sun: '#FFD08A', hills: '#3D3A5C', trees: '#26263F',
  ground: '#2A2A45', pad: '#1B998B', padTop: '#23B5A5', rockBody: '#8E3B46', rockEdge: '#C8553D', lip: '#FFC48A',
  hold: '#FFE8C2', holdShade: '#B8553E', pocket: '#8E3B46',
  jacket: '#2EC4B6', jacketShade: '#20A396', skin: '#F4C095', skinFar: '#E0A97F', trousers: '#1B1B3A', trousersFar: '#121230',
  shoe: '#FFE066', shoeFar: '#E6C84F', hair: '#1B1B3A',
};

/** Face tone by angle: pale on slabs, deeper as the rock steepens, so steepness reads at a glance. */
const FACE_STOPS: [number, [number, number, number]][] = [[70, [246, 181, 110]], [90, [242, 166, 90]], [115, [229, 143, 78]], [150, [212, 106, 67]]];
function faceColour(angle: number): string {
  const a = Math.min(FACE_STOPS[FACE_STOPS.length - 1]![0], Math.max(FACE_STOPS[0]![0], angle));
  let i = 0;
  while (i < FACE_STOPS.length - 2 && a > FACE_STOPS[i + 1]![0]) i++;
  const [a0, c0] = FACE_STOPS[i]!;
  const [a1, c1] = FACE_STOPS[i + 1]!;
  const t = (a - a0) / (a1 - a0);
  const c = c0.map((v, j) => Math.round(v + (c1[j]! - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** Sky in bands fixed to the screen; sun, hills and trees stand on the ground line, so they leave with it. */
function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, gy: number): void {
  const cuts = [0, 0.17, 0.32, 0.47, 0.61, 0.72, 1];
  C.sky.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, h * cuts[i]!, w, h * (cuts[i + 1]! - cuts[i]!) + 1); });
  if (gy > h + 0.2 * h) return;
  const u = Math.min(w, h);
  ctx.fillStyle = C.sun;
  ctx.beginPath(); ctx.arc(w * 0.18, gy - 0.1 * u, 0.1 * u, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.hills;
  ctx.beginPath(); ctx.moveTo(0, gy);
  [[0, 0.1], [0.15, 0.2], [0.33, 0.12], [0.51, 0.24], [0.72, 0.13], [1, 0.26]].forEach(([fx, fh]) => ctx.lineTo(w * fx!, gy - u * fh!));
  ctx.lineTo(w, gy); ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.trees;
  for (const [fx, fw, fh] of [[0.04, 0.06, 0.32], [0.12, 0.05, 0.22]] as const) {
    ctx.beginPath(); ctx.moveTo(w * fx, gy); ctx.lineTo(w * (fx + fw / 2), gy - u * fh); ctx.lineTo(w * (fx + fw), gy); ctx.closePath(); ctx.fill();
  }
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
  const [, gy] = S(0, 0);

  ctx.clearRect(0, 0, w, h);
  drawSky(ctx, w, h, gy);

  // Rock body behind the face, then the face segment by segment, toned by steepness, with a shaded right edge.
  const edge = (x: number, y: number) => S(...project(wall, x, y));
  const ys: number[] = [];
  for (let i = 0; i <= 24; i++) ys.push((top * i) / 24);
  const right = ys.map((y) => edge(x1, y));
  const topRight = right[right.length - 1]!;
  ctx.fillStyle = C.rockBody;
  ctx.beginPath();
  ys.forEach((y, i) => { const p = edge(x0, y); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
  ctx.lineTo(topRight[0] + 0.6 * scale, topRight[1] + 0.1 * scale);
  ctx.lineTo(Math.max(right[0]![0] + 0.6 * scale, topRight[0] + 0.6 * scale), gy);
  ctx.closePath();
  ctx.fill();
  const band = (xa: number, xb: number, y0: number, y1: number, fill: string) => {
    const n = 6;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) { const p = edge(xa, y0 + ((y1 - y0) * i) / n); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
    for (let i = n; i >= 0; i--) { const p = edge(xb, y0 + ((y1 - y0) * i) / n); ctx.lineTo(p[0], p[1]); }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  for (const seg of wall) {
    band(x0, x1, seg.y0, seg.y1, faceColour(seg.angle));
    band(x1 - 0.18, x1, seg.y0, seg.y1, C.rockEdge);
  }
  ctx.strokeStyle = C.rockEdge;
  ctx.lineWidth = 2;
  for (const seg of wall.slice(1)) {
    const a = edge(x0, seg.y0);
    const b = edge(x1, seg.y0);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  const lipL = edge(x0, top);
  ctx.strokeStyle = C.lip;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(lipL[0], lipL[1]); ctx.lineTo(topRight[0], topRight[1]); ctx.stroke();

  // Ground and pads.
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, gy, w, Math.max(0, h - gy));
  for (const p of geom.route.protection.filter((x) => x.kind === 'pad_zone')) {
    const pw = p.width_m ?? 2;
    const [a] = S(...project(wall, (p.x ?? 0) - pw / 2, 0));
    const pwPx = pw * 0.5 * scale + 0.9 * scale;
    ctx.fillStyle = C.pad;
    ctx.fillRect(a - 0.7 * scale, gy - 0.09 * scale, pwPx, 0.09 * scale);
    ctx.fillStyle = C.padTop;
    ctx.fillRect(a - 0.7 * scale, gy - 0.09 * scale, pwPx, 0.03 * scale);
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
    ctx.fillStyle = 'rgba(46, 196, 182, 0.14)';
    ctx.fill();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(46, 196, 182, 0.85)';
    ctx.lineWidth = 2;
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
  if (extras.ghost) drawGhost(ctx, extras.ghost, S, scale);
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
    ctx.font = '800 38px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = C.ink;
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

/** Flat holds: a shade under, the hold on top, no outline. Smears are friction, not holds: a dashed patch. Pockets are holes. */
function drawHold(ctx: CanvasRenderingContext2D, hold: HoldG, x: number, y: number, scale: number): void {
  const r = holdRadius(hold, scale);
  if (hold.type === 'smear') {
    holdShape(ctx, hold.type, x, y, r, hold.orientation);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = C.hold;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  const drop = Math.max(2, 0.02 * scale);
  holdShape(ctx, hold.type, x, y + drop, r, hold.orientation);
  ctx.fillStyle = C.holdShade;
  ctx.fill();
  holdShape(ctx, hold.type, x, y, r, hold.orientation);
  ctx.fillStyle = hold.type.startsWith('pocket') ? C.pocket : C.hold;
  ctx.fill();
  if (hold.type.startsWith('pocket')) { ctx.strokeStyle = C.hold; ctx.lineWidth = 2; ctx.stroke(); }
}

function drawRings(
  ctx: CanvasRenderingContext2D, hold: HoldG, x: number, y: number, scale: number,
  o: { occupied: boolean; target: TargetKind | undefined; selected: boolean; finish: boolean },
): void {
  const r = holdRadius(hold, scale);
  if (o.finish) {
    // The top hold is labelled in white, not the yellow that means "you can move here".
    ctx.font = '800 11px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.ink;
    ctx.strokeText('TOP', x, y - r - 7);
    ctx.fillStyle = C.text;
    ctx.fillText('TOP', x, y - r - 7);
  }
  if (o.occupied) {
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.strokeStyle = C.safe;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  if (o.target) {
    if (o.selected) {
      ctx.beginPath();
      ctx.arc(x, y, r + 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 224, 102, 0.22)';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, r + 7, 0, Math.PI * 2);
    ctx.strokeStyle = C.target;
    ctx.lineWidth = o.selected ? 4.5 : 3;
    if (o.target === 'dynamic') ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
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

let ghostCanvas: HTMLCanvasElement | null = null;

/**
 * Where the selected move leaves the body: the figure in one pale tone, drawn opaque off screen and laid down at 45%
 * behind the climber, so overlapping strokes do not darken and only what changes shows past the real figure.
 */
function drawGhost(ctx: CanvasRenderingContext2D, pose: Pose, S: (X: number, Y: number) => [number, number], scale: number): void {
  const c = ctx.canvas;
  ghostCanvas ??= document.createElement('canvas');
  const g = ghostCanvas;
  if (g.width !== c.width || g.height !== c.height) { g.width = c.width; g.height = c.height; }
  const gx = g.getContext('2d');
  if (!gx) return;
  gx.setTransform(1, 0, 0, 1, 0, 0);
  gx.clearRect(0, 0, g.width, g.height);
  gx.setTransform(ctx.getTransform());
  drawFigure(gx, pose, S, scale, null, C.text);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 0.45;
  ctx.drawImage(g, 0, 0);
  ctx.restore();
}

/**
 * The figure, flat: teal jacket, dark trousers, yellow shoes, no outlines. The far-side limbs (left, seen from the
 * climber's right) are drawn behind the torso a tone darker; the selected limb turns yellow. A `tint` draws every part
 * in that one colour (the ghost). Returns the limb ends on screen.
 */
function drawFigure(
  ctx: CanvasRenderingContext2D, pose: Pose, S: (X: number, Y: number) => [number, number], scale: number, selected: Limb | null, tint?: string,
): Layout['limbs'] {
  const P = tint ? Object.fromEntries(Object.keys(C).map((key) => [key, tint])) as unknown as typeof C : C;
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
  const arm = Math.max(4, 0.07 * k * scale);
  const leg = Math.max(5, 0.085 * k * scale);
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
  const parts: { limb: Limb; far: boolean; pts: [[number, number], [number, number], [number, number]] }[] = [];
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
    const sel = p.limb === selected;
    const [a, j, end] = p.pts;
    if (limbKind(p.limb) === 'hand') {
      // Sleeve to the elbow, skin below, so hands read against the rock.
      line([a, j], sel ? P.target : p.far ? P.jacketShade : P.jacket, arm * 1.15);
      line([j, end], sel ? P.target : p.far ? P.skinFar : P.skin, arm);
      ctx.beginPath();
      ctx.arc(end[0], end[1], Math.max(3.5, 0.05 * k * scale), 0, Math.PI * 2);
      ctx.fillStyle = sel ? P.target : p.far ? P.skinFar : P.skin;
      ctx.fill();
    } else {
      line(p.pts, sel ? P.target : p.far ? P.trousersFar : P.trousers, leg);
      // The shoe points into the wall (+x on screen).
      ctx.beginPath();
      ctx.ellipse(end[0] + 0.04 * k * scale, end[1], Math.max(5, 0.08 * k * scale), Math.max(2.5, 0.04 * k * scale), 0, 0, Math.PI * 2);
      ctx.fillStyle = p.far ? P.shoeFar : P.shoe;
      ctx.fill();
    }
  };
  // Far limbs, torso, near limbs, head.
  for (const p of parts.filter((q) => q.far)) limb(p);
  // The torso is a rounded capsule from hip to shoulder, slightly wider at the chest, shaded on the wall side.
  const chestW = Math.max(10, 0.2 * k * scale);
  const waistW = Math.max(9, 0.17 * k * scale);
  const inset = (p: [number, number], q: [number, number], f: number): [number, number] => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  const chest = inset(sh, hip, Math.min(0.45, (chestW / 2) / al));
  const waist = inset(hip, sh, Math.min(0.45, (waistW / 2) / al));
  line([chest, inset(chest, waist, 0.5)], P.jacket, chestW);
  line([inset(chest, waist, 0.4), waist], P.jacket, waistW);
  const off = (p: [number, number], d: number): [number, number] => [p[0] + px * d, p[1] + py * d];
  line([off(chest, chestW * 0.3), off(waist, waistW * 0.28)], P.jacketShade, chestW * 0.3);
  for (const p of parts.filter((q) => !q.far)) limb(p);
  const head: [number, number] = [sh[0] + (ax / al) * 0.2 * k * scale - 0.03 * scale, sh[1] + (ay / al) * 0.2 * k * scale];
  const hr = Math.max(6, 0.095 * k * scale);
  ctx.beginPath();
  ctx.arc(head[0], head[1], hr, 0, Math.PI * 2);
  ctx.fillStyle = P.skin;
  ctx.fill();
  // Hair over the back and crown of the head (the climber faces the wall, to the right).
  ctx.beginPath();
  ctx.arc(head[0] - hr * 0.2, head[1] - hr * 0.25, hr * 0.92, Math.PI * 0.75, Math.PI * 1.85);
  ctx.closePath();
  ctx.fillStyle = P.hair;
  ctx.fill();
  return ends;
}

/** Limb tags beside each end; at small scales only the selected limb is tagged, so tags never pile up. */
function drawLimbTags(ctx: CanvasRenderingContext2D, ends: Layout['limbs'], scale: number, selected: Limb | null): void {
  ctx.font = '800 11px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.textAlign = 'center';
  for (const e of ends) {
    if (scale < 110 && e.limb !== selected) continue;
    const lx = e.px - 16;
    const ly = e.py + (limbKind(e.limb) === 'hand' ? -13 : 15);
    ctx.fillStyle = e.limb === selected ? C.target : C.ink;
    ctx.beginPath();
    ctx.roundRect(lx - 12, ly - 8, 24, 16, 6);
    ctx.fill();
    ctx.fillStyle = e.limb === selected ? C.ink : C.text;
    ctx.fillText(e.limb, lx, ly + 4);
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

