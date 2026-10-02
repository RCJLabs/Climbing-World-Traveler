// Playtest stats (docs/19 §3): how this run's moves were played by hand, set beside the harness's novice, average and
// expert models, with an export of every move so the models can be fitted to real thumbs.
import { useEffect, useState } from 'preact/hooks';
import { PLAYTEST_MODELS, playtestRecords, summarise, type PlaytestRecord, type PlaytestSummary, type Quartiles } from '../../harness/playtest';
import type { RunState } from '../../sim/state';
import { TabBar, Top } from '../components';
import { currentActions, data, goto, settings } from '../store';

/** Median, then the middle half of the moves, with the unit once. */
const q = (x: Quartiles | null, f: (v: number) => string, unit = '') =>
  (x ? `${f(x.p50)}${unit} · middle half ${f(x.p25)}–${f(x.p75)}${unit} · ${x.n} moves` : '—');
const ms = (v: number) => String(Math.round(v));
const pct = (v: number) => `${Math.round(100 * v)}%`;
const two = (v: number) => v.toFixed(2);
const signedMs = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}`;

function Row(props: { label: string; value: string; note?: string | null }) {
  return (
    <div class="col" style={{ gap: '2px' }}>
      <span class="small">{props.label}</span>
      <span class="mono small">{props.value}</span>
      {props.note && <span class="tiny muted">{props.note}</span>}
    </div>
  );
}

export function Playtest({ run }: { run: RunState }) {
  const [state, setState] = useState<{ records: PlaytestRecord[]; summary: PlaytestSummary } | 'reading' | 'error'>('reading');
  useEffect(() => {
    // Replaying the whole run takes a moment on a phone: let "Reading" paint first.
    const t = setTimeout(() => {
      void currentActions().then((actions) => {
        if (!actions) { setState('error'); return; }
        const records = playtestRecords(actions, data);
        setState({ records, summary: summarise(records) });
      }).catch(() => setState('error'));
    }, 30);
    return () => clearTimeout(t);
  }, [run.actions]);

  const exportLog = () => {
    if (typeof state !== 'object') return;
    const file = {
      format: 'cwt-playtest', version: 1, build: __BUILD__, exported: new Date().toISOString(),
      device: { touch_points: navigator.maxTouchPoints, width: window.innerWidth, height: window.innerHeight },
      settings: { one_thumb: settings.value.one_thumb, pause_drift: !!run.options.pause_drift, dyno_speed: run.options.sweep_speed, auto_commit: run.options.auto_commit },
      models: PLAYTEST_MODELS, summary: state.summary, records: state.records,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `playtest_${run.name.replace(/\W+/g, '_') || 'climber'}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const M = PLAYTEST_MODELS;
  return (
    <div class="screen">
      <Top kicker="Playtest" title="How you play the moves" right={<button class="chip-btn" onClick={() => goto({ name: 'character' })}>Back</button>} />
      <div class="scroll">
        {state === 'reading' && <p class="small soft">Reading your run…</p>}
        {state === 'error' && <p class="small warn">Could not read this run's log.</p>}
        {typeof state === 'object' && (() => {
          const { reach, balance, dyno } = state.summary;
          return (
            <>
              <div class="card col">
                <span class="kicker">Reach · Two-Thumb Grip</span>
                <span class="tiny muted">{reach.manual} by hand · {reach.auto} on Auto</span>
                <Row label="Drag time, hand moves" value={q(reach.drag_ms, ms, ' ms')}
                  note={reach.nearest_drag && `Models: novice ${M.reach.novice.mu}, average ${M.reach.average.mu}, expert ${M.reach.expert.mu} ms. Closest: ${reach.nearest_drag}.`} />
                <Row label="Where the limb landed (share of the ring from its centre)" value={q(reach.place, two)}
                  note={reach.nearest_place && `Dead centre ${pct(reach.centre)} of the time. Closest model: ${reach.nearest_place}.`} />
                <Row label="Over the grip clock" value={`${pct(reach.overran)} of hand moves · let go ${reach.let_go}`} />
              </div>
              <div class="card col">
                <span class="kicker">Balance · Lean</span>
                <span class="tiny muted">{balance.manual} by hand ({balance.paused} with No drift) · {balance.auto} on Auto</span>
                <Row label="Out of balance during the reach" value={`${pct(balance.out_share)} of moves`} note={balance.out_ms && `When out: ${q(balance.out_ms, ms, ' ms')}`} />
                <Row label="Barn doors" value={String(balance.barn)} />
              </div>
              <div class="card col">
                <span class="kicker">Dynos · Swing and Catch</span>
                <span class="tiny muted">{dyno.manual} swung · {dyno.auto} on Auto</span>
                <Row label="Pull against what the dyno needed" value={q(dyno.pull_vs_need, (v) => `×${two(v)}`)}
                  note={dyno.nearest_pull && `Closest model: ${dyno.nearest_pull}.`} />
                <Row label="Grab against your flight's dead point" value={q(dyno.catch_offset_ms, signedMs, ' ms')}
                  note={dyno.nearest_catch && `Positive is late. Models: novice +${M.swing.novice.mu}, average +${M.swing.average.mu}, expert +${M.swing.expert.mu} ms. Closest: ${dyno.nearest_catch}.`} />
                <Row label="Catches" value={(['apex', 'caught', 'slap', 'cut'] as const).map((k) => `${k} ${dyno.results[k] ?? 0}`).join(' · ')} />
              </div>
              <button class="btn primary" onClick={exportLog} disabled={!state.records.length}>Export playtest log</button>
              <p class="tiny muted">The file holds every move you played and what it was judged against, plus your settings and the app version. Send it over and the harness's player models get fitted to your hands.</p>
            </>
          );
        })()}
      </div>
      <TabBar />
    </div>
  );
}
