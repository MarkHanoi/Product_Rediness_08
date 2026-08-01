// §COSSOS-SORTINTS (L-672) — **TRIBUNES ARE NOT PART OF THE ENVELOPE. THEY ARE A PERMITTED
// PROJECTION BEYOND IT.** Barcelona CLOSURE-REGISTER blocker 11, settled on the primary text.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE QUESTION THIS MODULE ANSWERS, AND WHY IT HAD TO BE ANSWERED BEFORE ANY CODE WAS WRITTEN
// ═════════════════════════════════════════════════════════════════════════════════════════════
// `esBarcelonaEnsanche.ts` shipped a header line calling unmodelled *cossos sortints* *"a live
// risk, not a theoretical one"*, and the closure register carried it as a **P1** blocker needing
// *"a second rule layer: building MORPHOLOGY"*. Both statements presume the answer to a question
// nobody had put to the ordinance: **do tribunes belong INSIDE the buildable envelope at all, or
// are they a projection BEYOND it?**
//
// ⚠ THE TWO READINGS HAVE OPPOSITE SIGNS, WHICH IS WHY GUESSING WAS NOT AN OPTION.
//   • If a tribuna is a part of the envelope we fail to draw ⇒ we UNDER-state. Safe (C58 §1.4).
//   • If a tribuna is volume ADDED outside the envelope and we folded it in ⇒ we OVER-state — the
//     one direction that must never be got wrong, on the densest land in the city.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE ANSWER, FROM THE PGM's OWN DEFINITION — AND IT IS NOT AMBIGUOUS
// ═════════════════════════════════════════════════════════════════════════════════════════════
// **Art. 223.2.g** (printed p. 72), the definitions article of *Capítol II — disposicions comunes
// als tipus d'ordenació*:
//
//   *"**Cossos sortints.** Són els que **sobresurten de l'alineació de façana** o línia de façana
//    de l'alineació interior, o de l'espai lliure a l'interior d'illa, i tenen el caràcter
//    d'habitables o ocupables tant si són tancats, semitancats o oberts."*
//
// **A *cos sortint* is DEFINED as that which projects BEYOND the alignment.** It cannot be inside
// the envelope, because the envelope's outer surface is the alignment it is defined as exceeding.
//
// **Art. 229.2** names the tribuna explicitly and classifies it:
//   *"Són cossos sortints tancats els miradors, **tribunes** i similars amb tots els costats amb
//    tancaments no desmuntables."*
//
// **Art. 230** — *Vol màxim dels cossos sortints* — then measures the projection **FROM the façade
// plane**, per ordination type. A quantity measured *from* the envelope's face is by construction
// *outside* it. There is no reading of Arts. 223/229/230 under which a tribuna is a portion of the
// envelope PRYZM currently fails to draw.
//
// ⇒ **CLASSIFICATION: `NOT-THE-RULE-KIND`.** *Cossos sortints* are not an envelope parameter of any
// KIND in the `setback | alignment | block-derived-alignment | tiered-occupation | coverage-and-far`
// vocabulary. They are a **morphology allowance over a resolved envelope**, and they can only be
// evaluated once an envelope exists — the opposite dependency order from the one the register
// assumed. **Blocker 11 is therefore not an ENVELOPE-coverage blocker and never was.**
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE DIRECTION, PER ORDINATION TYPE — the part that decides whether omission is SAFE
// ═════════════════════════════════════════════════════════════════════════════════════════════
// **Art. 230.I — *segons alineacions de vial* (claus 12, 12b, 13a, 13E, 13b, 22a, 22@).**
// Vol ≤ 1/10 of the *amplada de vial*, capped at **1,50 m**; enclosed and semi-enclosed limited to
// 1/3 of the façade length; lateral limit plane 1 m from the *mitgera* (Art. 229.6); prohibited at
// *planta baixa* (Art. 229.4); admitted only from the first floor up (Art. 229.5). Into the block
// interior: 1/20 of the inscribed circle's diameter, max 1,50 m, and *"a l'espai lliure interior
// de l'illa no es permeten cossos sortints tancats o semitancats que depassin la profunditat
// edificable"*. ⇒ **Omission UNDER-states.** SAFE.
//
// **Art. 230.II — *edificació aïllada* (the `20a/*` family).** *"El vol dels cossos sortints,
// tancants o semitancats, esdevé limitat per la superfície de sostre edificable de la parcel·la.
// Als percentatges d'ocupació màxima i a les separacions a les llindes de parcel·la, es tindran en
// compte els tancats, semitancats i oberts."* ⚠ **THE ONE PLACE THE SIGN COULD FLIP, AND IT DOES
// NOT.** Here a projection consumes the SAME occupation percentage and the SAME boundary
// separations the envelope is already drawn to — so the projection lives INSIDE the setback
// envelope rather than outside it, and adding a tribuna cannot enlarge the permitted volume by one
// cubic metre. `esBarcelona20aAillada.ts` already states this convention (*"orthogonal projection
// of the whole volume, above or below grade, cossos sortints included"*). ⇒ **Omission is EXACT.**
//
// **Art. 230.III — *volumetria específica* (clau 18).** Vol ≤ 1/10 of the distance between building
// alignments, capped **1,80 m**. Academic for PRYZM: clau 18 is a cited `derived-plan` refusal and
// draws no envelope at all.
//
// **Clau 12 — the zone that FORBIDS them.** Art. 320.5a: *"A la subzona I… es prohibeixen els
// cossos i elements sortints"*, with four narrow exceptions (balconies ≤ 20 cm on streets < 6 m and
// ≤ 45 cm on 6–12 m streets; cornices/eaves ≤ 45 cm; roof-edge projections ≤ 45 cm; and on vies
// > 12 m, *miradors* projecting ≤ 1/20 of the street width, over ≤ half the façade length, each
// ≤ 3,60 m wide). ⇒ Omission is **nearly EXACT** here, and 13a's caveat must NOT be carried across.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHERE IT DOES MATTER — AND IT IS *SOSTRE* ACCOUNTING, NOT GEOMETRY
// ═════════════════════════════════════════════════════════════════════════════════════════════
// **Art. 224.2 + Art. 229.3.a/.b** — enclosed and semi-enclosed *cossos sortints* **COUNT toward
// the índex d'edificabilitat and the superfície de sostre edificable**; open ones (balconies,
// terraces) do not, but do count toward ground-floor occupation.
//
// ⚠ So the real consequence is a **FAR-consumption** one, and it runs the SAFE way for every clau
// PRYZM ships:
//   • `13a`/`13E`/`13b` — Art. 322 defines edificabilitat as *"l'envolupant màxima de volum"*.
//     **There is no FAR ceiling for a tribuna to consume** (ADR-0271). Nothing to under- or
//     over-state; the tribuna is simply extra permitted volume we do not draw.
//   • `12` — Art. 316.2 states a net index of 1,40, and tribunes are all but prohibited (Art.
//     320.5a). A GFA computed without them under-consumes a ceiling we already publish.
//   • `20a/*` — the index is consumed by the projection under Art. 230.II, and the pack already
//     counts *cossos sortints* into occupation.
//
// ⇒ **In no shipped Barcelona clau does omitting *cossos sortints* over-state the envelope.**
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHY THE FIGURES BELOW ARE EXPORTED BUT NOT APPLIED
// ═════════════════════════════════════════════════════════════════════════════════════════════
// Same reason `BCN_ART350_COSSOS_SORTINTS` is recorded-not-applied in the industrial pack: a *cos
// sortint* is an allowance the applicant may or may not take, under conditions (façade share,
// distance to the *mitgera*, street width, floor level) that the envelope solver has no input for.
// Folding a *possible* projection into a *maximum* envelope would publish, as a limit, a volume
// that is only lawful under conditions we cannot test. They are exported so a future morphology
// layer reads them from one cited place instead of re-deriving them per pack.
//
// ⚠ THIS MODULE IS THE ONE EXCEPTION TO THIS PACKAGE'S "never share a legal constant between
// packs" rule, and the exception is principled: Arts. 223/229/230 sit in *Capítol II, disposicions
// COMUNES als tipus d'ordenació*. They are **one article governing every zone by their own terms**,
// not several zones' articles that happen to agree. A per-zone copy here would be the fiction.
// The per-zone DEROGATIONS (Art. 320.5a for clau 12, Art. 350.2.f for 22a) stay in their packs.
//
// PURITY: L2-pure. Data + one pure classifier. No I/O, no THREE, no DOM, no clock.
//
// Authority: C58 §1.4 (never over-state) · §1.11 (a wrong KIND is a wrong SHAPE) · ADR-0270 ·
// CLOSURE-REGISTER blocker 11 · claus/EXTRACTION-PROTOCOL.md.

