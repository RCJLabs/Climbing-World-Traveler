// Watching an attempt (docs/24 §5): the simulated attempt played back on the wall, step by step, with the meters and
// the climber's running commentary. Nothing here changes the climb: it was decided before the playback started.
import { useEffect, useState } from 'preact/hooks';
import { athleteOf, isVisible, liveFear, routeEntry } from '../../sim/attempt';
import { izof, powerPool } from '../../sim/resolve';
import type { RunState } from '../../sim/state';
import { Circuit, Meter, Seg } from '../components';
import { grade } from '../format';
import { data, goto, playback, saveSettings, settings } from '../store';
import { ENDING_MS, WallCanvas, type Ending } from '../wall/WallCanvas';

/** Time on each step at 1×: the move animates in 250 ms, the rest is time to read the line. (tune) */
const STEP_MS = 750;
const MODE_LABEL = { onsight: 'Onsight', flash: 'Flash', redpoint: 'Redpoint', work: 'Working' } as const;

export function Watch({ run }: { run: RunState }) {
  const pb = playback.value;
  const [i, setI] = useState(0);
  const [ending, setEnding] = useState<Ending>(null);
  const speed = settings.value.speed;
  const n = pb?.frames.length ?? 0;
  const result = run.last_attempt;

  useEffect(() => { if (!pb || n === 0 || !result) goto({ name: 'result' }); }, [pb, n, result]);
  // Step through the frames; after the last, the attempt's ending plays, then the result.
  useEffect(() => {
    if (!pb || ending || n === 0) return;
    const t = setTimeout(() => {
      if (i < n - 1) setI(i + 1);
      else setEnding(result?.outcome === 'sent' ? 'send' : result?.outcome === 'jumped' ? 'off' : 'fall');
    }, STEP_MS / speed);
    return () => clearTimeout(t);
  }, [i, ending, speed, pb]);
  useEffect(() => {
    if (!ending) return;
    const t = setTimeout(() => goto({ name: 'result' }), ENDING_MS + 450);
    return () => clearTimeout(t);
  }, [ending]);

  if (!pb || n === 0 || !result) return null;
  const { at, skin } = pb.frames[Math.min(i, n - 1)]!;
  const { route, geom } = routeEntry(at.route_seed, data);
  const ath = athleteOf(run, data);
  const project = run.projects[at.route_id];
  const fear = liveFear(at, geom, ath);
  const band = izof(ath.a.composure);
  const last = at.log[at.log.length - 1];
  // The commentary: the last few things that happened, and how it ended once the ending plays.
  const lines = [...at.log.slice(-3).map((m) => m.text), ...(ending ? [result.log[result.log.length - 1]?.text ?? result.text] : [])].slice(-3);
  const progress = route.beta_line.length ? Math.min(at.beta_ptr, route.beta_line.length) : 0;

  return (
    <div class="screen attempt">
      <div class="top" style={{ paddingBottom: '8px' }}>
        <div class="top-row">
          <div class="col" style={{ gap: '2px' }}>
            <span class="card-title">{route.name} · {grade(route.di_graded)}</span>
            <span class="tiny muted row"><Circuit c={route.circuit} />{MODE_LABEL[at.mode]} · attempt {at.attempt_index + 1} · move {at.moves} · line {progress}/{route.beta_line.length}</span>
          </div>
          <button class="chip-btn" onClick={() => goto({ name: 'result' })}>Skip</button>
        </div>
      </div>
      <WallCanvas
        label={`${route.name}: ${run.name} on the wall`}
        view={{ geom, ath, climb: at.climb, visible: (id) => isVisible(project, route, id), limb: null, targets: new Map(), selected: null, feetCut: at.climb.feet_cut }}
        motion={{ step: i, style: { limb: last?.limb, cls: last?.cls }, shake: last?.outcome === 'sketchy' || last?.outcome === 'slip_recovered', speed }}
        ending={ending}
        reduceMotion={settings.value.reduce_motion}
      />
      <div class="hud">
        <div class="col commentary" aria-live="polite">
          {lines.map((t, k) => <span key={`${i}-${k}`} class={`small one-line ${k === lines.length - 1 ? '' : 'muted'}`}>{t}</span>)}
        </div>
        <div class="meters" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) repeat(3, minmax(0, 1fr))' }}>
          <Meter label="Pump" value={at.pump} colour={at.pump > 70 ? 'var(--warn)' : 'var(--sky)'} />
          <Meter label="Power" value={at.power} max={powerPool(ath)} colour="var(--accent)" />
          <Meter label="Skin" value={skin} colour="var(--skin)" />
          <Meter label="Chalk" value={at.chalk} colour="var(--chalk)" />
        </div>
        <div class="col" style={{ gap: '4px' }}>
          <Meter label="Fear" value={fear.fear} band={[band.lo, band.hi]} colour={fear.fear > band.hi ? 'var(--warn)' : fear.fear < band.lo ? 'var(--muted)' : 'var(--good)'} />
          <div class="row chips-line">
            {at.fear_log.slice(-4).map((f, k) => <span key={k} class="chip">{f.label} {f.delta > 0 ? '+' : '−'}{Math.abs(f.delta)}</span>)}
            {fear.height > 0.5 && <span class="chip">height +{fear.height.toFixed(0)}</span>}
          </div>
        </div>
        <div class="row between">
          <Seg label="Playback speed" value={speed} onChange={(v) => void saveSettings({ ...settings.value, speed: v })} options={[[1, '1×'], [2, '2×'], [4, '4×']]} />
          <button class="btn small" onClick={() => goto({ name: 'result' })}>Result</button>
        </div>
      </div>
    </div>
  );
}
