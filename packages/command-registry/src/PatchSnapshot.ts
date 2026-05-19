/**
 * PatchSnapshot — Phase 9 foundation
 * (PROJECT-LOAD-PERFORMANCE-13-PHASE-IMPLEMENTATION-PLAN.md §10)
 *
 * Pure utility module that gives the eventual Phase 9-extension command
 * migration a SAFE landing zone for replacing `structuredClone`-based
 * snapshots with Immer `produceWithPatches`.
 *
 * SCOPE — Phase 9 conservative (FOUNDATION ONLY):
 *   ✅ Pure functions, no I/O, no consumers in production code (tree-shaken).
 *   ✅ Wraps `produceWithPatches` + `applyPatches` with the typed shape
 *      every command's eventual undo/redo entry will use.
 *   ✅ §SNAPSHOT-COMPLETENESS guard (Contract 01 §2.2.5, §18.2 critique #2)
 *      — addresses the critique's explicit warning that underscore-prefixed
 *      authoritative fields like `WallData._sourceBaseLine` will silently
 *      drop from undo/redo when a per-command Immer producer forgets to
 *      touch them. Each migrated command can call
 *      `validateSnapshotCompleteness(...)` in dev to catch the drop early.
 *   ✅ §REDO-IDEMPOTENCY guard (Contract 01 §2.4.1, §18.2 critique #3)
 *      — addresses the critique that relative-delta commands must capture
 *      ABSOLUTE targets on first execute. `assertCommandCapturesAbsolutes`
 *      is the runtime checker each migrated command can opt into.
 *
 *   ❌ DEFERRED to Phase 9-extension:
 *      • Per-command migration (~80 command files under `src/commands/`).
 *        Each migration is a per-command audit, not a mechanical refactor:
 *        every authoritative field the command's affected store carries
 *        must be reachable from the Immer draft, AND first-execute target
 *        capture must be absolute, not relative.
 *      • CommandManager wiring — `createSnapshot` / `restoreSnapshot`
 *        currently live in `src/commands/CommandManager.ts` L166–L259.
 *        Switching them to a patch-based path is a behavior change to a
 *        hot path AND breaks every store's `clear()/add()` rollback
 *        contract. Phase 9-extension introduces a `__PRYZM_FLAGS__.
 *        COMMAND_PATCHES` flag (default off) and a parallel patch path,
 *        flips the flag per-command-category as migrations land, then
 *        removes the legacy clone code.
 *      • Undo/redo stack shape change — today it stores
 *        `Record<string, any[]>` snapshots; the eventual stack stores
 *        `PatchSnapshotEntry[]`. That's a Contract 01 §3 amendment.
 *
 * RATIONALE: same conservative pattern as Phase 5/6/7/8 — land an auditable,
 * type-safe utility module that exercises zero runtime code paths until a
 * follow-up commit (Phase 9-extension after the Contract 01 §3 amendment)
 * wires CommandManager to the patch path and migrates commands one
 * category at a time (walls first, per spec).
 */

import { produceWithPatches, applyPatches, enablePatches, type Patch } from 'immer';

// `enablePatches()` is also called at the top of CommandManager.ts; calling
// it again is idempotent. We re-call it here so this module is self-contained
// and works correctly if CommandManager has not yet been imported.
enablePatches();

// ─── Patch entry shape (future undo/redo stack element) ────────────────────
//
// One entry per affected store per command. The undo stack will replace its
// current `Record<string, any[]>` snapshot shape with `PatchSnapshotEntry[]`
// once Phase 9-extension lands (Contract 01 §3 amendment required).

export interface PatchSnapshotEntry {
    /** Affected store key — matches Command.affectedStores entries (e.g. 'wall'). */
    storeKey: string;
    /** Patches to apply on REDO. */
    forwardPatches: readonly Patch[];
    /** Patches to apply on UNDO. */
    inversePatches: readonly Patch[];
    /**
     * Capture timestamp (performance.now). Used by the future history-trim
     * heuristic so the oldest patches drop first when memory is tight.
     */
    capturedAt: number;
}

