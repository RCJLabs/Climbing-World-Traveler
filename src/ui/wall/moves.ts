// How each simulated step looks in motion (docs/25 §10): a move class is a shape of movement, not just a line from
// one pose to the next. A deadpoint loads, drives the hips in and slaps at the top of the movement; a dyno crouches,
// cuts loose and catches; a high step brings the knee to the chest and rocks over; a heel hook swings out and pulls;
// a slip goes for the hold, pops off it and comes back. Every animation starts and ends on the engine's poses.
// Pure: no DOM.

import type { CommitOutcome, MoveOutcome } from '../../sim/state';
import type { Limb, MoveClass } from '../../sim/types';
import { add3, LIMBS, mix3, mixBody, mul3, norm3, sub3, type Body3, type RigMods, type Rock, type V3 } from './rig';

export const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
/** Progress through the window [a, b] of t, 0 before and 1 after. */
export const seg = (t: number, a: number, b: number): number => clamp((t - a) / (b - a), 0, 1);
export const bump = (t: number): number => Math.sin(Math.PI * clamp(t, 0, 1));

/** One step of the attempt log, as the wall needs it. */
export interface StepInfo {
  kind: 'move' | 'rest' | 'chalk' | 'jump' | 'clip' | 'fall' | 'take' | 'lower';
  limb?: Limb | undefined;
  cls?: MoveClass | undefined;
  outcome?: MoveOutcome | undefined;
  commit?: CommitOutcome | undefined;
  /** Where the hold the move went for is (a slip goes for it and comes back). */
  target?: V3 | undefined;
  /** A clean static move inside the auto-success margin (05b §4): on a pitch it plays quickly (25 §10.8). */
  routine?: boolean | undefined;
}

export type Face = 'focus' | 'strain' | 'scared' | 'surprised' | 'dizzy' | 'happy' | 'calm';

/** What the drawing adds on top of the body. */
export interface Fx {
  /** Comic lettering at a point; `t` runs 0–1 over its life. */
  sfx?: { text: string; at: V3; t: number; tone: 'hit' | 'oops' | 'effort' | 'joy' } | undefined;
  /** A puff of chalk, or dust from the pads. */
  puff?: { at: V3; t: number; dust: boolean } | undefined;
  /** Motion lines trailing a point that moves fast, `dir` the way it is going. */
  speed?: { at: V3; dir: V3 } | undefined;
  /** 0 relaxed to 1 everything. */
  strain: number;
  /** Side-to-side wobble of the body (m). */
  wobble: number;
  /** Squash and stretch about the hips: 1 none, above stretches, below squashes. */
  squash: number;
  face: Face;
  /** Stars round the head after a hard landing. */
  stars: boolean;
  /** Sweat flies off: the move is hard. */
  sweat: boolean;
}

export interface Animated {
  body: Body3;
  mods: RigMods;
  fx: Fx;
  /** Where the climber looks. */
  look?: V3 | undefined;
}

export const calm = (): Fx => ({ strain: 0.2, wobble: 0, squash: 1, face: 'focus', stars: false, sweat: false });

/** How long a step plays at 1× (ms). **(tune)** */
export function stepMs(step: StepInfo): number {
  if (step.kind === 'rest') return 1300;
  if (step.kind === 'chalk') return 850;
  if (step.kind === 'jump') return 900;
  let ms = 560;
  switch (step.cls) {
    case 'high_step': ms = 950; break;
    case 'heel_hook': case 'toe_hook': ms = 850; break;
    case 'deadpoint': ms = 850; break;
    case 'dyno': ms = 1150; break;
    case 'match': ms = 620; break;
    case 'bump': ms = 700; break;
    case 'mantle': ms = 1100; break;
    default: ms = step.limb === 'LF' || step.limb === 'RF' ? 480 : 600;
  }
  if (step.outcome === 'slip_recovered') ms += 450;
  if (step.outcome === 'sketchy') ms += 250;
  return ms;
}

/** The face's way up (along the surface, in the y–z plane) at a height. */
export const upAlong = (rock: Rock, y: number): V3 => { const n = rock.n(y); return [0, n[2], -n[1]]; };

