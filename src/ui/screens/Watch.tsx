// Watching an attempt (docs/24 §5, 25 §10): the simulated attempt played back on the cartoon wall move by move, with
// the meters and the climber's running commentary. Nothing here changes the climb: it was decided before the
// playback started.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { athleteOf, isVisible, liveFear, routeEntry } from '../../sim/attempt';
import { izof, powerPool } from '../../sim/resolve';
import type { RunState } from '../../sim/state';
import { Circuit, Meter, Seg } from '../components';
import { gradeOf } from '../format';
import { data, goto, playback, saveSettings, settings } from '../store';
import { playbackOf } from '../wall/playback';
import { WallCanvas } from '../wall/WallCanvas';

const MODE_LABEL = { onsight: 'Onsight', flash: 'Flash', redpoint: 'Redpoint', work: 'Working' } as const;

export function Watch({ run }: { run: RunState }) {
  const play = playback.value;
  const [i, setI] = useState(0);
  const [ending, setEnding] = useState(false);
  const speed = settings.value.speed;
  const n = play?.frames.length ?? 0;
  const result = run.last_attempt;

  useEffect(() => { if (!play || n === 0 || !result) goto({ name: 'result' }); }, [play, n, result]);
  // The attempt as the wall plays it: the problem's block, the climber's body through every step, how it ends.
  const pb = useMemo(() => {
    if (!play || n === 0 || !result) return null;
    const { geom } = routeEntry(play.frames[0]!.at.route_seed, data);
    return playbackOf(geom, athleteOf(run, data), play.frames.map((f) => f.at), result);
  }, [play]);
  useEffect(() => { setI(0); setEnding(false); }, [pb]);
  // Hidden holds the climber has not found stay off the wall (05b §13).
  const hidden = useMemo(() => {
    if (!play || n === 0) return new Set<string>();
    const { route } = routeEntry(play.frames[0]!.at.route_seed, data);
    const project = run.projects[route.id];
    return new Set(route.holds.filter((h) => !isVisible(project, route, h.id)).map((h) => h.id));
  }, [play]);

  if (!play || !pb || n === 0 || !result) return null;
  const { at, skin } = play.frames[Math.min(i, n - 1)]!;
  const { route, geom } = routeEntry(at.route_seed, data);
  const ath = athleteOf(run, data);
  const fear = liveFear(at, geom, ath);
  const band = izof(ath.a.composure);
  // The commentary: the last few things that happened, and how it ended once the ending plays.
  const lines = [...at.log.slice(-3).map((m) => m.text), ...(ending ? [result.log[result.log.length - 1]?.text ?? result.text] : [])].slice(-3);
  const progress = route.beta_line.length ? Math.min(at.beta_ptr, route.beta_line.length) : 0;

  return (
    <div class="screen attempt toon">
      <div class="top" style={{ paddingBottom: '8px' }}>
        <div class="top-row">
          <div class="col" style={{ gap: '2px', minWidth: 0 }}>
            <span class="card-title one-line">{route.name} · {gradeOf(route)}</span>
            <span class="tiny row"><Circuit c={route.circuit} />{MODE_LABEL[at.mode]} · attempt {at.attempt_index + 1} · move {at.moves} · line {progress}/{route.beta_line.length}</span>
          </div>
          <button class="chip-btn" onClick={() => goto({ name: 'result' })}>Skip</button>
        </div>
      </div>
      <WallCanvas
        pb={pb}
        hidden={hidden}
        label={`${route.name}: ${run.name} on the problem`}
        speed={speed}
        reduceMotion={settings.value.reduce_motion}
        onStep={setI}
        onEnding={() => setEnding(true)}
        onDone={() => goto({ name: 'result' })}
      />
      <div class="hud">
        <div class="col commentary" aria-live="polite">
          {lines.map((t, k) => <span key={`${i}-${k}`} class={`small one-line ${k === lines.length - 1 ? 'now' : 'muted'}`}>{t}</span>)}
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
