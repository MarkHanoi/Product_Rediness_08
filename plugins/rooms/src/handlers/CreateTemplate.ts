// CreateTemplateHandler — F-1.3 migration bridge.
// Exfiltrates commandManager.execute(CreateTemplateCommand) from apps/editor/src/.
// TODO(F-1.4): replace with authoritative template-registry store update.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CreateTemplateCommand  } from '@pryzm/command-registry';

export interface CreateTemplatePayload {
  readonly id: string;
  readonly name: string;
  readonly scope: string;
  readonly [k: string]: unknown;
}

/**
 * §FIX-CREATE-LIVENESS-LIE (BIM20 C5/C6, Wave 4) — `template.create` used to lie
 * in TWO independent ways, and both are closed here.
 *
 * MEASURED: the CA-21 executed read-back dispatched `template.create` against the
 * real composed runtime, then read the AUTHORITATIVE `templateStore` module
 * singleton (the one `ProjectSerializer` imports). Verdict: `readback-negative` —
 * *"dispatch reported success; the AUTHORITATIVE store did not change"*.
 *
 * LIE 1 — MISSING BRIDGE READ AS SUCCESS. The handler delegates to the legacy
 * `window.commandManager`. When that global is absent (every headless process,
 * every server-side evaluation, and any browser frame before the engine boots) the
 * old code took the `if (cm)` branch *not at all* and returned `{ forward: [],
 * inverse: [] }` — an empty patch pair, which the bus reads as a clean success.
 * "Failure and emptiness are never the same value" (§CONTEXT-DATA-HONESTY); this
 * was them being literally the same value. Now the absence is a typed REFUSAL in
 * `canExecute`, where CommandBus rejects before arming either undo stack.
 *
 * LIE 2 — SWALLOWED BRIDGE FAILURE. `catch (e) { console.error(...) }` then
 * returned success anyway. A `console.error` is not a report; the caller was told
 * the template exists. The catch is gone — the throw propagates, and the bus turns
 * it into a failed command.
 *
 * NOT REFUSED WHOLESALE, unlike `door.create` / `window.create`: this verb's
 * bridge target, `CreateTemplateCommand`, genuinely writes the authoritative
 * `templateStore` (`CreateTemplateCommand.ts:82`). The verb was not dead, it was
 * unreliable — so the fix is to make it either write or say why it cannot.
 *
 * `code` is validated here because the authoritative command REQUIRES it
 * (`CreateTemplateCommand.canExecute`: *"Template code must not be empty"*). The
 * old payload contract omitted it, so a caller could satisfy this handler and be
 * refused one layer down — with that refusal swallowed by LIE 2.
 */
const TEMPLATE_CREATE_NO_BRIDGE =
  "template.create reaches the authoritative templateStore only through the legacy commandManager bridge (window.commandManager → CreateTemplateCommand), and that bridge is not present in this process. It is absent in every headless runtime and in any browser frame before the engine boots. Refusing here is the honest answer: the previous behaviour returned an empty patch pair, which the bus reads as SUCCESS, so the caller was told a template existed that was never created.";

export const CreateTemplateHandler: CommandHandler<CreateTemplatePayload, Record<string, unknown>> = {
  type: 'template.create',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: CreateTemplatePayload,
  ): ValidationResult {
    if (!cmd.id || !cmd.name) return { valid: false, reason: 'id and name are required' };
    // The authoritative command rejects an empty code; validate it HERE so the
    // caller gets the real reason instead of a refusal one layer down.
    if (typeof cmd.code !== 'string' || cmd.code.trim().length === 0) {
      return { valid: false, reason: 'code is required (CreateTemplateCommand rejects an empty template code)' };
    }
    // §FIX-BARE-WINDOW-REFERENCEERROR (Phase 0 re-baseline finding): in a Node
    // process `window` is not merely falsy, it is UNDECLARED — a bare read is a
    // ReferenceError thrown out of canExecute, which the bus reports as a crash
    // rather than the typed refusal this handler exists to give. The refusal
    // must not depend on the environment being browser-shaped to be delivered.
    if (typeof window === 'undefined' || !(window.commandManager as unknown)) {
      return { valid: false, reason: TEMPLATE_CREATE_NO_BRIDGE };
    }
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: CreateTemplatePayload,
  ): HandlerResult {
    return withHandlerSpan('template.create.handler', { 'pryzm.command.type': 'template.create' }, () => {
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (!cm) {
        // Defence in depth: `canExecute` already refused this, but a direct
        // `execute()` caller must not be able to collect a silent success.
        throw new Error('[template.create] ' + TEMPLATE_CREATE_NO_BRIDGE);
      }
      // NO catch. A bridge failure is a command failure — swallowing it and
      // returning an empty patch pair is what made this verb lie.
      cm.execute(new CreateTemplateCommand(cmd as any));
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  },
};
