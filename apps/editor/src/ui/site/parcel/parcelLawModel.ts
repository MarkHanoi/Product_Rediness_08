// §PARCEL-LAW-MODEL (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §25.11 clause 1 · C06 §13.3 ·
// C19 §5.6 · C57 §1.5 / §1.9 / §2.4 · C58 §1.4) — THE ONE PARCEL/ORDINANCE/MASSING MODEL
// THAT BOTH SURFACES RENDER FROM.
//
// Founder 2026-09-06: *"UNDER THE PARCEL PANEL ON THE LEFT HAND SIDE RAIL PANEL YOU HAVE
// ALREADY A LOT OF THE DATA FOR THE 'GENERATIVE ENGINE RESI' — THIS SHOULD MIGRATE AND
// EXTEND TO THE NEW PARCEL LAW TAB."*
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHAT WAS ACTUALLY WRONG, MEASURED — AND IT IS NOT "THE TAB HAS NO ROWS"
// ═══════════════════════════════════════════════════════════════════════════════════════
// Two of the three halves were ALREADY shared, and this file does not touch them:
//
//   · the CADASTRAL half is one producer already — `parcelProvenanceToCardModel` +
//     `buildParcelCard` (§L-1581). Two hosts, two DOM trees, ONE view-model function.
//   · the ENVELOPE CARD is a re-homed SINGLETON — literally one element moved between
//     hosts by `window.pryzmMountEnvelopeCard` (§GIS-ENVELOPE-REHOST L-1362). One element
//     cannot disagree with itself.
//
// The third half was NOT shared, and it is the half §25.11 clause 1 is about. Every
// number under *Full site & massing data* — parcel area, perimeter, bounding box, edge
// count + frontage clause, buildable depth, max height, storeys, FAR, coverage, buildable
// footprint, footprint/parcel %, footprint perimeter, GFA, study volume, the per-storey
// band table and the Art. 323 dwelling count — is derived inside `buildSiteDataBlock`, a
// **closure local to `GISAreaLayout.ts`** (a 6,414-line module). MEASURED: `polyAreaM2`,
// `polyPerimeterM`, `polyBboxM` and `permittedStudyFigures` are `const`s inside
// `mountGISArea`, reachable by nothing outside it — and `polyAreaM2` is itself the THIRD
// copy of a shoelace that already exists as `polygonAreaXZ` in `siteInspectorData.ts`
// (the fourth is in `HouseLayoutController.ts:709`).
//
// So the ONLY way for the Parcel Law tab to state "buildable footprint" or "GFA" was to
// write its own arithmetic. That is precisely the defect §25.11 clause 1 forbids: two
// independently-computed parcel models, over legally-loaded figures, on two surfaces the
// founder has open side by side in his own screenshot. This module is the extraction that
// removes the possibility.
//
// ⛔ THIS IS A MIGRATION, NOT A COPY. `GISAreaLayout.buildSiteDataBlock` renders FROM this
// model; it no longer computes these figures. If you find yourself adding a second
// `footprint × storeys` anywhere, that is the bug this file exists to prevent.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE HONESTY CONTRACT OF THIS MODEL — `null` IS A VALUE, NOT AN OVERSIGHT
// ═══════════════════════════════════════════════════════════════════════════════════════
// Every numeric field is `number | null`, and `null` means THE RULE PACK DID NOT DERIVE
// THIS. It is never 0, never a plausible constant, and never a silent omission:
//
//   · `gfaM2` is null whenever `maxFloors` is null — footprint × a GUESSED storey count is
//     indistinguishable from footprint × a derived one, and it propagates into money
//     (C58 §1.4 / L-616).
//   · `perStorey` is null when storeys were not derived; its `floorToFloorM` is separately
//     null when no max height was derived, so the band column says so rather than inventing
//     a floor-to-floor.
//   · `geometry` is null with a NAMED `geometryAbsence` when the committed ring could not
//     be read — a missing READ, which is a different fact from a missing constraint
//     (§CONTEXT-DATA-HONESTY, L-422/457/467/469).
//   · `capacity.maxDwellings` inherits GFA's null. An indication, never a determination.
//
// A renderer may format these however it likes; it may not substitute a number for a null.
//
// PURE: no DOM, no THREE, no store import, no `window`. Every input is passed in, so the
// model is testable against plain objects and both surfaces can build it from whatever
// reader they already hold. P6 — this file writes no store. P8 — one span per exported
// function is NOT applicable to a pure L7 UI model with no I/O; the two exported functions
// are total functions over their arguments (Zone C of `check-otel-spans.ts`).

