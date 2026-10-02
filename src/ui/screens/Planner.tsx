// Day Planner (11 §1, 17 §2): weather and conditions, today's blocks, resources, yesterday, end the day.
import { useState } from 'preact/hooks';
import { athleteOf } from '../../sim/attempt';
import { canStartBlock, dailyCost, dateLabel, energyCap } from '../../sim/run';
import type { RunState } from '../../sim/state';
import { ACTIVITIES, acwr, acwrLabel } from '../../sim/training';
import type { AttrId, BlockKind } from '../../sim/types';
import { calendarDate, conditionsLabel, DAYS_IN_MONTH, nextWeather, sectorStatus, sessionConditions, type DayWeather } from '../../sim/weather';
import { Meter, Sheet, TabBar, Top } from '../components';
import { ATTR_LABEL, money } from '../format';
import { act, data, goto } from '../store';

const SKY: Record<DayWeather['sky'], string> = { clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', storm: 'Storm' };

function frictionWord(run: RunState): string {
  const crag = data.crags.get(run.crag)!;
  const sunny = crag.sectors.find((s) => !s.shade) ?? crag.sectors[0]!;
  return conditionsLabel(sessionConditions(athleteOf(run, data), run.weather, sunny, 100, run.options.difficulty));
}

export function Planner({ run }: { run: RunState }) {
  const [train, setTrain] = useState(false);
  const crag = data.crags.get(run.crag)!;
  const date = calendarDate(run.start_month, run.start_dom, run.day);
  const tomorrowDate = calendarDate(run.start_month, run.start_dom, run.day + 1);
  const tomorrow = nextWeather(run.seed, crag, run.weather, run.day + 1, tomorrowDate.month, run.options.difficulty);
  const open = crag.sectors.filter((s) => sectorStatus(s, run.weather, run.last_rain).open).length;
  const w = run.weather;
  const ratio = acwr(run.counters.loads);
  const onBreak = run.day < run.counters.forced_break_until;
  const check = (k: BlockKind, target?: string) => canStartBlock(run, k, target, data);
  const climbCheck = open ? check('climb', crag.sectors.find((s) => sectorStatus(s, run.weather, run.last_rain).open)!.id) : { ok: false as const, reason: 'Every sector is wet.' };
  const blockNames: Record<BlockKind, string> = { climb: 'Climb', train: 'Train', rest: 'Rest', active_recovery: 'Recover', work: 'Odd job' };
  const gains = Object.entries(run.yesterday?.gains ?? {}).filter(([, v]) => (v ?? 0) >= 0.05).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 6);

  return (
    <div class="screen">
      <Top kicker={`Day ${run.day + 1} · year ${date.year + 1}`} right={<span class={`pill ${run.res.money < 0 ? 'warn' : ''}`}>{money(run.res.money)}</span>}>
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
          <span class="small">{open === crag.sectors.length ? 'Every sector is dry.' : open === 0 ? 'The forest is shut: wet sandstone breaks.' : `${open} of ${crag.sectors.length} sectors dry.`}</span>
          <span class="tiny muted">Tomorrow: {SKY[tomorrow.sky].toLowerCase()}, {Math.round(tomorrow.t_max)} °C. Season {['off', 'poor', 'fair', 'prime'][crag.season[date.month] ?? 0]} in {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][date.month]} ({DAYS_IN_MONTH[date.month]} days).</span>
        </div>

        {onBreak && <p class="small warn">Forced break for burnout until day {run.counters.forced_break_until + 1}. Rest, recover or work.</p>}

        <h2>Today · {run.blocks_today.length} of 2 blocks</h2>
        {run.blocks_today.length > 0 && <p class="small soft">{run.blocks_today.map((b) => blockNames[b]).join(' → ')}</p>}
        {run.today.notes.length > 0 && <p class="tiny muted">{run.today.notes.join(' ')}</p>}
        <div class="list">
          <button class="card" disabled={!climbCheck.ok} onClick={() => goto({ name: 'crag' })}>
            <div class="row between"><span class="card-title">Climb</span><span class="mono tiny muted">energy −10 + attempts</span></div>
            <span class="small soft">{climbCheck.ok ? 'Pick a sector and a problem.' : climbCheck.reason}</span>
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
        </div>

        <div class="meters">
          <Meter label="Energy" value={run.res.energy} right={`${Math.round(run.res.energy)}/${Math.round(energyCap(run))}`} colour="var(--good)" />
          <Meter label="Skin" value={run.res.skin} colour="#E2B9A0" />
          <Meter label="Stoke" value={run.res.stoke} colour="var(--accent)" />
          <Meter label="Burnout" value={run.res.burnout} colour="var(--warn)" />
        </div>
        <p class="tiny muted">Training load: {acwrLabel(ratio)}{ratio !== null ? ` (${ratio.toFixed(2)})` : ''}. Living costs {money(dailyCost(run, data))} a day.</p>

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
        <button class="cta" onClick={() => act({ t: 'end_day' })}>End day</button>
      </div>
      <TabBar />
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

function BlockButton(props: { label: string; sub: string; check: { ok: boolean; reason?: string }; onClick: () => void }) {
  return (
    <button class="btn grow" disabled={!props.check.ok} title={props.check.ok ? undefined : props.check.reason} onClick={props.onClick}>
      <div>{props.label}</div><div class="tiny muted">{props.sub}</div>
    </button>
  );
}
