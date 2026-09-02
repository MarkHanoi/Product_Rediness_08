// ADR-0377 / §S1-DATUM — THE HEIGHT DATUM SEAT: *from which plane is a stated height measured?*
//
// WHY THIS EXISTS
// ---------------
// One token — "max height X m" — has been carrying at least four legally distinct quantities
// across the corpus (envelope-architecture audit, lane A §4.1 / matrix row "Terrain datum"):
//
//   • ES (PGM Art. 240, L-584): the *alçada reguladora* is measured from the RASANT AT THE
//     FAÇADE, with explicit tram-segmentation machinery for sloping streets
//     (`packages/site-parcel-data/src/geometry/facadeRasantDatum.ts` transcribes the article).
//     Sampling a centroid instead is a compliance defect already being published — metres in
//     the Gòtic.
//   • ES (PGM Art. 350.2.e): the interior-tier 5 m is measured «des de la rasant del carrer» —
//     the STREET's finished grade, not the façade rasant and not a flat datum.
//   • PT (Porto PDM Art. 3.º g): the *cércea* runs from the MEAN GROUND LEVEL AT THE FAÇADE
//     ALIGNMENT to the eave/parapet — a third reference. (EE's `maapinna keskmine kõrgus` is the
//     same family, taken at the building corners.)
//   • FR/DE/EE (Paris HMC in NGF; DE "…Gebäudeoberkante von bis zu 72,2 m über NHN"; EE
//     `korgusabs` in EH2000): an ABSOLUTE NATIONAL ALTITUDE. **Not a building height at all** —
//     comparing it to a relative height, or loading it into a relative-height seat, is the
//     defect the E8 trial measured on the DE path ("auto-accepts with zero flags"). Paris
//     deliberately does NOT apply HMC as a cap because converting it needs the façade rasant.
//   • DK/DE (matrix C10, terrain rows): natural-terrain references — ordinances that measure
//     from the highest or lowest point of the surrounding natural terrain.
//
// A single scalar with no datum flattens these; a wrong datum is not "approximately wrong", it
// is measured from the wrong plane. This module names the reference once, so every height-bearing
// rule can SAY which plane it means — and so an unresolved source can say `unknown` instead of
// silently defaulting to whichever plane the consumer assumed.
//
// WHY A DISCRIMINATED UNION (the GeometricRule idiom, ADR-0270 reason 4)
// ----------------------------------------------------------------------
// `absolute-national` is only meaningful WITH its vertical reference frame; the other members
// carry none. A discriminated union makes the incoherent states unrepresentable (a frameless
// absolute datum fails parse; a frame on a relative datum fails parse via `.strict()`), and it
// gives consumers an exhaustive TS switch, so a future datum member that no resolver handles is
// a COMPILE error, not a silently mis-seated height.
//
// APPEND-ONLY. Adding a member is a new ADR citing a real ordinance (the ADR-0270..0288 minting
// discipline). Known future member, deliberately NOT minted here for want of a consuming pack:
// DK *niveauplan* — a municipally fixed reference plane `fixed-niveauplan(z)` (matrix C10; zero
// repo hits today; "a fact nothing consumes is NOT declared", factVocabulary.ts doctrine).
//
// P5 — PURE. Zod only. No I/O, no THREE, no DOM.

import { z } from 'zod';

/**
 * The national vertical reference frames the corpus has actually met (lane A §4.1 / matrix C6):
 * NGF (France — Paris HMC), NHN (Germany — "72,2 m über NHN", e8-trial), EH2000 (Estonia —
 * `korgusabs`). Append-only; a new frame arrives with the rule that cites it.
 */
export const AbsoluteVerticalFrameSchema = z.enum(['NGF', 'NHN', 'EH2000']);
export type AbsoluteVerticalFrame = z.infer<typeof AbsoluteVerticalFrameSchema>;

// Each member is `.strict()` so an incoherent pair REJECTS at parse rather than being silently
// stripped — `{ kind: 'street-level', frame: 'NHN' }` is a transcription error, not data.
const FacadeRasantDatum = z.object({ kind: z.literal('facade-rasant') }).strict();
const StreetLevelDatum = z.object({ kind: z.literal('street-level') }).strict();
const MeanGroundAtFacadeDatum = z.object({ kind: z.literal('mean-ground-at-facade') }).strict();
const AbsoluteNationalDatum = z
    .object({
        kind: z.literal('absolute-national'),
        /** REQUIRED — an absolute altitude without its frame is not a datum, it is a number. */
        frame: AbsoluteVerticalFrameSchema,
    })
    .strict();
const TerrainHighestDatum = z.object({ kind: z.literal('terrain-highest') }).strict();
const TerrainLowestDatum = z.object({ kind: z.literal('terrain-lowest') }).strict();
const UnknownDatum = z.object({ kind: z.literal('unknown') }).strict();

/**
 * The height datum union. `unknown` is a FIRST-CLASS member — the honest value for a source whose
 * datum semantics are not yet resolved (EE `korgus` rides free-text `tingimus`; DE §6
 * H-measurement semantics are PENDING a primary read). Ingestion stamps `unknown`, never a
 * specific plane; every resolver consumer REFUSES on it (never defaults).
 */
