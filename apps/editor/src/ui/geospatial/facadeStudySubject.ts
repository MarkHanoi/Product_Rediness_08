// §FACADE-STUDY-SUBJECT (L-596) — WHAT the façade sun study is run on, as an EXPLICIT choice.
//
// PURE MODULE. No DOM, no Cesium, no I/O. Pure decisions are P8 span-exempt (the
// `globePlacementDecisions.ts` precedent, L-186/L-193).
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 L-272 IS THE TRAP, AND THIS MODULE IS SHAPED BY IT
// ─────────────────────────────────────────────────────────────────────────────
// An earlier `renderFacadeAnalysis` took `input.boundary` — the drawn PARCEL ring — as the façade
// source. The result: the study evaluated a sun lattice on a PHANTOM ENVELOPE standing at the plot
// line, with the real building sitting INSIDE it as an occluder SELF-SHADOWING that phantom; no
// authored opening could project onto any face (they were metres away); and the drape then smeared
// that study of a plot boundary across the real building's walls. §FIX-FACADE-ANALYSIS-DRAPE-QUALITY
// de-prioritised `input.boundary` for exactly this reason.
//
// The founder's L-596 request — *"an option to run this façade study on the envelope for
// pre-planning"* — is a LEGITIMATE version of that same geometry. The difference is not geometric,
// it is EPISTEMIC:
//
//   • the L-272 bug SILENTLY SUBSTITUTED a plot-shaped surface when the building was missing, and
//     PRESENTED the result as the building's façade study;
//   • L-596 asks the user to CHOOSE the envelope, and the answer must be LABELLED as an envelope
//     study for as long as it is on screen.
//
// ⇒ THE THREE RULES THIS MODULE ENFORCES, so the feature can never decay back into the bug:
//
//   R1 — SUBJECT IS EXPLICIT. `FacadeStudySubject` is chosen by the user. There is no
//        "if no building, try the envelope" and no "if no envelope, try the building".
//        `resolveFacadeStudySubject` returns a REFUSAL, never a substitution.
//   R2 — THE ANSWER CARRIES ITS SUBJECT. Every resolution carries `label` + `caption`, and the
//        renderer must display them alongside the painted study. An envelope study presented as a
//        building façade study answers a different question than the one asked.
//   R3 — A REFUSAL IS A RESULT. "No buildable envelope here" and "this envelope has no constructed
//        legal height" are ANSWERS the user needs (they name the missing input), not silent
//        no-ops and certainly not a reason to study something else.
//
// ⚠ Note on R3's second case: an envelope whose `maxHeightM` is null is DELIBERATELY drawn as a
// 0.5 m footprint slab (§ENVELOPE-NO-FABRICATED-HEIGHT, L-525a) rather than an invented prism.
// Running a façade study up a 0.5 m slab, or extruding a stand-in height to study, would
// re-manufacture the very number L-525a refused to invent. So we refuse and say why.

// §REFUSAL-IDENTITY (C58 §1.13, added 2026-08-11) — R3 SAID "A REFUSAL IS A RESULT".
// It was half-true. The three refusal branches below are three genuinely different
// answers — "you have not designed a building", "this site has no resolved envelope",
// and "§ENVELOPE-NO-FABRICATED-HEIGHT (L-525a) refuses to invent the height a study
// would need" — and all three left this module as ONE untyped `reason: string`. The
// last of those names its governing rule IN A COMMENT (line ~38) and never in the
// badge the user reads (`CesiumViewport.ts`), so the strongest honesty claim this
// module makes is the one least visible on screen.
//
// C58 §1.13.1 requires a CLOSED code set (`EnvelopeRefusalCode` is the reference
// implementation). Each code below is derived from an EXISTING branch — nothing was
// minted for a case this module does not already decide:
//
//   • `no-designed-building`         — R1's substitution point, the L-272 trap.
//   • `no-buildable-envelope`        — no committed parcel / no resolved zoning ring.
//   • `envelope-height-unconstructed`— the ring exists, the HEIGHT does not.
//                                      §ENVELOPE-NO-FABRICATED-HEIGHT / L-525a.
//
// ⚠ Note the third is NOT the second. Collapsing them would tell a user with a
// perfectly good envelope that they have no envelope — and would hide the fact that
// the missing input is a HEIGHT SOURCE, which is the only actionable part of the
// answer ("fix the height source, not the study").

/** The CLOSED refusal-code set. Modelled on `EnvelopeRefusalCode` — never `string`. */
export const FACADE_STUDY_REFUSAL_CODES = [
    'no-designed-building',
    'no-buildable-envelope',
    'envelope-height-unconstructed',
] as const;
export type FacadeStudyRefusalCode = (typeof FACADE_STUDY_REFUSAL_CODES)[number];

/** The two things a façade sun study can be run on. Chosen, never inferred. */
export type FacadeStudySubject = 'building' | 'envelope';

/** The envelope as the massing input holds it (scene-XZ metres + the constructed legal height). */
export interface EnvelopeStudyInput {
    readonly ring: ReadonlyArray<{ x: number; z: number }>;
    readonly maxHeightM: number | null;
}

