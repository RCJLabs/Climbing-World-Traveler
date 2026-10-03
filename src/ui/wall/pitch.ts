// A pitch on the cartoon wall (docs/25 §10.8): the bolts, the quickdraws and the anchor, the belayer, the rope from the
// belayer through the clipped quickdraws to the climber, and the rope's own moves: clipping, a fall the rope catches,
// hanging, pulling back on, taking, pulling through on a quickdraw, lowering off and a fall to the ground. Rebuilt from
// the attempt's frames and log with the engine's own rules (`fallLength`, `reachesGround`, `bodyPoints`, `applyMove`),
// so the fall drawn is the fall the engine took. Pure: no DOM.

import type { Athlete } from '../../sim/character';
import { applyMove } from '../../sim/engine';
import { anglePump } from '../../sim/resolve';
import { anchorOf, BELAY_QUALITY, boltsOf, fallLength, reachesGround } from '../../sim/rope';
import type { AttemptResult, MoveReport } from '../../sim/state';
import { PC } from '../../sim/tables';
import type { Limb, Protection } from '../../sim/types';
import { bodyPoints, yOfS, type ClimbState, type RouteGeom } from '../../sim/wall';
import { animateStep, bump, calm, ease, easeOut, limbPath, seg, stepMs, type Animated, type StepInfo } from './moves';
import { add3, LIMBS, mix3, mixBody, mul3, sub3, type Body3, type Rock, type V3 } from './rig';

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const hands = ['LH', 'RH'] as const;
const isHand = (l: Limb | undefined): l is 'LH' | 'RH' => l === 'LH' || l === 'RH';

// ---------------------------------------------------------------- the pitch's hardware

export interface Bolt3 {
  /** The hanger on the face, and the quickdraw's lower karabiner, which the rope runs through. */
  hanger: V3;
  biner: V3;
  y: number;
  /** Holds the bolt is clipped from (05a §3). */
  from: readonly string[];
}

export interface Anchor3 { left: V3; right: V3; ring: V3; from: readonly string[] }

export interface Pitch {
  bolts: Bolt3[];
  anchor: Anchor3 | null;
  /** Where the belayer stands (between the feet), and where a climber lowered off lands. */
  belay: V3;
  ground: V3;
}

/** A quickdraw from hanger to the rope's karabiner (m): drawn a little long so it reads at phone size, like the holds. */
export const DRAW_LEN = 0.22;
/** The belayer's height over 1.7 m. */
export const BELAYER_K = 0.96;

/** Where the line is at a height: the mean x of the hand holds within a metre of it. */
function lineXAt(geom: RouteGeom, y: number): number {
  const near = geom.list.filter((h) => h.hands_ok && Math.abs(h.y - y) < 1);
  const all = near.length ? near : geom.list.filter((h) => h.hands_ok);
  return all.reduce((s, h) => s + h.x, 0) / Math.max(1, all.length);
}

/** A quickdraw hangs straight down from its hanger, or lies on the rock where the rock leans back under it. */
function binerOf(rock: Rock, hanger: V3): V3 {
  const y = hanger[1];
  const n = rock.n(y);
  if (n[1] > 0.02) {
    // A slab: down along the face.
    const up: V3 = [0, n[2], -n[1]];
    return add3(add3(hanger, mul3(up, -DRAW_LEN)), mul3(n, 0.02));
  }
  const p: V3 = add3(hanger, [0, -DRAW_LEN, 0]);
  return [p[0], p[1], Math.max(p[2], rock.z(p[1]) + 0.02)];
}

export function pitchOf(geom: RouteGeom, rock: Rock): Pitch {
  const route = geom.route;
  const on = (p: Protection, dx = 0, dy = 0): V3 => {
    const x = (p.x ?? lineXAt(geom, p.y)) + dx, y = p.y + dy;
    return add3([x, y, rock.z(y)], mul3(rock.n(y), 0.012));
  };
  const bolts = boltsOf(route).map((b) => { const hanger = on(b); return { hanger, biner: binerOf(rock, hanger), y: b.y, from: b.reach_from ?? [] }; });
  const a = anchorOf(route);
  let anchor: Anchor3 | null = null;
  if (a) {
    const left = on(a, -0.11, 0.05), right = on(a, 0.11, 0.05);
    const mid = on(a, 0, -0.14);
    anchor = { left, right, ring: [mid[0], mid[1], Math.max(mid[2], rock.z(mid[1]) + 0.04)], from: a.reach_from ?? [] };
  }
  // The belayer stands clear of the base, under and right of the first bolt; a climber lowered off lands left of it.
  const x0 = bolts[0]?.hanger[0] ?? lineXAt(geom, 1);
  let zBase = -Infinity;
  for (let y = 0; y <= 2.2; y += 0.2) zBase = Math.max(zBase, rock.z(y));
  return { bolts, anchor, belay: [x0 + 1.25, 0, zBase + 1.0], ground: [x0 - 0.45, 0, zBase + 0.5] };
}

/** The bolts clipped after a frame: the one the rope last came tight to is found by its height, every frame. */
export function clipAfter(p: Pitch, prev: readonly number[], lastClipY: number | null): number[] {
  if (lastClipY === null) return [...prev];
  const i = p.bolts.findIndex((b) => Math.abs(b.y - lastClipY) < 1e-9);
  return i < 0 || prev.includes(i) ? [...prev] : [...prev, i].sort((x, y) => x - y);
}