/** A limb's end through a move: off at `t0`, on at `t1`, out from the rock in between. */
export function limbPath(from: V3, to: V3, rock: Rock, t: number, t0: number, t1: number, bulge = 1): V3 {
  const u = seg(t, t0, t1);
  if (u <= 0) return from;
  if (u >= 1) return to;
  const p = mix3(from, to, ease(u));
  const d = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const out = Math.min(0.24, 0.38 * d) * bulge * bump(ease(u));
  return add3(p, add3(mul3(rock.n(p[1]), out), mul3(upAlong(rock, p[1]), 0.25 * out)));
}

const otherHand = (l: Limb): Limb => (l === 'LH' ? 'RH' : 'LH');

/**
 * Step `step` from body `a` to body `b` (the engine's poses before and after) at `t` (0–1). `rock` is the face for
 * directions off it. The result starts on `a` and ends on `b`.
 */
export function animateStep(a: Body3, b: Body3, step: StepInfo, rock: Rock, t: number): Animated {
  const fx = calm();
  const mods: RigMods = {};
  if (step.kind === 'rest') return landOn(shakeOut(a, rock, t), b, t);
  if (step.kind === 'chalk') return landOn(chalkUp(a, rock, t), b, t);
  // Rope steps play from the pitch's plan (pitch.ts); taken alone, a clip reads as a hand to the harness and back.
  if (step.kind === 'clip') return landOn(chalkUp(a, rock, t), b, t);
  if (step.kind === 'fall' || step.kind === 'take' || step.kind === 'lower') return { body: mixBody(a, b, ease(t)), mods, fx };
  const l = step.limb;
  if (!l) return { body: mixBody(a, b, ease(t)), mods, fx };
  const hand = l === 'LH' || l === 'RH';
  const target = step.target ?? b.ends[l];
  if (step.outcome === 'slip_recovered') return landOn(slip(a, l, target, rock, t, step.cls === 'dyno' || step.cls === 'deadpoint'), b, t);
  let body: Body3;
  let look: V3 | undefined = target;
  switch (step.cls) {
    case 'deadpoint': case 'dyno': {
      const dyno = step.cls === 'dyno';
      const load = seg(t, 0, 0.3), fly = seg(t, 0.3, dyno ? 0.6 : 0.62), settle = seg(t, dyno ? 0.6 : 0.62, 1);
      const up = upAlong(rock, a.hip[1]);
      const n = rock.n(a.hip[1]);
      const k = b.k;
      // Load: sink and sit back. Drive: hips in and up, highest at the catch. Settle: swing out a little and back.
      const sink = add3(mul3(up, -(dyno ? 0.12 : 0.06) * k), mul3(n, (dyno ? 0.12 : 0.05) * k));
      const lift = add3(mul3(up, (dyno ? 0.24 : 0.13) * k), mul3(n, -(dyno ? 0.04 : 0.08) * k));
      const base = mixBody(a, b, ease(fly));
      const off = add3(mul3(sink, ease(load) * (1 - ease(fly))), mul3(lift, bump(seg(t, 0.3, dyno ? 0.92 : 0.95)) * (1 - 0.6 * settle)));
      const swing = mul3(n, 0.05 * k * bump(settle) * (dyno ? 1.6 : 1));
      body = { ...base, sh: add3(add3(base.sh, off), swing), hip: add3(add3(base.hip, mul3(off, 1.2)), swing), ends: { ...base.ends }, on: { ...a.on } };
      body.ends[l] = limbPath(a.ends[l], target, rock, t, 0.3, dyno ? 0.6 : 0.62, 0.6);
      body.on[l] = fly >= 1;
      if (dyno) {
        // Everything else lets go in the air and comes back after the catch, or the feet swing free if they cut.
        const air = t > 0.32 && t < 0.62;
        const o = otherHand(l);
        body.on[o] = !air && a.on[o];
        if (air) body.ends[o] = mix3(a.ends[o], add3(body.sh, [0.18 * (o === 'LH' ? -1 : 1) * k, 0.1 * k, 0.05]), bump(seg(t, 0.3, 0.62)));
        for (const f of ['LF', 'RF'] as const) {
          // The feet push until the legs are straight, trail under the body in the air, swing out from the rock with
          // the catch, and come back to it if there are footholds to come back to.
          const hang = add3(body.hip, [0.12 * (f === 'LF' ? -1 : 1) * k, -0.66 * b.leg, 0.06 + 0.4 * bump(settle)]);
          const leave = 0.42, back = seg(t, 0.78, 0.98);
          body.on[f] = (t < leave && a.on[f]) || (back >= 1 && b.on[f]);
          body.ends[f] = t < leave ? a.ends[f] : b.on[f] ? mix3(hang, b.ends[f], ease(back)) : hang;
          if (t >= leave && t < 0.55) body.ends[f] = mix3(a.ends[f], hang, ease(seg(t, leave, 0.55)));
        }
        mods.dangle = true;
        if (t > 0.3 && t < 0.5) fx.sfx = { text: 'HUP!', at: add3(body.hip, mul3(n, 0.3)), t: seg(t, 0.3, 0.5), tone: 'effort' };
        fx.squash = 1 + 0.12 * bump(seg(t, 0.28, 0.5)) - 0.08 * bump(seg(t, 0.1, 0.3));
      }
      if (fly > 0 && fly < 1) fx.speed = { at: body.ends[l], dir: norm3(sub3(target, a.ends[l])) };
      // The word for the catch: stuck at the top of the movement, caught, or slapped and barely held.
      const sketchy = step.outcome === 'sketchy';
      if (t > 0.58 && t < 0.95) fx.sfx = { text: sketchy ? 'SLAP!' : step.commit === 'apex' ? 'STICK!' : 'CATCH!', at: target, t: seg(t, 0.58, 0.95), tone: sketchy ? 'oops' : 'hit' };
      fx.strain = t < 0.62 ? 0.5 + 0.5 * load : 0.5;
      fx.face = t < 0.6 ? 'strain' : 'focus';
      fx.sweat = true;
      break;
    }
    case 'high_step': {
      // The foot comes up high with the knee to the chest, then the body rocks over it.
      const rock1 = seg(t, 0.45, 1);
      const n = rock.n(a.hip[1]);
      body = mixBody(a, b, ease(rock1));
      body.hip = add3(body.hip, mul3(n, 0.08 * b.k * bump(seg(t, 0, 0.6))));
      body.hip = add3(body.hip, [(target[0] - body.hip[0]) * 0.25 * bump(rock1), 0, 0]);
      body.ends = { ...body.ends, [l]: limbPath(a.ends[l], target, rock, t, 0.02, 0.5, 1.3) };
      body.on = { ...a.on, [l]: t >= 0.5 };
      mods.kneeUp = t < 0.75 ? l : undefined;
      look = t < 0.5 ? target : undefined;
      fx.strain = 0.35 + 0.35 * bump(rock1);
      fx.face = rock1 > 0 ? 'strain' : 'focus';
      break;
    }
    case 'heel_hook': case 'toe_hook': {
      // The leg swings out and up onto the hold, then pulls the hips towards it.
      const pullIn = seg(t, 0.45, 1);
      body = mixBody(a, b, ease(pullIn));
      body.ends = { ...body.ends, [l]: limbPath(a.ends[l], target, rock, t, 0, 0.5, 1.6) };
      body.on = { ...a.on, [l]: t >= 0.5 };
      if (step.cls === 'heel_hook') mods.heel = t > 0.3 ? l : undefined; else mods.toe = t > 0.3 ? l : undefined;
      if (t <= 0.3) mods.kneeUp = l;
      fx.strain = 0.6;
      fx.face = 'strain';
      fx.sweat = true;
      break;
    }
    case 'match': case 'bump': {
      const two = step.cls === 'bump';
      body = mixBody(a, b, ease(seg(t, 0, 0.8)));
      const mid = add3(mix3(a.ends[l], target, 0.45), mul3(rock.n(target[1]), 0.06));
      body.ends = {
        ...body.ends,
        [l]: two ? (t < 0.5 ? limbPath(a.ends[l], mid, rock, t, 0.05, 0.4, 0.6) : limbPath(mid, target, rock, t, 0.55, 0.9, 0.6)) : limbPath(a.ends[l], target, rock, t, 0.1, 0.85, 0.5),
      };
      body.on = { ...a.on, [l]: t >= 0.85 || (two && t > 0.4 && t < 0.55) };
      fx.strain = 0.35;
      break;
    }
    default: {
      // A static move: the weight shifts first, the limb follows on an arc and lands.
      const t0 = hand ? 0.15 : 0.05, t1 = hand ? 0.85 : 0.75;
      body = mixBody(a, b, ease(seg(t, hand ? 0 : 0.3, hand ? 0.8 : 1)));
      body.ends = { ...body.ends, [l]: limbPath(a.ends[l], target, rock, t, t0, t1) };
      body.on = { ...a.on, [l]: t >= t1 ? b.on[l] : t < t0 ? a.on[l] : false };
      fx.strain = hand ? 0.35 : 0.2;
    }
  }
  if (step.outcome === 'sketchy' && t > 0.7) {
    // Barn-door wobble as the hold is taken badly.
    const w = 0.035 * b.k * Math.sin((t - 0.7) * 38) * (1 - seg(t, 0.7, 1));
    fx.wobble = w;
    fx.strain = Math.max(fx.strain, 0.8);
    fx.face = 'scared';
    fx.sweat = true;
    if (!fx.sfx) fx.sfx = { text: 'NNGH!', at: body.ends[l], t: seg(t, 0.7, 1), tone: 'effort' };
  }
  if (t >= 1) body = { ...b, ends: { ...b.ends }, on: { ...b.on } };
  return { body, mods, fx, look };
}

