// §GEN-PHOTO-BRIEF (L-11020) — THE BRIDGE. Façade IR -> generation brief.
//
// ═══════════════════════════════════════════════════════════════════════════════
// THE FOUNDER'S ASK: "build the building from the photo + sentence"
// ═══════════════════════════════════════════════════════════════════════════════
//
// Two things existed and had never been connected:
//
//   A · `reconstructFacade()` (@pryzm/facade-reconstruction, C108) — a normalized
//       IR: zones, bays, openings with `archness`, soffit cues, curvature,
//       outliers, and a confidence on every node.
//   B · `generation.building` — footprint + storeys + a residential brief carrying
//       `groundCommercialCurtain`, `balconies`, `facadeColor`, `roofGarden`.
//
// THIS FILE IS THE ONLY MAPPING BETWEEN THEM, and it is deliberately the ONLY one.
// It does not live in the engine (C108 §1.3 forbids semantic labels there: the
// engine has no word for "arcade" and must never acquire one) and it does not live
// in the chat (a client may not own a measurement rule). It is L2, pure, and
// testable in plain Node — which is what makes the thresholds below auditable.
//
// ── ⛔ WHAT THE PHOTOGRAPH MAY NOT SUPPLY. Each refusal is structural. ─────────
//
//  1. ⛔ METRES. `scale.status` is `unknown` unless the user sets a reference
//     dimension (C108 §2.2 — there is no third state, and no stage may write
//     `metersPerUnit` from a storey-height prior). So the building's SIZE comes
//     from the FOOTPRINT — the boundary line or the site parcel — and never from
//     the image. Nothing in this file emits a length.
//  2. ⛔ COLOUR. There is no colour-extraction stage in C108 and this file does not
//     add one. `facadeColor` is left UNSET here and can only arrive from the user's
//     WORDS, through `FacadeIntent.ts`'s existing colour vocabulary.
//  3. ⛔ TILE PITCH IS FALSIFIED, NOT MERELY UNPROVEN (L-11012). `surface/tiling.ts`
//     returns the OPENING LATTICE instead of the tile pitch, at confidence
//     0.69–0.79, and 2x/3x the truth on clean input. It is tagged UNVERIFIED in the
//     CLI and the panel. IT IS NOT FED INTO GENERATION — it is reported in
//     `notUsed` and goes no further. Reading a falsified number into a building
//     would be the worst thing this bridge could do.
//  4. ⛔ CURVATURE, OUTLIERS AND NON-GRID FEATURES have no generation target. They
//     are REPORTED as detected-and-not-built, never silently dropped.
//
// ── ⚠ L-11001 STANDS: THE ENGINE HAS NEVER SEEN A REAL PHOTOGRAPH ────────────
// Every threshold below is justified against the SYNTHETIC corpus (C108 §6) and
// against nothing else. A green corpus is not "it works on photos".
//
// LAYERING — L2 (ai-host) importing L1 (facade-reconstruction): downward, legal.
// PURE: no DOM, no THREE, no I/O. Imports TYPES from the engine plus the
// `FacadeIntent` shape it must produce, and nothing else.

import type {
    FacadeIR,
    FacadeReconstructionResult,
    Zone,
} from '@pryzm/facade-reconstruction';

import type { FacadeIntent } from './FacadeIntent.js';
import { extractFacadeOpeningProgram, type FacadeOpeningProgram } from './FacadeOpeningProgram.js';

// ─── The thresholds. Each one names the corpus reading that fixes it. ────────

/**
 * ⭐ THE CONFIDENCE FLOOR — the number that decides whether a photo-derived
 * storey count is USED or ASKED ABOUT.
 *
 * MEASURED, not chosen. Across the C108 corpus on clean, noise-free, perfectly
 * rectifiable synthetic input the plane/zone confidence reads:
 *
 *     A 0.788 · C 0.789 · D 0.729 · E 0.730 · F 0.788 · I 0.853 · J 0.792
 *
 * 0.73–0.85 is therefore this engine's CEILING when everything is ideal — not a
 * mid-range. A floor of 0.50 sits 0.23 below the worst ideal-input reading, so no
 * corpus case is refused, while still refusing anything where half the supporting
 * evidence is missing.
 *
 * ⛔ `confidence: null` means UNKNOWN (C108 §2.3) — for instance the facade plane
 * was never found, so C108 §4.3's "unknown in ⇒ unknown out" made every derived
 * confidence unknown. UNKNOWN IS BELOW THE FLOOR BY DEFINITION. It is never read
 * as zero and never read as "fine".
 */
