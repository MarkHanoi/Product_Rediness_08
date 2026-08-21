// §GIS-ENVELOPE-DETERMINATION-PERSIST (L-1654, founder 2026-08-21) — the HYDRATION read.
//
// «once we have already selected the parcel — and working on this parcel as our project — the
// parcel data should be there — present». The write half (dispatchEnvelope → site.updateZoning
// → Parcel.buildableDetermination) is pinned in
// packages/stores/__tests__/site-commands.zoning-footprint.test.ts; THIS suite pins the read
// half the card uses: `resolveStoredBuildableDetermination` returns the stored record — dated,
// refusals included — and returns `null` (never throws) for legacy projects, absent sites and
// absent runtimes, so the L-445 reduced card remains exactly the legacy arm.

import { describe, expect, it } from 'vitest';
import { SiteModelStore, siteCreate, siteUpdateZoning } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import { resolveStoredBuildableDetermination } from '../src/ui/site/siteDispatch';

function setupSite(): SiteModelStore {
    const store = new SiteModelStore();
    siteCreate(
        {
            projectId: 'proj-hyd',
            location: {},
            parcel: {
                boundary: {
                    polygon: [
                        { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 },
                    ],
                    edgeClassifications: ['front', 'side', 'rear', 'side'],
                },
                setbacks: { front: 2, side: 2, rear: 2 },
            },
        },
        store,
    );
    return store;
}

const DETERMINATION = {
    envelope: {
        insetPolygon: [
            { x: 2, z: 2 }, { x: 8, z: 2 }, { x: 8, z: 6 }, { x: 2, z: 6 },
        ],
        insetAreaM2: 24,
        maxHeight_m: 16.5,
        confidence: 'block-constructed',
        status: 'ok',
        zoneCode: '13b',
        derivation: [
            {
                constraint: 'alignment.depth',
                value: 16.5,
                zoneCode: '13b',
                source: 'test-pack',
                fieldProvenance: 'published-structured',
                ordinanceRef: 'PGM Art. 242.2',
            },
        ],
    },
    determinedAtIso: '2026-08-21T10:00:00.000Z',
    schemaVersion: 1,
};

const runtimeFor = (store: SiteModelStore): PryzmRuntime =>
    ({ siteModelStore: store } as unknown as PryzmRuntime);

describe('§L-1654 resolveStoredBuildableDetermination — the card hydration read', () => {
    it('returns the stored record with its date, confidence and citation rows intact', () => {
        const store = setupSite();
        const res = siteUpdateZoning(
            { siteId: 'site_proj-hyd', buildableDetermination: DETERMINATION }, store);
        expect(res.ok).toBe(true);
        const record = resolveStoredBuildableDetermination(runtimeFor(store));
        expect(record).not.toBeNull();
        expect(record!.determinedAtIso).toBe('2026-08-21T10:00:00.000Z');
        expect(record!.envelope.confidence).toBe('block-constructed');
        expect(record!.envelope.maxHeight_m).toBe(16.5);
        expect(record!.envelope.derivation[0]!.ordinanceRef).toBe('PGM Art. 242.2');
    });

    it('LEGACY project (ring persisted, record never written) → null, so the reduced card arm survives', () => {
        const store = setupSite();
        siteUpdateZoning(
            {
                siteId: 'site_proj-hyd',
                buildableRing: [{ x: 2, z: 2 }, { x: 8, z: 2 }, { x: 8, z: 6 }, { x: 2, z: 6 }],
            },
            store,
        );
        expect(resolveStoredBuildableDetermination(runtimeFor(store))).toBeNull();
    });

    it('no site → null; no runtime (node, no window) → null — never a throw on a render path', () => {
        expect(resolveStoredBuildableDetermination(runtimeFor(new SiteModelStore()))).toBeNull();
        expect(resolveStoredBuildableDetermination(null)).toBeNull();
        expect(resolveStoredBuildableDetermination(undefined)).toBeNull();
    });

    it('a stored REFUSAL determination hydrates too — a cited refusal is a determination', () => {
        const store = setupSite();
        siteUpdateZoning(
            {
                siteId: 'site_proj-hyd',
                buildableDetermination: {
                    ...DETERMINATION,
                    envelope: {
                        ...DETERMINATION.envelope,
                        status: 'not-applicable',
                        insetPolygon: [],
                        insetAreaM2: 0,
                        refusal: {
                            code: 'derived-plan',
                            legallyGrounded: true,
                            headline: 'No general-plan envelope applies here.',
                            detail: 'The zone delegates buildability to a per-site derived plan.',
                            ordinanceRef: 'PGM clau 18',
                        },
                    },
                },
            },
            store,
        );
        const record = resolveStoredBuildableDetermination(runtimeFor(store));
        expect(record!.envelope.status).toBe('not-applicable');
        expect(record!.envelope.refusal?.code).toBe('derived-plan');
    });
});
