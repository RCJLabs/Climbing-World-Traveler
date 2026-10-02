// Display grades (docs/08 §2). The engine only ever uses DI; these tables are for people.

const FONT = ['3', '4', '4+', '5', '5+', '6A', '6A+', '6B', '6B+', '6C', '6C+', '7A', '7A+', '7B', '7B+', '7C', '7C+', '8A', '8A+', '8B', '8B+', '8C', '8C+', '9A', '9A+'];
const V = ['VB', 'V0–', 'V0', 'V0+', 'V1', 'V2', 'V3', 'V3+', 'V4', 'V5', 'V5', 'V6', 'V7', 'V8', 'V8+', 'V9', 'V10', 'V11', 'V12', 'V13', 'V14', 'V15', 'V16', 'V17', 'V18'];
const FIRST = 8;

const idx = (di: number): number => Math.max(0, Math.min(FONT.length - 1, Math.round(di) - FIRST));

/** Font grade for a DI value, rounded to the nearest step. */
export const fontGrade = (di: number): string => (di < FIRST - 0.5 ? '2' : FONT[idx(di)]!);
export const vGrade = (di: number): string => V[idx(di)]!;
