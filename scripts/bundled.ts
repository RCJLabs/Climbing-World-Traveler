// Run a script from one bundled file (docs/19 §1): `tsx scripts/bundled.ts scripts/harness.ts --n 40 …`.
// Under tsx every module is transformed on its own, and the helpers it adds (module getters, function names) cost
// a harness career about a quarter of its time; one esbuild bundle has none. The bundle goes to
// node_modules/.cache/cwt and runs under plain node with the remaining arguments; its exit code is this script's.
import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';
import { build } from 'esbuild';

const [entry, ...rest] = process.argv.slice(2);
if (!entry) throw new Error('usage: tsx scripts/bundled.ts <script.ts> [args…]');
const outfile = `node_modules/.cache/cwt/${basename(entry, '.ts')}.mjs`;
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', target: 'node22', outfile, logLevel: 'warning' });
const r = spawnSync(process.execPath, [outfile, ...rest], { stdio: 'inherit' });
process.exit(r.status ?? 1);
