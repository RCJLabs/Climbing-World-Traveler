// Archive a save as a player's backend would hold it, for the carry-forward tests (27 §4: every reducer step ships an
// adapter with a test on an archived save of the version before). Run it in a checkout of the version being archived,
// before the reducer changes: `git worktree add ../prev origin/main`, link node_modules, then
// `npx tsx scripts/dev/archive-save.ts <out.json>` there. It plays a run at its start crag, travels, plays on, and
// stops mid-session so the log has a tail after the newest snapshot.
import { writeFileSync } from 'node:fs';
import { loadBundle } from '../../src/data/bundle';
import { MemoryBackend } from '../../src/save/backend';
import { RunSession } from '../../src/save/session';
import { DEFAULT_OPTIONS, presetSpec } from '../../src/sim/presets';
import { REDUCER_VERSION, type RunState } from '../../src/sim/state';
import { nextPlannedAction, simulateDays } from '../../src/sim/tactics';

const out = process.argv[2] ?? `v${REDUCER_VERSION}-kalymnos.json`;
const bundle = loadBundle();
const backend = new MemoryBackend();
const now = new Date('2026-10-04T09:00:00Z');
const spec = { ...presetSpec('dirtbag', DEFAULT_OPTIONS), name: 'Ana' };
const s = await RunSession.create(backend, bundle, `archive-v${REDUCER_VERSION}`, spec, now);
await s.simulate((d) => simulateDays(d, bundle, 24), now);
await s.dispatch({ t: 'travel', to: 'kalymnos' }, now);
await s.simulate((d) => simulateDays(d, bundle, 16), now);
// A few actions into the next day: the tail the newest snapshot does not hold.
for (let k = 0; k < 3; k++) {
  const a = nextPlannedAction(s.state, bundle);
  if (a.t === 'end_day') break;
  await s.dispatch(a, now);
}
const record = (await backend.getRun(s.id))!;
const chunks = await backend.getChunks(s.id, 0);
// The backend keeps its snapshots private; an archive holds them as the backend does.
const snaps = (backend as unknown as { snaps: Map<string, Map<number, RunState>> }).snaps.get(s.id)!;
const snapshots = [...snaps].sort((a, b) => a[0] - b[0]).map(([index, state]) => ({ index, state }));
writeFileSync(out, JSON.stringify({ record, chunks, snapshots }));
console.log(`${out}: reducer ${record.version}, ${record.action_count} actions, day ${record.day}, snapshots at ${snapshots.map((x) => x.index).join(', ')}`);
