// The size gate (27 M1, 18 §7), run after `pnpm build`: every file the service worker precaches stays under Workbox's
// 2 MiB limit, the initial JS (the entry module and what index.html preloads) under 250 kB gzipped, and every crag's
// route chunk under 150 kB gzipped; each crag folder has its own chunk. kB are 1,000 bytes, as Vite prints them;
// gzip at zlib's default level.  pnpm size [--dist dist]
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { cragIds } from '../src/data/bundle';

const BUDGET = { precachedRaw: 2 * 1024 * 1024, initialGz: 250_000, cragGz: 150_000 };
/** What vite.config.ts's Workbox `globPatterns` precaches. */
const PRECACHED = /\.(js|css|html|svg|json)$/;

const args = process.argv.slice(2);
const dist = args.includes('--dist') ? args[args.indexOf('--dist') + 1]! : 'dist';
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : [join(dir, d.name)]));
const all = files(dist).map((path) => {
  const bytes = readFileSync(path);
  return { path: relative(dist, path), raw: bytes.length, gz: gzipSync(bytes).length };
});
const kb = (n: number) => `${(n / 1000).toFixed(1)} kB`;
const failures: string[] = [];
const rows: string[] = [];

// The initial JS: index.html's module scripts and module preloads, with the base path the build was made for stripped.
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const refs = [...html.matchAll(/<(?:script[^>]*type="module"[^>]*src|link[^>]*rel="modulepreload"[^>]*href)="([^"]+)"/g)].map((m) => m[1]!);
const initial = all.filter((f) => refs.some((r) => r.endsWith(`/${f.path}`) || r === f.path));
if (!initial.length) failures.push('no entry module found in index.html');
const initialGz = initial.reduce((a, f) => a + f.gz, 0);
rows.push(`initial JS ${initial.map((f) => f.path).join(' + ')}: ${kb(initialGz)} gz (budget ${kb(BUDGET.initialGz)})`);
if (initialGz > BUDGET.initialGz) failures.push(`initial JS is ${kb(initialGz)} gzipped, over ${kb(BUDGET.initialGz)}`);

// Each crag's routes, one chunk per crag folder.
for (const id of cragIds()) {
  const chunk = all.filter((f) => new RegExp(`^assets/routes-${id}-[\\w-]+\\.js$`).test(f.path));
  if (chunk.length !== 1) { failures.push(`crag ${id}: ${chunk.length} route chunks, want 1`); continue; }
  const c = chunk[0]!;
  rows.push(`crag ${id} ${c.path}: ${kb(c.raw)} raw, ${kb(c.gz)} gz (budget ${kb(BUDGET.cragGz)})`);
  if (c.gz > BUDGET.cragGz) failures.push(`crag ${id}: its route chunk is ${kb(c.gz)} gzipped, over ${kb(BUDGET.cragGz)}`);
}

// Workbox skips any precached file over its limit, silently: the app would then fail offline.
for (const f of all.filter((x) => PRECACHED.test(x.path))) {
  if (f.raw > BUDGET.precachedRaw) failures.push(`${f.path} is ${kb(f.raw)} raw, over Workbox's 2 MiB precache limit`);
}
const precached = all.filter((x) => PRECACHED.test(x.path));
rows.push(`precached ${precached.length} files, ${kb(precached.reduce((a, f) => a + f.raw, 0))} raw; largest ${precached.sort((a, b) => b.raw - a.raw)[0]?.path} (limit 2 MiB each)`);

for (const r of rows) console.log(r);
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) process.exit(1);
console.log('size OK');
