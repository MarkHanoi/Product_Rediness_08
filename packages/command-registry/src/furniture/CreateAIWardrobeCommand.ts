
  import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
  import { FurnitureData, FurnitureMaterial } from '@pryzm/geometry-furniture';
  import { WardrobeConfig } from '@pryzm/geometry-furniture';

  export interface CreateAIWardrobePayload {
      id: string;
      levelId: string;
      baseOffset: number;
      position: { x: number; y: number; z: number };
      rotation: { x: number; y: number; z: number };
      material: FurnitureMaterial;
      config: Omit<WardrobeConfig, 'id' | 'levelId'>;
  }

  export class CreateAIWardrobeCommand implements Command {
    readonly affectedStores = ["furniture", "level"] as const;
      readonly id: string;
      readonly type = CommandType.CREATE_FURNITURE;
      readonly timestamp: number = Date.now();
      targetIds: string[];

      constructor(private payload: CreateAIWardrobePayload) {
          // §07 §3.4 — cryptographic randomness for command IDs.
          this.id = `cmd-ai-wardrobe-${crypto.randomUUID()}`;
          this.targetIds = [payload.id];
      }

      canExecute(context: CommandContext): CommandValidationResult {
          if (!this.payload.levelId) return { ok: false, reason: "Missing levelId" };
          const level = context.bimManager.getLevelById(this.payload.levelId);
          if (!level) return { ok: false, reason: "Level not found" };
          return { ok: true };
      }

      execute(context: CommandContext): CommandResult {
          const level = context.bimManager.getLevelById(this.payload.levelId)!;
          context.bimManager.registerElement(this.payload.id, this.payload.levelId);

          const data: FurnitureData = {
              id: this.payload.id,
              type: 'furniture',
              furnitureType: 'wardrobe',
              position: {
                  x: this.payload.position.x,
                  y: level.elevation + this.payload.baseOffset,
                  z: this.payload.position.z,
              },
              rotation: {
                  x: this.payload.rotation.x,
                  y: this.payload.rotation.y,
                  z: this.payload.rotation.z,
              },
              levelId: this.payload.levelId,
              levelName: level.name,
              levelElevation: level.elevation,
              baseOffset: this.payload.baseOffset,
              width: this.payload.config.width,
              length: this.payload.config.depth,
              height: this.payload.config.height,
              material: this.payload.material,
              // Spread already includes width/height/depth — no redundant remap.
              wardrobeConfig: { ...this.payload.config } as WardrobeConfig,
              properties: {}
          };

          // §01 §2.7 — store.add() dispatches bim-furniture-added; the fragment
          // builder is wired to that event, so no direct window.* call needed.
          const store = (context.stores as any).furnitureStore;
          store.add(structuredClone(data));

          return { success: true, affectedElementIds: [this.payload.id] };
      }

      undo(context: CommandContext): CommandResult {
          // §01 §2.7 — store.remove() dispatches bim-furniture-removed; builders react.
          context.bimManager.unregisterElement(this.payload.id);
          const store = (context.stores as any).furnitureStore;
          store.remove(this.payload.id);
          return { success: true, affectedElementIds: [this.payload.id] };
      }

      serialize(): SerializedCommand {
          return {
              type: this.type,
              payload: this.payload,
              targetIds: this.targetIds,
              timestamp: this.timestamp,
              version: 1
          };
      }
  }
  