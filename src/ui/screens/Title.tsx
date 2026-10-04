// Title / menu: continue a saved run, start a new climber, Hall of Fame, settings.
import type { RunState } from '../../sim/state';
import { Seg, Top } from '../components';
import { grade, gradeAt } from '../format';
import type { RunSummary } from '../../sim/types';
import { cannotContinue } from '../../save/session';

/** A finished run's best: its hardest boulder, its hardest route, or both (P1b). Older entries have no route fields. */
const hardestLine = (s: RunSummary): string => {
  const parts = [s.hardest ? grade(s.hardest) : '', s.hardest_route ? gradeAt(s.hardest_route, 'sport') : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
};
import { act, continueRun, data, deleteRun, goto, meta, runs, saveSettings, settings, storageNote } from '../store';

export function Title({ current }: { current: RunState | null }) {
  const s = settings.value;
  return (
    <div class="screen">
      <Top kicker="P1a · Fontainebleau" title="Climbing World Traveler">
        <span class="small muted">Build a climber. Plan the training. Watch the sends.</span>
      </Top>
      <div class="scroll">
        {storageNote.value && <p class="small warn">{storageNote.value}</p>}
        {current && !current.ended && <button class="btn primary" onClick={() => goto({ name: 'planner' })}>Back to {current.name}</button>}
        <button class="btn" onClick={() => goto({ name: 'create' })}>New climber</button>
        {runs.value.length > 0 && <span class="kicker">Saved runs</span>}
        {runs.value.map((r) => (
          <div key={r.id} class="card">
            <div class="row between"><span class="card-title">{r.title}</span><span class="tiny muted mono">day {r.day + 1}</span></div>
            <span class="tiny muted">{r.summary ? `Finished · ${r.summary.end_reason} · hardest ${hardestLine(r.summary)}` : `Last played ${new Date(r.last_played).toLocaleDateString()}`} · seed {r.run_seed}</span>
            {cannotContinue(r, data) && <span class="tiny warn">{cannotContinue(r, data)} It can't be continued; its Hall of Fame entry is kept.</span>}
            <div class="row">
              <button class="btn small" disabled={!!cannotContinue(r, data)} onClick={() => continueRun(r.id)}>{r.summary ? 'View' : 'Continue'}</button>
              <button class="btn small" onClick={() => { if (confirm(`Delete ${r.title}? This cannot be undone.`)) void deleteRun(r.id); }}>Delete</button>
            </div>
          </div>
        ))}
        {meta.value.hall_of_fame.length > 0 && <button class="btn" onClick={() => goto({ name: 'hall' })}>Hall of Fame</button>}
        <span class="kicker">Settings</span>
        <div class="col small">Single attempts<Seg label="Single attempts" value={s.watch ? 'watch' : 'result'} onChange={(v) => void saveSettings({ ...s, watch: v === 'watch' })} options={[['watch', 'Watch on the wall'], ['result', 'Result only']]} /></div>
        <div class="col small">Playback speed<Seg label="Playback speed" value={s.speed} onChange={(v) => void saveSettings({ ...s, speed: v })} options={[[1, '1×'], [2, '2×'], [4, '4×']]} /></div>
        <div class="col small">Motion<Seg label="Motion" value={s.reduce_motion ? 'less' : 'full'} onChange={(v) => void saveSettings({ ...s, reduce_motion: v === 'less' })} options={[['full', 'Full'], ['less', 'Reduced']]} /></div>
        {current && !current.ended && (
          <button class="btn" onClick={() => { if (confirm(`Retire ${current.name}? The run ends and goes into the Hall of Fame.`)) void act({ t: 'retire' }).then((ok) => ok && goto({ name: 'summary' })); }}>Retire {current.name}</button>
        )}
        <p class="tiny muted">Build a climber, plan the training, and the climbing plays out by itself. Real places, fictional people. Bouldering at Fontainebleau and sport climbing on Kalymnos in this version; the rest of the world comes later.</p>
        <p class="tiny muted mono">Version {__BUILD__.sha} · {__BUILD__.date}</p>
      </div>
    </div>
  );
}

export function Hall() {
  return (
    <div class="screen">
      <Top kicker="All runs" title="Hall of Fame" />
      <div class="scroll">
        {meta.value.hall_of_fame.map((h, i) => (
          <div key={i} class="card">
            <div class="row between"><span class="card-title">#{i + 1} {h.climber}</span><span class="mono accent">{Math.round(h.score)}</span></div>
            <span class="tiny muted">{h.background} · {h.end_reason} · {h.days} days · hardest {hardestLine(h)} · {h.ticks} ticks</span>
          </div>
        ))}
      </div>
      <div class="cta-bar"><button class="cta secondary" onClick={() => goto({ name: 'title' })}>Back</button></div>
    </div>
  );
}
