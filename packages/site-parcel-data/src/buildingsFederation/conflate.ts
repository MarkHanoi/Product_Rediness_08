// LANE FED (E5 partial · DECISION-SUMMARY row 2) — MATCH / DEDUP / FEDERATE: the conflation
// scaffold. A published GERS BRIDGE first where one exists; GERS equality where both sides
// carry an id; geometry IoU otherwise. Output is the FROZEN canonical `SiteIntelBuilding`
// (E4 control 3 — no schema change; the canonical record ALREADY splits shape/height/floors
// provenance into per-attribute `source` fields, which is exactly the split the internal
// review demanded: "one record carries shape+height from one provider — blocks all
// federated-height work" — internal-review §5 + §10 "Schema weld"). This module NEVER writes
// one provider across a whole record: shape provenance and each attribute's provenance are
// assigned independently.
//
// ADOPTED, NOT REBUILT (non-rivalry register — every one of these was grepped for first):
//   • IoU intersection area — `intersectPolygons2D` (@pryzm/geometry-kernel
//     §C73-POLY-BOOLEAN, the general clipper). Its refusals (degenerate /
//     self-intersecting / unresolved-topology) surface here as UNDECIDABLE matches — never
//     as "distinct" (control 9: unknown stays distinct from a measured no-overlap).
//   • Areas — `polygonSignedArea2D` (geometry-kernel).
//   • The CHEAP SOUND DISJOINTNESS PROOF — `ringBounds` + `boundsDisjoint` from
//     ../geometry/ringValidation.ts, THIS package, written for exactly this job ("`true`
//     PROVES the two polygons cannot overlap … reading this as 'they overlap' would be the
//     classic bbox fallacy"). ⚠ Those take `Pt` = `{x, z}`, whose canonical meaning is
//     scene-XZ metres; here the same two numbers are native-CRS metres (x = easting,
//     z = northing). The functions are pure CRS-agnostic arithmetic, so adopting them is
//     sound — and duplicating a second bounds pair to avoid the naming stretch would be the
//     rival the register forbids. Named rather than hidden.
//   • Record + vocabularies — `SiteIntelBuilding`, `BuildingHeightMethod` (@pryzm/schemas,
//     frozen E1a canon).
//   NB tools/context-bake/heightSources.mjs §LOD2-NRW does a centroid-containment match for
//   bake-time height STAMPING — a transcription join inside a .mjs tool, no ids, no
//   provenance records. This module is the typed federation layer row 2 orders; it does not
//   replace the bake join and the bake join could not serve here.
//
// ⭐ WHY THE BOUNDS PREFILTER IS HERE AND NOT A LATER OPTIMISATION — TWO failures, each
// demonstrated separately, and the two demonstrations are NOT the same evidence (E4 control
// 2 is satisfied by a demonstration, so each is named with the artefact that shows it):
//   1. COST — measured on live data. The inherited draft called the clipper for every
//      (authority × backbone) pair: the lane probe is 1087 EE authority footprints × 1185
//      Overture backbone footprints = 1,288,095 polygon-boolean calls for one ~1 km² AOI.
//      Probe, prefilter OFF vs ON: 1,288,095 → 2,797 clipper calls, 19,756 ms → 169 ms,
//      identical federation output (transcript: impl/lane-fed-transcripts/).
//   2. CORRECTNESS — demonstrated by unit test, NOT by that AOI. A degenerate authority ring
//      made EVERY distant backbone candidate compare `undecidable` against it, and the draft
//      QUARANTINED on any undecidable: one bad ring silently deleted backbone-only buildings
//      that had nothing to do with it. The Tallinn extract happens to contain no zero-area
//      ring, so the probe does NOT show this — the suite's "ONE degenerate authority ring
//      does NOT quarantine the whole backbone" case does. Said plainly so nobody cites the
//      probe for it.
// Identity arms are exempt from the prefilter, because a GERS or bridge match is true
// regardless of where the two footprints sit.
//
// COORDINATES: candidates arrive as flat rings in ONE shared PROJECTED metric CRS (the probe
// uses EPSG:3301 for the Tallinn AOI — Overture is reprojected INTO the national CRS
// upstream, so no lat/lon anisotropy corrupts the IoU; same doctrine as the NRW join's
// "native is the point"). The CRS is carried, asserted equal across sources, and stamped
// onto the output geometry verbatim — this module does zero reprojection (C58 purity).
//
// PURE (C58 §1.9): no I/O, no RNG, deterministic; same inputs ⇒ byte-identical outputs.

