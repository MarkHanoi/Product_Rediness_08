/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             Phase 1 (Current)
 * Files Modified:    UpdateCurtainWallCommand.ts
 *
 * Critical Fixes (from CURTAIN-WALL-CONTRACT-AUDIT.md):
 *   #2  Removed direct builder call — store mutation triggers subscriber in main.ts
 *   #7  Full snapshot via store.get() (which returns a deep clone from CurtainWallStore)
 *       Undo restores via store.set() for complete state replacement
 *   #9  Uses context.stores.curtainWallStore (injected), not window.curtainWallStore
 *
 * Fix DW-03 (2026-03-31): Added spatial re-registration when levelId changes.
 *   When updates.levelId differs from snapshot.levelId:
 *     execute() → bimManager.unregisterElement(cwId) → bimManager.registerElement(cwId, newLevelId)
 *     undo()    → bimManager.unregisterElement(cwId) → bimManager.registerElement(cwId, oldLevelId)
 *   Contract references: §02 §1.2, §02 §5, §03-CURTAIN-WALL-COMMAND-PIPELINE-CONTRACT §7
 *
 * Contract References:
 *   §01 §2.2  Full pre-mutation snapshot required; store.get() returns a deep-cloned value
 *   §2.7      No direct builder call in command layer
 *   §3.5      Store is data-only; builder driven by storeEventBus subscriber
 *   §02 §1.2  Spatial registration must always reflect the element's current levelId
 *
 * Impact Assessment:
 *   Other Commands:  None
 *   Builder Impact:  None
 *
 * Risk Level: Low
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { CurtainWallData, migrateToGridSystem } from '@pryzm/geometry-curtain-wall';
// TODO(TASK-08): store-unification debt (ADR-0318) — fix #9 above records that this
// command already takes the injected store rather than window.curtainWallStore; the
// remaining TASK-08 work is retiring the window.* seam globally. Work note relocated
// from the file header, where it read to the C74 §3.4 M-B gate as a module-scaffold
// claim; this command is production, not a stand-in (CO-06, 2026-08-14).

export interface UpdateCurtainWallInput {
    id: string;
    updates: Partial<CurtainWallData>;
}

export class UpdateCurtainWallCommand implements Command {
    readonly affectedStores = ["curtainWall"] as const;
    readonly id = crypto.randomUUID();
    readonly type = CommandType.UPDATE_CURTAIN_WALL;
    readonly timestamp = Date.now();
    readonly targetIds: string[];

    /** §01 §2.2: Full pre-mutation snapshot — deep clone returned by store.get() */
    private snapshot?: CurtainWallData;

    /**
     * §DW-03: Track whether the levelId changed during execute() so undo()
     * can reverse the spatial re-registration correctly.
     */
    private levelIdChanged = false;
    private previousLevelId = '';

