// The wall (05b §7–§10, 17 §2): pick a limb, see the reach and the targets, read the decision triangle, go.
// Dynamic moves open the commit window; auto-climb plays the sure moves and hands back at cruxes.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  athleteOf, autoClimbAction, classPreview, displayedChance, isVisible, limbOptions, liveFear, restPreview, routeEntry, showsExactOdds,
} from '../../sim/attempt';
import { izof, type CommitWindow } from '../../sim/resolve';
import type { RunState } from '../../sim/state';
import type { Limb, MoveClass } from '../../sim/types';
import { stars as starCount } from '../../sim/wall';
import { Circuit, Meter } from '../components';
import { band, bandColour, CLASS_LABEL, grade, holdLabel, pct, stars } from '../format';
import { WallCanvas } from '../wall/WallCanvas';
import type { TargetKind } from '../wall/render';
import { act, data, goto, say, settings } from '../store';

const LIMBS: Limb[] = ['LH', 'RH', 'LF', 'RF'];

export function Attempt({ run }: { run: RunState }) {
  const at = run.attempt;
  const [limb, setLimb] = useState<Limb | null>(null);
  const [hold, setHold] = useState<string | null>(null);
  const [cls, setCls] = useState<MoveClass | null>(null);
  const [auto, setAuto] = useState(false);
  const busy = useRef(false);
  const options = useMemo(() => (limb && run.attempt ? limbOptions(run, limb, data) : []), [run, limb]);

  useEffect(() => {
    if (!at) goto({ name: 'result' });
  }, [at]);

  // Backgrounding with a window open resolves it as Auto-commit (18 §5).
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden' && run.attempt?.pending) void act({ t: 'commit', tap_offset_ms: null }); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [run.attempt?.pending]);

  // Auto-commit setting: resolve windows immediately.
  useEffect(() => {
    if (at?.pending && run.options.auto_commit && !busy.current) {
      busy.current = true;
      void act({ t: 'commit', tap_offset_ms: null }).finally(() => { busy.current = false; });
    }
  }, [at?.pending, run.options.auto_commit]);

  // Auto-climb loop.
  useEffect(() => {
    if (!auto || !at || busy.current) return;
    if (at.pending && !run.options.auto_commit) { setAuto(false); return; }
    const next = autoClimbAction(run, data);
    if (!next) { setAuto(false); say('Auto-climb stopped: your call.'); return; }
    const t = setTimeout(() => {
      busy.current = true;
      void act(next).finally(() => { busy.current = false; });
    }, settings.value.reduce_motion ? 60 : 320);
    return () => clearTimeout(t);
  }, [auto, run]);

  if (!at) return null;
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

  const pickLimb = (l: Limb) => { setLimb(l === limb ? null : l); setHold(null); setCls(null); };
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
  const go = async () => {
    if (!selected || !chosen || busy.current) return;
    busy.current = true;
    const ok = await act({ t: 'move', limb: selected.option.limb, hold: selected.option.hold.id, class: chosen });
    busy.current = false;
    if (ok) { setHold(null); setCls(null); }
  };
  const wall = async (kind: 'rest' | 'chalk' | 'jump_off') => {
    if (busy.current) return;
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
          <button class="chip-btn" aria-pressed={auto} onClick={() => setAuto(!auto)}>Auto {auto ? 'on' : 'off'}</button>
        </div>
      </div>
      <WallCanvas
        label={`${route.name}: wall with the climber${limb ? `, ${limb} selected` : ''}`}
        onHold={tapHold}
        view={{ geom, ath, climb: at.climb, visible: (id) => isVisible(project, route, id), limb, targets, selected: hold, feetCut: at.climb.feet_cut }}
      >
        {at.pending && !run.options.auto_commit && (
          <CommitOverlay key={`${at.attempt_index}:${at.move_index}`} window={at.pending.window} cls={at.pending.cls} onCommit={(o) => { void act({ t: 'commit', tap_offset_ms: o }); }} />
        )}
      </WallCanvas>
      <div class="hud">
        {last && <span class="tiny soft">{last.text}{last.commit ? ` (${last.commit})` : ''}</span>}
        <div class="meters" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
          <Meter label="Pump" value={at.pump} colour={at.pump > 70 ? 'var(--warn)' : 'var(--sky)'} />
          <Meter label="Power" value={at.power} max={Math.max(1, ath.a.anaerobic_capacity)} colour="var(--accent)" />
          <Meter label="Skin" value={run.res.skin} colour="#E2B9A0" />
          <Meter label="Chalk" value={at.chalk} colour="#EEF1EC" />
        </div>
        <div class="col" style={{ gap: '4px' }}>
          <Meter label="Fear" value={fear.fear} band={[bandZ.lo, bandZ.hi]} colour={fear.fear > bandZ.hi ? 'var(--warn)' : fear.fear < bandZ.lo ? 'var(--muted)' : 'var(--good)'} />
          <div class="row wrap">
            {at.fear_log.slice(-4).map((f, i) => <span key={i} class="chip">{f.label} {f.delta > 0 ? '+' : '−'}{Math.abs(f.delta)}</span>)}
            {fear.height > 0.5 && <span class="chip">height +{fear.height.toFixed(0)}</span>}
          </div>
        </div>
        {selected && chosen && pv ? (
          <div class="preview">
            <div class="row between">
              <span class="kicker">{CLASS_LABEL[chosen]} · {selected.option.limb} → {holdLabel(selected.option.hold.type)}</span>
              {pv.dynamic && <span class="tiny accent mono">power −{Math.round(pv.evaluation.power_cost)} · window</span>}
            </div>
            {classes.length > 1 && (
              <div class="classes">{classes.map((c) => <button key={c} class="chip-btn" aria-pressed={c === chosen} onClick={() => setCls(c)}>{CLASS_LABEL[c]}</button>)}</div>
            )}
            <div class="triangle">
              <div><span class="big" style={{ color: bandColour(shown) }}>{exact ? pct(shown) : band(shown)}</span><span class="tiny muted">success</span></div>
              <div><span class="big">+{pv.pump_ev.toFixed(1)}</span><span class="tiny muted">pump</span></div>
              <div><span class="big" style={{ fontSize: '15px' }}>{stars(pv.pq_after)}</span><span class="tiny muted">position after ({starCount(pv.pq_after)}★)</span></div>
            </div>
          </div>
        ) : (
          <div class="preview">
            <span class="small soft">{reason ? `Can't: ${reason}.` : limb ? 'Tap a highlighted hold. Dashed rings need a deadpoint or dyno.' : 'Pick a limb, or tap a hold.'}</span>
          </div>
        )}
        <div class="actions">
          <button onClick={() => wall('rest')} disabled={!!at.pending}>Shake<span>{rest < -0.05 ? rest.toFixed(1) : `+${Math.max(0, rest).toFixed(1)}`}</span></button>
          <button onClick={() => wall('chalk')} disabled={!!at.pending}>Chalk<span>4 s</span></button>
          <button onClick={() => wall('jump_off')} disabled={!!at.pending}>Jump off<span>pads</span></button>
          <button onClick={() => { setLimb(null); setHold(null); }}>Clear<span>select</span></button>
        </div>
        <div class="row">
          <div class="limbs">{LIMBS.map((l) => <button key={l} aria-pressed={limb === l} onClick={() => pickLimb(l)}>{l}</button>)}</div>
          <button class="go" disabled={!selected || !chosen || !!at.pending} onClick={go}>GO<span>{chosen ? CLASS_LABEL[chosen] : ''}</span></button>
        </div>
      </div>
    </div>
  );
}

