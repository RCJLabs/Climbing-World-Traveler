// Real people never appear in the content (CLAUDE.md, schemas §9 rule 8): the validator checks every string in the data
// against data/real_names.json, a list of real climbers' names, as whole words, ignoring case, accents and punctuation.
// Ids are strings too, so `sig_first_last` is caught as well as prose. Route and crag names are real geography and are
// checked like everything else: a real route named after a person would need its name changed or the rule revisited.
import type { DataBundle } from '../sim/types';

/** Lower case, accents and punctuation gone, one space between words and one at each end. */
const norm = (s: string): string =>
  ` ${s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

/** All the authored and generated content in a bundle, as one tree of plain values. */
export const contentOf = (b: DataBundle): Record<string, unknown> => ({
  traits: [...b.traits.values()], backgrounds: [...b.backgrounds.values()], crags: [...b.crags.values()],
  profiles: [...b.profiles.values()], names: b.names, travel: b.travel, signatures: [...b.signatures.values()],
  benchmarks: Object.fromEntries(b.benchmarks),
});

/** Every string under `value` that names someone on the list, as `path: names <name>`. */
export function realNameHits(value: unknown, names: readonly string[], path = 'data'): string[] {
  const list = names.map((n) => [n, norm(n)] as const);
  const out: string[] = [];
  const walk = (v: unknown, p: string): void => {
    if (typeof v === 'string') {
      const text = norm(v);
      for (const [name, key] of list) if (text.includes(key)) out.push(`${p}: names ${name}`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${p}.${k}`);
  };
  walk(value, path);
  return out;
}
