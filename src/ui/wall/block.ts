// The block a problem is on, as the cartoon wall draws it (docs/25 §10). Built from the route itself, so every
// problem looks like its own climb: the face follows the wall's profile segment by segment (a slab leans back, a roof
// juts out over the pads), the face is as wide as its holds need, an arête is the block's edge with the line on it,
// a lip rounds over, and the block's size, depth, shoulders and markings vary with a seed from the route's id. The
// side of the block, which the three-quarter camera sees, is the profile in cross-section. Pure: no DOM.

import { stream } from '../../sim/rng';
import type { CircuitColour, Feature, Route } from '../../sim/types';
import { angleAt, zOfY } from '../../sim/wall';
import type { V3 } from './rig';

export interface FaceRow {
  y: number;
  z: number;
  /** Left and right edges of the face at this height. */
  xl: number;
  xr: number;
  angle: number;
  feature: Feature;
}

export interface Mark {
  /** A polyline on the face, in face coordinates (x, y), drawn in ink: cracks, scoops, texture. */
  pts: [number, number][];
  kind: 'crack' | 'scoop' | 'texture' | 'hueco' | 'ledge';
}

export interface Pad { x0: number; x1: number; z0: number; z1: number; t: number; colour: string; trim: string }

export interface Block {
  route: Route;
  rows: FaceRow[];
  top: number;
  /** Cross-section of the block (y, z) back from the face: over the top and down the back. */
  back: [number, number][];
  /** How far in from the face's edges the back of the block sits (m): the block narrows a little to the back. */
  inset: number;
  marks: Mark[];
  moss: [number, number, number][];
  pads: Pad[];
  circuit: { colour: CircuitColour; at: V3 } | null;
  /** Rock colours: lit face, base, shade, deep shade (undersides), side, top. */
  palette: { light: string; base: string; shade: string; deep: string; side: string; top: string };
  /** For the scenery: a number that is the same for a problem every time. */
  seed: number;
}

/** Cartoon colours by rock type; Font sandstone is the warm one. */
const ROCK_PALETTES: Record<string, Block['palette']> = {
  sandstone: { light: '#FBDDAA', base: '#F0BC78', shade: '#D6965A', deep: '#B97A47', side: '#DFA265', top: '#F8D8A4' },
  limestone: { light: '#EDEFF2', base: '#D3D8DF', shade: '#AEB6C2', deep: '#8D97A6', side: '#BDC4CE', top: '#E6E9EE' },
  granite: { light: '#E9E3DA', base: '#CFC6BA', shade: '#ACA294', deep: '#8D8376', side: '#BBB2A5', top: '#E1DAD0' },
};

const PAD_COLOURS: [string, string][] = [['#56C3EA', '#3BA5CF'], ['#FF7F8E', '#E25A6C'], ['#8BD17C', '#62B657'], ['#FFC857', '#E8A93A'], ['#B49BF2', '#9177DD']];