import { trace } from '@opentelemetry/api';

/**
 * P8 — one tracer for this module's exported classifier. Precedent: `zoneRefusal.ts` and
 * `esBarcelonaZoneClassification.ts` in this directory. A span on a pure function is a no-op
 * without an exporter, so the module's stated L2 purity is unaffected.
 */
const _tracer = trace.getTracer('pryzm.zoning.es.bcn');

/**
 * How a *cos sortint* relates to the buildable envelope PRYZM constructs.
 *
 * ⚠ THE POINT OF THE TYPE IS THAT `'inside-the-envelope'` IS NOT A MEMBER. No reading of PGM
 * Arts. 223.2.g / 229 / 230 puts a projection inside the alignment it is defined as exceeding, so
 * the vocabulary cannot express the error.
 */
export type CosSortintRelation =
    /**
     * Art. 230.I / .III — the projection is measured OUTWARD from the façade plane, so it is
     * additional volume the envelope does not contain. Omitting it UNDER-states.
     */
    | 'projects-beyond-envelope'
    /**
     * Art. 230.II — *edificació aïllada*: the projection is charged against the same occupation
     * percentage and the same boundary separations the envelope is already drawn to, so it can add
     * nothing. Omitting it is EXACT.
     */
    | 'consumed-by-occupation-and-separations'
    /** Art. 320.5a — the zone prohibits them but for narrow, shallow exceptions. */
    | 'prohibited-with-narrow-exceptions';