import {
    intersectPolygons2D,
    polygonSignedArea2D,
    type Pt2,
} from '@pryzm/geometry-kernel';
import type { BuildingHeightMethod, SiteIntelBuilding } from '@pryzm/schemas';
import { boundsDisjoint, ringBounds, type RingBounds } from '../geometry/ringValidation.js';
import { sameGersEntity, type GersBridge, type GersId } from './gersId.js';
import {
    assertUsableFederationSource,
    usableLicenceClass,
    type FederationLicenceClass,
    type FederationSourceId,
} from './sourcePriority.js';

/* ────────────────────────────── Inputs ──────────────────────────────────── */

/** One building candidate from ONE source, before conflation. */
export interface FederationCandidate {
    /** The source's own feature id (etak_id, EHR gid, Overture GERS id …). */
    readonly sourceFeatureId: string;
    /** GERS id where the source carries one (Overture always; national usually never). */
    readonly gersId: GersId | null;
    /** Footprint outer ring, flat, in the shared metric CRS. ≥3 vertices. */
    readonly ring: readonly Pt2[];
    /** Height in metres, or null = UNKNOWN (control 9 — never 0). */
    readonly heightM: number | null;
    /** What kind of height claim that is (frozen E1a vocabulary). Null iff heightM null. */
    readonly heightMethod: BuildingHeightMethod | null;
    /** Floors above ground, or null = UNKNOWN. */
    readonly floorsAbove: number | null;
}

export interface FederationInput {
    readonly source: FederationSourceId;
    /** Shared metric CRS the rings are in, e.g. `"EPSG:3301"`. */
    readonly crs: string;
    /**
     * The NATIONAL id scheme `sourceFeatureId` is expressed in — `"etak_id"`,
     * `"refcat"`, `"BFE"` … — or `null` when the source carries no national
     * identifier at all.
     *
     * ⚠ Null is the honest answer for the pan-EU backbone, and it is load-bearing: a GERS
     * UUID is NOT a national id, and stamping one into `SiteIntelBuilding.nationalIds`
     * under an invented scheme (the inherited draft wrote the literal scheme
     * `"sourceFeatureId"`, for every source, against `country`) fabricates a national
     * register entry for a pan-EU ODbL row. The backbone's identity lives in `gersId`,
     * where the frozen schema already put it.
     */
    readonly idScheme: string | null;
    readonly candidates: readonly FederationCandidate[];
}

/* ─────────────────────────────── Matching ───────────────────────────────── */

/**
 * IoU threshold for "same building". 0.5 is the scaffold's documented starting
 * point (a footprint must claim the MAJORITY of the union to be the same
 * entity); calibration against a larger corpus is later-lane work — recorded,
 * not pre-empted (control 10). The probe reports the achieved distribution so
 * the calibration lane starts from a measurement.
 */
export const FEDERATION_IOU_THRESHOLD = 0.5;

/**
 * What the IDENTITY arms say about a pair, before any geometry is touched.
 * Separated from {@link matchCandidates} so that the identity decision has ONE
 * definition, usable both pairwise and under the bounds prefilter (which may
 * skip geometry but must never skip identity).
 */
export type IdentityVerdict =
    /** A published bridge maps the backbone's GERS id onto this authority's feature id. */
    | { readonly kind: 'same'; readonly via: 'bridge'; readonly nationalFeatureId: string }
    /** Both sides carry the same GERS id. */
    | { readonly kind: 'same'; readonly via: 'gers'; readonly gersId: GersId }
    /**
     * Both sides carry a GERS id and they DIFFER. GERS is the stronger key
     * (row 2), so the pair is distinct REGISTERED entities even if the
     * footprints overlap — geometry may not overturn this, and the overlap is
     * reported for review rather than silently merged.
     */
    | { readonly kind: 'conflict' }
    /** Identity says nothing; geometry decides. */
    | { readonly kind: 'no-opinion' };