// ---------------------------------------------------------------- the rope at one moment

export interface RopeBeat {
  /** Bolts with a quickdraw on them, and those of them the rope runs through. */
  draws: readonly number[];
  clipped: readonly number[];
  /** 0 the anchor bare, 1 a quickdraw on it, 2 the rope through it. */
  anchor: 0 | 1 | 2;
  /** A bight of rope pulled up in the clipping hand. */
  bight?: V3 | undefined;
  /** 0 slack to 1 tight. */
  tight: number;
  /** The belayer pulled up and in by a catch (m). */
  lift: number;
  /** The belayer paying out rope (a phase that runs while the climber is lowered). */
  pay?: number | undefined;
}

export const restingRope = (clipped: readonly number[]): RopeBeat => ({ draws: clipped, clipped, anchor: 0, tight: 0.25, lift: 0 });

/** The belayer's belay device: in front of the hips, the rope's end on the belayer's side. */
export const deviceOf = (belayerHip: V3): V3 => add3(belayerHip, [0.02, 0.1 * BELAYER_K, -0.2 * BELAYER_K]);

/** The tie-in on the climber's harness: the front of the hips, which face the rock (or face out). */
export function tieOf(hip: V3, rock: Rock, k: number, facingOut = false): V3 {
  const n: V3 = facingOut ? [0, 0, 1] : rock.n(hip[1]);
  return add3(add3(hip, mul3(n, (facingOut ? 0.12 : -0.07) * k)), [0, 0.02 * k, 0]);
}

/** The rope's line: from the belayer's device up through each quickdraw it is clipped to, the anchor, the bight, the climber. */
export function ropePath(p: Pitch, device: V3, rb: RopeBeat, tie: V3): V3[] {
  const pts: V3[] = [device];
  for (const i of [...rb.clipped].sort((a, b) => a - b)) { const b = p.bolts[i]; if (b) pts.push(b.biner); }
  if (rb.anchor === 2 && p.anchor) pts.push(p.anchor.ring);
  if (rb.bight) pts.push(rb.bight);
  pts.push(tie);
  return pts;
}

// ---------------------------------------------------------------- bodies on the rope

/** Where the hips hang at height y under a draw: in space under a roof, never closer to the rock than a body. */
function hangSpot(rock: Rock, x: number, y: number, under: V3 | null, k: number): V3 {
  const z = Math.max(under ? under[2] + 0.04 : -Infinity, rock.z(y) + 0.42 * k, rock.z(y - 0.5 * k) + 0.32 * k);
  return [x, y, z];
}

/**
 * Hanging in the harness at `hip`: sitting in it, hands on the rope above the knot, feet against the rock if it is in
 * reach, else hanging. `walk` swings the feet in steps (lowering) and `pull` moves the hands up the rope in turn.
 */
export function hangBody(base: Body3, hip: V3, rock: Rock, walk = 0, pull = 0): Body3 {
  const k = base.k;
  const sh: V3 = add3(hip, [0, 0.48 * k, 0.07 * k]);
  const tie = tieOf(hip, rock, k);
  const pl = 0.07 * k * Math.sin(pull * Math.PI), pr = -pl;
  const LH = add3(tie, [-0.04 * k, 0.5 * k + pl, 0.03]), RH = add3(tie, [0.04 * k, 0.32 * k + pr, 0.04]);
  const fy = hip[1] - 0.42 * base.leg;
  const reach = hip[2] - rock.z(fy) < 0.92 * base.leg && fy > 0.05;
  const step = (side: number): number => 0.1 * k * Math.sin(walk * Math.PI + (side > 0 ? Math.PI : 0));
  const foot = (side: number): V3 => {
    if (!reach) return add3(hip, [0.12 * side * k, -0.8 * base.leg, 0.06 + 0.02 * side]);
    const y = fy + step(side);
    return [hip[0] + 0.13 * side * k, y, rock.z(y) + 0.01];
  };
  return { ...base, sh, hip, ends: { LH, RH, LF: foot(-1), RF: foot(1) }, on: { LH: false, RH: false, LF: reach, RF: reach }, feetCut: !reach };
}

/** Standing on the ground: arms up, or at the sides. */
export function standBody(base: Body3, foot: V3, armsUp: boolean): Body3 {
  const k = base.k;
  const hip: V3 = add3(foot, [0, 0.86 * k, 0]);
  const sh: V3 = add3(hip, [0, 0.5 * k, 0]);
  const ends = armsUp
    ? { LH: add3(sh, [-0.3 * k, 0.42 * k, 0.04]), RH: add3(sh, [0.32 * k, 0.44 * k, 0.04]) }
    : { LH: add3(hip, [-0.24 * k, -0.06 * k, 0.04]), RH: add3(hip, [0.24 * k, -0.06 * k, 0.05]) };
  return { ...base, sh, hip, on: { LH: false, RH: false, LF: true, RF: true }, ends: { ...ends, LF: add3(foot, [-0.13 * k, 0, 0]), RF: add3(foot, [0.15 * k, 0, 0.04]) } };
}

