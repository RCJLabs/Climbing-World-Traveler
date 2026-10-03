// A simulated attempt as the cartoon wall plays it (docs/24 §5, 25 §10): the engine's frames as bodies, each step's
// move from the attempt log, and how it ends. On a pitch (§10.8) also the rope: the bolts clipped after each frame and
// the rope's own moves, from pitch.ts. Pure: no DOM.

import type { Athlete } from '../../sim/character';
import type { AttemptResult, AttemptState, MoveReport } from '../../sim/state';
import type { RouteGeom } from '../../sim/wall';
import { boundsOf, FRAME_MIN, FRAME_MIN_PITCH, projOf, yawFor, ZOOM_RANGE, type Bounds, type P2, type Proj } from './camera';
import { buildBlock, faceEdges, type Block } from './block';
import { animateEnding, animateStep, endingMs, spreadShared, stepMs, type Animated, type EndingKind, type EndPlaces, type Fx, type StepInfo } from './moves';
import type { Limb } from '../../sim/types';
import {
  beatAt, belayerBody, clipAfter, deviceOf, pitchOf, planStep, restingRope, ropePath, tieOf, type Beat, type Pitch, type PitchEnv, type Plan, type RopeBeat,
} from './pitch';
import { add3, bodyOf, FLAT_ROCK, LIMBS, rockOf, solve, type Body3, type Joints, type Rock, type V3 } from './rig';

/** The start pose shows this long before the first move, and each move's end pose holds this long, at 1× (ms). **(tune)** */
export const START_MS = 600;
export const DWELL_MS = 250;
/** The last frame of the ending holds this long before the result. */
export const AFTER_MS = 450;

/**
 * On a pitch, a routine move (clean, inside the auto-success margin, not dynamic) plays at `routine` of its time and runs
 * straight on into the next; another clean static move at `steady`; shake-outs and chalking at `still`. Dynamic moves,
 * sketchy ones, slips and the rope's steps play in full. A Kalymnos pitch is 120–340 steps, about 85% of them routine:
 * at the boulder's pace one played for two to five minutes at 1× (25 §10.8). **(tune)**
 */
export const PITCH_PACE = { routine: 0.2, routineDwell: 0, steady: 0.6, steadyDwell: 100, still: 0.55, stillDwell: 80 };

/** How a step on a pitch is paced: routine, steady (clean but outside the margin), still (a rest, chalk), or full. */
function paceOf(s: StepInfo): 'routine' | 'steady' | 'still' | 'full' {
  if (s.kind === 'rest' || s.kind === 'chalk') return 'still';
  if (s.kind !== 'move') return 'full';
  if (s.routine) return 'routine';
  return s.outcome === 'clean' && !s.commit && s.cls !== 'dyno' && s.cls !== 'deadpoint' ? 'steady' : 'full';
}

export interface Playback {
  geom: RouteGeom;
  block: Block;
  rock: Rock;
  /** The body after each frame. */
  bodies: Body3[];
  /** The step that led to each frame (the first frame's is the start). */
  steps: StepInfo[];
  /** How long each step plays at 1× (ms; the first is the start pose) and how long its end pose holds. */
  ms: number[];
  dwell: number[];
  ending: { kind: EndingKind; step?: StepInfo | undefined; ms: number; plan?: Plan | undefined } | null;
  places: EndPlaces;
  /** The camera's projection for this problem. */
  proj: Proj;
  bounds: Bounds;
  /** How far out the player may zoom: past the whole problem, or out to the whole route on a pitch. */
  zoomMin: number;
  /** The smallest window the camera shows (m). */
  frameMin: P2;
  /** The frame each hold was first held in: it shows chalk from then on. */
  firstHeld: Map<string, number>;
  /** After each frame, a foot left heel- or toe-hooking: it stays hooked until it moves. */
  hooks: { heel?: Limb | undefined; toe?: Limb | undefined }[];
  /** On a pitch: the bolts, the anchor and the belayer, the bolts clipped after each frame, and the rope's steps' beats. */
  pitch: Pitch | null;
  clips: number[][];
  plans: (Plan | null)[];
}

/** One log entry as a step, with the hold it went for placed in 3D. */
export function stepOf(m: MoveReport | undefined, geom: RouteGeom): StepInfo {
  if (!m) return { kind: 'move' };
  const h = m.hold ? geom.holds.get(m.hold) : undefined;
  const routine = m.kind === 'move' && m.outcome === 'clean' && !m.commit && m.cls !== 'dyno' && m.cls !== 'deadpoint'
    && m.margin !== undefined && m.T !== undefined && m.margin >= m.T;
  return { kind: m.kind, limb: m.limb, cls: m.cls, outcome: m.outcome, commit: m.commit, target: h ? [h.x, h.y, h.z] : undefined, routine };
}