import { trace } from '@opentelemetry/api';
import type { BuildableEnvelope } from '@pryzm/schemas';
import { BCN_ART323_DWELLING_MODULE_M2 } from '@pryzm/site-parcel-data';
import {
    frontageClause,
    frontEdgeCount,
    parcelEdgeClassificationsOrUnknown,
} from '../parcelEdgeClassificationDetermination.js';
import { polygonAreaXZ, type XZVertex } from '../siteInspectorData.js';
import type { ParcelCardModel } from './parcelCard.js';

const _tracer = trace.getTracer('pryzm.site.parcelLawModel');

/** How many storey rows a surface may render before the model truncates. Mirrors the card. */
export const PARCEL_LAW_MAX_LISTED_STOREYS = 40;

// ─────────────────────────────────────────────────────────────────────────────────────────
// The sections. One interface per group the founder named, in the order he named them:
// PARCEL · ORDINANCE LIMITS · MASSING POTENTIAL · PER STOREY (+ CAPACITY, §L-588/§L-590).
// ─────────────────────────────────────────────────────────────────────────────────────────

/** Why the parcel geometry is absent. Distinct values — never collapsed into one blank. */
export type ParcelLawGeometryAbsence =
    /** No committed ring reached this reader at all (the §MURCIA-CARD-PARCEL-RING failure). */
    | 'ring-unreadable'
    /** A ring exists but has fewer than three vertices — it is not a polygon. */
    | 'ring-degenerate';

/** Why the cadastral identity is absent. Mirrors `buildParcelSectionBody`'s three states. */
export type ParcelLawIdentityAbsence =
    | 'none'
    /** No boundary committed to the project yet. `PARCEL_NO_BOUNDARY_TEXT`. */
    | 'no-boundary'
    /** Ring committed, `parcel.provenance` null. `PARCEL_PROVENANCE_ABSENT_TEXT`. */
    | 'provenance-not-recorded';

/** What the determination is, as a whole. Drives which sections a surface may render. */
export type ParcelLawEnvelopeState =
    /** A solved determination with numeric rows. */
    | 'determined'
    /** The ordinance/data answered and there is no envelope — `env.refusal` is the content. */
    | 'refused'
    /** No envelope reached this reader (no parcel, cleared, or nothing solved yet). */
    | 'absent';

/** PARCEL — pure geometry off the committed boundary, in scene metres. */
export interface ParcelLawGeometry {
    readonly areaM2: number;
    readonly perimeterM: number;
    /** Axis-aligned extent. Labelled a BOUNDING BOX by every renderer — a non-rectangular
     *  parcel has no single width × depth, and calling it "dimensions" overstates it. */
    readonly bboxWidthM: number;
    readonly bboxDepthM: number;
    readonly edgeCount: number;
    /** The non-empty clause for every arm of §GR-10/GR-14. Never `''`. */
    readonly frontageClause: string;
    /** `null` = NOBODY CLASSIFIED THE EDGES. Not the same fact as "no edge is frontage". */
    readonly frontEdgeCount: number | null;
    /**
     * §26.6.2 (L-13046) — ONE ROW PER RING EDGE, for the setback register and the per-edge
     * hyperlink. `classification` is the C19 §2.3 label when the edges were classified, and
     * `null` — per edge — when nobody recorded one (C19 §10.1 is pending). ⛔ Never inferred.
     */
    readonly edges: readonly ParcelLawEdge[];
}

/** One edge of the committed ring, from vertex `index` to vertex `index + 1` (wrapping). */
export interface ParcelLawEdge {
    /** 0-based ring vertex index the edge starts at. The edge's highlight subject is `edge:<index>`. */
    readonly index: number;
    readonly lengthM: number;
    /** `'front' | 'side' | 'rear' | 'unclassified'` as recorded, or `null` when nothing was. */
    readonly classification: string | null;
}

/**
 * §26.6.2 (L-13046) — ONE CONSTRAINT OF THE DERIVATION TRACE, with the rule that produced it.
 *
 * C58 §1.3: *"every envelope constraint cites its source rule."* The register renders this per
 * EDGE, so it needs the citation beside the value rather than the first citation in the trace.
 * `valueM` is `null` when the row exists but carries no number (never coerced); a constraint with
 * NO row at all is simply absent from `rules`, which the register prints as *not derived*.
 */