/** The belayer: standing under the route, hands on the rope; lifted off the ground by a catch; paying out to lower. */
export function belayerBody(p: Pitch, lift: number, pay = 0): Body3 {
  const k = BELAYER_K, leg = 0.47 * 1.7 * k, arm = 0.44 * 1.7 * k;
  const f = p.belay;
  const up = Math.max(0, lift);
  const hip: V3 = add3(f, [0, 0.86 * k + up, -0.55 * up]);
  const sh: V3 = add3(hip, [0, 0.5 * k, -0.07 * k]);
  const guide: V3 = add3(sh, [-0.14 * k, -0.12 * k + 0.05 * Math.sin(pay * 2 * Math.PI), -0.28 * k]);
  const brake: V3 = add3(hip, [0.2 * k, -0.08 * k + 0.05 * Math.sin(pay * 2 * Math.PI + 1), -0.06 * k]);
  const onGround = up < 0.04;
  const foot = (side: number): V3 => (onGround ? add3(f, [0.14 * side * k, 0, 0.02]) : add3(hip, [0.12 * side * k, -0.86 * leg, 0.08]));
  return {
    sh, hip, k, arm, leg, posture: 'hang', feetCut: !onGround,
    ends: { LH: guide, RH: brake, LF: foot(-1), RF: foot(1) }, on: { LH: true, RH: true, LF: onGround, RF: onGround },
  };
}

// ---------------------------------------------------------------- beats

/** Part of a step on a pitch: what it is, how long it plays at 1×, the body, the rope, the hold ringed, what to keep in frame. */
export interface Beat {
  kind: 'move' | 'clip' | 'try' | 'fall' | 'hang' | 'back' | 'take' | 'aid' | 'lower' | 'land' | 'sent' | 'ground';
  ms: number;
  pose(u: number): Animated;
  rope(u: number, an: Animated): RopeBeat;
  target?: ((u: number) => { at: V3; dynamic: boolean } | null) | undefined;
  focus?: V3[] | undefined;
}

export interface Plan { beats: Beat[]; ms: number }

const planOf = (beats: Beat[]): Plan => ({ beats, ms: beats.reduce((s, b) => s + b.ms, 0) });

/** The beat `t` (0–1) into a plan, and how far into it. */
export function beatAt(plan: Plan, t: number): { beat: Beat; u: number } {
  let e = clamp(t, 0, 1) * plan.ms;
  for (let i = 0; i < plan.beats.length; i++) {
    const b = plan.beats[i]!;
    if (e <= b.ms || i === plan.beats.length - 1) return { beat: b, u: b.ms > 0 ? clamp(e / b.ms, 0, 1) : 1 };
    e -= b.ms;
  }
  throw new Error('empty plan');
}

const still = (rb: RopeBeat) => (): RopeBeat => rb;
const ringOf = (step: StepInfo, until = 0.85) => (u: number) => (step.target && u < until ? { at: step.target, dynamic: step.cls === 'dyno' || step.cls === 'deadpoint' } : null);

/** An ordinary move inside a plan (the move before a pump-off). */
function moveBeat(a: Body3, b: Body3, step: StepInfo, rock: Rock, rb: RopeBeat): Beat {
  return { kind: 'move', ms: stepMs(step), pose: (u) => animateStep(a, b, step, rock, u), rope: still(rb), target: ringOf(step) };
}

/** Which hand holds on and which clips: the hand on a hold the bolt is clipped from holds (the cheaper one if both). */
export function clipHands(geom: RouteGeom, climb: ClimbState, from: readonly string[]): { hold: 'LH' | 'RH'; clip: 'LH' | 'RH' } {
  const cost = (l: 'LH' | 'RH'): number => {
    const id = climb.anchors[l];
    const h = id && from.includes(id) ? geom.holds.get(id) : undefined;
    return h ? PC[h.type] * anglePump(h.angle) : Infinity;
  };
  const hold = cost('LH') <= cost('RH') ? 'LH' : 'RH';
  return { hold, clip: hold === 'LH' ? 'RH' : 'LH' };
}

/** Clipping: a quickdraw from the harness onto the hanger, then the rope pulled up and clipped into it. **(tune)** */
export const CLIP_MS = 1200;

function clipBeat(a: Body3, hand: 'LH' | 'RH', at: V3, rock: Rock, rb: RopeBeat, what: { bolt: number } | 'anchor'): Beat {
  const n = rock.n(a.hip[1]);
  const side = hand === 'LH' ? -1 : 1;
  // A bolt out of reach of the clipping hand: the climber locks off and rises towards it, up to 0.3 m.
  const shoulder = add3(a.sh, [0.17 * side * a.k, 0, 0]);
  const gap = Math.hypot(...sub3(at, shoulder)) - 0.95 * a.arm;
  const rise: V3 = gap > 0 ? [0, Math.min(0.3, gap), 0] : [0, 0, 0];
  const lift = (u: number): number => bump(seg(u, 0.1, 0.92));
  const hangDraw = 0.38, clipAt = 0.74;
  const pose = (u: number): Animated => {
    const fx = calm();
    const up = mul3(rise, lift(u));
    const loop = add3(add3(add3(a.hip, mul3(n, -0.02)), [0.16 * side * a.k, 0.02, 0]), up);
    const tie = add3(tieOf(a.hip, rock, a.k), up);
    let end: V3;
    if (u < 0.18) end = limbPath(a.ends[hand], loop, rock, u, 0, 0.18, 0.5);
    else if (u < hangDraw) end = limbPath(loop, at, rock, u, 0.18, hangDraw, 0.6);
    else if (u < 0.52) end = limbPath(at, tie, rock, u, hangDraw, 0.52, 0.4);
    else if (u < clipAt) end = limbPath(tie, at, rock, u, 0.52, clipAt, 0.5);
    else end = limbPath(at, a.ends[hand], rock, u, 0.8, 0.98, 0.5);
    const body: Body3 = { ...a, sh: add3(a.sh, up), hip: add3(a.hip, up), ends: { ...a.ends, [hand]: end }, on: { ...a.on, [hand]: a.on[hand] && (u < 0.01 || u > 0.97) } };
    if (u > clipAt - 0.02 && u < 1) fx.sfx = { text: 'CLIP!', at, t: seg(u, clipAt - 0.02, 1), tone: 'hit' };
    fx.strain = gap > 0 ? 0.55 : 0.35;
    return { body, mods: {}, fx, look: u > 0.12 && u < 0.85 ? at : undefined };
  };
  const rope = (u: number, an: Animated): RopeBeat => {
    const bight = u >= 0.45 && u < clipAt ? an.body.ends[hand] : undefined;
    if (what === 'anchor') return { ...rb, anchor: u >= clipAt ? 2 : u >= hangDraw ? 1 : 0, bight };
    const draws = u >= hangDraw && !rb.draws.includes(what.bolt) ? [...rb.draws, what.bolt] : rb.draws;
    const clipped = u >= clipAt && !rb.clipped.includes(what.bolt) ? [...rb.clipped, what.bolt] : rb.clipped;
    return { ...rb, draws, clipped, bight };
  };
  return { kind: 'clip', ms: CLIP_MS, pose, rope, focus: [at] };
}

