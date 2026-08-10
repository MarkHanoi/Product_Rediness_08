// @pryzm/stores — SiteQueryService (ADR-0315 U2.4).
//
// THE headless read surface for site context. Before this, every site read was
// either a raw `SiteModelStore` snapshot or a helper inside the 4000-line UI
// module `apps/editor/src/ui/site/siteDispatch.ts` — nothing a scope resolver,
// a generation adapter or a validation step could call without dragging in the
// editor. This service answers the questions those layers ask:
//
//   · where is the site (lat/lng), which way is TRUE north (θ)?
//   · what is the parcel boundary / the persisted buildable ring?
//   · what may I build here (footprint + source), and how high (maxHeightM)?
//   · is this XZ point inside the buildable footprint?
//
// AUTHORITY RULES (C19 / C58 / ADR-0270 — restated, not reinvented):
//   · `Parcel.buildableRing` is THE persisted buildable truth. When present it
//     wins; consumers must never re-inset setbacks themselves.
//   · setback `null` means "not setback-governed", which is NOT `0`.
//   · `maxHeight: null` means "no cap recorded", not "no limit exists" —
//     callers phrase accordingly (§CONTEXT-DATA-HONESTY).
//   · Absence of a site is reported as null, never as zeros.
//
// The zoning-cache staleness handling in `siteDispatch.resolveBuildableFootprint`
// (L-644) is a UI-flow concern and deliberately NOT duplicated here: this
// service reads the PERSISTED SiteModel only.
//
// INJECTION: the production SiteModel lives on `runtime.siteModelStore`; this
// package must not read `window`. The editor wires `setSiteProvider` in
// initTools (same pattern as FacadeOrientationService.setTrueNorthProvider);
// headless/tests inject their own. Unset provider = no site = nulls.

import type { SiteModelStore } from './SiteModelStore.js';

type SiteModelLike = ReturnType<SiteModelStore['getSite']>;

export interface SitePointXZ {
    readonly x: number;
    readonly z: number;
}

export interface BuildableFootprint {
    readonly polygon: readonly SitePointXZ[];
    /** 'envelope' = the persisted buildableRing; 'parcel' = raw parcel boundary
     *  (no ring recorded). The label matters: building to the raw parcel on a
     *  setback-governed site is only compliant if setbacks are handled later. */
    readonly source: 'envelope' | 'parcel';
}

export class SiteQueryService {
    private _provider: () => SiteModelLike | null = () => null;

    setSiteProvider(provider: () => SiteModelLike | null): void {
        this._provider = provider;
    }

    private _site(): SiteModelLike | null {
        try {
            return this._provider() ?? null;
        } catch {
            return null;
        }
    }

    /** Latitude/longitude/true-north, or null when no site is captured. */
    getLocation(): { latitude: number; longitude: number; trueNorth: number } | null {
        const loc = this._site()?.location;
        if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') return null;
        return { latitude: loc.latitude, longitude: loc.longitude, trueNorth: loc.trueNorth ?? 0 };
    }

    /** Project→true-north θ in radians; 0 when no site (the frame default). */
    getTrueNorth(): number {
        return this._site()?.location?.trueNorth ?? 0;
    }

    /** The legal parcel outline (scene-XZ), or null. */
    getParcelBoundary(): readonly SitePointXZ[] | null {
        const poly = this._site()?.parcel?.boundary?.polygon;
        return Array.isArray(poly) && poly.length >= 3 ? poly : null;
    }

    /** The PERSISTED buildable-envelope ring, or null when none was computed.
     *  Deliberately a separate accessor from the footprint: "no ring" and
     *  "ring = parcel" are different facts. */
    getBuildableRing(): readonly SitePointXZ[] | null {
        const ring = this._site()?.parcel?.buildableRing;
        return Array.isArray(ring) && ring.length >= 3 ? ring : null;
    }

    /** What may be built: the ring when persisted, else the raw parcel —
     *  labelled with its source. Null when neither exists. */
    getBuildableFootprint(): BuildableFootprint | null {
        const ring = this.getBuildableRing();
        if (ring) return { polygon: ring, source: 'envelope' };
        const parcel = this.getParcelBoundary();
        if (parcel) return { polygon: parcel, source: 'parcel' };
        return null;
    }

    /** Setbacks with the ADR-0270 null-semantics intact (null ≠ 0). */
    getSetbacks(): { front: number | null; side: number | null; rear: number | null } | null {
        const s = this._site()?.parcel?.setbacks;
        if (!s) return null;
        return { front: s.front ?? null, side: s.side ?? null, rear: s.rear ?? null };
    }

    /** The recorded height cap in metres, or null when none is recorded
     *  ("no cap recorded" is NOT "no limit exists"). */
    getMaxHeightM(): number | null {
        const h = this._site()?.parcel?.maxHeight;
        return typeof h === 'number' && Number.isFinite(h) ? h : null;
    }

    /**
     * Is the XZ point inside the buildable footprint (ring-first)?
     * Returns null when there is no footprint at all — "unknown" must never
     * collapse into "outside" (§CONTEXT-DATA-HONESTY).
     */
    containsPointXZ(point: SitePointXZ): boolean | null {
        const fp = this.getBuildableFootprint();
        if (!fp) return null;
        return pointInPolygonXZ(point, fp.polygon);
    }
}

/** Ray-casting point-in-polygon on scene-XZ (pure, exported for tests). */
export function pointInPolygonXZ(
    p: SitePointXZ,
    polygon: readonly SitePointXZ[],
): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i]!;
        const b = polygon[j]!;
        const intersects =
            (a.z > p.z) !== (b.z > p.z) &&
            p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x;
        if (intersects) inside = !inside;
    }
    return inside;
}

/** Module singleton — the editor wires its provider in initTools and exposes
 *  it as `window.siteQueryService` beside roomQueryService. */
export const siteQueryService = new SiteQueryService();