const keyOf = (m: MoveReport): string => `${m.kind}|${m.text}|${m.pump_delta}|${m.hold ?? ''}|${m.outcome ?? ''}|${m.limb ?? ''}`;

/**
 * The entries a step added to the attempt log, from the log before and after it. The log keeps its last 40 entries
 * (attempt.ts `report`), so the new ones are found as the shortest tail whose removal leaves the old log's own tail.
 */
export function freshOf(prev: readonly MoveReport[], cur: readonly MoveReport[]): MoveReport[] {
  const P = prev.map(keyOf), C = cur.map(keyOf);
  for (let n = 1; n <= C.length; n++) {
    const m = C.length - n;
    if (m > P.length) continue;
    let same = true;
    for (let j = 0; j < m && same; j++) same = C[j] === P[P.length - m + j];
    if (same) return cur.slice(m);
  }
  return cur.slice();
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
  const p0 = block.pads[0], p1 = block.pads[block.pads.length - 1];
  const pad: V3 = p0 && p1 ? [Math.max(p0.x0 + 0.3, Math.min(p1.x1 - 0.3, last.hip[0])), 0.1, 0.7] : [last.hip[0], 0.1, block.rows[0]!.z + 0.7];
  return { lip, topStand, pad };
}

/** The ending's name on a pitch, from the entries of the last step. */
function pitchEnding(entries: readonly MoveReport[], outcome: AttemptResult['outcome']): EndingKind {
  if (outcome === 'sent' || outcome === 'worked') return 'chains';
  const fell = entries.some((e) => e.kind === 'fall');
  const lowered = entries.some((e) => e.kind === 'lower');
  if (fell && !lowered) return 'ground';
  if (!fell) return 'lower';
  return entries.some((e) => e.outcome === 'pumped') ? 'pumped' : 'fall';
}