/** The move that fails, played as a near miss: it gets to the hold, only just. */
function tryBeat(a: Body3, step: StepInfo, rock: Rock, rb: RopeBeat): Beat | null {
  const l = step.limb;
  if (!l || !step.target) return null;
  const reach: Body3 = { ...a, ends: { ...a.ends, [l]: step.target }, on: { ...a.on, [l]: true } };
  const pose = (u: number): Animated => { const an = animateStep(a, reach, { ...step, outcome: 'sketchy' }, rock, Math.min(0.99, u)); return { ...an, fx: { ...an.fx, face: 'strain' } }; };
  return { kind: 'try', ms: Math.round(0.75 * stepMs(step)), pose, rope: still(rb), target: ringOf(step, 0.9) };
}

/** The hands come off the holds: down and away from them; the feet go a moment later. */
function offHolds(a: Body3, rock: Rock, f: number): Body3 {
  const n = rock.n(a.hip[1]);
  const off = mul3(add3([0, -0.12, 0], mul3(n, 0.12)), easeOut(f));
  const ends = { ...a.ends };
  for (const h of hands) ends[h] = add3(a.ends[h], off);
  return { ...a, ends, on: { LH: false, RH: false, LF: f < 0.5 && a.on.LF, RF: f < 0.5 && a.on.RF } };
}

/** The top quickdraw the rope runs through, which a fall swings under. */
function topDraw(p: Pitch, clipped: readonly number[]): V3 | null {
  let best: Bolt3 | null = null;
  for (const i of clipped) { const b = p.bolts[i]; if (b && (!best || b.y > best.y)) best = b; }
  return best?.biner ?? null;
}

/**
 * A fall the rope holds (05b §11): the hands come off, the body peels off the rock and drops `len` (the engine's fall
 * length) towards hanging under the top quickdraw, the rope comes tight, the body bounces and the belayer is pulled up.
 */
function fallBeat(from: Body3, len: number, draw: V3 | null, pumped: boolean, rock: Rock, rb: RopeBeat): { beat: Beat; hang: Body3 } {
  const k = from.k;
  const start = from.hip;
  // The feet stop short of the ground; a climber who comes off the first moves only sags onto the rope.
  const lowY = Math.max(start[1] - len, Math.min(start[1], 0.8 * k));
  const dx = draw ? draw[0] - start[0] : 0;
  const low = hangSpot(rock, start[0] + 0.6 * dx, lowY, draw, k);
  const rebound = Math.min(0.35, 0.05 * len + 0.1);
  const hangHip = hangSpot(rock, start[0] + 0.85 * dx, Math.min(lowY + rebound, Math.max(lowY, start[1] - 0.1)), draw, k);
  const lowBody = hangBody(from, low, rock), hang = hangBody(from, hangHip, rock);
  const loseMs = 260, dropMs = Math.round(300 + 150 * Math.min(8, len)), catchMs = 700;
  const ms = loseMs + dropMs + catchMs;
  const l1 = loseMs / ms, l2 = (loseMs + dropMs) / ms;
  const n = rock.n(start[1]);
  const off = offHolds(from, rock, 1);
  const lift = Math.min(0.45, 0.07 * len + 0.08);
  const pose = (u: number): Animated => {
    const fx = calm();
    if (u < l1) {
      const f = u / l1;
      fx.face = 'surprised';
      fx.sfx = { text: pumped ? 'ARGH!' : 'WHOA!', at: add3(from.sh, [0, 0.35 * k, 0]), t: f, tone: 'oops' };
      return { body: offHolds(from, rock, f), mods: { dangle: true }, fx };
    }
    if (u < l2) {
      const d = seg(u, l1, l2), g = d * d;
      const peel: Body3 = { ...off, sh: add3(off.sh, mul3(n, 0.25 * bump(d))), hip: add3(off.hip, mul3(n, 0.15 * bump(d))) };
      const body = mixBody(peel, lowBody, g);
      // The feet fall under the body.
      for (const f of ['LF', 'RF'] as const) body.ends[f] = add3(body.hip, [0.12 * (f === 'LF' ? -1 : 1) * k, -0.62 * from.leg, 0.1]);
      fx.face = 'scared';
      fx.speed = { at: body.hip, dir: [0, -1, 0] };
      if (len > 2.5) fx.sfx = { text: 'WAAAH!', at: add3(body.sh, [0.4, 0.45 * k, 0]), t: d, tone: 'oops' };
      return { body: { ...body, on: { LH: false, RH: false, LF: false, RF: false } }, mods: { dangle: true }, fx };
    }
    const c = seg(u, l2, 1);
    const spring = 1 - Math.exp(-5 * c) * Math.cos(10 * c);
    const hip = mix3(low, hangHip, spring);
    const body = hangBody(from, add3(hip, [0.05 * Math.sin(c * 9) * (1 - c), 0, 0]), rock);
    fx.squash = 1 - 0.16 * Math.exp(-7 * c) * Math.cos(c * 14);
    if (c < 0.5) fx.sfx = { text: 'TWANG!', at: add3(hip, [0.45, 0.2, 0]), t: c / 0.5, tone: 'hit' };
    fx.face = c < 0.45 ? 'surprised' : 'focus';
    return { body, mods: { dangle: !body.on.LF }, fx };
  };
  const rope = (u: number): RopeBeat => (u < l2 ? { ...rb, tight: 0 } : { ...rb, tight: 1, lift: lift * bump(seg(u, l2, l2 + 0.7 * (1 - l2))) });
  return { beat: { kind: 'fall', ms, pose, rope, focus: draw ? [draw] : undefined }, hang };
}

