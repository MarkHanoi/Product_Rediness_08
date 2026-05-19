/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command layer (Class A — new command)
 * File:             src/commands/catalog/DeleteAssetCatalogEntryCommand.ts
 * Contract:         01-BIM-ENGINE-CORE-CONTRACT §2.1, §2.8
 *
 * Removes an AssetCatalogEntry from the AssetCatalogStore.
 * Captures a pre-state snapshot so undo can restore the record exactly.
 *
 * Flow: CommandManager → DeleteAssetCatalogEntryCommand → AssetCatalogStore → StoreEventBus // TODO(TASK-08)
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

export interface DeleteAssetCatalogEntryPayload {
  id: string;
}

export class DeleteAssetCatalogEntryCommand implements Command {
    readonly affectedStores = ["catalog"] as const;
  readonly id: string;
  readonly type = CommandType.DELETE_ASSET_CATALOG_ENTRY;
  readonly timestamp: number;
  targetIds: string[];

  private _snapshot: Readonly<AssetCatalogEntry> | undefined;

  constructor(private readonly payload: DeleteAssetCatalogEntryPayload) {
    this.id = `cmd-cat-del-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.timestamp = Date.now();
    this.targetIds = [payload.id];
  }

  canExecute(_ctx: CommandContext): CommandValidationResult {
    if (!this.payload.id) {
      return { ok: false, reason: 'DeleteAssetCatalogEntryCommand: id is required' };
    }
    return { ok: true };
  }

  execute(_ctx: CommandContext): CommandResult {
    try {
      const existing = assetCatalogStore.get(this.payload.id);
      if (existing) {
        this._snapshot = structuredClone(existing);
      }
      assetCatalogStore.remove(this.payload.id);
      console.log(`[DeleteAssetCatalogEntryCommand] Deleted: ${this.payload.id}`);
      return { success: true, affectedElementIds: [this.payload.id] };
    } catch (err) {
      console.error('[DeleteAssetCatalogEntryCommand] execute failed:', err);
      return {
        success: false,
        affectedElementIds: [],
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  undo(_ctx: CommandContext): CommandResult {
    try {
      if (this._snapshot) {
        assetCatalogStore.add(structuredClone(this._snapshot));
      }
      console.log(`[DeleteAssetCatalogEntryCommand] Undone: ${this.payload.id}`);
      return { success: true, affectedElementIds: [this.payload.id] };
    } catch (err) {
      console.error('[DeleteAssetCatalogEntryCommand] undo failed:', err);
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