// ─── §SNAPSHOT-COMPLETENESS registry (Contract 01 §2.2.5) ──────────────────
//
// Each entry declares the underscore-prefixed AUTHORITATIVE fields that the
// store's elements carry and that any patch-based snapshot MUST preserve.
// Source-of-truth for the wall fields is `src/elements/walls/WallTypes.ts`
// (L259 `_renderVersion`, L273 `_sourceBaseLine`).
//
// IMPORTANT: `_renderVersion` is process-local — per Phase 7 hash composer
// finding, it resets to 0 on reload and MUST NOT travel across sessions.
// It DOES need to round-trip within an undo/redo cycle so the WallStore's
// dirty-tracking stays consistent. The completeness check distinguishes the
// two via `crossSession`.

export interface SnapshotCompletenessSpec {
    storeKey: string;
    /**
     * Underscore-prefixed authoritative fields that must be reachable from
     * the Immer draft so undo/redo does not silently drop them.
     */
    requiredAuthoritativeFields: readonly {
        name: string;
        /**
         * `true`  = field must survive a full session round-trip
         *           (snapshot save → reload → restore).
         * `false` = field must round-trip WITHIN an undo/redo cycle but
         *           is allowed to be dropped on session save (process-local).
         *           Example: `_renderVersion` — see WallTypes.ts L256-L259.
         */
        crossSession: boolean;
    }[];
}

export const SNAPSHOT_COMPLETENESS_SPECS: readonly SnapshotCompletenessSpec[] = [
    {
        storeKey: 'wall',
        requiredAuthoritativeFields: [
            // §WALL-JOIN-SAVE-FIX (WallTypes.ts L266–L274) — without this,
            // undo after a join adjustment restores the trimmed baseline
            // and the next join resolver run produces different geometry.
            { name: '_sourceBaseLine', crossSession: true },
            // WallStore-owned dirty tracker (WallTypes.ts L255–L259) —
            // round-trips inside undo/redo, dropped on session save.
            { name: '_renderVersion', crossSession: false },
        ],
    },
    // Add per-store entries as Phase 9-extension migrates each command
    // category. The migration sequence (per §10 spec): walls → openings
    // → slabs → stairs → roofs → curtainWalls → furniture → rest.
];

export interface CompletenessReport {
    ok: boolean;
    /** Store key that failed; empty when ok = true. */
    storeKey: string;
    /** Per-element list of missing fields. Empty when ok = true. */
    missing: ReadonlyArray<{ id: string; field: string; crossSession: boolean }>;
}

/**
 * Walks `elements` and reports any underscore-prefixed authoritative field
 * that is structurally missing from an element where the spec requires it.
 *
 * Distinguishes "missing" (the property name is not enumerable on the object)
 * from "explicitly undefined" (the property is present with value `undefined`,
 * which is a valid state for optional fields like `_sourceBaseLine` on a
 * never-joined wall). Only the former is flagged — Immer producers can
 * legitimately leave optional fields unset.
 *
 * Cost: O(elements × required-fields). Safe to run in dev / CI; intended to
 * be GUARDED by a `__PRYZM_DEV__` check in production.
 */
export function validateSnapshotCompleteness(
    storeKey: string,
    elements: readonly unknown[],
): CompletenessReport {
    const spec = SNAPSHOT_COMPLETENESS_SPECS.find(s => s.storeKey === storeKey);
    if (!spec) return { ok: true, storeKey, missing: [] };

    const missing: Array<{ id: string; field: string; crossSession: boolean }> = [];
    for (const el of elements) {
        if (el === null || typeof el !== 'object') continue;
        const obj = el as Record<string, unknown>;
        for (const req of spec.requiredAuthoritativeFields) {
            // We only flag truly absent properties — `hasOwnProperty: false`.
            // An explicitly-set `undefined` is acceptable for optional fields.
            if (!Object.prototype.hasOwnProperty.call(obj, req.name)) {
                missing.push({
                    id: typeof obj.id === 'string' ? obj.id : '<unknown>',
                    field: req.name,
                    crossSession: req.crossSession,
                });
            }
        }
    }

    return { ok: missing.length === 0, storeKey, missing };
}

