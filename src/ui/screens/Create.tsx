// Create Climber (16 §1, 17 §2): background → body → allocation → traits → identity, with Quick-build chips.
import { useMemo, useState } from 'preact/hooks';
import { athleteOf } from '../../sim/attempt';
import { ageMoneyBonus, ALLOC_MAX_PER_ATTR, buildAttributes, creationBudget, deriveMass, phaseLive, refFat, refMass, validateCreation } from '../../sim/character';
import { estimateBoulderDI } from '../../sim/estimate';
import { DEFAULT_OPTIONS, PRESETS, presetSpec } from '../../sim/presets';
import { stream } from '../../sim/rng';
import { createRun } from '../../sim/run';
import {
  LIFESTYLE_ATTRS, MENTAL_ATTRS, PHYSICAL_ATTRS, TECHNIQUE_ATTRS,
  type AttrId, type Body, type Difficulty, type NewRunSpec, type Trait, type TraitCategory,
} from '../../sim/types';
import { Seg, Top } from '../components';
import { ATTR_LABEL, gradeIn, isSportCrag, LATER_ATTRS, money } from '../format';
import { data, goto, meta, startRun } from '../store';

const STEPS = ['Background', 'Body', 'Allocate', 'Traits', 'Identity'];

interface Draft {
  background: string;
  body: Omit<Body, 'mass_kg' | 'tendon_robustness'>;
  shift: number;
  traits: string[];
  alloc: Partial<Record<AttrId, number>>;
  name: string;
  seed: string;
  difficulty: Difficulty;
}

const randomSeed = (): string => {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return (a[0]!.toString(36) + a[1]!.toString(36)).slice(0, 10);
};

const DEFAULT_BODY: Draft['body'] = {
  sex: 'f', age_start: 22, height_cm: 168, body_fat_pct: refFat('f'), ape_index: 1.02, finger_length: 0, finger_girth: 0, leg_torso: 0,
  natural_hip_mobility: 50, natural_shoulder_mobility: 50, fibre_bias: 0, skin_thickness: 'normal', skin_moisture: 'normal',
};

function toSpec(d: Draft): NewRunSpec {
  const tendon = Math.round(35 + 30 * stream(d.seed, 'tendon').next());
  const body: Body = { ...d.body, mass_kg: Math.round(deriveMass(d.body.sex, d.body.height_cm, d.body.body_fat_pct, d.shift) * 10) / 10, tendon_robustness: tendon };
  return {
    name: d.name.trim() || 'Climber', background: d.background, body, traits: d.traits, attr_alloc: d.alloc,
    options: { ...DEFAULT_OPTIONS, difficulty: d.difficulty },
  };
}

function fromPreset(id: string, seed: string): Draft {
  const p = presetSpec(id);
  const shift = Math.round((p.body.mass_kg - deriveMass(p.body.sex, p.body.height_cm, p.body.body_fat_pct, 0)) * 2) / 2;
  const { mass_kg: _m, tendon_robustness: _t, ...body } = p.body;
  return { background: p.background, body, shift, traits: p.traits, alloc: p.attr_alloc, name: p.name, seed, difficulty: 'standard' };
}

export function effectText(t: Trait): string[] {
  const e = t.effect;
  const out: string[] = [];
  for (const [k, v] of Object.entries(e.attr_add ?? {})) out.push(`${ATTR_LABEL[k as AttrId].toLowerCase()} ${v > 0 ? '+' : '−'}${Math.abs(v)}`);
  for (const [k, v] of Object.entries(e.ceiling_add ?? {})) out.push(`${ATTR_LABEL[k as AttrId].toLowerCase()} ceiling ${v > 0 ? '+' : '−'}${Math.abs(v)}`);
  for (const [k, v] of Object.entries(e.hold_mult ?? {})) out.push(`${k.replace('_', ' ')} ×${v}`);
  for (const [k, v] of Object.entries(e.move_mult ?? {})) out.push(`${k.replace('_', ' ')} ×${v}`);
  if (e.fear_add) out.push(`fear ${e.fear_add > 0 ? '+' : '−'}${Math.abs(e.fear_add)}`);
  if (e.cost_mult) out.push(`living costs ×${e.cost_mult}`);
  for (const f of e.flags ?? []) {
    if (f.startsWith('reach_mult=')) out.push(`reach ×${f.split('=')[1]}`);
    if (f.startsWith('familiarity_k_mult=')) out.push('learns problems faster');
  }
  return out;
}