/** The direction in which ignoring *cossos sortints* moves PRYZM's published envelope. */
export type CosSortintOmissionDirection =
    /** We publish LESS than the ordinance permits. Safe (C58 §1.4). */
    | 'under-states'
    /** We publish exactly what the ordinance permits. */
    | 'exact'
    /**
     * We would publish MORE than the ordinance permits. ⚠ **No Barcelona clau resolves here.** The
     * member exists so a future zone that DOES cannot be added without saying so out loud.
     */
    | 'over-states';

export interface CosSortintDisposition {
    readonly relation: CosSortintRelation;
    readonly omissionDirection: CosSortintOmissionDirection;
    /** The article that decides it. Never a paraphrase — this is what a card would have to cite. */
    readonly article: string;
}

/**
 * PGM **Art. 230.I** — *vol màxim* for the *segons alineacions de vial* ordination type, which is
 * claus `12`, `12b`, `13a`, `13E`, `13b`, `22a` and `22@`.
 *
 * ⚠ RECORDED, NOT APPLIED. See the module header: an allowance conditioned on façade share, floor
 * level and distance to the *mitgera* cannot be folded into a maximum envelope without publishing
 * a volume that is lawful only under conditions PRYZM does not test.
 *
 * ⚠ Art. 230.I.1 excludes the *nucli antic* by name — *"excepte les del nucli antic que tenen una
 * normativa especial"* — so claus `12`/`12b` take Art. 320.5a instead, NOT these figures.
 */
export const BCN_ART230_I_ALINEACIONS_DE_VIAL = Object.freeze({
    /** Vol ≤ 1/10 of the *amplada de vial*, measured normal to the façade at any point. */
    maxProjectionFractionOfStreetWidth: 0.1,
    /** …and never more than 1,50 m, whatever the street width. */
    maxProjection_m: 1.5,
    /** Enclosed + semi-enclosed ≤ 1/3 of the façade length (Art. 230.I.3). */
    maxEnclosedFractionOfFacadeLength: 1 / 3,
    /** …unless the vol is ≤ 45 cm, in which case the length limit lifts (Art. 230.I.3, 2nd para). */
    shallowProjectionExemption_m: 0.45,
    /** Into the block interior: ≤ 1/20 of the inscribed circle's diameter (Art. 230.I.2). */
    interiorMaxFractionOfInscribedDiameter: 1 / 20,
    /** …and ≤ 1,50 m there too. */
    interiorMaxProjection_m: 1.5,
    /** Art. 229.6 — the lateral limit plane sits 1 m from the party wall. */
    lateralLimitPlaneFromPartyWall_m: 1,
} as const);