export type MatchVerdict =
    /** Same entity. `via` says which key decided. */
    | { readonly verdict: 'same-building'; readonly via: 'bridge'; readonly nationalFeatureId: string }
    | { readonly verdict: 'same-building'; readonly via: 'gers'; readonly gersId: GersId }
    | { readonly verdict: 'same-building'; readonly via: 'iou'; readonly iou: number }
    | { readonly verdict: 'distinct'; readonly via: 'iou'; readonly iou: number }
    | { readonly verdict: 'distinct'; readonly via: 'gers-conflict'; readonly iou: number | null }
    /**
     * The geometry comparison REFUSED (degenerate ring, self-intersection,
     * clipper topology gap). Unknown stays distinct from "measured distinct"
     * (control 9): an undecidable pair is surfaced, and the candidate is
     * QUARANTINED rather than minted as a new building (a double-count would
     * overstate; §CONTEXT-DATA-HONESTY).
     */
    | { readonly verdict: 'undecidable'; readonly reason: string };

/**
 * THE identity arms, in priority order: a PUBLISHED BRIDGE beats a GERS id
 * comparison, because a bridge is the upstream's own conflation result rather
 * than ours (e5-oss-delta §D1: "the conflation key is a LOOKUP, not a
 * computation").
 *
 * DIRECTIONAL, unlike the geometry arm: `authority` is the national record whose
 * `sourceFeatureId` a bridge file names, `backbone` is the row carrying the GERS
 * id. Passing them the other way round loses only the bridge arm.
 */
export function matchByIdentity(
    authority: FederationCandidate,
    backbone: FederationCandidate,
    bridge?: GersBridge,
): IdentityVerdict {
    if (bridge && backbone.gersId !== null) {
        const bridged = bridge.nationalFeatureIdFor(backbone.gersId);
        // A MISS is an honest absence, never a refutation: the bridge may simply carry no
        // row for this id, so we fall through to the remaining arms.
        if (bridged !== null && bridged === authority.sourceFeatureId) {
            return { kind: 'same', via: 'bridge', nationalFeatureId: bridged };
        }
    }
    if (authority.gersId !== null && backbone.gersId !== null) {
        return sameGersEntity(authority.gersId, backbone.gersId)
            ? { kind: 'same', via: 'gers', gersId: authority.gersId }
            : { kind: 'conflict' };
    }
    return { kind: 'no-opinion' };
}

/** Sum of a boolean result's positive loop areas (intersection of simple rings has no holes). */
function loopsArea(loops: readonly (readonly Pt2[])[]): number {
    let a = 0;
    for (const loop of loops) a += Math.abs(polygonSignedArea2D(loop));
    return a;
}

/**
 * THE match interface (row 2: bridge where published, GERS where both carry it,
 * geometry IoU otherwise). Pure; the geometry arm is symmetric, the bridge arm
 * is directional (see {@link matchByIdentity}).
 */
export function matchCandidates(
    authority: FederationCandidate,
    backbone: FederationCandidate,
    bridge?: GersBridge,
): MatchVerdict {
    const id = matchByIdentity(authority, backbone, bridge);
    if (id.kind === 'same') {
        return id.via === 'bridge'
            ? { verdict: 'same-building', via: 'bridge', nationalFeatureId: id.nationalFeatureId }
            : { verdict: 'same-building', via: 'gers', gersId: id.gersId };
    }
    const geo = geometryIou(authority.ring, backbone.ring);
    if (id.kind === 'conflict') {
        return { verdict: 'distinct', via: 'gers-conflict', iou: geo.ok ? geo.iou : null };
    }
    if (!geo.ok) return { verdict: 'undecidable', reason: geo.reason };
    return geo.iou >= FEDERATION_IOU_THRESHOLD
        ? { verdict: 'same-building', via: 'iou', iou: geo.iou }
        : { verdict: 'distinct', via: 'iou', iou: geo.iou };
}

/** IoU of two rings, or a NAMED refusal. area(∪) computed as A + B − area(∩). */
export function geometryIou(
    a: readonly Pt2[],
    b: readonly Pt2[],
): { readonly ok: true; readonly iou: number } | { readonly ok: false; readonly reason: string } {
    const areaA = Math.abs(polygonSignedArea2D(a));
    const areaB = Math.abs(polygonSignedArea2D(b));
    if (!(areaA > 0) || !(areaB > 0)) {
        return { ok: false, reason: 'zero-or-degenerate-ring-area' };
    }
    const inter = intersectPolygons2D(a, b);
    if (!inter.ok) return { ok: false, reason: inter.reason };
    const areaI = loopsArea(inter.loops);
    const areaU = areaA + areaB - areaI;
    /* v8 ignore next — areaU ≥ max(areaA, areaB) > 0 whenever the guards above passed. */
    if (!(areaU > 0)) return { ok: false, reason: 'zero-union-area' };
    return { ok: true, iou: areaI / areaU };
}

