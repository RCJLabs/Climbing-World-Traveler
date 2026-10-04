// Writes data/manifest.json (docs/20 §1): every crag folder's content hash, which a run records for each crag it plays
// (27 §4). The scripts that write a crag's files rebuild it themselves; `pnpm validate` fails while it is stale.
//   pnpm manifest
import { manifestOf, writeManifest } from '../src/data/bundle';

writeManifest();
const m = manifestOf();
console.log(`data/manifest.json: ${Object.entries(m.crags).map(([id, h]) => `${id} ${h}`).join(', ')}`);
