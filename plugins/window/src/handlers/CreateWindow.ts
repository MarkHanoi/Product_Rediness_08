// CreateWindowHandler — mint a new window (S11-T2).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Window, createId } from '@pryzm/plugin-sdk';
import {
  WindowSchemaError,
  WindowDimensionsError,
  WindowTypeNotFoundError,
} from '../errors.js';
import type { WindowData, WindowsState } from '../store.js';
import { getWindowType } from '@pryzm/plugin-sdk';

export interface CreateWindowPayload {
  readonly wallId: string;
  readonly openingId: string;
  readonly id?: string;
  readonly offset?: number;
  readonly width?: number;
  readonly height?: number;
  readonly sillHeight?: number;
  readonly windowType?: WindowData['windowType'];
  readonly systemTypeId?: string;
  readonly frameThickness?: number;
  readonly frameWidth?: number;
  readonly frameColor?: string;
  readonly fireRating?: string;
}

type WindowHandlerStores = Readonly<{ window: WindowsState } & Record<string, unknown>>;

/**
 * §FIX-CREATE-LIVENESS-LIE (BIM20 C5/C6, Wave 4) — why `window.create` now REFUSES.
 *
 * The window twin of the `door.create` refusal, and measured the same way: the CA-21
 * executed read-back dispatched `window.create` against the real composed runtime,
 * then read the AUTHORITATIVE `windowStore` module singleton (the one
 * `ProjectSerializer` imports) and got `readback-negative` — *"dispatch reported
 * success; the AUTHORITATIVE store did not change"*. It also left `window.delete`
 * `seed-did-not-land`, i.e. unjudgeable.
 *
 * A window is a HOSTED OPENING. The authoritative creation path is the single atomic
 * command `wall.createOpening` → `CreateWallOpeningCommand`, which reserves the
 * wall-side opening (occupancy, `childrenIds`, the render void) AND writes the
 * `windowStore` record with its resolved system type, finishes and canonical mark.
 * Making this handler write `windowStore` alone would mint a window with no host
 * opening — a lie about what the model IS, which persists, in place of a lie about
 * whether it moved.
 *
 * The only dispatcher in the repo is `plugins/window/src/tool.ts:76`, an unregistered
 * plugin tool whose own step 1 already dispatches `wall.createOpening`.
 *
 * REFUSE, NOT RETIRE (chat capability tables name the verb) and ORDER IS LOAD-BEARING
 * — see `plugins/door/src/handlers/MoveDoor.ts` for the full note on both.
 */
const WINDOW_CREATE_UNREACHABLE =
  "window.create writes the detached plugin window store: the CA-21 executed read-back saw the dispatch report success while the authoritative windowStore (the one ProjectSerializer reads) did not change, and it left window.delete unjudgeable. A window is a hosted opening, so it is created by ONE atomic command — wall.createOpening (payload: { wallId, opening: { id, type: 'window', offset, width, height, sillHeight, elementId } }) → CreateWallOpeningCommand, which reserves the wall-side opening AND writes the authoritative windowStore record with its system type, finishes and mark.";

export class CreateWindowHandler
  implements CommandHandler<CreateWindowPayload, WindowHandlerStores>
{
  readonly type = 'window.create';
  readonly affectedStores = ['window'] as const;

  /** Payload validation ONLY — kept public so a delegating facade can reuse it. */
  validatePayload(_ctx: HandlerContext<WindowHandlerStores>, cmd: CreateWindowPayload): ValidationResult {
    if (typeof cmd.wallId !== 'string' || cmd.wallId.length === 0) {
      return { valid: false, reason: 'wallId must be a non-empty string' };
    }
    if (typeof cmd.openingId !== 'string' || cmd.openingId.length === 0) {
      return { valid: false, reason: 'openingId must be a non-empty string' };
    }
    if (cmd.width !== undefined && (!Number.isFinite(cmd.width) || cmd.width <= 0)) {
      return { valid: false, reason: 'width must be > 0' };
    }
    if (cmd.height !== undefined && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: 'height must be > 0' };
    }
    if (cmd.systemTypeId !== undefined && cmd.systemTypeId.length > 0) {
      if (!getWindowType(cmd.systemTypeId)) {
        return { valid: false, reason: `window type not found: ${cmd.systemTypeId}` };
      }
    }
    return { valid: true };
  }

  canExecute(ctx: HandlerContext<WindowHandlerStores>, cmd: CreateWindowPayload): ValidationResult {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    // §FIX-CREATE-LIVENESS-LIE — the payload is well-formed, and it STILL cannot
    // reach authoritative state. Say so; never report success.
    return { valid: false, reason: WINDOW_CREATE_UNREACHABLE };
  }
  execute(ctx: HandlerContext<WindowHandlerStores>, cmd: CreateWindowPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const typeDefaults = cmd.systemTypeId ? getWindowType(cmd.systemTypeId) : undefined;
    if (cmd.systemTypeId && !typeDefaults) {
      throw new WindowTypeNotFoundError(cmd.systemTypeId);
    }

    const id = (cmd.id ?? createId('window')) as WindowData['id'];
    const seed: Partial<WindowData> = {
      id,
      wallId: cmd.wallId as WindowData['wallId'],
      openingId: cmd.openingId,
      windowType: cmd.windowType ?? 'single',
      width: cmd.width ?? typeDefaults?.width ?? 1.2,
      height: cmd.height ?? typeDefaults?.height ?? 1.2,
      sillHeight: cmd.sillHeight ?? typeDefaults?.sillHeight ?? 0.9,
      offset: cmd.offset ?? 0,
      frameThickness: cmd.frameThickness ?? typeDefaults?.frameThickness ?? 0.05,
      frameWidth: cmd.frameWidth ?? typeDefaults?.frameWidth ?? 0.05,
      frameColor: cmd.frameColor ?? typeDefaults?.frameColor,
      fireRating: cmd.fireRating ?? typeDefaults?.fireRating,
    };

    let window: WindowData;
    try {
      window = Window.parse(seed);
    } catch (err) {
      throw new WindowSchemaError(err);
    }
    if (window.frameWidth * 2 > window.width) {
      throw new WindowDimensionsError('frameWidth must not exceed half the pane width');
    }

    const [next, forward, inverse] = produceCommand<WindowsState>(ctx.stores.window, (draft) => {
      draft[window.id] = window;
    });
    return { forward, inverse, nextStates: { window: next } };
    }); // withHandlerSpan — C10 §2
  }
}
