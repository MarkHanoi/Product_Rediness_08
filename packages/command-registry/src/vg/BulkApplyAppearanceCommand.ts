/**
 * Wave 7 / Stage A2 — VisibilityIntent appearance mass-edit commands.
 *
 * Three commands plus a module-scoped clipboard singleton power the four
 * mass-edit toolbar buttons rendered by `VisibilityIntentPanel`:
 *
 *   1. `BulkApplyAppearanceCommand` — apply one `AppearancePatch` across an
 *      arbitrary set of `(intentId, elementType, state)` cells in a SINGLE
 *      transactional command. One Ctrl+Z reverts the entire batch.
 *   2. `CopyAppearancePatchToClipboardCommand` — capture the appearance at one
 *      cell into a module clipboard so a subsequent paste can replay it.
 *   3. `PasteAppearancePatchFromClipboardCommand` — reuse the clipboard patch
 *      across an arbitrary set of cells (composes a BulkApply internally).
 *
 * All three follow the existing `UpdateVisibilityIntentCommand` template:
 * snapshot the previous `ElementGraphicsRules` per-(intent,elementType), apply
 * via `visibilityIntentStore.update`, restore the snapshot on undo.
 *
 * Master plan ref: docs/03-execution/status/intent-analysis/MASTER-IMPLEMENTATION-PLAN.md §19.14
 *   ("Wave 7 — Mass-Edit Menu") and §19.13 ("Wave 7 — Multi-Select").
 */

import { Command, CommandContext, CommandResult, CommandType, CommandValidationResult, SerializedCommand } from '../types';
import { visibilityIntentStore } from '@pryzm/core-app-model';
import type {
    AppearancePatch,
    ElementGraphicsRules,
    ElementState,
    ElementStateAppearance,
} from '@pryzm/core-app-model';

// ─── Targets ─────────────────────────────────────────────────────────────────

/**
 * Wave 7 / Stage A2 + A3 — every target cell a bulk-appearance command can
 * write to. `intentId` is repeated per-target so future variants can fan out
 * across multiple intents in one transaction (currently the panel always
 * passes a single intentId).
 */
export interface BulkAppearanceTarget {
    intentId:    string;
    elementType: string;
    state:       ElementState;
}

// ─── Module-scoped clipboard singleton ───────────────────────────────────────

let appearancePatchClipboard: AppearancePatch | null = null;

/** Wave 7 / Stage A2 — true iff the appearance clipboard currently holds a patch. */
export function appearancePatchClipboardIsPopulated(): boolean {
    return appearancePatchClipboard !== null;
}

