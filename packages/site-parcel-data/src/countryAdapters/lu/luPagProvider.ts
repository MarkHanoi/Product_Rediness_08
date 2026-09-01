// E7-LU — LUXEMBOURG (LU) · the providers: PURE row parsers + `FetchOutcome`-returning
// resolvers over the reader port. Same role as `ee/eeParcelProvider.ts` + `ee/eePlanProvider.ts`
// (E7-FAMILY §6 A); LU collapses them into one file because ONE artefact serves both the zone
// layer and the cadastral plan base, and splitting them would imply two sources.
//
// ⛔ THE ONE HONESTY THIS FILE EXISTS TO ENFORCE — BBOX IS NOT INTERSECTION.
// A GeoPackage carries an R-tree spatial index, which is the artefact's own equivalent of a
// server-side query — so asking IT is the LU analogue of EE's server-side `Intersects` (the EE
// rework deleted its `ringCentroid` vertex-mean precisely because adapter-side geometry math was
// wrong). But an R-tree answers **bbox overlap**, not polygon intersection. A zone whose
// bounding box covers a parcel need not contain one square metre of it.
//
// Therefore `resolveLuNqPapCandidatesForParcel` returns a type literally named
// `LuNqPapBboxCandidates`, its rules are NOT emitted, and the exact-containment question is
// carried as an explicit UNRESOLVED field with BOTH counts (C74). No adapter-side point-in-
// polygon test is performed and none may be added here: it is geometry work, it belongs to a
// geometry package, and inventing it in an adapter is how the EE centroid defect happened.
//
// ⛔ AND `NUM_CADAST` IS NOT A KEY. Measured 2026-09-01 over all 653,315 `PAG_PAG_FOND_DE_PLAN`
// rows: the literal string `'N/A'` on 31,777 (4.9%), and 15,110 duplicate `(CODE_COM,
// NUM_CADAST)` groups over 621,538 real ids (`'0'` appears 16x in C064 alone). The cadastral
// SECTION that disambiguates a Luxembourgish parcel number is not served by this layer. So the
// parcel resolver refuses an `'N/A'` lookup by name and returns EVERY match for a real one,
// carrying the ambiguity rather than silently picking the first row.
//
// ⚠ THIS CORRECTS E5-B §A-13's "parcel → zone → numbers resolves inside one file, without a
// second provider". The parcel BASE ships in the file; the parcel KEY and the exact spatial
// join do not.

import {
    fetchAbsent,
    fetchFound,
    fetchTransient,
    type FetchOutcome,
} from '@pryzm/schemas';
import type {
    LuFondDePlanRow,
    LuLurefEnvelope,
    LuNqPapRow,
    LuPagDeps,
    LuPagGpkgReader,
    LuServedGeometry,
    LuZonageRow,
} from './luPagGpkgClient.js';
import { LU_PAG_TABLES } from './luPagGpkgClient.js';

/** The sentinel `NUM_CADAST` value, verbatim. 31,777 rows carry it. Never an id. */
export const LU_NUM_CADAST_SENTINEL = 'N/A';

/* ═══════════════════════════════ pure parsers ═══════════════════════════════ */

function asString(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const s = v.trim();
    return s === '' ? null : s;
}

function asNumber(v: unknown): number | null {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    return v;
}

function asGeometry(v: unknown): LuServedGeometry | null {
    if (v === null || typeof v !== 'object') return null;
    const o = v as Record<string, unknown>;
    const t = o['type'];
    if (t !== 'Polygon' && t !== 'MultiPolygon') return null;
    if (!Array.isArray(o['coordinates'])) return null;
    return { type: t, coordinates: o['coordinates'] };
}

/**
 * PURE: a raw `PAG_PAG_NQ_PAP` record (however a reader shaped it) → the typed row, or null when
 * the transfer id is missing — the id is the ONLY key measured unique, so a row without it is
 * not addressable and is refused rather than given a synthetic id.
 */