/** The commit window (05b §8): launch, watch the marker, tap inside the target. */
function CommitOverlay(props: { window: CommitWindow; cls: MoveClass; onCommit: (offset: number | null) => void }) {
  const w = props.window;
  const [phase, setPhase] = useState<'ready' | 'sweep' | 'done'>('ready');
  const [pos, setPos] = useState(0);
  const t0 = useRef(0);
  const raf = useRef(0);
  const done = useRef(false);
  const cue = useRef(false);

  const finish = (offset: number | null) => {
    if (done.current) return;
    done.current = true;
    cancelAnimationFrame(raf.current);
    setPhase('done');
    props.onCommit(offset);
  };

  const launch = () => {
    if (settings.value.haptics) navigator.vibrate?.(15);
    t0.current = performance.now();
    setPhase('sweep');
    const step = (now: number) => {
      const el = now - t0.current;
      if (!cue.current && el >= w.centre_ms - 120) { cue.current = true; if (settings.value.haptics) navigator.vibrate?.(10); }
      if (el >= w.effective_ms) { setPos(1); finish(Math.round(w.effective_ms)); return; }
      setPos(el / w.effective_ms);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const tap = () => {
    if (phase === 'ready') launch();
    else if (phase === 'sweep') finish(Math.round(performance.now() - t0.current - w.centre_ms));
  };

  const E = w.effective_ms;
  const zone = (half: number, colour: string) => (
    <div class="zone" style={{ left: `${((w.centre_ms - half) / E) * 100}%`, width: `${((2 * half) / E) * 100}%`, background: colour }} />
  );
  return (
    <div class="commit" role="dialog" aria-label="Commit window">
      <div class="row between">
        <span class="kicker accent">{CLASS_LABEL[props.cls]}</span>
        <span class="tiny muted mono">window {Math.round(w.target_ms)} ms of {Math.round(E)} · apex {Math.round(w.inner_ms)} ms</span>
      </div>
      <div class="commit-bar" onPointerDown={tap}>
        {zone(w.target_ms / 2 + w.slap_ms, 'rgba(240, 138, 93, 0.35)')}
        {zone(w.target_ms / 2, 'rgba(134, 200, 242, 0.55)')}
        {zone(w.inner_ms / 2, 'rgba(233, 184, 92, 0.9)')}
        {phase !== 'ready' && <div class="marker" style={{ left: `${pos * 100}%` }} />}
      </div>
      <div class="row">
        <button class="commit-big grow" onPointerDown={tap}>{phase === 'ready' ? 'Tap to launch' : phase === 'sweep' ? 'Catch!' : '…'}</button>
        {phase === 'ready' && <button class="btn small" onClick={() => finish(null)}>Auto</button>}
      </div>
    </div>
  );
}