/** Wave 7 / Stage A2 — read-only peek for testing / debug. */
export function peekAppearancePatchClipboard(): AppearancePatch | null {
    return appearancePatchClipboard ? clone(appearancePatchClipboard) : null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

/**
 * Wave 7 / Stage A2 — merge an `AppearancePatch` into an `ElementStateAppearance`.
 *
 * Direct fields (`visible`, `ghostStyle`, `ghostOpacity`, `symbolicRule`) are
 * overwritten when present on the patch. The `line` and `fill` sub-objects are
 * shallow-merged so a patch can specify e.g. only `line.weight` without
 * clobbering `line.colour`. Returns a NEW appearance object — does not mutate.
 */
function mergeAppearancePatch(target: ElementStateAppearance, patch: AppearancePatch): ElementStateAppearance {
    const next: ElementStateAppearance = clone(target);
    if (patch.visible !== undefined) next.visible = patch.visible;
    if (patch.ghostStyle !== undefined) next.ghostStyle = patch.ghostStyle;
    if (patch.ghostOpacity !== undefined) next.ghostOpacity = patch.ghostOpacity;
    if (patch.symbolicRule !== undefined) {
        if (patch.symbolicRule === '' || patch.symbolicRule === null) delete (next as any).symbolicRule;
        else next.symbolicRule = patch.symbolicRule;
    }
    if (patch.line) Object.assign(next.line, patch.line);
    if (patch.fill) Object.assign(next.fill, patch.fill);
    // Wave 8 / Stage S5 — shallow-merge the 3D surface descriptor so a patch
    // can adjust e.g. only `colour` or `opacity` without dropping the other
    // surface3D fields already set on the target appearance. If the target
    // had no surface3D yet, initialise it from the patch directly.
    if (patch.surface3D) {
        if (!next.surface3D) next.surface3D = { ...patch.surface3D };
        else Object.assign(next.surface3D, patch.surface3D);
    }
    return next;
}

/** Group targets by intentId for snapshot/restore atomicity. */
function groupByIntent(targets: ReadonlyArray<BulkAppearanceTarget>): Map<string, BulkAppearanceTarget[]> {
    const out = new Map<string, BulkAppearanceTarget[]>();
    for (const t of targets) {
        if (!out.has(t.intentId)) out.set(t.intentId, []);
        out.get(t.intentId)!.push(t);
    }
    return out;
}

// ─── BulkApplyAppearanceCommand ──────────────────────────────────────────────

/**
 * Wave 7 / Stage A2 — apply a single `AppearancePatch` across one or more
 * (intentId, elementType, state) cells in a single transactional command.
 *
 * Snapshot strategy: one full `ElementGraphicsRules` per-(intentId,elementType)
 * touched. This is the same granularity the resolver consumes, so undo can
 * restore each rule slot independently without recomputing.
 */
export class BulkApplyAppearanceCommand implements Command {
    readonly affectedStores = ['visibility-intent'] as const;
    id = crypto.randomUUID();
    type = CommandType.BULK_APPLY_APPEARANCE;
    timestamp = Date.now();
    targetIds: string[];

    /** intentId → (elementType → previous rule) snapshot for undo. */
    private previousRules = new Map<string, Map<string, ElementGraphicsRules>>();

    constructor(
        private targets: ReadonlyArray<BulkAppearanceTarget>,
        private patch: AppearancePatch,
    ) {
        // Deduplicate intent ids for `targetIds` (used by snapshot scoping).
        this.targetIds = Array.from(new Set(targets.map(t => t.intentId)));
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (this.targets.length === 0) return { ok: false, reason: 'BulkApply requires at least one target.' };
        for (const intentId of this.targetIds) {
            if (!visibilityIntentStore.has(intentId)) return { ok: false, reason: `VisibilityIntent '${intentId}' does not exist.` };
            if (visibilityIntentStore.isSystem(intentId)) return { ok: false, reason: `VisibilityIntent '${intentId}' is a system intent and is read-only.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this.previousRules.clear();
        const grouped = groupByIntent(this.targets);
        const affected: string[] = [];
        for (const [intentId, cells] of grouped) {
            const intent = visibilityIntentStore.get(intentId);
            if (!intent) continue;
            const nextRules: Record<string, ElementGraphicsRules> = clone(intent.elementRules);
            const intentSnap = new Map<string, ElementGraphicsRules>();
            for (const cell of cells) {
                const rule = nextRules[cell.elementType];
                if (!rule) continue;
                if (!intentSnap.has(cell.elementType)) intentSnap.set(cell.elementType, clone(rule));
                const appearance = rule[cell.state];
                if (!appearance) continue;
                rule[cell.state] = mergeAppearancePatch(appearance, this.patch);
            }
            this.previousRules.set(intentId, intentSnap);
            visibilityIntentStore.update(intentId, { elementRules: nextRules });
            affected.push(intentId);
        }
        return { success: true, affectedElementIds: affected };
    }

    undo(_ctx: CommandContext): CommandResult {
        const affected: string[] = [];
        for (const [intentId, snap] of this.previousRules) {
            const intent = visibilityIntentStore.get(intentId);
            if (!intent) continue;
            const restored: Record<string, ElementGraphicsRules> = clone(intent.elementRules);
            for (const [elementType, rule] of snap) restored[elementType] = clone(rule);
            visibilityIntentStore.update(intentId, { elementRules: restored });
            affected.push(intentId);
        }
        return { success: true, affectedElementIds: affected };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { targets: this.targets, patch: this.patch },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}

// ─── CopyAppearancePatchToClipboardCommand ───────────────────────────────────

/**
 * Wave 7 / Stage A2 — capture the appearance at one cell into the clipboard.
 *
 * Capturing every field (visible, line, fill, ghost*, symbolicRule) lets a
 * subsequent paste fully replicate the source cell. Undo restores the
 * previous clipboard contents (including null ⇒ empty), so the toolbar's
 * Paste-enabled state remains consistent with the undo stack.
 */
export class CopyAppearancePatchToClipboardCommand implements Command {
    readonly affectedStores = ['visibility-intent'] as const;
    id = crypto.randomUUID();
    type = CommandType.COPY_APPEARANCE_PATCH;
    timestamp = Date.now();
    targetIds: string[];

    private previousClipboard: AppearancePatch | null = null;

    constructor(
        private intentId: string,
        private elementType: string,
        private state: ElementState,
    ) {
        this.targetIds = [intentId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        const intent = visibilityIntentStore.get(this.intentId);
        if (!intent) return { ok: false, reason: `VisibilityIntent '${this.intentId}' does not exist.` };
        const a = intent.elementRules[this.elementType]?.[this.state];
        if (!a) return { ok: false, reason: `No appearance for ${this.elementType}/${this.state}.` };
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const intent = visibilityIntentStore.get(this.intentId);
        if (!intent) return { success: false, affectedElementIds: [], error: 'Intent gone.' };
        const a = intent.elementRules[this.elementType]?.[this.state];
        if (!a) return { success: false, affectedElementIds: [], error: 'Cell empty.' };
        this.previousClipboard = appearancePatchClipboard ? clone(appearancePatchClipboard) : null;
        const patch: AppearancePatch = {
            visible: a.visible,
            line: { ...a.line },
            fill: { ...a.fill },
        };
        if (a.ghostStyle !== undefined) patch.ghostStyle = a.ghostStyle;
        if (a.ghostOpacity !== undefined) patch.ghostOpacity = a.ghostOpacity;
        if (a.symbolicRule !== undefined) patch.symbolicRule = a.symbolicRule;
        // Wave 8 / Stage S5 — copy 3D surface descriptor so paste lands the
        // 3D appearance alongside the 2D fields.
        if (a.surface3D) patch.surface3D = { ...a.surface3D };
        appearancePatchClipboard = patch;
        return { success: true, affectedElementIds: [this.intentId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        appearancePatchClipboard = this.previousClipboard ? clone(this.previousClipboard) : null;
        return { success: true, affectedElementIds: [this.intentId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { intentId: this.intentId, elementType: this.elementType, state: this.state },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}

// ─── PasteAppearancePatchFromClipboardCommand ────────────────────────────────

/**
 * Wave 7 / Stage A2 — apply the clipboard patch across an arbitrary set of
 * targets. Internally composes a `BulkApplyAppearanceCommand` so that undo /
 * redo behaviour is identical to a fresh bulk-apply.
 */
export class PasteAppearancePatchFromClipboardCommand implements Command {
    readonly affectedStores = ['visibility-intent'] as const;
    id = crypto.randomUUID();
    type = CommandType.PASTE_APPEARANCE_PATCH;
    timestamp = Date.now();
    targetIds: string[];

    private inner: BulkApplyAppearanceCommand | null = null;
    private patchAtPaste: AppearancePatch | null = null;

    constructor(private targets: ReadonlyArray<BulkAppearanceTarget>) {
        this.targetIds = Array.from(new Set(targets.map(t => t.intentId)));
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        if (!appearancePatchClipboard) return { ok: false, reason: 'Appearance clipboard is empty.' };
        if (this.targets.length === 0) return { ok: false, reason: 'Paste requires at least one target.' };
        // Reuse BulkApply gating (intent existence, system-readonly).
        const dryRun = new BulkApplyAppearanceCommand(this.targets, clone(appearancePatchClipboard));
        return dryRun.canExecute(ctx);
    }

    execute(ctx: CommandContext): CommandResult {
        if (!appearancePatchClipboard) return { success: false, affectedElementIds: [], error: 'Clipboard empty.' };
        // Snapshot the patch *at paste time* so subsequent copies don't mutate
        // this command's payload and break undo.
        this.patchAtPaste = clone(appearancePatchClipboard);
        this.inner = new BulkApplyAppearanceCommand(this.targets, this.patchAtPaste);
        return this.inner.execute(ctx);
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.inner) return { success: false, affectedElementIds: [] };
        return this.inner.undo(ctx);
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { targets: this.targets, patchAtPaste: this.patchAtPaste },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}