/** Hanging on the rope: a little swing, a hand dropped to shake out. */
function hangBeat(hang: Body3, ms: number, draw: V3 | null, rb: RopeBeat): Beat {
  const pose = (u: number): Animated => {
    const fx = calm();
    fx.face = 'calm';
    const body: Body3 = { ...hang, ends: { ...hang.ends }, sh: add3(hang.sh, [0.03 * Math.sin(u * 7) * (1 - u), 0, 0]) };
    const s = seg(u, 0.2, 0.85);
    if (s > 0 && s < 1) {
      const shake = add3(add3(hang.hip, [0.22 * hang.k, -0.05 * hang.k, 0.08]), [0.03 * Math.sin(u * 60), 0.02 * Math.cos(u * 55), 0]);
      body.ends.RH = mix3(hang.ends.RH, shake, bump(s));
    }
    return { body, mods: { dangle: !hang.on.LF }, fx };
  };
  return { kind: 'hang', ms, pose, rope: () => ({ ...rb, tight: 1, lift: 0 }), focus: draw ? [draw] : undefined };
}

/** Back on: hauled up the rope hand over hand to the stance, then hands and feet back onto the holds the fall left. */
function backOnBeat(hang: Body3, b: Body3, rock: Rock, rb: RopeBeat, after: RopeBeat): Beat {
  const up = Math.max(0, b.hip[1] - hang.hip[1]);
  const ms = Math.round(700 + 90 * Math.min(8, up));
  const below = hangSpot(rock, b.hip[0], b.hip[1] - 0.15 * b.k, null, b.k);
  const pose = (u: number): Animated => {
    const fx = calm();
    const climb = seg(u, 0, 0.6), grab = seg(u, 0.55, 1);
    const hip = mix3(hang.hip, below, ease(climb));
    const body0 = hangBody(hang, hip, rock, climb * up * 2, climb * up * 3);
    let body = grab > 0 ? mixBody(body0, b, ease(grab)) : body0;
    if (u >= 1) body = { ...b, ends: { ...b.ends }, on: { ...b.on } };
    fx.face = climb < 1 ? 'strain' : 'focus';
    fx.strain = 0.5;
    return { body, mods: {}, fx };
  };
  return { kind: 'back', ms, pose, rope: (u) => (u < 0.7 ? { ...rb, tight: 1, lift: 0 } : after) };
}

/** Take (05b §1): the climber calls for it, the belayer takes in, and the climber sits back onto the rope. */
function takeBeat(a: Body3, hang: Body3, rock: Rock, rb: RopeBeat, word = 'TAKE!'): Beat {
  const pose = (u: number): Animated => {
    const fx = calm();
    if (u < 0.35) {
      fx.face = 'strain';
      fx.strain = 0.6;
      fx.sfx = { text: word, at: add3(a.sh, [0, 0.4 * a.k, 0]), t: u / 0.35, tone: 'effort' };
      return { body: a, mods: {}, fx };
    }
    const s = seg(u, 0.35, 1);
    fx.face = 'calm';
    return { body: mixBody(offHolds(a, rock, Math.min(1, s * 2)), hang, ease(s)), mods: { dangle: s > 0.5 && !hang.on.LF }, fx };
  };
  return { kind: 'take', ms: 1100, pose, rope: (u) => ({ ...rb, tight: u < 0.35 ? 0.4 + 0.6 * (u / 0.35) : 1, lift: 0 }) };
}