/** The last fifth of a step that goes nowhere (a slip, a shake-out, chalking) eases onto the engine's pose after it. */
function landOn(an: Animated, b: Body3, t: number): Animated {
  const u = seg(t, 0.8, 1);
  return u <= 0 ? an : { ...an, body: mixBody(an.body, b, ease(u)) };
}

/**
 * A slip that is held: the limb goes for the hold, pops off and comes back to where it was. Gone for dynamically, the
 * body launches with it and drops back.
 */
function slip(a: Body3, l: Limb, target: V3, rock: Rock, t: number, dynamic: boolean): Animated {
  const fx = calm();
  const hand = l === 'LH' || l === 'RH';
  const up = upAlong(rock, target[1]);
  const n = rock.n(target[1]);
  const launch = dynamic ? mul3(upAlong(rock, a.hip[1]), 0.14 * a.k * bump(seg(t, 0.05, 0.75))) : ([0, 0, 0] as V3);
  if (dynamic && t > 0.05 && t < 0.3) fx.sfx = { text: 'HUP!', at: add3(a.hip, mul3(rock.n(a.hip[1]), 0.3)), t: seg(t, 0.05, 0.3), tone: 'effort' };
  const popped = add3(target, add3(mul3(up, -0.13), mul3(n, 0.1)));
  let end: V3;
  if (t < 0.4) end = limbPath(a.ends[l], target, rock, t, 0, 0.4);
  else if (t < 0.5) end = target;
  else if (t < 0.64) end = mix3(target, popped, easeOut(seg(t, 0.5, 0.64)));
  else end = limbPath(popped, a.ends[l], rock, t, 0.64, 0.98, 0.5);
  const sag = 0.06 * a.k * bump(seg(t, 0.5, 0.9));
  const body: Body3 = { ...a, sh: add3(add3(a.sh, mul3(up, -sag)), launch), hip: add3(add3(a.hip, mul3(up, -sag)), mul3(launch, 1.2)), ends: { ...a.ends, [l]: end }, on: { ...a.on, [l]: (t > 0.38 && t < 0.52) || t > 0.97 } };
  if (t > 0.5) {
    fx.wobble = 0.03 * a.k * Math.sin((t - 0.5) * 40) * (1 - seg(t, 0.5, 0.95));
    fx.face = t < 0.75 ? 'surprised' : 'scared';
    fx.sfx = { text: hand ? 'WHOA!' : 'SKRRT!', at: popped, t: seg(t, 0.5, 0.95), tone: 'oops' };
    fx.strain = 0.8;
    fx.sweat = true;
  }
  return { body, mods: {}, fx, look: target };
}

