// §RESI-ORCH-COST (lane RESI-ORCHESTRATOR, 2026-09-03) — THE ONE PLACE THE
// PROJECT'S BUILDING-TYPOLOGY CHOICE IS STORED.
//
// ⭐ THIS FILE IS AN EXTRACTION, NOT A NEW STORE. It held these four declarations
// privately inside `MedicionesBucket.ts` while that panel was the only surface
// that asked the question. The envelope card now asks the SAME question one stage
// earlier (an indicative €/m² against the buildable-envelope GFA, before anything
// is drawn), and the one thing that must not happen is two panels remembering two
// different answers to "what kind of building is this?" — a user who picks
// "dwelling" on the parcel card and then sees "garage" in the 5D tab has been told
// two different numbers by one product, and the factor between those two rows in
// Barcelona's own table is NINE.
//
// ⛔ THE TYPOLOGY HAS NO DEFAULT, AND THAT IS THE LOAD-BEARING PROPERTY.
// `estimateBuildingCost` returns `null` — never a zero, never a partial figure —
// when `groupId` is unset, because PRYZM does not know whether a model is a
// 4-star hotel, a school or a garage. A default here would turn that honest
// refusal into a guess with a legal citation attached. `{ groupId: null }` is
// therefore the correct answer for every project nobody has answered for, and
// every read path below returns it rather than throwing or inventing.
//
// STORAGE. This browser's `localStorage`, keyed by project. Deliberately NOT the
// project snapshot: unlike the rate book (§RATES157/L-12503, where the founder
// lost typed prices to exactly that assumption), this is a single enum choice a
// user re-picks in one click, and widening the snapshot schema is a C47 additive
// change that should be made deliberately rather than as a side effect of
// extracting a function. If it later earns snapshot persistence, this file is the
// single place that changes.
//
// P4 — no globals beyond `localStorage`, and every access is guarded: a private
// window, a blocked-cookie browser and a corrupt value all read as "not chosen".

/** The per-project answer to "which published cost group is this building?". */
export interface BuildingChoice {
    readonly groupId: string | null;
    readonly correctionId: string | null;
}

/** The answer for a project nobody has answered for. NOT a default typology. */
export const UNCHOSEN_BUILDING_TYPOLOGY: BuildingChoice = Object.freeze({
    groupId: null,
    correctionId: null,
});

const BUILDING_GROUP_PREFIX = 'pryzm.mediciones.buildingGroup.';

/**
 * The storage key. ⚠ The `mediciones.` segment is HISTORICAL and is kept on
 * purpose: renaming it would orphan every choice a user has already made, and a
 * silently-forgotten typology reads on the panel as "never chosen" — which is the
 * one state we cannot distinguish from a deliberate refusal to choose.
 */
function groupKey(projectId: string | null | undefined): string {
    return BUILDING_GROUP_PREFIX + (projectId ?? 'unscoped');
}

/** Narrow structural shape — deliberately not the full `PryzmRuntime`, so this
 *  module stays testable without a runtime and importable from either surface. */
export interface ProjectScopedRuntimeLike {
    readonly projectContext?: { readonly projectId?: string | null } | null;
}

function projectIdOf(runtime: ProjectScopedRuntimeLike | null | undefined): string | null {
    return runtime?.projectContext?.projectId ?? null;
}

/**
 * Read the choice. Never throws; every failure mode — no storage, no value,
 * malformed JSON, wrong types — yields {@link UNCHOSEN_BUILDING_TYPOLOGY}, which
 * downstream reads as "ask the user", never as a typology.
 */
export function loadBuildingChoice(
    runtime: ProjectScopedRuntimeLike | null | undefined,
): BuildingChoice {
    try {
        const raw = localStorage.getItem(groupKey(projectIdOf(runtime)));
        if (!raw) return UNCHOSEN_BUILDING_TYPOLOGY;
        const p = JSON.parse(raw) as Partial<BuildingChoice>;
        return {
            groupId: typeof p.groupId === 'string' && p.groupId ? p.groupId : null,
            correctionId: typeof p.correctionId === 'string' && p.correctionId ? p.correctionId : null,
        };
    } catch {
        return UNCHOSEN_BUILDING_TYPOLOGY;
    }
}

/** Persist the choice for this project in this browser. Never throws — a browser
 *  that refuses storage warns once and the choice simply does not survive the
 *  session, which is a degradation the panel can live with and a throw is not. */
export function saveBuildingChoice(
    runtime: ProjectScopedRuntimeLike | null | undefined,
    choice: BuildingChoice,
): void {
    try {
        localStorage.setItem(groupKey(projectIdOf(runtime)), JSON.stringify(choice));
    } catch (e) {
        console.warn('[cost] building typology choice could not be saved to this browser:', e);
    }
}
