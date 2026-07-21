// §L-545-SITE-CAPTURE (L-188 / L-489) — the CAPTURE half of the GIS-georeference
// data-loss bug.
//
// L-188 was closed by wiring the RESTORE half, and the restore half is genuinely
// correct. L-489 is the same defect recurring from the other side: a saved GIS
// project reopens with `snapshot.site === null`, so `restoreSiteState` has nothing
// to anchor with — the building floats, 3D Site renders nothing, and the buildable
// envelope will not re-derive. Two things were wrong at capture time:
//
//   1. `siteModelStore ?? window.runtime.siteModelStore` short-circuits on the
//      STORE REFERENCE, not on whether that store HOLDS a site. `SiteModelStore` is
//      per-runtime and `initPersistence` binds the threaded one ONCE into a
//      long-lived closure, so after a runtime recomposition the serializer keeps
//      reading a stale, EMPTY store while the live one holds the real parcel.
//      Signature: `siteStore=resolved · site=NULL · walls>0`.
//
//   2. `site: null` was AMBIGUOUS — it meant both "plain BIM project, never had a
//      georeference" and "GIS project whose georeference was lost". Nothing could
//      tell them apart, so the loader treated the second as the first.
//
// These tests pin BOTH, plus the streaming split/merge carry (the field is
// enumerated explicitly there, so an unlisted field is silently dropped — which is
// exactly how L-188 happened in the first place).

import { describe, it, expect } from 'vitest';
import { SiteModelSchema, type SiteModel } from '@pryzm/schemas';
import { SiteModelStore } from '@pryzm/stores';
import { resolveSiteCapture } from '../src/engine/persistence/ProjectSerializer';
import { splitSnapshotByLevel, mergeSnapshotFromHeaderAndLevels } from '../src/engine/persistence/SnapshotStreaming';

const BARCELONA = { lat: 41.3899, lon: 2.1601 };

function makeSite(projectId = 'proj-bcn'): SiteModel {
    return SiteModelSchema.parse({
        id: `site_${projectId}`,
        projectId,
        name: 'Eixample Site',
        location: {
            latitude: BARCELONA.lat,
            longitude: BARCELONA.lon,
            siteAddress: 'Carrer de Pau Claris 155, Barcelona',
        },
        parcel: {
            boundary: {
                polygon: [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 8 }, { x: 0, z: 8 }],
                edgeClassifications: ['front', 'side', 'rear', 'side'],
            },
            area: 96,
        },
        provenance: { source: 'user-authored' },
    });
}

function storeWith(site: SiteModel | null): SiteModelStore {
    const s = new SiteModelStore();
    s.set(site);
    return s;
}

describe('§L-545 — site capture resolves across store candidates', () => {
    it('captures from the threaded store when it holds the site', () => {
        const site = makeSite();
        const { site: got, capture } = resolveSiteCapture(
            [
                { label: 'threaded', store: storeWith(site) },
                { label: 'window.runtime', store: storeWith(null) },
            ],
            3,
        );
        expect(got?.location.latitude).toBeCloseTo(BARCELONA.lat, 4);
        expect(capture.status).toBe('captured');
        expect(capture.source).toBe('threaded');
    });

    // THE REGRESSION GUARD FOR DEFECT 1. Under the old
    // `siteModelStore ?? window.runtime.siteModelStore`, a threaded-but-EMPTY store
    // short-circuited the fallback and the georeference was lost even though a live
    // store held it. This is the exact shape of a post-recomposition save.
    it('FALLS THROUGH a resolved-but-EMPTY threaded store to the live window.runtime store', () => {
        const site = makeSite();
        const { site: got, capture } = resolveSiteCapture(
            [
                { label: 'threaded', store: storeWith(null) },   // stale instance
                { label: 'window.runtime', store: storeWith(site) }, // live instance
            ],
            42,
        );
        expect(got).not.toBeNull();
        expect(got?.parcel.boundary.polygon).toHaveLength(4);
        expect(capture.status).toBe('captured');
        expect(capture.source).toBe('window.runtime');
    });

    it('does not let a THROWING store cost the georeference another candidate holds', () => {
        const throwing = { getSite: () => { throw new Error('boom'); } } as unknown as SiteModelStore;
        const { site: got, capture } = resolveSiteCapture(
            [
                { label: 'threaded', store: throwing },
                { label: 'window.runtime', store: storeWith(makeSite()) },
            ],
            1,
        );
        expect(got).not.toBeNull();
        expect(capture.source).toBe('window.runtime');
    });
});