export interface ParcelLawRule {
    readonly valueM: number | null;
    readonly ordinanceRef: string | null;
    /** The per-field provenance flag the trace carries (C58 §1.3), verbatim. */
    readonly provenance: string | null;
    readonly source: string | null;
}

/** ORDINANCE LIMITS — every value read from the derivation trace, with its citation. */
export interface ParcelLawOrdinance {
    readonly zoneCode: string | null;
    /** Alignment zones (Barcelona 13a, Murcia 5.5.3): the depth IS the governing rule. */
    readonly buildableDepthM: number | null;
    /** True only when the engine emitted `alignment.depthBinding` — a BLOCK-derived depth.
     *  Barcelona's Art. 242.2 construction; Murcia states its depth at PARCEL granularity,
     *  and telling a Murcia user their block shares it would misstate the rule's scope. */
    readonly depthIsBlockGranular: boolean;
    /** The LOCAL-LANGUAGE name of the depth rule, read from the citation (§CARD-DEPTH-TERM). */
    readonly depthTerm: string;
    readonly alignmentOffsetM: number | null;
    readonly maxHeightM: number | null;
    readonly maxFloors: number | null;
    readonly maxFAR: number | null;
    /** Percent (0-100), or null. The envelope carries a 0-1 fraction; converted once, here. */
    readonly maxCoveragePct: number | null;
    readonly setbackFrontM: number | null;
    readonly setbackSideM: number | null;
    readonly setbackRearM: number | null;
    /** The first ordinance reference in the derivation, or null when none is held. */
    readonly citation: string | null;
    /** The derivation's source id — the publisher, when one answered. */
    readonly sourceId: string | null;
    /**
     * §26.6.2 — the setback-family constraints of the trace, keyed by their C58 constraint name
     * (`setback.front` · `setback.side` · `setback.rear` · `alignment.depth` ·
     * `alignment.offset`), each with ITS OWN citation. Present only for constraints the trace
     * actually carries. This is what lets the register cite per edge rather than per parcel.
     */
    readonly rules: Readonly<Partial<Record<ParcelLawSetbackConstraint, ParcelLawRule>>>;
}

/** The C58 constraint names the setback register reads. Closed; anything else is not a setback. */
export type ParcelLawSetbackConstraint =
    | 'setback.front'
    | 'setback.side'
    | 'setback.rear'
    | 'alignment.depth'
    | 'alignment.offset';

export const PARCEL_LAW_SETBACK_CONSTRAINTS: readonly ParcelLawSetbackConstraint[] = Object.freeze([
    'setback.front', 'setback.side', 'setback.rear', 'alignment.depth', 'alignment.offset',
] as const);

/** MASSING POTENTIAL — what the limits actually buy. A STUDY, never a permit. */
export interface ParcelLawMassing {
    /** `null` when the pack derived no footprint. Never 0-as-unknown. */
    readonly footprintM2: number | null;
    /** §L-619 — the footprint is the WHOLE PARCEL only because setbacks are unpublished. */
    readonly footprintIsUpperBound: boolean;
    /** footprint ÷ parcel area × 100, or null when either side is unknown. */
    readonly coveragePct: number | null;
    readonly footprintPerimeterM: number | null;
    /** footprint × storeys. NULL whenever storeys were not derived — see the header. */
    readonly gfaM2: number | null;
    readonly studyVolumeM3: number | null;
}

/** One storey band of the PER STOREY table. */
export interface ParcelLawStorey {
    /** 0 = ground. */
    readonly index: number;
    /** 'Ground' · 'Level 1' … Produced here so both surfaces label storeys identically. */
    readonly label: string;
    /** Band base/top in metres, or null when no max height was derived. */
    readonly bandFromM: number | null;
    readonly bandToM: number | null;
    readonly areaM2: number;
}

/** PER STOREY — present only when the storey count is REAL. */
export interface ParcelLawPerStorey {
    readonly storeys: readonly ParcelLawStorey[];
    /** max height ÷ storeys — an EQUAL DIVISION for study, not a regulated storey height.
     *  Null when no max height was derived; the bands are then null too. */
    readonly floorToFloorM: number | null;
    readonly totalCount: number;
    /** How many the model withheld past `PARCEL_LAW_MAX_LISTED_STOREYS`. 0 when none. */
    readonly truncatedCount: number;
}

