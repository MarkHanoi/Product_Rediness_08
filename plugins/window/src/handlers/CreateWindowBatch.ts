// CreateWindowBatchHandler — create multiple windows atomically in one command (§A28).
//
// `window.batch.create` — batch-creates an arbitrary list of windows whose
// specs are fully resolved by the caller.  Designed for AI floor-plan
// placement batches (e.g. AI places N windows across walls in one operation)
// and for any tool that needs to commit N windows as one undo-stack entry.
//
// PAYLOAD SHAPE
//   • `windows` — one CreateWindowPayload per window.  Same per-entry
//     validation rules as CreateWindowHandler apply to each entry.
//   • Each entry MUST supply its own `wallId` and `openingId` — the opening
//     must be reserved via `wall.createOpening` before this dispatch.
//
// UNDO: a single Immer batch produces ONE forward + ONE inverse patch —
// undoing a "batch create windows" gesture is one stack pop, not N.
//
// VALIDATION strategy mirrors CreateWindowHandler:
//   • Per-entry `wallId`, `openingId` presence + dimension bounds checked at
//     `canExecute` time.
//   • Schema failures surface as WindowSchemaError (thrown so the bus does
//     NOT push a partial batch to the undo stack).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Window, createId, getWindowType } from '@pryzm/plugin-sdk';
import {
  WindowDimensionsError,
  WindowSchemaError,
  WindowTypeNotFoundError,
} from '../errors.js';
import type { WindowData, WindowsState } from '../store.js';
import type { CreateWindowPayload } from './CreateWindow.js';

export interface CreateWindowBatchPayload {
  /** One spec per window to create.  Must be a non-empty array.
   *  Each entry must carry its own `wallId` and `openingId`. */
  readonly windows: readonly CreateWindowPayload[];
}

type WindowHandlerStores = Readonly<{ window: WindowsState } & Record<string, unknown>>;

export class CreateWindowBatchHandler
  implements CommandHandler<CreateWindowBatchPayload, WindowHandlerStores>
{
  readonly type = 'window.batch.create';
  readonly affectedStores = ['window'] as const;

  canExecute(
    _ctx: HandlerContext<WindowHandlerStores>,
    cmd: CreateWindowBatchPayload,
  ): ValidationResult {
    if (!Array.isArray(cmd.windows) || cmd.windows.length === 0) {
      return { valid: false, reason: 'windows must be a non-empty array' };
    }
    for (let i = 0; i < cmd.windows.length; i++) {
      const w = cmd.windows[i]!;
      if (typeof w.wallId !== 'string' || w.wallId.length === 0) {
        return { valid: false, reason: `windows[${i}].wallId must be a non-empty string` };
      }
      if (typeof w.openingId !== 'string' || w.openingId.length === 0) {
        return { valid: false, reason: `windows[${i}].openingId must be a non-empty string` };
      }
      if (w.id !== undefined && (typeof w.id !== 'string' || w.id.length === 0)) {
        return { valid: false, reason: `windows[${i}].id must be a non-empty string when provided` };
      }
      if (w.width !== undefined && (!Number.isFinite(w.width) || w.width <= 0)) {
        return { valid: false, reason: `windows[${i}].width must be > 0` };
      }
      if (w.height !== undefined && (!Number.isFinite(w.height) || w.height <= 0)) {
        return { valid: false, reason: `windows[${i}].height must be > 0` };
      }
      if (w.systemTypeId !== undefined && w.systemTypeId.length > 0) {
        if (!getWindowType(w.systemTypeId)) {
          return { valid: false, reason: `windows[${i}]: window type not found: ${w.systemTypeId}` };
        }
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<WindowHandlerStores>, cmd: CreateWindowBatchPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const fresh: WindowData[] = [];

      for (let i = 0; i < cmd.windows.length; i++) {
        const w = cmd.windows[i]!;
        const typeDefaults = w.systemTypeId ? getWindowType(w.systemTypeId) : undefined;
        if (w.systemTypeId && !typeDefaults) {
          throw new WindowTypeNotFoundError(w.systemTypeId);
        }

        const id = (w.id ?? createId('window')) as WindowData['id'];
        const seed: Partial<WindowData> = {
          id,
          wallId: w.wallId as WindowData['wallId'],
          openingId: w.openingId,
          windowType: w.windowType ?? 'single',
          width: w.width ?? typeDefaults?.width ?? 1.2,
          height: w.height ?? typeDefaults?.height ?? 1.2,
          sillHeight: w.sillHeight ?? typeDefaults?.sillHeight ?? 0.9,
          offset: w.offset ?? 0,
          frameThickness: w.frameThickness ?? typeDefaults?.frameThickness ?? 0.05,
          frameWidth: w.frameWidth ?? typeDefaults?.frameWidth ?? 0.05,
          frameColor: w.frameColor ?? typeDefaults?.frameColor,
          fireRating: w.fireRating ?? typeDefaults?.fireRating,
        };

        let window: WindowData;
        try {
          window = Window.parse(seed) as WindowData;
        } catch (parseErr) {
          throw new WindowSchemaError(
            new Error(`window.batch.create — windows[${i}] (id=${id})`, { cause: parseErr as Error }),
          );
        }

        if (window.frameWidth * 2 > window.width) {
          throw new WindowDimensionsError(`windows[${i}]: frameWidth must not exceed half the pane width`);
        }

        fresh.push(window);
      }

      // One Immer batch for the whole set — single undo-stack entry.
      const [next, forward, inverse] = produceCommand<WindowsState>(ctx.stores.window, draft => {
        for (const w of fresh) draft[w.id] = w;
      });

      return { forward, inverse, nextStates: { window: next } };
    }); // withHandlerSpan — C10 §2
  }
}
