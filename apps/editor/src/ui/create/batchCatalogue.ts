/**
 * @file apps/editor/src/ui/create/batchCatalogue.ts
 *
 * Batch-creation catalogue — the SINGLE registry of batch-creation prompts.
 *
 * Governed by **C17 — Batch Creation Catalogue & Panel Binding** and
 * **C16 — Command Authoring Protocol**.
 *
 *   • C17 §4   — the catalogue rows (organised Discipline › System › item).
 *   • C17 §6   — one shared prompt string per entry (panel label + AI prompt).
 *   • C17 §10  — the AS-IS dispatch reference: every entry dispatches through the
 *                EXACT path the AI panel uses today — `commandManager.execute(
 *                new XCommand(args), { source })` (Path A). No fake/shortcut
 *                dispatch, no re-implemented loops, no direct store writes.
 *   • C17 §11  — DI-1…DI-6: this module is the single source; `build(deps)`
 *                constructs the legacy command (or null), `precondition(deps)`
 *                gates it; the panel and AI prompt list both read from here.
 *
 * The legacy command is the COMPLETE path (it wraps its loop in
 * `batchCoordinator.runBatch` AND fire-and-forget dispatches the parallel
 * `*.batch.create` bus event for event-sourcing). Executing it via
 * `commandManager.execute` is therefore one undo unit with full coalescing —
 * identical to the AI panel (AIPanel.ts:726).
 */

import type { Command } from '@pryzm/command-registry';
import {
    CreateWallsOnAllSlabsCommand,
    CreateWallsFromSlabCommand,
    CreateCurtainWallsOnAllSlabsCommand,
    CreateCurtainWallsFromSlabCommand,
    CreateSlabsOnAllFloorsCommand,
    CreateAllSlabsFromLevelToAllFloorsCommand,
    CreateAllSlabsFromLevelToTopLevelCommand,
    ReplicateSelectedSlabToAllLevelsCommand,
    CreateMultipleLevelsCommand,
    CreateGridSystemCommand,
} from '@pryzm/command-registry';

/** The phase currently shipped. Entries with `phase > SHIPPED_PHASE` render disabled (CB-4). */
export const SHIPPED_PHASE = 1 as const;

/** C17 §3 — batch scope vocabulary (the resolution rule each entry declares). */
export type BatchScope =
    | 'on-all-slabs'
    | 'from-selected-slab'
    | 'on-all-levels'
    | 'from-level-to-all-floors'
    | 'from-level-to-top'
    | 'similar-to-selected'
    | 'per-room'
    | 'per-facade'
    | 'per-compartment'
    | 'on-grid'
    | 'project';

/** Minimal level shape the catalogue needs (C17 §10.3). */
interface LevelLike { id: string; elevation: number; height?: number }

/** Minimal slab store shape (C17 §10.3). */
interface SlabStoreLike {
    getById(id: string): { id: string; type?: string; elementType?: string; levelId?: string } | undefined;
    getAll(): Array<{ id: string; type?: string; elementType?: string; levelId?: string }>;
}

/** Command-execution sink — the ONLY side-effect surface (C17 DI-1). */
interface CommandManagerLike {
    execute(cmd: Command, meta?: { source?: string; proposalId?: string }): { success: boolean; info?: string[] };
}

/**
 * Dependencies injected by the panel (C17 DI-3). The catalogue performs no
 * `window.*` reads of its own — the panel resolves these from `props` + the
 * documented legacy stores and passes them in.
 */
export interface BatchDeps {
    commandManager: CommandManagerLike | null;
    getActiveLevelId(): string | null;
    getLevels(): LevelLike[];
    getSelectedElementId(): string | null;
    slabStore: SlabStoreLike | null;
}

/** A typed numeric parameter for parameterised entries (C17 §6 PS-2). */
export interface BatchParam {
    key: string;
    label: string;
    default: number;
    min?: number;
    max?: number;
    step?: number;
}

