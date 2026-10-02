// Builds the P1a signature problems (docs/09 §7.3) from hand-authored geometry, checks every move is legal for
// the reference climber at the target grade, tunes hold quality until the grade engine lands on the canonical
// grade (05c test C7: within ±1.0; we aim for ±0.3), and writes data/routes/fontainebleau_signatures.json.
// Run: pnpm tsx scripts/build-signatures.ts
import { writeFileSync } from 'node:fs';
import { applyMove, prepareMove } from '../src/sim/engine';
import { gradeRoute, referenceAthlete, startState } from '../src/sim/grade';
import { FEET_OK, HANDS_OK, REST_BASE, ROCK_FRICTION } from '../src/sim/tables';
import type { BetaStep, Hold, HoldType, Limb, MoveClass, Route, SizeClass, WallSegment } from '../src/sim/types';
import { bodyPoints, freeState, reachRadius, routeGeom, yOfS } from '../src/sim/wall';
import { CLASS_REACH } from '../src/sim/tables';

interface H { id: string; x: number; y: number; type: HoldType; size?: SizeClass; q?: number; o?: number }

function holds(list: H[], polish: number, sharp: number): Hold[] {
  return list.map((h) => ({
    id: h.id, x: h.x, y: h.y, type: h.type, size: h.size ?? 'm', quality: h.q ?? 0.5, orientation: h.o ?? (h.type === 'sidepull' ? (h.x > 0 ? 90 : 270) : 0),
    sharpness: sharp, friction: ROCK_FRICTION.sandstone_font * (1 - 0.4 * polish), polish,
    hands_ok: HANDS_OK[h.type], feet_ok: FEET_OK[h.type], hidden: false, rest_value: REST_BASE[h.type],
  }));
}

const step = (limb: Limb, hold: string, cls: MoveClass): BetaStep => ({ limb, hold, class: cls });

/** One move of a signature problem described by intent; the builder places the hold from the reference reach. */
interface Intent {
  limb: Limb; cls: MoveClass; type: HoldType; size?: SizeClass;
  /** Hands: relative reach r for the class. Feet: offset above (+) or below (−) the free-limb hip. */
  r?: number; ds?: number;
  /** Lateral offset from the moving limb's current hold (hands) or the hip (feet). */
  dx: number;
  finish?: boolean;
}

interface Spec {
  id: string; name: string; area: string; di_target: number; angles: { upTo: number; angle: number }[]; polish: number;
  start: { LH: H; RH: H; LF: H; RF: H }; intents: Intent[]; decoys: H[]; tags: Route['style_tags']; fa: string;
}