export const FACADE_PHOTO_CONFIDENCE_FLOOR = 0.5;

/**
 * Mean `archness` over the LOWEST zone's openings, above which the ground floor is
 * mapped to `groundCommercialCurtain` (the arcaded / shopfront ground floor).
 *
 * MEASURED against the corpus, and the margin is enormous:
 *
 *     flat-headed openings — A 0.000 · D 0.000 · F 0.000 · J 0.000 · I 0.007
 *     curved-corner case   — E 0.135
 *     semicircular heads   — C 0.942
 *
 * 0.5 separates C from every other case by more than 0.4 in both directions. It is
 * NOT tuned to one image, which is what C108 §9 / brief §22 forbid.
 *
 * ⭐ C108 §1.3 keeps `archness` CONTINUOUS in the IR and says explicitly that "a
 * consumer wanting a boolean computes one downstream and owns the threshold".
 * THIS FILE IS THAT CONSUMER, and this constant is that ownership.
 */
export const GROUND_ARCH_THRESHOLD = 0.5;

/**
 * Fraction of INTERIOR storey lines that must carry a soffit cue before the photo
 * is read as showing continuous balconies.
 *
 * A projecting slab at EVERY storey line is the continuous-balcony signature; one
 * band at one line is a canopy, a cornice, or a shadow. Corpus case D draws a
 * balcony slab at all three interior lines and measures 3/3; case A draws none and
 * measures 0/3.
 */
export const BALCONY_COVERAGE_THRESHOLD = 0.6;

/**
 * ⚠ THE ONE `notUsed` ENTRY A CONSUMER IS EXPECTED TO FIND AND REWRITE.
 *
 * This mapper sees a PHOTOGRAPH and never the sentence, so it can only ever say
 * "colour did not come from the image" — which is true, and which reads as a
 * CONTRADICTION on a card that is simultaneously applying the green façade the
 * user asked for in words. The consumer holds both halves and fixes the wording;
 * this constant exists so it finds the row by a NAMED, compile-checked prefix
 * rather than by a string literal copied into a second file and left to rot.
 */
export const PHOTO_NOT_USED_COLOUR_PREFIX = 'the façade COLOUR';

// ─── The output ──────────────────────────────────────────────────────────────

/** One thing the photograph was read as, with the confidence that reading carries. */
export interface FacadePhotoReading {
    /** The user-facing phrase, e.g. `5 storeys`. Never carries a metric length. */
    readonly label: string;
    /** `null` = UNKNOWN (C108 §2.3), never "zero confidence". */
    readonly confidence: number | null;
    /** True when this reading is BELOW the floor and was therefore not applied. */
    readonly belowFloor: boolean;
}

/**
 * What a photograph contributed to a generation request — and, just as much, what
 * it did not.
 *
 * ⭐ `read` and `notUsed` are not decoration. The Confirm card renders them so the
 * user can see WHAT CAME FROM WHERE before anything is built. A build that silently
 * absorbed half a photograph would read as a complete success.
 */
