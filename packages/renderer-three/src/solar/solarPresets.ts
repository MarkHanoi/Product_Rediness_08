// ADR-0074 P1b (C21 §10) — solar panel pure helpers (presets + time mapping).
//
// PURE + THREE-FREE so the editor panel AND unit tests can share them without a
// GL context or a THREE import (P2 — THREE lives only in renderer-three's compute
// modules, never the UI). These map the panel's UI controls (season preset
// buttons, HH:MM time slider, day-of-year slider) onto the numeric inputs the
// renderer-three sun-hours pass + @pryzm/solar-analysis already accept.
//
// Day-of-year values match @pryzm/solar-analysis's solstice/equinox helpers
// (Northern-hemisphere civil dates), replicated here as constants to avoid pulling
// a second package import into the renderer-three barrel for what is UI sugar.

/** The four canonical season presets and their (Northern-hemisphere) day-of-year. */
export type SeasonPreset = 'summer' | 'winter' | 'spring' | 'autumn';

/**
 * Season preset → day-of-year (1..365). These mirror @pryzm/solar-analysis:
 *   spring (Mar 20) = 79, summer (Jun 21) = 172, autumn (Sep 22) = 265,
 *   winter (Dec 21) = 355.
 */
export const SEASON_DAY_OF_YEAR: Readonly<Record<SeasonPreset, number>> = {
    spring: 79,
    summer: 172,
    autumn: 265,
    winter: 355,
};

/** Human label for a season preset (button caption). */
export const SEASON_LABEL: Readonly<Record<SeasonPreset, string>> = {
    summer: 'Summer solstice',
    winter: 'Winter solstice',
    spring: 'Spring equinox',
    autumn: 'Autumn equinox',
};

/** Map a season preset to its day-of-year. Pure. */
export function seasonToDayOfYear(season: SeasonPreset): number {
    return SEASON_DAY_OF_YEAR[season];
}

/** Clamp a day-of-year into the valid 1..365 range (rounds to an integer). Pure. */
export function clampDayOfYear(day: number): number {
    if (!Number.isFinite(day)) return 1;
    const d = Math.round(day);
    if (d < 1) return 1;
    if (d > 365) return 365;
    return d;
}

/**
 * Format a 1-based day-of-year as a "D Mon" civil date label (e.g. 172 → "21 Jun").
 * Uses a fixed non-leap (365-day) calendar so it is deterministic + locale-free —
 * matches the SEASON_DAY_OF_YEAR constants. Pure.
 */
export function dayOfYearLabel(day: number): string {
    const d = clampDayOfYear(day);
    // Cumulative days BEFORE each month in a 365-day (non-leap) year.
    const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let remaining = d;
    for (let m = 0; m < 12; m++) {
        if (remaining <= monthDays[m]!) return `${remaining} ${monthNames[m]}`;
        remaining -= monthDays[m]!;
    }
    return `31 Dec`;
}

/** Clamp minutes-past-midnight into 0..1439. Pure. */
export function clampTimeMinutes(min: number): number {
    if (!Number.isFinite(min)) return 0;
    const m = Math.round(min);
    if (m < 0) return 0;
    if (m > 1439) return 1439;
    return m;
}

/** Format minutes-past-midnight as "HH:MM" (24h). Pure. */
export function timeMinutesLabel(min: number): string {
    const m = clampTimeMinutes(min);
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
