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
import { presetSpec } from '../src/sim/presets';
import { applyAction, createRun, InvalidAction, travelBlock } from '../src/sim/run';
import { edgeId, tripAlong, tripTo, travelAction } from '../src/sim/travel';
import type { Crag, DataBundle, TravelEdge } from '../src/sim/types';

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

describe('replay safety (27 M1)', () => {
  // An update that adds a cheaper leg between the hubs the trip already uses.
  const bus: TravelEdge = { from: 'hub_paris', to: 'hub_athens', mode: 'bus', cost: 20, days: 3 };
  const cheaper: DataBundle = { ...bundle, travel: { hubs: bundle.travel.hubs, edges: [...bundle.travel.edges, bus] } };

  it('a travel action names its legs, and the trip along them is the cheapest one', () => {
    const a = travelAction('fontainebleau', 'kalymnos', bundle)!;
    expect(a).toEqual({ t: 'travel', to: 'kalymnos', legs: ['fontainebleau__hub_paris__train', 'hub_paris__hub_athens__fly', 'kalymnos__hub_athens__fly'] });
    expect(tripAlong('fontainebleau', 'kalymnos', a.legs!, bundle)).toEqual(tripTo('fontainebleau', 'kalymnos', bundle));
    expect(tripAlong('kalymnos', 'fontainebleau', [...a.legs!].reverse(), bundle)).toEqual(tripTo('kalymnos', 'fontainebleau', bundle));
    expect(tripAlong('fontainebleau', 'kalymnos', a.legs!.slice(0, 2), bundle)).toBeNull();
    expect(tripAlong('fontainebleau', 'kalymnos', ['hub_paris__hub_athens__fly', ...a.legs!.slice(1)], bundle)).toBeNull();
  });

  it('replays the trip taken after an update adds a cheaper way; an action without legs takes the cheapest', () => {
    const a = travelAction('fontainebleau', 'kalymnos', bundle)!;
    expect(tripTo('fontainebleau', 'kalymnos', cheaper)!.legs).toContainEqual(bus);
    const taken = createRun('legs', presetSpec('dirtbag'), bundle);
    const replayed = createRun('legs', presetSpec('dirtbag'), cheaper);
    applyAction(taken, a, bundle);
    applyAction(replayed, a, cheaper);
    expect(replayed).toEqual(taken);
    const old = createRun('legs', presetSpec('dirtbag'), cheaper);
    applyAction(old, { t: 'travel', to: 'kalymnos' }, cheaper);
    expect(old.day).toBe(taken.day + 2);
    expect(old.res.money).toBeGreaterThan(taken.res.money);
  });

  it('refuses legs that do not lead to the destination', () => {
    const run = createRun('legs2', presetSpec('dirtbag'), bundle);
    expect(travelBlock(run, 'kalymnos', bundle, ['fontainebleau__hub_paris__train'])).toBe('No such way to Kalymnos from here.');
    expect(() => applyAction(run, { t: 'travel', to: 'kalymnos', legs: ['nowhere__hub_paris__fly'] }, bundle)).toThrow(InvalidAction);
    expect(run.day).toBe(0);
  });

  it('breaks ties by id, so the same graph in any file order gives the same trip', () => {
    const edges: TravelEdge[] = [
      { from: 'a', to: 'h2', mode: 'bus', cost: 10, days: 1 },
      { from: 'h2', to: 'b', mode: 'bus', cost: 10, days: 1 },
      { from: 'a', to: 'h1', mode: 'bus', cost: 10, days: 1 },
      { from: 'h1', to: 'b', mode: 'bus', cost: 10, days: 1 },
      { from: 'a', to: 'h1', mode: 'train', cost: 10, days: 1 },
    ];
    const trips = [edges, [...edges].reverse(), [edges[2]!, edges[4]!, edges[0]!, edges[3]!, edges[1]!]].map((e) => tripTo('a', 'b', { travel: { hubs: [], edges: e } })!);
    for (const t of trips) expect(t.legs.map(edgeId)).toEqual(['a__h1__bus', 'h1__b__bus']);
  });
});
