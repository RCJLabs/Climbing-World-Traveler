// Crags as data (27 M1, docs/20 §1): the folder per crag and the manifest that finds them, and the validator's rules for
// a crag's own data: its folder and manifest entry, its hub, what its sectors climb and on what rock, and the grading
// systems it names. The rules run on a copy of data/ with one thing broken at a time.
import { cpSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CRAG_FILES, cragHash } from '../src/data/assemble';
import { cragIds, cragTexts, loadBundle, manifestOf } from '../src/data/bundle';
import { validateContent } from '../src/data/validate';
import { cragDisciplines, disciplineErrors, mainDiscipline, rockErrors, sectorDiscipline, sectorRock } from '../src/sim/discipline';
import type { Crag } from '../src/sim/types';

const bundle = loadBundle();
const font = bundle.crags.get('fontainebleau')!;
const kal = bundle.crags.get('kalymnos')!;

let dir = '';
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = ''; });

/** A copy of data/ with one crag file edited. */
function copyWith(id: string, file: (typeof CRAG_FILES)[number], edit: (json: Record<string, unknown>) => void): string {
  dir = mkdtempSync(join(tmpdir(), 'cwt-data-'));
  cpSync('data', dir, { recursive: true });
  const path = `${dir}/crags/${id}/${file}.json`;
  const json = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  edit(json);
  writeFileSync(path, JSON.stringify(json));
  return dir;
}

describe('the manifest (docs/20 §1)', () => {
  it('holds a hash of every crag folder\'s files, the one data/manifest.json has', () => {
    expect(cragIds()).toEqual(['fontainebleau', 'kalymnos']);
    for (const id of cragIds()) expect(manifestOf().crags[id]).toBe(cragHash(cragTexts('data', id)));
    expect(Object.fromEntries(bundle.hashes)).toEqual(manifestOf().crags);
  });

  it('goes stale when a crag\'s file changes, and the validator says so', () => {
    const d = copyWith('kalymnos', 'crag', (c) => { c.name = 'Kalymnos!'; });
    expect(validateContent(d).errors).toEqual(['manifest: crag kalymnos is stale (run pnpm manifest)']);
  });

  it('wants a folder named for its crag, and a folder for every entry', () => {
    dir = mkdtempSync(join(tmpdir(), 'cwt-data-'));
    cpSync('data', dir, { recursive: true });
    renameSync(`${dir}/crags/kalymnos`, `${dir}/crags/kalymnos_old`);
    expect(validateContent(dir).errors).toEqual(['schema: crag folder kalymnos_old holds crag kalymnos; a folder is named for its crag']);
    rmSync(`${dir}/crags/kalymnos_old`, { recursive: true });
    expect(validateContent(dir).errors).toContain('manifest: crag kalymnos has no folder');
  });

  it('wants a crag to hang off a hub the travel data has', () => {
    const d = copyWith('kalymnos', 'crag', (c) => { c.hub = 'hub_nowhere'; });
    expect(validateContent(d).errors).toContain('crag kalymnos: unknown hub hub_nowhere');
  });
});

describe('what a crag climbs, and on what rock (06 §2, 27 M1)', () => {
  it('reads a sector\'s discipline and rock from its styles, and a crag\'s from its sectors', () => {
    expect(font.sectors.map((s) => sectorDiscipline(s, bundle))).toEqual(font.sectors.map(() => 'boulder'));
    expect(kal.sectors.map((s) => sectorDiscipline(s, bundle))).toEqual(kal.sectors.map(() => 'sport'));
    expect([cragDisciplines(font, bundle), mainDiscipline(kal, bundle)]).toEqual([['boulder'], 'sport']);
    expect(new Set(font.sectors.map((s) => sectorRock(s, bundle)))).toEqual(new Set(['sandstone_font']));
    expect(new Set(kal.sectors.map((s) => sectorRock(s, bundle)))).toEqual(new Set(['limestone']));
    expect([...disciplineErrors(font, bundle), ...rockErrors(kal, bundle)]).toEqual([]);
  });

  it('wants a sector to climb one discipline on one rock, and a crag to list what its sectors climb', () => {
    const mixed: Crag = { ...font, sectors: [{ ...font.sectors[0]!, style_profiles: ['font_sloper_slab', 'kalymnos_grey_vertical'] }] };
    expect(disciplineErrors(mixed, bundle)).toEqual([`crag fontainebleau/${font.sectors[0]!.id}: mixes bolted and unbolted styles; a sector climbs one discipline`]);
    expect(rockErrors(mixed, bundle)).toEqual([`crag fontainebleau/${font.sectors[0]!.id}: styles on sandstone_font and limestone; a sector is one rock`]);
    expect(disciplineErrors({ ...kal, disciplines: ['boulder', 'sport'] }, bundle)).toEqual(['crag kalymnos: disciplines boulder, sport but its sectors climb sport']);
  });

  it('wants a crag known by the rock of one of its sectors', () => {
    expect(rockErrors({ ...kal, rock: 'granite' }, bundle)).toEqual(['crag kalymnos: known by granite, which none of its sectors is']);
  });

  it('names a grading system only for a discipline the crag climbs', () => {
    const d = copyWith('kalymnos', 'crag', (c) => { c.grades = { boulder: 'v', sport: 'yds' }; });
    // The edit stales the manifest too; the grading rule is the one under test.
    expect(validateContent(d).errors).toContain('crag kalymnos: a grading system for boulder, which it does not climb');
  });
});
