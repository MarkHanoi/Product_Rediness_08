// §GR-10/GR-14 — "the block response carried no neighbours array" ≠ "this block
// has no neighbouring parcels" (C78 §1.4 · C71 §4.4 · §STREET-WIDTH-NEIGHBOURS L-537).
//
// THE SITES: `check-no-empty-means-unknown` ARM C at
// `apps/editor/src/ui/site/parcel/resolveCordobaMcStreetWidth.ts:157` and
// `apps/editor/src/ui/site/siteDispatch.ts:8113`, both `(block.neighbours ?? []).map(…)`.
//
// WHY THE `?? []` WAS NOT THE ROOT. `BlockFeature.neighbours` was a REQUIRED
// field that `parseBlockResponse` ALWAYS populated, so deleting the `?? []` at
// the two readers would have struck two ledger rows while changing nothing: the
// collapse happened one level UP, where `if (Array.isArray(b.neighbours))` on a
// response with no `neighbours` key at all fell through to a seeded `[]`. That
// `[]` then travelled to both consumers as the positive claim "this block has no
// neighbouring parcels", and each refused with a reason naming a GEOGRAPHIC fact
// for what was a gap in our own data path.
//
// WHY IT MATTERS. Street width → §BCN-ALCADA height band → buildable envelope.
// The refusal is correct either way (an unmeasurable street produces NO height
// rather than a wrong one), so the OUTCOME was always safe — but the two causes
// need different fixes, and an operator reading coverage telemetry cannot chase
// a server gap that is reported as an isolated block.
//
// Every assertion below is DIFFERENTIATING: it names two inputs that produced
// byte-identical output before the fix and asserts they now differ.

import { describe, it, expect } from 'vitest';
import { parseBlockResponse } from '../src/ui/site/parcel/CatastroBlockProvider.js';

/** Three strip parcels that form a valid ≥3-parcel block. */
const PARCELS = [
    { refcat: 'P1', areaM2: 140, ring: [{ lon: 0, lat: 0 }, { lon: 7, lat: 0 }, { lon: 7, lat: 20 }] },
    { refcat: 'P2', areaM2: 120, ring: [{ lon: 7, lat: 0 }, { lon: 13, lat: 0 }, { lon: 13, lat: 20 }] },
    { refcat: 'P3', areaM2: 140, ring: [{ lon: 13, lat: 0 }, { lon: 20, lat: 0 }, { lon: 20, lat: 20 }] },
];

const GOOD_NEIGHBOUR = {
    refcat: 'N1', areaM2: 90,
    ring: [{ lon: 26, lat: 0 }, { lon: 46, lat: 0 }, { lon: 46, lat: 20 }],
};

/** A row `parseParcel` must reject: a ring under 3 points is not a polygon. */
const BAD_NEIGHBOUR = { refcat: 'N2', areaM2: 5, ring: [{ lon: 1, lat: 1 }, { lon: 2, lat: 2 }] };

/** The proxy envelope `parseBlockResponse` expects: `{ block: { … } }`. */
function body(extra: Record<string, unknown>): unknown {
    return { block: { manzana: 'TESTMZ', parcels: PARCELS, ...extra } };
}

describe('parseBlockResponse — the three facts the seeded `[]` merged', () => {
    it('ANSWERED, with neighbours — the case that always worked', () => {
        const b = parseBlockResponse(body({ neighbours: [GOOD_NEIGHBOUR] }));
        expect(b?.neighbours).toHaveLength(1);
        expect(b?.neighboursDropped).toBe(0);
    });

    it('ANSWERED, with none — an EMPTY array is a real finding (isolated block)', () => {
        const b = parseBlockResponse(body({ neighbours: [] }));
        // Load-bearing: refusing on a legitimate empty is the mirror-image defect.
        // C71 §4.4 — `[]` may only ever mean zero results, and here it does.
        expect(b?.neighbours).toEqual([]);
        expect(b?.neighbours).not.toBeNull();
        expect(b?.neighboursDropped).toBe(0);
    });

    it('NOT ANSWERED — no `neighbours` key at all yields NULL, not an empty list', () => {
        const b = parseBlockResponse(body({}));
        expect(b?.neighbours).toBeNull();
    });

    it('NOT ANSWERED — a non-array `neighbours` is null too, never coerced to empty', () => {
        for (const raw of [null, undefined, 'none', 7, {}]) {
            expect(parseBlockResponse(body({ neighbours: raw }))?.neighbours).toBeNull();
        }
    });

    it('THE DIFFERENTIATOR — answered-and-empty is NOT EQUAL to never-answered', () => {
        // Before this change both sides were `[]` and this line could not have
        // been written at all.
        const answered = parseBlockResponse(body({ neighbours: [] }))!.neighbours;
        const unanswered = parseBlockResponse(body({}))!.neighbours;
        expect(answered).toEqual([]);
        expect(unanswered).toBeNull();
        expect(answered).not.toEqual(unanswered);
    });

    it('THE THIRD FACT — every row unparseable is EMPTY-with-a-drop-count, not silence', () => {
        // The server answered, and nothing it sent was usable. An empty list alone
        // would have reported that as an isolated block; the count is what
        // separates corrupt data from geography.
        const b = parseBlockResponse(body({ neighbours: [BAD_NEIGHBOUR, BAD_NEIGHBOUR] }));
        expect(b?.neighbours).toEqual([]);
        expect(b?.neighboursDropped).toBe(2);
        // …and it is distinguishable from a genuinely empty answer.
        expect(b?.neighboursDropped).not.toBe(parseBlockResponse(body({ neighbours: [] }))?.neighboursDropped);
    });

    it('PARTIAL — a good row survives a bad one, and the drop is counted (documented policy kept)', () => {
        // §STREET-WIDTH-NEIGHBOURS' deliberate failure policy — one bad neighbour
        // is dropped, the rest are kept — must NOT be changed by this fix; only
        // made visible.
        const b = parseBlockResponse(body({ neighbours: [GOOD_NEIGHBOUR, BAD_NEIGHBOUR] }));
        expect(b?.neighbours).toHaveLength(1);
        expect(b?.neighboursDropped).toBe(1);
    });

    it('the BLOCK-parcel failure policy is untouched — one bad parcel still voids the block', () => {
        // The opposite policy, and the reason it is opposite: a shrunken manzana
        // yields a DEEPER permitted build than the ordinance allows.
        expect(parseBlockResponse(body({ parcels: [...PARCELS, BAD_NEIGHBOUR] }))).toBeNull();
    });

    it('TOTAL — no input makes the parser throw', () => {
        for (const bad of [undefined, null, 0, '', [], {}, { manzana: 'X' }]) {
            expect(() => parseBlockResponse(bad)).not.toThrow();
        }
    });
});