export type FacadeStudyResolution =
    | {
          readonly status: 'ok';
          readonly subject: FacadeStudySubject;
          /** Short badge text. MUST be shown while the study is painted (R2). */
          readonly label: string;
          /** One sentence stating what question this study answers, and what it does not. */
          readonly caption: string;
          /** Only for `subject: 'envelope'` — the ring + height to study. */
          readonly ring?: ReadonlyArray<{ x: number; z: number }>;
          readonly heightM?: number;
      }
    | {
          readonly status: 'refused';
          readonly subject: FacadeStudySubject;
          /**
           * §REFUSAL-IDENTITY (C58 §1.13.1) — WHICH refusal, over a closed set. Render
           * via `facadeRefusalBadgeText()`; `reason` alone drops the identity.
           */
          readonly code: FacadeStudyRefusalCode;
          /** User-facing reason. Names the MISSING INPUT, never suggests a substitute. */
          readonly reason: string;
      };

/** R2 — the badge the envelope study must carry for as long as it is on screen. */
export const ENVELOPE_STUDY_LABEL = 'Envelope study';
export const ENVELOPE_STUDY_CAPTION =
    'Sun on the faces of the BUILDABLE ENVELOPE — the legal volume, before any building is ' +
    'designed. This is not a façade study of a building and does not describe one.';

export const BUILDING_STUDY_LABEL = 'Façade study';
export const BUILDING_STUDY_CAPTION =
    'Sun on the designed building’s own façade and roof.';

/**
 * Resolve the chosen subject into something paintable — or into a refusal.
 *
 * ⚠ `hasBuildingRing` is passed in rather than derived here because the building ring resolution
 * (wall-loop → floor-slab → parcel → centroid square, §FORMA-FACADE-FOOTPRINT-FIX / ADR-0095) is
 * the renderer's existing, unchanged pipeline. This function's ONLY job is to guarantee the two
 * subjects never fall through into each other.
 */
export function resolveFacadeStudySubject(args: {
    readonly subject: FacadeStudySubject;
    readonly envelope: EnvelopeStudyInput | null | undefined;
    readonly hasBuildingRing: boolean;
}): FacadeStudyResolution {
    if (args.subject === 'building') {
        if (!args.hasBuildingRing) {
            // R1 — the L-272 substitution point. We refuse HERE rather than reaching for the
            // envelope (or, historically, the parcel ring) to fill the hole.
            return {
                status: 'refused',
                subject: 'building',
                code: 'no-designed-building',
                reason:
                    'No designed building to study yet. Draw or generate a building, or switch the ' +
                    'study to the buildable envelope — that is a different question and is labelled ' +
                    'as one.',
            };
        }
        return {
            status: 'ok',
            subject: 'building',
            label: BUILDING_STUDY_LABEL,
            caption: BUILDING_STUDY_CAPTION,
        };
    }

    const env = args.envelope;
    if (!env || !env.ring || env.ring.length < 3) {
        return {
            status: 'refused',
            subject: 'envelope',
            code: 'no-buildable-envelope',
            reason:
                'No buildable envelope on this site. Commit a parcel and resolve its zoning rules ' +
                'first — the envelope is what the study would run on.',
        };
    }
    if (!(typeof env.maxHeightM === 'number' && env.maxHeightM > 0)) {
        // §ENVELOPE-NO-FABRICATED-HEIGHT (L-525a) reached through the analysis path.
        return {
            status: 'refused',
            subject: 'envelope',
            code: 'envelope-height-unconstructed',
            reason:
                'This envelope has no constructed maximum height, so it is drawn as a footprint ' +
                'slab rather than a volume. A sun study needs faces with a real height — inventing ' +
                'one to study would be a fabricated result. Fix the height source, not the study.',
        };
    }
    return {
        status: 'ok',
        subject: 'envelope',
        label: ENVELOPE_STUDY_LABEL,
        caption: ENVELOPE_STUDY_CAPTION,
        ring: env.ring,
        heightM: env.maxHeightM,
    };
}

/**
 * §REFUSAL-IDENTITY — THE render seam for a refused study.
 *
 * The badge is the only surface a refused study has, so the code must appear there or
 * it appears nowhere. Copies the shipped `siteDispatch.ts` pattern: the reason enum key
 * in a parenthetical inside the user-visible note. `envelope-height-unconstructed` on
 * screen is a string a user can quote back and an engineer can grep to L-525a; "Envelope
 * study unavailable" is not.
 */
export function facadeRefusalBadgeText(
    refusal: Extract<FacadeStudyResolution, { status: 'refused' }>,
): string {
    return `${refusal.subject === 'envelope' ? 'Envelope' : 'Façade'} study unavailable ` +
        `(${refusal.code}) — ${refusal.reason}`;
}

/**
 * Whether the study's own proposed massing should be counted as an OCCLUDER.
 *
 * For the BUILDING subject: yes, unchanged — the building's own wings genuinely shade each other
 * and the existing behaviour is correct.
 *
 * For the ENVELOPE subject: **NO**, and this is the L-272 lesson stated as code. The envelope is
 * the volume a building COULD occupy; a design that happens to exist inside it is not a neighbour
 * casting shade onto it, it is the same space counted twice. Letting the massing occlude the
 * envelope reproduces the exact "real building self-shadowing the phantom" artefact L-272 records.
 * Neighbouring CONTEXT buildings stay in the occluder set for both subjects — those are real.
 */
export function includeProposedMassingAsOccluder(subject: FacadeStudySubject): boolean {
    return subject === 'building';
}
