// What a simulated session or stretch of days did (docs/24 §4): sends, the grade estimate, what got stronger, money,
// and what happened along the way.
import type { RunState } from '../../sim/state';
import { Top } from '../components';
import { ATTR_LABEL, gradeAt, money, pct, signed, tickGrade } from '../format';
import { busy, data, goto, report, simulatePlan } from '../store';

const OUTCOME: Record<string, string> = { sent: 'sent', fell: 'fell', jumped: 'jumped off', pumped: 'pumped off', worked: 'worked' };

export function Report({ run }: { run: RunState }) {
  const r = report.value;
  if (!r) return <div class="screen"><div class="scroll"><button class="btn" onClick={() => goto({ name: 'planner' })}>Back</button></div></div>;
  const dE = r.estimate[1] - r.estimate[0];
  const grade = (di: number) => gradeAt(di, r.discipline, data.crags.get(r.crag));
  const inSession = run.block?.kind === 'climb';
  return (
    <div class="screen">
      <Top kicker={r.kind === 'days' ? `${r.days} ${r.days === 1 ? 'day' : 'days'} simulated` : 'Session'} title={r.title}>
        <span class="small muted">{r.kind === 'days'
          ? `${r.climb_days} on the rock · ${r.train_blocks} training · ${r.rest_days} rest${r.work_blocks ? ` · ${r.work_blocks} odd jobs` : ''}`
          : `${r.attempts} attempts · ${r.sends} sends`}</span>
      </Top>
      <div class="scroll">
        <div class="card">
          <div class="row between"><span class="kicker">Grade estimate</span><span class="mono">{grade(r.estimate[0])} → <span class="accent">{grade(r.estimate[1])}</span> <span class={`tiny ${dE >= 0 ? 'good' : 'warn'}`}>{signed(dE, 2)} DI</span></span></div>
          <div class="row between"><span class="kicker">Hardest send</span><span class="mono">{r.pb[0] ? grade(r.pb[0]) : '—'} → {r.pb[1] > r.pb[0] ? <span class="good">{grade(r.pb[1])} new</span> : r.pb[1] ? grade(r.pb[1]) : '—'}</span></div>
          <div class="row between"><span class="kicker">Sends</span><span class="mono">{r.sends} of {r.attempts} attempts</span></div>
          <div class="row between"><span class="kicker">Money</span><span class={`mono ${r.money < 0 ? 'warn' : ''}`}>{r.money >= 0 ? '+' : ''}{money(r.money)}</span></div>
        </div>

        {r.tries.length > 0 && (
          <>
            <span class="kicker">Attempt by attempt</span>
            <div class="log">
              {r.tries.map((t, i) => (
                <div key={i} class="row between">
                  <span class="small one-line">{grade(t.di)} {t.name}</span>
                  <span class="small mono" style={{ color: t.outcome === 'sent' ? 'var(--good)' : 'var(--muted)' }}>{t.outcome === 'sent' ? (t.tick?.style ?? 'sent') : t.outcome === 'worked' ? `worked${t.falls ? `, ${t.falls} ${t.falls === 1 ? 'fall' : 'falls'}` : ''}` : `${OUTCOME[t.outcome]} at ${pct(t.progress)}`}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {r.ticks.length > 0 && r.kind === 'days' && (
          <>
            <span class="kicker">Best sends</span>
            <div class="log">
              {r.ticks.slice(0, 8).map((t, i) => (
                <div key={i} class="row between"><span class="small one-line">{tickGrade(t, data)} {t.name}</span><span class="small mono muted">{t.style}{t.attempts > 1 ? ` · ${t.attempts} tries` : ''}</span></div>
              ))}
              {r.ticks.length > 8 && <span class="tiny muted">and {r.ticks.length - 8} more</span>}
            </div>
          </>
        )}

        {r.attrs.length > 0 && (
          <>
            <span class="kicker">What changed</span>
            <div class="log">
              {r.attrs.slice(0, 10).map((a) => (
                <div key={a.id} class="row between">
                  <span class="small">{ATTR_LABEL[a.id]}</span>
                  <span class="small mono">{a.before.toFixed(1)} → {a.after.toFixed(1)} <span class={a.after >= a.before ? 'good' : 'warn'}>{signed(a.after - a.before)}</span></span>
                </div>
              ))}
            </div>
            <span class="tiny muted">Finger strength and skin also carry tendon gains still arriving; they show over the next weeks.</span>
          </>
        )}

        {r.journal.length > 0 && (
          <div class="col">
            {r.journal.slice(-8).map((j, i) => (
              <p key={i} class={`small ${j.tone === 'good' ? 'good' : j.tone === 'bad' ? 'warn' : 'muted'}`}>Day {j.day + 1}: {j.text}</p>
            ))}
          </div>
        )}
      </div>
      <div class="cta-bar">
        {r.ended ? <button class="cta" onClick={() => goto({ name: 'summary' })}>Career over</button> : (
          <>
            <button class="cta secondary" onClick={() => goto({ name: inSession ? 'routes' : 'planner' })}>{inSession ? 'Session' : 'Plan'}</button>
            {r.kind === 'days' && <button class="cta" disabled={busy.value} onClick={() => void simulatePlan(r.days === 1 ? 1 : 7)}>{busy.value ? 'Simulating…' : r.days === 1 ? '+1 day' : '+1 week'}</button>}
          </>
        )}
      </div>
    </div>
  );
}
