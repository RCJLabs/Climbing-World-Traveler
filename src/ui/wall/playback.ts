// A simulated attempt as the cartoon wall plays it (docs/24 §5, 25 §10): the engine's frames as bodies, each step's
// move from the attempt log, and how it ends. Pure: no DOM.

import type { Athlete } from '../../sim/character';
import type { AttemptResult, AttemptState, MoveReport } from '../../sim/state';
import type { RouteGeom } from '../../sim/wall';
import { boundsOf, projOf, yawFor, type Bounds, type P2, type Proj } from './camera';
import { buildBlock, faceEdges, type Block } from './block';
import { animateEnding, animateStep, endingMs, spreadShared, stepMs, type Animated, type EndingKind, type EndPlaces, type Fx, type StepInfo } from './moves';
import type { Limb } from '../../sim/types';
import { add3, bodyOf, LIMBS, rockOf, solve, type Body3, type Joints, type Rock, type V3 } from './rig';

export interface Playback {
  geom: RouteGeom;
  block: Block;
  rock: Rock;
  /** The body after each frame. */
  bodies: Body3[];
  /** The step that led to each frame (the first frame's is the start). */
  steps: StepInfo[];
  ending: { kind: EndingKind; step?: StepInfo | undefined } | null;
  places: EndPlaces;
  /** The camera's projection for this problem. */
  proj: Proj;
  bounds: Bounds;
  /** The frame each hold was first held in: it shows chalk from then on. */
  firstHeld: Map<string, number>;
  /** After each frame, a foot left heel- or toe-hooking: it stays hooked until it moves. */
  hooks: { heel?: Limb | undefined; toe?: Limb | undefined }[];
}

/** One log entry as a step, with the hold it went for placed in 3D. */
export function stepOf(m: MoveReport | undefined, geom: RouteGeom): StepInfo {
  if (!m) return { kind: 'move' };
  const h = m.hold ? geom.holds.get(m.hold) : undefined;
  return { kind: m.kind, limb: m.limb, cls: m.cls, outcome: m.outcome, commit: m.commit, target: h ? [h.x, h.y, h.z] : undefined };
}

/** Where a top-out stands and where a fall lands, from the problem. */
export function placesOf(geom: RouteGeom, block: Block, last: Body3): EndPlaces {
  const route = geom.route;
  const fin = geom.holds.get(route.finish_hold);
  const top = block.top;
  const topRow = block.rows[block.rows.length - 1]!;
  const [xl, xr] = faceEdges(block, top);
  const fx = Math.max(xl + 0.25, Math.min(xr - 0.25, fin?.x ?? (xl + xr) / 2));
  const lip: V3 = [fx, top + 0.02, topRow.z];
  const crown = Math.max(...block.back.map((p) => p[0]));
  const topStand: V3 = [fx, (top + crown) / 2, topRow.z - 0.4];
  const pad: V3 = [Math.max(block.pads[0]!.x0 + 0.3, Math.min(block.pads[1]!.x1 - 0.3, last.hip[0])), 0.1, 0.7];
  return { lip, topStand, pad };
}

/** Everything the wall needs to play `frames` (the attempt after each step) and its `result`. */
export function playbackOf(geom: RouteGeom, ath: Athlete, frames: readonly AttemptState[], result: AttemptResult | null): Playback {
  const block = buildBlock(geom.route);
  const rock = rockOf(geom.route.wall);
  const bodies = frames.map((f) => spreadShared(bodyOf(geom, ath, f.climb)));
  const steps = frames.map((f, i) => (i === 0 ? { kind: 'move' as const } : stepOf(f.log[f.log.length - 1], geom)));
  let ending: Playback['ending'] = null;
  if (result) {
    const last = result.log[result.log.length - 1];
    const kind: EndingKind = result.outcome === 'sent' ? 'send' : result.outcome === 'jumped' ? 'jump' : result.outcome === 'pumped' ? 'pumped' : 'fall';
    ending = { kind, step: last && last.kind === 'move' ? stepOf(last, geom) : undefined };
  }
  const lastBody = bodies[bodies.length - 1] ?? bodyOf(geom, ath, { anchors: geom.route.start, posture: 'hang', feet_cut: false });
  const places = placesOf(geom, block, lastBody);
  // The whole problem in view: the face, the block's side and top, the pads, room to stand on top.
  const proj = projOf(yawFor(Math.max(...geom.route.wall.map((s) => s.angle))));
  const view = proj.view;
  const pts: P2[] = [];
  for (const r of block.rows) pts.push(view([r.xl, r.y, r.z]), view([r.xr, r.y, r.z]));
  for (const [y, z] of block.back) pts.push(view([block.rows[0]!.xl + block.inset, y, z]));
  for (const p of block.pads) pts.push(view([p.x0, 0, p.z1]), view([p.x1, 0, p.z1]));
  pts.push(view(add3(places.topStand, [0, 2.0, 0])));
  for (const b of bodies) for (const l of LIMBS) pts.push(view(b.ends[l]));
  const bounds = boundsOf(pts);
  const firstHeld = new Map<string, number>();
  frames.forEach((f, i) => { for (const id of Object.values(f.climb.anchors)) if (id && !firstHeld.has(id)) firstHeld.set(id, i); });
  const hooks: Playback['hooks'] = [];
  steps.forEach((s, i) => {
    const h = { ...(hooks[i - 1] ?? {}) };
    const foot = s.kind === 'move' && (s.limb === 'LF' || s.limb === 'RF') ? s.limb : undefined;
    if (foot && h.heel === foot) h.heel = undefined;
    if (foot && h.toe === foot) h.toe = undefined;
    if (foot && s.outcome !== 'slip_recovered' && s.cls === 'heel_hook') h.heel = foot;
    if (foot && s.outcome !== 'slip_recovered' && s.cls === 'toe_hook') h.toe = foot;
    // A hooked foot that is off its hold (cut loose) is not hooking any more.
    for (const k of ['heel', 'toe'] as const) { const f = h[k]; if (f && !bodies[i]?.on[f]) h[k] = undefined; }
    hooks.push(h);
  });
  return { geom, block, rock, bodies, steps, ending, places, proj, bounds, firstHeld, hooks };
}

