// CreateFurnitureHandler — mint a new furniture instance (S27 / ADR-0027).
//
// Per ADR-0027 §2 the Furniture DTO carries its representations directly.
// This handler doesn't reach into the catalogue itself (keeping it free of
// host-side dependencies); the placement tool resolves the catalogue entry
// first and passes `representations` and `catalogId` into the payload.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Furniture, createId } from '@pryzm/plugin-sdk';
// §WARD118 — the legacy create command owns the wardrobe height verdict (see canExecute).
import { CreateFurnitureCommand } from '@pryzm/command-registry';
import { FurnitureSchemaError } from '../errors.js';
import type { FurnitureData, FurnituresState } from '../store.js';
import { isFiniteVec3, isValidLod, isValidScale } from '../intent.js';

export interface CreateFurniturePayload {
  readonly id?: string;
  readonly levelId?: string;
  readonly catalogId?: string;
  readonly origin?: FurnitureData['origin'];
  readonly rotation?: number;
  readonly scale?: number;
  readonly size?: FurnitureData['size'];
  readonly activeLod?: FurnitureData['activeLod'];
  readonly representations?: FurnitureData['representations'];
  readonly materialSlots?: FurnitureData['materialSlots'];
  readonly materialId?: string;
}

type Stores = Readonly<{ furniture: FurnituresState } & Record<string, unknown>>;

export class CreateFurnitureHandler
  implements CommandHandler<CreateFurniturePayload, Stores>
{
  readonly type = 'furniture.create';
  readonly affectedStores = ['furniture'] as const;

  canExecute(_ctx: HandlerContext<Stores>, cmd: CreateFurniturePayload): ValidationResult {
    if (cmd.origin !== undefined && !isFiniteVec3(cmd.origin)) {
      return { valid: false, reason: 'origin must have finite x, y, z' };
    }
    if (cmd.rotation !== undefined && !Number.isFinite(cmd.rotation)) {
      return { valid: false, reason: 'rotation must be finite' };
    }
    if (cmd.scale !== undefined && !isValidScale(cmd.scale)) {
      return { valid: false, reason: 'scale must be > 0 and finite' };
    }
    if (cmd.activeLod !== undefined && !isValidLod(cmd.activeLod)) {
      return { valid: false, reason: 'activeLod must be one of {0,1,2,3,4}' };
    }
    if (cmd.size !== undefined && !isFiniteVec3(cmd.size)) {
      return { valid: false, reason: 'size override must have finite x, y, z' };
    }

    // §WARD118 — WARDROBE BRANCH (C16 CA-18 at the bus gate). A `furniture.create`
    // carrying a `wardrobeCabinetConfig` is bridged to the legacy
    // `CreateFurnitureCommand` (CommandEventBridge → initTools), whose `canExecute`
    // reads THE height authority — but that refusal happens AFTER this bus
    // reported success, silently (C74). Ask the legacy command's own verdict here,
    // with the live legacy context, so the bus refuses by name with both numbers
    // and the placement tool's toast reaches the founder. One validator (C84
    // EI-9), no plugin → geometry-package import (the SDK-bypass ratchet is
    // shrink-only). Headless buses (no legacy context) are unchanged.
    const wardrobeCabinetConfig = (cmd as { readonly wardrobeCabinetConfig?: unknown }).wardrobeCabinetConfig;
    if (wardrobeCabinetConfig !== undefined) {
      const cm = window.commandManager as { getContext?(): unknown } | undefined;
      const legacyCtx = cm?.getContext?.();
      if (legacyCtx) {
        const verdict = new CreateFurnitureCommand(
          cmd as unknown as ConstructorParameters<typeof CreateFurnitureCommand>[0],
        ).canExecute(legacyCtx as never);
        if (!verdict.ok) {
          return {
            valid: false,
            reason: verdict.blockingIssues?.[0]
              ?? verdict.reason
              ?? 'CreateFurnitureCommand.canExecute refused without stating a reason',
          };
        }
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: CreateFurniturePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const id = (cmd.id ?? createId('furniture')) as FurnitureData['id'];
    const seed: Partial<FurnitureData> = {
      id,
      levelId: cmd.levelId ?? '',
      catalogId: cmd.catalogId ?? '',
      origin: cmd.origin ?? { x: 0, y: 0, z: 0 },
      rotation: cmd.rotation ?? 0,
      scale: cmd.scale ?? 1,
      size: cmd.size,
      activeLod: cmd.activeLod ?? 2,
      representations: cmd.representations ?? {},
      materialSlots: cmd.materialSlots ?? {},
      materialId: cmd.materialId,
    };

    let f: FurnitureData;
    try { f = Furniture.parse(seed); }
    catch (err) { throw new FurnitureSchemaError(err); }

    const [next, forward, inverse] = produceCommand<FurnituresState>(ctx.stores.furniture, (draft) => {
      draft[f.id] = f;
    });
    return { forward, inverse, nextStates: { furniture: next } };
    }); // withHandlerSpan — C10 §2
  }
}