/** Bounds of a candidate ring, or null when the ring cannot have any (empty / non-finite). */
export function candidateBounds(c: FederationCandidate): RingBounds | null {
    // ADOPTED: ../geometry/ringValidation.ts. Its `Pt` is {x, z}; here z carries northing
    // (see the file header's coordinates note) — pure arithmetic, CRS-agnostic.
    return ringBounds(c.ring.map((p) => ({ x: p[0], z: p[1] })));
}

/**
 * Are two candidates PROVABLY not the same building on bounds alone?
 *
 * One-sided, exactly like the function it adopts: `true` proves the footprints cannot
 * overlap, so the geometry arm can only ever answer "distinct" and the clipper need not run.
 * `false` proves nothing. Unknown bounds (a ring with no finite extent) return `false` — the
 * clipper then runs and refuses by name, which is the honest path (control 9).
 */
function provablyApart(a: RingBounds | null, b: RingBounds | null): boolean {
    if (a === null || b === null) return false;
    return boundsDisjoint(a, b);
}

/* ─────────────────────────────── Federation ─────────────────────────────── */

/**
 * A federated building: the FROZEN canonical record, plus the two facts the
 * federation boundary needs that the canonical model deliberately does not
 * carry — the licence class the odblStore boundary keys on, and the id of the
 * feature the shape came from. Both live on the WRAPPER: adding either to
 * `SiteIntelBuilding` would be a canonical-model change (forbidden, control 3).
 *
 * LICENCE PROPAGATION IS CONSERVATIVE: any attribute contributed by an
 * ODbL-share-alike source — including a GERS id alone — marks the record
 * `odbl-share-alike`. Whether a bare GERS id really encumbers a record is an
 * OPEN legal question recorded for the founder (impl findings §open-questions);
 * until answered, the conservative reading stands (never-overstate applies to
 * licence cleanliness too).
 */
export interface FederatedBuilding {
    readonly building: SiteIntelBuilding;
    readonly licence: Exclude<FederationLicenceClass, 'unresolved'>;
    /** The contributing feature id in ITS source's own id space (never re-derived from `id`). */
    readonly sourceFeatureId: string;
}

/** The task-brief provenance view — a PROJECTION of the canonical record, not a store. */
export interface FederationProvenanceView {
    readonly source: string;
    readonly sourceFeatureId: string;
    readonly gersId: string | null;
    /** Height confidence: the frozen method vocabulary, or UNKNOWN when no height claim. */
    readonly heightConfidence: BuildingHeightMethod | 'UNKNOWN';
    /** WHICH source the height claim came from — the visible half of the weld-split. */
    readonly heightSource: string;
    /** Floor confidence: STATED (a source served a floor count) or UNKNOWN. */
    readonly floorConfidence: 'STATED' | 'UNKNOWN';
    /** WHICH source the floor count came from. */
    readonly floorSource: string;
}

export function federationProvenance(fb: FederatedBuilding): FederationProvenanceView {
    const b = fb.building;
    return {
        source: b.source,
        sourceFeatureId: fb.sourceFeatureId,
        gersId: b.gersId,
        heightConfidence: b.height.value === null ? 'UNKNOWN' : b.height.method,
        heightSource: b.height.source,
        floorConfidence: b.floors.above === null ? 'UNKNOWN' : 'STATED',
        floorSource: b.floors.source,
    };
}

/** One reported pair. */
export interface FederationPairNote {
    readonly authorityFeatureId: string;
    readonly backboneFeatureId: string;
}

