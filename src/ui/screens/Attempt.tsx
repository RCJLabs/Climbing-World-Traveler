// The wall (05b §7–§10, 17 §2): pick a limb, see the reach and the targets, read the decision triangle, go.
// Ordinary moves are dragged to their hold while the other hand grips (docs/23 §2.1); dynos and deadpoints are swung
// and caught (§2.3). Auto plays any move without input, and auto-climb plays the sure ones and hands back at cruxes.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  athleteOf, autoClimbStep, balanceSetup, classPreview, displayedChance, holdRestPreview, isVisible, limbOptions, liveFear, reachBudget, restPreview, routeEntry,
  showsExactOdds, type AutoStop,
} from '../../sim/attempt';
import { BARN_MS } from '../../sim/balance';
import { applyMove } from '../../sim/engine';
import type { MovePerf } from '../../sim/reach';
import { isDynamic } from '../../sim/tables';
import { izof, powerPool } from '../../sim/resolve';
import type { AttemptState, RunState } from '../../sim/state';
import type { Limb, MoveClass } from '../../sim/types';
import { limbKind, otherHand, stars as starCount } from '../../sim/wall';
import { Circuit, Meter } from '../components';
import { band, bandColour, CLASS_LABEL, grade, holdLabel, pct, stars } from '../format';
import { ENDING_MS, WallCanvas, type Ending, type WallTap } from '../wall/WallCanvas';
import type { TargetKind } from '../wall/render';
import { act, data, goto, settings } from '../store';

const LIMBS: Limb[] = ['LH', 'RH', 'LF', 'RF'];
/** Dyno playback speed at the Normal setting: a real dyno peaks in about 0.35 s, too fast to read on a phone (docs/23). (tune) */
const DYNO_RATE = 0.6;
/** Why auto-climb gave the wall back (05b §10), in the preview line where the player looks next. */
const HAND_BACK: Record<AutoStop | 'paused', string> = {
  crux: 'Auto off: crux next. Your move.',
  dyno: 'Auto off: deadpoint/dyno next. Swing it.',
  pumped: 'Auto off: pumped. Shake or push on.',
  fear: 'Auto off: fear out of your zone.',
  rest: 'Auto off: good shake here.',
  hidden: 'Auto off: next hold unseen. Shake to look.',
  off_line: 'Auto off: off the line. Your call.',
  waiting: 'Auto off: swing this dyno.',
  paused: 'Auto paused.',
};
const NOTE_MS = 2600;
const INFO_MS = 4500;

