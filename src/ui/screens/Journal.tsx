// Journal and tick list (17 §5): the story so far. Ticks filtered by discipline and style, the pyramid of the sends
// shown, the journal's lines, and a line to share.
import { useState } from 'preact/hooks';
import { cragDisciplines, type Climb } from '../../sim/discipline';
import type { RunState } from '../../sim/state';
import type { Tick, TickStyle } from '../../sim/types';
import { calendarDate, formatDate } from '../../sim/weather';
import { Seg, TabBar, Top } from '../components';
import { gradeAt, tickGrade } from '../format';
import { data, say } from '../store';

type Filter = 'sends' | TickStyle;
const STYLE_LABEL: Record<TickStyle, string> = { onsight: 'onsight', flash: 'flash', redpoint: 'redpoint', repeat: 'repeat' };
/** The list shows this many ticks before "Show all". */
const PAGE = 60;

const climbOf = (t: Tick): Climb => (t.discipline === 'sport' ? 'sport' : 'boulder');

export function Journal({ run }: { run: RunState }) {
  const [tab, setTab] = useState<'ticks' | 'journal'>('ticks');
  const [climb, setClimb] = useState<'all' | Climb>('all');
  const [style, setStyle] = useState<Filter>('sends');
  const [all, setAll] = useState(false);
  const here = data.crags.get(run.crag)!;
  const dayLabel = (day: number) => formatDate(calendarDate(run.start_month, run.start_dom, day));

  const climbs = (['boulder', 'sport'] as const).filter((d) => run.ticks.some((t) => climbOf(t) === d));
  const shown = run.ticks
    .filter((t) => climb === 'all' || climbOf(t) === climb)
    .filter((t) => (style === 'sends' ? t.style !== 'repeat' : t.style === style));
  // A pyramid per discipline shown, its grades in the current crag's system where it climbs that discipline.
  const pyramids = (climb === 'all' ? climbs : [climb]).map((d) => {
    const counts = new Map<number, number>();
    for (const t of shown) if (climbOf(t) === d) counts.set(Math.round(t.di), (counts.get(Math.round(t.di)) ?? 0) + 1);
    const steps = [...counts].sort((a, b) => b[0] - a[0]).slice(0, 7);
    const crag = cragDisciplines(here, data).includes(d) ? here : undefined;
    return { d, steps, crag };
  }).filter((p) => p.steps.length > 0);
  const list = [...shown].reverse();

  const share = async () => {
    const sends = run.ticks.filter((t) => t.style !== 'repeat');
    const best = (d: Climb) => sends.filter((t) => climbOf(t) === d).sort((a, b) => b.di - a.di)[0];
    const parts = climbs.map((d) => { const t = best(d)!; return `${d === 'sport' ? 'hardest route' : 'hardest boulder'} ${tickGrade(t, data)} (${t.name})`; });
    const text = `${run.name}: ${parts.join(', ') || 'no sends yet'}; ${sends.length} sends in ${run.day} days. Climbing World Traveler`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); say('Copied.'); }
    } catch {
      // The player closed the share sheet.
    }
  };

  return (
    <div class="screen">
      <Top kicker="Journal" title={run.name} right={<button class="btn small" onClick={() => void share()}>Share</button>}>
        <span class="small muted">{run.ticks.filter((t) => t.style !== 'repeat').length} sends · {run.journal.length} journal lines · day {run.day + 1}</span>
      </Top>
      <div class="scroll">
        <Seg label="Show" value={tab} onChange={setTab} options={[['ticks', 'Tick list'], ['journal', 'Journal']]} />
        {tab === 'ticks' && (
          <>
            {climbs.length > 1 && <Seg label="Discipline" value={climb} onChange={setClimb} options={[['all', 'All'], ['boulder', 'Boulders'], ['sport', 'Routes']]} />}
            <Seg label="Style" value={style} onChange={setStyle} options={[['sends', 'All sends'], ['onsight', 'Onsight'], ['flash', 'Flash'], ['redpoint', 'Redpoint'], ['repeat', 'Repeats']]} />
            {pyramids.map(({ d, steps, crag }) => {
              const most = Math.max(1, ...steps.map(([, n]) => n));
              return (
                <div key={d} class="col">
                  <span class="kicker">{pyramids.length > 1 ? (d === 'sport' ? 'Route pyramid' : 'Boulder pyramid') : 'Pyramid'}</span>
                  <div class="pyramid">
                    {steps.map(([di, n]) => (
                      <div key={di}><span class="mono small" style={{ width: '48px' }}>{gradeAt(di, d, crag)}</span><div class="bar" style={{ width: `${(n / most) * 70}%` }} /><span class="mono tiny">{n}</span></div>
                    ))}
                  </div>
                </div>
              );
            })}
            {list.length === 0 && <p class="small muted">{run.ticks.length ? 'No ticks in this filter.' : 'No ticks yet. They come with the first send.'}</p>}
            <div class="list">
              {(all ? list : list.slice(0, PAGE)).map((t, i) => {
                const crag = t.crag ? data.crags.get(t.crag) : undefined;
                const area = crag?.sectors.find((s) => s.id === t.area)?.name ?? t.area;
                return (
                  <div key={`${t.route}-${t.day}-${i}`} class="col tick">
                    <div class="row between"><span class="small">{t.name}</span><span class="small mono">{tickGrade(t, data)}</span></div>
                    <span class="tiny muted">{area}{crag && crag.id !== run.crag ? `, ${crag.name}` : ''} · {STYLE_LABEL[t.style]}{t.attempts > 1 ? `, ${t.attempts} tries` : ''} · {dayLabel(t.day)}</span>
                  </div>
                );
              })}
            </div>
            {!all && list.length > PAGE && <button class="btn small" onClick={() => setAll(true)}>Show all {list.length}</button>}
          </>
        )}
        {tab === 'journal' && (
          <div class="col">
            {[...run.journal].reverse().map((j, i) => (
              <p key={i} class={`small ${j.tone === 'good' ? 'good' : j.tone === 'bad' ? 'warn' : 'muted'}`}><span class="mono tiny">{dayLabel(j.day)}</span> {j.text}</p>
            ))}
          </div>
        )}
      </div>
      <TabBar />
    </div>
  );
}