/** Everything the wall needs to play `frames` (the attempt after each step) and its `result`. */
export function playbackOf(geom: RouteGeom, ath: Athlete, frames: readonly AttemptState[], result: AttemptResult | null): Playback {
  const block = buildBlock(geom.route);
  const rock = rockOf(geom.route.wall);
  const bodies = frames.map((f) => spreadShared(bodyOf(geom, ath, f.climb)));
  const fresh = frames.map((f, i) => (i === 0 ? [] : freshOf(frames[i - 1]!.log, f.log)));
  // On a pitch a step can add several entries (a fall, then the take): the step is the first; on a boulder, the last.
  const steps = frames.map((f, i) => (i === 0 ? { kind: 'move' as const } : stepOf(block.pitch ? fresh[i]![0] : f.log[f.log.length - 1], geom)));
  const pitch = block.pitch ? pitchOf(geom, rock) : null;
  const clips: number[][] = [];
  frames.forEach((f, i) => clips.push(pitch ? clipAfter(pitch, clips[i - 1] ?? [], f.rope?.last_clip_y ?? null) : []));
  const env: PitchEnv | null = pitch ? { geom, ath, rock, pitch, bodyOf: (c) => spreadShared(bodyOf(geom, ath, c)), stepOf: (m) => stepOf(m, geom) } : null;
  const plans: (Plan | null)[] = frames.map((f, i) => {
    if (!env || i === 0) return null;
    const prev = frames[i - 1]!;
    return planStep(env, {
      entries: fresh[i]!, a: bodies[i - 1]!, climb: prev.climb, after: { body: bodies[i]!, climb: f.climb },
      clipped: clips[i - 1]!, lastClipY: prev.rope?.last_clip_y ?? null, next: prev.rope?.next ?? 0,
    });
  });
  const ms = steps.map((s, i) => {
    if (i === 0) return START_MS;
    const plan = plans[i];
    if (plan) return plan.ms;
    const t = stepMs(s);
    if (!pitch) return t;
    const pace = paceOf(s);
    return pace === 'full' ? t : Math.round(t * PITCH_PACE[pace]);
  });
  const dwell = steps.map((s, i) => {
    if (!pitch || i === 0 || plans[i]) return DWELL_MS;
    const pace = paceOf(s);
    return pace === 'routine' ? PITCH_PACE.routineDwell : pace === 'steady' ? PITCH_PACE.steadyDwell : pace === 'still' ? PITCH_PACE.stillDwell : DWELL_MS;
  });
  const lastBody = bodies[bodies.length - 1] ?? bodyOf(geom, ath, { anchors: geom.route.start, posture: 'hang', feet_cut: false });
  let ending: Playback['ending'] = null;
  if (result) {
    const lastFrame = frames[frames.length - 1];
    if (env && lastFrame) {
      const entries = freshOf(lastFrame.log, result.log);
      const plan = planStep(env, {
        entries, a: lastBody, climb: lastFrame.climb, after: null, clipped: clips[clips.length - 1] ?? [],
        lastClipY: lastFrame.rope?.last_clip_y ?? null, next: lastFrame.rope?.next ?? 0, outcome: result.outcome,
      });
      const first = entries.find((e) => e.kind === 'move' && e.outcome === 'fall');
      ending = { kind: pitchEnding(entries, result.outcome), step: first ? stepOf(first, geom) : undefined, ms: plan?.ms ?? 0, plan: plan ?? undefined };
    } else {
      const last = result.log[result.log.length - 1];
      const kind: EndingKind = result.outcome === 'sent' ? 'send' : result.outcome === 'jumped' ? 'jump' : result.outcome === 'pumped' ? 'pumped' : 'fall';
      ending = { kind, step: last && last.kind === 'move' ? stepOf(last, geom) : undefined, ms: endingMs(kind) };
    }
  }
  const places = placesOf(geom, block, lastBody);
  // The whole problem in view: the face, the block's side and top, the pads, room to stand on top; on a pitch the
  // belayer and the foot of the route.
  const proj = projOf(yawFor(Math.max(...geom.route.wall.map((s) => s.angle))));
  const view = proj.view;
  const pts: P2[] = [];
  for (const r of block.rows) pts.push(view([r.xl, r.y, r.z]), view([r.xr, r.y, r.z]));
  for (const [y, z] of block.back) pts.push(view([block.rows[0]!.xl + block.inset, y, z]));
  for (const p of block.pads) pts.push(view([p.x0, 0, p.z1]), view([p.x1, 0, p.z1]));
  if (pitch) for (const p of [pitch.belay, pitch.ground]) pts.push(view(add3(p, [-0.6, 0, 0.4])), view(add3(p, [0.6, 2.0, 0.4])));
  else pts.push(view(add3(places.topStand, [0, 2.0, 0])));
  for (const b of bodies) for (const l of LIMBS) pts.push(view(b.ends[l]));
  const bounds = boundsOf(pts);
  const firstHeld = new Map<string, number>();
  frames.forEach((f, i) => { for (const id of Object.values(f.climb.anchors)) if (id && !firstHeld.has(id)) firstHeld.set(id, i); });
  const hooks: Playback['hooks'] = [];
  steps.forEach((s, i) => {
    const h = { ...(hooks[i - 1] ?? {}) };
    const foot = s.kind === 'move' && (s.limb === 'LF' || s.limb === 'RF') ? s.limb : undefined;
    const held = s.outcome !== 'slip_recovered' && s.outcome !== 'fall' && s.outcome !== 'pumped';
    if (foot && h.heel === foot) h.heel = undefined;
    if (foot && h.toe === foot) h.toe = undefined;
    if (foot && held && s.cls === 'heel_hook') h.heel = foot;
    if (foot && held && s.cls === 'toe_hook') h.toe = foot;
    // A hooked foot that is off its hold (cut loose) is not hooking any more.
    for (const k of ['heel', 'toe'] as const) { const f = h[k]; if (f && !bodies[i]?.on[f]) h[k] = undefined; }
    hooks.push(h);
  });
  return { geom, block, rock, bodies, steps, ms, dwell, ending, places, proj, bounds, zoomMin: pitch ? 0.05 : ZOOM_RANGE[0], frameMin: pitch ? FRAME_MIN_PITCH : FRAME_MIN, firstHeld, hooks, pitch, clips, plans };
}

/** The holds chalked during step `i` at `t`: those held before it, and its own hold once the move lands. */
export function touchedAt(pb: Playback, i: number, t: number): Set<string> {
  const upTo = t >= 0.9 ? i : i - 1;
  const out = new Set<string>();
  for (const [id, f] of pb.firstHeld) if (f <= Math.max(0, upTo)) out.add(id);
  return out;
}

/** The beat playing `t` into step `i`, when the step is the rope's. */
const beatOf = (pb: Playback, i: number, t: number): { beat: Beat; u: number } | null => {
  const plan = i > 0 ? pb.plans[i] : null;
  return plan ? beatAt(plan, t) : null;
};

/** The hold step `i` goes for, ringed until the move lands. */
export function targetAt(pb: Playback, i: number, t: number): { at: V3; dynamic: boolean } | null {
  const b = beatOf(pb, i, t);
  if (b) return b.beat.target?.(b.u) ?? null;
  const s = pb.steps[i];
  if (i <= 0 || !s || s.kind !== 'move' || !s.target || t >= 0.85) return null;
  return { at: s.target, dynamic: s.cls === 'dyno' || s.cls === 'deadpoint' };
}

