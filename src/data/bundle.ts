// Loads the content from data/ in Node: the harness, the tests and the scripts get every crag folder with its routes.
// The app loads through browser.ts instead, a crag's routes when the climber gets there (27 M1). Paths are relative to
// the working directory, the repository root for every pnpm script.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { DataBundle } from '../sim/types';
import { addCragRoutes, assembleBundle, CRAG_FILES, cragHash, type CoreFiles } from './assemble';

export { DATA_VERSION } from './assemble';

export const DATA_DIR = 'data';

/** The crag folders under `<dir>/crags`, sorted; a folder whose name is not an id (`_template`) is not a crag. */
export const cragIds = (dir = DATA_DIR): string[] =>
  readdirSync(`${dir}/crags`, { withFileTypes: true }).filter((d) => d.isDirectory() && /^[a-z0-9_]+$/.test(d.name)).map((d) => d.name).sort();

/** A crag folder's files as text, in CRAG_FILES order. */
export const cragTexts = (dir: string, id: string): string[] => CRAG_FILES.map((f) => readFileSync(`${dir}/crags/${id}/${f}.json`, 'utf8'));

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

/** Every crag folder's content hash, as data/manifest.json holds them (docs/20 §1). */
export const manifestOf = (dir = DATA_DIR): { crags: Record<string, string> } =>
  ({ crags: Object.fromEntries(cragIds(dir).map((id) => [id, cragHash(cragTexts(dir, id))])) });

/** Write data/manifest.json (`pnpm manifest`); the scripts that write a crag's files call it after them. */
export function writeManifest(dir = DATA_DIR): void {
  const m = manifestOf(dir);
  writeFileSync(`${dir}/manifest.json`, `{\n  "crags": {\n${Object.entries(m.crags).map(([id, h]) => `    "${id}": "${h}"`).join(',\n')}\n  }\n}\n`);
}

export function loadBundle(validate = true, dir = DATA_DIR): DataBundle {
  const core: CoreFiles = {
    traits: readJson(`${dir}/traits.json`),
    backgrounds: readJson(`${dir}/backgrounds.json`),
    travel: readJson(`${dir}/travel.json`),
    manifest: readJson(`${dir}/manifest.json`),
    injuries: readJson(`${dir}/injuries.json`),
  };
  const ids = cragIds(dir);
  const texts = ids.map((id) => cragTexts(dir, id).map((t) => JSON.parse(t) as unknown));
  const b = assembleBundle(core, texts.map(([crag, styles, names], i) => ({ id: ids[i]!, crag, styles, names })), validate);
  ids.forEach((id, i) => addCragRoutes(b, id, { signatures: texts[i]![3], benchmarks: texts[i]![4] }, validate));
  return b;
}