/** A shake-out: one hand lets go, hangs and shakes, and goes back. */
function shakeOut(a: Body3, rock: Rock, t: number): Animated {
  const fx = calm();
  fx.face = 'calm';
  const both = a.on.LH && a.on.RH;
  const l: Limb = both ? (a.ends.LH[1] <= a.ends.RH[1] ? 'LH' : 'RH') : a.on.LH ? 'RH' : 'LH';
  const side = l === 'LH' ? -1 : 1;
  const n = rock.n(a.hip[1]);
  const hang = add3(add3(a.hip, [0.2 * side * a.k, 0.05 * a.k, 0]), mul3(n, 0.15));
  const h = seg(t, 0.12, 0.3);
  let end = mix3(a.ends[l], hang, ease(h));
  if (t > 0.3 && t < 0.8) end = add3(hang, [0.03 * Math.sin(t * 60), 0.025 * Math.cos(t * 55), 0]);
  if (t >= 0.8) end = limbPath(hang, a.ends[l], rock, t, 0.8, 0.97, 0.4);
  const sag = 0.04 * a.k * bump(seg(t, 0.1, 0.95));
  const body: Body3 = { ...a, sh: add3(a.sh, [0, -sag, 0]), hip: add3(a.hip, [0, -sag, 0]), ends: { ...a.ends, [l]: end }, on: { ...a.on, [l]: t < 0.12 || t > 0.96 } };
  return { body, mods: {}, fx };
}