    constructor(private input: UpdateCurtainWallInput) {
        this.targetIds = [input.id];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        if (!this.input.id) return { ok: false, reason: 'Missing curtain wall ID' };

        // §Critical #9: Use injected store, not window global
        const store = context.stores.curtainWallStore;
        if (!store) return { ok: false, reason: 'CurtainWallStore not available' };

        if (!store.get(this.input.id)) {
            return { ok: false, reason: `Curtain wall '${this.input.id}' not found` };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const store = context.stores.curtainWallStore;

        // §01 §2.2: Capture full pre-mutation snapshot before any write.
        // store.get() returns a deep clone (Vector3 copied) — safe as snapshot.
        const before = store.get(this.input.id);
        if (!before) return { success: false, affectedElementIds: [], info: ['Curtain wall not found'] };

        this.snapshot = before;

        // §CW-4 / C87 §13.6 — POST + TRANSOM SPACING MUST RE-DERIVE THE GRID, OR THE
        // CONTROL IS AN AFFORDANCE WITHOUT AN IMPLEMENTATION (C84 EI-3).
        //
        // MEASURED, not assumed: `CurtainWallBuilder.ts:1135` and `:1813` both read
        // `cw.gridSystem ?? migrateToGridSystem(length, height, gridXSpacing, gridYSpacing, id)`.
        // The scalar spacing fields are therefore consulted ONLY while `gridSystem` is
        // absent. A wall gets a `gridSystem` the moment anyone adds or removes a grid
        // line (`AddCurtainGridLine.ts:105`) — and `ProjectSerializer.ts:655` persists it —
        // so writing `gridXSpacing` alone would change the record, re-render nothing, and
        // report success. That is precisely the REACHABILITY THEATRE this contract's own
        // verdict names, and it would have been the fourth instance in this family.
        //
        // The re-derivation is folded into the SAME `store.update()` below, so it is one
        // write and one undo entry; `undo()` restores the full pre-mutation snapshot via
        // `store.set()`, which carries the previous `gridSystem` back verbatim (§01 §2.2).
        //
        // ⚠ IT IS LOSSY, AND THE LOSS IS REPORTED RATHER THAN SILENT (C84 EI-6). A
        // re-space regenerates a UNIFORM grid, so hand-inserted lines at non-uniform `t`
        // cease to exist. `CurtainGridEditor` is the surface that mints them, and a user
        // who has used it is exactly the user who must be told. The count of discarded
        // inner lines rides back in `CommandResult.info`.
        const _mergedUpdates: Partial<CurtainWallData> = { ...this.input.updates };
        const _sxNext = _mergedUpdates.gridXSpacing;
        const _syNext = _mergedUpdates.gridYSpacing;
        const _spacingChanged =
            (typeof _sxNext === 'number' && Number.isFinite(_sxNext) && _sxNext > 0 && _sxNext !== before.gridXSpacing) ||
            (typeof _syNext === 'number' && Number.isFinite(_syNext) && _syNext > 0 && _syNext !== before.gridYSpacing);

        const _info: string[] = [];
        if (_spacingChanged) {
            const nextBase = (_mergedUpdates.baseLine ?? before.baseLine) as
                ReadonlyArray<{ x: number; y?: number; z: number }>;
            const a = nextBase?.[0];
            const b = nextBase?.[1];
            const length = a && b
                ? Math.hypot(b.x - a.x, (b.y ?? 0) - (a.y ?? 0), b.z - a.z)
                : 0;
            const height = (_mergedUpdates.height ?? before.height);
            const sx = (typeof _sxNext === 'number' && Number.isFinite(_sxNext) && _sxNext > 0) ? _sxNext : before.gridXSpacing;
            const sy = (typeof _syNext === 'number' && Number.isFinite(_syNext) && _syNext > 0) ? _syNext : before.gridYSpacing;

            // A zero-length baseline cannot produce a grid; REFUSE the re-derivation and
            // say so rather than writing the degenerate `{uLines:[],vLines:[]}` that
            // L-1052 shipped from the sibling path.
            if (length > 1e-6 && height > 1e-6 && sx > 0 && sy > 0) {
                const prevInnerU = (before.gridSystem?.uLines ?? []).filter(l => l.t > 0.001 && l.t < 0.999).length;
                const prevInnerV = (before.gridSystem?.vLines ?? []).filter(l => l.t > 0.001 && l.t < 0.999).length;
                const nextGrid = migrateToGridSystem(length, height, sx, sy, this.input.id);
                const nextInnerU = nextGrid.uLines.filter(l => l.t > 0.001 && l.t < 0.999).length;
                const nextInnerV = nextGrid.vLines.filter(l => l.t > 0.001 && l.t < 0.999).length;
                _mergedUpdates.gridSystem = nextGrid;
                if (before.gridSystem && (prevInnerU !== nextInnerU || prevInnerV !== nextInnerV)) {
                    _info.push(
                        `Re-spacing regenerated a uniform grid on '${this.input.id}': ` +
                        `inner U ${prevInnerU}→${nextInnerU}, inner V ${prevInnerV}→${nextInnerV}. ` +
                        `Hand-inserted grid lines at non-uniform positions were discarded.`,
                    );
                    console.warn('[UpdateCurtainWallCommand] ' + _info[_info.length - 1]);
                }
            } else {
                _info.push(
                    `Spacing written but the grid was NOT re-derived on '${this.input.id}': ` +
                    `length=${length}, height=${height}, spacing=${sx}x${sy} — a degenerate grid was refused.`,
                );
                console.warn('[UpdateCurtainWallCommand] ' + _info[_info.length - 1]);
            }
        }

        // §DW-03 FIX: Detect levelId change BEFORE the store mutation.
        const newLevelId = this.input.updates.levelId;
        this.levelIdChanged = !!(newLevelId && newLevelId !== this.snapshot.levelId);
        this.previousLevelId = this.snapshot.levelId;

        // §2.7: store.update() emits storeEventBus → subscriber in main.ts drives builder
        store.update(this.input.id, _mergedUpdates);

        // §DW-03 FIX: Re-register spatial position when levelId changes.
        // bimManager.unregisterElement removes the wall from the old level index.
        // bimManager.registerElement adds it to the new level index.
        if (this.levelIdChanged && newLevelId) {
            try {
                context.bimManager.unregisterElement(this.input.id);
                context.bimManager.registerElement(this.input.id, newLevelId);
                console.log(`[UpdateCurtainWallCommand] §DW-03: Spatial re-registered '${this.input.id}' from level '${this.previousLevelId}' → '${newLevelId}'`);
            } catch (err) {
                console.error('[UpdateCurtainWallCommand] §DW-03: Spatial re-registration failed:', err);
            }
        }

        return { success: true, affectedElementIds: [this.input.id], ...(_info.length ? { info: _info } : {}) };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.snapshot) return { success: true, affectedElementIds: [] };

        // §01 §2.2: Full state replacement via set() — not partial update
        const store = context.stores.curtainWallStore;
        store.set(this.input.id, this.snapshot);

        // §DW-03 FIX: Reverse the spatial re-registration on undo.
        if (this.levelIdChanged && this.previousLevelId) {
            try {
                context.bimManager.unregisterElement(this.input.id);
                context.bimManager.registerElement(this.input.id, this.previousLevelId);
                console.log(`[UpdateCurtainWallCommand] §DW-03 undo: Spatial restored '${this.input.id}' to level '${this.previousLevelId}'`);
            } catch (err) {
                console.error('[UpdateCurtainWallCommand] §DW-03 undo: Spatial restore failed:', err);
            }
        }

        return { success: true, affectedElementIds: [this.input.id] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   this.input as any,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1
        };
    }
}