/** CAPACITY — §L-588/§L-590. A SEPARATE legal question from the envelope's geometry. */
export interface ParcelLawCapacity {
    readonly moduleM2: number;
    /** ⌈GFA ÷ module⌉, or null — it inherits GFA's null rather than inventing a count. */
    readonly maxDwellings: number | null;
    readonly citation: string;
}

/** The refusal, carried through so a surface can state it rather than render a blank. */
export interface ParcelLawRefusal {
    readonly code: string;
    readonly headline: string;
    readonly detail: string;
    readonly legallyGrounded: boolean;
    readonly knownFacts: readonly string[];
    readonly ordinanceRef: string | null;
}

/** THE MODEL. One value; every surface renders a projection of it. */
export interface ParcelLawModel {
    /** The cadastral card view-model, or null when absent — `identityAbsence` says why. */
    readonly identity: ParcelCardModel | null;
    readonly identityAbsence: ParcelLawIdentityAbsence;
    /** The ring area as COMMITTED (C19 `Parcel.area`), kept even when provenance is absent:
     *  how big the ring is remains a fact we hold when where it came from is not. */
    readonly committedAreaM2: number | null;
    readonly geometry: ParcelLawGeometry | null;
    readonly geometryAbsence: ParcelLawGeometryAbsence | null;
    /**
     * §26.6 rule 2 — the RAW `boundary.edgeClassifications`, carried through UNDEFAULTED so a
     * renderer can hand it to `describeSiteHighlightAvailability` (whose frontage arm needs the
     * raw value to tell "absent" from "wrong length" from "all unclassified"). `null` when the
     * input carried nothing. ⛔ A renderer must not `?? []` it — see `ParcelLawModelInput`.
     */
    readonly edgeClassifications: readonly string[] | null;
    readonly envelopeState: ParcelLawEnvelopeState;
    readonly refusal: ParcelLawRefusal | null;
    readonly ordinance: ParcelLawOrdinance | null;
    readonly massing: ParcelLawMassing | null;
    readonly perStorey: ParcelLawPerStorey | null;
    /** Non-null only for the zones whose ordinance PRYZM holds a capacity rule for. */
    readonly capacity: ParcelLawCapacity | null;
    /** The envelope's confidence tier, verbatim. Renderers badge it; none re-rank it. */
    readonly confidence: string | null;
    /** ISO date when the determination shown was SOLVED AND STORED, or null when this
     *  session solved it. A stored snapshot presented as fresh would fabricate recency. */
    readonly determinedAtIso: string | null;
}

/** Everything the model needs, passed in. No reads, no globals — see the header. */
export interface ParcelLawModelInput {
    /** The committed ring in scene-XZ metres, or null/short when it could not be read. */
    readonly parcelRing: ReadonlyArray<XZVertex> | null | undefined;
    /** RAW — pass it through UNDEFAULTED. `?? []` here tells the frontage rule "examined,
     *  landlocked" about a parcel nobody measured, which is the exact conflation
     *  `parcelEdgeClassificationDetermination.ts` was written to end. */
    readonly edgeClassifications: readonly string[] | null | undefined;
    /** The cadastral view-model the ONE card producer builds, or null. */
    readonly identity: ParcelCardModel | null | undefined;
    readonly identityAbsence?: ParcelLawIdentityAbsence;
    /** C19 `Parcel.area` as committed. */
    readonly committedAreaM2?: number | null;
    /** The live or HYDRATED determination. Null when none applies. */
    readonly envelope: BuildableEnvelope | null | undefined;
    readonly determinedAtIso?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Geometry helpers. `polygonAreaXZ` is IMPORTED, never re-written — it is the repo's
// existing shoelace (`siteInspectorData.ts`), and the copy this migration retires was the
// third one. Perimeter and bbox had no shared home and get one here.
// ─────────────────────────────────────────────────────────────────────────────────────────

/** Closed-ring perimeter in metres. A ring under 2 vertices has none. */
export function polygonPerimeterXZ(ring: ReadonlyArray<XZVertex>): number {
    if (ring.length < 2) return 0;
    let p = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        p += Math.hypot(b.x - a.x, b.z - a.z);
    }
    return p;
}