/** Chalking up: a hand to the bag behind the hips, a puff, and back. */
function chalkUp(a: Body3, rock: Rock, t: number): Animated {
  const fx = calm();
  fx.face = 'calm';
  const l: Limb = a.on.RH && (!a.on.LH || a.ends.RH[1] <= a.ends.LH[1]) ? 'RH' : 'LH';
  const n = rock.n(a.hip[1]);
  const bag = add3(add3(a.hip, mul3(n, 0.14 * a.k)), [0, -0.02, 0]);
  const go = seg(t, 0.08, 0.38), back = seg(t, 0.62, 0.95);
  const end = t < 0.62 ? mix3(a.ends[l], bag, ease(go)) : limbPath(bag, a.ends[l], rock, t, 0.62, 0.95, 0.4);
  if (t > 0.4 && t < 0.85) fx.puff = { at: add3(bag, [0, 0.04, 0]), t: seg(t, 0.4, 0.85), dust: false };
  const body: Body3 = { ...a, ends: { ...a.ends, [l]: end }, on: { ...a.on, [l]: t < 0.08 || back >= 1 } };
  return { body, mods: {}, fx };
}

/**
 * How an attempt ends. On a boulder: topped out, fell or pumped onto the pads, jumped off. On a route (§10.8): the
 * chains clipped (sent or worked), a fall the rope held and then the lower, a lower off, or a fall to the ground.
 */
export type EndingKind = 'send' | 'fall' | 'jump' | 'pumped' | 'chains' | 'lower' | 'ground';

/** Where the climber ends up: on top of the block, or on the pads. */
export interface EndPlaces {
  /** The top-out: where the feet go (on top, back from the lip) and the height of the top. */
  topStand: V3;
  /** The lip, where the hands press a mantle. */
  lip: V3;
  /** On the pads below where the climber came off: the hips' landing point. */
  pad: V3;
}

/** How long an ending plays at 1× (ms). **(tune)** */
export function endingMs(kind: EndingKind): number {
  return kind === 'send' ? 2600 : kind === 'jump' ? 1500 : 2300;
}

/**
 * The end of an attempt from the last body `a`: the mantle and stand-up on a send; on a fall, the failed move (`step`),
 * the peel off the rock, the drop and the landing on the pads; on a jump, a drop feet first.
 */