/** The holds chalked during step `i` at `t`: those held before it, and its own hold once the move lands. */
export function touchedAt(pb: Playback, i: number, t: number): Set<string> {
  const upTo = t >= 0.9 ? i : i - 1;
  const out = new Set<string>();
  for (const [id, f] of pb.firstHeld) if (f <= Math.max(0, upTo)) out.add(id);
  return out;
}

/** The hold step `i` goes for, ringed until the move lands. */
export function targetAt(pb: Playback, i: number, t: number): { at: V3; dynamic: boolean } | null {
  const s = pb.steps[i];
  if (i <= 0 || !s || s.kind !== 'move' || !s.target || t >= 0.85) return null;
  return { at: s.target, dynamic: s.cls === 'dyno' || s.cls === 'deadpoint' };
}

/** The body during step `i` (from frame i−1 to frame i) at `t` (0–1); step 0 is the start. */
export function poseAt(pb: Playback, i: number, t: number): Animated {
  const b = pb.bodies[Math.max(0, Math.min(pb.bodies.length - 1, i))]!;
  if (i <= 0) return animateStep(b, b, { kind: 'move' }, pb.rock, 1);
  const a = pb.bodies[i - 1]!;
  return animateStep(a, b, pb.steps[i] ?? { kind: 'move' }, pb.rock, t);
}

/** The ending at `t` (0–1), from the last frame's body. */
export function endingAt(pb: Playback, t: number): Animated | null {
  if (!pb.ending) return null;
  const a = pb.bodies[pb.bodies.length - 1]!;
  return animateEnding(a, pb.ending.kind, pb.places, pb.rock, t, pb.ending.step);
}

/** Everything drawn at one moment: the solved body, its effects, the chalked holds, the ringed hold, what to frame. */
export interface Moment {
  joints: Joints;
  fx: Fx;
  touched: Set<string>;
  target: { at: V3; dynamic: boolean } | null;
  /** View points the camera keeps in frame. */
  focus: P2[];
}

/** The moment `t` (0–1) into step `i`, or `end` (0–1) into the ending once the steps have played. */
export function momentAt(pb: Playback, i: number, t: number, end: number | null = null): Moment {
  const last = pb.bodies.length - 1;
  const an = end !== null ? endingAt(pb, end) ?? poseAt(pb, last, 1) : poseAt(pb, i, t);
  // Hooks set by earlier moves hold while their feet stay on (the moving foot's own move decides for itself).
  const held = pb.hooks[end !== null ? last : Math.max(0, i - 1)] ?? {};
  const moving = end === null ? pb.steps[i]?.limb : undefined;
  const mods = { ...an.mods };
  for (const k of ['heel', 'toe'] as const) {
    const f = held[k];
    if (!mods[k] && f && f !== moving && an.body.on[f] && (end === null || end < 0.2)) mods[k] = f;
  }
  const joints = solve(an.body, pb.rock, mods, an.look);
  const target = end !== null ? null : targetAt(pb, i, t);
  const touched = touchedAt(pb, end !== null ? last : i, end !== null ? 1 : t);
  const focus = [joints.head, joints.sh, joints.hip, joints.LH, joints.RH, joints.LF, joints.RF, joints.knL, joints.knR].map(pb.proj.view);
  if (target) focus.push(pb.proj.view(target.at));
  return { joints, fx: an.fx, touched, target, focus };
}

export { stepMs, endingMs };