export function Create(props: { seed?: string | undefined; preset?: string | undefined }) {
  const unlocked = new Set(meta.value.unlocks);
  const [step, setStep] = useState(props.preset ? 4 : 0);
  const [d, setD] = useState<Draft>(() => {
    const seed = props.seed ?? randomSeed();
    if (props.preset) return fromPreset(props.preset, seed);
    return { background: 'gym_comp_kid', body: { ...DEFAULT_BODY, age_start: 19 }, shift: 0, traits: ['gym_kid'], alloc: {}, name: '', seed, difficulty: 'standard' };
  });
  const [cat, setCat] = useState<TraitCategory | 'all'>('all');
  const patch = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const patchBody = (p: Partial<Draft['body']>) => setD((x) => ({ ...x, body: { ...x.body, ...p } }));

  const spec = useMemo(() => toSpec(d), [d]);
  const ctx = { traits: data.traits, backgrounds: data.backgrounds, unlocked };
  const budget = creationBudget(spec, ctx);
  const errors = validateCreation(spec, ctx);
  const bg = data.backgrounds.get(d.background)!;
  const startCrag = data.crags.get(bg.start_crag);
  const startSport = !!startCrag && isSportCrag(startCrag);
  const attrs = useMemo(() => buildAttributes(spec, ctx), [spec]);
  const backgrounds = [...data.backgrounds.values()].filter((b) => phaseLive(b.phase));
  const presets = PRESETS.filter((p) => { const b = data.backgrounds.get(p.spec.background); return !b?.unlock || unlocked.has(b.unlock); });

  const pickBackground = (id: string) => {
    const b = data.backgrounds.get(id)!;
    const age = Math.min(b.age_range[1], Math.max(b.age_range[0], d.body.age_start));
    const keep = d.traits.filter((t) => !data.backgrounds.get(d.background)!.forced_traits.includes(t) && !b.locked_traits.includes(t));
    patch({ background: id, traits: [...new Set([...b.forced_traits, ...keep])], alloc: {}, body: { ...d.body, age_start: age } });
  };

  const toggleTrait = (id: string) => {
    if (bg.forced_traits.includes(id)) return;
    patch({ traits: d.traits.includes(id) ? d.traits.filter((t) => t !== id) : [...d.traits, id] });
  };

  const setAlloc = (id: AttrId, v: number) => {
    const others = budget.allocUsed - (d.alloc[id] ?? 0);
    const clamped = Math.max(0, Math.min(ALLOC_MAX_PER_ATTR, Math.min(v, budget.allocTotal - others)));
    const next = { ...d.alloc };
    if (clamped === 0) delete next[id]; else next[id] = clamped;
    patch({ alloc: next });
  };

  const estimate = useMemo(() => {
    if (step !== 4 || errors.length) return null;
    try {
      const run = createRun(d.seed, spec, data);
      return estimateBoulderDI(athleteOf(run, data), run.crag, data);
    } catch {
      return null;
    }
  }, [step, spec, errors.length]);

  const stepErrors = step === 3 ? errors.filter((e) => /trait|budget|refund|conflict|negative|fit/i.test(e)) : step === 2 ? errors.filter((e) => /Allocat|attribute/i.test(e)) : [];

  return (
    <div class="screen">
      <Top kicker={`New climber · step ${step + 1} of 5`} right={<><span class="pill">pts <span class={budget.left < 0 ? 'warn' : 'accent'}>{budget.left}</span></span><span class="pill">{money((bg.money_start + ageMoneyBonus(d.body.age_start)) * (d.difficulty === 'story' ? 1.5 : d.difficulty === 'hard' ? 0.75 : 1))}</span></>}>
        <div class="steps">{STEPS.map((_, i) => <div key={i} class={i <= step ? 'on' : ''} />)}</div>
      </Top>
      <div class="scroll">
        {step === 0 && (
          <>
            <h1>Where did you come from?</h1>
            <p class="muted small">Your background sets trait points, money, starting attributes and one trait you can't refuse. Everyone starts in Fontainebleau.</p>
            <div class="row wrap">
              {presets.map((p) => (
                <button key={p.id} class="chip-btn" onClick={() => { setD(fromPreset(p.id, d.seed)); setStep(4); }}>Quick: {p.name}</button>
              ))}
            </div>
            {backgrounds.map((b) => {
              const locked = !!b.unlock && !unlocked.has(b.unlock);
              const sel = b.id === d.background;
              return (
                <button key={b.id} class={`card ${sel ? 'selected' : ''} ${locked ? 'dim' : ''}`} disabled={locked} onClick={() => pickBackground(b.id)}>
                  <div class="row between"><span class="card-title">{b.name}</span><span class="mono tiny muted">+{b.point_bonus} pts · {money(b.money_start)}</span></div>
                  <span class="small soft">{locked ? 'Finish any run to unlock.' : b.hook}</span>
                  {sel && (
                    <div class="row wrap">
                      {Object.entries(b.attr_add).map(([k, v]) => <span key={k} class="chip">{ATTR_LABEL[k as AttrId].toLowerCase()} {v > 0 ? '+' : '−'}{Math.abs(v)}</span>)}
                      {b.forced_traits.map((t) => <span key={t} class="chip accent">forced: {data.traits.get(t)?.name ?? t}</span>)}
                      <span class="chip">age {b.age_range[0]}–{b.age_range[1]}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </>
        )}

        {step === 1 && <BodyStep d={d} bgAge={bg.age_range} patchBody={patchBody} patch={patch} />}

        {step === 2 && (
          <>
            <h1>Where the hours went</h1>
            <p class="muted small">Spend {budget.allocTotal} points on what you have already trained. At most +{ALLOC_MAX_PER_ATTR} in one attribute. <span class="mono accent">{budget.allocTotal - budget.allocUsed} left</span></p>
            {([['Physical', PHYSICAL_ATTRS], ['Technique', TECHNIQUE_ATTRS], ['Mental', MENTAL_ATTRS], ['Lifestyle', LIFESTYLE_ATTRS]] as const).map(([label, ids]) => (
              <div key={label} class="col">
                <h2>{label}</h2>
                {ids.filter((id) => !LATER_ATTRS.includes(id)).map((id) => (
                  <div key={id} class="row between">
                    <div class="grow"><div class="small">{ATTR_LABEL[id]}</div><div class="tiny muted mono">{Math.round(attrs[id].value)} / {Math.round(attrs[id].ceiling)}</div></div>
                    <div class="stepper">
                      <button aria-label={`Less ${ATTR_LABEL[id]}`} onClick={() => setAlloc(id, (d.alloc[id] ?? 0) - 5)}>−</button>
                      <span class="mono" style={{ minWidth: '28px', textAlign: 'center' }}>{d.alloc[id] ?? 0}</span>
                      <button aria-label={`More ${ATTR_LABEL[id]}`} onClick={() => setAlloc(id, (d.alloc[id] ?? 0) + 5)}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

        {step === 3 && (
          <>
            <div class="card">
              <div class="row between"><span class="card-title">Trait points</span><span class={`mono ${budget.left < 0 ? 'warn' : 'accent'}`} style={{ fontSize: '22px' }}>{budget.left}</span></div>
              <span class="tiny muted mono">background +{budget.bonus} · refunds +{budget.refunds} / 12 cap · spent −{budget.spent} · traits {budget.traitCount} / 12</span>
              <span class="tiny muted">Unspent points are lost when the run starts.</span>
            </div>
            <Seg label="Trait category" value={cat} onChange={setCat} options={[['all', 'All'], ['body', 'Body'], ['aptitude', 'Aptitude'], ['mental', 'Mental'], ['history', 'History'], ['health', 'Health'], ['quirk', 'Quirk']]} />
            {[...data.traits.values()]
              .filter((t) => phaseLive(t.phase) && (t.kind === 'creation' || t.kind === 'evolving') && (cat === 'all' || t.category === cat))
              .filter((t) => !bg.locked_traits.includes(t.id))
              .sort((a, b) => Number(d.traits.includes(b.id)) - Number(d.traits.includes(a.id)) || b.cost - a.cost)
              .map((t) => {
                const on = d.traits.includes(t.id);
                const forced = bg.forced_traits.includes(t.id);
                const conflict = !on && t.excludes.find((x) => d.traits.includes(x));
                const ageBad = t.requires_age && (d.body.age_start < t.requires_age[0] || d.body.age_start > t.requires_age[1]);
                return (
                  <button key={t.id} class={`card ${on ? 'selected' : ''} ${conflict || ageBad ? 'dim' : ''}`} disabled={forced || !!conflict || !!ageBad} onClick={() => toggleTrait(t.id)}>
                    <div class="row between"><span class="card-title">{t.name}</span><span class={`mono small ${t.cost > 0 ? 'accent' : t.cost < 0 ? 'good' : 'muted'}`}>{forced ? 'bg' : t.cost > 0 ? `+${t.cost}` : t.cost < 0 ? `−${-t.cost}` : '0'}</span></div>
                    <span class="small soft">{conflict ? `Conflicts with ${data.traits.get(conflict)?.name}` : ageBad ? `Needs a starting age of ${t.requires_age![0]}–${t.requires_age![1]}` : effectText(t).join(' · ') || t.flavour}</span>
                    {!conflict && !ageBad && effectText(t).length > 0 && <span class="tiny muted">“{t.flavour}”</span>}
                  </button>
                );
              })}
          </>
        )}

        {step === 4 && (
          <>
            <h1>Who are you?</h1>
            <label class="col small">Name<input class="text-input" value={d.name} maxLength={24} placeholder="Climber" onInput={(e) => patch({ name: (e.target as HTMLInputElement).value })} /></label>
            <label class="col small">Run seed<input class="text-input mono" value={d.seed} maxLength={24} onInput={(e) => patch({ seed: (e.target as HTMLInputElement).value.replace(/[^a-zA-Z0-9_-]/g, '') || randomSeed() })} /></label>
            <span class="tiny muted">Same seed, same choices: the same weather and the same problems.</span>
            <div class="col small">Difficulty<Seg label="Difficulty" value={d.difficulty} onChange={(v) => patch({ difficulty: v })} options={[['story', 'Story'], ['standard', 'Standard'], ['hard', 'Hard']]} /></div>
            <span class="tiny muted">Death is off in this version: boulders over pads and bolted routes cannot kill you.</span>
            <div class="card">
              <div class="row between"><span class="card-title">{bg.name}</span><span class="mono small">{d.body.sex === 'f' ? 'F' : 'M'} · {d.body.age_start} · {d.body.height_cm} cm</span></div>
              <span class="small soft">{d.traits.map((t) => data.traits.get(t)?.name ?? t).join(' · ')}</span>
              <span class="small">{startSport ? 'Route' : 'Boulder'} estimate: <span class="accent mono">{estimate === null ? '—' : gradeIn(estimate, startSport)}</span> <span class="tiny muted">({startCrag?.name ?? '—'})</span></span>
            </div>
          </>
        )}
        {(step === 4 ? errors : stepErrors).map((e) => <p key={e} class="small warn">{e}</p>)}
      </div>
      <div class="cta-bar">
        <button class="cta secondary" onClick={() => (step === 0 ? goto({ name: 'title' }) : setStep(step - 1))}>Back</button>
        {step < 4
          ? <button class="cta" disabled={stepErrors.length > 0} onClick={() => setStep(step + 1)}>Next: {STEPS[step + 1]}</button>
          : <button class="cta" disabled={errors.length > 0} onClick={() => startRun(d.seed, spec)}>Start</button>}
      </div>
    </div>
  );
}

function Slider(props: { label: string; value: number; min: number; max: number; step: number; fmt?: (v: number) => string; note?: string; onInput: (v: number) => void }) {
  return (
    <label class="slider">
      <div class="row between small"><span>{props.label}</span><span class="mono accent">{props.fmt ? props.fmt(props.value) : props.value}</span></div>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onInput={(e) => props.onInput(Number((e.target as HTMLInputElement).value))} />
      {props.note && <span class="tiny muted">{props.note}</span>}
    </label>
  );
}

function BodyStep(props: { d: Draft; bgAge: [number, number]; patchBody: (p: Partial<Draft['body']>) => void; patch: (p: Partial<Draft>) => void }) {
  const b = props.d.body;
  const mass = deriveMass(b.sex, b.height_cm, b.body_fat_pct, props.d.shift);
  const bmi = mass / (b.height_cm / 100) ** 2;
  const ref = refMass(b.sex, b.height_cm);
  return (
    <>
      <h1>Your body</h1>
      <p class="mono small soft">{b.height_cm} cm · {mass.toFixed(1)} kg · BMI {bmi.toFixed(1)} · age {b.age_start}</p>
      <p class="tiny muted">Body is a modifier. Training does the heavy lifting.</p>
      <Seg label="Sex" value={b.sex} onChange={(v) => props.patchBody({ sex: v, body_fat_pct: refFat(v) })} options={[['f', 'Female'], ['m', 'Male']]} />
      <Slider label="Starting age" value={b.age_start} min={props.bgAge[0]} max={props.bgAge[1]} step={1} onInput={(v) => props.patchBody({ age_start: v })} note="Older starts bring money and composure; power ceilings fall from 28." />
      <Slider label="Height" value={b.height_cm} min={150} max={200} step={1} fmt={(v) => `${v} cm`} onInput={(v) => props.patchBody({ height_cm: v })} note="Taller reaches more on vertical rock; shorter carries less weight on steep rock. About 1% of grade variance." />
      <Slider label="Ape index" value={b.ape_index} min={0.95} max={1.1} step={0.01} fmt={(v) => v.toFixed(2)} onInput={(v) => props.patchBody({ ape_index: v })} note="Elite climbers average 1.06; national level 1.03. Helps on overhangs, a little worse on slab." />
      <Slider label="Body fat" value={b.body_fat_pct} min={b.sex === 'f' ? 12 : 6} max={b.sex === 'f' ? 32 : 24} step={1} fmt={(v) => `${v}%`} onInput={(v) => props.patchBody({ body_fat_pct: v })} />
      <Slider label="Build" value={props.d.shift} min={-6} max={6} step={0.5} fmt={(v) => `${v >= 0 ? '+' : ''}${v} kg`} onInput={(v) => props.patch({ shift: v })} note={`Reference mass for your height: ${ref.toFixed(1)} kg. Extra mass costs you on dynos and roofs.`} />
      <div class="col small">Finger length<Seg label="Finger length" value={b.finger_length} onChange={(v) => props.patchBody({ finger_length: v })} options={[[-2, '−2'], [-1, '−1'], [0, '0'], [1, '+1'], [2, '+2']]} /><span class="tiny muted">Long: pockets and slopers better, crimps worse.</span></div>
      <div class="col small">Finger girth<Seg label="Finger girth" value={b.finger_girth} onChange={(v) => props.patchBody({ finger_girth: v })} options={[[-2, '−2'], [-1, '−1'], [0, '0'], [1, '+1'], [2, '+2']]} /><span class="tiny muted">Thick fingers struggle in small pockets.</span></div>
      <div class="col small">Legs to torso<Seg label="Leg to torso" value={b.leg_torso} onChange={(v) => props.patchBody({ leg_torso: v })} options={[[-2, '−2'], [-1, '−1'], [0, '0'], [1, '+1'], [2, '+2']]} /><span class="tiny muted">Long legs: high steps and heel hooks; short: roofs.</span></div>
      <Slider label="Natural hip mobility" value={b.natural_hip_mobility} min={20} max={90} step={5} fmt={(v) => `${v} → ceiling ${Math.round(40 + 0.6 * v)}`} onInput={(v) => props.patchBody({ natural_hip_mobility: v })} />
      <Slider label="Natural shoulder mobility" value={b.natural_shoulder_mobility} min={20} max={90} step={5} fmt={(v) => `${v} → ceiling ${Math.round(40 + 0.6 * v)}`} onInput={(v) => props.patchBody({ natural_shoulder_mobility: v })} />
      <Slider label="Fibre bias" value={b.fibre_bias} min={-1} max={1} step={0.1} fmt={(v) => (v > 0 ? `+${v.toFixed(1)} power` : v < 0 ? `${v.toFixed(1)} endurance` : 'even')} onInput={(v) => props.patchBody({ fibre_bias: v })} />
      <div class="col small">Skin<Seg label="Skin" value={b.skin_thickness} onChange={(v) => props.patchBody({ skin_thickness: v })} options={[['thin', 'Thin'], ['normal', 'Normal'], ['thick', 'Thick']]} /><span class="tiny muted">Thin skin grips slopers better and tears sooner.</span></div>
      <div class="col small">Hands<Seg label="Hands" value={b.skin_moisture} onChange={(v) => props.patchBody({ skin_moisture: v })} options={[['dry', 'Dry'], ['normal', 'Normal'], ['sweaty', 'Sweaty']]} /><span class="tiny muted">Sweaty hands want cold days; dry hands like a little warmth.</span></div>
      <p class="tiny muted">Tendon robustness is hidden. Your pulleys will tell you.</p>
    </>
  );
}
