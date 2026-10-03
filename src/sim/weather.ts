// Daily weather and climbing conditions (docs/10). P1a runs this for Fontainebleau only: a seeded Markov
// chain per crag and day, a sending-temperature friction term, a small seeded daily friction scalar, and the
// Font no-damp rule that closes sectors after rain.

import type { Athlete } from './character';
import { chalkTerm, type Conditions } from './resolve';
import { stream } from './rng';
import type { ClimateMonth, Crag, Difficulty, Sector } from './types';

export type Sky = 'clear' | 'cloudy' | 'rain' | 'storm';
const SKIES: readonly Sky[] = ['clear', 'cloudy', 'rain', 'storm'];

export interface DayWeather {
  day: number;
  sky: Sky;
  t_max: number;
  t_min: number;
  rh: number;
  wind: number;
  precip_mm: number;
  /** Seeded daily friction scalar for unmodelled conditions ("the rock felt good today"), ±a few percent. */
  noise: number;
}

// ---------------------------------------------------------------- calendar (11 §2: real month lengths, no leap years)

export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export interface CalendarDate { year: number; month: number; dom: number; weekday: number }

/** Date of sim day `day` for a run that starts on `startMonth` (0-based) / `startDom` (1-based). */
export function calendarDate(startMonth: number, startDom: number, day: number): CalendarDate {
  let month = startMonth;
  let dom = startDom + day;
  let year = 0;
  while (dom > DAYS_IN_MONTH[month]!) {
    dom -= DAYS_IN_MONTH[month]!;
    month++;
    if (month === 12) { month = 0; year++; }
  }
  return { year, month, dom, weekday: day % 7 };
}

export const formatDate = (d: CalendarDate): string => `${d.dom} ${MONTH_NAMES[d.month]}`;

// ---------------------------------------------------------------- Markov chain (10 §1)

const BAD_WEATHER_MULT: Record<Difficulty, number> = { story: 0.8, standard: 1.0, hard: 1.2 };

function stationary(m: ClimateMonth, month: number, difficulty: Difficulty): number[] {
  const p = Math.min(0.95, (m.precip_days / DAYS_IN_MONTH[month]!) * BAD_WEATHER_MULT[difficulty]);
  return [0.55 * (1 - p), 0.45 * (1 - p), 0.85 * p, 0.15 * p];
}

function draw(sky: Sky, m: ClimateMonth, day: number, rng: ReturnType<typeof stream>): DayWeather {
  const sd = m.t_sd;
  let t_max: number;
  let t_min: number;
  let rh: number;
  let wind: number;
  let precip = 0;
  switch (sky) {
    case 'clear':
      t_max = m.t_mean + 4 + rng.normal(0, sd); t_min = t_max - 10; rh = m.rh_mean - 15; wind = m.wind_mean * rng.range(0.3, 1.2);
      break;
    case 'cloudy':
      t_max = m.t_mean + 1 + rng.normal(0, sd); t_min = t_max - 6; rh = m.rh_mean; wind = m.wind_mean * rng.range(0.6, 1.4);
      break;
    case 'rain':
      t_max = m.t_mean - 2 + rng.normal(0, sd / 2); t_min = t_max - 4; rh = Math.min(100, m.rh_mean + 20); wind = m.wind_mean * rng.range(0.8, 1.8);
      precip = -8 * Math.log(1 - rng.next());
      break;
    default:
      t_max = m.t_mean - 4 + rng.normal(0, sd / 2); t_min = t_max - 5; rh = Math.min(100, m.rh_mean + 25); wind = m.wind_mean * rng.range(1.5, 3);
      precip = -25 * Math.log(1 - rng.next());
  }
  const noise = Math.max(-0.05, Math.min(0.05, rng.normal(0, 0.02)));
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return { day, sky, t_max: r1(t_max), t_min: r1(t_min), rh: Math.round(Math.max(20, rh)), wind: r1(wind), precip_mm: r1(precip), noise: Math.round(noise * 1000) / 1000 };
}

/** Weather on day 0, drawn from the month's stationary distribution. */
export function firstWeather(runSeed: string, crag: Crag, month: number, difficulty: Difficulty): DayWeather {
  const m = crag.climate[month]!;
  const rng = stream('weather', runSeed, crag.id, 0);
  const pi = stationary(m, month, difficulty);
  const sky = SKIES[weightedIndex(pi, rng.next())]!;
  return draw(sky, m, 0, rng);
}

