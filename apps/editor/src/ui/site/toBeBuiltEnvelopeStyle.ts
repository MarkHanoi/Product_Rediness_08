// §TOBE-ENVELOPE (lane PL-TOBE-ENVELOPE, 2026-09-06) — THE TO-BE-BUILT ENVELOPE'S VISUAL IDENTITY,
// and the LEGEND that names the three envelopes apart.
//
// STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §25.2, founder verbatim:
//
//   > "on the 3d canvas the user will see a TO-BE-BUILT ENVELOPE OF 200 SQM IN THE BUILDABLE
//   >  FOOTPRINT OF THE PLOT (ANOTHER COLOUR OF ENVELOPE). AT THIS STAGE WILL BE ORIENTATIVE."
//
// and the rider the same section adds:
//
//   > "Three distinct envelopes now exist and must be visually distinguishable, with a legend …
//   >  the to-be-built one is an INTENT, not a measurement, and must never inherit a confidence
//   >  badge that implies it was derived from law."
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE DEFECT THIS MODULE EXISTS TO REMOVE — MEASURED, NOT ASSUMED
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Before this module the adopted LEVEL envelope (C114, `standing: 'design-intent'`) drew at
// `SPACE_ENVELOPE_LEVEL_COLOUR = '#6600FF'` and the CONFIDENT permitted envelope drew at
// `envelopeRenderStyle.CONFIDENT_VIOLET_HEX = 0x6600ff`. **They were the same colour.** So the one
// solid PRYZM asserts as a legal upper bound and the one solid the USER invented were rendered
// identically, inside one another, in the same scene.
//
// That is not a cosmetic collision. C58 §1.2 makes the hue the CONFIDENCE BADGE — L-608 exists
// because a grey solid means "estimate" and a violet one means "determination". An intent volume
// wearing the determination hue is therefore a solid that CLAIMS a confidence it was never given,
// which is the §CONTEXT-DATA-HONESTY failure in the one channel a user reads before any text.
//
// ⚠ WHICH COLOUR MOVED, AND WHY THAT ONE. The alternative was to move the PERMITTED envelope off
// violet. Rejected: violet is C58's published hue authority (L-608 / L-619 / ADR-0293 all cite it),
// it is read by the globe, the flat card and the plan overlay, and moving it would repaint the
// meaning of every existing screenshot. The founder's own sentence assigns the new colour to the
// NEW thing — "ANOTHER COLOUR OF ENVELOPE" is said about the to-be-built one — so the to-be-built
// one is what moves. The `#6600FF` preview idiom is untouched everywhere else it is used.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHY ROSE, AND WHAT IT WAS CHOSEN AGAINST
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Four hues are already spoken for in the site scene and none of them may be re-used:
//
//   · `0x6600ff` confident violet   — a PERMITTED determination            (envelopeRenderStyle.ts)
//   · `0x9a93b0` provisional grey   — a PERMITTED estimate                 (envelopeRenderStyle.ts)
//   · `0xff9900` suggested amber    — an admin-only unreviewed suggestion  (envelopeRenderStyle.ts)
//   · `0x00a99a` study teal         — a CONTEXT-DERIVED study massing      (contextStudyMassingStyle.ts)
//
// Their hue angles are ≈264°, ≈254°, ≈36° and ≈175°. The widest gaps left are green (≈120°) and
// rose (≈340°). Green was rejected: at ≈140° it sits 35° from study teal, and teal already means
// "an indicative study" — the nearest neighbour in meaning as well as in hue is the worst place to
// put a fifth term. Azure (≈216°) was rejected for the same reason against violet. Rose at ≈340°
// is the furthest any new hue can get from all four at once.
//
// ⛔ COLOUR IS NEVER THE ONLY CHANNEL. A hue alone fails a greyscale screenshot and a
// colour-vision-deficient reader, which is why every other envelope in this repo carries a second
// channel (the study is dashed and open-topped; an upper-bound footprint is near-wireframe). The
// to-be-built envelope's second channel is its WORD: every surface that draws it must also print
// `TO_BE_BUILT_ORIENTATIVE_TEXT`, and the legend below is the third.
//
// PURE LEAF — no THREE, no Cesium, no DOM, no imports at all. Both the THREE scene
// (`ParcelBoundarySceneRenderer`) and the engine's mesh builder (`spaceEnvelopeAppearance`) import
// it, so P2 is not put at risk by either direction of that import (the same discipline
// `contextStudyMassingStyle.ts` states for itself).

// ─────────────────────────────────────────────────────────────────────────────
// The hue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⭐ THE TO-BE-BUILT ENVELOPE'S ONE COLOUR — rose `#e5175b`, as a numeric hex for THREE.
 *
 * Deliberately outside the confident-violet / provisional-grey / suggested-amber family that
 * carries C58 §1.2 CONFIDENCE, and outside the study-teal that carries "context-derived study".
 * An intent volume is neither, and it must not be able to be read as either.
 */
export const TO_BE_BUILT_ROSE = 0xe5175b;

/**
 * The SAME rose as a CSS string. DERIVED from the number above, never typed a second time — the
 * exact hand-copy drift `contextStudyMassingStyle.ts` documents one level down.
 */
