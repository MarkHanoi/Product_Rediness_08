/**
 * elementTypeAuthoringAdapters — §FEAT-ELEMENT-TYPE-AUTHORING (C65)
 * =================================================================
 *
 * The per-family STORE ADAPTERS behind the `elementType.create / duplicate /
 * update / delete` bus commands. Extracted from `initBusHandlers.ts` when door
 * and window joined wall as authorable families, for two reasons:
 *
 *  1. **C65 §3.5 — one abstraction, not N stores.** The five different mutating
 *     vocabularies found across the repo's type stores (wall's `add()` returns
 *     the created record and mints the id; door/window's `add()` returns void
 *     and demands a full record with id + metadata; `isBuiltIn` is a METHOD on
 *     wall and a FIELD on door/window) are normalised HERE, once. The command
 *     handler, the undo wiring and the UI all see one narrow shape.
 *
 *  2. **Testability.** Inside `initBusHandlers` the adapters were closures over
 *     a 2,000-line registration function and untestable. Here they are plain
 *     exported functions with their own spec
 *     (`__tests__/elementTypeAuthoringAdapters.spec.ts`).
 *
 * DRAFT-VALIDATION IS PER-FAMILY, BY DESIGN. The old `_validateTypeAuthoring`
 * checked `draft.layers` in shared code — which is C65 §3.5's
 * "`if (family === 'wall')` in shared code" defect the moment a non-layer
 * family arrives. Each adapter now validates its own family's draft shape.
 *
 * A family is added by adding an adapter AND its `ElementTypeAuthoringRegistry`
 * declaration — and ONLY after its custom types are proven to round-trip the
 * snapshot (C05) and its store is registered with `ProjectScopeRegistry` (C13).
 *
 * P6: this module is called ONLY from the `elementType.*` bus bridges in
 * `initBusHandlers.ts` — never from UI code.
 * P8: `performElementTypeAuthoring` (the one exported function that mutates)
 * opens an OTel span per authoring operation, in addition to the bus's own
 * `pryzm.command.execute` span.
 */

import { trace } from '@opentelemetry/api';
import { doorSystemTypeStore } from '@pryzm/geometry-door';
import { windowSystemTypeStore } from '@pryzm/geometry-window';
// §OUTLINE81 (SPEC-WINDOW-CUSTOM-OUTLINE D6) — THE one ring predicate, from the pure subpath
// (L-11261 import discipline). Draft validation surfaces the refusal's OWN reason text.
import { resolveCustomOutlineInput, validateCustomOutline } from '@pryzm/geometry-wall/opening-profile';

const _tracer = trace.getTracer('pryzm-engine');

/** The narrow, family-agnostic shape the command layer works against. */
export interface TypeStoreAdapter {
    family: string;
    getAll(): any[];
    getById(id: string): any | undefined;
    /** Normalised — a method regardless of whether the store spells it as one. */
    isBuiltIn(id: string): boolean;
    /** Family-specific draft validation (C65 §3.5). Error string, or null when valid. */
    validateDraft(draft: any): string | null;
    /**
     * Creates the record from a draft. The ADAPTER mints identity (id, metadata,
     * isBuiltIn:false) so a duplicate can never alias its source. Returns the
     * created record (needed for undo and for the UI read-back).
     */
    add(draft: any): any;
    /** Applies a draft as a patch to an existing custom type. */
    update(id: string, draft: any): void;
    /**
     * Restores a previously captured record WITH ITS ORIGINAL ID (undo of a
     * delete / pre-edit state) — every element still pointing at that id
     * resolves again instead of dangling (C65 §3.4).
     */
    restore(record: any): void;
    remove(id: string): void;
}

// ─── wall ────────────────────────────────────────────────────────────────────
// The wall store is reached via the legacy window global (TODO(E.wall.S)); it is
// lazily resolved because the store is dynamically imported during boot.

