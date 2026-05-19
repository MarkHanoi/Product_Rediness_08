/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Data Platform — Template System
 * File:             src/core/templates/TemplateAssignmentStore.ts
 * Contract:         docs/00_Contracts/01-BIM-ENGINE-CORE-CONTRACT.md §3.3, §3.4, §3.8
 *                   docs/00_Contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md
 *
 * Phase 2 — Store Read Path: Eliminate Redundant structuredClone
 *
 * CHANGE SUMMARY:
 *   Removed `structuredClone` from all read paths:
 *     - getForNode()     — returned frozen ref directly
 *     - getByTemplate()  — pushed frozen ref directly (no per-element clone)
 *     - getAll()         — Array.from without map+clone
 *
 * RATIONALE (Contract 01 §3.3 + §3.4):
 *   Every TemplateAssignment is stored as `Object.freeze(structuredClone(a))`
 *   inside assign().  The _byNode Map therefore holds exclusively frozen records.
 *   Returning a clone of a frozen value on every read is redundant: callers
 *   cannot mutate the returned frozen ref.  The clone only allocated extra heap.
 *
 *   getByTemplate() and getAll() both return new arrays, so callers can safely
 *   mutate the array (push/splice) without affecting the internal Map or Set
 *   indexes; only per-element clones are eliminated.
 *
 *   serialize() calls getAll() → passes to JSON.stringify (read-only). No impact.
 *
 *   deserialize() calls assign() for each element, which performs its own
 *   structuredClone at write-time.  No impact.
 *
 *   flagDerived() and clearDerived() call _byNode.get() directly (not through
 *   getForNode()), then produce a new frozen spread — they are unaffected.
 *
 * IMMUTABILITY GUARANTEE PRESERVED:
 *   Write-time: `Object.freeze(structuredClone(a))` inside assign() — unchanged.
 *   Read-time: frozen refs returned directly — callers cannot corrupt store state.
 *
 * Stores TemplateAssignment records with two O(1) lookup indexes:
 *   _byNode     — nodeId → TemplateAssignment
 *   _byTemplate — templateId → Set<nodeId>
 *
 * These dual indexes mean:
 *   getForNode(nodeId)       O(1)  — used by SyncStateEngine on every room/unit update
 *   getByTemplate(templateId) O(k)  — used by DeleteTemplateCommand to unassign all nodes
 *   getUsageCount(templateId) O(1)  — used by ViewTemplateManagerPanel table
 *
 * @see docs/00_PRZYM/PRYZM_DATA_PLATFORM_IMPLEMENTATION_ROADMAP.md § Phase 1-E
 */

import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import type { TemplateAssignment } from './TemplateTypes';

export class TemplateAssignmentStore {
    /** Primary index: nodeId → assignment */
    private readonly _byNode     = new Map<string, TemplateAssignment>();
    /** Reverse index: templateId → Set of nodeIds assigned to that template */
    private readonly _byTemplate = new Map<string, Set<string>>();

    // ── Mutations ───────────────────────────────────────────────────────────────

    /**
     * assign — creates or replaces the assignment for a node.
     * If the node already has an assignment to a different template, the old
     * assignment is removed from the reverse index before the new one is added.
     * Emits StoreEventBus 'create' event. // TODO(TASK-08)
     */
    assign(a: TemplateAssignment): void {
        const prev = this._byNode.get(a.nodeId);
        if (prev) {
            this._removeFromReverseIndex(prev);
        }

        const frozen = Object.freeze(structuredClone(a)) as TemplateAssignment;
        this._byNode.set(a.nodeId, frozen);

        if (!this._byTemplate.has(a.templateId)) {
            this._byTemplate.set(a.templateId, new Set());
        }
        this._byTemplate.get(a.templateId)!.add(a.nodeId);

        storeEventBus.emit({
            elementId:   a.nodeId,
            elementType: 'template-assignment',
            operation:   'create',
            timestamp:   Date.now(),
        });
    }

    /**
     * unassign — removes the assignment for a node.
     * Silent no-op if the node has no assignment.
     * Emits StoreEventBus 'delete' event. // TODO(TASK-08)
     */
    unassign(nodeId: string): void {
        const existing = this._byNode.get(nodeId);
        if (!existing) return;
        this._removeFromReverseIndex(existing);
        this._byNode.delete(nodeId);
        storeEventBus.emit({
            elementId:   nodeId,
            elementType: 'template-assignment',
            operation:   'delete',
            timestamp:   Date.now(),
        });
    }

