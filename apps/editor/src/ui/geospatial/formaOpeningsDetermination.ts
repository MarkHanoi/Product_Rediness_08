/**
 * §FIX-FORMA-OPENINGS-UNKNOWN (GR-10, the []-means-unknown drain) — the PURE
 * decision for "which authored openings does a massing / façade pass run on?".
 *
 * THE DEFECT (ledger row CesiumViewport.ts, ARM C): `input.openings ?? []` and
 * `(studySubject === 'envelope' ? [] : (input?.openings ?? []))` collapsed
 * three facts into one value:
 *   · ENVELOPE subject — DETERMINED-empty BY DEFINITION (an envelope face is
 *     a solid legal plane with no authored openings, L-596);
 *   · a caller that authored ZERO openings — determined-empty;
 *   · an OLDER caller that never recorded the openings relationship at all —
 *     UNKNOWN. The render/study then ran on solid façades while presenting
 *     as "this building has no openings".
 * C75 §1.4 / C78 §1.4: the fallback tier is allowed; impersonating a
 * determined answer is not.
 *
 * CesiumViewport cannot collect under the unit config (cesium at module
 * scope), so the decision lives here — pure, assertable — and the class
 * consumes it.
 */
import { relationshipArrayOrUnknown } from '../relationshipDetermination';

export interface StudyOpeningsDecision<T> {
    /** The openings the pass runs on — [] in both empty cases; the flag differs. */
    readonly openings: readonly T[];
    /** TRUE only when the relationship was never recorded (design subject,
     *  absent array) — the solid-façade run is a fallback TIER, not an answer. */
    readonly unrecorded: boolean;
    /** The loud console line for the unrecorded case — carries the closed
     *  reason token verbatim (§REFUSAL-IDENTITY: the token, not a shrug). */
    readonly note?: string;
}

export function determineStudyOpenings<T>(
    studySubject: 'envelope' | 'design',
    raw: unknown,
    surface: string,
): StudyOpeningsDecision<T> {
    if (studySubject === 'envelope') {
        // DETERMINED — solid legal planes by definition, never a missing record.
        return { openings: [], unrecorded: false };
    }
    const authored = relationshipArrayOrUnknown<T>(raw);
    if (authored === null) {
        return {
            openings: [],
            unrecorded: true,
            note:
                `${surface} openings UNRECORDED (RELATIONSHIP_NOT_RECORDED) — ` +
                'running on SOLID facades (fallback tier); "zero openings" was NOT determined.',
        };
    }
    return { openings: authored, unrecorded: false };
}