function wallAdapter(): TypeStoreAdapter | null {
    const s = window.wallSystemTypeStore as any;
    if (!s) return null;
    const patchOf = (draft: any) => ({
        name:        draft.name,
        description: draft.description,
        layers:      draft.layers,
        // L-285 — carried explicitly; `undefined` stays undefined ("does not say").
        ...(draft.function !== undefined ? { function: draft.function } : {}),
    });
    return {
        family:    'wall',
        getAll:    () => s.getAll(),
        getById:   (id) => s.getById(id),
        isBuiltIn: (id) => s.isBuiltIn(id),
        validateDraft: (d) => {
            if (!d || typeof d !== 'object')       return 'draft is required';
            if (!d.name || !String(d.name).trim()) return 'draft.name is required';
            if (!Array.isArray(d.layers) || d.layers.length === 0) return 'draft.layers must be a non-empty array';
            const total = d.layers.reduce((sum: number, l: any) => sum + (Number(l?.thickness) || 0), 0);
            if (!(total > 0)) return 'draft layers have no thickness';
            return null;
        },
        add:     (draft) => s.add(patchOf(draft)),
        update:  (id, draft) => s.update(id, patchOf(draft)),
        // `add` honours an explicit id (§M-B1), so restore keeps the SAME id.
        restore: (record) => s.add(record),
        remove:  (id) => s.remove(id),
    };
}

// ─── door / window (hosted openings) ─────────────────────────────────────────
// One factory for both: the stores are the same class shape (geometry-door /
// geometry-window siblings), differing only in which FINISH SLOTS a type must
// carry. A draft is the WHOLE record minus identity (id / isBuiltIn / metadata):
// the UI builds it by deep-copying the source type, so duplicate carries every
// ride-along field (dimensions, defaultSegments, sidelight, tags, ifcTypeName)
// without this module naming any of them — C65 §3.7's deep copy by construction.

interface HostedTypeStore {
    getAll(): any[];
    getById(id: string): any | undefined;
    add(type: any): void;
    update(id: string, patch: any): void;
    remove(id: string): void;
}

/** Strips the identity fields a draft must never smuggle into a new record. */
function stripIdentity(draft: Record<string, any>): Record<string, any> {
    const { id: _id, isBuiltIn: _b, metadata: _m, ...rest } = draft;
    return rest;
}

function hostedAdapter(
    family: string,
    store: HostedTypeStore,
    idPrefix: string,
    requiredFinishKeys: readonly string[],
    // §OUTLINE81 (D6/D12) — a capability PARAMETER, not a family branch (C65 §3.5): whether
    // this family's type may carry a `customOutline` shape template. Doors do not (D12).
    supportsOutlineTemplate = false,
): TypeStoreAdapter {
    return {
        family,
        getAll:    () => store.getAll(),
        getById:   (id) => store.getById(id),
        // isBuiltIn is a FIELD on these stores; normalised to the method shape here.
        isBuiltIn: (id) => !!store.getById(id)?.isBuiltIn,
        validateDraft: (d) => {
            if (!d || typeof d !== 'object')       return 'draft is required';
            if (!d.name || !String(d.name).trim()) return 'draft.name is required';
            for (const key of requiredFinishKeys) {
                const finish = d[key];
                if (!finish || typeof finish !== 'object' || typeof finish.materialColor !== 'string') {
                    return `draft.${key} must declare a materialColor`;
                }
            }
            if (d.glazingOpacity !== undefined &&
                (typeof d.glazingOpacity !== 'number' || d.glazingOpacity < 0 || d.glazingOpacity > 1)) {
                return 'draft.glazingOpacity must be a number between 0 and 1';
            }
            // §OUTLINE81 (D6) — the shape template is validated by THE one predicate, and the
            // refusal is the predicate's OWN reason text (C16 CA-18) — never re-derived here.
            if (d.customOutline !== undefined) {
                if (!supportsOutlineTemplate) {
                    return `a ${family} type cannot carry a customOutline template — free-form ` +
                        `outlines are window-only (SPEC-WINDOW-CUSTOM-OUTLINE D12)`;
                }
                const refusal = validateCustomOutline(resolveCustomOutlineInput(d.customOutline));
                if (refusal) return `draft.customOutline is not a valid outline: ${refusal.reason}`;
            }
            return null;
        },
        add: (draft) => {
            const now = Date.now();
            const record = {
                ...structuredClone(stripIdentity(draft)),
                // The ADAPTER mints identity — a duplicate can never alias its source.
                id:        `${idPrefix}-${now}-${Math.floor(Math.random() * 1e6)}`,
                category:  draft.category ?? 'custom',
                isBuiltIn: false,
                metadata:  { createdAt: now, modifiedAt: now, createdBy: 'user', version: 1 },
            };
            store.add(record);
            return record;
        },
        update:  (id, draft) => store.update(id, structuredClone(stripIdentity(draft))),
        // These stores' `add` accepts a full record with its own id → same-id restore.
        restore: (record) => store.add(structuredClone(record)),
        remove:  (id) => store.remove(id),
    };
}