/** The body during step `i` (from frame i−1 to frame i) at `t` (0–1); step 0 is the start. */
export function poseAt(pb: Playback, i: number, t: number): Animated {
  const b = pb.bodies[Math.max(0, Math.min(pb.bodies.length - 1, i))]!;
  if (i <= 0) return animateStep(b, b, { kind: 'move' }, pb.rock, 1);
  const beat = beatOf(pb, i, t);
  if (beat) return beat.beat.pose(beat.u);
  const a = pb.bodies[i - 1]!;
  return animateStep(a, b, pb.steps[i] ?? { kind: 'move' }, pb.rock, t);
}

/** The ending at `t` (0–1), from the last frame's body. */
export function endingAt(pb: Playback, t: number): Animated | null {
  if (!pb.ending) return null;
  if (pb.ending.plan) { const b = beatAt(pb.ending.plan, t); return b.beat.pose(b.u); }
  const a = pb.bodies[pb.bodies.length - 1]!;
  return animateEnding(a, pb.ending.kind, pb.places, pb.rock, t, pb.ending.step);
}

/** A pitch at one moment: the rope's line, how tight it is, the quickdraws, the anchor, the belayer. */
export interface PitchMoment {
  rope: V3[];
  tight: number;
  draws: ReadonlySet<number>;
  clipped: ReadonlySet<number>;
  anchor: 0 | 1 | 2;
  belayer: Joints;
}

/** Everything drawn at one moment: the solved body, its effects, the chalked holds, the ringed hold, what to frame. */
export interface Moment {
  joints: Joints;
  fx: Fx;
  touched: Set<string>;
  target: { at: V3; dynamic: boolean } | null;
  /** View points the camera keeps in frame. */
  focus: P2[];
  pitch: PitchMoment | null;
}

/** The moment `t` (0–1) into step `i`, or `end` (0–1) into the ending once the steps have played. */
export function momentAt(pb: Playback, i: number, t: number, end: number | null = null): Moment {
  const last = pb.bodies.length - 1;
  const beat = end !== null ? (pb.ending?.plan ? beatAt(pb.ending.plan, end) : null) : beatOf(pb, i, t);
  const an = end !== null ? endingAt(pb, end) ?? poseAt(pb, last, 1) : poseAt(pb, i, t);
  // Hooks set by earlier moves hold while their feet stay on (the moving foot's own move decides for itself).
  const held = pb.hooks[end !== null ? last : Math.max(0, i - 1)] ?? {};
  const moving = end === null ? pb.steps[i]?.limb : undefined;
  const mods = { ...an.mods };
  for (const k of ['heel', 'toe'] as const) {
    const f = held[k];
    if (!mods[k] && f && f !== moving && an.body.on[f] && (end === null || end < 0.2) && !beat) mods[k] = f;
  }
  const joints = solve(an.body, pb.rock, mods, an.look);
  const target = end !== null ? null : targetAt(pb, i, t);
  const touched = touchedAt(pb, end !== null ? last : i, end !== null ? 1 : t);
  const extra: V3[] = target ? [target.at] : [];
  let pitch: PitchMoment | null = null;
  if (pb.pitch) {
    const clipped = pb.clips[end !== null ? last : Math.max(0, i - 1)] ?? [];
    const rb: RopeBeat = beat ? beat.beat.rope(beat.u, an) : restingRope(clipped);
    const bb = belayerBody(pb.pitch, rb.lift, rb.pay ?? 0);
    const belayer = solve(bb, FLAT_ROCK, {}, joints.head);
    const rope = ropePath(pb.pitch, deviceOf(belayer.hip), rb, tieOf(joints.hip, pb.rock, joints.k, joints.facingOut));
    pitch = { rope, tight: rb.tight, draws: new Set(rb.draws), clipped: new Set(rb.clipped), anchor: rb.anchor, belayer };
    if (beat?.beat.focus) extra.push(...beat.beat.focus);
    // The opening shot and the last one keep the belayer in frame too.
    const lastBeat = end !== null && pb.ending?.plan && beat?.beat === pb.ending.plan.beats[pb.ending.plan.beats.length - 1];
    if ((end === null && i === 0) || lastBeat) extra.push(belayer.head, belayer.LF, belayer.RF);
  }
  const focus = [joints.head, joints.sh, joints.hip, joints.LH, joints.RH, joints.LF, joints.RF, joints.knL, joints.knR, ...extra].map(pb.proj.view);
  return { joints, fx: an.fx, touched, target, focus, pitch };
}

export { stepMs, endingMs };
