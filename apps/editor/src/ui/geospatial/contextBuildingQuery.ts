// §CTX-QUERY-PANEL (L-592) — the READ-ONLY query model for one 3D-Site context building.
//
// PURE MODULE. No DOM, no Cesium, no I/O. `CesiumViewport` renders this model; every judgement
// about what may be SAID about a context building lives here and is unit-tested. Pure decisions
// are P8 span-exempt (the `globePlacementDecisions.ts` precedent, L-186/L-193).
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 THE BLOCKER THIS MODULE EXISTS TO HONOUR
// ─────────────────────────────────────────────────────────────────────────────
// A query panel that reports a height without its provenance manufactures false confidence at
// the exact moment a user trusts it most. MEASURED (L-582, 23,251 footprints across four
// Barcelona districts): context heights are **0.9% surveyed (`tagged`) · 79.3% `building:levels`
// × OUR assumed 3.2 m storey (`derived-levels`) · 19.8% a fabricated 9 m default (`assumed`)**.
//
// The scene already draws `assumed`-height footprints translucent (§CTX-ASSUMED-HEIGHT-VISIBLE,
// L-527) precisely so a guess does not RENDER like a measurement. **A panel reading "Height: 9 m"
// would undo that in one line of text.** So:
//
//   • `assumed`        → the height value is the literal word "Unknown". The 9 m is named as a
//                        DRAWING PLACEHOLDER in the caveat, never offered as the building's height.
//   • `derived-levels` → the value is prefixed "≈" and the caveat separates the two facts: the
//                        storey COUNT is real OSM data, the METRE value is ours.
//   • `tagged`         → the only case that may be stated flatly, and even then it is labelled.
//   • provenance ABSENT (older cached collections) → read as `assumed`. The pessimistic reading
//     is the honest one; guessing `tagged` for old data would re-hide exactly what L-459 exposed.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠ THE SECOND RULE: `syntheticId` MUST NEVER BE SHOWN AS AN OSM ID
// ─────────────────────────────────────────────────────────────────────────────
// On the baked-tiles path (`contextTiles.ts`) the bake carries no OSM ids, so the reader mints a
// stable id from `(z, x, y, feature index)`. It is unique and stable — which is all the
// downstream `Set` dedupe needs — but it is NOT an OSM id and a user who pasted it into
// openstreetmap.org would land on an unrelated object. When the source is unknown we say
// "internal reference", the same pessimistic default as the provenance rule above.
//
// ─────────────────────────────────────────────────────────────────────────────
// READ-ONLY BY CONSTRUCTION
// ─────────────────────────────────────────────────────────────────────────────
// A context building is NOT a model object (C19: it is transient scene decoration, never
// persisted; C57: it is not a parcel). This model therefore exposes no ids the editor could act
// on, no commands and no mutation surface — it is a display record. The panel must never become
// an edit surface, and this module gives it nothing to edit with.

import type { ContextHeightProvenance } from './contextBuildings';
import { classifyContextUse, CONTEXT_USE_STYLE, type ContextUseClass } from './contextBuildingUse';

/** Where a context feature's `osmId` came from. Absent ⇒ treated as `tile-synthetic`. */
export type ContextIdSource = 'osm' | 'tile-synthetic';

/** The subset of a `ContextBuildingFeature`'s properties the panel is allowed to read. */
export interface ContextBuildingQueryInput {
    readonly heightM: number;
    readonly heightProvenance?: ContextHeightProvenance;
    readonly floors?: number;
    readonly osmId: number;
    readonly osmIdSource?: ContextIdSource;
    readonly useTag?: string;
    readonly name?: string;
    readonly ring?: 'near' | 'far';
    readonly distM?: number;
}

/** One labelled row. `caveat` is NOT optional decoration — it is where the honesty lives. */
export interface ContextBuildingQueryRow {
    readonly label: string;
    readonly value: string;
    readonly caveat?: string;
    /** True when the value is an absence rather than a datum — rendered muted, never as a fact. */
    readonly isUnknown?: boolean;
}

export interface ContextBuildingQueryModel {
    readonly title: string;
    /** Always present, always says this is reference data and read-only. */
    readonly subtitle: string;
    readonly rows: readonly ContextBuildingQueryRow[];
    readonly useClass: ContextUseClass;
    readonly footnote: string;
}

/** ⚠ Keep in lock-step with `contextBuildings.METRES_PER_LEVEL`. Quoted, never recomputed. */
const ASSUMED_STOREY_M = 3.2;
/** ⚠ Keep in lock-step with `contextBuildings.DEFAULT_BUILDING_HEIGHT_M`. */
const PLACEHOLDER_HEIGHT_M = 9;

function fmtM(v: number): string {
    return `${v.toFixed(v < 10 ? 1 : 0)} m`;
}

