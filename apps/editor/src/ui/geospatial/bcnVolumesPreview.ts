/**
 * §BCN-VOLUMES-PREVIEW (founder 2026-09-09 · L-13284 · C12)
 *
 * A THROWAWAY LOOK AT BARCELONA'S MUNICIPAL VOLUMES, BEFORE WE SPEND THE PIPELINE ON THEM.
 *
 *   FOUNDER: *"BARCELONA IS OUR KEY PILOT PROJECT - i have discoverred a way more detailed
 *             LOD 200 dataset that i would like to include on our 3d site"*
 *   ME:      *"skip the bake entirely for a first look … it would tell us whether 5,000
 *             stacked volumes actually look better than 600 boxes, which is the only
 *             question that justifies the rest."*
 *   FOUNDER: *"DO THAT MEANWHILE IS BAKING ON R2 FOR TESTING"*
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ⛔ THIS IS NOT THE SHIPPING ARCHITECTURE AND MUST NEVER BE MISTAKEN FOR IT
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The real route is a bake into the R2 `buildings` tiles, tiered by radius, joined against
 * Catastro, credited, and licence-cleared. That is designed and it is not this file.
 *
 * What this is: ONE hand-cut GeoJSON of a 450 m disc around Ciutat Vella, fetched from
 * `/preview/bcn-volumes.geojson`, drawn as extruded polygons, behind a console call. It
 * answers exactly one question — **does the articulation read on screen?** — and then it
 * should be deleted. It has no tiering, no budget, no cap, no cancellation and no manifest.
 *
 * ⚠ WHY IT IS SAFE TO SHIP ANYWAY: nothing calls it. It is reachable only from
 * `window.pryzmPreviewBcnVolumes()`, it adds its own entities to its own list, and its OFF
 * path removes exactly what its ON path added. A user who never types it never pays for it —
 * not a byte, because the 640 KB asset is fetched lazily on the first call.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ⭐ THE COMPARISON IS THE POINT, SO IT HIDES THE PRISMS WHILE IT DRAWS
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Showing 11,013 volumes ON TOP of the ~600 baked prisms they replace would be two buildings
 * in the same place, z-fighting, and would answer nothing. So ON hides the existing context
 * building entities and OFF puts them back — by flipping `show`, never by destroying them,
 * because they are owned by the viewport and re-fetching them is a 30-second penalty
 * ([[context-one-read-per-bbox]]).
 *
 * ⚠ THE HEIGHTS ARE THE MUNICIPALITY'S OWN SURVEY (`Z_MAX_VOL − Z_MIN_VOL`, 0.025 m altimetric
 * precision) and are drawn as-is. They are NOT the 9 m nominal, NOT a storey estimate and NOT
 * clamped — so if something looks wrong here, the data says it, and that is worth knowing
 * before the bake rather than after ([[context-data-honesty-family]]).
 */

import type * as CesiumNS from 'cesium';

/** What the generator writes. Deliberately tiny — this is a preview, not a schema. */
interface PreviewCollection {
    readonly type: 'FeatureCollection';
    readonly pryzm?: {
        readonly source?: string;
        readonly centre?: readonly [number, number];
        readonly radiusM?: number;
        readonly attribution?: string;
    };
    readonly features: ReadonlyArray<{
        readonly geometry: {
            readonly type: 'Polygon' | 'MultiPolygon';
            readonly coordinates: number[][][] | number[][][][];
        };
        readonly properties: { readonly h?: number };
    }>;
}

export const BCN_PREVIEW_URL = '/preview/bcn-volumes.geojson';

/** The colour the baked prisms use, so the comparison is of SHAPE, not of palette. */
const PREVIEW_FILL = '#E8E1D4';
const PREVIEW_EDGE = '#B9B3A6';

export interface BcnPreviewDeps {
    readonly Cesium: typeof CesiumNS;
    readonly viewer: CesiumNS.Viewer;
    /** Ground height in metres at (lat, lon), or the supplied fallback. The viewport's own. */
    readonly sampleGround: (lat: number, lon: number, fallback: number) => number;
    /** The baked context entities to hide while the preview is up. */
    readonly contextEntities: () => readonly CesiumNS.Entity[];
    /**
     * ⭐ §BCN-PREVIEW-SAYS-WHERE-IT-COVERS (L-13287) — the project's own site, or `null`.
     *
     * The preview flew the founder 1.65 km to Ciutat Vella, twice, without ever saying his plot
     * was outside the covered disc. He judged the DATASET on a view of a different neighbourhood
     * and reported "not the level of detail we already had" — a false negative this file caused.
     * A preview that relocates the user must say so, with the distance, in the same breath.
     */
    readonly siteLocation?: () => { lat: number; lon: number } | null;
    readonly fetchJson?: (url: string) => Promise<unknown>;
}