/** Weather on `day` given yesterday's weather. Depends only on the seed, never on the player's actions. */
export function nextWeather(runSeed: string, crag: Crag, prev: DayWeather, day: number, month: number, difficulty: Difficulty): DayWeather {
  const m = crag.climate[month]!;
  const rng = stream('weather', runSeed, crag.id, day);
  const pi = stationary(m, month, difficulty);
  const s = crag.altitude_m > 1800 ? 0.45 : 0.6;
  const i = SKIES.indexOf(prev.sky);
  const row = pi.map((pj, j) => (j === i ? s + (1 - s) * pj : (1 - s) * pj));
  // Storm only follows cloudy or rain: clear → storm is remapped to cloudy.
  if (prev.sky === 'clear') { row[1]! += row[3]!; row[3] = 0; }
  const sky = SKIES[weightedIndex(row, rng.next())]!;
  return draw(sky, m, day, rng);
}

function weightedIndex(w: readonly number[], u: number): number {
  const total = w.reduce((a, b) => a + b, 0);
  let x = u * total;
  for (let i = 0; i < w.length; i++) {
    x -= w[i]!;
    if (x < 0) return i;
  }
  return w.length - 1;
}

// ---------------------------------------------------------------- wet rock (10 §4: Font, no damp climbing)

export interface RainMark { day: number; mm: number }

/** Days a sector stays shut after rain: its lag, +1 in still humid air (10 §4). */
export function dryLag(sector: Sector, today: DayWeather): number {
  const still = today.wind < 2 && today.rh > 80;
  return sector.dry_lag_days + (still ? 1 : 0);
}

export type SectorStatus = { open: true } | { open: false; reason: string };

export function sectorStatus(sector: Sector, today: DayWeather, lastRain: RainMark | null): SectorStatus {
  if (today.sky === 'rain' || today.sky === 'storm') return { open: false, reason: 'Raining. Font sandstone is never climbed wet.' };
  if (today.rh > 90) return { open: false, reason: 'Damp air: the sandstone is soft and the holds will break.' };
  if (lastRain) {
    const since = today.day - lastRain.day;
    const lag = dryLag(sector, today) + (lastRain.mm > 15 ? 1 : 0);
    if (since < lag) return { open: false, reason: `Still drying after rain (${since} of ${Math.ceil(lag)} days).` };
  }
  return { open: true };
}

// ---------------------------------------------------------------- friction and conditions (10 §2, 02 §C.6)

/** Effective session temperature: early-afternoon air plus a sun offset. */
export function sessionTemp(w: DayWeather, sector: Sector): number {
  return w.t_min + 0.85 * (w.t_max - w.t_min) + (sector.shade ? 0 : 3);
}

/** Sending-window centre in °C for a climber (02 §C.6). */
export function sendingCentre(ath: Athlete): number {
  const moisture = ath.body.skin_moisture === 'sweaty' ? -3 : ath.body.skin_moisture === 'dry' ? 1 : 0;
  return 12 + moisture + ath.mods.sending_temp_shift;
}

/** Friction multiplier from the sending-temperature window: 1 inside ±5 °C, −1.5 % per °C outside (02 §C.6). */
export function tempTerm(t: number, centre: number): number {
  return Math.max(0.7, 1 - 0.015 * Math.max(0, Math.abs(t - centre) - 5));
}

const T_MULT: Record<Difficulty, number> = { story: 1.2, standard: 1.0, hard: 0.9 };

/** Conditions for one session at a sector. `chalk` is the climber's hand chalk 0..100 (02 §D). */
export function sessionConditions(ath: Athlete, w: DayWeather, sector: Sector, chalk: number, difficulty: Difficulty): Conditions {
  const t = sessionTemp(w, sector);
  const wind = 1 + 0.01 * Math.min(w.wind, 6);
  return {
    chalk_term: chalkTerm(chalk),
    temp_term: tempTerm(t, sendingCentre(ath)) * wind * (1 + w.noise),
    wet_term: 1,
    humid: w.rh > 75,
    heat: t > 22,
    cold: t < 4,
    t_mult: T_MULT[difficulty],
  };
}

/** One-word conditions label for the UI. */
export function conditionsLabel(c: Conditions): 'prime' | 'good' | 'fair' | 'greasy' {
  const f = c.temp_term;
  return f >= 1.03 ? 'prime' : f >= 0.99 ? 'good' : f >= 0.93 ? 'fair' : 'greasy';
}