/**
 * PGM **Art. 230.III** — *ordenació volumètrica específica* (clau `18`).
 *
 * Academic for PRYZM today: clau 18 resolves to a cited `derived-plan` refusal and draws no
 * envelope, so there is no surface for a projection to be measured from. Recorded for the day the
 * approved volumetries are ingested.
 */
export const BCN_ART230_III_VOLUMETRIA_ESPECIFICA = Object.freeze({
    /** Vol ≤ 1/10 of the distance between building alignments. */
    maxProjectionFractionOfAlignmentDistance: 0.1,
    /** …reduced to 1,80 m where that rule would exceed it. ⚠ 1,80 m, NOT Art. 230.I's 1,50 m. */
    maxProjection_m: 1.8,
} as const);

/**
 * PGM **Art. 229.3/.4/.5** — what counts toward *sostre*, and where projections are allowed at all.
 * These are the clauses that make the question a FAR-accounting one rather than a geometric one.
 */
export const BCN_ART229_COMPUTATION = Object.freeze({
    /** Art. 229.3.a — *tancats* (miradors, tribunes) count toward the net index and the sostre. */
    enclosedCountsTowardSostre: true,
    /** Art. 229.3.b — *semitancats* count, less the part open on all sides beyond a façade-parallel plane. */
    semiEnclosedCountsTowardSostre: true,
    /** Art. 229.3.c — *oberts* (balconies, terraces) do NOT count toward sostre… */
    openCountsTowardSostre: false,
    /** …but DO count toward ground-floor occupation, and in *edificació aïllada* toward separations. */
    openCountsTowardGroundFloorOccupation: true,
    /** Art. 229.4 — prohibited at *planta baixa* in EVERY ordination type. */
    prohibitedAtGroundFloor: true,
    /** Art. 229.5 — admitted from the first floor up, subject to each zone's own restrictions. */
    admittedFromFirstFloorUp: true,
} as const);

/**
 * The citation this finding ships under. Every figure above reaches a reader through THIS string,
 * never through refusal or panel prose — the §DEC-1 discipline, applied to a second finding.
 */
export const BCN_COSSOS_SORTINTS_ORDINANCE_REF =
    'PGM-1976 NNUU, Títol IV Capítol II (disposicions comunes als tipus d’ordenació). ' +
    'Definició: Art. 223.2.g — un cos sortint és el que "sobresurt de l’alineació de façana o ' +
    'línia de façana de l’alineació interior, o de l’espai lliure a l’interior d’illa". ' +
    'Tipologia: Art. 229.2 — els miradors i TRIBUNES són cossos sortints TANCATS. ' +
    'Còmput: Art. 224.2 + Art. 229.3.a/.b (tancats i semitancats computen a l’índex ' +
    'd’edificabilitat i al sostre edificable) i Art. 229.3.c (els oberts no hi computen, però sí a ' +
    'l’ocupació de planta baixa i, en edificació aïllada, a les separacions a llindes). ' +
    'Situació: Art. 229.4 (prohibits a planta baixa en tots els tipus d’ordenació), Art. 229.5 ' +
    '(admesos a partir de la planta primera), Art. 229.6 (pla límit lateral de vol a 1 m de la ' +
    'mitgera). Vol màxim: Art. 230.I per a l’ordenació segons alineacions de vial (una dècima part ' +
    'de l’amplada de vial, màxim 1,50 m; un terç de la longitud de façana per als tancats i ' +
    'semitancats; un vintè del diàmetre inscriptible a l’espai lliure interior d’illa, màxim ' +
    '1,50 m), Art. 230.II per a l’edificació aïllada (el vol queda limitat pel sostre edificable ' +
    'de la parcel·la i es té en compte als percentatges d’ocupació i a les separacions a llindes) ' +
    'i Art. 230.III per a l’ordenació volumètrica específica (una desena part de la distància ' +
    'entre alineacions d’edificació, màxim 1,80 m). ' +
    'Derogacions zonals: Art. 320.5a (clau 12 / 12b — prohibits, amb excepcions de balcons, ' +
    'cornises i ràfecs, i miradors només a vies de més de 12 m) i Art. 350.2.f (clau 22a). ' +
    'Source: MMAMB re-edition of the Normativa Urbanística Metropolitana, printed pp. 72, 74–75, ' +
    '106 and 116, committed at docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/' +
    'PGM-NNUU-metropolitana.pdf — a manually re-typeset re-edition, primary but NOT authenticated.';

