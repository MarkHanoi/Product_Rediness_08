// O.12.c — Active-brief stash (single source of truth for the captured brief).
//
// THE PROBLEM IT SOLVES
// ---------------------
// The onboarding generate chain is asynchronous + multi-hop:
//   briefBootstrap (has the brief) → OnboardingStepController → generateAndFinish
//     → generateApartmentFromBoundary → generateApartmentFromScratch
//     → triggerApartmentLayout → gatherLayoutPayload
// Threading the brief as an explicit parameter the whole way is the primary
// path (and IS done), but two consumers sit OUTSIDE that call stack and still
// need the same brief:
//   1. The "Choose a layout" picker (O.10) — its program-edit form must SEED
//      from the captured brief so the picker and the RAC agree (one source of
//      truth, task §3).
//   2. The AI-panel / console re-trigger (`triggerApartmentLayout()` with no
//      args) — a manual regenerate after onboarding should still honour the
//      brief the user gave.
//
// So we hold the LAST captured brief here (field-id-keyed metadata, exactly the
// `PipelineBrief.metadata` shape) + the typology it belongs to. Writers: the
// onboarding chain (on brief-ready) AND the picker form (on edit). Readers:
// `gatherLayoutPayload` (default override) + the modal seed.
//
// TYPOLOGY-AGNOSTIC: the stash holds the raw metadata + the typologyId; it does
// NOT interpret the field ids. The apartment-specific interpretation happens in
// `briefToProgram.resolveApartmentBrief`. A future Pack reuses the same stash.

/** The captured brief + the typology it was captured for. */
export interface ActiveBrief {
    readonly typologyId: string;
    /** Field-id-keyed primitives — the `PipelineBrief.metadata` shape. */
    readonly metadata: Record<string, unknown>;
}

let _active: ActiveBrief | null = null;

/** Record the brief the user captured (onboarding RAC) for the active typology.
 *  Overwrites any prior brief — the latest capture wins. */
export function setActiveBrief(brief: ActiveBrief | null | undefined): void {
    _active = brief ?? null;
    if (_active) {
        console.log('[active-brief] set', {
            typologyId: _active.typologyId,
            fieldIds: Object.keys(_active.metadata),
        });
    }
}

/** Merge field-id updates into the active brief's metadata (e.g. the picker
 *  edited `bedrooms`). Creates the brief for `typologyId` if none exists yet so
 *  a picker edit before any RAC capture still establishes the source of truth. */
export function patchActiveBriefMetadata(
    typologyId: string,
    patch: Record<string, unknown>,
): void {
    const base = _active && _active.typologyId === typologyId ? _active.metadata : {};
    _active = { typologyId, metadata: { ...base, ...patch } };
}

/** The captured brief metadata for `typologyId`, or `null` when none was
 *  captured (or it belongs to a different typology). */
export function getActiveBriefMetadata(typologyId: string): Record<string, unknown> | null {
    if (_active && _active.typologyId === typologyId) return _active.metadata;
    return null;
}

/** The full active brief (any typology), or null. */
export function getActiveBrief(): ActiveBrief | null {
    return _active;
}

/** Clear the active brief (e.g. on project close / re-onboard). */
export function clearActiveBrief(): void {
    _active = null;
}
