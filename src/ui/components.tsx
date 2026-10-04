import type { ComponentChildren } from 'preact';
import { goto, screen } from './store';
import type { CircuitColour } from '../sim/types';

export function Meter(props: { label: string; value: number; max?: number; colour?: string; band?: [number, number]; right?: string }) {
  const max = props.max ?? 100;
  const w = Math.max(0, Math.min(100, (props.value / max) * 100));
  return (
    <div class="meter">
      <div class="meter-label"><span>{props.label}</span><span class="mono">{props.right ?? Math.round(props.value)}</span></div>
      <div class="meter-track" role="meter" aria-label={props.label} aria-valuenow={Math.round(props.value)} aria-valuemin={0} aria-valuemax={max}>
        {props.band && <div class="meter-band" style={{ left: `${props.band[0]}%`, width: `${Math.max(0, props.band[1] - props.band[0])}%` }} />}
        <div class="meter-fill" style={{ width: `${w}%`, background: props.colour ?? 'var(--sky)' }} />
      </div>
    </div>
  );
}

export function Circuit({ c }: { c?: CircuitColour | undefined }) {
  if (!c) return null;
  return <span class={`circuit c-${c}`} title={`${c} circuit`} />;
}

export function Top(props: { kicker?: string; title?: string; right?: ComponentChildren; children?: ComponentChildren }) {
  return (
    <div class="top">
      {(props.kicker || props.right) && (
        <div class="top-row">
          <div class="kicker">{props.kicker}</div>
          <div class="row">{props.right}</div>
        </div>
      )}
      {props.title && <h1>{props.title}</h1>}
      {props.children}
    </div>
  );
}

export function TabBar() {
  const s = screen.value.name;
  const tabs: [string, string, () => void][] = [
    ['planner', 'Planner', () => goto({ name: 'planner' })],
    ['crag', 'Crag', () => goto({ name: 'crag' })],
    ['character', 'Climber', () => goto({ name: 'character' })],
    ['journal', 'Journal', () => goto({ name: 'journal' })],
    ['title', 'Menu', () => goto({ name: 'title' })],
  ];
  return (
    <nav class="tabbar" aria-label="Main">
      {tabs.map(([id, label, go]) => (
        <button key={id} aria-current={s === id || (id === 'crag' && s === 'routes') ? 'page' : undefined} onClick={go}>{label}</button>
      ))}
    </nav>
  );
}

export function Seg<T extends string | number>(props: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div class="seg" role="group" aria-label={props.label}>
      {props.options.map(([v, l]) => (
        <button key={String(v)} aria-pressed={props.value === v} onClick={() => props.onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

export function Sheet(props: { onClose: () => void; children: ComponentChildren; label: string }) {
  return (
    <div class="sheet-backdrop" onClick={props.onClose}>
      <div class="sheet" role="dialog" aria-label={props.label} onClick={(e) => e.stopPropagation()}>{props.children}</div>
    </div>
  );
}
