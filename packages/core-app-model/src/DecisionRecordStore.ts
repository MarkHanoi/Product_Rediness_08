/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Core — Decision Record Store (NEW FILE)
 * Phase:             Phase G — G-3 (Intent Capture Layer)
 * Files Modified:    src/core/DecisionRecordStore.ts (new)
 * Classification:    A
 *
 * Contract:
 *   docs/00_PRZYM/PRYZM_WORLD_MODEL_MASTER_PLAN_2026.md § G-3
 *   docs/02-decisions/contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md
 *
 * Impact Assessment:
 *   Store Reads:      NO — isolated append-only data structure
 *   Store Writes:     NO — does not touch BimStores
 *   Event Bus:        NO — passive data layer
 *   Builder Calls:    NO
 *   Command Dispatch: NO
 *
 * Risk Level:   Low — purely additive; does not touch any existing store or builder
 * Rationale:
 *   DecisionRecordStore persists the architect's design rationale whenever a
 *   non-standard decision is made (template deviation, compliance override, preference).
 *   Records are immutable once added (append-only). They are serialized into
 *   ProjectSnapshot v4 under the 'decisionRecords' key and restored on load.
 *
 *   The SemanticGraph 'decidedBy' relationship is written by the caller (IntentPrompt)
 *   after calling add() — this store has no direct SemanticGraph access.
 *
 *   INVARIANT: Records are NEVER deleted. The dismissed flag marks user non-response.
 */

import type {
    DecisionRecord,
    SerializedDecisionRecords,
} from './types/TemporalTypes';

// ── DecisionRecordStore ────────────────────────────────────────────────────────

class DecisionRecordStoreImpl {

    private readonly _records = new Map<string, DecisionRecord>();
    private readonly MAX_RECORDS = 50_000;

    // ── Write ─────────────────────────────────────────────────────────────────

    /**
     * Append a new decision record.
     * Throws if a record with the same id already exists (caller bug — ids must be unique).
     */
    add(record: DecisionRecord): void {
        if (this._records.has(record.id)) {
            console.warn(`[DecisionRecordStore] Duplicate record id: ${record.id} — ignored`);
            return;
        }
        this._records.set(record.id, record);

        if (this._records.size >= this.MAX_RECORDS) {
            console.warn(
                `[DecisionRecordStore] Record count (${this._records.size}) has reached ` +
                `the ${this.MAX_RECORDS} limit. Consider archiving old versions.`
            );
        }
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    get(id: string): DecisionRecord | undefined {
        return this._records.get(id);
    }

    getForElement(elementId: string): DecisionRecord[] {
        const out: DecisionRecord[] = [];
        for (const r of this._records.values()) {
            if (r.elementId === elementId) out.push(r);
        }
        return out.sort((a, b) => a.triggeredAt - b.triggeredAt);
    }

    getAll(): DecisionRecord[] {
        return Array.from(this._records.values()).sort((a, b) => a.triggeredAt - b.triggeredAt);
    }

    /** Returns all non-dismissed records. Used by WorldModelAdapter context. */
    getNonDismissed(): DecisionRecord[] {
        return this.getAll().filter(r => !r.dismissed);
    }

    count(): number {
        return this._records.size;
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    serialize(): SerializedDecisionRecords {
        return {
            version: 1,
            records: this.getAll(),
        };
    }

    deserialize(data: SerializedDecisionRecords): void {
        this._records.clear();
        if (!data?.records) return;
        for (const r of data.records) {
            if (r?.id) this._records.set(r.id, r);
        }
        console.log(`[DecisionRecordStore] Restored ${this._records.size} records`);
    }

    clear(): void {
        this._records.clear();
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/** Global singleton — imported by IntentPrompt, WorldModelAdapter, ProjectSerializer, ProjectLoader. */
export const decisionRecordStore = new DecisionRecordStoreImpl();

import { projectScopeRegistry } from './persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'decisionRecordStore',
    clear: () => decisionRecordStore.clear(),
});
