// The problems in a session (06 §5, 17 §2): today's procedural slots, the sector's signature problems and the
// ones you are working, with your read on each and the attempt modes allowed.
import { useMemo, useState } from 'preact/hooks';
import { athleteOf, conditionsOf, effectiveMode, newProject, routeEntry } from '../../sim/attempt';
import { evWalk } from '../../sim/grade';
import type { RouteSlot, RunState } from '../../sim/state';
import type { AttemptMode } from '../../sim/types';
import { Circuit, TabBar, Top } from '../components';
import { band, bandColour, grade, pct } from '../format';
import { act, data, goto } from '../store';

const MODE_LABEL: Record<AttemptMode, string> = { onsight: 'Onsight', flash: 'Flash', redpoint: 'Redpoint', work: 'Work' };

export function Routes({ run }: { run: RunState }) {
  const session = run.block?.session;
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<AttemptMode | null>(null);
  const ath = athleteOf(run, data);
  const exact = run.attrs.route_reading.value >= 60;

  const rows = useMemo(() => {
    if (!session) return [];
    const cond = conditionsOf(run, { chalk: 100 }, data, ath);
    return session.slots.map((slot: RouteSlot) => {
      const { route, geom } = routeEntry(slot.seed, data);
      const project = run.projects[route.id];
      const fam = project ? 1 - (1 - (route.signature ? 0.15 : 0)) * Math.exp(-0.35 * ath.mods.familiarity_k_mult * project.attempt_eq) : route.signature ? 0.15 : 0;
      const p = evWalk(geom, ath, { cond, fam }).p_send;
      const hand = route.beta_line.filter((s) => s.limb.endsWith('H')).length;
      return { slot, route, project, p, hand };
    }).sort((a, b) => a.route.di_graded - b.route.di_graded);
  }, [session?.slots, run.day, run.projects]);

  if (!session) {
    return <div class="screen"><div class="scroll"><p>No session in progress.</p><button class="btn" onClick={() => goto({ name: 'planner' })}>Planner</button></div></div>;
  }
  const sector = data.crags.get(run.crag)!.sectors.find((s) => s.id === session.sector)!;

  return (
    <div class="screen">
      <Top kicker={`Session · ${session.attempts} attempts · ${session.sends} sends`} title={sector.name}>
        <span class="small muted">{Math.round(run.weather.t_max)} °C · spotter: the campsite regular</span>
      </Top>
      <div class="scroll">
        {rows.map(({ slot, route, project, p, hand }) => {
          const isOpen = open === slot.seed;
          const proj = project ?? newProject(route, run.day);
          const allowed: AttemptMode[] = proj.attempts === 0 ? (route.signature ? ['onsight', 'flash', 'work'] : ['onsight', 'work']) : ['redpoint', 'work'];
          const chosen = mode && allowed.includes(mode) ? mode : allowed[0]!;
          const status = project?.sent ? `sent${project.sessions > 1 ? ` in ${project.sessions} sessions` : ''}` : project ? `${project.attempts} attempt${project.attempts === 1 ? '' : 's'} · high point ${pct(project.best)}` : 'untried';
          return (
            <div key={slot.seed} class={`card ${isOpen ? 'selected' : ''}`}>
              <button class="row between" style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left' }} onClick={() => { setOpen(isOpen ? null : slot.seed); setMode(null); }}>
                <div class="row" style={{ alignItems: 'baseline' }}>
                  <span class="mono" style={{ fontSize: '20px', fontWeight: 600, minWidth: '44px' }}>{grade(route.di_graded)}</span>
                  <div class="col" style={{ gap: '2px' }}>
                    <span class="card-title">{route.name}{route.signature ? <span class="tiny accent"> · SIGNATURE</span> : null}</span>
                    <span class="tiny muted row"><Circuit c={route.circuit} />{route.style_tags.slice(0, 3).join(', ')}</span>
                  </div>
                </div>
                <div class="col" style={{ alignItems: 'flex-end', gap: '2px' }}>
                  <span class="small" style={{ color: bandColour(p) }}>{exact ? pct(p) : band(p)}</span>
                  <span class="tiny muted">{project?.sent ? '✓' : status === 'untried' ? '' : `${project?.attempts}×`}</span>
                </div>
              </button>
              {isOpen && (
                <>
                  <span class="small soft">{hand} hand moves · {route.wall[route.wall.length - 1]!.y1.toFixed(1)} m · danger {route.danger} · {status}</span>
                  {route.fa_note && <span class="tiny muted">{route.fa_note}</span>}
                  <div class="row wrap">
                    {allowed.map((m) => <button key={m} class="chip-btn" aria-pressed={chosen === m} onClick={() => setMode(m)}>{MODE_LABEL[m]}</button>)}
                  </div>
                  <span class="tiny muted">
                    {chosen === 'onsight' ? 'Onsight: no beta. Hidden holds stay hidden until you find them.' : chosen === 'flash' ? 'Flash: you watched others on it, so you know the line.' : chosen === 'work' ? 'Work: learn the moves faster. Topping out does not count as a tick.' : 'Redpoint: you know what you have touched.'}
                  </span>
                  <button class="btn primary" disabled={run.res.energy < 10 || run.res.skin <= 0} onClick={async () => {
                    const m = effectiveMode(proj, route, chosen);
                    if (await act({ t: 'attempt_start', route_seed: slot.seed, mode: m })) goto({ name: 'attempt' });
                  }}>Start</button>
                </>
              )}
            </div>
          );
        })}
        <p class="tiny muted">Energy {Math.round(run.res.energy)} · about 2–4 per attempt · skin {Math.round(run.res.skin)}</p>
      </div>
      <div class="cta-bar">
        <button class="cta secondary" onClick={async () => { if (await act({ t: 'block_end' })) goto({ name: 'planner' }); }}>End session</button>
      </div>
      <TabBar />
    </div>
  );
}