export function animateEnding(a: Body3, kind: EndingKind, places: EndPlaces, rock: Rock, t: number, step?: StepInfo): Animated {
  const fx = calm();
  const k = a.k;
  if (kind === 'send') {
    const reach = seg(t, 0, 0.22), press = seg(t, 0.22, 0.5), stepUp = seg(t, 0.5, 0.7), stand = seg(t, 0.7, 0.86);
    const lipL: V3 = add3(places.lip, [-0.12 * k, 0, 0]), lipR: V3 = add3(places.lip, [0.12 * k, 0, 0]);
    const l = step?.limb === 'LH' || step?.limb === 'RH' ? step.limb : 'RH';
    // Hands to the lip, press until the shoulders are over them, a foot up onto the lip, then stand.
    const pressSh: V3 = add3(places.lip, [0, 0.42 * k, -0.06]);
    const pressHip: V3 = add3(places.lip, [0, -0.05 * k, 0.24 * k]);
    const top = toppedBody(a, places);
    let body: Body3 = { ...a, ends: { ...a.ends }, on: { ...a.on } };
    body.ends.LH = mix3(a.ends.LH, lipL, ease(l === 'LH' ? reach : seg(t, 0.12, 0.3)));
    body.ends.RH = mix3(a.ends.RH, lipR, ease(l === 'RH' ? reach : seg(t, 0.12, 0.3)));
    body.on.LH = body.on.RH = true;
    body.sh = mix3(a.sh, pressSh, ease(press));
    body.hip = mix3(a.hip, pressHip, ease(press));
    // The feet walk up the face to smears under the lip as the arms press, so the knees bend; then the right foot
    // comes up onto the lip.
    const smear = (f: 'LF' | 'RF'): V3 => {
      const y = Math.max(a.ends[f][1], places.lip[1] - 0.5 * a.leg);
      return [a.ends[f][0], y, rock.z(y)];
    };
    const sL = smear('LF'), sR = smear('RF');
    const footUp = add3(places.lip, [0.14 * k, 0.02, 0.02]);
    body.ends.LF = mix3(a.ends.LF, sL, ease(press));
    body.ends.RF = stepUp > 0 ? limbPath(sR, footUp, rock, stepUp, 0, 1, 1.2) : mix3(a.ends.RF, sR, ease(press));
    body.on.LF = true;
    body.on.RF = stepUp >= 1 || stepUp === 0;
    if (stand > 0) body = mixBody(body, top, ease(stand));
    const mods: RigMods = { press: press > 0 && stand < 0.5, kneeUp: stepUp > 0 && stand < 0.6 ? 'RF' : undefined, facingOut: stand > 0.55 };
    fx.strain = t < 0.7 ? 0.7 : 0;
    fx.face = t < 0.7 ? 'strain' : 'happy';
    fx.sweat = t < 0.7;
    if (t > 0.86) fx.sfx = { text: 'SENT!', at: add3(top.sh, [0, 0.75 * k, 0]), t: seg(t, 0.86, 1), tone: 'joy' };
    return { body, mods, fx, look: t < 0.6 ? places.lip : undefined };
  }
  const landed = seatedBody(a, places);
  if (kind === 'jump') {
    // Let go, drop feet first, land in a crouch.
    const drop = seg(t, 0.1, 0.55);
    const air: Body3 = { ...a, on: { LH: false, RH: false, LF: false, RF: false }, ends: { ...a.ends } };
    const g = drop * drop;
    const body = t < 0.1 ? a : mixBody(air, landed, g);
    fx.squash = 1 - 0.18 * bump(seg(t, 0.52, 0.75));
    if (t > 0.5 && t < 0.85) fx.puff = { at: places.pad, t: seg(t, 0.5, 0.85), dust: true };
    fx.face = 'focus';
    return { body: { ...body, on: t < 0.1 ? a.on : { LH: false, RH: false, LF: false, RF: false } }, mods: { facingOut: t > 0.5, seated: t > 0.55 }, fx };
  }
  // A fall: go for it (the failed move), lose it, peel off the rock, drop, land.
  const tryIt = seg(t, 0, 0.3), lose = seg(t, 0.3, 0.42), drop = seg(t, 0.42, 0.72);
  let body: Body3 = { ...a, ends: { ...a.ends }, on: { ...a.on } };
  const l = step?.limb;
  if (kind === 'fall' && l && step?.target) {
    // It goes for the hold and gets there, only just: a slap on a dynamic move, a strain on a static one.
    const tried = animateStep(a, { ...a, ends: { ...a.ends, [l]: step.target }, on: { ...a.on, [l]: true } }, { ...step, outcome: 'sketchy' }, rock, Math.min(0.99, tryIt));
    body = tried.body;
    if (tryIt < 1) return { ...tried, fx: { ...tried.fx, face: 'strain' } };
  }
  // The hands come off: down and away from the hold.
  const n = rock.n(body.hip[1]);
  const off = mul3(add3([0, -0.12, 0], mul3(n, 0.12)), easeOut(lose));
  for (const h of ['LH', 'RH'] as const) body.ends[h] = add3(body.ends[h], off);
  body.on = { LH: false, RH: false, LF: lose < 0.5 && body.on.LF, RF: lose < 0.5 && body.on.RF };
  if (lose < 1) {
    fx.face = 'surprised';
    fx.sfx = { text: kind === 'pumped' ? 'ARGH!' : 'WHOA!', at: add3(body.sh, [0, 0.35 * k, 0]), t: lose, tone: 'oops' };
    return { body, mods: { dangle: true }, fx };
  }
  const g = drop * drop;
  const peel: Body3 = { ...body, sh: add3(body.sh, mul3(n, 0.25 * g)), hip: add3(body.hip, mul3(n, 0.15 * g)) };
  const falling = mixBody(peel, landed, g);
  // The feet fall under the body and only reach out in front as it lands.
  for (const f of ['LF', 'RF'] as const) {
    const hang = add3(falling.hip, [0.12 * (f === 'LF' ? -1 : 1) * k, -0.62 * a.leg, 0.1]);
    falling.ends[f] = mix3(mix3(peel.ends[f], hang, ease(seg(drop, 0, 0.35))), landed.ends[f], ease(seg(drop, 0.7, 1)));
  }
  if (drop < 1) {
    fx.face = 'scared';
    fx.sfx = { text: 'WAAAH!', at: add3(falling.sh, [0.4, 0.45 * k, 0]), t: drop, tone: 'oops' };
    fx.speed = { at: falling.hip, dir: [0, -1, 0] };
    return { body: { ...falling, on: { LH: false, RH: false, LF: false, RF: false } }, mods: { seated: drop > 0.7, facingOut: drop > 0.7, dangle: true }, fx };
  }
  // Landed: squash, dust, stars.
  const land = seg(t, 0.72, 1);
  fx.squash = 1 - 0.22 * Math.exp(-6 * land) * Math.cos(land * 16);
  if (land < 0.5) fx.puff = { at: places.pad, t: land / 0.5, dust: true };
  if (land < 0.45) fx.sfx = { text: 'THUD!', at: add3(places.pad, [0.55, 0.25, 0.3]), t: land / 0.45, tone: 'hit' };
  fx.face = 'dizzy';
  fx.stars = true;
  return { body: landed, mods: { seated: true, facingOut: true }, fx };
}

