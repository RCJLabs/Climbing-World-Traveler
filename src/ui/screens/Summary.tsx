// Run summary and legacy (11 §5, 16 §6–§7).
import type { RunState } from '../../sim/state';
import { Top } from '../components';
import { CIRCUIT_LABEL, grade, gradeAt } from '../format';
import { goto, meta } from '../store';

const ENDING: Record<string, string> = {
  retired: 'Career over · by choice', bankrupt: 'Career over · out of money', burnout: 'Career over · burnt out',
  forced_injury: 'Career over · injury', death: 'Career over',
};

export function Summary({ run }: { run: RunState }) {
  const s = run.ended;
  if (!s) return null;
  const rank = meta.value.hall_of_fame.findIndex((h) => h.seed === s.seed && h.climber === s.climber && h.days === s.days) + 1;
  const pyramids = ([[s.pyramid, false], [s.pyramid_route ?? {}, true]] as const)
    .map(([p, sport]) => ({ sport, steps: Object.entries(p).map(([k, v]) => [Number(k), v] as const).sort((a, b) => b[0] - a[0]).slice(0, 7) }))
    .filter((p) => p.steps.length > 0);
  const newBg = s.unlocks.includes('p1a:second_background');
  return (
    <div class="screen">
      <Top kicker={ENDING[s.end_reason] ?? 'Career over'} title={`${s.climber}, ${s.age_end}`}>
        <span class="small muted">{s.days} days{s.countries > 1 ? ` · ${s.countries} countries` : ''}</span>
      </Top>
      <div class="scroll">
        <div class="card">
          <span class="mono accent" style={{ fontSize: '36px', fontWeight: 600 }}>{Math.round(s.score)}</span>
          <span class="small soft">score{rank ? ` · #${rank} all time` : ''}</span>
        </div>
        <div class="list">
          {(s.hardest > 0 || !s.hardest_route) && <div class="row between"><span class="kicker">Hardest boulder</span><span class="mono">{s.hardest ? grade(s.hardest) : '—'}</span></div>}
          {s.hardest > 0 && <div class="row between"><span class="kicker">Hardest boulder flash</span><span class="mono">{s.hardest_flash ? grade(s.hardest_flash) : '—'}</span></div>}
          {s.hardest_route > 0 && <div class="row between"><span class="kicker">Hardest route</span><span class="mono">{gradeAt(s.hardest_route, 'sport')}</span></div>}
          {s.hardest_route > 0 && <div class="row between"><span class="kicker">Hardest onsight</span><span class="mono">{s.hardest_route_onsight ? gradeAt(s.hardest_route_onsight, 'sport') : '—'}</span></div>}
          <div class="row between"><span class="kicker">Ticks</span><span class="mono">{s.ticks}</span></div>
          {(s.injuries ?? 0) > 0 && <div class="row between"><span class="kicker">Injuries</span><span class="mono">{s.injuries} <span class="tiny muted">−{4 * s.injuries} in the score</span></span></div>}
          {Object.keys(s.circuits).length > 0 && <span class="small muted">circuits: {Object.entries(s.circuits).map(([c, n]) => `${CIRCUIT_LABEL[c as keyof typeof CIRCUIT_LABEL]} ×${n}`).join(' · ')}</span>}
          {s.got_away && <div class="row between"><span class="kicker">The one that got away</span><span class="small">{gradeAt(s.got_away.di, s.got_away.discipline === 'sport' ? 'sport' : 'boulder')} {s.got_away.name} · {s.got_away.sessions} sessions</span></div>}
        </div>
        {pyramids.map(({ sport, steps }) => {
          const maxCount = Math.max(1, ...steps.map(([, v]) => v));
          return (
            <div key={String(sport)} class="col">
              <span class="kicker">{pyramids.length > 1 ? (sport ? 'Route pyramid' : 'Boulder pyramid') : 'Grade pyramid'}</span>
              <div class="pyramid">
                {steps.map(([di, n]) => (
                  <div key={di}><span class="mono small" style={{ width: '40px' }}>{gradeAt(di, sport ? 'sport' : 'boulder')}</span><div class="bar" style={{ width: `${(n / maxCount) * 70}%` }} /><span class="mono tiny">{n}</span></div>
                ))}
              </div>
            </div>
          );
        })}
        {newBg && <p class="small accent">New background unlocked: Farm Kid. Pick it when you build your next climber.</p>}
        <p class="tiny muted">Seed {s.seed}</p>
      </div>
      <div class="cta-bar">
        <button class="cta secondary" onClick={() => goto({ name: 'create', seed: s.seed })}>Same seed</button>
        <button class="cta" onClick={() => goto({ name: 'create' })}>New climber</button>
      </div>
    </div>
  );
}