    /**
     * flagDerived — records a user deviation for a specific requirement key.
     * The assignment's derivations map is updated in place (frozen copy replaced).
     * Does NOT emit StoreEventBus — derivation changes are handled by // TODO(TASK-08)
     * MarkPropertyDerivedCommand which calls SyncStateEngine directly.
     */
    flagDerived(nodeId: string, key: string, reason: string): void {
        const existing = this._byNode.get(nodeId);
        if (!existing) return;
        const updated = Object.freeze({
            ...existing,
            derivations: { ...existing.derivations, [key]: reason },
        }) as TemplateAssignment;
        this._byNode.set(nodeId, updated);
    }

    /**
     * clearDerived — removes a derivation flag for a specific requirement key.
     * Does NOT emit StoreEventBus — same reasoning as flagDerived. // TODO(TASK-08)
     */
    clearDerived(nodeId: string, key: string): void {
        const existing = this._byNode.get(nodeId);
        if (!existing) return;
        const { [key]: _removed, ...rest } = existing.derivations;
        const updated = Object.freeze({
            ...existing,
            derivations: rest,
        }) as TemplateAssignment;
        this._byNode.set(nodeId, updated);
    }

    // ── Queries ─────────────────────────────────────────────────────────────────

    /**
     * getForNode — O(1) lookup of the assignment for a node.
     * Returns undefined if the node has no template assigned.
     * Used by SyncStateEngine on every evaluation.
     *
     * Phase 2 — no clone on read: assignment is already Object.freeze()'d at
     * write-time inside assign() (Contract 01 §3.3).
     */
    getForNode(nodeId: string): TemplateAssignment | undefined {
        return this._byNode.get(nodeId);
    }

    /**
     * getByTemplate — returns all assignments for a given template.
     * Used by DeleteTemplateCommand to unassign all nodes, and by
     * SyncStateEngine.scheduleRecomputeByTemplate().
     *
     * Phase 2 — frozen refs pushed directly; new array allocated so callers
     * can safely mutate the array without affecting internal indexes.
     */
    getByTemplate(templateId: string): TemplateAssignment[] {
        const nodeIds = this._byTemplate.get(templateId);
        if (!nodeIds || nodeIds.size === 0) return [];
        const results: TemplateAssignment[] = [];
        for (const nodeId of nodeIds) {
            const a = this._byNode.get(nodeId);
            if (a) results.push(a);
        }
        return results;
    }

    /**
     * getAll — returns a new array of all frozen assignment refs.
     *
     * Phase 2 — Array.from without per-element clone; elements are already frozen.
     */
    getAll(): TemplateAssignment[] {
        return Array.from(this._byNode.values());
    }

    /**
     * getUsageCount — O(1) count of how many nodes are assigned to a template.
     * Displayed in the ViewTemplateManagerPanel table.
     */
    getUsageCount(templateId: string): number {
        return this._byTemplate.get(templateId)?.size ?? 0;
    }

    // ── Serialisation ───────────────────────────────────────────────────────────

    serialize(): TemplateAssignment[] {
        return this.getAll();
    }

    /**
     * deserialize — rebuilds both indexes from a snapshot array.
     * Uses assign() internally to ensure index consistency.
     */
    deserialize(assignments: TemplateAssignment[]): void {
        this.clear();
        for (const a of assignments) {
            this.assign(a);
        }
    }

    clear(): void {
        this._byNode.clear();
        this._byTemplate.clear();
    }

    // ── Private helpers ─────────────────────────────────────────────────────────

    private _removeFromReverseIndex(a: TemplateAssignment): void {
        const nodeSet = this._byTemplate.get(a.templateId);
        if (nodeSet) {
            nodeSet.delete(a.nodeId);
            if (nodeSet.size === 0) {
                this._byTemplate.delete(a.templateId);
            }
        }
    }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

export const templateAssignmentStore = new TemplateAssignmentStore();

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'templateAssignmentStore',
    clear: () => templateAssignmentStore.clear(),
});
