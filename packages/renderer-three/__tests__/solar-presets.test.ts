// ADR-0074 P1b (C21 §10) — pure-helper tests for the solar panel preset/label +
// exterior/glazing filter predicates. THREE-free + deterministic.

import { describe, it, expect } from 'vitest';
import {
    SEASON_DAY_OF_YEAR,
    seasonToDayOfYear,
    clampDayOfYear,
    dayOfYearLabel,
    clampTimeMinutes,
    timeMinutesLabel,
} from '../src/solar/solarPresets.js';
import {
    isExteriorFace,
    isGlazingSurface,
    EXTERIOR_PROBE_EPS,
} from '../src/solar/solarSurfaceFilter.js';

describe('solarPresets — season → day-of-year', () => {
    it('maps the four canonical presets', () => {
        expect(seasonToDayOfYear('spring')).toBe(79);
        expect(seasonToDayOfYear('summer')).toBe(172);
        expect(seasonToDayOfYear('autumn')).toBe(265);
        expect(seasonToDayOfYear('winter')).toBe(355);
    });

    it('the table matches the documented civil dates', () => {
        expect(SEASON_DAY_OF_YEAR).toEqual({ spring: 79, summer: 172, autumn: 265, winter: 355 });
    });
});

describe('solarPresets — clampDayOfYear', () => {
    it('clamps to [1,365] and rounds', () => {
        expect(clampDayOfYear(0)).toBe(1);
        expect(clampDayOfYear(-10)).toBe(1);
        expect(clampDayOfYear(400)).toBe(365);
        expect(clampDayOfYear(172.4)).toBe(172);
    });
    it('handles non-finite input by falling back to the safe minimum', () => {
        expect(clampDayOfYear(NaN)).toBe(1);
        expect(clampDayOfYear(Infinity)).toBe(1);
    });
});

describe('solarPresets — dayOfYearLabel', () => {
    it('labels the season presets as their civil dates', () => {
        expect(dayOfYearLabel(79)).toBe('20 Mar');
        expect(dayOfYearLabel(172)).toBe('21 Jun');
        expect(dayOfYearLabel(265)).toBe('22 Sep');
        expect(dayOfYearLabel(355)).toBe('21 Dec');
    });
    it('labels the year boundaries', () => {
        expect(dayOfYearLabel(1)).toBe('1 Jan');
        expect(dayOfYearLabel(31)).toBe('31 Jan');
        expect(dayOfYearLabel(32)).toBe('1 Feb');
        expect(dayOfYearLabel(365)).toBe('31 Dec');
    });
});

describe('solarPresets — time minutes', () => {
    it('clamps minutes into 0..1439', () => {
        expect(clampTimeMinutes(-5)).toBe(0);
        expect(clampTimeMinutes(2000)).toBe(1439);
        expect(clampTimeMinutes(725.6)).toBe(726);
    });
    it('formats HH:MM zero-padded', () => {
        expect(timeMinutesLabel(0)).toBe('00:00');
        expect(timeMinutesLabel(9 * 60 + 5)).toBe('09:05');
        expect(timeMinutesLabel(12 * 60)).toBe('12:00');
        expect(timeMinutesLabel(13 * 60 + 30)).toBe('13:30');
    });
});

describe('solarSurfaceFilter — isExteriorFace', () => {
    it('keeps upward-facing (roof/slab top) faces unconditionally', () => {
        // Even if something is "above", an upward normal is exterior by construction.
        expect(isExteriorFace(1.0, 0.01)).toBe(true);
        expect(isExteriorFace(0.6, 0.01)).toBe(true);
    });
    it('keeps a face whose outward probe escapes into open air (no hit / far hit)', () => {
        expect(isExteriorFace(0.0, null)).toBe(true);
        expect(isExteriorFace(0.0, Infinity)).toBe(true);
        expect(isExteriorFace(0.0, EXTERIOR_PROBE_EPS + 0.1)).toBe(true);
    });
    it('drops a non-upward face whose outward probe hits immediately (interior)', () => {
        expect(isExteriorFace(0.0, EXTERIOR_PROBE_EPS - 0.05)).toBe(false);
        expect(isExteriorFace(-0.2, 0.02)).toBe(false);
    });
});

describe('solarSurfaceFilter — isGlazingSurface', () => {
    it('flags glazing element types (token + separators tolerant)', () => {
        expect(isGlazingSurface({ elementType: 'WindowGlass' })).toBe(true);
        expect(isGlazingSurface({ elementType: 'curtain-wall-glass' })).toBe(true);
        expect(isGlazingSurface({ elementType: 'Glazing' })).toBe(true);
        expect(isGlazingSurface({ elementType: 'glass_pane' })).toBe(true);
    });
    it('flags markedly-transparent low-opacity materials', () => {
        expect(isGlazingSurface({ transparent: true, opacity: 0.3 })).toBe(true);
        expect(isGlazingSurface({ transparent: true, opacity: 0.6 })).toBe(true);
    });
    it('does NOT flag solid walls/roofs/slabs', () => {
        expect(isGlazingSurface({ elementType: 'Wall' })).toBe(false);
        expect(isGlazingSurface({ elementType: 'Roof' })).toBe(false);
        expect(isGlazingSurface({ elementType: 'Slab' })).toBe(false);
        expect(isGlazingSurface({})).toBe(false);
    });
    it('does NOT flag faintly-translucent solids (opacity > 0.6)', () => {
        expect(isGlazingSurface({ transparent: true, opacity: 0.85 })).toBe(false);
        expect(isGlazingSurface({ transparent: false, opacity: 0.2 })).toBe(false);
    });
});
