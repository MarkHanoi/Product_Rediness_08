/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Data Platform — Element Codes
 * File:             src/core/ElementCodeStore.ts
 * Contract:         docs/02-decisions/contracts/01-BIM-ENGINE-CORE-CONTRACT.md §3.8
 *                   docs/02-decisions/contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md
 *
 * Assigns permanent, human-readable codes to every BIM element on creation.
 * Codes are prefix + zero-padded number: "DO001", "WA042", "CO007", etc.
 *
 * MONOTONIC COUNTER RULE (from Audit §3.3):
 *   Counters are NEVER decremented when an element is deleted.
 *   releaseCode() removes the element→code mapping but leaves the counter at
 *   its current value. The next element of that type gets a higher number.
 *   Codes are permanent identifiers, not sequence numbers. Gaps are acceptable.
 *
 * AUTO-ASSIGNMENT WIRING:
 *   EngineBootstrap subscribes to StoreEventBus and calls: // TODO(TASK-08)
 *     assignCode(event.elementId, event.elementType)  on operation='create'
 *     releaseCode(event.elementId)                    on operation='delete'
 *   The store itself emits 'element-code' create events so SyncStateEngine
 *   can skip them (they are not hierarchy nodes).
 *
 * @see docs/00_PRZYM/PRYZM_DATA_PLATFORM_IMPLEMENTATION_ROADMAP.md § Phase 1-F
 */

import { storeEventBus } from './StoreEventBus.js'; // TODO(TASK-08)

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ElementCode {
    elementId:   string;
    elementType: string;
    /** Full code string, e.g. "DO001", "WA042". */
    code:        string;
    /** Two-letter prefix, e.g. "DO", "WA". */
    prefix:      string;
    /** The numeric part, e.g. 1, 42. Used for sorting and display. */
    number:      number;
}

// ── Prefix map ─────────────────────────────────────────────────────────────────

/**
 * TYPE_PREFIXES — maps elementType strings (from StoreEventBus events) to // TODO(TASK-08)
 * their 2-letter code prefix.
 *
 * These match the elementType values emitted by all existing element stores.
 * If an elementType is not listed here, no code is assigned (unknown type).
 */
export const TYPE_PREFIXES: Record<string, string> = {
    door:        'DO',
    window:      'WI',
    wall:        'WA',
    slab:        'SL',
    column:      'CO',
    beam:        'BE',
    stair:       'ST',
    roof:        'RF',
    furniture:   'FU',
    plumbing:    'PL',
    handrail:    'HR',
    curtainwall: 'CW',
    room:        'RM',
    ceiling:     'CE',
    floor:       'FL',
    opening:     'OP',
};

// ── Store ──────────────────────────────────────────────────────────────────────

export class ElementCodeStore {
    /** Primary lookup: elementId → ElementCode */
    private readonly _byElement  = new Map<string, ElementCode>();
    /** Counter per prefix — monotonically increasing, never decremented */
    private readonly _counters   = new Map<string, number>();

    // ── Mutations ───────────────────────────────────────────────────────────────

    /**
     * assignCode — assigns a code to an element.
     * Idempotent: if the element already has a code, returns the existing code.
     * Returns empty string for unknown element types (not in TYPE_PREFIXES).
     * Emits StoreEventBus 'create' with elementType 'element-code'. // TODO(TASK-08)
     */
    assignCode(elementId: string, elementType: string): string {
        const existing = this._byElement.get(elementId);
        if (existing) return existing.code;

        const prefix = TYPE_PREFIXES[elementType];
        if (!prefix) {
            // Unknown element type — no code assigned. Not an error.
            return '';
        }

        const current = this._counters.get(prefix) ?? 0;
        const number  = current + 1;
        this._counters.set(prefix, number);

        const code = `${prefix}${String(number).padStart(3, '0')}`;
        const ec: ElementCode = Object.freeze({ elementId, elementType, code, prefix, number });
        this._byElement.set(elementId, ec);

        storeEventBus.emit({
            elementId,
            elementType: 'element-code',
            operation:   'create',
            timestamp:   Date.now(),
        });

        return code;
    }

    /**
     * releaseCode — marks an element as deleted.
     * Removes the element→code mapping.
     * DOES NOT decrement the counter — codes are permanent identifiers.
     * See MONOTONIC COUNTER RULE in file header.
     */
    releaseCode(elementId: string): void {
        this._byElement.delete(elementId);
    }

    // ── Queries ─────────────────────────────────────────────────────────────────

    getCode(elementId: string): ElementCode | undefined {
        return this._byElement.get(elementId);
    }

    /** getByPrefix — all codes with the given prefix, sorted by number ascending. */
    getByPrefix(prefix: string): ElementCode[] {
        return Array.from(this._byElement.values())
            .filter(c => c.prefix === prefix)
            .sort((a, b) => a.number - b.number);
    }

    getAll(): ElementCode[] {
        return Array.from(this._byElement.values())
            .sort((a, b) => a.code.localeCompare(b.code));
    }

    has(elementId: string): boolean {
        return this._byElement.has(elementId);
    }

    count(): number {
        return this._byElement.size;
    }

    // ── Serialisation ───────────────────────────────────────────────────────────

    /**
     * serialize — returns codes array AND counter state.
     * Both must be persisted: codes so existing elements keep their codes on
     * reload, counters so the next new element gets a fresh incremented code.
     */
    serialize(): { codes: ElementCode[]; counters: Record<string, number> } {
        return {
            codes:    this.getAll(),
            counters: Object.fromEntries(this._counters),
        };
    }

    /**
     * deserialize — restores both the codes map and the counter state.
     * Called by ProjectLoader after MigrationEngine; does NOT emit StoreEventBus. // TODO(TASK-08)
     */
    deserialize(data: { codes: ElementCode[]; counters: Record<string, number> }): void {
        this.clear();
        for (const c of data.codes) {
            this._byElement.set(c.elementId, Object.freeze(c));
        }
        for (const [prefix, n] of Object.entries(data.counters)) {
            this._counters.set(prefix, n);
        }
    }

    clear(): void {
        this._byElement.clear();
        this._counters.clear();
    }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

export const elementCodeStore = new ElementCodeStore();

import { projectScopeRegistry } from './persistence/ProjectScopeRegistry.js';
projectScopeRegistry.register({
    scopeName: 'elementCodeStore',
    clear: () => elementCodeStore.clear(),
});