export function parseLuNqPapRow(raw: unknown): LuNqPapRow | null {
    if (raw === null || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const xtfId = asString(o['xtfId'] ?? o['xtf_id']);
    if (xtfId === null) return null;
    const id = asNumber(o['id']);
    return {
        id: id ?? 0,
        xtfId,
        codeCom: asString(o['codeCom'] ?? o['CODE_COM']),
        denomination: asString(o['denomination'] ?? o['DENOMINATION']),
        cosMin: asNumber(o['cosMin'] ?? o['COS_MIN']),
        cosMax: asNumber(o['cosMax'] ?? o['COS_MAX']),
        cusMin: asNumber(o['cusMin'] ?? o['CUS_MIN']),
        cusMax: asNumber(o['cusMax'] ?? o['CUS_MAX']),
        cssMax: asNumber(o['cssMax'] ?? o['CSS_MAX']),
        dlMin: asNumber(o['dlMin'] ?? o['DL_MIN']),
        dlMax: asNumber(o['dlMax'] ?? o['DL_MAX']),
        nomFichierEc: asString(o['nomFichierEc'] ?? o['NOM_FICHIER_EC']),
        nomFichierSdEc: asString(o['nomFichierSdEc'] ?? o['NOM_FICHIER_SD_EC']),
        nomFichierSdGr: asString(o['nomFichierSdGr'] ?? o['NOM_FICHIER_SD_GR']),
        srs: asNumber(o['srs']) ?? 2169,
        geometry: asGeometry(o['geometry']),
    };
}

/** PURE: a raw `PAG_PAG_FOND_DE_PLAN` record → the typed row, or null without a transfer id. */
export function parseLuFondDePlanRow(raw: unknown): LuFondDePlanRow | null {
    if (raw === null || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const xtfId = asString(o['xtfId'] ?? o['xtf_id']);
    if (xtfId === null) return null;
    return {
        id: asNumber(o['id']) ?? 0,
        xtfId,
        numCadast: asString(o['numCadast'] ?? o['NUM_CADAST']),
        codeCom: asString(o['codeCom'] ?? o['CODE_COM']),
        srs: asNumber(o['srs']) ?? 2169,
        geometry: asGeometry(o['geometry']),
    };
}

/** PURE: a raw `PAG_PAG_ZONAGE` record → the typed row, or null without a transfer id. */
export function parseLuZonageRow(raw: unknown): LuZonageRow | null {
    if (raw === null || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const xtfId = asString(o['xtfId'] ?? o['xtf_id']);
    if (xtfId === null) return null;
    return {
        id: asNumber(o['id']) ?? 0,
        xtfId,
        categorie: asString(o['categorie'] ?? o['CATEGORIE']),
        genre: asString(o['genre'] ?? o['GENRE']),
        nomFichier: asString(o['nomFichier'] ?? o['NOM_FICHIER']),
        codeCom: asString(o['codeCom'] ?? o['CODE_COM']),
        srs: asNumber(o['srs']) ?? 2169,
        geometry: asGeometry(o['geometry']),
    };
}

/* ═════════════════════════════════ resolvers ════════════════════════════════ */

function requireReader(deps: LuPagDeps): LuPagGpkgReader | string {
    if (deps.reader === undefined) {
        return (
            'endpoint-unreachable: no LuPagGpkgReader was supplied. Luxembourg serves the PAG ' +
            'ONLY as a bulk GeoPackage (probed 2026-09-01: no WFS, no PAG layer on the opendata ' +
            'WMS, wfsSupport false on every geoportail ogcServer), so a host must download the ' +
            'artefact and supply a reader. This is a MISSING TRANSPORT, not an absence of data.'
        );
    }
    return deps.reader;
}

/**
 * Resolve one NQ-PAP zone by its transfer id (`xtf_id`) — the only key measured unique
 * (3,017 / 3,017). `absent` when the artefact has no such row; `transient` when the reader
 * itself failed or was not supplied.
 */
export async function resolveLuNqPapByXtfId(
    xtfId: string,
    deps: LuPagDeps = {},
): Promise<FetchOutcome<LuNqPapRow>> {
    const reader = requireReader(deps);
    if (typeof reader === 'string') return fetchTransient(reader);
    let row: LuNqPapRow | null;
    try {
        row = await reader.nqPapByXtfId(xtfId);
    } catch (e) {
        return fetchTransient(
            `upstream-failed: ${LU_PAG_TABLES.nqPap} read for xtf_id ${xtfId} — ` +
                `${e instanceof Error ? e.message : String(e)}`,
        );
    }
    if (row === null) {
        return fetchAbsent(
            `no-feature: ${LU_PAG_TABLES.nqPap} has no row with xtf_id ${xtfId}. This is a ` +
                'durable coverage fact about the artefact, not a failure.',
        );
    }
    return fetchFound(row);
}

/** One resolved parcel lookup — plural by construction, because the key is not unique. */
export interface LuParcelMatches {
    readonly codeCom: string;
    readonly numCadast: string;
    /** EVERY matching row. Measured: 15,110 `(CODE_COM, NUM_CADAST)` groups have more than one. */
    readonly matches: readonly LuFondDePlanRow[];
    /**
     * True when more than one row matched — i.e. the national id did NOT identify a parcel.
     * A consumer must not silently take `matches[0]`.
     */
    readonly ambiguous: boolean;
}

/**
 * Resolve cadastral-plan-base rows for a commune code + cadastral number.
 *
 * REFUSALS, each carrying both the served value and what the register would have to serve for
 * the lookup to be answerable (C74):
 *   • `'N/A'` (or the empty string) → `absent` naming the sentinel and its measured population;
 *   • no match → `absent`;
 *   • more than one match → STILL `found`, with `ambiguous: true` and every row, because the
 *     ambiguity is a fact about the register and hiding it behind a pick would be the
 *     overstatement.
 */
export async function resolveLuParcelByNumCadast(
    codeCom: string,
    numCadast: string,
    deps: LuPagDeps = {},
): Promise<FetchOutcome<LuParcelMatches>> {
    const key = numCadast.trim();
    if (key === '' || key === LU_NUM_CADAST_SENTINEL) {
        return fetchAbsent(
            `no-parcel: NUM_CADAST ${JSON.stringify(numCadast)} is the served SENTINEL, not a ` +
                'cadastral id. Measured 2026-09-01: 31,777 of 653,315 PAG_PAG_FOND_DE_PLAN rows ' +
                '(4.9%) carry the literal string "N/A". UNKNOWN is not an id (E4 control 9).',
        );
    }
    const reader = requireReader(deps);
    if (typeof reader === 'string') return fetchTransient(reader);
    let rows: readonly LuFondDePlanRow[];
    try {
        rows = await reader.fondDePlanByNumCadast(codeCom, key);
    } catch (e) {
        return fetchTransient(
            `upstream-failed: ${LU_PAG_TABLES.fondDePlan} read for ${codeCom}/${key} — ` +
                `${e instanceof Error ? e.message : String(e)}`,
        );
    }
    if (rows.length === 0) {
        return fetchAbsent(
            `no-parcel: ${LU_PAG_TABLES.fondDePlan} has no row for commune ${codeCom} with ` +
                `NUM_CADAST ${key}.`,
        );
    }
    return fetchFound({ codeCom, numCadast: key, matches: rows, ambiguous: rows.length > 1 });
}

/**
 * NQ-PAP zones whose R-TREE BOUNDING BOX overlaps an envelope.
 *
 * ⚠ READ THE TYPE NAME. These are CANDIDATES. `exactIntersectionResolved` is `false` and stays
 * false: this adapter does not own a polygon-intersection solver, the artefact does not serve
 * one, and guessing containment from a bbox is the overstatement C74 forbids. A consumer that
 * needs the exact answer must run a geometry package over `candidate.geometry` (LUREF, served
 * verbatim) and say so in its own provenance.
 */
export interface LuNqPapBboxCandidates {
    readonly envelope: LuLurefEnvelope;
    readonly candidates: readonly LuNqPapRow[];
    /** Always `false` here — the honest machine-visible form of "bbox ≠ intersection". */
    readonly exactIntersectionResolved: false;
    /** The refusal sentence, carrying BOTH counts (C74). */
    readonly note: string;
}

/** Bbox-overlap candidates from the NQ-PAP layer. See the type's warning before using them. */
export async function resolveLuNqPapCandidatesForEnvelope(
    envelope: LuLurefEnvelope,
    deps: LuPagDeps = {},
): Promise<FetchOutcome<LuNqPapBboxCandidates>> {
    const reader = requireReader(deps);
    if (typeof reader === 'string') return fetchTransient(reader);
    let rows: readonly LuNqPapRow[];
    try {
        rows = await reader.nqPapByBbox(envelope);
    } catch (e) {
        return fetchTransient(
            `upstream-failed: ${LU_PAG_TABLES.nqPap} bbox read — ` +
                `${e instanceof Error ? e.message : String(e)}`,
        );
    }
    if (rows.length === 0) {
        return fetchAbsent(
            `no-feature: no ${LU_PAG_TABLES.nqPap} bounding box overlaps the envelope. Because ` +
                'a bbox is a SUPERSET of its polygon, an empty bbox result IS a sound absence: ' +
                'nothing can intersect a polygon whose box it misses.',
        );
    }
    return fetchFound({
        envelope,
        candidates: rows,
        exactIntersectionResolved: false,
        note:
            `${rows.length} NQ-PAP zone(s) have a BOUNDING BOX overlapping this envelope; ` +
            '0 of them have been tested for actual polygon intersection. A GeoPackage R-tree ' +
            'answers bbox overlap only. Do not treat a candidate as the governing zone.',
    });
}

/** Bbox-overlap candidates from the base-zoning layer. Same caveat; no numerics on this layer. */
export async function resolveLuZonageCandidatesForEnvelope(
    envelope: LuLurefEnvelope,
    deps: LuPagDeps = {},
): Promise<FetchOutcome<readonly LuZonageRow[]>> {
    const reader = requireReader(deps);
    if (typeof reader === 'string') return fetchTransient(reader);
    try {
        const rows = await reader.zonageByBbox(envelope);
        if (rows.length === 0) {
            return fetchAbsent(
                `no-feature: no ${LU_PAG_TABLES.zonage} bounding box overlaps the envelope.`,
            );
        }
        return fetchFound(rows);
    } catch (e) {
        return fetchTransient(
            `upstream-failed: ${LU_PAG_TABLES.zonage} bbox read — ` +
                `${e instanceof Error ? e.message : String(e)}`,
        );
    }
}