/** Claus whose ordination type is *segons alineacions de vial* and that are NOT *nucli antic*. */
const ALINEACIONS_DE_VIAL_CLAUS: ReadonlySet<string> = new Set([
    '13a',
    '13E',
    '13b',
    '22a',
    '22@',
]);

/** *Nucli antic* — Art. 230.I.1 excludes it by name; Art. 320.5a governs instead. */
const NUCLI_ANTIC_CLAUS: ReadonlySet<string> = new Set(['12', '12b']);

/**
 * How a *cos sortint* relates to PRYZM's envelope for a given Barcelona clau, and which way an
 * omission errs. `null` where this module makes no claim — an unrecognised clau must never be
 * assigned an ordination type on the strength of its first character (the same rule, and the same
 * reason, as `esBarcelonaZoneClassification.ts`'s allow-list).
 *
 * ⚠ IT ANSWERS A CLASSIFICATION QUESTION AND PUBLISHES NO GEOMETRY. Nothing here reaches a
 * `GeometricRule`, and that is the finding, not a limitation: a projection beyond the envelope has
 * no slot in an envelope.
 *
 * P8 — OTel span.
 */
export function barcelonaCosSortintDisposition(clau: string): CosSortintDisposition | null {
    const span = _tracer.startSpan('pryzm.zoning.es.bcn.barcelonaCosSortintDisposition');
    try {
        span.setAttribute('bcn.clau', clau);
        if (NUCLI_ANTIC_CLAUS.has(clau)) {
            return {
                relation: 'prohibited-with-narrow-exceptions',
                // The exceptions Art. 320.5a leaves (balconies ≤ 20/45 cm, cornices ≤ 45 cm,
                // miradors ≤ 1/20 of the width on vies > 12 m) are all projections BEYOND the
                // façade, so what little survives still errs low.
                omissionDirection: 'under-states',
                article: 'PGM Art. 320.5a (excluded from Art. 230.I by Art. 230.I.1)',
            };
        }
        if (ALINEACIONS_DE_VIAL_CLAUS.has(clau)) {
            return {
                relation: 'projects-beyond-envelope',
                omissionDirection: 'under-states',
                article: 'PGM Art. 230.I',
            };
        }
        if (clau === '20a' || clau.startsWith('20a/')) {
            return {
                relation: 'consumed-by-occupation-and-separations',
                omissionDirection: 'exact',
                article: 'PGM Art. 230.II',
            };
        }
        if (clau === '18') {
            return {
                relation: 'projects-beyond-envelope',
                // Vacuously safe: clau 18 publishes no envelope for anything to be added to.
                omissionDirection: 'under-states',
                article: 'PGM Art. 230.III',
            };
        }
        return null;
    } finally {
        span.end();
    }
}

/**
 * ⚠ **THE INVARIANT BLOCKER 11 CLOSES ON, HELD AS DATA SO A TEST CAN ASSERT IT.**
 *
 * There is no Barcelona clau for which ignoring *cossos sortints* over-states the envelope. If a
 * future zone is added for which there is, this constant must be changed BY HAND and the change
 * argued — which is the point of writing it down rather than deriving it.
 */
export const BCN_COSSOS_SORTINTS_NEVER_OVERSTATE = true as const;