/** The height row — the one this whole module exists for. Never states a guess as a number. */
export function buildHeightRow(input: ContextBuildingQueryInput): ContextBuildingQueryRow {
    // C75 §2.1 — this read `input.heightProvenance ?? 'assumed'` and is on C75's
    // ledger. It is kept, and the reasoning is worth stating because it is the
    // one entry on that ledger where the `??` was NOT hiding a false claim.
    //
    // `'assumed'` is not an origin this function asserts about the building; it
    // is the FALL-THROUGH branch, and that branch (below) renders
    // `value: 'Unknown'`, `isUnknown: true`, and a caveat saying in words that the
    // 9 m shape is a placeholder which "must not be read as" a measurement. So an
    // absent provenance already produces the C75 §1.4 answer — an explicit
    // unknown with its reason — rather than a fabricated one. The three branches
    // that DO make a positive claim (`measured-lidar`, `tagged`,
    // `derived-levels`) are reachable only when the caller actually stated one.
    //
    // What was genuinely wrong is that this was true only BY COINCIDENCE of
    // `'assumed'` sorting last. Nothing stopped a later edit from giving
    // `'assumed'` a confident caveat, or from adding a member that fell through
    // to it. The absent case is now its own branch, named, ahead of the union
    // dispatch — so the honesty is structural instead of positional, and the
    // `??` that the gate flags is gone rather than justified.
    if (input.heightProvenance === undefined) {
        return {
            label: 'Height',
            value: 'Unknown',
            isUnknown: true,
            caveat:
                'No height provenance was recorded for this building, so we cannot say whether its ' +
                `height was measured, tagged, or derived. It is drawn at a ${PLACEHOLDER_HEIGHT_M} m ` +
                'PLACEHOLDER — that shape is not a measurement and must not be read as one.',
        };
    }
    const prov: ContextHeightProvenance = input.heightProvenance;
    if (prov === 'measured-lidar') {
        // §CTX-HEIGHT-MEASURED-MARKER (H2, standard §1 rung 1) — a REAL measured per-building height
        // from a regional/national authority (LiDAR nDSM / 3DBAG / BD TOPO / DK DHM / CH swisstopo).
        // The most authoritative rung; state it as a plain measured metre value.
        return {
            label: 'Height',
            value: fmtM(input.heightM),
            caveat: 'Measured — a real per-building height from a regional/national authority source (LiDAR/nDSM). The most authoritative height available.',
        };
    }
    if (prov === 'tagged') {
        return {
            label: 'Height',
            value: fmtM(input.heightM),
            caveat: 'Surveyed — an explicit OSM `height` tag. 0.9% of buildings here have one.',
        };
    }
    if (prov === 'derived-levels') {
        const floors = input.floors;
        return {
            label: 'Height',
            value: `≈ ${fmtM(input.heightM)}`,
            caveat:
                (floors !== undefined
                    ? `Estimated from ${floors} floor${floors === 1 ? '' : 's'} `
                    : 'Estimated from the OSM floor count ') +
                `× ${ASSUMED_STOREY_M} m — an assumed storey height. ` +
                'The floor count is real OSM data; the metre value is ours.',
        };
    }
    return {
        label: 'Height',
        value: 'Unknown',
        isUnknown: true,
        caveat:
            'OSM records no height and no floor count for this building. It is drawn translucent ' +
            `at a ${PLACEHOLDER_HEIGHT_M} m PLACEHOLDER so the gap is visible — that shape is not ` +
            'a measurement and must not be read as one.',
    };
}

/** The identity row — never presents a minted tile id as an OSM id. */
export function buildIdentityRow(input: ContextBuildingQueryInput): ContextBuildingQueryRow {
    // Absent source ⇒ synthetic. Same pessimistic-default discipline as the provenance rule.
    const src: ContextIdSource = input.osmIdSource ?? 'tile-synthetic';
    if (src === 'osm') {
        return {
            label: 'Reference',
            value: `OSM #${input.osmId}`,
            caveat: 'OpenStreetMap way/relation id.',
        };
    }
    return {
        label: 'Reference',
        value: `Internal #${input.osmId}`,
        caveat:
            'Minted by our tile reader from (zoom, x, y, index) — stable, but NOT an OpenStreetMap ' +
            'id. Looking it up on openstreetmap.org would find an unrelated object.',
    };
}

/** The use row. Mirrors §CTX-USE-COLOUR: an unrecorded use is stated, never inferred. */
export function buildUseRow(input: ContextBuildingQueryInput): ContextBuildingQueryRow {
    const cls = classifyContextUse(input.useTag);
    if (cls === 'unknown') {
        return {
            label: 'Use',
            value: 'Not recorded',
            isUnknown: true,
            caveat: 'OSM carries no use tag for this building (about 1 in 11 here).',
        };
    }
    return {
        label: 'Use',
        value: CONTEXT_USE_STYLE[cls].label,
        caveat: `OSM tag \`${input.useTag}\`.`,
    };
}

/**
 * Build the full read-only query model for one picked context building.
 *
 * Everything stated here is either a value OSM carries or a named assumption of ours. There is
 * deliberately no derived floor area, no volume, no "estimated units" — every one of those would
 * multiply the 79.3%-estimated height into a number that LOOKS like a survey.
 */
export function buildContextBuildingQuery(
    input: ContextBuildingQueryInput,
): ContextBuildingQueryModel {
    const rows: ContextBuildingQueryRow[] = [];
    rows.push(buildUseRow(input));
    rows.push(buildHeightRow(input));
    if (input.floors !== undefined) {
        rows.push({
            label: 'Floors',
            value: String(input.floors),
            caveat: 'OSM `building:levels` — a real, tagged storey count.',
        });
    }
    if (input.distM !== undefined && Number.isFinite(input.distM)) {
        rows.push({
            label: 'Distance',
            value: `${Math.round(input.distM)} m from the site origin`,
        });
    }
    rows.push(buildIdentityRow(input));

    return {
        title: input.name?.trim() || 'Context building',
        subtitle:
            'Reference data from OpenStreetMap — read-only. Not part of your model, ' +
            'not saved with the project.',
        rows,
        useClass: classifyContextUse(input.useTag),
        footnote:
            'Surrounding buildings are context, not design objects. They cannot be selected into ' +
            'the model, edited or exported.',
    };
}
