// Climber sheet (02 §C.3, 17 §2, docs/24 §4): estimate and its progress by week, body, attributes against their
// ceilings with the last four weeks' change, traits, resources.
import { useMemo } from 'preact/hooks';
import { athleteOf } from '../../sim/attempt';
import { EVOLVE_TEXT, evolutionProgress, PRACTICE_FALLS_PER_SESSION } from '../../sim/evolve';
import { CLIMBS, cragDisciplines, type Climb } from '../../sim/discipline';
import { estimates, onsightGap } from '../../sim/run';
import type { RunState } from '../../sim/state';
import { LIFESTYLE_ATTRS, MENTAL_ATTRS, PHYSICAL_ATTRS, TECHNIQUE_ATTRS, type AttrId } from '../../sim/types';
import { Meter, TabBar, Top } from '../components';
import { ATTR_LABEL, gradeAt, LATER_ATTRS, ROCK_LABEL } from '../format';
import { Health } from '../injuries';
import { data, exportCurrent } from '../store';

export function Character({ run }: { run: RunState }) {
  const ath = athleteOf(run, data);
  const ests = useMemo(() => estimates(run, data), [run.day, run.actions]);
  const gap = onsightGap(ath);
  const b = run.body;
  const bg = data.backgrounds.get(run.background);
  const crag = data.crags.get(run.crag)!;
  // One estimate per discipline the crag climbs (27 M1), in the crag's own grading system; the chart follows the
  // discipline the crag is known by: a boulder estimate and a route estimate are different numbers.
  const here = cragDisciplines(crag, data);
  const main = here[0]!;
  const grade = (di: number, d: Climb = main) => gradeAt(di, d, crag);
  const pbOf = (d: Climb): number => (d === 'sport' ? run.pb_route : run.pb);
  const elsewhere = CLIMBS.filter((d) => !here.includes(d) && pbOf(d) > 0);
  const series = [...run.history, { day: run.day, est: ests, pb: run.pb, pb_route: run.pb_route }]
    .filter((p) => p.est?.[main] !== undefined)
    .map((p) => ({ day: p.day, E: p.est![main]!, pb: main === 'sport' ? p.pb_route ?? 0 : p.pb }));
  // The change over the last four weeks, from the weekly progress points.
  const then = run.history[Math.max(0, run.history.length - 5)];
  const group = (label: string, ids: readonly AttrId[]) => (
    <div class="col" key={label}>
      <h2>{label}</h2>
      {ids.filter((id) => !LATER_ATTRS.includes(id)).map((id) => {
        const a = run.attrs[id];
        const d = then && then.day < run.day ? a.value - (then.attrs[id] ?? a.value) : 0;
        return (
          <div class="attr" key={id}>
            <span class="small">{ATTR_LABEL[id]}{Math.abs(d) >= 0.05 ? <span class={`tiny ${d > 0 ? 'good' : 'warn'}`}> {d > 0 ? '+' : '−'}{Math.abs(d).toFixed(1)}</span> : null}</span>
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
      <Top kicker={`${bg?.name ?? run.background} · day ${run.day + 1} · ${crag.name}`} title={run.name}>
        <span class="small muted">{Math.floor(b.age_start + run.day / 365)} · {b.height_cm} cm · {b.mass_kg} kg · ape {b.ape_index.toFixed(2)} · skin {b.skin_thickness} · hands {b.skin_moisture}</span>
      </Top>
      <div class="scroll">
        {here.map((d) => (
          <div class="card" key={d}>
            <span class="kicker">{d === 'sport' ? 'Route estimate' : 'Boulder estimate'}</span>
            <span class="mono accent" style={{ fontSize: '32px', fontWeight: 600 }}>{grade(ests[d]!, d)}</span>
            <span class="small soft">Onsight about {grade(ests[d]! - gap, d)}. Personal best {pbOf(d) ? grade(pbOf(d), d) : '—'}.</span>
            <span class="tiny muted">The climber's 35% line on a fixed set of {crag.name} benchmark {d === 'sport' ? 'routes' : 'problems'}.</span>
          </div>
        ))}
        {elsewhere.length > 0 && <p class="small soft">{elsewhere.map((d) => `Hardest ${d === 'sport' ? 'route' : 'boulder'} ${gradeAt(pbOf(d), d)}.`).join(' ')}</p>}
        <Progress points={series} grade={(v) => grade(v)} />
        <div class="meters">
          <Meter label="Energy" value={run.res.energy} colour="var(--good)" />
          <Meter label="Skin" value={run.res.skin} colour="var(--skin)" />
          <Meter label="Stoke" value={run.res.stoke} colour="var(--accent)" />
          <Meter label="Burnout" value={run.res.burnout} colour="var(--warn)" />
        </div>
        <Health run={run} bundle={data} />
        <div class="row wrap">{run.traits.map((t) => <span key={t} class="chip">{data.traits.get(t)?.name ?? t}</span>)}</div>
        {run.traits.map((t) => <Evolving key={`ev-${t}`} run={run} id={t} />)}
        {group('Physical', PHYSICAL_ATTRS)}
        <p class="tiny muted">Green and red: the change over the last four weeks. Amber: tendon gains still arriving; finger strength and skin follow the slow clock.</p>
        {group('Technique', TECHNIQUE_ATTRS)}
        {group('Mental', MENTAL_ATTRS)}
        {group('Lifestyle', LIFESTYLE_ATTRS)}
        <p class="small soft">{Object.entries(run.rock_knowledge).map(([rock, v]) => `${ROCK_LABEL[rock as keyof typeof ROCK_LABEL] ?? rock} knowledge ${Math.round(v)}`).join(' · ') || 'No rock knowledge yet'} · {run.ticks.filter((t) => t.style !== 'repeat').length} ticks · {run.counters.climb_days} climbing days{run.counters.rope_falls_logged ? ` · ${run.counters.rope_falls_logged} falls on the rope` : ''}</p>
        <button class="btn" onClick={() => void exportCurrent()}>Export this run</button>
      </div>
      <TabBar />
    </div>
  );
}

/** Grade estimate (line) and hardest send (steps) by week (docs/24 §4), in one discipline's grades. */
function Progress({ points, grade }: { points: { day: number; E: number; pb: number }[]; grade: (di: number) => string }) {
  const pts = points;
  if (pts.length < 2) return <p class="tiny muted">Progress shows here after the first week.</p>;
  const W = 320;
  const H = 120;
  const pad = { l: 34, r: 8, t: 8, b: 18 };
  const day0 = pts[0]!.day;
  const day1 = Math.max(day0 + 1, pts[pts.length - 1]!.day);
  const vals = pts.flatMap((p) => [p.E, ...(p.pb ? [p.pb] : [])]);
  const lo = Math.floor(Math.min(...vals)) - 1;
  const hi = Math.ceil(Math.max(...vals)) + 1;
  const x = (d: number) => pad.l + ((d - day0) / (day1 - day0)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const line = pts.map((p) => `${x(p.day).toFixed(1)},${y(p.E).toFixed(1)}`).join(' ');
  const pbPts = pts.filter((p) => p.pb > 0);
  const steps = pbPts.map((p, i) => `${i ? `${x(p.day).toFixed(1)},${y(pbPts[i - 1]!.pb).toFixed(1)} ` : ''}${x(p.day).toFixed(1)},${y(p.pb).toFixed(1)}`).join(' ');
  const ticksY = [lo + 1, Math.round((lo + hi) / 2), hi - 1];
  const weeks = Math.round((day1 - day0) / 7);
  return (
    <div class="card">
      <div class="row between"><span class="kicker">Progress</span><span class="tiny muted">{weeks} {weeks === 1 ? 'week' : 'weeks'}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Grade estimate and hardest send by week">
        {ticksY.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--line)" stroke-width="1" />
            <text x={pad.l - 4} y={y(v) + 4} text-anchor="end" font-size="11" fill="var(--muted)">{grade(v)}</text>
          </g>
        ))}
        {pbPts.length > 0 && <polyline points={steps} fill="none" stroke="var(--good)" stroke-width="2" stroke-dasharray="4 3" />}
        <polyline points={line} fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" />
        <text x={pad.l} y={H - 4} font-size="11" fill="var(--muted)">day {day0 + 1}</text>
        <text x={W - pad.r} y={H - 4} text-anchor="end" font-size="11" fill="var(--muted)">day {day1 + 1}</text>
      </svg>
      <span class="tiny muted"><span class="accent">━</span> estimate · <span class="good">┅</span> hardest send</span>
    </div>
  );
}

/** How far an evolving trait is along (03 §1.7): "Afraid of Falling → Falls OK: 12/30 practice falls, week 3 of 6." */
function Evolving({ run, id }: { run: RunState; id: string }) {
  const t = data.traits.get(id);
  const ev = t?.evolves_to?.[0];
  if (!t || !ev) return null;
  const p = evolutionProgress(run, ev);
  const next = ev.trait ? data.traits.get(ev.trait)?.name ?? ev.trait : null;
  const counts = p.needs.map((x) => `${Math.min(x.have, x.n)}/${x.n} ${EVOLVE_TEXT[x.counter]}`).join(', ');
  const hint = ev.needs.some((x) => x.counter === 'practice_falls') ? ` A fall-practice session counts ${PRACTICE_FALLS_PER_SESSION}.` : '';
  return <p class="tiny muted">{t.name} {next ? `→ ${next}` : 'fades'}: {counts}{ev.min_weeks ? `, week ${Math.min(p.weeks, ev.min_weeks)} of ${ev.min_weeks}` : ''}.{hint}</p>;
}
