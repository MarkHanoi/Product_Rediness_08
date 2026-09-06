// §PL-CREATE-HOUSE (lane PL-COST-AND-CREATE-HOUSE, 2026-09-06) — the CONTROL that puts STR
// §25.8's "CREATE HOUSE" on the Parcel Law tab and runs the PROVEN pipeline.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ IT CALLS `generateHouseFromBoundary`. IT DOES NOT CONTAIN A GENERATOR.
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The standing rule for this repo's most expensive recurring failure is: GREP FOR THE EXISTING
// IMPLEMENTATION FIRST, then wire it. `apps/editor/src/ui/house-layout/houseFromBoundary.ts:85`
// already draws a closed shell from a footprint ring, waits for the shell to register, gathers
// the brief from the live stores and runs `HouseLayoutExecutor` — whose scene mutation happens
// inside ONE `batchCoordinator.runBatch`, so undo removes the whole house in one step (C16 §8.6
// B-6). Every element §25.8 names except columns and beams comes out of that one call.
//
// So this file is a JOIN and a REFUSAL SURFACE, and both halves are the work:
//   · the join   — `planCreateHouse` turns the user's level envelopes into the call's arguments;
//   · the refusal — C80's *"may this pass replace this?"*, asked before every run and answered
//                   with numbers, never with a shrug.
//
// ⛔ §25.0 IS BINDING AND IT CONSTRAINS THIS BUTTON: *"I want pryzm to guide this process without
// building the house in one click — because it would never be the wanted outcome."* So
// `autoBuild` is left at its default `false`: the click starts the pipeline and the user picks
// among the generated layout variants in the chooser the house flow already owns. Passing
// `autoBuild: true` here would have been one line shorter and would have broken the sentence the
// whole lane exists to serve.
//
// ⛔ P6 — this file writes no store and mutates no element. It dispatches through the house
// pipeline, which dispatches through the command bus. P4 — no `(window as any)`; every global is
// reached through a typed, injectable seam. P8 — a span per exported function.

import { trace } from '@opentelemetry/api';
import { storeRegistry } from '@pryzm/core-app-model';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import { resolveActiveLevelId } from '../apartment-layout/activeLevel';
import {
    planCreateHouse,
    readLevelEnvelopes,
    type CreateHouseOutcome,
    type HousePlanVertex,
} from '../site/createHousePlan';
import {
    buildCreateHouseSection,
    CREATE_HOUSE_BTN_TESTID,
    CREATE_HOUSE_STATUS_TESTID,
    CREATE_HOUSE_TESTID,
} from '../site/createHouseSection';

const _tracer = trace.getTracer('pryzm.analysis.parcelLawCreateHouse');

/** `data-testid` on the slot this control owns. */
export const PARCEL_LAW_CREATE_HOUSE_SLOT_TESTID = 'analysis-parcel-law-create-house';
/** `'yes'` / `'no:<reason>'` — whether the live store channel was subscribed. Read by the spec. */
export const CREATE_HOUSE_SUBSCRIBED_ATTR = 'data-live-subscribed';

/** The store surface this control reads. Structural — the same two members as its sibling. */
export interface CreateHouseStore {
    getState(): ReadonlyMap<string, unknown>;
    subscribeDirty?(
        listener: (
            diff: { readonly added: ReadonlySet<string>; readonly updated: ReadonlySet<string>; readonly removed: ReadonlySet<string> },
            state: ReadonlyMap<string, unknown>,
        ) => void,
    ): () => void;
}

/** What the pipeline hands back. A structural subset of `HouseFromBoundaryResult`. */
export interface HouseBuildResult {
    readonly ok: boolean;
    readonly reason?: string;
    readonly levelIds?: readonly string[];
    readonly slabCount?: number;
    readonly roofCreated?: boolean;
}

export interface ParcelLawCreateHouseDeps {
    /** Production: `() => window.runtime`. Resolved per CALL, never captured (§L-545). */
    readonly runtime: () => PryzmRuntime | null | undefined;
    /** Production: `resolveActiveLevelId()`. */
    readonly activeLevelId: () => string | null | undefined;
    /** Production: counts `storeRegistry.getStoreForType('wall')` records on that level. */
    readonly authoredWallCount: (levelId: string) => number;
    /**
     * Production: the dynamic `import('../house-layout/houseFromBoundary.js')` +
     * `generateHouseFromBoundary(rt, storeys, opts)`.
     *
     * ⛔ INJECTED AS ONE FUNCTION, and deliberately: a spec must be able to assert the ARGUMENTS
     * this control passes without loading a 3,595-line executor and its THREE dependencies into a
     * happy-dom worker. The fake is a fake of the SEAM — the call and its payload — not of the
     * pipeline's behaviour, which the house lane's own suites already own.
     */
    readonly buildHouse: (
        runtime: PryzmRuntime,
        storeyCount: number,
        opts: {
            readonly footprint: readonly HousePlanVertex[];
            readonly floorToFloorM: number;
            readonly roofKind: 'flat' | 'gable' | 'hip';
        },
    ) => Promise<HouseBuildResult>;
}