export interface FacadePhotoBrief {
    /**
     * ⭐⭐ `zones.length` IS the storey count — a number MEASURED from the
     * photograph rather than guessed, and the single most valuable thing an image
     * can contribute. `null` when no lattice was recovered at all.
     */
    readonly storeys: number | null;
    readonly storeysConfidence: number | null;
    /** True when a storey count WAS read but sits under the floor: ASK, never
     *  silently use it and never silently drop it. */
    readonly storeysBelowFloor: boolean;
    /** The façade fields the photo supports at or above the floor. ⛔ Never
     *  carries `facadeColor` — see the header. */
    readonly facade: FacadeIntent;
    /**
     * ⭐⭐ §GEN-FACADE-OPENINGS (L-11080) — THE OPENING LATTICE ITSELF: bays, bands,
     * per-cell size FRACTIONS and a CONTINUOUS archness.
     *
     * This is the field the four booleans above could never be. `facade` says
     * "this ground floor is arcaded, yes/no"; this says HOW MANY BAYS, HOW WIDE
     * EACH OPENING IS RELATIVE TO ITS CELL, and HOW ARCHED ITS HEAD IS. The
     * founder's ~35 measured openings had nowhere to go before it existed.
     *
     * `null` when the image supports no lattice — the same refusal this file's
     * two early returns make, so the two halves of the bridge cannot disagree
     * about whether an image is a façade.
     *
     * ⛔ HELD BELOW THE CONFIDENCE FLOOR, exactly like every other reading. A
     * lattice read at UNKNOWN confidence is not a lattice worth building from
     * (C108 §4.3 — unknown in ⇒ unknown out).
     */
    readonly openings: FacadeOpeningProgram | null;
    /** Every reading, applied or not, each with its confidence. */
    readonly read: readonly FacadePhotoReading[];
    /** Detected, and NOT fed into generation — with the reason, always. */
    readonly notUsed: readonly string[];
    /** Set when the image cannot support a generation request at all. C74: names
     *  what was measured and what was needed. */
    readonly refusal: string | null;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function atOrAboveFloor(c: number | null): boolean {
    return c !== null && c >= FACADE_PHOTO_CONFIDENCE_FLOOR;
}

/** Lowest zone in FACADE Y, which counts UP (C108 §2.1) — so the ground floor is
 *  the SMALLEST `y`, not the first array entry. */
function groundZone(ir: FacadeIR): Zone | null {
    const zones = ir.facade.zones;
    if (zones.length === 0) return null;
    let lowest = zones[0]!;
    for (const z of zones) if (z.y < lowest.y) lowest = z;
    return lowest;
}

function round2(v: number): number {
    return Math.round(v * 100) / 100;
}

/** `0.81` → `confidence 0.81`; `null` → `confidence UNKNOWN`. */
export function describeConfidence(c: number | null): string {
    return c === null ? 'confidence UNKNOWN' : `confidence ${round2(c).toFixed(2)}`;
}

// ─── the mapping ─────────────────────────────────────────────────────────────

/**
 * Façade reconstruction result -> generation brief.
 *
 * ⚠ IT TAKES THE WHOLE RESULT, NOT JUST THE IR, AND THAT IS A MEASURED DECISION
 * (L-11021). The obvious mapping for balconies is `cell.protrusion`, per brief §11.
 * MEASURED on corpus case D — the ONE case that draws balcony slabs — every cell's
 * `protrusion` is `null`:
 *
 *     soffit rows (diagnostics)  y = 95, 191, 287
 *     zone top rows (lattice)    y =  0,  98, 194, 290
 *
 * `index.ts` matches a soffit to a zone with a ±2 px window against the LATTICE
 * boundary, and the lattice is deliberately placed where the row profile is QUIET
 * while soffits are found at row PEAKS. The two lines are 3 px apart, so the match
 * never fires and the IR's protrusion channel is dead on the corpus. The engine's
 * own corpus test asserts `diagnostics.soffits.length > 0` and only iterates
 * whatever protrusions happen to exist — so an empty set passes it vacuously.
 *
 * ⛔ THE FIX IS NOT TO WIDEN THAT WINDOW FROM THIS FILE. The gap is logged
 * (L-11021) against the engine. This bridge reads the cue where the cue actually
 * IS — `diagnostics.soffits` — and says so, rather than reporting "no balconies"
 * from a channel it has measured to be empty. Diagnostics are not IR (C108 §1.3);
 * they are not serialised anywhere by this function, they are only read.
 */
export function mapFacadeIRToPhotoBrief(result: FacadeReconstructionResult): FacadePhotoBrief {
    const { ir, diagnostics } = result;
    const read: FacadePhotoReading[] = [];
    const notUsed: string[] = [];
    const facade: {
        groundCommercialCurtain?: boolean;
        balconies?: boolean;
        roofGarden?: boolean;
    } = {};

    const zones = ir.facade.zones;
    const planeConfidence = ir.facade.confidence;

    // ── REFUSAL 1: the plane detector could not rectify the image ────────────
    // C108's pipeline still RUNS on the un-rectified frame and still produces a
    // lattice — with every confidence UNKNOWN. That output is fine to LOOK at
    // (brief §18) and is not fine to BUILD from.
    if (diagnostics.facadeQuad.quad === null) {
        return {
            storeys: zones.length > 0 ? zones.length : null,
            storeysConfidence: null,
            storeysBelowFloor: true,
            facade: {},
            openings: null,
            read: [
                {
                    label: zones.length > 0 ? `${zones.length} horizontal band(s)` : 'no horizontal bands',
                    confidence: null,
                    belowFloor: true,
                },
            ],
            notUsed: ['everything — no measurement from this image is usable'],
            refusal:
                'I could not find the façade plane in that image, so every number I read from it is ' +
                'UNKNOWN rather than low — I have nothing to rectify against. That happens with a steep ' +
                'angle, a heavily obstructed façade, or a photo that is not of a building front. ' +
                'Open the Façade Reconstruction panel to mark the four façade corners yourself, or tell ' +
                'me the storey count in words and I will build from that. I will not measure a building ' +
                'off an image I could not square up.',
        };
    }

    // ── REFUSAL 2: this does not read as a façade ────────────────────────────
    // A façade has more than one horizontal band and at least one aperture. One
    // band with nothing in it is a wall, a sky, or a texture — not a building.
    const openingCount = zones.flatMap((z) => z.cells).filter((c) => c.opening !== null).length;
    if (zones.length < 2 || openingCount === 0) {
        return {
            storeys: null,
            storeysConfidence: null,
            storeysBelowFloor: true,
            facade: {},
            openings: null,
            read: [
                { label: `${zones.length} horizontal band(s)`, confidence: planeConfidence, belowFloor: true },
                { label: `${openingCount} opening(s)`, confidence: planeConfidence, belowFloor: true },
            ],
            notUsed: ['everything — this image does not read as a façade'],
            refusal:
                `That image does not read as a building façade to me: I found ${zones.length} ` +
                `horizontal band(s) and ${openingCount} opening(s), and I need at least 2 bands with ` +
                `at least one opening before I will call something a façade. Try a straight-on shot of ` +
                `the building front, or just tell me the storey count in words.`,
        };
    }

    // ── ⭐⭐ STOREYS — the measurement, and the reason the photo is worth having ──
    const storeys = zones.length;
    // Every zone carries the same periodicity confidence, but take the MINIMUM
    // rather than assume that: a future stage that varies it per zone must not
    // silently raise this number.
    let storeysConfidence: number | null = 1;
    for (const z of zones) {
        if (z.confidence === null) { storeysConfidence = null; break; }
        storeysConfidence = Math.min(storeysConfidence, z.confidence);
    }
    const storeysBelowFloor = !atOrAboveFloor(storeysConfidence);
    read.push({
        label: `${storeys} storey${storeys === 1 ? '' : 's'}`,
        confidence: storeysConfidence,
        belowFloor: storeysBelowFloor,
    });

    // ── GROUND FLOOR: high archness ⇒ the arcaded / shopfront ground floor ────
    const ground = groundZone(ir);
    const groundOpenings = (ground?.cells ?? []).flatMap((c) => (c.opening === null ? [] : [c.opening]));
    if (groundOpenings.length > 0) {
        const meanArch =
            groundOpenings.reduce((a, o) => a + o.archness, 0) / groundOpenings.length;
        // The reading's own confidence: the mean opening-fit confidence of the
        // ground zone. UNKNOWN in any opening makes the whole reading UNKNOWN.
        let archConfidence: number | null = 1;
        for (const o of groundOpenings) {
            if (o.confidence === null) { archConfidence = null; break; }
            archConfidence = Math.min(archConfidence, o.confidence);
        }
        if (meanArch >= GROUND_ARCH_THRESHOLD) {
            const usable = atOrAboveFloor(archConfidence);
            read.push({
                label: `arcaded ground floor, mean archness ${round2(meanArch).toFixed(2)}`,
                confidence: archConfidence,
                belowFloor: !usable,
            });
            if (usable) facade.groundCommercialCurtain = true;
            else {
                notUsed.push(
                    `the arcaded ground floor — read at ${describeConfidence(archConfidence)}, under the ` +
                    `${FACADE_PHOTO_CONFIDENCE_FLOOR.toFixed(2)} floor. Say "with a shopfront ground floor" to ask for it directly`,
                );
            }
        }
    }

    // ── BALCONIES: a soffit cue at (nearly) every interior storey line ────────
    // ⛔ NOT from `protrusion.depth`. Depth is `null` by contract in Milestone 1
    // (C108 §3.10) — a single uncalibrated image with no sun vector carries no
    // depth — and the protrusion channel itself is empty (see this function's
    // header). The measurable thing is the soffit BAND, and that is what is read.
    const interiorLines = Math.max(1, zones.length - 1);
    const soffitCount = diagnostics.soffits.length;
    const coverage = soffitCount / interiorLines;
    if (soffitCount > 0) {
        // Confidence in "these are continuous balconies" is how completely the cue
        // covers the storey lines, capped by the plane confidence — a cue measured
        // on an image that could barely be squared up is not worth more than the
        // squaring-up was.
        const raw = Math.min(1, coverage);
        const balconyConfidence =
            planeConfidence === null ? null : Math.min(raw, planeConfidence);
        if (coverage >= BALCONY_COVERAGE_THRESHOLD) {
            const usable = atOrAboveFloor(balconyConfidence);
            read.push({
                label: `balconies, a projecting slab at ${soffitCount} of ${interiorLines} storey lines`,
                confidence: balconyConfidence,
                belowFloor: !usable,
            });
            if (usable) facade.balconies = true;
            else {
                notUsed.push(
                    `the balconies — read at ${describeConfidence(balconyConfidence)}, under the ` +
                    `${FACADE_PHOTO_CONFIDENCE_FLOOR.toFixed(2)} floor. Say "with balconies" to ask for them directly`,
                );
            }
        } else {
            notUsed.push(
                `a projecting slab at ${soffitCount} of ${interiorLines} storey lines — too few to read as ` +
                `continuous balconies, so I did not apply them`,
            );
        }
        // ⛔ DEPTH, ALWAYS. Even when balconies ARE applied, the photograph did not
        // say how deep they are, and the generator will use its own default.
        notUsed.push(
            'balcony DEPTH — a single uncalibrated photo carries no depth (C108 §3.10), so the ' +
            'generator uses its own default rather than a number I made up',
        );
    }

    // ── ⛔ TILE PITCH — FALSIFIED. Reported, never fed in (L-11012). ──────────
    if (ir.facade.surface.pattern === 'grid') {
        notUsed.push(
            'the surface tile pattern — the tile-pitch stage is UNVERIFIED (L-11012): it returns the ' +
            'opening lattice rather than the tile pitch, and reads 2-3x the truth on clean input. ' +
            'I will not size a façade material from a number that has been falsified',
        );
    }

    // ── ⛔ CURVATURE — measured, no generation target ────────────────────────
    const devL = ir.facade.curvature.left.normalizedDeviation;
    const devR = ir.facade.curvature.right.normalizedDeviation;
    const maxDev = Math.max(devL ?? 0, devR ?? 0);
    if (maxDev > 0) {
        notUsed.push(
            `edge curvature (deviation ${round2(maxDev).toFixed(2)}) — the generator has no curved-façade ` +
            'input, so it builds straight edges. The engine can only compare curvature between images, ' +
            'not call a single one curved, so treat that number as a cue and not a verdict',
        );
    }

    // ── ⛔ NON-GRID FEATURES AND OUTLIERS — detected, not built ───────────────
    const featureCount = ir.facade.features.length;
    if (featureCount > 0) {
        notUsed.push(
            `${featureCount} non-grid feature(s) spanning two or more storeys — a stair core, a lightwell ` +
            'or a projecting band. The generator has no target for these, so they are not built',
        );
    }
    const outlierCount = ir.facade.outliers.length;
    if (outlierCount > 0) {
        notUsed.push(
            `${outlierCount} unclassified detection(s) that fit no cell — reported rather than forced ` +
            'into the window grid, and not built',
        );
    }

    // ── ⛔ SCALE — always. This is the one the user is most likely to assume. ──
    notUsed.push(
        'the building SIZE — a photograph carries no metres unless you set a reference dimension, so ' +
        'the footprint decides the size, never the image',
    );
    // ⛔ COLOUR — there is no colour-extraction stage, and this is said out loud
    // rather than left as a silent absence.
    notUsed.push(
        `${PHOTO_NOT_USED_COLOUR_PREFIX} — nothing here reads colour out of an image. Say it in ` +
        'words ("a green façade") and I will apply it',
    );

    // ── ⭐⭐ THE OPENING LATTICE — the measurement the four booleans could not carry ──
    // §GEN-FACADE-OPENINGS (L-11080 · C108 Milestone 2, L-11006). Before this, the
    // whole photo → generator channel was `groundCommercialCurtain` / `balconies` /
    // `roofGarden` / `facadeColor`, and the founder's ~35 measured openings, five
    // arches and five bays had NOWHERE TO GO. His building came out a plain white box
    // with balconies — and it had balconies only because `balconies` happened to be
    // one of the four.
    const program = extractFacadeOpeningProgram(ir);
    let openings: FacadeOpeningProgram | null = null;
    if (program !== null) {
        const usable = atOrAboveFloor(program.confidence);
        read.push({
            label:
                `an opening lattice of ${program.bays} bay(s) x ${program.bands} band(s), ` +
                `${program.cells.length} opening(s)`,
            confidence: program.confidence,
            belowFloor: !usable,
        });
        if (usable) {
            openings = program;
            // ⛔ WHAT THE LATTICE STILL CANNOT SAY, said out loud. The IR's opening node
            // is `{ a, b, n, archness }` (C108 §1.1) — semi-axes and a head shape, with
            // NO x/y. So the photograph fixes an opening's SIZE relative to its cell and
            // NOT its position inside it, and the sill comes from the generator.
            notUsed.push(
                'where each opening sits INSIDE its cell — the IR measures the SIZE and head shape ' +
                'of an opening but not its position (C108 §1.1), so the generator supplies the ' +
                'sill height rather than a number I read off the image',
            );
        } else {
            notUsed.push(
                `the opening lattice (${program.bays} bay(s) x ${program.bands} band(s)) — read at ` +
                `${describeConfidence(program.confidence)}, under the ` +
                `${FACADE_PHOTO_CONFIDENCE_FLOOR.toFixed(2)} floor, so the generator uses its own ` +
                'window rhythm instead of one I am not confident in',
            );
        }
    } else {
        notUsed.push(
            'the window rhythm — I could not recover an opening lattice from this image, so the ' +
            'generator places windows by its own rule rather than by anything I measured',
        );
    }
    // ⛔ THE UPPER-FLOOR RHYTHM IS NOT BUILT FROM THE PHOTOGRAPH, AND THAT IS SAID
    // BEFORE HE CONFIRMS. The residential generator derives upper-storey windows from
    // the APARTMENT LAYOUT — every habitable room must reach a façade for daylight —
    // and that rule outranks a photograph's rhythm. Only the GROUND storey is built
    // from the measured lattice today (L-11082). Claiming the whole elevation while
    // building one storey of it would be the silent-half-success this contract exists
    // to stop.
    if (openings !== null) {
        notUsed.push(
            'the UPPER-floor window rhythm — only the GROUND storey is built from the measured ' +
            'lattice today. Above it the windows follow the apartment layout, because every room ' +
            'has to reach a façade for daylight and that rule outranks a photograph',
        );
    }

    return {
        storeys,
        storeysConfidence,
        storeysBelowFloor,
        facade,
        openings,
        read,
        notUsed,
        refusal: null,
    };
}

/**
 * The photo half of the Confirm card, as lines.
 *
 * ⭐⭐ THE CARD MUST SHOW WHAT IT READ, BEFORE HE CONFIRMS. This is the difference
 * between a tool and a magic trick: the user has to be able to see which number
 * came from the photograph, which came from his sentence, and which came from the
 * footprint — and what was thrown away.
 */
export function describePhotoBrief(brief: FacadePhotoBrief): string {
    if (brief.refusal !== null) return brief.refusal;
    const applied = brief.read
        .filter((r) => !r.belowFloor)
        .map((r) => `${r.label} (${describeConfidence(r.confidence)})`);
    const held = brief.read
        .filter((r) => r.belowFloor)
        .map((r) => `${r.label} (${describeConfidence(r.confidence)}, under the floor)`);
    const parts: string[] = [];
    if (applied.length > 0) parts.push(`From the photo: ${applied.join(', ')}.`);
    if (held.length > 0) parts.push(`Read but NOT used: ${held.join(', ')}.`);
    if (brief.notUsed.length > 0) parts.push(`Not used: ${brief.notUsed.join('; ')}.`);
    return parts.join(' ');
}