/** Pulling through on a quickdraw (aid): a hand on the draw, pull up, and the limb on to its hold. */
function aidBeat(a: Body3, b: Body3, step: StepInfo, draw: V3 | null, rock: Rock, rb: RopeBeat): Beat {
  const l = step.limb;
  const near = (h: 'LH' | 'RH'): number => (draw ? Math.hypot(...sub3(a.ends[h], draw)) : 0);
  const hand: 'LH' | 'RH' = isHand(l) ? l : near('LH') <= near('RH') ? 'LH' : 'RH';
  const reachable = draw && Math.hypot(...sub3(draw, a.sh)) < 1.15 * a.arm;
  const grip: V3 = reachable && draw ? draw : add3(a.ends[hand], [0, 0.15, 0]);
  const pose = (u: number): Animated => {
    const fx = calm();
    const body = mixBody(a, b, ease(seg(u, 0.3, 0.95)));
    const ends = { ...body.ends };
    ends[hand] = u < 0.3 ? limbPath(a.ends[hand], grip, rock, u, 0, 0.3, 0.5) : u < 0.62 ? grip : limbPath(grip, b.ends[hand], rock, u, 0.62, 0.95, 0.5);
    if (l && !isHand(l)) ends[l] = limbPath(a.ends[l], b.ends[l], rock, u, 0.4, 0.9, 1);
    const on = { ...a.on, [hand]: u >= 0.95 && b.on[hand] };
    if (l && !isHand(l)) on[l] = u >= 0.9 ? b.on[l] : u < 0.4 ? a.on[l] : false;
    fx.strain = 0.6;
    fx.face = 'strain';
    const out = u >= 1 ? { ...b, ends: { ...b.ends }, on: { ...b.on } } : { ...body, ends, on };
    return { body: out, mods: {}, fx, look: step.target };
  };
  return { kind: 'aid', ms: 1300, pose, rope: still(rb), target: ringOf(step), focus: reachable && draw ? [draw] : undefined };
}

/** Lowering off: the belayer pays out, the climber sits in the harness and walks down the rock past the quickdraws. */
function lowerBeat(from: Body3, path: V3[], rock: Rock, rb: RopeBeat): { beat: Beat; end: Body3 } {
  const lens = path.slice(1).map((p, i) => Math.hypot(...sub3(p, path[i]!)));
  const total = lens.reduce((s, d) => s + d, 0) || 1;
  const at = (e: number): V3 => {
    let d = e * total;
    for (let i = 0; i < lens.length; i++) {
      if (d <= lens[i]! || i === lens.length - 1) return mix3(path[i]!, path[i + 1]!, lens[i]! > 0 ? clamp(d / lens[i]!, 0, 1) : 1);
      d -= lens[i]!;
    }
    return path[path.length - 1]!;
  };
  const height = Math.max(0, path[0]![1] - path[path.length - 1]![1]);
  const ms = Math.round(Math.min(3600, 1300 + 75 * height));
  const pose = (u: number): Animated => {
    const fx = calm();
    fx.face = 'calm';
    const e = ease(u);
    const body = hangBody(from, at(e), rock, e * total / 0.45);
    return { body, mods: { dangle: !body.on.LF }, fx };
  };
  const end = hangBody(from, path[path.length - 1]!, rock, total / 0.45);
  return { beat: { kind: 'lower', ms, pose, rope: (u) => ({ ...rb, tight: 1, lift: 0, pay: u * Math.max(2, height / 2) }) }, end };
}

/** The hips' way down when lowered: past each quickdraw below, then to the ground where the climber lands. */
function lowerPath(p: Pitch, from: V3, clipped: readonly number[], rock: Rock, k: number): V3[] {
  const path: V3[] = [from];
  const below = [...clipped].map((i) => p.bolts[i]!).filter((b) => b && b.y < from[1] - 1).sort((a, b) => b.y - a.y);
  for (const b of below) if (b.y - 0.7 * k > 1.2) path.push(hangSpot(rock, b.biner[0], b.y - 0.7 * k, b.biner, k));
  path.push(add3(p.ground, [0, 0.82 * k, 0]));
  return path;
}

/** Touching down and standing up at the foot of the route. */
function landBeat(from: Body3, stand: Body3, facingOut: boolean, rb: RopeBeat): Beat {
  const pose = (u: number): Animated => {
    const fx = calm();
    fx.face = facingOut ? 'happy' : 'focus';
    return { body: mixBody(from, stand, ease(u)), mods: { facingOut: facingOut && u > 0.5 }, fx, look: facingOut ? undefined : add3(stand.sh, [0, 3, -1]) };
  };
  return { kind: 'land', ms: 700, pose, rope: () => ({ ...rb, tight: 0.6, lift: 0 }) };
}

/** On top: one hand on the jug, the other fist in the air. */
function sentBeat(a: Body3, free: 'LH' | 'RH', rb: RopeBeat): Beat {
  const side = free === 'LH' ? -1 : 1;
  const fist = add3(a.sh, [0.22 * side * a.k, 0.58 * a.k, 0.12]);
  const pose = (u: number): Animated => {
    const fx = calm();
    fx.face = 'happy';
    const up = Math.max(0, Math.min(1, 3 * u, 3 * (1 - u)));
    fx.sfx = { text: 'SENT!', at: add3(a.sh, [0, 0.75 * a.k, 0]), t: u, tone: 'joy' };
    return { body: { ...a, ends: { ...a.ends, [free]: mix3(a.ends[free], fist, ease(up)) }, on: { ...a.on, [free]: false } }, mods: {}, fx };
  };
  return { kind: 'sent', ms: 1000, pose, rope: still(rb) };
}

/**
 * A fall to the ground (05b §11, the rope came tight too late or nothing was clipped). Off the first moves it is a
 * step down onto the feet; from higher it is a hard landing, drawn without the pad gags (25 open questions).
 */