// ─── The table ───────────────────────────────────────────────────────────────
// Must agree with `ElementTypeAuthoringRegistry` (apps/editor/src/ui/property-panel);
// the authoring coverage spec asserts the two stay in step.

const ADAPTERS: Record<string, () => TypeStoreAdapter | null> = {
    wall:   wallAdapter,
    door:   () => hostedAdapter('door',   doorSystemTypeStore   as HostedTypeStore, 'dt-custom', ['frameFinish', 'leafFinish']),
    window: () => hostedAdapter('window', windowSystemTypeStore as HostedTypeStore, 'wt-custom', ['frameFinish', 'sillFinish'], /* supportsOutlineTemplate (D6) */ true),
};

/** The adapter for a family, or null when the family is not authorable. */
export function resolveTypeStoreAdapter(family: unknown): TypeStoreAdapter | null {
    const f = String(family ?? '').toLowerCase();
    return ADAPTERS[f]?.() ?? null;
}

export type ElementTypeAuthoringMode = 'create' | 'duplicate' | 'update' | 'delete';

/**
 * CA-3 — validate BEFORE any mutation. Rejects an undeclared family outright
 * rather than silently doing nothing, and refuses to touch built-ins: they are
 * factory data reconstructed from code on every boot (C05), so an edit could
 * never persist and would silently vanish on reload.
 */
export function validateElementTypeCommand(cmd: any, mode: ElementTypeAuthoringMode): string | null {
    if (!cmd?.family) return 'family is required';
    const adapter = resolveTypeStoreAdapter(cmd.family);
    if (!adapter) {
        return `'${cmd.family}' types cannot be authored — no authoring adapter is declared for that family`;
    }
    // Built-in guard runs for BOTH update and delete. (The pre-extraction code
    // early-returned before this check for delete, so deleting a built-in only
    // failed later, at the store throw.)
    if (mode === 'update' || mode === 'delete') {
        if (!cmd.typeId) return 'typeId is required';
        if (adapter.isBuiltIn(cmd.typeId)) {
            return 'built-in types cannot be edited or deleted — duplicate it first';
        }
    }
    if (mode === 'delete') return null;
    return adapter.validateDraft(cmd.draft);
}

export interface ElementTypeAuthoringResult {
    adapter: TypeStoreAdapter;
    /** The freshly created record (create / duplicate modes). */
    created?: any;
    /** The pre-mutation record (update / delete modes), for the undo inverse. */
    previous?: any;
}

/**
 * Performs the authoring mutation for a validated command and reports what the
 * undo inverse needs. Undo REGISTRATION stays with the caller (initBusHandlers
 * owns the commandManager); this function owns only the store mutation.
 *
 * P8 — one OTel span per authoring operation.
 */
export function performElementTypeAuthoring(
    mode: ElementTypeAuthoringMode,
    cmd: any,
): ElementTypeAuthoringResult | null {
    const adapter = resolveTypeStoreAdapter(cmd.family);
    if (!adapter) return null;   // unreachable — validate() already rejected it.

    const span = _tracer.startSpan('pryzm.elementType.author', {
        attributes: { 'pryzm.family': adapter.family, 'pryzm.mode': mode },
    });
    try {
        if (mode === 'delete') {
            const previous = structuredClone(adapter.getById(cmd.typeId));
            adapter.remove(cmd.typeId);
            return { adapter, previous };
        }
        if (mode === 'update') {
            const previous = structuredClone(adapter.getById(cmd.typeId));
            adapter.update(cmd.typeId, cmd.draft);
            return { adapter, previous };
        }
        // CREATE and DUPLICATE differ ONLY in where the draft came from (the UI
        // deep-copies the source type for a duplicate and pre-names it). Both mint
        // a fresh id in the adapter, so a duplicate can never alias its source.
        const created = adapter.add(cmd.draft);
        span.setAttribute('pryzm.typeId', String(created?.id ?? ''));
        return { adapter, created };
    } finally {
        span.end();
    }
}
