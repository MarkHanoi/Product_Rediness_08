// @vitest-environment happy-dom
//
// A.11 — ClimatePanel L5 happy-dom tests.
//
// Drives the panel against a fake runtime exposing siteModelStore +
// climateStore (the same read surface composeRuntime wires). Asserts:
//   - no-site empty-state
//   - site-but-no-dataset state (sun-path renders, wind/temp empty-state)
//   - populated state (3 SVGs: sun-path + wind rose + temp profile)
//   - open/close/dispose hygiene

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ClimateDataset } from '@pryzm/schemas';
import {
    openClimatePanel,
    closeClimatePanel,
    isClimatePanelOpen,
    disposeClimatePanel,
} from '../src/ui/climate/ClimatePanel';

// ── Fakes ────────────────────────────────────────────────────────────────────

function makeSite(lat: number, lon: number): unknown {
    return {
        id: 'site_test_001',
        location: { latitude: lat, longitude: lon },
    };
}

function makeDataset(): ClimateDataset {
    const monthlyNormals = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        avgDryBulbC: 5 + i,
        avgMinDryBulbC: i,
        avgMaxDryBulbC: 10 + i,
        avgRelHumidityPct: 70,
        avgPrecipMm: 40,
        avgWindSpeedMps: 4,
        prevailingWindDirDeg: 200,
        avgGlobalHorizontalWm2: 150,
        heatingDegreeDaysBase18: 100,
        coolingDegreeDaysBase18: 0,
    }));
    const sectors = Array.from({ length: 16 }, (_, i) => ({
        sectorDeg: i * 22.5,
        speedBinHours: [10, 5, 2, 1, 0, 0] as [number, number, number, number, number, number],
    }));
    return { monthlyNormals, windRose: { sectors, meanSpeedMps: 4.2, p99SpeedMps: 18 }, source: 'epw' } as unknown as ClimateDataset;
}

function makeRuntime(opts: { site?: unknown; dataset?: ClimateDataset | null }): any {
    return {
        siteModelStore: {
            getSite: () => opts.site ?? null,
            subscribe: () => () => undefined,
        },
        climateStore: {
            resolveSite: () => opts.dataset ?? null,
            subscribe: () => () => undefined,
        },
    };
}

afterEach(() => {
    disposeClimatePanel();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ClimatePanel', () => {
    it('shows a no-site empty-state when no site is set', () => {
        openClimatePanel(makeRuntime({ site: null }));
        expect(isClimatePanelOpen()).toBe(true);
        const panel = document.querySelector('.clm-panel')!;
        expect(panel.querySelector('.clm-empty')).not.toBeNull();
        expect(panel.textContent).toContain('No site location set');
        // No charts in the empty state.
        expect(panel.querySelectorAll('svg.clm-svg').length).toBe(0);
    });

    it('renders the sun-path but a dataset empty-state when a site has no climate data', () => {
        openClimatePanel(makeRuntime({ site: makeSite(51.5, -0.13), dataset: null }));
        const panel = document.querySelector('.clm-panel')!;
        // Sun-path works from lat/lon alone → exactly one SVG.
        expect(panel.querySelectorAll('svg.clm-svg').length).toBe(1);
        expect(panel.textContent).toContain('No climate dataset imported');
        // Site summary shows the coords.
        expect(panel.textContent).toContain('51.5000');
    });

    it('renders all three sub-views when a dataset is present', () => {
        openClimatePanel(makeRuntime({ site: makeSite(40.41, -3.7), dataset: makeDataset() }));
        const panel = document.querySelector('.clm-panel')!;
        // Sun-path + wind rose + temperature profile → three SVGs.
        expect(panel.querySelectorAll('svg.clm-svg').length).toBe(3);
        const titles = Array.from(panel.querySelectorAll('.clm-block-title')).map(
            (e) => e.textContent,
        );
        expect(titles.some((t) => t?.includes('Sun-path'))).toBe(true);
        expect(titles.some((t) => t?.includes('Wind rose'))).toBe(true);
        expect(titles.some((t) => t?.includes('Temperature'))).toBe(true);
        // The EPW source tag is shown.
        expect(panel.querySelector('.clm-source-tag')?.textContent).toBe('epw');
        // Wind rose drew radial bars (one per non-zero sector).
        const windSvg = panel.querySelectorAll('svg.clm-svg')[1];
        expect(windSvg.querySelectorAll('line').length).toBeGreaterThan(16);
    });

    it('open is idempotent and close hides without removing', () => {
        const rt = makeRuntime({ site: makeSite(0, 0), dataset: makeDataset() });
        openClimatePanel(rt);
        openClimatePanel(rt);
        expect(document.querySelectorAll('.clm-panel').length).toBe(1);
        closeClimatePanel();
        expect(isClimatePanelOpen()).toBe(false);
        expect(document.querySelector('.clm-panel')).not.toBeNull();
    });
});