function resolveStore(rt: PryzmRuntime | null | undefined): CreateHouseStore | null {
    const s = (rt as unknown as { stores?: Record<string, unknown> } | null | undefined)
        ?.stores?.spaceEnvelope;
    if (!s || typeof s !== 'object') return null;
    const c = s as CreateHouseStore;
    return typeof c.getState === 'function' ? c : null;
}

/**
 * Count the walls already authored on `levelId`.
 *
 * ⛔ THE SAME STORE `GISAreaLayout.ts:3714` MEASURES THE AUTHORED MODEL FROM
 * (`storeRegistry.getStoreForType('wall')`), so C80's question is decided from the same records
 * the Designed-vs-permitted fold reports. A second wall census would let the two disagree about
 * whether this level is empty — and this one gates a destructive-looking build.
 *
 * A store that is absent or throws yields 0, which means the C80 arm does NOT fire. That is the
 * permissive direction, so it is stated: on a runtime with no wall store, PRYZM cannot see prior
 * work and the advisory below says the build draws a NEW shell regardless.
 */
function countAuthoredWallsOnLevel(levelId: string): number {
    try {
        const store = storeRegistry.getStoreForType('wall') as unknown as
            { getAll?: () => unknown[] } | null | undefined;
        const all = store?.getAll?.() ?? [];
        let n = 0;
        for (const raw of all) {
            if (typeof raw !== 'object' || raw === null) continue;
            const lid = (raw as Record<string, unknown>).levelId;
            if (typeof lid === 'string' && lid === levelId) n++;
        }
        return n;
    } catch (e) {
        console.warn('[analysis][create-house] wall census failed — C80 gate reads 0:', e);
        return 0;
    }
}

/** The production wiring. Every global is resolved WHEN CALLED, so a late boot is still seen. */
export function defaultParcelLawCreateHouseDeps(): ParcelLawCreateHouseDeps {
    const w = (typeof window !== 'undefined' ? window : {}) as unknown as {
        runtime?: PryzmRuntime | null;
    };
    return {
        runtime: () => w.runtime ?? null,
        // The ONE active-level resolver the house pipeline itself uses, so the level this control
        // gates on is the level `generateHouseFromBoundary` will build on. A second resolver here
        // is how a gate ends up guarding a different storey from the one that gets the shell.
        activeLevelId: () => resolveActiveLevelId() ?? null,
        authoredWallCount: countAuthoredWallsOnLevel,
        buildHouse: async (rt, storeyCount, opts) => {
            const mod = await import('../house-layout/houseFromBoundary.js');
            // ⛔ `autoBuild` is NOT passed — its default `false` is the modal path, which is what
            // STR §25.0 requires. See the header.
            return mod.generateHouseFromBoundary(rt, storeyCount, {
                footprint: opts.footprint,
                floorToFloorM: opts.floorToFloorM,
                roofKind: opts.roofKind,
            }) as Promise<HouseBuildResult>;
        },
    };
}

export interface ParcelLawCreateHouseHandle {
    readonly element: HTMLElement;
    repaint(): void;
    /** The outcome the last render decided on. Read by the spec. */
    lastOutcome(): CreateHouseOutcome | null;
    dispose(): void;
}

/**
 * Mount the "Create house" section into `host`. Never throws into the surface.
 */
