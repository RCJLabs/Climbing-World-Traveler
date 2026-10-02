// Seeded randomness (docs/18 §4). sfc32 generator, cyrb53 string hash, purpose-named streams.
// Nothing in src/sim may call Math.random.

/** cyrb53: 53-bit string hash. Deterministic across platforms. */
export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Short stable hex id from parts. */
export function hashId(...parts: (string | number)[]): string {
  return cyrb53(parts.join('|')).toString(36);
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number;
  /** Integer in [lo, hi]. */
  int(lo: number, hi: number): number;
  /** Standard normal via Box–Muller. */
  normal(mean?: number, sd?: number): number;
  /** Pick by weight from a record. */
  weighted<K extends string>(weights: Partial<Record<K, number>>): K;
  pick<T>(items: readonly T[]): T;
  /** Triangular distribution. */
  triangular(min: number, mode: number, max: number): number;
  bool(p: number): boolean;
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** A stream seeded from any parts (run seed, purpose, context indices). */
export function stream(...parts: (string | number)[]): Rng {
  const key = parts.join('|');
  const h1 = cyrb53(key, 1);
  const h2 = cyrb53(key, 2);
  const raw = sfc32(h1 >>> 0, (h1 / 4294967296) >>> 0, h2 >>> 0, (h2 / 4294967296) >>> 0);
  for (let i = 0; i < 12; i++) raw();
  let spare: number | null = null;
  const rng: Rng = {
    next: raw,
    range: (lo, hi) => lo + (hi - lo) * raw(),
    int: (lo, hi) => lo + Math.floor(raw() * (hi - lo + 1)),
    normal: (mean = 0, sd = 1) => {
      if (spare !== null) {
        const s = spare;
        spare = null;
        return mean + sd * s;
      }
      let u = 0;
      while (u === 0) u = raw();
      const v = raw();
      const mag = Math.sqrt(-2 * Math.log(u));
      spare = mag * Math.sin(2 * Math.PI * v);
      return mean + sd * mag * Math.cos(2 * Math.PI * v);
    },
    weighted: <K extends string>(weights: Partial<Record<K, number>>): K => {
      const entries = Object.entries(weights) as [K, number][];
      const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
      if (total <= 0) throw new Error('weighted(): no positive weights');
      let x = raw() * total;
      for (const [k, w] of entries) {
        x -= Math.max(0, w);
        if (x < 0) return k;
      }
      return entries[entries.length - 1]![0];
    },
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('pick(): empty');
      return items[Math.floor(raw() * items.length)]!;
    },
    triangular: (min, mode, max) => {
      const u = raw();
      const c = (mode - min) / (max - min);
      return u < c ? min + Math.sqrt(u * (max - min) * (mode - min)) : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
    },
    bool: (p) => raw() < p,
  };
  return rng;
}