export function Attempt({ run }: { run: RunState }) {
  const live = run.attempt;
  // The last attempt state stays on screen while a fall or a top-out plays, then the result screen takes over.
  const lastAt = useRef<AttemptState | null>(live);
  if (live) lastAt.current = live;
  const at = live ?? lastAt.current;
  const [ending, setEnding] = useState<Ending>(null);
  const [limb, setLimb] = useState<Limb | null>(null);
  const [hold, setHold] = useState<string | null>(null);
  const [cls, setCls] = useState<MoveClass | null>(null);
  const [auto, setAuto] = useState(false);
  const [aimPower, setAimPower] = useState<number | null>(null);
  const [flying, setFlying] = useState(false);
  /** Two-Thumb Grip: time already spent off the hold at this move, whether the grip pad is held, and a nudge when it was not. */
  const [spent, setSpent] = useState(0);
  const gripRef = useRef(false);
  const [nudge, setNudge] = useState(false);
  /** Why auto-climb stopped; a disabled button's answer; what a long-pressed hold is. */
  const [handBack, setHandBack] = useState<AutoStop | 'paused' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [info, setInfo] = useState<{ title: string; detail: string } | null>(null);
  const busy = useRef(false);
  const options = useMemo(() => (limb && run.attempt ? limbOptions(run, limb, data) : []), [run, limb]);

  useEffect(() => {
    if (live) return;
    const outcome = run.last_attempt?.outcome;
    if (!lastAt.current || settings.value.reduce_motion || !outcome) { goto({ name: 'result' }); return; }
    setEnding(outcome === 'sent' ? 'send' : outcome === 'jumped' ? 'off' : 'fall');
    const t = setTimeout(() => goto({ name: 'result' }), ENDING_MS + 250);
    return () => clearTimeout(t);
  }, [live]);

  // The clock on a move restarts once anything resolves on the wall (wall time moves on every action; the log is capped).
  // A hand-back reason or hold card is stale by then too. This runs before the auto-climb loop, which may set a new one.
  useEffect(() => { setSpent(0); setHandBack(null); setInfo(null); }, [live?.time_s]);
  useEffect(() => { if (!nudge) return; const t = setTimeout(() => setNudge(false), 700); return () => clearTimeout(t); }, [nudge]);
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), NOTE_MS); return () => clearTimeout(t); }, [note]);
  useEffect(() => { if (!info) return; const t = setTimeout(() => setInfo(null), INFO_MS); return () => clearTimeout(t); }, [info]);

  // Backgrounding with a window open resolves it as Auto-commit (18 §5).
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden' && run.attempt?.pending) void act({ t: 'commit', swing: null }); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [run.attempt?.pending]);

  // Auto-commit setting: resolve windows immediately.
  useEffect(() => {
    if (live?.pending && run.options.auto_commit && !busy.current) {
      busy.current = true;
      void act({ t: 'commit', swing: null }).finally(() => { busy.current = false; });
    }
  }, [live?.pending, run.options.auto_commit]);

  // Auto-climb loop: it hands back with its reason in the preview line, not a toast over the preview.
  useEffect(() => {
    if (!auto || !live || busy.current) return;
    const { action: next, reason } = autoClimbStep(run, data);
    if (!next) { setAuto(false); setHandBack(reason ?? 'off_line'); return; }
    const t = setTimeout(() => {
      busy.current = true;
      void act(next).finally(() => { busy.current = false; });
    }, settings.value.reduce_motion ? 60 : 320);
    return () => clearTimeout(t);
  }, [auto, run]);

  if (!at) return null;
  const swinging = !!live?.pending && !run.options.auto_commit && !ending;
  const { route, geom } = routeEntry(at.route_seed, data);
  const ath = athleteOf(run, data);
  const project = run.projects[at.route_id];
  const fear = liveFear(at, geom, ath);
  const bandZ = izof(ath.a.composure);
  const exact = showsExactOdds(run);

  const targets = new Map<string, TargetKind>();
  for (const o of options) {
    if (!o.visible || !o.option.classes.length) continue;
    const c = o.option.classes;
    targets.set(o.option.hold.id, c.includes('mantle') ? 'mantle' : c.every((x) => x === 'deadpoint' || x === 'dyno') ? 'dynamic' : 'legal');
  }
  const selected = options.find((o) => o.option.hold.id === hold && o.option.classes.length > 0 && o.visible) ?? null;
  const classes = selected?.option.classes ?? [];
  const chosen: MoveClass | null = selected ? (cls && classes.includes(cls) ? cls : classes[0] ?? null) : null;
  const pv = selected && chosen ? classPreview(run, selected.option.limb, selected.option.hold.id, chosen, data) : null;
  const shown = pv ? (exact ? pv.p_complete : displayedChance(run, selected!.option.limb, selected!.option.hold.id, chosen!, pv.p_complete)) : 0;
  const rest = restPreview(at, geom, ath);

  const pickLimb = (l: Limb) => { setLimb(l === limb ? null : l); setHold(null); setCls(null); setHandBack(null); };
  // Auto plays its own line, so a half-made selection goes; when it stops, the reason shows where the move would be.
  const toggleAuto = (on: boolean) => { setAuto(on); setHandBack(on ? null : 'paused'); setInfo(null); if (on) { setLimb(null); setHold(null); setCls(null); } };
  const onTap = (t: WallTap) => {
    if (ending) return;
    setInfo(null);
    // A tap on the figure's hand or foot picks that limb, unless it lands on a hold the selected limb can move to.
    if (t.limb && !(limb && t.hold && targets.has(t.hold))) { pickLimb(t.limb); return; }
    tapHold(t.hold);
  };
  const tapHold = (id: string | null) => {
    if (!limb) {
      // Tapping a hold with no limb selected picks the free limb that can reach it, hands first.
      for (const l of LIMBS) {
        const o = limbOptions(run, l, data).find((x) => x.option.hold.id === id && x.visible && x.option.classes.length);
        if (o) { setLimb(l); setHold(id); setCls(null); return; }
      }
      return;
    }
    setHold(id);
    setCls(null);
  };
  const go = async (perf?: MovePerf) => {
    if (!selected || !chosen || busy.current || !live) return;
    busy.current = true;
    const ok = await act({ t: 'move', limb: selected.option.limb, hold: selected.option.hold.id, class: chosen, ...(perf ? { perf } : {}) });
    busy.current = false;
    if (ok) { setHold(null); setCls(null); }
  };
  // A Reach move is armed once a hold and a class that is not a dyno are picked (docs/23 §2.1).
  const armed = !!(live && !ending && !swinging && !auto && selected && chosen && !isDynamic(chosen));
  const moving = selected?.option.limb ?? null;
  const handMove = !!moving && limbKind(moving) === 'hand';
  // A move the stance test flags is balanced instead (§2.2): lean first, then reach; one thumb, no grip clock.
  const bal = armed ? balanceSetup(run, moving!, selected!.option.hold.id, chosen!, data) : null;
  const budget = armed && handMove && !bal ? reachBudget(run, moving!, selected!.option.hold.id, chosen!, data) : null;
  const grip = armed && handMove && !bal && !settings.value.one_thumb && at.climb.anchors[otherHand(moving!)] ? otherHand(moving!) : null;
  const padLeft = grip === 'LH';
  // Where a clean landing leaves the body (17 §2), drawn as a ghost until the move is played.
  const ghost = selected && chosen && live && !swinging && !auto && !ending
    ? applyMove(geom, ath, at.climb, selected.option.limb, selected.option.hold.id, chosen) : null;
  // Long-press on a hold (17 §2): what it is, the shake it would give, and who can reach it or why not.
  const onLongPress = (t: WallTap) => {
    if (ending || !live) return;
    const id = t.hold ?? (t.limb ? at.climb.anchors[t.limb] : null);
    const h = id ? geom.holds.get(id) : undefined;
    if (!id || !h) return;
    if (settings.value.haptics) navigator.vibrate?.(10);
    const r = holdRestPreview(at, geom, ath, id);
    const restText = r === null ? 'foothold' : r < -0.05 ? `shake ${r.toFixed(1)} pump` : `no rest (+${Math.max(0, r).toFixed(1)})`;
    const title = `${holdLabel(h.type)} · ${Math.round(h.angle)}° · ${restText}`;
    const on = LIMBS.filter((l) => at.climb.anchors[l] === id);
    let detail: string;
    if (on.length) detail = `Your ${on.join(' and ')} ${on.length > 1 ? 'are' : 'is'} on it.`;
    else {
      const verdicts = (limb ? [limb] : LIMBS).flatMap((l) => limbOptions(run, l, data).filter((o) => o.option.hold.id === id && o.visible).map((o) => ({ l, o })));
      const can = verdicts.filter((v) => v.o.option.classes.length && v.o.preview);
      if (limb) {
        const v = verdicts[0];
        const p = v?.o.preview;
        detail = !v ? `${limb} can't move there.` : p && can.length
          ? `${limb}: ${exact ? pct(p.p_complete) : band(displayedChance(run, limb, id, v.o.option.classes[0]!, p.p_complete))}${v.o.option.classes.every(isDynamic) ? ' · dyno or deadpoint' : ''}`
          : `${limb} can't: ${v.o.option.reason}.`;
      } else if (can.length) detail = `Reach it with ${can.map((v) => v.l).join(', ')}.`;
      else {
        // The nearest limb of the kind the hold takes says why not.
        const kind = h.hands_ok ? 'hand' : 'foot';
        const best = verdicts.filter((v) => limbKind(v.l) === kind).sort((a, b) => a.o.option.d / a.o.option.R - b.o.option.d / b.o.option.R)[0] ?? verdicts[0];
        detail = best ? `${best.l} can't: ${best.o.option.reason}.` : 'Nothing can move there.';
      }
    }
    setInfo({ title, detail });
  };
  /** A button that is off still answers a tap with why (17 §2), instead of doing nothing. */
  const orWhy = (why: string | null, fn: () => void) => () => { if (why) setNote(why); else fn(); };
  const midDyno = at.pending ? 'Not mid-dyno: swing it first.' : null;
  const goWhy = at.pending ? midDyno : !limb ? 'Pick a limb and a ring first.' : !selected ? 'Tap a ring for that limb first.' : null;
  const wall = async (kind: 'rest' | 'chalk' | 'jump_off') => {
    if (busy.current || !live) return;
    busy.current = true;
    await act({ t: 'wall_action', kind });
    busy.current = false;
  };

  const reason = !selected && hold && limb ? options.find((o) => o.option.hold.id === hold)?.option.reason : null;
  const last = at.log[at.log.length - 1];
  const progress = route.beta_line.length ? Math.min(at.beta_ptr, route.beta_line.length) : 0;

  return (
    <div class="screen attempt">
      <div class="top" style={{ paddingBottom: '8px' }}>
        <div class="top-row">
          <div class="col" style={{ gap: '2px' }}>
            <span class="card-title">{route.name} · {grade(route.di_graded)}</span>
            <span class="tiny muted row"><Circuit c={route.circuit} />{at.mode} · move {at.moves + 1} · line {progress}/{route.beta_line.length}</span>
          </div>
          <button class="chip-btn" aria-pressed={auto} onClick={() => toggleAuto(!auto)}>Auto {auto ? 'on' : 'off'}</button>
        </div>
      </div>
      <WallCanvas
        label={`${route.name}: wall with the climber${limb ? `, ${limb} selected` : ''}`}
        onTap={onTap}
        onLongPress={onLongPress}
        view={{ geom, ath, climb: at.climb, visible: (id) => isVisible(project, route, id), limb: ending ? null : limb, targets: ending ? new Map() : targets, selected: hold, feetCut: at.climb.feet_cut, ghost }}
        motion={{ step: at.time_s, style: { limb: last?.limb, cls: last?.cls }, shake: last?.outcome === 'sketchy' || last?.outcome === 'slip_recovered' }}
        ending={ending}
        reduceMotion={settings.value.reduce_motion}
        reach={armed ? {
          limb: moving!, hold: selected!.option.hold.id, budget, spent, grip, gripHeld: () => gripRef.current, haptics: settings.value.haptics,
          onNeedGrip: () => setNudge(true), onMiss: (ms) => setSpent(ms), onDone: (perf) => void go(perf),
          lean: bal ? {
            base: bal.stance.base, com0: bal.stance.com, outward: bal.stance.outward, barn_ms: BARN_MS,
            drift: run.options.pause_drift ? 0 : bal.drift, key: `${moving}:${selected!.option.hold.id}:${at.time_s}`,
          } : null,
        } : null}
        swing={swinging ? {
          setup: at.pending!.swing, limb: at.pending!.limb, rate: DYNO_RATE / run.options.sweep_speed, haptics: settings.value.haptics,
          onAim: (p, f) => { setAimPower(p); setFlying(f); }, onDone: (perf) => { setAimPower(null); setFlying(false); void act({ t: 'commit', swing: perf }); },
        } : null}
      >
        {info && !auto && (
          <div class="wall-note" role="status"><b>{info.title}</b><span class="soft">{info.detail}</span></div>
        )}
        {auto && live && !ending && (
          // 17 §2: while auto-climb plays, a bar says so and any tap on the wall stops it.
          <button class="auto-cover" aria-label="Auto-climb on: tap to stop" onClick={() => toggleAuto(false)}><span>AUTO · tap to stop</span></button>
        )}
      </WallCanvas>
      <div class="hud">
        <span class="tiny soft one-line">{last ? last.text : `${at.mode} attempt`}</span>
        <div class="meters" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) repeat(3, minmax(0, 1fr))' }}>
          <Meter label="Pump" value={at.pump} colour={at.pump > 70 ? 'var(--warn)' : 'var(--sky)'}
            preview={pv?.pump_ev ?? null} previewColour={pv && at.pump + pv.pump_ev > 70 ? 'var(--warn)' : undefined} />
          <Meter label="Power" value={at.power} max={powerPool(ath)} colour="var(--accent)" preview={pv?.dynamic ? -pv.evaluation.power_cost : null} />
          <Meter label="Skin" value={run.res.skin} colour="var(--skin)" />
          <Meter label="Chalk" value={at.chalk} colour="var(--chalk)" />
        </div>
        <div class="col" style={{ gap: '4px' }}>
          <Meter label="Fear" value={fear.fear} band={[bandZ.lo, bandZ.hi]} colour={fear.fear > bandZ.hi ? 'var(--warn)' : fear.fear < bandZ.lo ? 'var(--muted)' : 'var(--good)'} />
          <div class="row chips-line">
            {at.fear_log.slice(-4).map((f, i) => <span key={i} class="chip">{f.label} {f.delta > 0 ? '+' : '−'}{Math.abs(f.delta)}</span>)}
            {fear.height > 0.5 && <span class="chip">height +{fear.height.toFixed(0)}</span>}
          </div>
        </div>
        {swinging ? (
          <div class="preview swing-panel">
            <div class="row between preview-head">
              <span class="kicker one-line">{CLASS_LABEL[at.pending!.cls]} · {at.pending!.limb} · Swing and Catch</span>
              <button class="chip-btn small" onClick={() => { setAimPower(null); void act({ t: 'commit', swing: null }); }}>Auto</button>
            </div>
            <div class={`small one-line ${note ? 'warn' : 'soft'}`}>{note ?? (flying ? 'Tap anywhere as the rings meet.' : aimPower === null ? 'Pull back anywhere on the wall, then let go.' : 'Let go to launch.')}</div>
            <div class="swing-power" aria-label="Pull power">
              <div class="fill" style={{ width: `${Math.round((aimPower ?? 0) * 100)}%` }} />
              <div class="need" style={{ left: `${Math.round(at.pending!.swing.p_need * 100)}%` }} />
            </div>
            <div class="row between tiny muted"><span>pull {aimPower === null ? '—' : `${Math.round(aimPower * 100)}%`}</span><span>this dyno needs about {Math.round(at.pending!.swing.p_need * 100)}%</span></div>
          </div>
        ) : (
        <div class="preview">
          <div class="row between preview-head">
            {selected && chosen && pv
              ? <span class="kicker one-line">{CLASS_LABEL[chosen]} · {selected.option.limb} → {holdLabel(selected.option.hold.type)}</span>
              : <span class={`small one-line ${note ? 'warn' : 'soft'}`}>{note ?? (reason ? `Can't: ${reason}.` : handBack && !limb ? HAND_BACK[handBack]
                : limb ? 'Tap a ring. Dashed rings: deadpoint or dyno.' : 'Tap a limb or a hold · long-press to ask.')}</span>}
            {selected && classes.length > 1 && (
              <span class="classes">{classes.map((c) => <button key={c} class="chip-btn small" aria-pressed={c === chosen} onClick={() => setCls(c)}>{CLASS_LABEL[c]}</button>)}</span>
            )}
          </div>
          {armed && <div class={`tiny one-line ${nudge ? 'warn' : 'soft'}`}>{bal
            ? <><b class="accent">BALANCE</b> · lean in, let go, then drag {moving}</>
            : grip ? `Hold ${grip} · drag anywhere · let go on the ring` : 'Drag anywhere · let go on the ring'}</div>}
          <div class="triangle" aria-hidden={!pv}>
            <div><span class="big" style={{ color: pv ? bandColour(shown) : undefined }}>{pv ? (exact ? pct(shown) : band(shown)) : '—'}</span><span class="tiny muted">success</span></div>
            <div>
              <span class="big">{pv ? `+${pv.pump_ev.toFixed(1)}` : '—'}{pv?.dynamic && <span class="sub"> / −{Math.round(pv.evaluation.power_cost)}</span>}</span>
              <span class="tiny muted">{pv?.dynamic ? 'pump / power' : 'pump'}</span>
            </div>
            <div><span class="big" style={{ fontSize: '15px' }}>{pv ? stars(pv.pq_after) : '—'}</span><span class="tiny muted">{pv ? `after (${starCount(pv.pq_after)}★)` : 'position after'}</span></div>
          </div>
        </div>
        )}
        <div class="actions">
          <button onClick={orWhy(midDyno, () => void wall('rest'))} aria-disabled={midDyno ? 'true' : undefined} disabled={!live}>Shake<span>{rest < -0.05 ? rest.toFixed(1) : `+${Math.max(0, rest).toFixed(1)}`}</span></button>
          <button onClick={orWhy(midDyno, () => void wall('chalk'))} aria-disabled={midDyno ? 'true' : undefined} disabled={!live}>Chalk<span>4 s</span></button>
          <button onClick={orWhy(midDyno, () => void wall('jump_off'))} aria-disabled={midDyno ? 'true' : undefined} disabled={!live}>Jump off<span>pads</span></button>
          <button onClick={() => { setLimb(null); setHold(null); }}>Clear<span>select</span></button>
        </div>
        {grip ? (
          <div class={`row grip-row${padLeft ? '' : ' flip'}`}>
            <GripPad key={grip} hand={grip} nudge={nudge} onChange={(on) => { gripRef.current = on; }} />
            <button class="go" disabled={!live} onClick={() => void go()}>AUTO<span>{chosen ? CLASS_LABEL[chosen] : ''}</span></button>
          </div>
        ) : (
          <div class="row">
            <div class="limbs">{LIMBS.map((l) => <button key={l} aria-pressed={limb === l} disabled={!live} onClick={() => pickLimb(l)}>{l}</button>)}</div>
            <button class="go" aria-disabled={goWhy ? 'true' : undefined} disabled={!live} onClick={orWhy(goWhy, () => void go())}>{armed ? 'AUTO' : 'GO'}<span>{chosen ? CLASS_LABEL[chosen] : ''}</span></button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The holding hand's pad in two-thumb mode (docs/23 §2.1). It owns its pressed state, and reports released when it
 * goes away, since a pad removed under a thumb never hears that thumb lift.
 */
function GripPad({ hand, nudge, onChange }: { hand: Limb; nudge: boolean; onChange: (on: boolean) => void }) {
  const [on, setOn] = useState(false);
  const set = (v: boolean) => { setOn(v); onChange(v); };
  useEffect(() => () => onChange(false), []);
  return (
    <button
      class={`grip-pad${nudge ? ' nudge' : ''}`} aria-pressed={on} aria-label={`Grip pad: hold to keep ${hand} on`}
      onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); set(true); }}
      onPointerUp={() => set(false)} onPointerCancel={() => set(false)} onContextMenu={(e) => e.preventDefault()}
    >HOLD {hand}<span>{on ? 'holding · drag on the wall' : 'press and keep a thumb here'}</span></button>
  );
}