export function mountParcelLawCreateHouse(
    host: HTMLElement,
    deps: ParcelLawCreateHouseDeps,
): ParcelLawCreateHouseHandle {
    const span = _tracer.startSpan('pryzm.analysis.mountParcelLawCreateHouse');
    const root = document.createElement('div');
    root.className = 'anl-parcel-law-create-house';
    root.setAttribute('data-testid', PARCEL_LAW_CREATE_HOUSE_SLOT_TESTID);

    let disposed = false;
    let building = false;
    let unsubStore: (() => void) | null = null;
    let outcome: CreateHouseOutcome | null = null;
    let status = '';

    const setStatus = (text: string): void => {
        status = text;
        const el = root.querySelector<HTMLElement>(`[data-testid="${CREATE_HOUSE_STATUS_TESTID}"]`);
        if (el) el.textContent = text;
    };

    const decide = (): CreateHouseOutcome => {
        const rt = deps.runtime();
        const activeLevelId = deps.activeLevelId() ?? null;
        let wallCount = 0;
        try {
            wallCount = activeLevelId ? deps.authoredWallCount(activeLevelId) : 0;
        } catch (e) {
            console.warn('[analysis][create-house] wall count failed — treating as 0:', e);
        }
        return planCreateHouse({
            levelEnvelopes: readLevelEnvelopes(resolveStore(rt)),
            activeLevelId,
            authoredWallCountOnActiveLevel: wallCount,
        });
    };

    const render = (): void => {
        if (disposed) return;
        try {
            outcome = decide();
            root.innerHTML = buildCreateHouseSection(outcome);
            if (status) setStatus(status);
            wire();
        } catch (e) {
            console.warn('[analysis][create-house] render failed (non-fatal):', e);
            root.textContent =
                'The "Create house" section could not render this pass. Nothing has been created; '
                + 'this is a failure of THIS section, not of your model.';
        }
    };

    const wire = (): void => {
        const btn = root.querySelector<HTMLButtonElement>(`[data-testid="${CREATE_HOUSE_BTN_TESTID}"]`);
        if (!btn || btn.disabled) return;
        btn.onclick = (): void => {
            if (building) return;
            const current = outcome;
            if (!current?.ok) return;
            const rt = deps.runtime();
            if (!rt) {
                // ⛔ A runtime that vanished between render and click is a WIRING failure and says
                // so — it is not "your project has nothing to build".
                setStatus('PRYZM has no runtime in this session, so the house pipeline cannot be '
                    + 'reached. Nothing has been created.');
                return;
            }
            building = true;
            btn.disabled = true;
            setStatus(`Drawing a ${current.plan.footprint.length}-edge shell and generating `
                + `${current.plan.storeyCount} storey${current.plan.storeyCount === 1 ? '' : 's'}… `
                + 'a layout chooser will open when the variants are ready.');
            void deps.buildHouse(rt, current.plan.storeyCount, {
                footprint: current.plan.footprint,
                floorToFloorM: current.plan.floorToFloorM,
                roofKind: current.plan.roofKind,
            }).then((res) => {
                building = false;
                if (disposed) return;
                // ⛔ The pipeline's OWN `reason` is printed verbatim on a refusal. Replacing it
                // with a generic "could not build" would discard the one sentence that says which
                // of its eight refusal arms fired.
                setStatus(res.ok
                    ? `House built on ${res.levelIds?.length ?? current.plan.storeyCount} level`
                      + `${(res.levelIds?.length ?? current.plan.storeyCount) === 1 ? '' : 's'}. Your `
                      + 'level envelopes are unchanged, so the intended-vs-built comparison above still '
                      + 'holds. Undo removes the whole house in one step.'
                    : `The house pipeline refused: ${res.reason ?? 'no reason given'}. Nothing was created.`);
                // Re-decide: with walls now on the level, C80's arm should refuse a second run.
                render();
            }).catch((e: unknown) => {
                building = false;
                if (disposed) return;
                console.warn('[analysis][create-house] pipeline threw:', e);
                setStatus('The house pipeline threw while building. See the console. PRYZM cannot say '
                    + 'how much of the house was created — check the model before running it again.');
            });
        };
    };

    try {
        host.appendChild(root);
        render();
        const store = resolveStore(deps.runtime());
        if (store && typeof store.subscribeDirty === 'function') {
            try {
                unsubStore = store.subscribeDirty(() => {
                    if (disposed || !root.isConnected || building) return;
                    render();
                });
                root.setAttribute(CREATE_HOUSE_SUBSCRIBED_ATTR, 'yes');
            } catch (e) {
                root.setAttribute(CREATE_HOUSE_SUBSCRIBED_ATTR, 'no:threw');
                console.warn('[analysis][create-house] subscribeDirty threw:', e);
            }
        } else {
            root.setAttribute(CREATE_HOUSE_SUBSCRIBED_ATTR, store ? 'no:store-has-no-dirty-channel' : 'no:no-store');
        }
        span.setAttribute('pryzm.analysis.createHouse.mounted', true);
    } catch (e) {
        span.setAttribute('pryzm.analysis.createHouse.mounted', false);
        console.warn('[analysis][create-house] mount failed (non-fatal):', e);
    } finally {
        span.end();
    }

    return {
        element: root,
        repaint: render,
        lastOutcome: () => outcome,
        dispose(): void {
            if (disposed) return;
            disposed = true;
            try { unsubStore?.(); } catch { /* teardown is best-effort */ }
            unsubStore = null;
            root.remove();
        },
    };
}

/** Re-exported for the tab, so the host does not import two modules for one section. */
export { CREATE_HOUSE_TESTID };