export interface FederationReport {
    readonly crs: string;
    readonly authorityCount: number;
    readonly backboneCount: number;
    /** Matched by a PUBLISHED bridge file (`opts.bridge`), the preferred key. */
    readonly matchedViaBridge: number;
    readonly matchedViaGers: number;
    readonly matchedViaIou: number;
    /** Backbone candidates matched to an authority building (deduped, gersId attached). */
    readonly deduped: number;
    /** Authority buildings no backbone candidate matched. */
    readonly authorityOnly: number;
    /** Backbone candidates matching no authority building — minted as backbone buildings. */
    readonly backboneOnly: number;
    /** Height claims filled FROM THE BACKBONE because the authority had none. */
    readonly heightsFilledFromBackbone: number;
    /** Floor counts filled FROM THE BACKBONE because the authority had none. */
    readonly floorsFilledFromBackbone: number;
    /**
     * Pairs whose footprints overlap but whose GERS ids DIFFER — reported for review,
     * never merged (the claim the inherited draft documented and did not implement).
     */
    readonly gersConflicts: readonly (FederationPairNote & { readonly iou: number | null })[];
    /** Quarantined pairs — surfaced, never merged, never double-counted. */
    readonly undecidable: readonly (FederationPairNote & { readonly reason: string })[];
    /**
     * How many pairs actually reached the clipper, out of `authorityCount × backboneCount`.
     * Printed so the bounds prefilter's effect is a measured number rather than a claim.
     */
    readonly geometryComparisons: number;
}

/**
 * Input honesty (control 9): a candidate must claim a height METHOD iff it
 * claims a height VALUE — a method on a null value would be a fabricated claim,
 * a value with no method an unlabelled one. Refused loudly, naming the feature.
 */
function assertCandidateHonesty(c: FederationCandidate, source: FederationSourceId): void {
    if ((c.heightM === null) !== (c.heightMethod === null)) {
        throw new Error(
            `[buildingsFederation] candidate '${c.sourceFeatureId}' from '${source}': heightM `
            + `and heightMethod must be both null (UNKNOWN) or both present — got heightM=`
            + `${String(c.heightM)}, heightMethod=${String(c.heightMethod)}`,
        );
    }
}

function toBuilding(
    c: FederationCandidate,
    source: FederationSourceId,
    crs: string,
    country: string,
    idScheme: string | null,
    gersId: GersId | null,
): SiteIntelBuilding {
    return {
        id: `${source}:${c.sourceFeatureId}`,
        gersId,
        // A national id ONLY where the source is a national register (see FederationInput
        // .idScheme). The pan-EU backbone gets `[]` — an honest empty, not an invented row.
        nationalIds:
            idScheme === null ? [] : [{ country, scheme: idScheme, value: c.sourceFeatureId }],
        footprint: {
            crs,
            kind: 'Polygon',
            coordinates: [c.ring.map((p) => [p[0], p[1]])],
        },
        // The frozen schema requires a method even beside a null value; 'MODELLED' there is a
        // VACUOUS filler, never a claim — every honest read goes through the value-null test
        // (federationProvenance reports 'UNKNOWN'), per the schema's own "null + tier-6" note.
        // Recorded for a later canonical-model wave (control 10): the honest shape would be
        // `method: null` when `value` is null, which is a FROZEN-schema change and therefore
        // not this lane's to make.
        height: { value: c.heightM, method: c.heightMethod ?? 'MODELLED', source },
        floors: { above: c.floorsAbove, below: null, source },
        use: null,
        yearBuilt: null,
        lod: null,
        source,
        version: null,
    };
}

/** Optional federation inputs — never required for the geometric path. */
export interface FederateOptions {
    /**
     * A published GERS bridge for this country, PREFERRED over computing IoU
     * (e5-oss-delta §D1). None is supplied anywhere in the repo today: the only
     * bridged Pryzm country is ES and the bridge-files licence is NOT STATED
     * (`FEDERATION_CONFLATION_STRATEGY`). The seam exists so that the day the
     * licence resolves, ES conflation becomes a lookup and no geometric matcher
     * has to be trusted for Spain.
     */
    readonly bridge?: GersBridge;
}