export const HeightDatumSchema = z.discriminatedUnion('kind', [
    FacadeRasantDatum,
    StreetLevelDatum,
    MeanGroundAtFacadeDatum,
    AbsoluteNationalDatum,
    TerrainHighestDatum,
    TerrainLowestDatum,
    UnknownDatum,
]);
export type HeightDatum = z.infer<typeof HeightDatumSchema>;
export type HeightDatumKind = HeightDatum['kind'];

/** The one legal spelling of the unresolved datum. */
export const UNKNOWN_HEIGHT_DATUM: HeightDatum = Object.freeze({ kind: 'unknown' });

/**
 * TOTAL read helper — the `GeometricRuleCompatSchema` idiom applied to the datum seat. Every pack
 * shipped before ADR-0377 states no datum; for them the identity is `unknown` (the datum is
 * genuinely unresolved — stamping it is not a guess). Consumers read THIS, never the raw optional
 * field, so a height answer always travels with a datum and absence can never be mistaken for
 * any specific plane.
 */
export function heightDatumOf(datum: HeightDatum | null | undefined): HeightDatum {
    return datum ?? UNKNOWN_HEIGHT_DATUM;
}

/** Per-member metadata the registry closure carries (compile-enforced, see below). */
export interface HeightDatumKindMeta {
    /** What the member IS — precise enough that two packs cannot disagree (factVocabulary idiom). */
    readonly meaning: string;
    /** The corpus citation that minted the member. */
    readonly citation: string;
    /**
     * `true` when the member defines a GROUND REFERENCE from which a relative building height is
     * measured. `false` for `absolute-national` (an altitude cap, NOT a building height — the
     * DE "72,2 m über NHN" class: convertible only with terrain + the frame) and for `unknown`
     * (nothing can be compared to an unresolved plane). Schema refusal arms and evaluators read
     * this flag — it is what makes "absolute datum ≠ building height" machine-checkable.
     */
    readonly comparableToRelativeHeight: boolean;
}

/**
 * THE COMPILE-ENFORCED MEMBER REGISTRY. `Record<HeightDatumKind, …>` means adding a member to the
 * union without a row here — or removing a row — is a tsc error naming this file. That is the
 * ADR-0270 reason-4 guarantee applied to the datum seat: an unregistered datum member cannot
 * exist.
 */
export const HEIGHT_DATUM_KIND_REGISTRY: Readonly<Record<HeightDatumKind, HeightDatumKindMeta>> =
    Object.freeze({
        'facade-rasant': {
            meaning:
                'The rasant (kerb/pavement grade) taken along the façade line, with tram ' +
                'segmentation on sloping frontages — resolved by the Art. 240 machinery ' +
                '(facadeRasantDatum.ts), never a centroid sample.',
            citation: 'PGM-1976 NNUU Art. 240 (Barcelona); L-584.',
            comparableToRelativeHeight: true,
        },
        'street-level': {
            meaning: "The street's finished grade fronting the parcel («la rasant del carrer»).",
            citation: 'PGM NNUU Art. 350.2.e (clau 22a interior tier, «des de la rasant del carrer»).',
            comparableToRelativeHeight: true,
        },
        'mean-ground-at-facade': {
            meaning:
                'Mean ground level taken at the façade alignment (Porto cércea); the EE ' +
                '`maapinna keskmine kõrgus` (mean ground at the building) is the same family.',
            citation: 'Porto PDM Art. 3.º g) (VERIFIED-PRIMARY, SOURCES.md §A.0.3); matrix C10 (EE).',
            comparableToRelativeHeight: true,
        },
        'absolute-national': {
            meaning:
                'An ABSOLUTE altitude in a national vertical frame. NOT a building height: ' +
                'converting it to one requires terrain at the legal reference point. Loading it ' +
                'into a relative-height comparison is the flagged defect, not a unit choice.',
            citation:
                'Paris PLU HMC (NGF, deliberately not applied without terrain — ' +
                'frParisPluBioclimatique.ts); DE «bis zu 72,2 m über NHN» (e8-trial.md); ' +
                'EE korgusabs (EH2000, eeRuleMapper.ts).',
            comparableToRelativeHeight: false,
        },
        'terrain-highest': {
            meaning: 'The highest point of the surrounding natural terrain at the building.',
            citation: 'Natural-terrain reference class, matrix C10 terrain rows (DE/DK family).',
            comparableToRelativeHeight: true,
        },
        'terrain-lowest': {
            meaning: 'The lowest point of the surrounding natural terrain at the building.',
            citation: 'Natural-terrain reference class, matrix C10 terrain rows (DE/DK family).',
            comparableToRelativeHeight: true,
        },
        unknown: {
            meaning:
                'The source does not resolve its datum. The honest ingestion stamp — every ' +
                'resolver consumer REFUSES on it; it never defaults to any plane.',
            citation: 'ADR-0377 (the required-when-height discipline).',
            comparableToRelativeHeight: false,
        },
    });
