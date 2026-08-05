// §STALE-ASYNC-ZONING (L-644) — a SECOND, DISTINCT member of the "purple sits on the wrong
// plot" family, found investigating a founder screenshot (Barcelona, "Select parcel" flow):
// the 3D massing sat on a NEIGHBOURING building's footprint rather than the selected parcel.
//
// 9acd599d (2026-07-28, [[site-origin-on-parcel-regression]]) fixed a DETERMINISTIC bug —
// every affected commit projected its ring about a stale geocode anchor, offsetting it by
// hundreds of metres. That fix is unchanged and still correct (see SiteBoundaryMap2D.ts
// commit(), which still runs parcelFrameOrigin → dispatchSiteLocation → buildBoundaryFromLatLonRing
// in that order — verified by reading the current file, not assumed from memory).
//
// THIS is a RACE, not a coordinate-math bug — which is why it is INTERMITTENT and looks
// "parcel-specific" rather than universal (founder-reported symptom: "only some parcels").
// Barcelona's real-envelope resolution (`applyBcnZoningThenFallback` in siteDispatch.ts) is a
// CHAIN of real network round-trips (MUC clau + Catastro parcel, then the manzana block, then
// roads, then the alçada street-width construction) that can take seconds. `dispatchEnvelope`
// writes the resolved envelope onto the site UNCONDITIONALLY, keyed only by `siteId` — which
// does not change across a Redraw (§L-384) or a re-selected parcel; only `site.parcel.boundary`
// does. So: commit parcel A (kicks off the chain) → before it resolves, Redraw/select a
// DIFFERENT parcel B and commit it (B's own envelope lands correctly) → A's chain FINALLY
// resolves and clobbers the live B envelope with A's geometry. Because `parcelFrameOrigin`
// anchors every ring near its OWN first vertex, A's inset ring renders at roughly A's own
// on-plot coordinates INSIDE B's ENU frame — a displacement on the order of ONE PARCEL, not
// hundreds of metres. That reads exactly as "the purple volume sits on the neighbouring plot".
//
// These tests pin the PURE comparison `isZoningResponseStale` the guard
// (`bcnZoningStillCurrent`, siteDispatch.ts) is built on: given the polygon an in-flight async
// zoning fetch was launched to solve, and the polygon actually committed on the Site right now,
// it must return STALE exactly when — and only when — they differ.

import { describe, it, expect } from 'vitest';
import { isZoningResponseStale } from '../src/ui/site/siteDispatch';

type Pt = { x: number; z: number };

// A ~12 m square parcel (A) and its neighbour one plot over (B) — same scale offset the
// founder's screenshot showed ("sits on the neighbouring building"), not a hundreds-of-metres
// slide (that is the DIFFERENT, already-fixed 9acd599d defect).
const PARCEL_A: Pt[] = [
    { x: 0, z: 0 },
    { x: 12, z: 0 },
    { x: 12, z: 18 },
    { x: 0, z: 18 },
];
const PARCEL_B: Pt[] = [
    { x: 0, z: 0 },
    { x: 14, z: 0 },
    { x: 14, z: 20 },
    { x: 0, z: 20 },
];

describe('§STALE-ASYNC-ZONING (L-644) isZoningResponseStale — pure guard', () => {
    it('THE RACE: a different (even similarly-shaped) parcel now committed ⇒ STALE', () => {
        // The in-flight fetch was launched for A; B is what is on screen now.
        expect(isZoningResponseStale(PARCEL_A, PARCEL_B)).toBe(true);
    });

    it('THE HAPPY PATH: the SAME parcel is still committed ⇒ not stale, safe to write', () => {
        expect(isZoningResponseStale(PARCEL_A, PARCEL_A)).toBe(false);
        // A structurally-identical-but-freshly-cloned polygon (mirrors what a store read-back
        // gives you — a NEW array/object, same values) must still compare as current: this is a
        // VALUE comparison, not a reference-identity check.
        const clone = PARCEL_A.map((p) => ({ x: p.x, z: p.z }));
        expect(isZoningResponseStale(PARCEL_A, clone)).toBe(false);
    });

    it('no boundary committed at all (cleared / never set) ⇒ STALE (nothing to write onto)', () => {
        expect(isZoningResponseStale(PARCEL_A, null)).toBe(true);
        expect(isZoningResponseStale(PARCEL_A, undefined)).toBe(true);
        expect(isZoningResponseStale(PARCEL_A, [])).toBe(true);
    });

    it('a different VERTEX COUNT (a re-drawn shape) ⇒ STALE even if early vertices coincide', () => {
        const triangleSharingFirstTwoVerts: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 6, z: 10 }];
        expect(isZoningResponseStale(PARCEL_A, triangleSharingFirstTwoVerts)).toBe(true);
    });

    it('a sub-millimetre float wobble (re-serialised through the store) is NOT stale', () => {
        const wobble = PARCEL_A.map((p) => ({ x: p.x + 1e-9, z: p.z - 1e-9 }));
        expect(isZoningResponseStale(PARCEL_A, wobble)).toBe(false);
    });

    it('a real (if small) coordinate drift IS stale — the guard must not be so loose it hides the race', () => {
        const driftedByOneCm = PARCEL_A.map((p) => ({ x: p.x + 0.01, z: p.z }));
        expect(isZoningResponseStale(PARCEL_A, driftedByOneCm)).toBe(true);
    });
});