function groundBeat(from: Body3, land: V3, low: boolean, rock: Rock, rb: RopeBeat): Beat {
  const k = from.k;
  const seated: Body3 = (() => {
    const hip: V3 = add3(land, [0, 0.16 * k, 0]);
    const sh: V3 = add3(hip, [-0.04 * k, 0.46 * k, 0.12 * k]);
    return { ...from, sh, hip, on: { LH: false, RH: false, LF: false, RF: false }, ends: { LH: add3(hip, [-0.3 * k, -0.1 * k, -0.04]), RH: add3(hip, [0.3 * k, -0.1 * k, -0.03]), LF: add3(hip, [-0.2 * k, -0.12 * k, 0.6 * k]), RF: add3(hip, [0.22 * k, -0.12 * k, 0.55 * k]) } };
  })();
  const standing = standBody(from, land, false);
  const crouch: Body3 = { ...standing, hip: add3(standing.hip, [0, -0.25 * k, 0.05]), sh: add3(standing.sh, [0, -0.3 * k, 0.12]) };
  const end = low ? standing : seated;
  const drop = Math.max(0.2, from.hip[1] - (low ? crouch.hip[1] : seated.hip[1]));
  const loseMs = 240, dropMs = Math.round(250 + 160 * Math.min(8, drop)), landMs = 900;
  const ms = loseMs + dropMs + landMs;
  const l1 = loseMs / ms, l2 = (loseMs + dropMs) / ms;
  const off = offHolds(from, rock, 1);
  const pose = (u: number): Animated => {
    const fx = calm();
    if (u < l1) { fx.face = 'surprised'; return { body: offHolds(from, rock, u / l1), mods: { dangle: true }, fx }; }
    if (u < l2) {
      const d = seg(u, l1, l2);
      fx.face = 'scared';
      fx.speed = { at: from.hip, dir: [0, -1, 0] };
      return { body: { ...mixBody(off, low ? crouch : seated, d * d), on: { LH: false, RH: false, LF: false, RF: false } }, mods: { dangle: true, seated: !low && d > 0.7, facingOut: !low && d > 0.7 }, fx };
    }
    const c = seg(u, l2, 1);
    fx.squash = 1 - 0.18 * Math.exp(-6 * c) * Math.cos(c * 14);
    if (c < 0.5) fx.puff = { at: land, t: c / 0.5, dust: true };
    fx.face = low ? 'surprised' : 'scared';
    return { body: low ? mixBody(crouch, standing, ease(seg(c, 0.3, 1))) : end, mods: { seated: !low, facingOut: !low }, fx };
  };
  return { kind: 'ground', ms, pose, rope: () => ({ ...rb, tight: 0, lift: 0 }) };
}

// ---------------------------------------------------------------- a step's plan

/** What a step on a pitch starts from, from the frames. */
export interface PitchStep {
  /** The log entries the step added. */
  entries: readonly MoveReport[];
  /** The body and the engine's state before the step; after it, when the attempt went on. */
  a: Body3;
  climb: ClimbState;
  after: { body: Body3; climb: ClimbState } | null;
  /** Bolts clipped before the step, the height the rope last came tight to, and the next bolt to clip. */
  clipped: readonly number[];
  lastClipY: number | null;
  next: number;
  /** How the attempt ended, when this is its last step. */
  outcome?: AttemptResult['outcome'] | undefined;
}

export interface PitchEnv {
  geom: RouteGeom;
  ath: Athlete;
  rock: Rock;
  pitch: Pitch;
  bodyOf(climb: ClimbState): Body3;
  stepOf(m: MoveReport): StepInfo;
}

/** The engine's centre of mass height for a state (attempt.ts `comHeight`). */
const comY = (env: PitchEnv, climb: ClimbState): number => yOfS(env.geom.route.wall, bodyPoints(env.geom, env.ath, climb).CoM.s);

/**
 * The beats of one step on a pitch from the entries it added to the log, or null when it is an ordinary move, rest or
 * chalk (played as on a boulder). The last step of an attempt also plays the ending: the chains and the lower, a fall
 * and the lower, a lower off, or a fall to the ground.
 */