const SPECS: Spec[] = [
  {
    id: 'sig_marie_rose', name: 'La Marie-Rose', area: 'bas_cuvier', di_target: 13, polish: 0.6,
    angles: [{ upTo: 0.3, angle: 88 }, { upTo: 1.5, angle: 90 }, { upTo: 2.6, angle: 93 }, { upTo: 9, angle: 96 }],
    start: {
      LH: { id: 's_lh', x: -0.22, y: 1.2, type: 'crimp', size: 'l' }, RH: { id: 's_rh', x: 0.18, y: 1.25, type: 'edge' },
      LF: { id: 's_lf', x: -0.18, y: 0.42, type: 'foot_chip' }, RF: { id: 's_rf', x: 0.2, y: 0.48, type: 'edge' },
    },
    intents: [
      { limb: 'RH', cls: 'static', type: 'crimp', r: 0.84, dx: 0.0 },
      { limb: 'LF', cls: 'static', type: 'foot_chip', ds: -0.12, dx: -0.2 },
      { limb: 'LH', cls: 'static', type: 'edge', r: 0.86, dx: -0.05 },
      { limb: 'RF', cls: 'high_step', type: 'edge', ds: 0.12, dx: 0.25 },
      { limb: 'RH', cls: 'static', type: 'crimp', r: 0.88, dx: 0.05 },
      { limb: 'LF', cls: 'static', type: 'foot_chip', ds: -0.1, dx: -0.2 },
      { limb: 'LH', cls: 'static', type: 'edge', r: 0.85, dx: -0.05 },
      { limb: 'RF', cls: 'static', type: 'foot_chip', ds: -0.12, dx: 0.2 },
      { limb: 'RH', cls: 'static', type: 'crimp', r: 0.86, dx: 0.05 },
      { limb: 'LF', cls: 'static', type: 'edge', ds: -0.1, dx: -0.2 },
      { limb: 'LH', cls: 'deadpoint', type: 'sloper', size: 'l', r: 0.93, dx: 0.05, finish: true },
    ],
    decoys: [{ id: 'd1', x: 0.55, y: 1.55, type: 'crimp', size: 's', q: 0.25 }, { id: 'd2', x: -0.6, y: 2.0, type: 'sloper', size: 's', q: 0.2 }],
    tags: ['vertical', 'crimp', 'sloper', 'dynamic'],
    fa: 'Opened by a Bleausard whose name the sand forgot; the game credits no real person. The first 6A in the forest, polished glassy by eighty years of hands.',
  },
  {
    id: 'sig_toit_cul_de_chien', name: 'Le Toit du Cul de Chien', area: 'cul_de_chien', di_target: 19, polish: 0.3,
    angles: [{ upTo: 0.3, angle: 100 }, { upTo: 0.95, angle: 150 }, { upTo: 1.4, angle: 125 }, { upTo: 9, angle: 95 }],
    start: {
      LH: { id: 's_lh', x: -0.2, y: 0.85, type: 'jug' }, RH: { id: 's_rh', x: 0.2, y: 0.9, type: 'sloper', size: 'l' },
      LF: { id: 's_lf', x: -0.2, y: 0.3, type: 'foot_chip' }, RF: { id: 's_rf', x: 0.22, y: 0.34, type: 'edge' },
    },
    intents: [
      { limb: 'RH', cls: 'static', type: 'sloper', r: 0.85, dx: 0.0 },
      { limb: 'RF', cls: 'heel_hook', type: 'jug', ds: -0.05, dx: 0.4 },
      { limb: 'LH', cls: 'static', type: 'pinch', r: 0.85, dx: 0.0 },
      { limb: 'LF', cls: 'static', type: 'edge', ds: -0.15, dx: -0.25 },
      { limb: 'RH', cls: 'deadpoint', type: 'sloper', size: 'l', r: 0.94, dx: -0.05, finish: true },
    ],
    decoys: [{ id: 'd1', x: -0.55, y: 1.1, type: 'sloper', size: 's', q: 0.2 }],
    tags: ['roof', 'sloper', 'flexibility', 'dynamic'],
    fa: 'A sandy-floored classic whose first ascent is lost to the dune. The game credits no real person.',
  },
  {
    id: 'sig_rainbow_rocket', name: 'Rainbow Rocket', area: 'franchard_isatis', di_target: 25, polish: 0.15,
    angles: [{ upTo: 0.3, angle: 95 }, { upTo: 1.6, angle: 110 }, { upTo: 9, angle: 125 }],
    start: {
      LH: { id: 's_lh', x: -0.3, y: 1.4, type: 'sloper', o: 40 }, RH: { id: 's_rh', x: 0.25, y: 1.45, type: 'sloper', o: -40 },
      LF: { id: 's_lf', x: -0.2, y: 0.55, type: 'smear' }, RF: { id: 's_rf', x: 0.25, y: 0.6, type: 'foot_chip' },
    },
    intents: [
      { limb: 'RF', cls: 'high_step', type: 'foot_chip', ds: 0.1, dx: 0.1 },
      { limb: 'RH', cls: 'dyno', type: 'sloper', size: 's', r: 0.99, dx: -0.1, finish: true },
    ],
    decoys: [{ id: 'd1', x: 0.6, y: 2.0, type: 'sloper', size: 's', q: 0.2 }, { id: 'd2', x: -0.65, y: 1.95, type: 'crimp', size: 'xs', q: 0.2 }],
    tags: ['overhang', 'sloper', 'dynamic', 'power'],
    fa: 'One move, one rocket, one rainbow of chalk on the lip. The game credits no real person.',
  },
];

function wallFor(spec: Spec, top: number): WallSegment[] {
  const out: WallSegment[] = [];
  let y0 = 0;
  for (const a of spec.angles) {
    const y1 = Math.min(a.upTo, top);
    if (y1 > y0 + 1e-6) out.push({ y0, y1, angle: a.angle, feature: 'none' });
    y0 = y1;
    if (y0 >= top) break;
  }
  out[out.length - 1]!.feature = 'lip';
  return out;
}

