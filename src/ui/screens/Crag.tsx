// Crag (17 §2): Fontainebleau's sectors, their circuits and whether the sand is dry.
import { canStartBlock } from '../../sim/run';
import type { RunState } from '../../sim/state';
import { sectorStatus } from '../../sim/weather';
import { Circuit, TabBar, Top } from '../components';
import { act, data, goto } from '../store';

export function Crag({ run }: { run: RunState }) {
  const crag = data.crags.get(run.crag)!;
  const sinceRain = run.last_rain ? run.day - run.last_rain.day : null;
  const inSession = run.block?.kind === 'climb';
  return (
    <div class="screen">
      <Top kicker={`${crag.country === 'FR' ? 'France' : crag.country} · ${crag.altitude_m} m · fine sandstone`} title={crag.name}>
        <span class="small muted">{Math.round(run.weather.t_max)} °C · {run.weather.rh}% humidity · {sinceRain === null ? 'no rain yet' : sinceRain === 0 ? 'raining today' : `last rain ${sinceRain} day${sinceRain === 1 ? '' : 's'} ago`}</span>
      </Top>
      <div class="scroll">
        {inSession && <button class="btn primary" onClick={() => goto({ name: 'routes' })}>Back to your session</button>}
        <span class="kicker">Areas</span>
        {crag.sectors.map((s) => {
          const st = sectorStatus(s, run.weather, run.last_rain);
          const check = canStartBlock(run, 'climb', s.id, data);
          const sigs = s.signature_routes.map((id) => [...data.signatures.values()].find((r) => r.id === id)?.name).filter(Boolean);
          return (
            <button key={s.id} class={`card ${st.open ? '' : 'dim'}`} disabled={inSession || !check.ok} onClick={async () => { if (await act({ t: 'block_start', kind: 'climb', target: s.id })) goto({ name: 'routes' }); }}>
              <div class="row between">
                <span class="card-title">{s.name}</span>
                <span class="row">{s.circuits.map((c) => <Circuit key={c.colour} c={c.colour} />)}</span>
              </div>
              <span class="small soft">{s.character}</span>
              <span class={`tiny ${st.open ? 'good' : 'warn'}`}>
                {st.open ? 'dry' : st.reason}{s.shade ? ' · shaded' : ' · sunny'}{sigs.length ? ` · ${sigs.join(', ')}` : ''}
                {st.open && !check.ok && !inSession ? ` · ${check.reason}` : ''}
              </span>
            </button>
          );
        })}
        <p class="tiny muted">Damp sandstone breaks. Every sector closes in rain and stays shut until it dries.</p>
      </div>
      <TabBar />
    </div>
  );
}
