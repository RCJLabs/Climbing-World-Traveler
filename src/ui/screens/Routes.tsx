// A session at a sector (06 §5, docs/24 §3): today's problems or routes with the climber's odds on each. Pick what to
// try and how: one attempt (watched or not), a siege, or the rest of the session by a tactic. Every attempt is simulated.
import { useMemo, useState } from 'preact/hooks';
import { athleteOf, conditionsOf, effectiveMode, familiarity, newProject, routeEntry, showsExactOdds } from '../../sim/attempt';
import { sectorDiscipline } from '../../sim/discipline';
import { evWalk } from '../../sim/grade';
import type { RouteSlot, RunState } from '../../sim/state';
import { tired } from '../../sim/tactics';
import type { AttemptMode } from '../../sim/types';
import { Circuit, TabBar, Top } from '../components';
import { band, bandColour, gradeOf, pct } from '../format';
import { boltsOf, isRoped } from '../../sim/rope';
import { act, busy, data, finishSession, goto, siege, tryProblem } from '../store';

const MODE_LABEL: Record<AttemptMode, string> = { onsight: 'Onsight', flash: 'Flash', redpoint: 'Redpoint', work: 'Work' };
const MODE_NOTE: Record<AttemptMode, string> = {
  onsight: 'Onsight: no beta. Hidden holds stay hidden until the climber finds them.',
  flash: 'Flash: the climber has watched others on it and knows the line.',
  redpoint: 'Redpoint: the climber knows what it has touched.',
  work: 'Work: learn the moves faster, hanging on the rope where needed. Reaching the top does not count as a tick.',
};

export function Routes({ run }: { run: RunState }) {
  const session = run.block?.session;
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<AttemptMode | null>(null);
  const ath = athleteOf(run, data);

  const rows = useMemo(() => {
    if (!session) return [];
    const cond = conditionsOf(run, { chalk: 100 }, data, ath);
    return session.slots.map((slot: RouteSlot) => {
      const { route, geom } = routeEntry(slot.seed, data);
      const project = run.projects[route.id];
      const fam = familiarity(route, project, ath);
      const p = evWalk(geom, ath, { cond, fam }).p_send;
      const hand = route.beta_line.filter((s) => s.limb.endsWith('H')).length;
      return { slot, route, project, p, hand, fam, today: session.tried[slot.seed]?.n ?? 0 };
    }).sort((a, b) => a.route.di_graded - b.route.di_graded);
  }, [session?.slots, run.day, run.projects, session?.attempts]);

  if (!session) {
    return <div class="screen"><div class="scroll"><p>No session in progress.</p><button class="btn" onClick={() => goto({ name: 'planner' })}>Planner</button></div></div>;
  }
  const crag = data.crags.get(run.crag)!;
  const sector = crag.sectors.find((s) => s.id === session.sector)!;
  const spent = tired(run);
  const sport = sectorDiscipline(sector, data) === 'sport';

  return (
    <div class="screen">
      <Top kicker={`Session · ${session.attempts} attempts · ${session.sends} sends`} title={sector.name}>
        <span class="small muted">{Math.round(run.weather.t_max)} °C · energy {Math.round(run.res.energy)} · skin {Math.round(run.res.skin)}{spent ? ' · done for today' : ''}</span>
      </Top>
      <div class="scroll">
        <div class="card col">
          <span class="kicker">Let {run.name} climb</span>
          <span class="small soft">Plays the rest of the session the way the climber would, then ends it.</span>
          <div class="row">
            <button class="btn grow" disabled={busy.value} onClick={() => void finishSession('volume')}><div>Mileage</div><div class="tiny muted">{sport ? 'many routes, one go each' : 'many problems, two tries each'}</div></button>
            <button class="btn grow" disabled={busy.value} onClick={() => void finishSession('project')}><div>Project</div><div class="tiny muted">{sport ? 'the hard ones, three goes each' : 'the hard ones, five tries each'}</div></button>
          </div>
        </div>
        <span class="kicker">Or pick a {sport ? 'route' : 'problem'}</span>
        {rows.map(({ slot, route, project, p, hand, fam, today }) => {
          const isOpen = open === slot.seed;
          const proj = project ?? newProject(route, run.day);
          const allowed: AttemptMode[] = proj.attempts === 0 ? (route.signature ? ['onsight', 'flash', 'work'] : ['onsight', 'work']) : ['redpoint', 'work'];
          const chosen = mode && allowed.includes(mode) ? mode : allowed[0]!;
          const status = project?.sent ? `sent${project.sessions > 1 ? ` in ${project.sessions} sessions` : ''}` : project ? `${project.attempts} attempt${project.attempts === 1 ? '' : 's'} · high point ${pct(project.best)}` : 'untried';
          return (
            <div key={slot.seed} class={`card ${isOpen ? 'selected' : ''}`}>
              <button class="row between" style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left' }} onClick={() => { setOpen(isOpen ? null : slot.seed); setMode(null); }}>
                <div class="row" style={{ alignItems: 'baseline' }}>
                  <span class="mono" style={{ fontSize: '20px', fontWeight: 600, minWidth: '44px' }}>{gradeOf(route, crag)}</span>
                  <div class="col" style={{ gap: '2px' }}>
                    <span class="card-title">{route.name}{route.signature ? <span class="tiny accent"> · SIGNATURE</span> : null}</span>
                    <span class="tiny muted row"><Circuit c={route.circuit} />{route.style_tags.slice(0, 3).join(', ')}</span>
                  </div>
                </div>
                <div class="col" style={{ alignItems: 'flex-end', gap: '2px' }}>
                  <span class="small" style={{ color: bandColour(p) }}>{showsExactOdds(run, fam) ? pct(p) : band(p)}</span>
                  <span class="tiny muted">{project?.sent ? '✓' : today ? `${today}× today` : project ? `${project.attempts}×` : ''}</span>
                </div>
              </button>
              {isOpen && (
                <>
                  <span class="small soft">{isRoped(route) ? `${route.length_m.toFixed(0)} m · ${boltsOf(route).length} bolts · ${hand} hand moves` : `${hand} hand moves · ${route.wall[route.wall.length - 1]!.y1.toFixed(1)} m`} · danger {route.danger} · {status}</span>
                  {route.fa_note && <span class="tiny muted">{route.fa_note}</span>}
                  <div class="row wrap">
                    {allowed.map((m) => <button key={m} class="chip-btn" aria-pressed={chosen === m} onClick={() => setMode(m)}>{MODE_LABEL[m]}</button>)}
                  </div>
                  <span class="tiny muted">{MODE_NOTE[chosen]}</span>
                  <div class="row">
                    <button class="btn grow" disabled={busy.value || spent || !!project?.sent} onClick={() => void siege(slot.seed, effectiveMode(proj, route, chosen))}>Siege<span class="tiny muted"> · up to 5</span></button>
                    <button class="btn primary grow" disabled={busy.value || spent} onClick={() => void tryProblem(slot.seed, effectiveMode(proj, route, chosen))}>Try</button>
                  </div>
                </>
              )}
            </div>
          );
        })}
        <p class="tiny muted">{sport ? 'A pitch costs about 10–15 energy, more with falls.' : 'An attempt costs about 2–4 energy and some skin.'} Below 22 energy or 12 skin the climber calls it a day.</p>
      </div>
      <div class="cta-bar">
        <button class="cta secondary" disabled={busy.value} onClick={async () => { if (await act({ t: 'block_end' })) goto({ name: 'planner' }); }}>End session</button>
      </div>
      <TabBar />
    </div>
  );
}