function build(spec: Spec): { route: Route; tuneIds: string[] } {
  const ath = referenceAthlete(spec.di_target);
  const route: Route = {
    id: spec.id, crag: 'fontainebleau', area: spec.area, name: spec.name, discipline: 'boulder', rock: 'sandstone_font',
    di_target: spec.di_target, di_graded: 0, danger: 'safe', wall: wallFor(spec, 6), width_m: 2.0,
    holds: holds([spec.start.LH, spec.start.RH, spec.start.LF, spec.start.RF], spec.polish, 0.3),
    protection: [{ id: 'pad', kind: 'pad_zone', y: 0.3, x: 0, width_m: 2.0, quality: 0.8 }],
    start: { LH: spec.start.LH.id, RH: spec.start.RH.id, LF: spec.start.LF.id, RF: spec.start.RF.id }, finish_hold: '',
    length_m: 6, style_tags: spec.tags, signature: true, seed: spec.id, beta_line: [], fa_note: spec.fa,
  };
  const tuneIds: string[] = [];
  let geom = routeGeom(route);
  let st = startState(geom, ath);
  spec.intents.forEach((it, i) => {
    const kind = it.limb.endsWith('H') ? 'hand' : 'foot';
    const bp = bodyPoints(geom, ath, freeState(st, it.limb));
    const cur = geom.holds.get(st.anchors[it.limb]!)!;
    let x: number;
    let sTarget: number;
    if (kind === 'hand') {
      const R = reachRadius(ath, 'hand', st.posture) * CLASS_REACH[it.cls];
      const d = (it.r ?? 0.85) * R;
      x = cur.x + it.dx;
      const dx = x - bp.shoulder.x;
      sTarget = bp.shoulder.s + Math.sqrt(Math.max(0, d * d - dx * dx));
    } else {
      x = bp.hip.x + it.dx;
      sTarget = bp.hip.s + (it.ds ?? 0);
    }
    const y = yOfS(route.wall, sTarget);
    const h: H = { id: it.finish ? 'top' : `${kind === 'hand' ? 'm' : 'f'}${i}`, x, y, type: it.type, ...(it.size ? { size: it.size } : {}) };
    route.holds.push(...holds([h], spec.polish, 0.3));
    if (kind === 'hand') tuneIds.push(h.id);
    geom = routeGeom(route);
    route.beta_line.push(step(it.limb, h.id, it.cls));
    const p = prepareMove(geom, ath, st, it.limb, h.id, it.cls) ?? prepareMove(geom, ath, st, it.limb, h.id);
    if (!p) throw new Error(`${spec.name}: move ${i} unreachable`);
    st = applyMove(geom, ath, st, it.limb, h.id, p.cls);
    if (it.finish) {
      route.finish_hold = h.id;
      route.beta_line.push(step(it.limb, h.id, 'mantle'));
      const top = y + 0.06;
      route.wall = wallFor(spec, top);
      route.length_m = top;
    }
  });
  for (const d of spec.decoys) if (d.y < route.length_m - 0.2) route.holds.push(...holds([d], spec.polish, 0.3).map((x) => ({ ...x, size: d.size ?? 's', quality: d.q ?? 0.25 })));
  return { route, tuneIds };
}

function legality(route: Route): string[] {
  const ath = referenceAthlete(route.di_target);
  const geom = routeGeom(route);
  let st = startState(geom, ath);
  const out: string[] = [];
  for (const s of route.beta_line) {
    const p = prepareMove(geom, ath, st, s.limb, s.hold, s.class);
    if (!p) {
      const any = prepareMove(geom, ath, st, s.limb, s.hold);
      out.push(`${s.limb}->${s.hold} ${s.class}: ${any ? `illegal as ${s.class}, legal as ${any.cls} (r ${any.spec.r.toFixed(2)})` : 'unreachable'}`);
      if (!any) return out;
      st = applyMove(geom, ath, st, s.limb, s.hold, any.cls);
    } else {
      out.push(`${s.limb}->${s.hold} ${p.cls} ok r ${p.spec.r.toFixed(2)} posture ${st.posture}`);
      st = applyMove(geom, ath, st, s.limb, s.hold, p.cls);
    }
  }
  return out;
}

const SIZES: SizeClass[] = ['xs', 's', 'm', 'l', 'xl'];
function setBias(route: Route, tuneIds: string[], bias: number, base: Map<string, { q: number; size: SizeClass }>): void {
  for (const id of tuneIds) {
    const h = route.holds.find((x) => x.id === id)!;
    const b = base.get(id)!;
    let q = b.q + bias;
    let si = SIZES.indexOf(b.size);
    while (q > 0.9 && si < 4) { si++; q -= 0.375; }
    while (q < 0.15 && si > 0) { si--; q += 0.375; }
    h.size = SIZES[si]!;
    h.quality = Math.round(Math.min(0.9, Math.max(0.15, q)) * 1000) / 1000;
  }
}

const out: Route[] = [];
for (const spec of SPECS) {
  const { route, tuneIds } = build(spec);
  console.log(`\n== ${spec.name} (target DI ${spec.di_target})`);
  for (const line of legality(route)) console.log('  ' + line);
  const base = new Map(tuneIds.map((id) => { const h = route.holds.find((x) => x.id === id)!; return [id, { q: h.quality, size: h.size }]; }));
  // Bisection on a quality bias: higher quality → easier → lower DI.
  let lo = -1.2;
  let hi = 1.2;
  let g = gradeRoute(route);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    setBias(route, tuneIds, mid, base);
    g = gradeRoute(route);
    const di = g.di ?? 40;
    if (Math.abs(di - spec.di_target) <= 0.15) break;
    if (di > spec.di_target) lo = mid; else hi = mid;
  }
  route.di_graded = Math.round((g.di ?? 0) * 100) / 100;
  route.danger = g.danger;
  route.components = g.components;
  console.log(`  graded ${route.di_graded} danger ${route.danger} height ${route.length_m.toFixed(2)} holds ${tuneIds.map((id) => { const h = route.holds.find((x) => x.id === id)!; return `${id}:${h.type}/${h.size}/${h.quality}`; }).join(' ')}`);
  if (g.di === null || Math.abs(g.di - spec.di_target) > 1.0) throw new Error(`${spec.name} grades ${g.di}, outside ±1.0 of ${spec.di_target}`);
  out.push(route);
}
writeFileSync('data/routes/fontainebleau_signatures.json', JSON.stringify(out, null, 1) + '\n');
console.log('\nwrote data/routes/fontainebleau_signatures.json');