export interface BatchCatalogEntry {
    catalogId: string;
    discipline: string;       // matches a CREATE_CONFIG discipline label, or a new one (e.g. 'Project')
    system: string;           // matches a System label, or a new one (e.g. 'Levels')
    label: string;            // short panel label (C17 §6)
    prompt: string;           // full NL prompt (shared with the AI panel — CB-8)
    icon: string;
    scope: BatchScope;
    phase: 1 | 2 | 3 | 4 | 5;
    status: 'live' | 'partial' | 'phased';
    params?: BatchParam[];
    /** C17 §10.4 — gate; returns a reason when not dispatchable. */
    precondition(deps: BatchDeps): { ok: boolean; reason?: string };
    /** C17 §10.2 — construct the legacy command, or null when not buildable. */
    build(deps: BatchDeps, params?: Record<string, number>): Command | null;
}

// ── Scope-resolution helpers (C17 §10.3) ──────────────────────────────────────

function resolveSelectedSlabId(deps: BatchDeps): string | null {
    const id = deps.getSelectedElementId();
    if (!id || !deps.slabStore) return null;
    const s = deps.slabStore.getById(id);
    if (!s) return null;
    return (s.type === 'slab' || s.elementType === 'slab') ? id : null;
}

function firstSlabOnActiveLevel(deps: BatchDeps): string | null {
    const lvl = deps.getActiveLevelId();
    if (!lvl || !deps.slabStore) return null;
    const s = deps.slabStore.getAll().find(x => x.levelId === lvl);
    return s?.id ?? null;
}

function referenceSlabId(deps: BatchDeps): string | null {
    return resolveSelectedSlabId(deps) ?? firstSlabOnActiveLevel(deps);
}

const OK = { ok: true } as const;
const phaseGate = (phase: number) => ({ ok: false, reason: `Coming in Phase ${phase}` });
const needSlabSelected = { ok: false, reason: 'Select a slab first' } as const;
const needSlabs = { ok: false, reason: 'No slabs in the model yet' } as const;
const needTwoLevels = { ok: false, reason: 'Add a second level first' } as const;

function hasAnySlab(deps: BatchDeps): boolean {
    return (deps.slabStore?.getAll().length ?? 0) > 0;
}
function levelCount(deps: BatchDeps): number {
    return deps.getLevels().length;
}

// ── The catalogue (C17 §4) ────────────────────────────────────────────────────
// Phase-1 rows have a real `build()`; phased rows are discoverable-but-disabled
// (CB-4) with `build → null` until their semantic layer lands
// (SPEC-SEMANTIC-DESIGN-ASSISTANT).

