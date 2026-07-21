// L-536 PROBE, STAGE 2 — is θ (project north) STABLE and CORRECT on real cadastral parcels?
//
// Stage 1 proved the frame ROUND-TRIP is exact (1e-14 m), which rules out the "the 3D and the
// map draw different rings" theory ARITHMETICALLY. What it also showed, incidentally, is that
// θ came out as +37.52°, +44.56°, −44.70° and −34.73° on four parcels of the SAME Cerdà grid —
// where the grid bearing is a single number. This stage measures that properly.
//
// θ is derived by `deriveProjectNorthAngleFromParcel` = "square the parcel to its LONGEST edge".
// On a hand-drawn rectangle the longest edge IS the frontage. On a real Catastro parcel the ring
// has 17–43 vertices and the longest edge is often a party wall, a courtyard return or a
// staircase notch. The consequences are not cosmetic: θ defines the AUTHORING FRAME, so every
// wall, room and the 2D plan drawing of the parcel are squared to whatever edge won.
//
// MEASURES:
//   (1) INVARIANT — after de-rotation, re-deriving θ from the stored ring MUST be 0.
//   (2) SCATTER   — θ across the parcels of ONE block, which physically share one bearing.
//   (3) SKEW      — θ vs the block's own dominant bearing (the street), per parcel.
//   (4) SCALE     — the equirectangular projection's anisotropic error at this latitude,
//                   to bound "could the projection itself distort the SHAPE?".
//
// Run:  npx tsx scratchpad/probe-l536-theta.mts

import { buildParcelBboxUrl, parseParcelCollectionGml, manzanaPrefix } from '../server/parcelZoningProxy.js';
import { buildBoundaryFromLatLonRing } from '../apps/editor/src/ui/site/boundaryProjection.js';
import {
    deriveProjectNorthAngleFromParcel,
    trueVectorToProjectNorth,
} from '../apps/editor/src/ui/site/overlay/projectTrueNorth.js';

const DEG = 180 / Math.PI;
const CENTRE = { lat: 41.38885, lon: 2.16385 }; // Diputació × Rambla de Catalunya

interface LL { lat: number; lon: number }
type Pt = { x: number; z: number };

function derotate(ring: Pt[], theta: number): Pt[] {
    if (theta === 0) return ring;
    return ring.map((q) => {
        const e = trueVectorToProjectNorth({ east: q.x, north: -q.z }, theta);
        return { x: e.east, z: -e.north };
    });
}

/** Fold any bearing into (−45°, +45°] mod 90° — the same fold θ uses. */
function fold(deg: number): number {
    let d = deg % 90;
    if (d > 45) d -= 90;
    if (d <= -45) d += 90;
    return d;
}

async function main() {
    const url = buildParcelBboxUrl(CENTRE.lat, CENTRE.lon, 0.002);
    const res = await fetch(url);
    const gml = await res.text();
    const all = parseParcelCollectionGml(gml);
    console.log(`[probe] ${all.length} parcels in the ±220 m bbox around Diputació × Rambla de Catalunya.\n`);

    // ── (4) PROJECTION SCALE — bound the "the projection distorts the shape" theory. ──────
    const a = 6378137, f = 1 / 298.257223563;
    const e2 = f * (2 - f);
    const lat0 = CENTRE.lat / DEG;
    const s = Math.sin(lat0);
    const N = a / Math.sqrt(1 - e2 * s * s);              // prime-vertical radius
    const M = (a * (1 - e2)) / Math.pow(1 - e2 * s * s, 1.5); // meridional radius
    console.log(
        `[SCALE] latLonToSceneXZ uses R = 6378137 m on BOTH axes.\n` +
            `        true East scale  = ${N.toFixed(0)} m  → error ${(((a - N) / N) * 100).toFixed(3)} %\n` +
            `        true North scale = ${M.toFixed(0)} m  → error ${(((a - M) / M) * 100).toFixed(3)} %\n` +
            `        differential (the SHAPE-distorting part) = ` +
            `${((a / N - a / M) / (a / M) * 100).toFixed(3)} % ⇒ ` +
            `${(Math.abs(a / N - a / M) / (a / M) * 35).toFixed(3)} m over a 35 m parcel.\n`,
    );

    // ── Group by manzana; take the block containing the founder's area. ───────────────────
    const groups = new Map<string, typeof all>();
    for (const p of all) {
        const m = manzanaPrefix(p.refcat);
        if (!m) continue;
        const g = groups.get(m) ?? [];
        g.push(p);
        groups.set(m, g);
    }
    const blocks = [...groups.entries()].filter(([, g]) => g.length >= 5).slice(0, 6);

    let invariantViolations = 0;
    for (const [manzana, parcels] of blocks) {
        // Block bearing: the dominant edge of the DISSOLVED extent — approximated here by the
        // longest edge across ALL parcels in the block (a real block side, ~50–110 m in the
        // Cerdà grid, dwarfs any internal party wall).
        const origin: LL = { lat: parcels[0]!.ring[0]!.lat, lon: parcels[0]!.ring[0]!.lon };
        let blockBestLen = 0, blockPhi = 0;
        for (const p of parcels) {
            const b = buildBoundaryFromLatLonRing(p.ring as LL[], origin.lat, origin.lon);
            for (let i = 0; i < b.polygon.length; i++) {
                const q = b.polygon[i]!, r = b.polygon[(i + 1) % b.polygon.length]!;
                const dE = r.x - q.x, dN = -(r.z - q.z);
                const l2 = dE * dE + dN * dN;
                if (l2 > blockBestLen) { blockBestLen = l2; blockPhi = Math.atan2(dN, dE) * DEG; }
            }
        }
        const blockTheta = fold(-blockPhi);

        const thetas: number[] = [];
        const skews: number[] = [];
        for (const p of parcels) {
            const built = buildBoundaryFromLatLonRing(p.ring as LL[], origin.lat, origin.lon);
            const theta = deriveProjectNorthAngleFromParcel(built.polygon);
            thetas.push(theta * DEG);
            skews.push(fold(theta * DEG - blockTheta));
            // (1) INVARIANT — the de-rotated ring must be square in its own frame.
            const stored = derotate(built.polygon, theta);
            const thetaAgain = deriveProjectNorthAngleFromParcel(stored) * DEG;
            if (Math.abs(thetaAgain) > 1e-6) invariantViolations++;
        }
        const absSkew = skews.map(Math.abs);
        const maxSkew = Math.max(...absSkew);
        const meanSkew = absSkew.reduce((s2, v) => s2 + v, 0) / absSkew.length;
        const over3 = absSkew.filter((v) => v > 3).length;
        console.log(
            `[BLOCK ${manzana}] ${parcels.length} parcels · block bearing θ_block = ${blockTheta.toFixed(2)}°\n` +
                `   per-parcel θ = ${thetas.map((t) => t.toFixed(1)).join(', ')}\n` +
                `   SKEW from the block frame: mean ${meanSkew.toFixed(2)}° · max ${maxSkew.toFixed(2)}° · ` +
                `${over3}/${parcels.length} parcels are >3° off the street grid`,
        );
    }
    console.log(`\n[INVARIANT] de-rotated ring re-derives θ≈0 — violations: ${invariantViolations}`);
}

main().catch((e) => { console.error('[probe] FAILED', e); process.exit(1); });