/** Lightens or darkens a hex colour by `f` (−1 to 1). */
export function tint(hex: string, f: number): string {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const out = c.map((v) => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)));
  return `#${out.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

export function buildBlock(route: Route): Block {
  const r = stream('toon-block', route.id);
  const wall = route.wall;
  const top = wall[wall.length - 1]!.y1;
  const xs = route.holds.map((h) => h.x);
  const hx0 = Math.min(...xs), hx1 = Math.max(...xs);
  const lineX = route.holds.filter((h) => h.hands_ok).reduce((s, h) => s + h.x, 0) / Math.max(1, route.holds.filter((h) => h.hands_ok).length);
  // Width: the holds and some rock either side, at least the route's width; the margins differ problem to problem.
  const ml = r.range(0.38, 0.75), mr = r.range(0.38, 0.75);
  let x0 = Math.min(hx0 - ml, lineX - route.width_m / 2);
  const x1 = Math.max(hx1 + mr, lineX + route.width_m / 2);
  const flare = r.range(0.05, 0.22);
  // An arête: the face's left edge is the line's left edge all the way up, so the line climbs the block's corner.
  const arete = wall.some((s) => s.feature === 'arete');
  if (arete) x0 = Math.max(x0, hx0 - 0.14);
  // The top corners round over on circles, never far enough in to reach a hold; an arête keeps a sharper top.
  const rl = arete ? 0.08 : Math.min(r.range(0.25, 0.55), hx0 - x0 - 0.05, top * 0.4);
  const rr = Math.min(r.range(0.25, 0.55), x1 - hx1 - 0.05, top * 0.4);
  const R = Math.max(rl, rr);
  const ys: number[] = [];
  const body = 22;
  for (let i = 0; i < body; i++) ys.push(((top - R) * i) / body);
  for (let j = 0; j <= 10; j++) ys.push(top - R * (1 - Math.sin((j / 10) * (Math.PI / 2))));
  const corner = (y: number, rad: number): number => (y <= top - rad ? 0 : rad - Math.sqrt(Math.max(0, rad * rad - (y - (top - rad)) ** 2)));
  const rows: FaceRow[] = ys.map((y) => {
    const seg = wall.find((s) => y >= s.y0 && y <= s.y1) ?? wall[wall.length - 1]!;
    // The base flares a little.
    const base = flare * Math.max(0, 1 - y / top / 0.18);
    return { y, z: zOfY(wall, y), xl: x0 + corner(y, rl) - (arete ? 0 : base), xr: x1 - corner(y, rr) + base, angle: angleAt(wall, y), feature: seg.feature };
  });
  // The block behind the face: deep enough to stand on top, back over the top with a rounded nose and down the back.
  const depth = r.range(1.3, 2.1) + Math.max(0, ...rows.map((w) => w.z)) * 0.4;
  const zTop = rows[rows.length - 1]!.z;
  const zBase = Math.min(...rows.map((w) => w.z));
  const hasLip = wall[wall.length - 1]!.feature === 'lip';
  const back: [number, number][] = [];
  const nose = hasLip ? 0.1 : 0.04;
  back.push([top + nose * 0.6, zTop - 0.08]);
  const crown = r.range(0.06, 0.28);
  for (let i = 1; i <= 8; i++) {
    const u = i / 8;
    back.push([top + crown * Math.sin(Math.PI * u) + nose * (1 - u) * 0.6, zTop - 0.08 - u * (zTop - (zBase - depth)) * 0.75]);
  }
  const zBack = zBase - depth;
  back.push([top * 0.62, zBack - r.range(0, 0.2)]);
  back.push([0, zBack + r.range(-0.1, 0.25)]);
  const inset = r.range(0.05, 0.2);
  // Markings: a few cracks and scoops away from the line, texture flicks all over.
  const marks: Mark[] = [];
  const awayFromLine = (x: number) => Math.abs(x - lineX) > 0.35;
  for (let i = 0; i < 3; i++) {
    const x = r.range(x0 + 0.15, x1 - 0.15), y = r.range(0.25, top * 0.8);
    if (!awayFromLine(x)) continue;
    const pts: [number, number][] = [[x, y]];
    let px = x, py = y;
    for (let j = 0; j < 3; j++) { px += r.range(-0.08, 0.08); py -= r.range(0.08, 0.16); pts.push([px, Math.max(0.05, py)]); }
    marks.push({ pts, kind: 'crack' });
  }
  for (let i = 0; i < 4; i++) {
    const x = r.range(x0 + 0.2, x1 - 0.2), y = r.range(0.4, top * 0.85);
    if (!awayFromLine(x)) continue;
    const w = r.range(0.08, 0.16);
    marks.push({ pts: [[x - w, y], [x, y - w * 0.45], [x + w, y]], kind: 'scoop' });
  }
  for (let i = 0; i < 14; i++) {
    const x = r.range(x0 + 0.1, x1 - 0.1), y = r.range(0.15, top - 0.15);
    marks.push({ pts: [[x, y], [x + r.range(0.02, 0.05), y - r.range(0.02, 0.05)]], kind: 'texture' });
  }
  for (const s of wall) {
    if (s.feature === 'crack') marks.push({ pts: Array.from({ length: 7 }, (_, j): [number, number] => [lineX + 0.06 + (j % 2 ? 0.03 : -0.03), s.y0 + ((s.y1 - s.y0) * j) / 6]), kind: 'crack' });
    if (s.feature === 'hueco') for (let j = 0; j < 3; j++) marks.push({ pts: [[r.range(x0 + 0.2, x1 - 0.2), r.range(s.y0, s.y1)]], kind: 'hueco' });
    if (s.feature === 'ledge') marks.push({ pts: [[x0 + 0.1, s.y1], [x1 - 0.1, s.y1]], kind: 'ledge' });
  }
  const moss: [number, number, number][] = [];
  for (let i = 0; i < 9; i++) moss.push([r.range(x0 + 0.15, x1 - 0.15), r.range(-0.6, -0.05), r.range(0.04, 0.1)]);
  // Pads where the problem's pad zone is, in the order the seed picks colours.
  const zone = route.protection.find((p) => p.kind === 'pad_zone');
  const cx = zone?.x ?? lineX, pw = zone?.width_m ?? 2;
  const ci = Math.floor(r.range(0, PAD_COLOURS.length));
  const pads: Pad[] = [0, 1].map((i) => {
    const [colour, trim] = PAD_COLOURS[(ci + i * 2) % PAD_COLOURS.length]!;
    const half = pw / 2;
    return { x0: cx - half + i * half + 0.02, x1: cx - half + (i + 1) * half - 0.02, z0: Math.max(0.12, zBase + 0.12) + i * 0.05, z1: 1.3 + i * 0.06, t: 0.1, colour, trim };
  });
  const starts = route.holds.filter((h) => Object.values(route.start).includes(h.id) && h.hands_ok && h.y > 0.6);
  const sx = starts.length ? starts.reduce((s, h) => s + h.x, 0) / starts.length : lineX;
  const cy = Math.min(0.7, top * 0.3);
  const circuit = route.circuit ? { colour: route.circuit, at: [sx, cy, zOfY(wall, cy)] as V3 } : null;
  const kind = route.rock.startsWith('sandstone') ? 'sandstone' : route.rock === 'limestone' || route.rock === 'dolomite' ? 'limestone' : 'granite';
  const p0 = ROCK_PALETTES[kind]!;
  const shift = r.range(-0.07, 0.07);
  const palette = Object.fromEntries(Object.entries(p0).map(([key, v]) => [key, tint(v, shift)])) as Block['palette'];
  return { route, rows, top, back, inset, marks, moss, pads, circuit, palette, seed: Math.floor(r.range(0, 1e9)) };
}

/** The face's left and right edge at a height (interpolated between rows). */
export function faceEdges(block: Block, y: number): [number, number] {
  const rows = block.rows;
  if (y <= 0) return [rows[0]!.xl, rows[0]!.xr];
  if (y >= block.top) return [rows[rows.length - 1]!.xl, rows[rows.length - 1]!.xr];
  let i = 0;
  while (i < rows.length - 2 && rows[i + 1]!.y < y) i++;
  const a = rows[i]!, b = rows[i + 1]!;
  const u = b.y > a.y ? (y - a.y) / (b.y - a.y) : 0;
  return [a.xl + (b.xl - a.xl) * u, a.xr + (b.xr - a.xr) * u];
}
