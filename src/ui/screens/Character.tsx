// Climber sheet (02 §C.3, 17 §2): estimate, body, attributes against ceilings, traits, resources.
import { useMemo } from 'preact/hooks';
import { athleteOf } from '../../sim/attempt';
import { onsightGap, estimateDI } from '../../sim/run';
import type { RunState } from '../../sim/state';
import { LIFESTYLE_ATTRS, MENTAL_ATTRS, PHYSICAL_ATTRS, TECHNIQUE_ATTRS, type AttrId } from '../../sim/types';
import { Meter, TabBar, Top } from '../components';
import { ATTR_LABEL, grade, LATER_ATTRS } from '../format';
import { data, exportCurrent } from '../store';

export function Character({ run }: { run: RunState }) {
  const ath = athleteOf(run, data);
  const E = useMemo(() => estimateDI(run, data), [run.day, run.actions]);
  const gap = onsightGap(ath);
  const b = run.body;
  const bg = data.backgrounds.get(run.background);
  const group = (label: string, ids: readonly AttrId[]) => (
    <div class="col" key={label}>
      <h2>{label}</h2>
      {ids.filter((id) => !LATER_ATTRS.includes(id)).map((id) => {
        const a = run.attrs[id];
        return (
          <div class="attr" key={id}>
            <span class="small">{ATTR_LABEL[id]}</span>
            <span class="mono tiny">{a.value.toFixed(1)} / {Math.round(a.ceiling)}{a.pending > 0.05 ? <span class="accent"> +{a.pending.toFixed(1)}</span> : null}</span>
            <div class="attr-bar">
              <div style={{ width: `${a.ceiling}%`, background: 'var(--line)' }} />
              <div style={{ width: `${a.value}%`, background: 'var(--sky)' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
  return (
    <div class="screen">
      <Top kicker={`${bg?.name ?? run.background} · day ${run.day + 1} in the forest`} title={run.name}>
        <span class="small muted">{Math.floor(b.age_start + run.day / 365)} · {b.height_cm} cm · {b.mass_kg} kg · ape {b.ape_index.toFixed(2)} · skin {b.skin_thickness} · hands {b.skin_moisture}</span>
      </Top>
      <div class="scroll">
        <div class="card">
          <span class="kicker">Boulder estimate</span>
          <span class="mono accent" style={{ fontSize: '32px', fontWeight: 600 }}>{grade(E)}</span>
          <span class="small soft">Onsight about {grade(E - gap)}. Personal best {run.pb ? grade(run.pb) : '—'}.</span>
          <span class="tiny muted">The estimate is your 35% line on a fixed set of Font benchmark problems. It sharpens as route reading grows.</span>
        </div>
        <div class="meters">
          <Meter label="Energy" value={run.res.energy} colour="var(--good)" />
          <Meter label="Skin" value={run.res.skin} colour="var(--skin)" />
          <Meter label="Stoke" value={run.res.stoke} colour="var(--accent)" />
          <Meter label="Burnout" value={run.res.burnout} colour="var(--warn)" />
        </div>
        <div class="row wrap">{run.traits.map((t) => <span key={t} class="chip">{data.traits.get(t)?.name ?? t}</span>)}</div>
        {group('Physical', PHYSICAL_ATTRS)}
        <p class="tiny muted">Amber numbers are tendon gains still arriving. Finger strength and skin follow the slow clock.</p>
        {group('Technique', TECHNIQUE_ATTRS)}
        {group('Mental', MENTAL_ATTRS)}
        {group('Lifestyle', LIFESTYLE_ATTRS)}
        <p class="small soft">Sandstone knowledge {Math.round(run.rock_knowledge['sandstone_font'] ?? 0)} · {run.ticks.filter((t) => t.style !== 'repeat').length} problems ticked · {run.counters.climb_days} climbing days</p>
        <button class="btn" onClick={() => void exportCurrent()}>Export this run</button>
      </div>
      <TabBar />
    </div>
  );
}