export const TO_BE_BUILT_ROSE_CSS = `#${TO_BE_BUILT_ROSE.toString(16).padStart(6, '0')}`;

/**
 * The fill weight of a to-be-built VOLUME (a prism the user has chosen an area for).
 *
 * ⚠ HEAVIER THAN THE STUDY MASSING (0.05) AND HEAVIER THAN AN UPPER-BOUND PERMITTED SOLID (0.06),
 * AND THAT IS THE HONEST ORDERING, not an inconsistency. Those two are faint because PRYZM is
 * unsure what the LAW allows. This one is not a claim about the law at all — it is the user's own
 * decision, and PRYZM is not unsure about what the user asked for. Drawing a decision as faintly
 * as an uncertain measurement is the §24.1 item-3 defect ("the honesty must survive, the
 * invisibility must not") pointing the other way.
 */
export const TO_BE_BUILT_FILL_ALPHA = 0.22;

/**
 * The flat GROUND-PLATE weight, used before any storey height is known — the pre-adoption
 * `targetFootprintAreaState` plate. Lighter than the volume: a plate is one decision short of one.
 */
export const TO_BE_BUILT_GROUND_FILL_ALPHA = 0.16;

/**
 * ⛔ THE SENTENCE EVERY SURFACE THAT DRAWS THIS ENVELOPE MUST ALSO PRINT — the founder's own word
 * ("AT THIS STAGE WILL BE ORIENTATIVE"), so the disclosure survives greyscale, colour blindness
 * and a screenshot with no legend in frame.
 */
export const TO_BE_BUILT_ORIENTATIVE_TEXT =
    'Orientative — this is what you INTEND to build, not what the ordinance permits and not a permit.';

// ─────────────────────────────────────────────────────────────────────────────
// The legend — §25.2's "must be visually distinguishable, WITH A LEGEND"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The three envelope kinds §25.2 names. CLOSED — a fourth kind must be added here, and the type
 * error at every consumer is the feature.
 */
export type EnvelopeLegendKind = 'permitted' | 'to-be-built' | 'room';

/** One legend row. Everything a surface needs to draw the swatch and say what it means. */
export interface EnvelopeLegendEntry {
    readonly kind: EnvelopeLegendKind;
    /** The row's heading, in the user's words. */
    readonly label: string;
    /**
     * The swatch colour, CSS. `null` for `room` — room envelopes take their colour from the
     * OCCUPANCY palette (`spaceEnvelopeAppearance` → `OCCUPANCY_PALETTE`), so there is no single
     * swatch to draw and inventing one would show a distinction the model does not hold.
     */
    readonly swatchCss: string | null;
    /** What this envelope IS, in one sentence a non-specialist can act on. */
    readonly meaning: string;
    /**
     * ⛔ THE HONESTY DISCRIMINANT, AND THE REASON THIS IS A MODEL RATHER THAN MARKUP.
     *
     * `true` ONLY for `permitted`: its hue is decided by `classifyEnvelopeCompleteness` and it
     * therefore CARRIES a C58 §1.2 confidence claim. `false` for the other two — they are INTENT.
     * A renderer that reads this cannot accidentally hang a confidence badge on an intent volume,
     * because the answer is data, not a branch someone remembered to write.
     */
    readonly carriesConfidenceBadge: boolean;
}

/**
 * ⭐ THE LEGEND, in the order the user meets the three envelopes: what the law permits, what you
 * decided to build inside it, what the rooms inside THAT will be.
 *
 * ⛔ `permitted` HAS NO FIXED SWATCH EITHER — its hue is violet OR grey OR amber depending on the
 * determination's confidence, and pinning one of the three here would state a confidence the
 * legend cannot know. The row says so in words instead. This is the same refusal the `room` row
 * makes for a different reason, and both are deliberate.
 */
export const ENVELOPE_LEGEND: readonly EnvelopeLegendEntry[] = Object.freeze([
    Object.freeze({
        kind: 'permitted' as const,
        label: 'Permitted envelope',
        swatchCss: null,
        meaning:
            'The upper bound the ordinance allows. Its colour is the confidence PRYZM has in it — '
            + 'violet when the determination is solved, grey when it is an estimate, amber for an '
            + 'unreviewed suggestion. Never a permit.',
        carriesConfidenceBadge: true,
    }),
    Object.freeze({
        kind: 'to-be-built' as const,
        label: 'To-be-built envelope',
        swatchCss: TO_BE_BUILT_ROSE_CSS,
        meaning: TO_BE_BUILT_ORIENTATIVE_TEXT,
        carriesConfidenceBadge: false,
    }),
    Object.freeze({
        kind: 'room' as const,
        label: 'Room envelopes',
        swatchCss: null,
        meaning:
            'Spaces inside a to-be-built level. Each takes the colour of what it is for, so a '
            + 'kitchen reads as a kitchen before a single wall exists. Also intent, not law.',
        carriesConfidenceBadge: false,
    }),
]);

/** Look one row up. `null` for an unknown kind — never a fabricated row. */
export function envelopeLegendEntry(kind: string): EnvelopeLegendEntry | null {
    return ENVELOPE_LEGEND.find((e) => e.kind === kind) ?? null;
}
