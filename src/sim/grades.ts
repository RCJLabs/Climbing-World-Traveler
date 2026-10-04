// Display grades (docs/08 §2). The engine only ever uses DI; these tables are for people.

import type { Crag, GradeSystem } from './types';

const FONT = ['3', '4', '4+', '5', '5+', '6A', '6A+', '6B', '6B+', '6C', '6C+', '7A', '7A+', '7B', '7B+', '7C', '7C+', '8A', '8A+', '8B', '8B+', '8C', '8C+', '9A', '9A+'];
const V = ['VB', 'V0–', 'V0', 'V0+', 'V1', 'V2', 'V3', 'V3+', 'V4', 'V5', 'V5', 'V6', 'V7', 'V8', 'V8+', 'V9', 'V10', 'V11', 'V12', 'V13', 'V14', 'V15', 'V16', 'V17', 'V18'];
const FIRST = 8;

const idx = (di: number): number => Math.max(0, Math.min(FONT.length - 1, Math.round(di) - FIRST));

/** Font grade for a DI value, rounded to the nearest step. */
export const fontGrade = (di: number): string => (di < FIRST - 0.5 ? '2' : FONT[idx(di)]!);
export const vGrade = (di: number): string => V[idx(di)]!;

// Route grades (docs/08 §1), DI 4 to 34.
const FRENCH = ['3', '4a', '4b', '4c', '5a', '5b', '5c', '6a', '6a+', '6b', '6b+', '6c', '6c+', '7a', '7a+', '7b', '7b+', '7c', '7c+', '8a', '8a+', '8b', '8b+', '8c', '8c+', '9a', '9a+', '9b', '9b+', '9c', '9c+'];
const YDS = ['5.3', '5.4', '5.5', '5.6', '5.7', '5.8', '5.9', '5.10a', '5.10b', '5.10c', '5.10d', '5.11a', '5.11b', '5.11c/d', '5.12a', '5.12b', '5.12c', '5.12d', '5.13a', '5.13b', '5.13c', '5.13d', '5.14a', '5.14b', '5.14c', '5.14d', '5.15a', '5.15b', '5.15c', '5.15d', '5.16a'];
const ROUTE_FIRST = 4;
const ridx = (di: number): number => Math.max(0, Math.min(FRENCH.length - 1, Math.round(di) - ROUTE_FIRST));

/** French sport grade for a DI value, rounded to the nearest step. */
export const frenchGrade = (di: number): string => FRENCH[ridx(di)]!;
export const ydsGrade = (di: number): string => YDS[ridx(di)]!;

const SYSTEM: Record<GradeSystem, (di: number) => string> = { font: fontGrade, v: vGrade, french: frenchGrade, yds: ydsGrade };

/** A grade in a grading system (08). */
export const gradeIn = (di: number, system: GradeSystem): string => SYSTEM[system](di);

/**
 * The system a crag shows a discipline in (08, 27 M1: grades in the crag's own system): its own, else Font on boulders
 * and French on routes, the systems of the two crags the game started with.
 */
export const systemFor = (discipline: string, crag?: Pick<Crag, 'grades'>): GradeSystem =>
  crag?.grades?.[discipline === 'sport' ? 'sport' : 'boulder'] ?? (discipline === 'sport' ? 'french' : 'font');

/** The grade a climb is shown in: its crag's system for its discipline (08 §1). */
export const gradeFor = (di: number, discipline: string, crag?: Pick<Crag, 'grades'>): string => gradeIn(di, systemFor(discipline, crag));
