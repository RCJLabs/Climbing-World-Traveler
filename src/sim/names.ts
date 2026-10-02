// Crag-flavoured route names (docs/06 §2.9). Fictional, never people's names.
import type { Rng } from './rng';
import type { NameBank } from './types';

export function routeName(bank: NameBank | undefined, rng: Rng): string {
  if (!bank) return `Problème ${rng.int(1, 99)}`;
  const fem = rng.bool(0.45);
  const noun = fem ? rng.pick(bank.fem) : rng.pick(bank.masc);
  const art = fem ? 'La' : 'Le';
  const elide = /^[AEIOUÉÈHaeiouéè]/.test(noun);
  const article = elide ? "L'" : `${art} `;
  const adj = fem ? rng.pick(bank.adj_fem) : rng.pick(bank.adj_masc);
  switch (rng.int(0, 3)) {
    case 0: return `${article}${noun}`;
    case 1: return `${article}${noun} du ${rng.pick(bank.place)}`;
    case 2: return `${article}${noun} ${adj}`;
    default: return `${article}${noun} ${rng.pick(bank.suffix)}`;
  }
}
