// The plan (11 §1, 17 §2, docs/24 §2): weather and conditions, the training week the climber follows, simulating days
// by it, and today run by hand for when the player wants to pick the problems themselves.
import { useState } from 'preact/hooks';
import { athleteOf } from '../../sim/attempt';
import { canStartBlock, dailyCost, dateLabel, energyCap } from '../../sim/run';
import type { RunState } from '../../sim/state';
import { plannedBlock, scheduledBlock } from '../../sim/tactics';
import { ACTIVITIES, activityById, acwr, acwrLabel } from '../../sim/training';
import type { AttrId, BlockKind, PlanBlock, PlanDay, WeekPlan } from '../../sim/types';
import { calendarDate, conditionsLabel, DAYS_IN_MONTH, nextWeather, sectorStatus, sessionConditions, type DayWeather } from '../../sim/weather';
import { Meter, Sheet, TabBar, Top } from '../components';
import { ATTR_LABEL, money } from '../format';
import { act, busy, data, goto, simulatePlan } from '../store';

const SKY: Record<DayWeather['sky'], string> = { clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', storm: 'Storm' };
/** The run's first day is the first day of its week (docs/24 §2), shown as a Monday. */
export const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function blockLabel(b: PlanBlock | null): string {
  if (!b) return '—';
  switch (b.kind) {
    case 'climb': return b.tactic === 'project' ? 'Climb · project' : 'Climb · mileage';
    case 'train': return activityById(b.activity)?.name ?? b.activity;
    case 'rest': return 'Rest';
    case 'active_recovery': return 'Recover';
    case 'work': return 'Odd jobs';
  }
}

const sameBlock = (a: PlanBlock | null, b: PlanBlock | null): boolean => JSON.stringify(a) === JSON.stringify(b);
const CLIMBS: PlanBlock[] = [{ kind: 'climb', tactic: 'volume' }, { kind: 'climb', tactic: 'project' }];
const OFF: PlanBlock[] = [{ kind: 'rest' }, { kind: 'active_recovery' }, { kind: 'work' }];
const TRAINS: PlanBlock[] = ACTIVITIES.map((a) => ({ kind: 'train', activity: a.id }));

function frictionWord(run: RunState): string {
  const crag = data.crags.get(run.crag)!;
  const sunny = crag.sectors.find((s) => !s.shade) ?? crag.sectors[0]!;
  return conditionsLabel(sessionConditions(athleteOf(run, data), run.weather, sunny, 100, run.options.difficulty));
}

export function Planner({ run }: { run: RunState }) {
  const [train, setTrain] = useState(false);
  const [edit, setEdit] = useState<number | 'wet' | null>(null);
  const crag = data.crags.get(run.crag)!;
  const date = calendarDate(run.start_month, run.start_dom, run.day);
  const tomorrowDate = calendarDate(run.start_month, run.start_dom, run.day + 1);
  const tomorrow = nextWeather(run.seed, crag, run.weather, run.day + 1, tomorrowDate.month, run.options.difficulty);
  const open = crag.sectors.filter((s) => sectorStatus(crag, s, run.weather, run.last_rain).open).length;
  const w = run.weather;
  const ratio = acwr(run.counters.loads);
  const onBreak = run.day < run.counters.forced_break_until;
  const check = (k: BlockKind, target?: string) => canStartBlock(run, k, target, data);
  const climbCheck = open ? check('climb', crag.sectors.find((s) => sectorStatus(crag, s, run.weather, run.last_rain).open)!.id) : { ok: false as const, reason: 'Every sector is wet.' };
  const blockNames: Record<BlockKind, string> = { climb: 'Climb', train: 'Train', rest: 'Rest', active_recovery: 'Recover', work: 'Odd job' };
  const gains = Object.entries(run.yesterday?.gains ?? {}).filter(([, v]) => (v ?? 0) >= 0.05).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 6);
  const plan = run.plan;
  const today = run.day % 7;
  // What the climber will actually do next, after its own rules (wet rock, skin, money), when it differs from the plan.
  const next = plannedBlock(run, data);
  const scheduled = scheduledBlock(run);
  const deviates = next && !sameBlock(next, scheduled) ? next : null;

  const setPlan = (p: WeekPlan) => void act({ t: 'set_plan', plan: p });
  const setDay = (k: number, d: PlanDay) => { const p = structuredClone(plan); p.days[k] = d; setPlan(p); };

  return (
    <div class="screen">
      <Top kicker={`Day ${run.day + 1} · ${WEEKDAY[today]} · year ${date.year + 1}`} right={<span class={`pill ${run.res.money < 0 ? 'warn' : ''}`}>{money(run.res.money)}</span>}>
        <h1>{dateLabel(run)}</h1>
        <span class="small muted">{crag.name} · {run.name}, {Math.floor(run.body.age_start + run.day / 365)}</span>
      </Top>
      <div class="scroll">
        <div class="card">
          <div class="row between">
            <span class="card-title">{SKY[w.sky]} · {Math.round(w.t_min)}–{Math.round(w.t_max)} °C</span>
            <span class="pill">friction {frictionWord(run)}</span>
          </div>
          <span class="small muted">{w.rh}% humidity · wind {w.wind} m/s{w.precip_mm ? ` · ${w.precip_mm} mm` : ''}</span>
          <span class="small">{open === crag.sectors.length ? 'Every sector is dry.' : open === 0 ? (crag.rock.startsWith('sandstone') ? 'The forest is shut: wet sandstone breaks.' : 'Every sector is wet.') : `${open} of ${crag.sectors.length} sectors dry.`}</span>
          <span class="tiny muted">Tomorrow: {SKY[tomorrow.sky].toLowerCase()}, {Math.round(tomorrow.t_max)} °C. Season {['off', 'poor', 'fair', 'prime'][crag.season[date.month] ?? 0]} in {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][date.month]} ({DAYS_IN_MONTH[date.month]} days).</span>
        </div>

        {onBreak && <p class="small warn">Forced break for burnout until day {run.counters.forced_break_until + 1}. No climbing or training.</p>}

        <div class="card">
          <div class="row between"><span class="kicker">Training week</span><span class="tiny muted">tap a day to change it</span></div>
          <div class="plan-week">
            {plan.days.map((d, k) => (
              <button key={k} class={`plan-day${k === today ? ' today' : ''}`} onClick={() => setEdit(k)} aria-label={`${WEEKDAY[k]}: ${blockLabel(d.main)}${d.extra ? ` then ${blockLabel(d.extra)}` : ''}`}>
                <span class="mono tiny">{WEEKDAY[k]}</span>
                <span class="small one-line">{blockLabel(d.main)}{d.extra ? <span class="muted"> + {blockLabel(d.extra)}</span> : null}</span>
              </button>
            ))}
          </div>
          <button class="plan-day" onClick={() => setEdit('wet')}><span class="mono tiny">Wet</span><span class="small one-line">{blockLabel(plan.wet_day)} <span class="muted">when it rains</span></span></button>
          <div class="row wrap">
            <button class="chip-btn" aria-pressed={plan.auto_work} onClick={() => setPlan({ ...plan, auto_work: !plan.auto_work })}>Odd jobs when money is short</button>
            <button class="chip-btn" aria-pressed={plan.auto_rest} onClick={() => setPlan({ ...plan, auto_rest: !plan.auto_rest })}>Rest on worn skin or burnout</button>
          </div>
          {deviates && <span class="tiny accent">Next up: {blockLabel(deviates)}, not {blockLabel(scheduled)} ({deviates.kind === 'work' ? 'money is short' : deviates.kind === 'rest' ? 'skin, burnout or a forced break' : 'the rock is wet'}).</span>}
          <button class="btn small" disabled={busy.value || !!run.ended} onClick={() => void simulatePlan(28)}>Simulate four weeks</button>
        </div>

        <div class="meters">
          <Meter label="Energy" value={run.res.energy} right={`${Math.round(run.res.energy)}/${Math.round(energyCap(run))}`} colour="var(--good)" />
          <Meter label="Skin" value={run.res.skin} colour="var(--skin)" />
          <Meter label="Stoke" value={run.res.stoke} colour="var(--accent)" />
          <Meter label="Burnout" value={run.res.burnout} colour="var(--warn)" />
        </div>
        <p class="tiny muted">Training load: {acwrLabel(ratio)}{ratio !== null ? ` (${ratio.toFixed(2)})` : ''}. Living costs {money(dailyCost(run, data))} a day.</p>

        <h2>Today by hand · {run.blocks_today.length} of 2 blocks</h2>
        {run.blocks_today.length > 0 && <p class="small soft">{run.blocks_today.map((b) => blockNames[b]).join(' → ')}</p>}
        {run.today.notes.length > 0 && <p class="tiny muted">{run.today.notes.join(' ')}</p>}
        <div class="list">
          <button class="card" disabled={!climbCheck.ok} onClick={() => goto({ name: 'crag' })}>
            <div class="row between"><span class="card-title">Climb</span><span class="mono tiny muted">energy −10 + attempts</span></div>
            <span class="small soft">{climbCheck.ok ? `Pick a sector, then the ${crag.disciplines.includes('boulder') ? 'problems' : 'routes'} to try. Travel from there too.` : climbCheck.reason}</span>
          </button>
          <button class="card" disabled={onBreak || run.blocks_today.length >= 2} onClick={() => setTrain(true)}>
            <div class="row between"><span class="card-title">Train</span><span class="mono tiny muted">gym day pass $20</span></div>
            <span class="small soft">Hangboard, campus, weights, drills, mobility.</span>
          </button>
          <div class="row">
            <BlockButton label="Rest" sub="+15 energy" check={check('rest')} onClick={() => act({ t: 'block_start', kind: 'rest' })} />
            <BlockButton label="Recover" sub="mobility" check={check('active_recovery')} onClick={() => act({ t: 'block_start', kind: 'active_recovery' })} />
            <BlockButton label="Odd job" sub="+$50" check={check('work')} onClick={() => act({ t: 'block_start', kind: 'work' })} />
          </div>
          <button class="btn" disabled={busy.value} onClick={() => act({ t: 'end_day' })}>End the day here</button>
        </div>

        {run.yesterday && (gains.length > 0 || run.yesterday.notes.length > 0) && (
          <div class="card">
            <span class="kicker">Yesterday</span>
            {run.yesterday.notes.length > 0 && <span class="small soft">{run.yesterday.notes.join(' ')}</span>}
            {gains.length > 0 && <span class="small">{gains.map(([k, v]) => `${ATTR_LABEL[k as AttrId]} +${(v ?? 0).toFixed(1)}`).join(' · ')}</span>}
          </div>
        )}
        <div class="col">
          {run.journal.slice(-5).reverse().map((j, i) => (
            <p key={i} class={`small ${j.tone === 'good' ? 'good' : j.tone === 'bad' ? 'warn' : 'muted'}`}>Day {j.day + 1}: {j.text}</p>
          ))}
        </div>
      </div>
      <div class="cta-bar">
        <button class="cta secondary" disabled={busy.value} aria-label="Simulate one day" onClick={() => void simulatePlan(1)}>+1 day</button>
        <button class="cta" disabled={busy.value} aria-label="Simulate one week" onClick={() => void simulatePlan(7)}>{busy.value ? 'Simulating…' : '+1 week'}</button>
      </div>
      <TabBar />
      {edit !== null && (
        <Sheet label="Plan a day" onClose={() => setEdit(null)}>
          {edit === 'wet' ? (
            <>
              <h2>When the rock is wet</h2>
              <p class="tiny muted">A climbing day with every sector wet becomes this instead.</p>
              <Options blocks={[{ kind: 'rest' }, ...TRAINS]} value={plan.wet_day} onPick={(b) => { if (b) setPlan({ ...plan, wet_day: b }); setEdit(null); }} />
            </>
          ) : (
            <>
              <h2>{WEEKDAY[edit]}</h2>
              <span class="kicker">First block</span>
              <Options blocks={[...CLIMBS, ...OFF, ...TRAINS]} value={plan.days[edit]!.main} onPick={(b) => { if (b) setDay(edit, { ...plan.days[edit]!, main: b }); }} />
              <span class="kicker">Then, if there is energy left (50+)</span>
              <Options blocks={[...OFF, ...TRAINS]} value={plan.days[edit]!.extra} none onPick={(b) => setDay(edit, { ...plan.days[edit]!, extra: b })} />
              <button class="btn primary" onClick={() => setEdit(null)}>Done</button>
            </>
          )}
        </Sheet>
      )}
      {train && (
        <Sheet label="Training" onClose={() => setTrain(false)}>
          <h2>Train</h2>
          <p class="tiny muted">The Paris gyms are 40 minutes away. Strength comes slowly; tendons slower.</p>
          {ACTIVITIES.map((a) => {
            const c = check('train', a.id);
            return (
              <button key={a.id} class="card" disabled={!c.ok} onClick={async () => { setTrain(false); await act({ t: 'block_start', kind: 'train', target: a.id }); }}>
                <div class="row between"><span class="card-title">{a.name}</span><span class="mono tiny muted">energy −{a.energy}{a.skin ? ` · skin −${a.skin}` : ''}{a.cost ? ` · $${a.cost}` : ''}</span></div>
                <span class="small soft">{c.ok ? a.blurb : c.reason}</span>
                <span class="tiny muted">{Object.keys(a.stim).map((k) => ATTR_LABEL[k as AttrId].toLowerCase()).join(', ')}</span>
              </button>
            );
          })}
        </Sheet>
      )}
    </div>
  );
}

/** A day's block choices; training sessions say what they train. */
function Options(props: { blocks: PlanBlock[]; value: PlanBlock | null; none?: boolean; onPick: (b: PlanBlock | null) => void }) {
  return (
    <div class="plan-options">
      {props.none && <button class="chip-btn" aria-pressed={props.value === null} onClick={() => props.onPick(null)}>Nothing</button>}
      {props.blocks.map((b) => {
        const act = b.kind === 'train' ? activityById(b.activity) : undefined;
        return (
          <button key={JSON.stringify(b)} class="chip-btn" aria-pressed={sameBlock(b, props.value)} title={act?.blurb} onClick={() => props.onPick(b)}>
            {blockLabel(b)}{act ? <span class="tiny muted"> · {Object.keys(act.stim).slice(0, 2).map((k) => ATTR_LABEL[k as AttrId].toLowerCase()).join(', ')}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function BlockButton(props: { label: string; sub: string; check: { ok: boolean; reason?: string }; onClick: () => void }) {
  return (
    <button class="btn grow" disabled={!props.check.ok} title={props.check.ok ? undefined : props.check.reason} onClick={props.onClick}>
      <div>{props.label}</div><div class="tiny muted">{props.sub}</div>
    </button>
  );
}

