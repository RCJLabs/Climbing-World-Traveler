import { loadBundle } from '../../src/data/bundle';
import { referenceAthlete, startState } from '../../src/sim/grade';
import { applyMove, prepareMove } from '../../src/sim/engine';
import { bodyPoints, routeGeom, reachRadius } from '../../src/sim/wall';
import { generateBoulder } from '../../src/sim/routes';
const b = loadBundle();
const crag = b.crags.get('fontainebleau')!;
const sector = crag.sectors[1]!;
const prof = b.profiles.get(process.argv[2] ?? 'font_sloper_bulge')!;
const di = Number(process.argv[3] ?? 15);
const r = generateBoulder({ crag, sector, profile: prof, di_target: di, seed: `dbg:${process.argv[4] ?? 1}`, bundle: b });
console.log(r.name, 'target', di, 'graded', r.di_graded, 'height', r.length_m.toFixed(2), 'wall', r.wall.map((w) => `${w.y0.toFixed(1)}-${w.y1.toFixed(1)}@${w.angle.toFixed(0)}${w.feature !== 'none' ? '/' + w.feature : ''}`).join(' '));
const ath = referenceAthlete(di);
const g = routeGeom(r);
let st = startState(g, ath);
for (const s of r.beta_line) {
  const bp = bodyPoints(g, ath, st);
  const p = prepareMove(g, ath, st, s.limb, s.hold, s.class);
  const h = g.holds.get(s.hold)!;
  console.log(`${s.limb} ${s.class.padEnd(9)} -> ${h.type.padEnd(9)} ${h.size} q${h.quality.toFixed(2)} y${h.y.toFixed(2)} x${h.x.toFixed(2)} | sh.s ${bp.shoulder.s.toFixed(2)} hip.s ${bp.hip.s.toFixed(2)} posture ${st.posture} feetOn ${bp.feetOn} R_h ${reachRadius(ath,'hand',st.posture).toFixed(2)} ${p ? `d ${p.option.d.toFixed(2)} r ${p.spec.r.toFixed(2)}` : 'ILLEGAL'}`);
  if (p) st = applyMove(g, ath, st, s.limb, s.hold, p.cls);
}
