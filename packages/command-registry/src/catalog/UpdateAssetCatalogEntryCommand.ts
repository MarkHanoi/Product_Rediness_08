/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command layer (Class A — new command)
 * File:             src/commands/catalog/UpdateAssetCatalogEntryCommand.ts
 * Contract:         01-BIM-ENGINE-CORE-CONTRACT §2.1, §2.8
 *
 * Updates an existing AssetCatalogEntry in the AssetCatalogStore.
 * Captures a pre-state snapshot for full undo support.
 *
 * Flow: CommandManager → UpdateAssetCatalogEntryCommand → AssetCatalogStore → StoreEventBus // TODO(TASK-08)
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
import { AssetCatalogEntry, AssetCatalogParamUpdate } from '@pryzm/core-app-model';
import { assetCatalogStore } from '@pryzm/core-app-model';

export interface UpdateAssetCatalogEntryPayload {
  id: string;
  patch: AssetCatalogParamUpdate;
}

export class UpdateAssetCatalogEntryCommand implements Command {
    readonly affectedStores = ["catalog"] as const;
  readonly id: string;
  readonly type = CommandType.UPDATE_ASSET_CATALOG_ENTRY;
  readonly timestamp: number;
  targetIds: string[];

  private _snapshot: Readonly<AssetCatalogEntry> | undefined;

  constructor(private readonly payload: UpdateAssetCatalogEntryPayload) {
    this.id = `cmd-cat-upd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.timestamp = Date.now();
    this.targetIds = [payload.id];
  }

  canExecute(_ctx: CommandContext): CommandValidationResult {
    if (!this.payload.id) {
      return { ok: false, reason: 'UpdateAssetCatalogEntryCommand: id is required' };
    }
    if (!assetCatalogStore.has(this.payload.id)) {
      return {
        ok: false,
        reason: `UpdateAssetCatalogEntryCommand: entry '${this.payload.id}' not found`,
      };
    }
    return { ok: true };
  }

  execute(_ctx: CommandContext): CommandResult {
    try {
      this._snapshot = structuredClone(assetCatalogStore.get(this.payload.id)!);
      assetCatalogStore.update(this.payload.id, this.payload.patch);
      console.log(`[UpdateAssetCatalogEntryCommand] Updated: ${this.payload.id}`);
      return { success: true, affectedElementIds: [this.payload.id] };
    } catch (err) {
      console.error('[UpdateAssetCatalogEntryCommand] execute failed:', err);
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
        assetCatalogStore.remove(this.payload.id);
        assetCatalogStore.add(structuredClone(this._snapshot));
      }
      console.log(`[UpdateAssetCatalogEntryCommand] Undone: ${this.payload.id}`);
      return { success: true, affectedElementIds: [this.payload.id] };
    } catch (err) {
      console.error('[UpdateAssetCatalogEntryCommand] undo failed:', err);
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
