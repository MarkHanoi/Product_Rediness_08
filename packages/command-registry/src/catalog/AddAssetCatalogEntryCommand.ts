/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command layer (Class A — new command)
 * File:             src/commands/catalog/AddAssetCatalogEntryCommand.ts
 * Contract:         01-BIM-ENGINE-CORE-CONTRACT §2.1, §2.8
 *
 * Creates a brand-new AssetCatalogEntry in the AssetCatalogStore.
 * Uses structuredClone for all snapshots. Fully undo-able.
 *
 * Flow: CommandManager → AddAssetCatalogEntryCommand → AssetCatalogStore → StoreEventBus // TODO(TASK-08)
 * NEVER called directly from UI — always dispatched via commandManager.execute().
 */

import {
  Command,
  CommandType,
  CommandValidationResult,
  CommandResult,
  SerializedCommand,
  CommandContext,
} from '../types';
import { AssetCatalogEntry } from '@pryzm/core-app-model';
import { assetCatalogStore } from '@pryzm/core-app-model';

export interface AddAssetCatalogEntryPayload {
  /** Stable UUID — supplied by caller, never generated here. */
  id: string;
  name: string;
  category: AssetCatalogEntry['parameters']['category'];
  width_mm: number;
  depth_mm: number;
  height_mm: number;
  powerDraw_kw?: number;
  weight_kg?: number;
  clearanceRadius_mm?: number;
}

export class AddAssetCatalogEntryCommand implements Command {
    readonly affectedStores = ["catalog"] as const;
  readonly id: string;
  readonly type = CommandType.ADD_ASSET_CATALOG_ENTRY;
  readonly timestamp: number;
  targetIds: string[];

  constructor(private readonly payload: AddAssetCatalogEntryPayload) {
    this.id = `cmd-cat-add-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.timestamp = Date.now();
    this.targetIds = [payload.id];
  }

  canExecute(_ctx: CommandContext): CommandValidationResult {
    if (!this.payload.id) {
      return { ok: false, reason: 'AddAssetCatalogEntryCommand: id is required' };
    }
    if (!this.payload.name || this.payload.name.trim() === '') {
      return { ok: false, reason: 'AddAssetCatalogEntryCommand: name is required' };
    }
    if (this.payload.width_mm <= 0 || this.payload.depth_mm <= 0 || this.payload.height_mm <= 0) {
      return { ok: false, reason: 'AddAssetCatalogEntryCommand: dimensions must be positive' };
    }
    return { ok: true };
  }

  execute(_ctx: CommandContext): CommandResult {
    try {
      const now = Date.now();
      const entry: AssetCatalogEntry = {
        id:      this.payload.id,
        type:    'AssetCatalogEntry',
        levelId: 'CATALOG',
        parameters: {
          name:               this.payload.name,
          category:           this.payload.category,
          width_mm:           this.payload.width_mm,
          depth_mm:           this.payload.depth_mm,
          height_mm:          this.payload.height_mm,
          powerDraw_kw:       this.payload.powerDraw_kw,
          weight_kg:          this.payload.weight_kg,
          clearanceRadius_mm: this.payload.clearanceRadius_mm,
        },
        metadata: {
          createdAt:  now,
          modifiedAt: now,
          createdBy:  'user',
          version:    1,
        },
      };

      assetCatalogStore.add(entry);

      console.log(`[AddAssetCatalogEntryCommand] Created: ${this.payload.id}`);
      return { success: true, affectedElementIds: [this.payload.id] };

    } catch (err) {
      console.error('[AddAssetCatalogEntryCommand] execute failed:', err);
      return {
        success: false,
        affectedElementIds: [],
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  undo(_ctx: CommandContext): CommandResult {
    try {
      assetCatalogStore.remove(this.payload.id);
      console.log(`[AddAssetCatalogEntryCommand] Undone: ${this.payload.id}`);
      return { success: true, affectedElementIds: [this.payload.id] };
    } catch (err) {
      console.error('[AddAssetCatalogEntryCommand] undo failed:', err);
      return {
        success: false,
        affectedElementIds: [],
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  serialize(): SerializedCommand {
    return {
      type:      this.type,
      payload:   structuredClone(this.payload),
      targetIds: [...this.targetIds],
      timestamp: this.timestamp,
      version:   1,
    };
  }
}