export const BATCH_CATALOGUE: BatchCatalogEntry[] = [
    // ── Architecture › Wall ──────────────────────────────────────────────────
    {
        catalogId: 'walls.on-all-slabs', discipline: 'Architecture', system: 'Wall',
        label: 'Walls on all slabs', prompt: 'Create walls on all slabs',
        icon: 'material-symbols:wall', scope: 'on-all-slabs', phase: 1, status: 'live',
        precondition: (d) => hasAnySlab(d) ? OK : needSlabs,
        build: () => new CreateWallsOnAllSlabsCommand({ wallHeight: 3.0, wallThickness: 0.2 }),
    },
    {
        catalogId: 'walls.from-selected-slab', discipline: 'Architecture', system: 'Wall',
        label: 'Walls from selected slab', prompt: 'Create walls from the selected slab',
        icon: 'material-symbols:wall', scope: 'from-selected-slab', phase: 1, status: 'live',
        precondition: (d) => resolveSelectedSlabId(d) ? OK : needSlabSelected,
        build: (d) => {
            const slabId = resolveSelectedSlabId(d);
            return slabId ? new CreateWallsFromSlabCommand({ slabId, wallHeight: 3.0, wallThickness: 0.2 }) : null;
        },
    },
    {
        catalogId: 'walls.interior-partitions', discipline: 'Architecture', system: 'Wall',
        label: 'Interior partitions between rooms', prompt: 'Add interior partition walls between adjacent rooms',
        icon: 'material-symbols:wall', scope: 'per-room', phase: 3, status: 'phased',
        precondition: () => phaseGate(3), build: () => null,
    },

    // ── Architecture › Curtain Wall ──────────────────────────────────────────
    {
        catalogId: 'curtain-walls.on-all-slabs', discipline: 'Architecture', system: 'Curtain Wall',
        label: 'Curtain walls on all slabs', prompt: 'Create curtain walls on all slabs',
        icon: 'material-symbols:grid-view', scope: 'on-all-slabs', phase: 1, status: 'live',
        precondition: (d) => hasAnySlab(d) ? OK : needSlabs,
        build: () => new CreateCurtainWallsOnAllSlabsCommand({ height: 3.0 }),
    },
    {
        catalogId: 'curtain-walls.from-selected-slab', discipline: 'Architecture', system: 'Curtain Wall',
        label: 'Curtain walls from selected slab', prompt: 'Create curtain walls from the selected slab',
        icon: 'material-symbols:grid-view', scope: 'from-selected-slab', phase: 1, status: 'live',
        precondition: (d) => resolveSelectedSlabId(d) ? OK : needSlabSelected,
        build: (d) => {
            const slabId = resolveSelectedSlabId(d);
            return slabId ? new CreateCurtainWallsFromSlabCommand({ slabId, height: 3.0 }) : null;
        },
    },

    // ── Architecture › Window / Door / Ceiling (phased — semantic) ───────────
    {
        catalogId: 'windows.per-facade', discipline: 'Architecture', system: 'Window',
        label: 'Windows on every south façade', prompt: 'Add windows to every south façade',
        icon: 'material-symbols:window', scope: 'per-facade', phase: 2, status: 'phased',
        precondition: () => phaseGate(2), build: () => null,
    },
    {
        catalogId: 'doors.between-adjacent-rooms', discipline: 'Architecture', system: 'Door',
        label: 'Doors between adjacent rooms', prompt: 'Add a door between every pair of adjacent rooms',
        icon: 'material-symbols:door-front', scope: 'per-room', phase: 3, status: 'phased',
        precondition: () => phaseGate(3), build: () => null,
    },
    {
        catalogId: 'ceilings.per-room', discipline: 'Architecture', system: 'Ceiling',
        label: 'Ceiling in every room', prompt: 'Add a ceiling to every enclosed room',
        icon: 'material-symbols:dashboard', scope: 'per-room', phase: 3, status: 'phased',
        precondition: () => phaseGate(3), build: () => null,
    },

    // ── Structure › Slab ─────────────────────────────────────────────────────
    {
        catalogId: 'slabs.on-all-floors', discipline: 'Structure', system: 'Slab',
        label: 'Slabs on all floors', prompt: 'Create slabs on all floors like the selected one',
        icon: 'material-symbols:square', scope: 'on-all-levels', phase: 1, status: 'live',
        precondition: (d) => {
            if (levelCount(d) < 2) return needTwoLevels;
            return referenceSlabId(d) ? OK : { ok: false, reason: 'Select a slab, or add one to the active level' };
        },
        build: (d) => {
            const ref = referenceSlabId(d);
            return ref ? new CreateSlabsOnAllFloorsCommand(ref) : null;
        },
    },
    {
        catalogId: 'slabs.from-level-to-all-floors', discipline: 'Structure', system: 'Slab',
        label: 'Replicate this level to all floors', prompt: "Replicate this level's slabs to all floors",
        icon: 'material-symbols:stacks', scope: 'from-level-to-all-floors', phase: 1, status: 'live',
        precondition: (d) => {
            if (levelCount(d) < 2) return needTwoLevels;
            return firstSlabOnActiveLevel(d) ? OK : { ok: false, reason: 'Active level has no slabs' };
        },
        build: (d) => {
            const lvl = d.getActiveLevelId();
            return lvl ? new CreateAllSlabsFromLevelToAllFloorsCommand(lvl) : null;
        },
    },
    {
        catalogId: 'slabs.from-level-to-top', discipline: 'Structure', system: 'Slab',
        label: 'Replicate this level to the top', prompt: "Replicate this level's slabs up to the top level",
        icon: 'material-symbols:vertical-align-top', scope: 'from-level-to-top', phase: 1, status: 'live',
        precondition: (d) => {
            if (levelCount(d) < 2) return needTwoLevels;
            return firstSlabOnActiveLevel(d) ? OK : { ok: false, reason: 'Active level has no slabs' };
        },
        build: (d) => {
            const lvl = d.getActiveLevelId();
            return lvl ? new CreateAllSlabsFromLevelToTopLevelCommand(lvl) : null;
        },
    },
    {
        catalogId: 'slabs.similar-to-selected', discipline: 'Structure', system: 'Slab',
        label: 'Replicate selected slab to all levels', prompt: 'Create a slab like the selected one on every level',
        icon: 'material-symbols:content-copy', scope: 'similar-to-selected', phase: 1, status: 'live',
        precondition: (d) => {
            if (levelCount(d) < 2) return needTwoLevels;
            return resolveSelectedSlabId(d) ? OK : needSlabSelected;
        },
        build: (d) => {
            const ref = resolveSelectedSlabId(d);
            return ref ? new ReplicateSelectedSlabToAllLevelsCommand({ referenceSlabId: ref }) : null;
        },
    },

    // ── Structure › Column / Beam (phased) ───────────────────────────────────
    {
        catalogId: 'columns.at-grid', discipline: 'Structure', system: 'Column',
        label: 'Columns at grid intersections', prompt: 'Place columns at every grid intersection',
        icon: 'material-symbols:grid-on', scope: 'on-grid', phase: 1, status: 'partial',
        precondition: () => ({ ok: false, reason: 'Column-at-grid placement command not yet authored (C17 §10.5 follow-up)' }),
        build: () => null,
    },
    {
        catalogId: 'beams.span-columns', discipline: 'Structure', system: 'Beam',
        label: 'Beams spanning columns', prompt: 'Span beams between all aligned columns',
        icon: 'material-symbols:horizontal-rule', scope: 'on-grid', phase: 5, status: 'phased',
        precondition: () => phaseGate(5), build: () => null,
    },

    // ── Plumbing / Interior (phased — semantic furniture engine) ─────────────
    {
        catalogId: 'plumbing.wc-per-bathroom', discipline: 'Plumbing', system: 'Plumbing',
        label: 'WC set in every bathroom', prompt: 'Put a WC set in every bathroom',
        icon: 'material-symbols:wc', scope: 'per-room', phase: 4, status: 'phased',
        precondition: () => phaseGate(4), build: () => null,
    },
    {
        catalogId: 'furniture.bed-per-bedroom', discipline: 'Interior', system: 'Furniture',
        label: 'Bed in every bedroom', prompt: 'Place a bed in every bedroom',
        icon: 'material-symbols:bed', scope: 'per-room', phase: 4, status: 'phased',
        precondition: () => phaseGate(4), build: () => null,
    },

    // ── Project › Levels ─────────────────────────────────────────────────────
    {
        catalogId: 'levels.create-n', discipline: 'Project', system: 'Levels',
        label: 'Create floor levels', prompt: 'Create {count} floor levels',
        icon: 'material-symbols:stacks', scope: 'project', phase: 1, status: 'live',
        params: [
            { key: 'count', label: 'Number of levels', default: 1, min: 1, max: 50, step: 1 },
            { key: 'heightPerLevel', label: 'Height per level (m)', default: 3.0, min: 0.5, max: 20, step: 0.1 },
        ],
        precondition: () => OK,
        build: (d, params) => {
            const count = Math.max(1, Math.round(params?.count ?? 1));
            const hpl = params?.heightPerLevel ?? 3.0;
            const levels = d.getLevels();
            const top = levels.length
                ? [...levels].sort((a, b) => b.elevation - a.elevation)[0]!
                : { elevation: 0, height: hpl };
            return new CreateMultipleLevelsCommand({
                count,
                baseElevation: top.elevation + (top.height || hpl),
                heightPerLevel: hpl,
            });
        },
    },
    {
        catalogId: 'levels.duplicate-floor-plan', discipline: 'Project', system: 'Levels',
        label: 'Duplicate this floor plan', prompt: 'Duplicate this floor plan to other levels',
        icon: 'material-symbols:file-copy', scope: 'project', phase: 1, status: 'partial',
        // C17 §10.5 G-D2 — DuplicateFloorPlanCommand needs targetLevelIds (a target
        // picker). Deferred to a parameterised-leaf sub-step; disabled until then.
        precondition: () => ({ ok: false, reason: 'Needs a target-level picker (C17 §10.5 G-D2)' }),
        build: () => null,
    },

    // ── Project › Grid ───────────────────────────────────────────────────────
    {
        catalogId: 'grid.create-system', discipline: 'Project', system: 'Grid',
        label: 'Create grid system', prompt: 'Create a {xCount}×{yCount} structural grid',
        icon: 'material-symbols:grid-on', scope: 'project', phase: 1, status: 'live',
        params: [
            { key: 'xCount', label: 'Columns (X)', default: 5, min: 1, max: 50, step: 1 },
            { key: 'yCount', label: 'Rows (Y)', default: 5, min: 1, max: 50, step: 1 },
            { key: 'xSpacing', label: 'X spacing (m)', default: 8, min: 0.5, max: 50, step: 0.5 },
            { key: 'ySpacing', label: 'Y spacing (m)', default: 8, min: 0.5, max: 50, step: 0.5 },
        ],
        precondition: () => OK,
        build: (_d, params) => new CreateGridSystemCommand({
            xCount: Math.max(1, Math.round(params?.xCount ?? 5)),
            yCount: Math.max(1, Math.round(params?.yCount ?? 5)),
            xSpacing: params?.xSpacing ?? 8,
            ySpacing: params?.ySpacing ?? 8,
            xOrigin: 0,
            yOrigin: 0,
        }),
    },
];

