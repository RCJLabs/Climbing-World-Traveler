// Attempt result (17 §2, docs/24 §5): what happened, the line move by move, why it ended, and what next.
import { routeEntry } from '../../sim/attempt';
import type { RunState } from '../../sim/state';
import { tired } from '../../sim/tactics';
import { Top } from '../components';
import { band, bandColour, CLASS_LABEL, grade, pct, signed } from '../format';
import { busy, data, goto, siege, tryProblem } from '../store';

const HEAD: Record<string, string> = { sent: 'Sent', fell: 'Off', jumped: 'Jumped off', pumped: 'Pumped off' };

export function Result({ run }: { run: RunState }) {
  const r = run.last_attempt;
  if (!r) return <div class="screen"><div class="scroll"><button class="btn" onClick={() => goto({ name: 'routes' })}>Back</button></div></div>;
  const { route } = routeEntry(r.route_seed, data);
  const project = run.projects[r.route_id];
  const moves = r.log.filter((m) => m.kind === 'move' && m.outcome);
  const fail = [...moves].reverse().find((m) => m.outcome === 'fall' || m.outcome === 'slip_recovered' || m.outcome === 'pumped');
  const inSession = run.block?.kind === 'climb';
  const head = r.outcome === 'sent' ? (r.tick ? `${r.tick.style[0]!.toUpperCase()}${r.tick.style.slice(1)}!` : 'Topped out') : `${HEAD[r.outcome]} at ${pct(r.progress)}`;

  return (
    <div class="screen">
      <Top kicker={`${route.name} · ${grade(route.di_graded)} · attempt ${project?.attempts ?? 1}`} title={head}>
        <span class="small muted">{r.text}{r.outcome !== 'sent' && r.kappa > 0.15 ? ' A heavy landing.' : ''}</span>
      </Top>
      <div class="scroll">
        <span class="kicker">The line, move by move</span>
        <div class="log">
          {moves.map((m, i) => (
            <div key={i} class="row between">
              <span class="small">{i + 1}. {m.limb} {m.cls ? CLASS_LABEL[m.cls] : ''}{m.commit ? ` · ${m.commit}` : ''}</span>
              <span class="small mono" style={{ color: m.outcome === 'clean' || m.outcome === 'sent' ? 'var(--good)' : m.outcome === 'sketchy' ? 'var(--accent)' : 'var(--warn)' }}>
                {m.outcome === 'slip_recovered' ? 'slip, held' : m.outcome}{m.p_complete !== undefined ? ` · ${band(m.p_complete)}` : ''}
              </span>
            </div>
          ))}
          {moves.length === 0 && <span class="small muted">{run.name} never left the ground.</span>}
        </div>
        {fail && fail.margin !== undefined && fail.T !== undefined && (
          <div class="card">
            <span class="kicker">Why</span>
            <span class="small">Margin <span class="mono">{signed(fail.margin)}</span> DI against a sure-thing band of <span class="mono">±{fail.T.toFixed(2)}</span>.</span>
            <span class="small soft">{fail.margin < -fail.T ? 'That move is beyond the climber today: it needs more strength or better technique for it.' : fail.margin < 0 ? 'A coin flip. Fresh skin, cold rock or a better stance tips it.' : 'The move was there and it still went. That is what the band means.'}</span>
            {fail.p_complete !== undefined && <span class="small">Chance on that move: <span style={{ color: bandColour(fail.p_complete) }}>{pct(fail.p_complete)}</span></span>}
          </div>
        )}
        {project && !project.sent && project.attempts >= 2 && <p class="small muted">Each attempt teaches the moves: familiarity takes up to a quarter of a grade off every move.</p>}
        <p class="tiny muted">Energy {Math.round(run.res.energy)} · skin {Math.round(run.res.skin)}</p>
      </div>
      <div class="cta-bar">
        <button class="cta secondary" onClick={() => goto({ name: inSession ? 'routes' : 'planner' })}>Problems</button>
        {inSession && !project?.sent && (
          <button class="cta secondary" disabled={busy.value || tired(run)} onClick={() => void siege(r.route_seed, 'redpoint')}>Siege</button>
        )}
        {inSession && (
          <button class="cta" disabled={busy.value || tired(run)} onClick={() => void tryProblem(r.route_seed, 'redpoint')}>Again</button>
        )}
      </div>
    </div>
  );
}
