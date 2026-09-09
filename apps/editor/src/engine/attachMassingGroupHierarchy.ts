// attachMassingGroupHierarchy — the envelope store's dirty channel becomes N
// `BuildingData` rows, and therefore N `IfcBuilding` entities and N inspect-tree rows.
//
// ADR-0385 §2 point 1 · applies ADR-0328 · amends ADR-0383 · C84 EI-9 · C114 §6a ·
// §CONTEXT-DATA-HONESTY (L-581 / L-616) · P6.
//
// ══════════════════════════════════════════════════════════════════════════════════
// ⭐ THE EDGE THAT WAS MISSING, AND WHY IT WAS THE ONLY ONE
// ══════════════════════════════════════════════════════════════════════════════════
// Everything downstream of this file was already built and already correct:
// `BuildingResolver.ts` answers *"which building is this element in"*,
// `buildingContainment.ts` stamps the IFC intermediate model with N buildings, and
// `projectTreeModel.ts` renders the `IfcBuilding` tier. **All three read
// `hierarchyStore`, and nothing wrote it** — measured before this file existed:
//
//     grep -rn "hierarchy.createBuilding|hierarchyStore"
//          apps/editor/src/ui/site/ plugins/space-envelope/
//     -> ONE hit, and it is a COMMENT.
//
// So a master plan authored as three massing groups exported as ONE building. This
// module is the write, and the rule it applies lives in `@pryzm/core-app-model`
// (`MassingGroupProjection.ts`) rather than here — [[same-rule-two-implementations]]
// is this repo's dominant defect and the projection is a rule, not glue.
//
// ══════════════════════════════════════════════════════════════════════════════════
// ⭐ ONE ROAD, NOT TWO: `Store.subscribeDirty()` — the `bathroomPodMemberMirror` shape
// ══════════════════════════════════════════════════════════════════════════════════
// `Store.applyPatch()` is called by the bus on EXECUTE and by
// `composedStoreUndoAdapter('spaceEnvelope', …)` on UNDO and REDO, and it notifies
// its subscribers every time with a `DirtyDiff` computed by COMPARING STATE BEFORE
// AND AFTER. So create / rename / dissolve / setStoreys / delete / undo / redo all
// arrive here through ONE subscription, and there is no second channel that could
// disagree with the first (C84 EI-9).
//
// ⛔ DO NOT "IMPROVE" THIS INTO A BUS-EVENT SUBSCRIBER. `performUndoRedo` applies
// inverse patches straight to the stores and emits NO bus events (measured: zero
// `events.emit` in that file). Off events, undoing the gesture that created three
// blocks would leave three `BuildingData` rows behind forever — the projection would
// have become the second source of truth ADR-0328 forbids, by accident.
//
// ══════════════════════════════════════════════════════════════════════════════════
// ⭐ THE UNDO ARITHMETIC, STATED SO IT IS NOT DISCOVERED
// ══════════════════════════════════════════════════════════════════════════════════
// A three-block master-plan gesture is ONE `spaceEnvelope.batch.create` — one
// `produceCommand`, one Immer patch pair, ONE Ctrl+Z (C114 §6a). This projection adds
// **ZERO** further ring entries: it is not a command and mints no patch pair, exactly
// as `bathroomPodMemberMirror`'s projected fixtures are not on the ring for
// `bathroomPod.*`. So the gesture still costs the user exactly one Ctrl+Z, and the
// buildings disappear on that Ctrl+Z because the diff says `removed` and this
// subscriber re-projects.
//
// ⛔ It could not have ridden the batch's `produceCommand` in any case:
// `hierarchyStore` is not a bus-managed Immer store (its writers are legacy `Command`
// classes bridged at `initBusHandlers` with `stores: [] as const`), so
// `produceMultiStoreCommand` — the chokepoint `pool` uses for its four stores — has
// nothing to fold in here. The only alternative was a SECOND undoable command, which
// costs a second Ctrl+Z that undoes half of one gesture and shows a torn state in
// between. That is the failure `supersedes` was added to the create verb to avoid
// (§L-13038), and it is why this is a projection.
//
// ══════════════════════════════════════════════════════════════════════════════════
// ⚠ WHAT THIS DOES NOT ESTABLISH, so a green run is not over-read
// ══════════════════════════════════════════════════════════════════════════════════
// ADR-0385 §4 states it before it is built: mapping group -> `IfcBuilding` produces N
// correct CONTAINERS and no CONTENTS. `Wall` and `Slab` carry no group axis, so an
// element's building is resolved THROUGH ITS LEVEL — and when two blocks share a PRYZM
// `levelId`, the element is genuinely unroutable and `resolveLevelBuilding` says
// `unknown` rather than guessing. The storeys are still correct and the diagnostic is
// still raised. The contents join is separate, larger work.

import {
    applyMassingGroupProjection,
    hierarchyStore,
    readMassingGroupSubstrate,
    UNREADABLE_MASSING_SUBSTRATE,
    type MassingGroupMemberView,
    type MassingProjectionReport,
} from '@pryzm/core-app-model';

