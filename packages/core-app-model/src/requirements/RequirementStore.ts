/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Semantic Model (Store layer — new Class A store)
 * File:             src/core/requirements/RequirementStore.ts
 * Contract:         01-BIM-ENGINE-CORE-CONTRACT §3.1–§3.3, §3.8
 *
 * P9-W6 (2026-05-10) — lifted to packages/core-app-model/src/requirements/.
 * All imports resolve within the package:
 *   StoreEventBus, StoreRegistry — packages/core-app-model/src/ // TODO(TASK-08)
 *   RequirementTypes, RequirementSchema — ./  (being migrated together)
 *   ProjectScopeRegistry — ../persistence/ (already in packages)
 *
 * Single source of truth for all RoomRequirement records.
 * Follows the same immutable-store pattern as RoomStore, WallStore, etc.
 *
 * Contract compliance:
 *   - ALL writes go through Commands — this store is never mutated by UI
 *   - Every record is structuredClone()'d on write (immutable snapshot)
 *   - Emits StoreEventBus events + DOM CustomEvents for downstream consumers // TODO(TASK-08)
 *   - No THREE.js imports, no builder calls, no elementRegistry access
 *   - BimStore interface satisfied (getAll, has, get) for StoreRegistry lookup
 *
 * Registered under type key 'RoomRequirement' in StoreRegistry at app boot.
 */

import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import { storeRegistry } from '../StoreRegistry';
import { DOMEventBus } from '@pryzm/event-bus';

const _bus = new DOMEventBus();
import {
  RoomRequirement,
  RequirementParamUpdate,
} from './RequirementTypes';
import {
  RoomRequirementAddSchema,
  RoomRequirementUpdateSchema,
  formatRequirementZodError,
} from './RequirementSchema';

export class RequirementStore {
  private _records = new Map<string, Readonly<RoomRequirement>>();

  // ── Read API ───────────────────────────────────────────────────────────────

  get(id: string): Readonly<RoomRequirement> | undefined {
    return this._records.get(id);
  }

  has(id: string): boolean {
    return this._records.has(id);
  }

  getAll(): Readonly<RoomRequirement>[] {
    return Array.from(this._records.values());
  }

  getByRoomId(roomId: string): Readonly<RoomRequirement>[] {
    return this.getAll().filter(r => r.roomId === roomId);
  }

  getByLevelId(levelId: string): Readonly<RoomRequirement>[] {
    return this.getAll().filter(r => r.levelId === levelId);
  }

  count(): number {
    return this._records.size;
  }

  // ── Write API (called only from Commands — never directly from UI) ──────────

  /**
   * Add a new RoomRequirement. Zod-validates before any mutation.
   * Throws if id already exists — use update() for mutations.
   */
  add(requirement: RoomRequirement): void {
    if (this._records.has(requirement.id)) {
      throw new Error(
        `[RequirementStore] add() — id '${requirement.id}' already exists. Use update().`
      );
    }

    const parsed = RoomRequirementAddSchema.safeParse(requirement);
    if (!parsed.success) {
      throw new Error(
        `[RequirementStore] add() — validation failed: ${formatRequirementZodError(parsed.error)}`
      );
    }

    const frozen = Object.freeze(structuredClone(requirement));
    this._records.set(requirement.id, frozen);

    storeEventBus.emit({
      elementId:   requirement.id,
      elementType: 'RoomRequirement',
      operation:   'create',
      timestamp:   Date.now(),
    });

    _bus.emit('pryzm-requirement-changed', { operation: 'create', id: requirement.id });

    console.log(`[RequirementStore] Added: ${requirement.id} (${requirement.name})`);
  }

  /**
   * Apply a partial update to an existing requirement.
   * Deep-merges parameters sections — does not replace entire parameter object.
   * Throws if id not found.
   */
  update(id: string, patch: RequirementParamUpdate): void {
    const existing = this._records.get(id);
    if (!existing) {
      throw new Error(`[RequirementStore] update() — id '${id}' not found.`);
    }

    const patchValidation = RoomRequirementUpdateSchema.safeParse(patch);
    if (!patchValidation.success) {
      throw new Error(
        `[RequirementStore] update() — validation failed: ${formatRequirementZodError(patchValidation.error)}`
      );
    }

    // Deep-merge parameters sections
    const mergedParameters = structuredClone(existing.parameters);
    if (patch.parameters) {
      if (patch.parameters.spatial) {
        Object.assign(mergedParameters.spatial, patch.parameters.spatial);
      }
      if (patch.parameters.physics) {
        Object.assign(mergedParameters.physics, patch.parameters.physics);
      }
      if (patch.parameters.finishes) {
        Object.assign(mergedParameters.finishes, patch.parameters.finishes);
      }
      if (patch.parameters.assets) {
        if (patch.parameters.assets.requiredAssets !== undefined) {
          mergedParameters.assets.requiredAssets = [...patch.parameters.assets.requiredAssets];
        }
        const { requiredAssets: _, ...rest } = patch.parameters.assets;
        Object.assign(mergedParameters.assets, rest);
      }
      if (patch.parameters.safety) {
        Object.assign(mergedParameters.safety, patch.parameters.safety);
      }
    }

    const updated: RoomRequirement = {
      ...structuredClone(existing),
      ...(patch.name       !== undefined ? { name: patch.name }             : {}),
      ...(patch.department !== undefined ? { department: patch.department }  : {}),
      ...(patch.templateId !== undefined ? { templateId: patch.templateId }  : {}),
      ...(patch.status     !== undefined ? { status: patch.status }          : {}),
      ...(patch.overriddenFields !== undefined ? { overriddenFields: [...patch.overriddenFields] } : {}),
      parameters: mergedParameters,
      metadata: {
        ...structuredClone(existing.metadata),
        modifiedAt: Date.now(),
        version:    existing.metadata.version + 1,
      },
    };

    const frozen = Object.freeze(updated);
    this._records.set(id, frozen);

    storeEventBus.emit({
      elementId:   id,
      elementType: 'RoomRequirement',
      operation:   'update',
      timestamp:   Date.now(),
    });

    _bus.emit('pryzm-requirement-changed', { operation: 'update', id });
  }

  /**
   * Remove a requirement by ID.
   * No-op if not found (allows idempotent undo calls).
   */
  remove(id: string): void {
    if (!this._records.has(id)) return;
    this._records.delete(id);

    storeEventBus.emit({
      elementId:   id,
      elementType: 'RoomRequirement',
      operation:   'delete',
      timestamp:   Date.now(),
    });

    _bus.emit('pryzm-requirement-changed', { operation: 'delete', id });

    console.log(`[RequirementStore] Removed: ${id}`);
  }

  /** Clear all records — used during project load/clear operations. */
  clear(): void {
    this._records.clear();
    _bus.emit('pryzm-requirement-changed', { operation: 'clear', id: '*' });
  }
}

// ── Singleton + auto-registration in StoreRegistry ───────────────────────────

export const requirementStore = new RequirementStore();

storeRegistry.register('RoomRequirement', requirementStore);

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'requirementStore',
    clear: () => requirementStore.clear(),
});
