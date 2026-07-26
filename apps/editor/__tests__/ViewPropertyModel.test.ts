// §FEAT-STANDARDIZED-VIEW-PROPERTIES (L-625, C59 §6) — unit tests for the PURE
// standardized view-property registry. Same approach as PaneViewModel.test.ts: the live
// panels render real DOM, so we pin the DECISION layer ("same properties, where
// meaningful, single-owner") here, headless.

import { describe, it, expect } from 'vitest';
import {
    VIEW_PROPERTY_REGISTRY,
    listViewProperties,
    propertiesForView,
    isPropertyMeaningfulIn,
    sharedEnvironmentProperties,
    propertiesOwnedBy,
    type ViewProperty,
} from '../src/engine/views/viewPropertyModel';
import { VIEW_TYPE_REGISTRY, type ViewType } from '../src/engine/views/paneViewModel';

describe('§L-625 VIEW_PROPERTY_REGISTRY — one catalogue every view draws from', () => {
    it('lists properties from the registry (never a second hardcoded list)', () => {
        expect(listViewProperties()).toEqual(Object.keys(VIEW_PROPERTY_REGISTRY));
    });

    it('every property only claims applicability to REAL view types', () => {
        const known = new Set(Object.keys(VIEW_TYPE_REGISTRY) as ViewType[]);
        for (const p of listViewProperties()) {
            for (const vt of VIEW_PROPERTY_REGISTRY[p].appliesTo) {
                expect(known.has(vt)).toBe(true);
            }
        }
    });
});

describe('§L-625 propertiesForView — the SAME properties WHERE MEANINGFUL', () => {
    it('3D views expose the full environment set; the flat 2D map exposes none of it', () => {
        for (const p of ['sun', 'shadow', 'wind', 'climate', 'population'] as ViewProperty[]) {
            expect(isPropertyMeaningfulIn(p, 'bim-3d')).toBe(true);
            expect(isPropertyMeaningfulIn(p, 'site-3d')).toBe(true);
            expect(isPropertyMeaningfulIn(p, 'site-map-2d')).toBe(false);
        }
    });

    it('post-processing is meaningful ONLY on the WebGPU BIM view (not Cesium, not 2D)', () => {
        expect(isPropertyMeaningfulIn('postProcessing', 'bim-3d')).toBe(true);
        expect(isPropertyMeaningfulIn('postProcessing', 'site-3d')).toBe(false);
        expect(isPropertyMeaningfulIn('postProcessing', 'bim-plan-2d')).toBe(false);
    });

    it('the site-analysis layers (sun-path / wind rose / heatmap) are site-3d only', () => {
        for (const p of ['sunPath', 'windRose', 'siteHeatmap'] as ViewProperty[]) {
            expect(propertiesForView('site-3d')).toContain(p);
            expect(propertiesForView('bim-3d')).not.toContain(p);
            expect(propertiesForView('site-map-2d')).not.toContain(p);
        }
    });

    it('camera/navigation is meaningful in EVERY view (the universal property)', () => {
        for (const vt of Object.keys(VIEW_TYPE_REGISTRY) as ViewType[]) {
            expect(propertiesForView(vt)).toContain('camera');
        }
    });

    it('a Canvas2D plan exposes no sun/shadow/post-proc but keeps camera', () => {
        const plan = propertiesForView('bim-plan-2d');
        expect(plan).toEqual(['camera']);
    });
});

describe('§L-625 sharedEnvironmentProperties — the de-dup contract (single source of truth)', () => {
    it('is EXACTLY sun/shadow/wind/climate/population — the founder-named duplicated set', () => {
        expect(sharedEnvironmentProperties().sort()).toEqual(
            ['climate', 'population', 'shadow', 'sun', 'wind'].sort(),
        );
    });

    it('post-processing and the analysis layers are NOT shared-environment', () => {
        for (const p of ['postProcessing', 'sunPath', 'windRose', 'siteHeatmap', 'camera'] as ViewProperty[]) {
            expect(VIEW_PROPERTY_REGISTRY[p].sharedEnvironment).toBe(false);
        }
    });
});

describe('§L-625 propertiesOwnedBy — one canonical owner per property (no double authoring)', () => {
    it('every property is owned by exactly one panel', () => {
        const owned = [...propertiesOwnedBy('view-properties'), ...propertiesOwnedBy('site-analysis')];
        expect(owned.sort()).toEqual(listViewProperties().sort());
    });

    it('the shared-environment knobs are authored in the View Properties panel', () => {
        const vp = propertiesOwnedBy('view-properties');
        for (const p of sharedEnvironmentProperties()) expect(vp).toContain(p);
    });

    it('the 3D-site analysis layers are owned by the Site Analysis panel', () => {
        expect(propertiesOwnedBy('site-analysis').sort()).toEqual(
            ['sunPath', 'windRose', 'siteHeatmap'].sort(),
        );
    });
});
