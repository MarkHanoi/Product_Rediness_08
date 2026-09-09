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
    readonly fetchJson?: (url: string) => Promise<unknown>;
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
    viewer.scene.requestRender();

    const attrib = data.pryzm?.attribution ?? 'Ajuntament de Barcelona (CartoBCN)';
    return [
        `§BCN-VOLUMES-PREVIEW ON — ${drawn.toLocaleString()} municipal volume(s) drawn`,
        skipped ? `, ${skipped} skipped` : '',
        `. Heights are the CITY'S OWN SURVEY (Z_MAX_VOL − Z_MIN_VOL, 0.025 m altimetric):`,
        ` ${Number.isFinite(minH) ? minH.toFixed(1) : '—'}–${maxH.toFixed(1)} m`,
        zeroH ? `, ${zeroH} at height 0 (patios/terraces — drawn flat, NOT given a nominal)` : '',
        `. The baked prisms are hidden so the comparison is of SHAPE. Call again to swap back.`,
        `\n  ${attrib}`,
        `\n  ⛔ PREVIEW ONLY — one hand-cut 450 m disc, no tiering, no budget, no cap.`,
        ` The shipping route is a bake into the R2 buildings tiles.`,
    ].join('');
}