/** Axis-aligned extent. A BOUNDING BOX — see `ParcelLawGeometry` for why it is named so. */
export function polygonBboxXZ(ring: ReadonlyArray<XZVertex>): { readonly w: number; readonly d: number } {
    if (ring.length === 0) return { w: 0, d: 0 };
    const xs = ring.map((p) => p.x);
    const zs = ring.map((p) => p.z);
    return { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs) };
}

/**
 * §CARD-DEPTH-TERM (L-676) — the LOCAL-LANGUAGE name of the buildable-depth rule, read from
 * the ordinance the card already cites rather than from a jurisdiction table, so a new city
 * inherits its own term the moment its pack quotes its own ordinance.
 *
 * ⚠ NOT a hard-coded Catalan string. The card printed *«profunditat edificable»* on Murcia
 * cards whose own citation says *«fondo máximo edificable»* — a credibility defect on the one
 * surface whose whole proposition is that it quotes the law correctly.
 */
export function resolveDepthTerm(ordinanceRef: string | null | undefined): string {
    const t = (ordinanceRef ?? '').toLowerCase();
    if (t.includes('profunditat edificable')) return 'profunditat edificable';
    if (t.includes('profundidad edificable') || t.includes('fondo máximo edificable')) {
        return 'profundidad edificable';
    }
    // Neutral, and deliberately NOT a guess at the local term.
    return 'buildable depth rule';
}

/**
 * §RESI-ORCH-COST — THE ONE PLACE THE PERMITTED FOOTPRINT AND GFA ARE DERIVED.
 *
 * Lifted verbatim (behaviour-for-behaviour) out of `GISAreaLayout.permittedStudyFigures`,
 * which is now a call to this. A second `footprint × storeys` is exactly how a card and the
 * fold beneath it come to state different areas for one parcel (C06 §13.3).
 *
 * ⚠ THE `null` IS THE WHOLE POINT. GFA is withheld whenever the pack derived no storey
 * count, because footprint × a guessed count is indistinguishable from footprint × a derived
 * one — and it would propagate into money.
 */
export function permittedStudyFiguresOf(
    env: Pick<BuildableEnvelope, 'insetPolygon' | 'insetAreaM2' | 'maxFloors'>,
): { readonly footprintM2: number; readonly gfaM2: number | null } {
    const inset = env.insetPolygon ?? [];
    const footprintM2 = env.insetAreaM2 || polygonAreaXZ(inset);
    return {
        footprintM2,
        gfaM2: env.maxFloors !== null && env.maxFloors > 0 ? footprintM2 * env.maxFloors : null,
    };
}

/** A derivation row's numeric value, or null. Never coerces a non-number into one. */
function derivedNumber(env: BuildableEnvelope, constraint: string): number | null {
    const row = env.derivation.find((d) => d.constraint === constraint);
    return typeof row?.value === 'number' ? row.value : null;
}

/**
 * §PARCEL-LAW-MODEL — BUILD THE MODEL. Total over its input: every absence is a named
 * value, and nothing throws. Both the PARCEL rail panel's card and the Parcel Law tab
 * render projections of the value this returns.
 */