/** Standing on top, arms up. */
export function toppedBody(a: Body3, places: EndPlaces): Body3 {
  const k = a.k;
  const f = places.topStand;
  const hip: V3 = add3(f, [0, 0.86 * k, 0]);
  const sh: V3 = add3(hip, [0, 0.5 * k, 0]);
  return {
    ...a, sh, hip, on: { LH: false, RH: false, LF: true, RF: true },
    ends: { LH: add3(sh, [-0.3 * k, 0.42 * k, 0.04]), RH: add3(sh, [0.32 * k, 0.44 * k, 0.04]), LF: add3(f, [-0.13 * k, 0, 0]), RF: add3(f, [0.15 * k, 0, 0.04]) },
  };
}

/** Sitting on the pads, legs out in front. */
export function seatedBody(a: Body3, places: EndPlaces): Body3 {
  const k = a.k;
  const hip: V3 = add3(places.pad, [0, 0.16 * k, 0]);
  const sh: V3 = add3(hip, [-0.04 * k, 0.48 * k, 0.1 * k]);
  return {
    ...a, sh, hip, on: { LH: false, RH: false, LF: false, RF: false },
    ends: {
      LH: add3(hip, [-0.33 * k, -0.1 * k, -0.05]), RH: add3(hip, [0.33 * k, -0.1 * k, -0.04]),
      LF: add3(hip, [-0.2 * k, -0.12 * k, 0.62 * k]), RF: add3(hip, [0.22 * k, -0.12 * k, 0.66 * k]),
    },
  };
}

/** Both hands (or feet) on one hold sit side by side rather than on top of each other. */
export function spreadShared(b: Body3): Body3 {
  const ends = { ...b.ends };
  for (const [p, q] of [['LH', 'RH'], ['LF', 'RF']] as const) {
    if (!b.on[p] || !b.on[q]) continue;
    const d = Math.hypot(ends[p][0] - ends[q][0], ends[p][1] - ends[q][1], ends[p][2] - ends[q][2]);
    if (d < 0.03) {
      ends[p] = add3(ends[p], [-0.035 * b.k, 0, 0]);
      ends[q] = add3(ends[q], [0.035 * b.k, 0, 0]);
    }
  }
  return { ...b, ends };
}

/** The points of a body, for tests. */
export const bodyPoints3 = (b: Body3): V3[] => [b.sh, b.hip, ...LIMBS.map((l) => b.ends[l])];