/** Great-circle metres between two WGS84 points. Small-angle safe; good to a metre at this scale. */
function metresBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
    const R = 6_371_000;
    const dLat = ((bLat - aLat) * Math.PI) / 180;
    const dLon = ((bLon - aLon) * Math.PI) / 180;
    const m = Math.sin(dLat / 2) ** 2
        + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(m)));
}

/**
 * Toggle the preview. Returns what happened, so the console call says something useful
 * rather than `undefined`.
 */
export async function toggleBcnVolumesPreview(
    deps: BcnPreviewDeps,
    state: { entities: CesiumNS.Entity[]; on: boolean },
): Promise<string> {
    const { Cesium, viewer } = deps;

    if (state.on) {
        for (const e of state.entities) {
            try { viewer.entities.remove(e); } catch { /* already gone */ }
        }
        const n = state.entities.length;
        state.entities.length = 0;
        state.on = false;
        // Put the baked prisms back. `show`, never a re-fetch.
        for (const e of deps.contextEntities()) e.show = true;
        viewer.scene.requestRender();
        return `§BCN-VOLUMES-PREVIEW OFF — removed ${n} volume(s); the baked prisms are back.`;
    }

    let data: PreviewCollection;
    try {
        const raw = deps.fetchJson
            ? await deps.fetchJson(BCN_PREVIEW_URL)
            : await (await fetch(BCN_PREVIEW_URL)).json();
        data = raw as PreviewCollection;
    } catch (err) {
        // ⛔ An honest failure, not a silent empty. The asset may simply not be deployed.
        return `§BCN-VOLUMES-PREVIEW could not load ${BCN_PREVIEW_URL} — ${String(err)}. `
            + 'This preview asset ships in public/preview/; if this is a build without it, '
            + 'nothing is wrong with the 3D Site.';
    }
    if (!data || !Array.isArray(data.features) || data.features.length === 0) {
        return `§BCN-VOLUMES-PREVIEW ${BCN_PREVIEW_URL} held no features — nothing drawn.`;
    }

    // Hide the prisms this is standing in for. Two buildings in one place answers nothing.
    for (const e of deps.contextEntities()) e.show = false;

    const fill = Cesium.Color.fromCssColorString(PREVIEW_FILL);
    const edge = Cesium.Color.fromCssColorString(PREVIEW_EDGE);
    let drawn = 0, skipped = 0, zeroH = 0;
    let minH = Number.POSITIVE_INFINITY, maxH = 0;

    for (const f of data.features) {
        // ⚠ OUTER RING ONLY. A hole in a 20 m courtyard block is invisible from the 3D-Site
        // camera and drawing it would double the entity count for nothing. The BAKE must
        // honour holes; this preview is answering a different question.
        const g = f.geometry;
        const outer: number[][] | undefined = g.type === 'Polygon'
            ? (g.coordinates as number[][][])[0]
            : (g.coordinates as number[][][][])[0]?.[0];
        if (!outer || outer.length < 4) { skipped += 1; continue; }

        const h = Number(f.properties?.h ?? 0);
        if (!(h > 0)) zeroH += 1;
        if (h > 0) { minH = Math.min(minH, h); maxH = Math.max(maxH, h); }

        // Seat each volume on its OWN sampled ground, exactly as the baked near ring does —
        // a single shared base would float the uphill half of a sloping block.
        let sumLat = 0, sumLon = 0;
        for (const c of outer) { sumLon += c[0]!; sumLat += c[1]!; }
        const cLon = sumLon / outer.length, cLat = sumLat / outer.length;
        const ground = deps.sampleGround(cLat, cLon, 0);

        try {
            const positions = outer.map(([lo, la]) =>
                Cesium.Cartesian3.fromDegrees(lo!, la!, ground));
            const ent = viewer.entities.add({
                name: 'bcn-volume-preview',
                polygon: {
                    hierarchy: new Cesium.PolygonHierarchy(positions),
                    height: ground,
                    // ⚠ A zero-height volume is a PATIO, not a missing measurement — the source
                    // says so. It is drawn as a flat plate rather than extruded to a nominal,
                    // because inventing a height here is exactly the defect the bake avoids.
                    extrudedHeight: ground + Math.max(0.05, h),
                    fill: true,
                    material: fill,
                    outline: true,
                    outlineColor: edge,
                    outlineWidth: 1,
                    shadows: Cesium.ShadowMode.ENABLED,
                    perPositionHeight: false,
                    closeBottom: true,
                },
            });
            state.entities.push(ent);
            drawn += 1;
        } catch {
            skipped += 1;
        }
    }

    state.on = true;

    // ⭐ FLY THE CAMERA TO THE DATA. The first test of this failed for a reason that had
    // nothing to do with the data: the founder was at a 5,827 m scope, ~6 km up, and a 450 m
    // disc of volumes is a speck from there. His own "TO BE" reference — Barcelona's
    // `Mapa 3D detallat` viewer — is a STREET-LEVEL view, and articulation only reads close up.
    // A preview the user has to go and find is a preview that reports a false negative.
    const c = data.pryzm?.centre;

    // ⛔⛔ §BCN-PREVIEW-SAYS-WHERE-IT-COVERS (L-13287) — SAY IT BEFORE MOVING THE CAMERA.
    //
    // The founder tested this twice and reported "is not the same level of detail - is the level
    // of detail we already had". Both verdicts were reasonable and both were about the WRONG PLACE:
    // his plot was in Eixample, this disc is centred on Ciutat Vella, and the fly-to silently took
    // him 1.65 km away to judge his own site by a view of someone else's.
    //
    // ⭐ A PREVIEW THAT RELOCATES THE USER MUST SAY SO, WITH THE NUMBER. This is the same rule as
    // §CONTEXT-DATA-HONESTY one level up: it is not enough to be correct about the data if the
    // user cannot tell WHICH GROUND they are looking at.
    let coverage = '';
    const site = deps.siteLocation?.() ?? null;
    if (c && site) {
        const d = metresBetween(site.lat, site.lon, c[1], c[0]);
        const radius = data.pryzm?.radiusM ?? 0;
        coverage = d <= radius
            ? `\n  ✓ YOUR SITE IS INSIDE THIS DISC (${Math.round(d)} m from its centre, radius `
              + `${Math.round(radius)} m) — what you are about to see is your own ground.`
            : `\n  ⛔ YOUR SITE IS **OUTSIDE** THIS DISC — ${(d / 1000).toFixed(2)} km from its `
              + `centre, which has a radius of only ${Math.round(radius)} m. The camera is about to `
              + `fly you to ${c[1].toFixed(5)}, ${c[0].toFixed(5)}, which is NOT your plot. Judge `
              + `the DATASET here, not your site. To cut a disc over your own plot instead:\n`
              + `      python tools/context-bake/footprints/cutPreviewDisc.py bcn_municipal \\\n`
              + `        <base_alcades.gpkg> public/preview/bcn-volumes.geojson \\\n`
              + `        --centre ${site.lon.toFixed(5)},${site.lat.toFixed(5)} --radius 450`;
    } else if (c && !site) {
        coverage = `\n  ⚠ No site is committed, so PRYZM cannot tell you whether this disc covers `
            + `your plot. It is centred on ${c[1].toFixed(5)}, ${c[0].toFixed(5)}.`;
    }

    if (c && Array.isArray(c) && c.length === 2) {
        try {
            viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(c[0], c[1] - 0.0035, 420),
                orientation: { heading: Cesium.Math.toRadians(20), pitch: Cesium.Math.toRadians(-32), roll: 0 },
                duration: 2.0,
            });
        } catch { /* a preview must never break the camera */ }
    }

    viewer.scene.requestRender();

    const attrib = data.pryzm?.attribution ?? 'Ajuntament de Barcelona (CartoBCN)';
    return [
        `§BCN-VOLUMES-PREVIEW ON — ${drawn.toLocaleString()} municipal volume(s) drawn`,
        skipped ? `, ${skipped} skipped` : '',
        `. Heights are the CITY'S OWN SURVEY (Z_MAX_VOL − Z_MIN_VOL, 0.025 m altimetric):`,
        ` ${Number.isFinite(minH) ? minH.toFixed(1) : '—'}–${maxH.toFixed(1)} m`,
        zeroH ? `, ${zeroH} at height 0 (patios/terraces — drawn flat, NOT given a nominal)` : '',
        `. The baked prisms are hidden so the comparison is of SHAPE. Call again to swap back.`,
        coverage,
        c ? `
  Flying to ${c[1].toFixed(5)}, ${c[0].toFixed(5)} at 420 m — articulation only`
            + ` reads CLOSE UP; at a 5 km scope this looks like the flat plate it replaces.` : '',
        `\n  ${attrib}`,
        `\n  ⛔ PREVIEW ONLY — one hand-cut 450 m disc, no tiering, no budget, no cap.`,
        ` The shipping route is a bake into the R2 buildings tiles.`,
    ].join('');
}