/** Group catalogue entries by `discipline → system` (panel rendering helper). */
export function groupCatalogue(): Map<string, Map<string, BatchCatalogEntry[]>> {
    const out = new Map<string, Map<string, BatchCatalogEntry[]>>();
    for (const e of BATCH_CATALOGUE) {
        if (!out.has(e.discipline)) out.set(e.discipline, new Map());
        const sys = out.get(e.discipline)!;
        if (!sys.has(e.system)) sys.set(e.system, []);
        sys.get(e.system)!.push(e);
    }
    return out;
}

export interface BatchDispatchResult { ok: boolean; reason?: string }

/**
 * Dispatch a catalogue entry through the documented path (C17 DI-1):
 * `commandManager.execute(build(deps), { source: 'CREATE_PANEL_BATCH' })`.
 * Re-checks the precondition at click time (selection may have changed) and
 * never silently no-ops (CB-5).
 */
export function dispatchBatchEntry(
    entry: BatchCatalogEntry,
    deps: BatchDeps,
    params?: Record<string, number>,
): BatchDispatchResult {
    if (entry.phase > SHIPPED_PHASE) return { ok: false, reason: `Coming in Phase ${entry.phase}` };
    const pre = entry.precondition(deps);
    if (!pre.ok) return { ok: false, reason: pre.reason };
    if (!deps.commandManager) return { ok: false, reason: 'CommandManager not available' };

    const cmd = entry.build(deps, params);
    if (!cmd) return { ok: false, reason: pre.reason ?? 'Could not build command' };

    try {
        const res = deps.commandManager.execute(cmd, { source: 'CREATE_PANEL_BATCH' });
        if (res?.success) return { ok: true };
        return { ok: false, reason: res?.info?.join(', ') || 'Batch command failed' };
    } catch (err) {
        console.error(`[batchCatalogue] dispatch '${entry.catalogId}' threw:`, err);
        return { ok: false, reason: String(err) };
    }
}
