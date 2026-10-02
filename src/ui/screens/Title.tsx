// Title / menu: continue a saved run, start a new climber, Hall of Fame, settings.
import type { RunState } from '../../sim/state';
import { Seg, Top } from '../components';
import { grade } from '../format';
import { act, continueRun, data, deleteRun, goto, meta, runs, saveSettings, settings, storageNote } from '../store';

export function Title({ current }: { current: RunState | null }) {
  const s = settings.value;
  return (
    <div class="screen">
      <Top kicker="P1a · Fontainebleau" title="Climbing World Traveler">
        <span class="small muted">Build a climber. Live a climbing life.</span>
      </Top>
      <div class="scroll">
        {storageNote.value && <p class="small warn">{storageNote.value}</p>}
        {current && !current.ended && <button class="btn primary" onClick={() => goto({ name: 'planner' })}>Back to {current.name}</button>}
        <button class="btn" onClick={() => goto({ name: 'create' })}>New climber</button>
        {runs.value.length > 0 && <span class="kicker">Saved runs</span>}
        {runs.value.map((r) => (
          <div key={r.id} class="card">
            <div class="row between"><span class="card-title">{r.title}</span><span class="tiny muted mono">day {r.day + 1}</span></div>
            <span class="tiny muted">{r.summary ? `Finished · ${r.summary.end_reason} · hardest ${r.summary.hardest ? grade(r.summary.hardest) : '—'}` : `Last played ${new Date(r.last_played).toLocaleDateString()}`} · seed {r.run_seed}</span>
            {r.data_version !== data.version && <span class="tiny warn">Made with an older version of the game, so it can't be continued. Its Hall of Fame entry is kept.</span>}
            <div class="row">
              <button class="btn small" disabled={r.data_version !== data.version} onClick={() => continueRun(r.id)}>{r.summary ? 'View' : 'Continue'}</button>
              <button class="btn small" onClick={() => { if (confirm(`Delete ${r.title}? This cannot be undone.`)) void deleteRun(r.id); }}>Delete</button>
            </div>
          </div>
        ))}
        {meta.value.hall_of_fame.length > 0 && <button class="btn" onClick={() => goto({ name: 'hall' })}>Hall of Fame</button>}
        <button class="btn" onClick={() => { location.hash = 'proto-dyno'; }}>Dyno prototype</button>
        <span class="kicker">Settings</span>
        <div class="col small">Haptics<Seg label="Haptics" value={s.haptics ? 'on' : 'off'} onChange={(v) => void saveSettings({ ...s, haptics: v === 'on' })} options={[['on', 'On'], ['off', 'Off']]} /></div>
        <div class="col small">Reach moves<Seg label="Reach moves" value={s.one_thumb ? 'one' : 'two'} onChange={(v) => void saveSettings({ ...s, one_thumb: v === 'one' })} options={[['two', 'Two thumbs'], ['one', 'One thumb']]} /></div>
        <div class="col small">Motion<Seg label="Motion" value={s.reduce_motion ? 'less' : 'full'} onChange={(v) => void saveSettings({ ...s, reduce_motion: v === 'less' })} options={[['full', 'Full'], ['less', 'Reduced']]} /></div>
        {current && !current.ended && (
          <>
            <div class="col small">Dynamic moves (this run)<Seg label="Commit window" value={current.options.auto_commit ? 'auto' : 'tap'} onChange={(v) => void act({ t: 'settings', patch: { auto_commit: v === 'auto' } })} options={[['tap', 'Tap to time'], ['auto', 'Auto-commit']]} /></div>
            <div class="col small">Dyno speed<Seg label="Dyno speed" value={current.options.sweep_speed} onChange={(v) => void act({ t: 'settings', patch: { sweep_speed: v } })} options={[[1.3, 'Slower'], [1, 'Normal'], [0.8, 'Faster']]} /></div>
            <button class="btn" onClick={() => { if (confirm(`Retire ${current.name}? The run ends and goes into the Hall of Fame.`)) void act({ t: 'retire' }).then((ok) => ok && goto({ name: 'summary' })); }}>Retire {current.name}</button>
          </>
        )}
        <p class="tiny muted">Real places, fictional people. Fontainebleau only in this version; travel, routes and the rest of the world come later.</p>
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
            <span class="tiny muted">{h.background} · {h.end_reason} · {h.days} days · hardest {h.hardest ? grade(h.hardest) : '—'} · {h.ticks} ticks</span>
          </div>
        ))}
      </div>
      <div class="cta-bar"><button class="cta secondary" onClick={() => goto({ name: 'title' })}>Back</button></div>
    </div>
  );
}