export function buildParcelLawModel(input: ParcelLawModelInput): ParcelLawModel {
    const span = _tracer.startSpan('pryzm.site.buildParcelLawModel');
    try {
        const ring = input.parcelRing ?? null;
        const hasRing = Array.isArray(ring) && ring.length >= 3;
        // §26.6 rule 2 — carried raw. `undefined` and a non-array both become `null`; an array is
        // kept AS IS (wrong length included), because the frontage rule is the one that decides
        // what a wrong length means and it must see it.
        const rawEdgeClassifications: readonly string[] | null =
            Array.isArray(input.edgeClassifications) ? [...input.edgeClassifications] : null;
        const geometry: ParcelLawGeometry | null = hasRing
            ? {
                  areaM2: polygonAreaXZ(ring!),
                  perimeterM: polygonPerimeterXZ(ring!),
                  bboxWidthM: polygonBboxXZ(ring!).w,
                  bboxDepthM: polygonBboxXZ(ring!).d,
                  edgeCount: ring!.length,
                  // UNDEFAULTED on purpose — see `ParcelLawModelInput.edgeClassifications`.
                  frontageClause: frontageClause(input.edgeClassifications, ring!.length),
                  frontEdgeCount: frontEdgeCount(input.edgeClassifications, ring!.length),
                  // §26.6.2 — one row per edge. The classification is read through the SAME
                  // three-arm determination the clause and the count use (`null` = not recorded),
                  // so the register can never say "front" about an edge the clause calls
                  // unrecorded.
                  edges: ((): readonly ParcelLawEdge[] => {
                      const labels = parcelEdgeClassificationsOrUnknown(input.edgeClassifications, ring!.length);
                      return Object.freeze(ring!.map((a, i): ParcelLawEdge => {
                          const b = ring![(i + 1) % ring!.length]!;
                          return {
                              index: i,
                              lengthM: Math.hypot(b.x - a.x, b.z - a.z),
                              classification: labels === null ? null : (labels[i] ?? null),
                          };
                      }));
                  })(),
              }
            : null;
        const geometryAbsence: ParcelLawGeometryAbsence | null = hasRing
            ? null
            : ring && ring.length > 0
            ? 'ring-degenerate'
            : 'ring-unreadable';

        const env = input.envelope ?? null;
        const refusal: ParcelLawRefusal | null = env?.refusal
            ? {
                  code: env.refusal.code,
                  headline: env.refusal.headline,
                  detail: env.refusal.detail,
                  legallyGrounded: env.refusal.legallyGrounded === true,
                  knownFacts: Array.isArray(env.refusal.knownFacts) ? env.refusal.knownFacts : [],
                  ordinanceRef: env.refusal.ordinanceRef ?? null,
              }
            : null;
        const envelopeState: ParcelLawEnvelopeState =
            env === null ? 'absent' : refusal !== null ? 'refused' : 'determined';

        // A refusal has no numeric rows BY DESIGN (§L-550/§L-553): three dashes would read as
        // "not filled in yet", which is the ambiguity the refusal card exists to remove. So the
        // ordinance/massing/per-storey sections stay null and the refusal IS the content.
        if (env === null || refusal !== null) {
            span.setAttribute('pryzm.parcelLaw.envelopeState', envelopeState);
            return {
                identity: input.identity ?? null,
                identityAbsence: input.identityAbsence ?? (input.identity ? 'none' : 'no-boundary'),
                committedAreaM2: input.committedAreaM2 ?? null,
                geometry,
                geometryAbsence,
                edgeClassifications: rawEdgeClassifications,
                envelopeState,
                refusal,
                ordinance: null,
                massing: null,
                perStorey: null,
                capacity: null,
                confidence: env?.confidence ?? null,
                determinedAtIso: input.determinedAtIso ?? null,
            };
        }

        const depthRow = env.derivation.find((d) => d.constraint === 'alignment.depth');
        const citation =
            env.derivation.find((d) => typeof d.ordinanceRef === 'string' && d.ordinanceRef)?.ordinanceRef
            ?? null;
        const ordinance: ParcelLawOrdinance = {
            zoneCode: env.zoneCode ?? null,
            buildableDepthM: typeof depthRow?.value === 'number' ? depthRow.value : null,
            depthIsBlockGranular:
                env.derivation.find((d) => d.constraint === 'alignment.depthBinding') !== undefined,
            depthTerm: resolveDepthTerm(depthRow?.ordinanceRef),
            alignmentOffsetM: derivedNumber(env, 'alignment.offset'),
            maxHeightM: env.maxHeight_m,
            maxFloors: env.maxFloors,
            maxFAR: env.maxFAR,
            maxCoveragePct: env.maxCoverage !== null ? env.maxCoverage * 100 : null,
            setbackFrontM: derivedNumber(env, 'setback.front'),
            setbackSideM: derivedNumber(env, 'setback.side'),
            setbackRearM: derivedNumber(env, 'setback.rear'),
            citation,
            sourceId: env.derivation[0]?.source ?? null,
            // §26.6.2 — each setback-family row with ITS OWN citation (C58 §1.3 per constraint).
            // Only rows the trace carries; a missing constraint is missing here too.
            rules: ((): Readonly<Partial<Record<ParcelLawSetbackConstraint, ParcelLawRule>>> => {
                const out: Partial<Record<ParcelLawSetbackConstraint, ParcelLawRule>> = {};
                for (const c of PARCEL_LAW_SETBACK_CONSTRAINTS) {
                    const row = env.derivation.find((d) => d.constraint === c);
                    if (!row) continue;
                    out[c] = {
                        valueM: typeof row.value === 'number' && Number.isFinite(row.value) ? row.value : null,
                        ordinanceRef: typeof row.ordinanceRef === 'string' && row.ordinanceRef ? row.ordinanceRef : null,
                        provenance: typeof row.fieldProvenance === 'string' ? row.fieldProvenance : null,
                        source: typeof row.source === 'string' ? row.source : null,
                    };
                }
                return Object.freeze(out);
            })(),
        };

        const { footprintM2, gfaM2 } = permittedStudyFiguresOf(env);
        const inset = env.insetPolygon ?? [];
        const massing: ParcelLawMassing = {
            // 0 is "the pack derived none" on this seam, exactly as the card's `> 0` test
            // treated it — carried as null so a renderer cannot print a confident zero.
            footprintM2: footprintM2 > 0 ? footprintM2 : null,
            footprintIsUpperBound: env.footprintIsUpperBound === true,
            coveragePct:
                geometry !== null && geometry.areaM2 > 0 && footprintM2 > 0
                    ? (footprintM2 / geometry.areaM2) * 100
                    : null,
            footprintPerimeterM: inset.length >= 3 ? polygonPerimeterXZ(inset) : null,
            // ⚠ A NAMED, DELIBERATE DIVERGENCE FROM THE PRE-MIGRATION CARD, and the only one.
            // `permittedStudyFiguresOf` is the extracted function bug-for-bug, so it still returns
            // `0 × storeys = 0` for a zero footprint — and the card printed that as "0 m²" in the
            // GFA row while printing "not derived" in the footprint row directly above it. Two
            // spellings of one absence, and the numeric one is a claim: it tells a landowner they
            // may build nothing, when what is true is that PRYZM derived no footprint (C58 §1.4 /
            // L-616 — an unknown drawn as a bound is an overstatement on real land, and this is the
            // same defect pointing down). On the MODEL, `null` means not derived, everywhere, so a
            // GFA with no footprint under it is null too. The cost/target-area folds keep reading
            // `permittedStudyFiguresOf` and are unchanged.
            gfaM2: footprintM2 > 0 ? gfaM2 : null,
            studyVolumeM3: env.maxVolumeM3,
        };

        // PER STOREY — only when storeys are real AND there is a footprint to attribute.
        const perStorey: ParcelLawPerStorey | null = ((): ParcelLawPerStorey | null => {
            const n = env.maxFloors;
            if (n === null || n <= 0 || footprintM2 <= 0) return null;
            const ftf = env.maxHeight_m !== null ? env.maxHeight_m / n : null;
            const listed = Math.min(n, PARCEL_LAW_MAX_LISTED_STOREYS);
            const storeys = Array.from({ length: listed }, (_, i): ParcelLawStorey => ({
                index: i,
                label: i === 0 ? 'Ground' : `Level ${i}`,
                bandFromM: ftf !== null ? i * ftf : null,
                bandToM: ftf !== null ? (i + 1) * ftf : null,
                areaM2: footprintM2,
            }));
            return { storeys, floorToFloorM: ftf, totalCount: n, truncatedCount: Math.max(0, n - listed) };
        })();

        // CAPACITY — §L-590. Barcelona's Art. 323 states a per-parcel DWELLING COUNT derived
        // from BUILT AREA (*"d'aplicació exclusiva al municipi de Barcelona"*), so the section
        // is offered ONLY for the zones the rule governs. Everywhere else it is null — an
        // absent section, never a zeroed one.
        const capacity: ParcelLawCapacity | null =
            env.zoneCode === '13a' || env.zoneCode === '13b'
                ? {
                      moduleM2: BCN_ART323_DWELLING_MODULE_M2,
                      maxDwellings:
                          gfaM2 !== null && gfaM2 > 0
                              ? Math.ceil(gfaM2 / BCN_ART323_DWELLING_MODULE_M2)
                              : null,
                      citation: 'PGM Art. 323 — aplicació exclusiva al municipi de Barcelona',
                  }
                : null;

        span.setAttribute('pryzm.parcelLaw.envelopeState', envelopeState);
        return {
            identity: input.identity ?? null,
            identityAbsence: input.identityAbsence ?? (input.identity ? 'none' : 'no-boundary'),
            committedAreaM2: input.committedAreaM2 ?? null,
            geometry,
            geometryAbsence,
            edgeClassifications: rawEdgeClassifications,
            envelopeState,
            refusal: null,
            ordinance,
            massing,
            perStorey,
            capacity,
            confidence: env.confidence ?? null,
            determinedAtIso: input.determinedAtIso ?? null,
        };
    } finally {
        span.end();
    }
}