// ─── §REDO-IDEMPOTENCY guard (Contract 01 §2.4.1) ──────────────────────────
//
// A relative-delta command (e.g. "move wall by +500mm") must capture the
// ABSOLUTE target value on first execute, otherwise redo applied to a
// state where the wall already moved produces double the delta. The
// classic example is `UpdateWallHeightCommand` — it stores `newHeight`
// (absolute) on construction, not `+deltaHeight`.
//
// `assertCommandCapturesAbsolutes` is a runtime check each migrated
// command can opt into during the Phase 9-extension audit.

export interface AbsoluteCaptureSpec {
    /** Field name on the command instance that holds the absolute target. */
    fieldName: string;
    /**
     * Predicate that returns `true` when the field value is a fully-resolved
     * absolute target (not a delta). For numbers, typically `v => Number.isFinite(v)`;
     * for vectors, a richer check.
     */
    isAbsolute: (value: unknown) => boolean;
}

/**
 * Returns `true` when every spec is satisfied — the command has captured
 * absolute targets on every required field. Returns `false` and logs a
 * `console.warn` listing the failing fields when any spec fails. The
 * intended call site is the FIRST line of `command.execute()` so a
 * delta-leak surfaces in the dev console immediately.
 *
 * Production usage should gate on `__PRYZM_DEV__` to avoid the per-command
 * overhead in shipped builds.
 */
export function assertCommandCapturesAbsolutes(
    commandName: string,
    command: Record<string, unknown>,
    specs: readonly AbsoluteCaptureSpec[],
): boolean {
    const fails: string[] = [];
    for (const spec of specs) {
        if (!Object.prototype.hasOwnProperty.call(command, spec.fieldName)) {
            fails.push(`${spec.fieldName} (missing)`);
            continue;
        }
        const value = command[spec.fieldName];
        if (!spec.isAbsolute(value)) {
            fails.push(`${spec.fieldName} (not absolute)`);
        }
    }
    if (fails.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
            `[PatchSnapshot] §REDO-IDEMPOTENCY violation in ${commandName}: ` +
            `the following fields must hold ABSOLUTE targets (not deltas) at execute time: ` +
            fails.join(', '),
        );
        return false;
    }
    return true;
}

// ─── Patch capture (the eventual replacement for createSnapshot) ───────────

/**
 * Result of running a producer against an initial slice. The two patch
 * arrays form the undo/redo unit — `forwardPatches` re-applies the producer's
 * effect, `inversePatches` undoes it.
 */
export interface PatchCapture<T> {
    result: T;
    forwardPatches: readonly Patch[];
    inversePatches: readonly Patch[];
}

/**
 * Pure: takes an initial value (typically `store.getAll()` or a single
 * element) and a producer that mutates the draft, returns the post-state
 * plus the forward/inverse patches. The caller hands forward+inverse to
 * the undo stack; the result is what the store should be set to.
 *
 * Per §SNAPSHOT-COMPLETENESS, the producer MUST touch every authoritative
 * underscore-prefixed field the store's elements carry — otherwise the
 * inverse patch will not include those fields and undo will silently drop
 * them. Use `validateSnapshotCompleteness` against the result in dev.
 */
export function producePatchedSlice<T>(
    initial: T,
    producer: (draft: T) => void,
): PatchCapture<T> {
    // immer's PatchesTuple is [T, Patch[], Patch[]] but its TS surface in this
    // project's config does not expose Symbol.iterator on the return value, so
    // we read the tuple positionally.
    const tuple = produceWithPatches(initial as any, producer as any) as unknown as [unknown, Patch[], Patch[]];
    return {
        result: tuple[0] as T,
        forwardPatches: tuple[1],
        inversePatches: tuple[2],
    };
}

/**
 * Applies `patches` to `initial` via Immer's structural-sharing applier.
 * Used on UNDO/REDO: pass the inverse or forward patches respectively.
 */
export function applyPatchesToSlice<T>(initial: T, patches: readonly Patch[]): T {
    return applyPatches(initial as any, patches as Patch[]) as T;
}

// ─── Convenience: build a future undo-stack entry ──────────────────────────

export function buildPatchSnapshotEntry<T>(
    storeKey: string,
    capture: PatchCapture<T>,
): PatchSnapshotEntry {
    return {
        storeKey,
        forwardPatches: capture.forwardPatches,
        inversePatches: capture.inversePatches,
        capturedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    };
}
