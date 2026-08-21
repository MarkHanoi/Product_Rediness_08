// A.7.c.2 (Phase A · Sprint 2) — site.updateZoning / site.setFootprint
// / site.clearFootprint command tests.

import { describe, expect, it } from 'vitest';
import { SiteModelStore } from '../src/SiteModelStore.js';
import { SiteModelSchema } from '@pryzm/schemas';
import {
    siteCreate,
    siteUpdateZoning,
    siteSetFootprint,
    siteClearFootprint,
} from '../src/site-commands/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixture — a Site with a 10×8 parcel and 2m setbacks.
// ─────────────────────────────────────────────────────────────────────────────

function setupSite(): SiteModelStore {
    const store = new SiteModelStore();
    siteCreate(
        {
            projectId: 'proj-001',
            location: {},
            parcel: {
                boundary: {
                    polygon: [
                        { x: 0, z: 0 },
                        { x: 10, z: 0 },
                        { x: 10, z: 8 },
                        { x: 0, z: 8 },
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

// ─────────────────────────────────────────────────────────────────────────────
// site.updateZoning
// ─────────────────────────────────────────────────────────────────────────────

// ADR-0270 option A / C58 §1.7a (L-451 A1c, L-445) — the inset ring is the PERSISTED TRUTH for
// "what may I build here". These cover the round-trip that A1c wired but never asserted, and
// which L-445 depends on: without persistence the ring lives only in a module global and dies
// on reload, so the 3D Site draws no envelope while the toggle still reports "ON".
describe('siteUpdateZoning — buildableRing (C58 §1.7a persisted truth)', () => {
    const RING = [
        { x: 2, z: 2 },
        { x: 8, z: 2 },
        { x: 8, z: 6 },
        { x: 2, z: 6 },
    ];

    it('persists the inset ring onto the Parcel', () => {
        const store = setupSite();
        const result = siteUpdateZoning({ siteId: 'site_proj-001', buildableRing: RING }, store);
        expect(result.ok).toBe(true);
        expect(store.getSite()!.parcel.buildableRing).toEqual(RING);
    });

    it('defaults to null on a fresh parcel (never a fabricated ring)', () => {
        expect(setupSite().getSite()!.parcel.buildableRing).toBeNull();
    });

    it('OMITTED leaves an existing ring untouched (delta semantics)', () => {
        const store = setupSite();
        siteUpdateZoning({ siteId: 'site_proj-001', buildableRing: RING }, store);
        // A later zoning patch that says nothing about the ring must not erase it — otherwise
        // any setback edit would silently drop the envelope.
        siteUpdateZoning({ siteId: 'site_proj-001', maxFAR: 1.5 }, store);
        const after = store.getSite()!;
        expect(after.parcel.buildableRing).toEqual(RING);
        expect(after.parcel.maxFAR).toBe(1.5);
    });

    it('explicit null CLEARS a stale ring (a wrong ring is worse than none — C58 §1.4)', () => {
        const store = setupSite();
        siteUpdateZoning({ siteId: 'site_proj-001', buildableRing: RING }, store);
        siteUpdateZoning({ siteId: 'site_proj-001', buildableRing: null }, store);
        expect(store.getSite()!.parcel.buildableRing).toBeNull();
    });

    it('does not disturb the boundary polygon (§1.4 immutability)', () => {
        const store = setupSite();
        const before = store.getSite()!.parcel.boundary.polygon;
        siteUpdateZoning({ siteId: 'site_proj-001', buildableRing: RING }, store);
        expect(store.getSite()!.parcel.boundary.polygon).toEqual(before);
    });
});

// ADR-0270 option A / C58 §1.7a — `null` setbacks are the honest answer for a zone that is NOT
// setback-governed (*alineación a vial* + *profundidad edificable*). §1.7a: "An engine or adapter
// MUST NOT synthesise 'equivalent effective setbacks'." Before the fields were nullable there was
// nowhere to PUT that answer — the only options were a fabricated triple or stale numbers from a
// previous solve, both of which look well-formed and are undetectably wrong downstream. This is
// the clause the A1c tripwire was guarding.
describe('siteUpdateZoning — null setbacks (C58 §1.7a, non-setback zones)', () => {
    it('stores an explicit null per edge', () => {
        const store = setupSite();
        const result = siteUpdateZoning(
            { siteId: 'site_proj-001', setbacks: { front: null, side: null, rear: null } },
            store,
        );
        expect(result.ok).toBe(true);
        expect(store.getSite()!.parcel.setbacks).toEqual({ front: null, side: null, rear: null });
    });

    // THE POINT OF THE WHOLE CHANGE: null ("not setback-governed") must not collapse into
    // 0 ("setback-governed, requirement zero"). Collapsing them re-creates the defect quietly.
    it('keeps null DISTINCT from 0', () => {
        const store = setupSite();
        siteUpdateZoning({ siteId: 'site_proj-001', setbacks: { front: null, side: 0 } }, store);
        const { setbacks } = store.getSite()!.parcel;
        expect(setbacks.front).toBeNull();
        expect(setbacks.side).toBe(0);
        expect(setbacks.front).not.toBe(0);
    });

    // An alignment solve must ERASE the stale triple, not merely decline to mention it —
    // omitting leaves numbers describing a parcel they no longer describe.
    it('an explicit null ERASES a previously-solved setback', () => {
        const store = setupSite();
        siteUpdateZoning({ siteId: 'site_proj-001', setbacks: { front: 5, side: 3, rear: 4 } }, store);
        siteUpdateZoning(
            { siteId: 'site_proj-001', setbacks: { front: null, side: null, rear: null } },
            store,
        );
        expect(store.getSite()!.parcel.setbacks).toEqual({ front: null, side: null, rear: null });
    });

    it('OMITTED still means "untouched" — null and absent are different instructions', () => {
        const store = setupSite();
        siteUpdateZoning({ siteId: 'site_proj-001', setbacks: { front: 5, side: 3, rear: 4 } }, store);
        siteUpdateZoning({ siteId: 'site_proj-001', maxHeight: 12 }, store);
        expect(store.getSite()!.parcel.setbacks).toEqual({ front: 5, side: 3, rear: 4 });
    });

    it('still rejects a negative setback', () => {
        const store = setupSite();
        expect(siteUpdateZoning({ siteId: 'site_proj-001', setbacks: { front: -1 } }, store).ok)
            .toBe(false);
    });
});

describe('siteUpdateZoning', () => {
    it('patches setbacks without touching the polygon (§1.4 immutability)', () => {
        const store = setupSite();
        const polygonBefore = store.getSite()!.parcel.boundary.polygon;
        const result = siteUpdateZoning(
            {
                siteId: 'site_proj-001',
                setbacks: { front: 5, side: 3, rear: 4 },
            },
            store,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('site.zoning-updated');
        const after = store.getSite()!;
        expect(after.parcel.setbacks).toEqual({ front: 5, side: 3, rear: 4 });
        // Polygon UNCHANGED — same reference + same vertices.
        expect(after.parcel.boundary.polygon).toBe(polygonBefore);
    });

    it('patches maxFAR + maxHeight', () => {
        const store = setupSite();
        const result = siteUpdateZoning(
            {
                siteId: 'site_proj-001',
                maxFAR: 2.5,
                maxHeight: 18,
            },
            store,
        );
        if (!result.ok) throw new Error('unreachable');
        const after = store.getSite()!;
        expect(after.parcel.maxFAR).toBe(2.5);
        expect(after.parcel.maxHeight).toBe(18);
    });

    it('accepts setting maxFAR back to null (unrestricted)', () => {
        const store = setupSite();
        siteUpdateZoning(
            { siteId: 'site_proj-001', maxFAR: 1.5 },
            store,
        );
        const result = siteUpdateZoning(
            { siteId: 'site_proj-001', maxFAR: null },
            store,
        );
        if (!result.ok) throw new Error('unreachable');
        expect(store.getSite()!.parcel.maxFAR).toBeNull();
    });

    it('patches zoning category + overlays', () => {
        const store = setupSite();
        const result = siteUpdateZoning(
            {
                siteId: 'site_proj-001',
                zoning: {
                    category: 'R-3',
                    overlays: ['conservation-area', 'flood-zone-3'],
                },
            },
            store,
        );
        if (!result.ok) throw new Error('unreachable');
        const after = store.getSite()!;
        expect(after.parcel.zoning.category).toBe('R-3');
        expect(after.parcel.zoning.overlays).toEqual([
            'conservation-area',
            'flood-zone-3',
        ]);
    });

    it('partial setbacks: only-front patch preserves the other axes', () => {
        const store = setupSite();
        const result = siteUpdateZoning(
            { siteId: 'site_proj-001', setbacks: { front: 5 } },
            store,
        );
        if (!result.ok) throw new Error('unreachable');
        const after = store.getSite()!;
        expect(after.parcel.setbacks).toEqual({ front: 5, side: 2, rear: 2 });
    });

    it('rejects when no Site exists', () => {
        const store = new SiteModelStore();
        const result = siteUpdateZoning(
            { siteId: 'site_proj-001', maxFAR: 1 },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-site');
    });

    it('rejects on siteId mismatch', () => {
        const store = setupSite();
        const result = siteUpdateZoning(
            { siteId: 'site_proj-other', maxFAR: 1 },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-site');
    });

    it('rejects on negative setback (Zod)', () => {
        const store = setupSite();
        const result = siteUpdateZoning(
            { siteId: 'site_proj-001', setbacks: { front: -1 } },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('invalid-payload');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// site.setFootprint — §1.6 soft-warn containment
// ─────────────────────────────────────────────────────────────────────────────

describe('siteSetFootprint', () => {
    it('sets a compliant footprint with no warnings', () => {
        const store = setupSite();
        const result = siteSetFootprint(
            {
                siteId: 'site_proj-001',
                footprint: {
                    polygon: [
                        { x: 3, z: 3 },
                        { x: 7, z: 3 },
                        { x: 7, z: 5 },
                        { x: 3, z: 5 },
                    ],
                },
            },
            store,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('site.footprint-set');
        expect(result.warnings).toBeUndefined();
        expect(store.getSite()?.footprint).not.toBeNull();
    });

    it('SUCCEEDS with warnings when footprint vertices violate setbacks (§1.6 non-fatal lint)', () => {
        const store = setupSite();
        const result = siteSetFootprint(
            {
                siteId: 'site_proj-001',
                footprint: {
                    polygon: [
                        { x: 1, z: 1 },     // 1m from front edge — needs 2m
                        { x: 9, z: 1 },
                        { x: 9, z: 7 },
                        { x: 1, z: 7 },
                    ],
                },
            },
            store,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.warnings).toBeDefined();
        expect(result.warnings?.containment?.ok).toBe(false);
        expect(
            result.warnings?.containment?.violations.length,
        ).toBeGreaterThan(0);
        // Footprint STILL committed despite warnings.
        expect(store.getSite()?.footprint?.polygon).toHaveLength(4);
    });

    it('warns when footprint vertex is outside the parcel polygon', () => {
        const store = setupSite();
        const result = siteSetFootprint(
            {
                siteId: 'site_proj-001',
                footprint: {
                    polygon: [
                        { x: 5, z: 3 },
                        { x: 15, z: 3 },     // X=15 outside parcel
                        { x: 15, z: 5 },
                        { x: 5, z: 5 },
                    ],
                },
            },
            store,
        );
        if (!result.ok) throw new Error('unreachable');
        expect(result.warnings?.containment?.violations.some(
            (v) => v.kind === 'outside-parcel',
        )).toBe(true);
    });

    it('rejects when no Site exists', () => {
        const store = new SiteModelStore();
        const result = siteSetFootprint(
            {
                siteId: 'site_proj-001',
                footprint: { polygon: [{ x: 0, z: 0 }] },
            },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-site');
    });

    it('rejects on invalid payload (Zod)', () => {
        const store = setupSite();
        const result = siteSetFootprint(
            { siteId: '', footprint: { polygon: [] } },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('invalid-payload');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// site.clearFootprint
// ─────────────────────────────────────────────────────────────────────────────

describe('siteClearFootprint', () => {
    it('sets footprint to null and emits site.footprint-cleared', () => {
        const store = setupSite();
        // First set a footprint so we have something to clear.
        siteSetFootprint(
            {
                siteId: 'site_proj-001',
                footprint: {
                    polygon: [
                        { x: 3, z: 3 },
                        { x: 7, z: 3 },
                        { x: 7, z: 5 },
                        { x: 3, z: 5 },
                    ],
                },
            },
            store,
        );
        expect(store.getSite()?.footprint).not.toBeNull();

        const result = siteClearFootprint(
            { siteId: 'site_proj-001' },
            store,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('site.footprint-cleared');
        expect(store.getSite()?.footprint).toBeNull();
    });

    it('is idempotent on already-null footprint — still emits the event', () => {
        const store = setupSite();
        // Footprint starts null (no setFootprint called).
        expect(store.getSite()?.footprint).toBeNull();
        const result = siteClearFootprint(
            { siteId: 'site_proj-001' },
            store,
        );
        expect(result.ok).toBe(true);
    });

    it('rejects when no Site exists', () => {
        const store = new SiteModelStore();
        const result = siteClearFootprint(
            { siteId: 'site_proj-001' },
            store,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-site');
    });

    it('rejects on invalid payload (empty siteId)', () => {
        const store = setupSite();
        const result = siteClearFootprint({ siteId: '' }, store);
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('invalid-payload');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §GIS-ENVELOPE-DETERMINATION-PERSIST (L-1654) — the FULL dated determination
// record. The ring above persists the geometry; this persists the provenance
// the L-445 reduced card had to refuse to fabricate. Delta semantics mirror
// buildableRing exactly: omitted = untouched, null = explicit clear.
// ─────────────────────────────────────────────────────────────────────────────
describe('siteUpdateZoning — buildableDetermination (§L-1654 dated determination record)', () => {
    const RING = [
        { x: 2, z: 2 },
        { x: 8, z: 2 },
        { x: 8, z: 6 },
        { x: 2, z: 6 },
    ];
    const DETERMINATION = {
        envelope: {
            insetPolygon: RING,
            insetAreaM2: 24,
            maxHeight_m: 12,
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

    it('persists the full record onto the Parcel — envelope, provenance rows and date intact', () => {
        const store = setupSite();
        const result = siteUpdateZoning(
            { siteId: 'site_proj-001', buildableDetermination: DETERMINATION }, store);
        expect(result.ok).toBe(true);
        const stored = store.getSite()!.parcel.buildableDetermination;
        expect(stored).not.toBeNull();
        expect(stored!.determinedAtIso).toBe('2026-08-21T10:00:00.000Z');
        expect(stored!.envelope.confidence).toBe('block-constructed');
        expect(stored!.envelope.derivation[0]!.ordinanceRef).toBe('PGM Art. 242.2');
    });

    it('defaults to null for a parcel that never solved (NOT RECORDED, not blank)', () => {
        expect(setupSite().getSite()!.parcel.buildableDetermination ?? null).toBeNull();
    });

    it('omitting the field leaves a stored record untouched (delta semantics)', () => {
        const store = setupSite();
        siteUpdateZoning({ siteId: 'site_proj-001', buildableDetermination: DETERMINATION }, store);
        siteUpdateZoning({ siteId: 'site_proj-001', maxHeight: 20 }, store);
        const after = store.getSite()!;
        expect(after.parcel.maxHeight).toBe(20);
        expect(after.parcel.buildableDetermination?.determinedAtIso)
            .toBe('2026-08-21T10:00:00.000Z');
    });

    it('an explicit null CLEARS a stale record', () => {
        const store = setupSite();
        siteUpdateZoning({ siteId: 'site_proj-001', buildableDetermination: DETERMINATION }, store);
        siteUpdateZoning({ siteId: 'site_proj-001', buildableDetermination: null }, store);
        expect(store.getSite()!.parcel.buildableDetermination).toBeNull();
    });

    it('a REFUSAL determination persists too — a cited refusal is a determination', () => {
        const store = setupSite();
        const refusal = {
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
        };
        const result = siteUpdateZoning(
            { siteId: 'site_proj-001', buildableDetermination: refusal }, store);
        expect(result.ok).toBe(true);
        const stored = store.getSite()!.parcel.buildableDetermination;
        expect(stored!.envelope.status).toBe('not-applicable');
        expect(stored!.envelope.refusal?.code).toBe('derived-plan');
    });

    it('survives a JSON round-trip through the SiteModel (the ProjectSerializer path)', () => {
        const store = setupSite();
        siteUpdateZoning({ siteId: 'site_proj-001', buildableDetermination: DETERMINATION }, store);
        const json = JSON.parse(JSON.stringify(store.getSite()));
        // The EXACT load-path call: ProjectLoader -> restoreSiteState -> SiteModelSchema.parse.
        const parsed = SiteModelSchema.parse(json);
        expect(parsed.parcel.buildableDetermination?.envelope.maxHeight_m).toBe(12);
        expect(parsed.parcel.buildableDetermination?.determinedAtIso)
            .toBe('2026-08-21T10:00:00.000Z');
        // ...and a LEGACY snapshot (field absent) parses to null: NOT RECORDED, never a crash.
        const legacy = JSON.parse(JSON.stringify(store.getSite()));
        delete legacy.parcel.buildableDetermination;
        expect(SiteModelSchema.parse(legacy).parcel.buildableDetermination).toBeNull();
    });
});