describe('§L-545 — "no site" and "site LOST" are no longer the same value', () => {
    it('status=none when there is no site AND no geometry (nothing was lost)', () => {
        const { site, capture } = resolveSiteCapture(
            [{ label: 'threaded', store: storeWith(null) }],
            0,
        );
        expect(site).toBeNull();
        expect(capture.status).toBe('none');
    });

    // THE P0. Geometry present, no georeference: the save is ALLOWED (blocking it
    // would discard the geometry too — see the argument at resolveSiteCapture) but
    // it must be RECORDED, because this is precisely the state that reopens floating.
    it('status=degraded when geometry is saved WITHOUT a georeference, and says why', () => {
        const { site, capture } = resolveSiteCapture(
            [{ label: 'threaded', store: storeWith(null) }],
            1009,
        );
        expect(site).toBeNull();
        expect(capture.status).toBe('degraded');
        expect(capture.elementCount).toBe(1009);
        expect(capture.reason).toMatch(/getSite\(\) returned null/);
    });

    it('distinguishes "no store at all" from "store present but empty" in the reason', () => {
        const noStore = resolveSiteCapture([{ label: 'threaded', store: undefined }], 5);
        expect(noStore.capture.status).toBe('degraded');
        expect(noStore.capture.reason).toMatch(/no SiteModelStore was available/);

        const emptyStore = resolveSiteCapture([{ label: 'threaded', store: storeWith(null) }], 5);
        expect(emptyStore.capture.reason).toMatch(/a SiteModelStore was available/);
    });
});

describe('§L-545 — the provenance survives the save/close/reopen round-trip', () => {
    // JSON is the on-disk format (ProjectSerializer.stringify → JSON.stringify), so
    // a round-trip through it is the real persistence boundary for a plain field.
    it('survives JSON stringify/parse (the monolithic save path)', () => {
        const { site, capture } = resolveSiteCapture(
            [{ label: 'threaded', store: storeWith(makeSite()) }],
            7,
        );
        const reopened = JSON.parse(JSON.stringify({ site, siteCapture: capture })) as {
            site: SiteModel | null;
            siteCapture: typeof capture;
        };
        expect(reopened.site?.location.latitude).toBeCloseTo(BARCELONA.lat, 4);
        expect(reopened.siteCapture.status).toBe('captured');
        expect(reopened.siteCapture.source).toBe('threaded');
    });

    // THE OTHER HALF OF THE L-188 LESSON. `splitSnapshotByLevel` enumerates header
    // fields EXPLICITLY, so anything not listed is silently dropped on the streamed
    // path. A `degraded` stamp that survived a small save but vanished on a large
    // one would make the loss look conditional on file size — worse than no stamp.
    it('survives the STREAMED split→merge round-trip, both when captured and when degraded', () => {
        const site = makeSite();
        for (const fixture of [
            resolveSiteCapture([{ label: 'threaded', store: storeWith(site) }], 7),
            resolveSiteCapture([{ label: 'threaded', store: storeWith(null) }], 7),
        ]) {
            const snapshot = {
                schemaVersion: 5,
                timestamp: 0,
                projectName: 'P',
                projectId: 'proj-bcn',
                levels: [], grids: [], walls: [], windows: [], doors: [], slabs: [],
                columns: [], stairs: [], beams: [], curtainWalls: [], roofs: [],
                furniture: [], handrails: [], plumbing: [], openings: [],
                elementCount: 0,
                site: fixture.site ?? undefined,
                siteCapture: fixture.capture,
            } as unknown as Parameters<typeof splitSnapshotByLevel>[0];

            const split = splitSnapshotByLevel(snapshot);
            const merged = mergeSnapshotFromHeaderAndLevels(
                split.header,
                split.levelChunks.values(),
                split.orphan,
            ) as unknown as {
                site?: SiteModel | null;
                siteCapture?: { status: string; source: string };
            };

            expect(merged.siteCapture, 'siteCapture must not be dropped by the streaming split').toBeDefined();
            expect(merged.siteCapture!.status).toBe(fixture.capture.status);
            expect(merged.siteCapture!.source).toBe(fixture.capture.source);
            if (fixture.site) {
                expect(merged.site?.location.latitude).toBeCloseTo(BARCELONA.lat, 4);
            }
        }
    });
});