/**
 * The store shape `subscribeDirty` lives on. Declared STRUCTURALLY for the reason
 * `attachSpaceEnvelopeRender` and `bathroomPodMemberMirror` both give: this is L7
 * engine glue and a structural shape states exactly which two methods the projection
 * depends on.
 */
export interface DirtyEnvelopeStore {
    getState(): ReadonlyMap<string, unknown>;
    subscribeDirty(
        listener: (
            diff: {
                readonly added: ReadonlySet<string>;
                readonly updated: ReadonlySet<string>;
                readonly removed: ReadonlySet<string>;
            },
            state: ReadonlyMap<string, unknown>,
        ) => void,
    ): () => void;
}

export interface MassingGroupHierarchyDeps {
    /**
     * Resolve a PRYZM level id to its storey name, so a projected `LevelData` reads
     * "Level 03" in the Data Workbench rather than a ULID. Best effort — the
     * projection falls back to the id, which is honest rather than invented.
     */
    readonly levelNameOf?: (bimLevelId: string) => string | undefined;
    /** Injectable for tests. Defaults to the `@pryzm/core-app-model` singleton. */
    readonly store?: Pick<typeof hierarchyStore, 'getAll' | 'add' | 'update' | 'remove'>;
    /** Called after every reconcile that actually changed something. */
    readonly onProjected?: (report: MassingProjectionReport) => void;
}

/**
 * Run the projection ONCE against whatever the envelope store currently holds.
 *
 * Exported so the initial pass, the subscription and a test all drive the SAME
 * function — a second call site that assembled the substrate differently would be a
 * second implementation of "which envelopes are in which group".
 */
export function projectMassingGroupsNow(
    envelopeStore: DirtyEnvelopeStore | null | undefined,
    deps: MassingGroupHierarchyDeps = {},
): MassingProjectionReport {
    // ⛔ UNREACHABLE AND EMPTY ARE DIFFERENT FACTS, and here the difference is
    // destructive: `readMassingGroupSubstrate(null)` REFUSES, and the refusal is what
    // stops a boot where the plugin store failed to compose from reaping every
    // building a master plan had already produced.
    let members: readonly MassingGroupMemberView[] | null = null;
    if (envelopeStore && typeof envelopeStore.getState === 'function') {
        try {
            members = [...envelopeStore.getState().values()] as MassingGroupMemberView[];
        } catch {
            members = null;
        }
    }
    const substrate = members === null
        ? UNREADABLE_MASSING_SUBSTRATE
        : readMassingGroupSubstrate(members);

    const target = (deps.store ?? hierarchyStore) as typeof hierarchyStore;
    return applyMassingGroupProjection(
        target,
        substrate,
        deps.levelNameOf ? { levelNameOf: deps.levelNameOf } : {},
    );
}

/**
 * Install the projection. Returns the disposer.
 *
 * ⭐ THE INITIAL PASS IS NOT OPTIONAL AND NOT A CONVENIENCE — the same argument
 * `attachSpaceEnvelopeRender` makes about its initial draw. A subscriber alone sees
 * only what changes AFTER it is installed, so every envelope restored by
 * `restoreCompoundFamilies` on project open would be in the model with no building
 * behind it, and the very first export after a reload would emit one building for a
 * three-block master plan.
 */
export function attachMassingGroupHierarchy(
    envelopeStore: DirtyEnvelopeStore,
    deps: MassingGroupHierarchyDeps = {},
): () => void {
    const run = (): void => {
        try {
            const report = projectMassingGroupsNow(envelopeStore, deps);
            if (!report.ok) {
                console.warn('[massing-hierarchy] projection refused —', report.refusal);
                return;
            }
            if (report.added.length + report.updated.length + report.removed.length === 0) return;
            console.log(
                `[massing-hierarchy] ADR-0385: ${report.groups} massing group(s) -> ` +
                `+${report.added.length} / ~${report.updated.length} / -${report.removed.length} ` +
                `hierarchy node(s) (${report.unchanged} unchanged). ${report.note}`,
            );
            if (report.labelDisagreements.length > 0) {
                // ⛔ NAMED, NEVER SILENT. `label` is denormalised across a group's
                // members by design and `spaceEnvelope.group.rename` is its only
                // repair; a building silently named after whichever member happened
                // to be first is how the tree and the user's intent drift apart.
                console.warn(
                    '[massing-hierarchy] these massing groups carry DISAGREEING labels across their ' +
                    'members, so the building took the first one — a `spaceEnvelope.group.rename` ' +
                    'repairs it: ' + report.labelDisagreements.join(', '),
                );
            }
            deps.onProjected?.(report);
        } catch (err) {
            // ⛔ NEVER FATAL. A projection that threw inside a store listener would
            // take the whole dirty fan-out down with it — the render, the plan symbol
            // and the quantities all ride the same channel.
            console.error('[massing-hierarchy] projection threw (non-fatal):', err);
        }
    };

    run();
    return envelopeStore.subscribeDirty(() => { run(); });
}
