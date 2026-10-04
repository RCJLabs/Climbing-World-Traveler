// Crag (17 §2): the crag's sectors, whether the rock is dry, and where else the climber can go (P1b travel, 09 §8).
import { canStartBlock, travelBlock } from '../../sim/run';
import type { RunState } from '../../sim/state';
import { destinations } from '../../sim/travel';
import { cragDisciplines, sectorDiscipline } from '../../sim/discipline';
import { sectorFloor } from '../../sim/routes';
import { sectorStatus } from '../../sim/weather';
import { Circuit, TabBar, Top } from '../components';
import { climbsLabel, COUNTRY_LABEL, gradeAt, money, ROCK_LABEL } from '../format';
import { act, data, goto } from '../store';

export function Crag({ run }: { run: RunState }) {
  const crag = data.crags.get(run.crag)!;
  const sinceRain = run.last_rain ? run.day - run.last_rain.day : null;
  const inSession = run.block?.kind === 'climb';
  const roped = cragDisciplines(crag, data).includes('sport');
  const trips = destinations(run.crag, data);
  return (
    <div class="screen">
      <Top kicker={`${COUNTRY_LABEL[crag.country] ?? crag.country} · ${crag.altitude_m} m · ${ROCK_LABEL[crag.rock] ?? crag.rock}`} title={crag.name}>
        <span class="small muted">{Math.round(run.weather.t_max)} °C · {run.weather.rh}% humidity · {sinceRain === null ? 'no rain lately' : sinceRain === 0 ? 'raining today' : `last rain ${sinceRain} day${sinceRain === 1 ? '' : 's'} ago`}</span>
      </Top>
      <div class="scroll">
        {inSession && <button class="btn primary" onClick={() => goto({ name: 'routes' })}>Back to your session</button>}
        <span class="kicker">{roped ? 'Sectors' : 'Areas'}</span>
        {crag.sectors.map((s) => {
          const st = sectorStatus(crag, s, run.weather, run.last_rain);
          const check = canStartBlock(run, 'climb', s.id, data);
          const sigs = s.signature_routes.map((id) => [...data.signatures.values()].find((r) => r.id === id)?.name).filter(Boolean);
          const floor = sectorFloor(s, data);
          return (
            <button key={s.id} class={`card ${st.open ? '' : 'dim'}`} disabled={inSession || !check.ok} onClick={async () => { if (await act({ t: 'block_start', kind: 'climb', target: s.id })) goto({ name: 'routes' }); }}>
              <div class="row between">
                <span class="card-title">{s.name}</span>
                <span class="row">{s.circuits.map((c) => <Circuit key={c.colour} c={c.colour} />)}</span>
              </div>
              <span class="small soft">{s.character}</span>
              <span class={`tiny ${st.open ? 'good' : 'warn'}`}>
                {st.open ? 'dry' : st.reason}{s.shade ? ' · shaded' : ' · sunny'}{floor > -Infinity ? ` · ${sectorDiscipline(s, data) === 'sport' ? 'routes' : 'problems'} from ${gradeAt(floor, sectorDiscipline(s, data), crag)}` : ''}{sigs.length ? ` · ${sigs.join(', ')}` : ''}
                {st.open && !check.ok && !inSession ? ` · ${check.reason}` : ''}
              </span>
            </button>
          );
        })}
        <p class="tiny muted">
          {crag.rock.startsWith('sandstone')
            ? 'Damp sandstone breaks. Every sector closes in rain and stays shut until it dries.'
            : 'Limestone dries in hours: a sector closes only while it rains. The tufa caves seep for days after heavy rain.'}
        </p>
        {trips.length > 0 && <span class="kicker">Travel</span>}
        {trips.map((t) => {
          const dest = data.crags.get(t.to)!;
          const why = travelBlock(run, t.to, data);
          return (
            <button key={t.to} class={`card ${why ? 'dim' : ''}`} disabled={!!why} onClick={async () => { if (await act({ t: 'travel', to: t.to })) goto({ name: 'crag' }); }}>
              <div class="row between">
                <span class="card-title">{dest.name}</span>
                <span class="small mono">{money(t.cost)} · {t.days} {t.days === 1 ? 'day' : 'days'}</span>
              </div>
              <span class="small soft">{COUNTRY_LABEL[dest.country] ?? dest.country} · {ROCK_LABEL[dest.rock] ?? dest.rock} · {climbsLabel(dest, data)}</span>
              <span class="tiny muted">{t.legs.map((l) => l.mode).join(', then ')} · living costs go on while you travel{why ? ` · ${why}` : ''}</span>
            </button>
          );
        })}
      </div>
      <TabBar />
    </div>
  );
}
