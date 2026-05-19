/**
 * CreateDetailViewCommand — DOC-1.12
 *
 * Creates a new ViewDefinition of type 'detail'.
 *
 * A detail view is an enlarged region of a parent plan or section view,
 * defined by a world-space XZ crop region. EdgeProjectorService uses
 * `spatial.cropRegion` as a geometry pre-filter so that only elements
 * inside the crop window appear in the detail view linework.
 *
 * Contract compliance:
 *   §01 §2     — Command-first mutation; no direct store call from UI or tool
 *   §01 §2.7   — Does NOT call builders; no Three.js scene access
 *   §02 §5     — cropRegion is stored as a plain serialisable object; never
 *                a THREE.Box3 or THREE.Vector3 in any store
 *   §03 §1.1   — ViewDefinition schema additive; 'detail' viewType already
 *                in the ViewType union; parentViewId already optional
 *   §07        — No server routes; client-side only
 *
 * Undo: deletes the created ViewDefinition from ViewDefinitionStore.
 * The VGGovernanceStore.ensureView() call mirrors the pattern established in
 * CreateViewDefinitionCommand — idempotent and safe to leave on undo.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { viewDefinitionStore } from '@pryzm/core-app-model';
// VIEW-SYSTEM-AUDIT-2026 F4.1-B — static import (parallels CreateViewDefinitionCommand).
import { vgGovernanceStore } from '@pryzm/core-app-model';
import type { ViewSpatialContext } from '@pryzm/core-app-model';

// ── Params ────────────────────────────────────────────────────────────────────

export interface CreateDetailViewParams {
    /** Stable unique ID for the new detail ViewDefinition. */
    id:           string;
    /** Display name shown in the View Browser and title block. */
    name:         string;
    /** Host view this detail crops from — populates `parentViewId`. */
    parentViewId: string;
    /**
     * World-space XZ crop window defining the detail region.
     * Stored on `spatial.cropRegion` and passed to EdgeProjectorService.
     * §02 §5 — plain numbers, never a THREE object.
     */
    cropRegion: {
        minX: number;
        minZ: number;
        maxX: number;
        maxZ: number;
    };
    /** Drawing scale denominator, e.g. 20 = 1:20. */
    scale?: number;
    /** Optional level context inherited from the parent view. */
    levelId?: string;
    /** Optional free-text creation attribution. */
    createdBy?: string;
}

// ── Command ───────────────────────────────────────────────────────────────────

export class CreateDetailViewCommand implements Command {
    /** VIEW-SYSTEM-AUDIT-2026 F4.4 — touches viewDefinitionStore + vgGovernanceStore (ensureView bridge). */
    readonly affectedStores = ['view', 'vg-governance'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.CREATE_DETAIL_VIEW;
    timestamp = Date.now();
    targetIds: string[];

    constructor(private readonly params: CreateDetailViewParams) {
        this.targetIds = [params.id];
    }

    // ── Validation ────────────────────────────────────────────────────────────

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this.params.id?.trim()) {
            return { ok: false, reason: 'CreateDetailViewCommand: id must be a non-empty string.' };
        }
        if (!this.params.name?.trim()) {
            return { ok: false, reason: 'CreateDetailViewCommand: name must be a non-empty string.' };
        }
        if (!this.params.parentViewId?.trim()) {
            return { ok: false, reason: 'CreateDetailViewCommand: parentViewId must be a non-empty string.' };
        }
        if (viewDefinitionStore.has(this.params.id)) {
            return { ok: false, reason: `CreateDetailViewCommand: a view with id '${this.params.id}' already exists.` };
        }
        const { cropRegion } = this.params;
        if (
            !cropRegion ||
            cropRegion.maxX <= cropRegion.minX ||
            cropRegion.maxZ <= cropRegion.minZ
        ) {
            return {
                ok:     false,
                reason: 'CreateDetailViewCommand: cropRegion must have positive width and depth (maxX > minX, maxZ > minZ).',
            };
        }
        return { ok: true };
    }

    // ── Execute ───────────────────────────────────────────────────────────────

    execute(_ctx: CommandContext): CommandResult {
        const spatial: ViewSpatialContext = {
            levelId:           this.params.levelId,
            cropRegion:        this.params.cropRegion,
            projectionDirection: { x: 0, y: -1, z: 0 }, // plan direction (detail views look down)
        };

        const view = viewDefinitionStore.create({
            id:           this.params.id,
            name:         this.params.name,
            viewType:     'detail',
            parentViewId: this.params.parentViewId,
            discipline:   'architecture',
            spatial,
            temporal:     {},
            createdBy:    this.params.createdBy,
        });

        if (!view) {
            return {
                success:            false,
                affectedElementIds: [],
                error:              'CreateDetailViewCommand: ViewDefinitionStore.create() returned null.',
            };
        }

        // Mirror the VGGovernanceStore bridge established by CreateViewDefinitionCommand.
        // F4.1-B — direct static import; no longer relies on a runtime window bridge.
        vgGovernanceStore.ensureView(this.params.id, this.params.name, 'model-default');

        console.log(
            `[CreateDetailViewCommand] Created detail view id=${this.params.id} ` +
            `parentViewId=${this.params.parentViewId} ` +
            `crop=[${this.params.cropRegion.minX.toFixed(2)},${this.params.cropRegion.minZ.toFixed(2)}` +
            ` → ${this.params.cropRegion.maxX.toFixed(2)},${this.params.cropRegion.maxZ.toFixed(2)}]`,
        );

        return { success: true, affectedElementIds: [this.params.id] };
    }

    // ── Undo ──────────────────────────────────────────────────────────────────

    undo(_ctx: CommandContext): CommandResult {
        const ok = viewDefinitionStore.delete(this.params.id);
        console.log(`[CreateDetailViewCommand] Undo — deleted detail view id=${this.params.id} ok=${ok}`);
        return { success: ok, affectedElementIds: [this.params.id] };
    }

    // ── Serialise ─────────────────────────────────────────────────────────────

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { params: this.params },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
