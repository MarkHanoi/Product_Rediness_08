// L-536 PROBE — does the parcel BOUNDARY survive the frame chain that the three
// surfaces (2D map / 2D plan / 3D Site) each read?
//
// WHY A PROBE. This subsystem produced two confidently-wrong diagnoses today (L-525 → L-529).
// The four candidate mechanisms in the audit row need OPPOSITE fixes, so the only honest first
// move is a measurement. It reuses the PRODUCTION functions so it cannot disagree with the code
// path it diagnoses (the SPAIN-CADASTRAL-DISSOLVE-PROBE precedent):
//
//   • `server/parcelZoningProxy.js`            → the real Catastro ring (what the 2D map draws)
//   • `boundaryProjection.buildBoundaryFromLatLonRing` → commit projection (map2d commit())
//   • `projectTrueNorth.deriveProjectNorthAngleFromParcel` + `trueVectorToProjectNorth`
//                                              → the θ de-rotation `dispatchParcelBoundary` applies
//                                                 (what the 2D PLAN + the store then hold)
//   • `sceneEnuFrame.sceneXZToEnu`             → the θ re-application CesiumViewport's
//                                                 `toCartesian` applies (what the 3D Site draws)
//
// Run:  npx tsx scratchpad/probe-l536-frames.mts

import { fetchParcelAtPoint } from '../server/parcelZoningProxy.js';
import { buildBoundaryFromLatLonRing, latLonToSceneXZ } from '../apps/editor/src/ui/site/boundaryProjection.js';
import {
    deriveProjectNorthAngleFromParcel,
    trueVectorToProjectNorth,
} from '../apps/editor/src/ui/site/overlay/projectTrueNorth.js';
import { sceneXZToEnu } from '../apps/editor/src/ui/geospatial/sceneEnuFrame.js';

const DEG = 180 / Math.PI;

/** Founder's screenshot area: Carrer de la Diputació × Rambla de Catalunya. */
const PROBE_POINTS: Array<{ label: string; lat: number; lon: number }> = [
    { label: 'Diputacio x Rambla Catalunya (NE)', lat: 41.38885, lon: 2.16385 },
    { label: 'Diputacio x Rambla Catalunya (NW)', lat: 41.38905, lon: 2.16290 },
    { label: 'Diputacio x Rambla Catalunya (SE)', lat: 41.38835, lon: 2.16345 },
    { label: 'Diputacio 250-ish', lat: 41.38860, lon: 2.16180 },
];

interface LL { lat: number; lon: number }

function edgeLengths(ring: LL[]): number[] {
    const out: number[] = [];
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const pa = latLonToSceneXZ(a, a.lat, a.lon);
        const pb = latLonToSceneXZ(b, a.lat, a.lon);
        out.push(Math.hypot(pb.x - pa.x, pb.z - pa.z));
    }
    return out;
}

function main2() { /* noop */ }
void main2;

async function run() {
    for (const p of PROBE_POINTS) {
        console.log(`\n══════ ${p.label}  (${p.lat}, ${p.lon}) ══════`);
        const parcel = await fetchParcelAtPoint(p.lon, p.lat);
        if (!parcel) { console.log('  no parcel returned.'); continue; }
        const ring: LL[] = parcel.ring;
        console.log(`  refcat=${parcel.refcat}  areaM2=${parcel.areaM2?.toFixed?.(0) ?? 'n/a'}  address=${parcel.address ?? ''}`);

        // ── SURFACE 1: the 2D MAP. It draws `ring` verbatim in lat/lon. ────────────────
        const lens = edgeLengths(ring);
        console.log(`  [2D MAP]  ring vertices = ${ring.length}`);
        console.log(`            edge lengths (m) = ${lens.map((l) => l.toFixed(1)).join(' / ')}`);
        console.log(`            longest two = ${[...lens].sort((a, b) => b - a).slice(0, 2).map((l) => l.toFixed(1)).join(', ')}`);

        // ── COMMIT: exactly what SiteBoundaryMap2D.commit() does. ─────────────────────
        // Case A: no prior Site → origin = first vertex.
        // Case B: a geocoded Site exists ~300 m away → origin = the site anchor.
        for (const [caseName, origin] of [
            ['A origin=first vertex', { lat: ring[0]!.lat, lon: ring[0]!.lon }],
            ['B origin=site anchor 300 m away', { lat: p.lat + 0.0027, lon: p.lon - 0.0018 }],
        ] as Array<[string, LL]>) {
            const built = buildBoundaryFromLatLonRing(ring, origin.lat, origin.lon);
            const theta = deriveProjectNorthAngleFromParcel(built.polygon);

            // dispatchParcelBoundary's de-rotation (the STORE / 2D-PLAN frame).
            const stored = theta === 0
                ? built.polygon
                : built.polygon.map((q) => {
                      const e = trueVectorToProjectNorth({ east: q.x, north: -q.z }, theta);
                      return { x: e.east, z: -e.north };
                  });

            // CesiumViewport.toCartesian's θ re-application (the 3D-SITE frame).
            const back = stored.map((q) => sceneXZToEnu(q.x, q.z, theta));

            // Compare against the TRUE-north XZ the map drew (built.polygon → east/north).
            let maxErr = 0;
            for (let i = 0; i < built.polygon.length; i++) {
                const want = { east: built.polygon[i]!.x, north: -built.polygon[i]!.z };
                const got = back[i]!;
                maxErr = Math.max(maxErr, Math.hypot(got.east - want.east, got.north - want.north));
            }
            console.log(
                `  [${caseName}]  built=${built.polygon.length} pts · θ=${(theta * DEG).toFixed(2)}° · ` +
                    `stored=${stored.length} pts · 3D-round-trip max error = ${maxErr.toExponential(2)} m`,
            );
        }
    }
}

run().catch((e) => { console.error('[probe] FAILED', e); process.exit(1); });