/**
 * Federate ONE tier-1 authority set with ONE tier-2 backbone set (the scaffold's
 * probe shape; more sources per tier is a widening, not a redesign):
 *
 *   • Authority shapes ALWAYS win (row 2: "national LoD2/cadastre override").
 *   • A matched backbone candidate is DEDUPED into the authority building: it
 *     contributes its GERS id, and fills height/floors ONLY where the authority
 *     is null — each filled attribute carries the BACKBONE's source id, the
 *     authority-sourced attributes keep the authority's (the weld-split, live).
 *   • An unmatched backbone candidate is minted as a backbone building
 *     (ODbL-tagged — separability is then enforced by odblStore.ts).
 *   • An undecidable pair is QUARANTINED: reported, and the backbone candidate
 *     is withheld from minting (never double-counted, never silently merged).
 *     Only pairs whose bounds actually overlap can be undecidable — see the
 *     header on why that distinction is a correctness fix, not a speed-up.
 *
 * `country` stamps the authority's nationalIds rows (ISO-3166 alpha-2).
 */
export function federateBuildings(
    authority: FederationInput,
    backbone: FederationInput,
    country: string,
    opts: FederateOptions = {},
): { readonly buildings: readonly FederatedBuilding[]; readonly report: FederationReport } {
    const authorityRow = assertUsableFederationSource(authority.source);
    const backboneRow = assertUsableFederationSource(backbone.source);
    if (authorityRow.role !== 'footprint-authority') {
        throw new Error(
            `[buildingsFederation] '${authority.source}' (role ${authorityRow.role}) cannot `
            + `serve as the footprint authority`,
        );
    }
    if (backboneRow.role !== 'backbone') {
        throw new Error(
            `[buildingsFederation] '${backbone.source}' (role ${backboneRow.role}) cannot `
            + `serve as the backbone`,
        );
    }
    if (authority.crs !== backbone.crs) {
        throw new Error(
            `[buildingsFederation] CRS mismatch: authority '${authority.crs}' vs backbone `
            + `'${backbone.crs}' — reproject upstream; this module does no reprojection`,
        );
    }
    if (authority.idScheme === null) {
        throw new Error(
            `[buildingsFederation] the footprint authority '${authority.source}' must declare `
            + `the national id scheme its sourceFeatureIds are in (e.g. 'etak_id') — a `
            + `national record without its scheme cannot be stamped honestly`,
        );
    }

    const crs = authority.crs;
    const authorityLicence = usableLicenceClass(authorityRow);
    const backboneLicence = usableLicenceClass(backboneRow);
    let matchedViaBridge = 0;
    let matchedViaGers = 0;
    let matchedViaIou = 0;
    let heightsFilledFromBackbone = 0;
    let floorsFilledFromBackbone = 0;
    let geometryComparisons = 0;
    const gersConflicts: (FederationPairNote & { iou: number | null })[] = [];
    const undecidable: (FederationPairNote & { reason: string })[] = [];

    for (const c of authority.candidates) assertCandidateHonesty(c, authority.source);
    for (const c of backbone.candidates) assertCandidateHonesty(c, backbone.source);

    // Per-authority accumulation: matched backbone contributions. Bounds are computed ONCE
    // per candidate here, not once per pair.
    const authorityBuildings = authority.candidates.map((c) => ({
        candidate: c,
        bounds: candidateBounds(c),
        gersFromBackbone: null as GersId | null,
        heightFill: null as FederationCandidate | null,
        floorsFill: null as FederationCandidate | null,
        matched: false,
    }));
    const consumedBackbone = new Set<FederationCandidate>();
    const quarantinedBackbone = new Set<FederationCandidate>();

    for (const bc of backbone.candidates) {
        const bcBounds = candidateBounds(bc);
        // Best match: an identity key (bridge > gers) beats IoU; among IoU matches the
        // larger IoU wins.
        let bestEntry: (typeof authorityBuildings)[number] | null = null;
        let bestVia: 'bridge' | 'gers' | 'iou' | null = null;
        let bestIou = -1;
        let sawUndecidable: string | null = null;
        let undecidableAgainst: string | null = null;
        for (const entry of authorityBuildings) {
            // IDENTITY FIRST — never skipped by bounds: a bridge/GERS match is true wherever
            // the two footprints sit.
            const id = matchByIdentity(entry.candidate, bc, opts.bridge);
            if (id.kind === 'same') {
                bestEntry = entry;
                bestVia = id.via;
                break; // an identity key is decisive — no later IoU can displace it.
            }
            if (id.kind === 'conflict') {
                // Distinct by the stronger key. Report the pair ONLY where the footprints
                // really do overlap — that is the case a human should look at.
                if (!provablyApart(entry.bounds, bcBounds)) {
                    geometryComparisons++;
                    const geo = geometryIou(entry.candidate.ring, bc.ring);
                    if (!geo.ok || geo.iou > 0) {
                        gersConflicts.push({
                            authorityFeatureId: entry.candidate.sourceFeatureId,
                            backboneFeatureId: bc.sourceFeatureId,
                            iou: geo.ok ? geo.iou : null,
                        });
                    }
                }
                continue;
            }
            // GEOMETRY — only for pairs the cheap sound test could not separate.
            if (provablyApart(entry.bounds, bcBounds)) continue;
            geometryComparisons++;
            const v = matchCandidates(entry.candidate, bc, opts.bridge);
            if (v.verdict === 'same-building' && v.via === 'iou') {
                if (v.iou > bestIou) {
                    bestEntry = entry;
                    bestVia = 'iou';
                    bestIou = v.iou;
                }
            } else if (v.verdict === 'undecidable') {
                sawUndecidable = v.reason;
                undecidableAgainst = entry.candidate.sourceFeatureId;
            }
        }
        if (bestEntry) {
            const entry = bestEntry;
            entry.matched = true;
            consumedBackbone.add(bc);
            if (bestVia === 'bridge') matchedViaBridge++;
            else if (bestVia === 'gers') matchedViaGers++;
            else matchedViaIou++;
            if (bc.gersId !== null && entry.gersFromBackbone === null) {
                entry.gersFromBackbone = bc.gersId;
            }
            if (entry.candidate.heightM === null && bc.heightM !== null && entry.heightFill === null) {
                entry.heightFill = bc;
                heightsFilledFromBackbone++;
            }
            if (
                entry.candidate.floorsAbove === null
                && bc.floorsAbove !== null
                && entry.floorsFill === null
            ) {
                entry.floorsFill = bc;
                floorsFilledFromBackbone++;
            }
        } else if (sawUndecidable !== null) {
            quarantinedBackbone.add(bc);
            undecidable.push({
                authorityFeatureId: undecidableAgainst ?? '(none)',
                backboneFeatureId: bc.sourceFeatureId,
                reason: sawUndecidable,
            });
        }
    }

    const buildings: FederatedBuilding[] = [];

    for (const entry of authorityBuildings) {
        const c = entry.candidate;
        const gersId = c.gersId ?? entry.gersFromBackbone;
        let building = toBuilding(
            c,
            authority.source,
            crs,
            country,
            authority.idScheme,
            gersId,
        );
        // Weld-split fills: ONLY null attributes, each stamped with the CONTRIBUTOR's source.
        if (entry.heightFill) {
            building = {
                ...building,
                height: {
                    value: entry.heightFill.heightM,
                    method: entry.heightFill.heightMethod ?? 'MODELLED',
                    source: backbone.source,
                },
            };
        }
        if (entry.floorsFill) {
            building = {
                ...building,
                floors: { above: entry.floorsFill.floorsAbove, below: null, source: backbone.source },
            };
        }
        // Conservative licence propagation (see FederatedBuilding docs).
        const touchedByBackbone =
            entry.gersFromBackbone !== null || entry.heightFill !== null || entry.floorsFill !== null;
        const licence = touchedByBackbone && backboneLicence === 'odbl-share-alike'
            ? backboneLicence
            : authorityLicence;
        buildings.push({ building, licence, sourceFeatureId: c.sourceFeatureId });
    }

    let backboneOnly = 0;
    for (const bc of backbone.candidates) {
        if (consumedBackbone.has(bc) || quarantinedBackbone.has(bc)) continue;
        backboneOnly++;
        buildings.push({
            building: toBuilding(
                bc,
                backbone.source,
                crs,
                country,
                backbone.idScheme,
                bc.gersId,
            ),
            licence: backboneLicence,
            sourceFeatureId: bc.sourceFeatureId,
        });
    }

    return {
        buildings,
        report: {
            crs,
            authorityCount: authority.candidates.length,
            backboneCount: backbone.candidates.length,
            matchedViaBridge,
            matchedViaGers,
            matchedViaIou,
            deduped: consumedBackbone.size,
            authorityOnly: authorityBuildings.filter((e) => !e.matched).length,
            backboneOnly,
            heightsFilledFromBackbone,
            floorsFilledFromBackbone,
            gersConflicts,
            undecidable,
            geometryComparisons,
        },
    };
}
