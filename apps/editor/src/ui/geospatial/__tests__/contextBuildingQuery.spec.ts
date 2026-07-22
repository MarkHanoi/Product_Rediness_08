// §CTX-QUERY-PANEL (L-592) — the honesty rules of the context-building query panel.
//
// 🔴 The merge-blocking rule: the panel MUST surface `heightProvenance`, and must NEVER state a
// fabricated 9 m as this building's height. Measured (L-582): 0.9% surveyed · 79.3%
// `building:levels` × our assumed 3.2 m · 19.8% a fabricated 9 m.
// ⚠ Second rule: a tile `syntheticId` must never be presented as an OSM id.

import { describe, it, expect } from 'vitest';
import {
    buildContextBuildingQuery,
    buildHeightRow,
    buildIdentityRow,
    buildUseRow,
} from '../contextBuildingQuery';

describe('height row — the rule this panel exists for', () => {
    it('states a SURVEYED height plainly, but still labels it', () => {
        const row = buildHeightRow({ heightM: 24.5, heightProvenance: 'tagged', osmId: 1 });
        expect(row.value).toBe('25 m');   // ≥10 m rounds to the metre; no false precision
        expect(row.isUnknown).toBeFalsy();
        expect(row.caveat).toMatch(/surveyed/i);
    });

    it('separates the REAL floor count from OUR assumed storey height', () => {
        const row = buildHeightRow({
            heightM: 19.2, heightProvenance: 'derived-levels', floors: 6, osmId: 1,
        });
        expect(row.value).toBe('≈ 19 m');            // hedged, never flat
        expect(row.caveat).toContain('6 floor');
        expect(row.caveat).toContain('3.2 m');
        expect(row.caveat).toMatch(/floor count is real/i);
        expect(row.caveat).toMatch(/metre value is ours/i);
    });

    it('🔴 NEVER reports the fabricated 9 m as this building’s height', () => {
        const row = buildHeightRow({ heightM: 9, heightProvenance: 'assumed', osmId: 1 });
        expect(row.value).toBe('Unknown');
        expect(row.isUnknown).toBe(true);
        // The number may only appear as a named DRAWING PLACEHOLDER, never as the answer.
        expect(row.value).not.toContain('9');
        expect(row.caveat).toMatch(/placeholder/i);
        expect(row.caveat).toMatch(/not a measurement/i);
    });

    it('reads an ABSENT provenance as assumed (the pessimistic, honest default)', () => {
        // Older cached collections predate §CTX-HEIGHT-PROVENANCE. Guessing `tagged` for them
        // would re-hide exactly what L-459 exposed.
        const row = buildHeightRow({ heightM: 9, osmId: 1 });
        expect(row.value).toBe('Unknown');
        expect(row.isUnknown).toBe(true);
    });
});

describe('identity row — a synthetic id is never dressed as an OSM id', () => {
    it('names a real OSM id as such', () => {
        const row = buildIdentityRow({ heightM: 9, osmId: 12345, osmIdSource: 'osm' });
        expect(row.value).toBe('OSM #12345');
        expect(row.caveat).toMatch(/OpenStreetMap way\/relation/i);
    });

    it('⚠ presents a tile-minted id as an INTERNAL reference and warns it is not OSM', () => {
        const row = buildIdentityRow({ heightM: 9, osmId: 999, osmIdSource: 'tile-synthetic' });
        expect(row.value).toBe('Internal #999');
        expect(row.value).not.toMatch(/OSM/);
        expect(row.caveat).toMatch(/NOT an OpenStreetMap id/i);
    });

    it('reads an ABSENT source as synthetic (same pessimistic default)', () => {
        expect(buildIdentityRow({ heightM: 9, osmId: 7 }).value).toBe('Internal #7');
    });
});

describe('use row', () => {
    it('states an unrecorded use rather than inferring one', () => {
        const row = buildUseRow({ heightM: 9, osmId: 1 });
        expect(row.value).toBe('Not recorded');
        expect(row.isUnknown).toBe(true);
    });

    it('shows the class label and the raw tag it came from', () => {
        const row = buildUseRow({ heightM: 9, osmId: 1, useTag: 'building=apartments' });
        expect(row.value).toBe('Residential');
        expect(row.caveat).toContain('building=apartments');
    });
});

describe('the whole model', () => {
    const base = { heightM: 9, osmId: 42 } as const;

    it('always says it is read-only reference data, not part of the model', () => {
        const m = buildContextBuildingQuery(base);
        expect(m.subtitle).toMatch(/read-only/i);
        expect(m.subtitle).toMatch(/not part of your model/i);
        expect(m.footnote).toMatch(/cannot be selected into the model|edited/i);
    });

    it('always includes a height row carrying its provenance', () => {
        for (const p of ['tagged', 'derived-levels', 'assumed', undefined] as const) {
            const m = buildContextBuildingQuery(
                p === undefined ? base : { ...base, heightProvenance: p },
            );
            const h = m.rows.find((r) => r.label === 'Height')!;
            expect(h, `provenance=${p}`).toBeDefined();
            expect(h.caveat, `provenance=${p}`).toBeTruthy();
        }
    });

    it('derives NO area, volume or unit count from an estimated height', () => {
        // Multiplying a 79.3%-estimated height would produce a number that LOOKS surveyed.
        const labels = buildContextBuildingQuery({
            ...base, heightProvenance: 'derived-levels', floors: 6,
        }).rows.map((r) => r.label.toLowerCase());
        expect(labels).not.toContain('floor area');
        expect(labels).not.toContain('volume');
        expect(labels).not.toContain('gfa');
        expect(labels).not.toContain('units');
    });

    it('titles with the OSM name when there is one, else a neutral label', () => {
        expect(buildContextBuildingQuery(base).title).toBe('Context building');
        expect(buildContextBuildingQuery({ ...base, name: 'Mercat' }).title).toBe('Mercat');
        expect(buildContextBuildingQuery({ ...base, name: '   ' }).title).toBe('Context building');
    });

    it('only shows a floor count when OSM actually tagged one', () => {
        expect(buildContextBuildingQuery(base).rows.some((r) => r.label === 'Floors')).toBe(false);
        expect(buildContextBuildingQuery({ ...base, floors: 4 }).rows
            .some((r) => r.label === 'Floors')).toBe(true);
    });
});
