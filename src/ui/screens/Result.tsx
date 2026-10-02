// Attempt result (17 §2): what happened, the line move by move, and what next.
import { routeEntry } from '../../sim/attempt';
import type { RunState } from '../../sim/state';
import { Top } from '../components';
import { band, bandColour, CLASS_LABEL, grade, pct, signed } from '../format';
import { act, data, goto } from '../store';

const HEAD: Record<string, string> = { sent: 'Sent', fell: 'Off', jumped: 'Jumped off', pumped: 'Pumped off' };
const FORCED_LABEL = { cut: 'cut', grip: 'grip gave out', barn: 'barn door' } as const;
/** Why a slip the player's input forced happened: the margin did not decide it (docs/23 §3). */
const FORCED_WHY = {
  cut: 'Mistimed the dyno: nothing to hold. The margin sets how much pull a dyno needs; the swing and the catch decide it.',
  grip: 'Too slow: the holding hand gave out before the move landed. A quicker reach pumps less and never lets go.',
  barn: 'Barn door: you drifted out of balance for too long. Lean in, let go, then reach before the drift takes you out.',
} as const;

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
              <span class="small">{i + 1}. {m.limb} {m.cls ? CLASS_LABEL[m.cls] : ''}{m.commit ? ` · ${m.commit}` : ''}{m.forced && m.forced !== 'cut' ? ` · ${FORCED_LABEL[m.forced]}` : ''}</span>
              <span class="small mono" style={{ color: m.outcome === 'clean' || m.outcome === 'sent' ? 'var(--good)' : m.outcome === 'sketchy' ? 'var(--accent)' : 'var(--warn)' }}>
                {m.outcome === 'slip_recovered' ? 'slip, held' : m.outcome}{m.p_complete !== undefined ? ` · ${band(m.p_complete)}` : ''}
              </span>
            </div>
          ))}
          {moves.length === 0 && <span class="small muted">You never left the ground.</span>}
        </div>
        {fail && fail.margin !== undefined && fail.T !== undefined && (
          <div class="card">
            <span class="kicker">Why</span>
            <span class="small">Margin <span class="mono">{signed(fail.margin)}</span> DI against a sure-thing band of <span class="mono">±{fail.T.toFixed(2)}</span>.</span>
            <span class="small soft">{fail.forced ? FORCED_WHY[fail.forced] : fail.margin < -fail.T ? 'That move is beyond you today: stronger, better positioned, or a different sequence.' : fail.margin < 0 ? 'A coin flip. Fresh skin, cold rock or a better stance tips it.' : 'You had it and it still went. That is what the band means.'}</span>
            {fail.p_complete !== undefined && <span class="small">Chance on that move: <span style={{ color: bandColour(fail.p_complete) }}>{pct(fail.p_complete)}</span></span>}
          </div>
        )}
        {project && !project.sent && project.attempts >= 2 && <p class="small muted">Each attempt teaches the moves: familiarity takes up to a quarter of a grade off every move.</p>}
        <p class="tiny muted">Energy {Math.round(run.res.energy)} · skin {Math.round(run.res.skin)}</p>
      </div>
      <div class="cta-bar">
        <button class="cta secondary" onClick={() => goto({ name: inSession ? 'routes' : 'planner' })}>Problems</button>
        {inSession && (
          <button class="cta" disabled={run.res.energy < 10 || run.res.skin <= 0} onClick={async () => {
            if (await act({ t: 'attempt_start', route_seed: r.route_seed, mode: project?.sent ? 'redpoint' : 'redpoint' })) goto({ name: 'attempt' });
          }}>Try again</button>
        )}
      </div>
    </div>
  );
}