export function planStep(env: PitchEnv, s: PitchStep): Plan | null {
  const { rock, pitch, geom, ath } = env;
  const es = s.entries;
  const ropey = es.some((e) => e.kind !== 'move' ? e.kind !== 'rest' && e.kind !== 'chalk' : e.outcome === 'aided' || e.outcome === 'fall' || e.outcome === 'pumped');
  if (!ropey && !s.outcome) return null;
  const beats: Beat[] = [];
  let body = s.a;
  let climb = s.climb;
  let rb = restingRope(s.clipped);
  let lastClipY = s.lastClipY;
  let cause: 'fell' | 'pumped' | null = null;
  let hang: Body3 | null = null;
  const done = !s.after;
  for (let j = 0; j < es.length; j++) {
    const e = es[j]!;
    const step = env.stepOf(e);
    if (e.kind === 'move' && (e.outcome === 'clean' || e.outcome === 'sketchy' || e.outcome === 'aided' || e.outcome === 'slip_recovered')) {
      // A move that holds: to the frame's state after the step, or, on the last step, the engine's own next state.
      const nextClimb = s.after?.climb ?? (e.outcome !== 'slip_recovered' && e.limb && e.hold && e.cls ? applyMove(geom, ath, climb, e.limb, e.hold, e.cls) : climb);
      const nextBody = s.after?.body ?? env.bodyOf(nextClimb);
      beats.push(e.outcome === 'aided' ? aidBeat(body, nextBody, step, topDraw(pitch, rb.clipped), rock, rb) : moveBeat(body, nextBody, step, rock, rb));
      body = nextBody;
      climb = nextClimb;
      continue;
    }
    if (e.kind === 'move' && e.outcome === 'fall') {
      const t = tryBeat(body, step, rock, rb);
      if (t) { beats.push(t); body = t.pose(1).body; }
      cause = 'fell';
      continue;
    }
    if (e.kind === 'move' && e.outcome === 'pumped') { cause = 'pumped'; continue; }
    if (e.kind === 'clip') {
      const anchor = done && (s.outcome === 'sent' || s.outcome === 'worked');
      if (anchor && pitch.anchor) {
        const { clip } = clipHands(geom, climb, pitch.anchor.from);
        beats.push(clipBeat(body, clip, pitch.anchor.ring, rock, rb, 'anchor'));
        rb = { ...rb, anchor: 2 };
        if (s.outcome === 'sent') beats.push(sentBeat(body, clip, rb));
        continue;
      }
      const bi = s.next;
      const bolt = pitch.bolts[bi];
      if (bolt) {
        const { clip } = clipHands(geom, climb, bolt.from);
        beats.push(clipBeat(body, clip, bolt.biner, rock, rb, { bolt: bi }));
        rb = { ...rb, draws: [...rb.draws, bi], clipped: [...rb.clipped, bi].sort((x, y) => x - y) };
        lastClipY = bolt.y;
      }
      continue;
    }
    if (e.kind === 'fall') {
      const y = comY(env, climb);
      if (reachesGround(y, lastClipY, BELAY_QUALITY)) {
        const land: V3 = [body.hip[0], 0, pitch.ground[2]];
        beats.push(groundBeat(body, land, y < 1.5, rock, rb));
        hang = null;
        break;
      }
      const f = fallBeat(body, fallLength(y, lastClipY!, BELAY_QUALITY), topDraw(pitch, rb.clipped), cause === 'pumped', rock, rb);
      beats.push(f.beat);
      hang = f.hang;
      body = hang;
      continue;
    }
    if (e.kind === 'take') {
      const draw = topDraw(pitch, rb.clipped);
      if (!hang) {
        // Called for: the rope comes tight from where the climber is, as on a fall with a tight belay.
        const y = comY(env, climb);
        const len = lastClipY === null ? 0.3 : fallLength(y, lastClipY, 100);
        const dx = draw ? draw[0] - body.hip[0] : 0;
        hang = hangBody(body, hangSpot(rock, body.hip[0] + 0.6 * dx, Math.max(0.85 * body.k, body.hip[1] - len + 0.15), draw, body.k), rock);
        beats.push(takeBeat(body, hang, rock, rb));
      }
      beats.push(hangBeat(hang, 700, draw, rb));
      const back = s.after?.body ?? env.bodyOf(climb);
      beats.push(backOnBeat(hang, back, rock, rb, restingRope(rb.clipped)));
      body = back;
      hang = null;
      continue;
    }
    if (e.kind === 'lower') {
      const draw = topDraw(pitch, rb.clipped);
      if (!hang) {
        const y = comY(env, climb);
        const len = lastClipY === null ? 0.3 : fallLength(y, lastClipY, 100);
        hang = hangBody(body, hangSpot(rock, body.hip[0], Math.max(0.85 * body.k, body.hip[1] - len + 0.15), draw, body.k), rock);
        beats.push(takeBeat(body, hang, rock, rb));
      } else beats.push(hangBeat(hang, 600, draw, rb));
      beats.push(...lowerAndLand(env, hang, rb, false));
      hang = null;
      break;
    }
    // A rest or chalk inside a step that is otherwise the rope's: played as on a boulder.
    const next = s.after?.body ?? body;
    beats.push(moveBeat(body, next, step, rock, rb));
    body = next;
  }
  // The chains: sit back onto the anchor and lower off.
  if (done && (s.outcome === 'sent' || s.outcome === 'worked') && pitch.anchor) {
    const ring = pitch.anchor.ring;
    const hold = hangBody(body, hangSpot(rock, ring[0], ring[1] - 0.75 * body.k, ring, body.k), rock);
    beats.push(takeBeat(body, hold, rock, rb, 'LOWER!'));
    beats.push(...lowerAndLand(env, hold, rb, true, s.outcome === 'sent'));
  }
  return beats.length ? planOf(beats) : null;
}

/** Lowered to the foot of the route, then standing: facing out, arms up after a send. */
function lowerAndLand(env: PitchEnv, hang: Body3, rb: RopeBeat, chains: boolean, sent = false): Beat[] {
  const path = lowerPath(env.pitch, hang.hip, rb.clipped, env.rock, hang.k);
  const low = lowerBeat(hang, path, env.rock, chains ? { ...rb, anchor: 2 } : rb);
  const stand = standBody(hang, env.pitch.ground, sent);
  return [low.beat, landBeat(low.end, stand, chains, chains ? { ...rb, anchor: 2 } : rb)];
}

/** Every limb end and the hips and shoulders of a body, for the tests. */
export const pitchPoints = (b: Body3): V3[] => [b.sh, b.hip, ...LIMBS.map((l) => b.ends[l])];
