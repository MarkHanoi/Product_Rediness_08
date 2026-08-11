// SetCeilingMaterialHandler — uniform material-set command (L-08). §FEAT-UNIFORM-MATERIAL-COMMAND
//
// One `ceiling.setMaterial` handler mirroring the family-uniform shape used
// across every element family.  Mutates only materialId / materialColor;
// the scene-committer's MATERIAL_FIELDS dirty-check swaps materials on the
// next commit — no builder/committer change is required here.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CeilingNotFoundError } from '../errors.js';
import type { CeilingsState } from '../store.js';

export interface SetCeilingMaterialPayload {
  readonly ceilingId: string;
  readonly materialId?: string | null;
  readonly materialColor?: string;
}

type CeilingHandlerStores = Readonly<{ ceiling: CeilingsState } & Record<string, unknown>>;

/**
 * §FIX-DEAD-VERB-REFUSE (W3-3, Class A "dead verb") — why `ceiling.setMaterial` now REFUSES.
 *
 * This handler produced a correct Immer patch against `ctx.stores`, reported SUCCESS,
 * and changed nothing any user could ever see. In production the bus's storesProvider
 * (apps/editor/src/bootstrap.ts:92-97) hands it a snapshot of the FRESH plugin DTO store
 * built by PluginRegistry — not the legacy geometry singleton that the fragment builders,
 * the 2-D plan projector, the IFC exporter and persistence all read. Only `*.created` is
 * mirrored across (initTools.ts); there is no update bridge in either direction.
 *
 * A command that reports success while authoritative state is unchanged is the worst
 * failure mode in a BIM system: the user is told the model changed, saves, reloads, and
 * the change is gone. C03 §4.6 U-4 — a swallowed failure must be reported to the caller,
 * never logged as success; and failure and emptiness are never the same value.
 *
 * DECISION: REFUSE, not retire. Retiring the verb (dropping it from the handler set) was
 * rejected because `CapabilityRefusal.UNCONNECTED_TOPICS` and `CHAT_UNAVAILABLE` both name
 * these verbs, and `tools/ga-gate/check-chat-capability-coverage.ts` requires every such
 * name to be a REGISTERED bus command — retiring would make the chat refusal cite a verb
 * that does not exist. Refusing keeps the declaration honest at both ends AND guarantees
 * that any third dispatcher gets a reason instead of a lie.
 *
 * The refusal lives in `canExecute` deliberately: CommandBus throws before touching either
 * undo stack (CommandBus.ts:342-350), so no PatchPair keyed to a geometry store can be
 * armed for a write geometry never saw (the undo hazard this verb used to carry).
 *
 * `execute()` is left intact: it is a correct plugin-store mutation for a host that binds
 * the authoritative store under this key. `canExecute` is the gate the bus actually honours.
 */
const CEILING_MATERIAL_UNREACHABLE =
  "It writes the plugin DTO store, which is a FRESH instance built by PluginRegistry and is read by no renderer, no 2-D projector, no IFC exporter and no persistence path — only `<family>.created` is ever mirrored to the geometry store, never updates (§FIX-MATERIAL-DEAD-DISPATCH). Use `ceiling.update` instead — it reaches the geometry record the builders read.";

export class SetCeilingMaterialHandler
  implements CommandHandler<SetCeilingMaterialPayload, CeilingHandlerStores>
{
  readonly type = 'ceiling.setMaterial';
  readonly affectedStores = ['ceiling'] as const;

  canExecute(ctx: HandlerContext<CeilingHandlerStores>, cmd: SetCeilingMaterialPayload): ValidationResult {
    if (typeof cmd.ceilingId !== 'string' || cmd.ceilingId.length === 0) {
      return { valid: false, reason: 'ceilingId must be a non-empty string' };
    }
    if (cmd.materialId === undefined && cmd.materialColor === undefined) {
      return { valid: false, reason: 'at least one of materialId / materialColor must be provided' };
    }
    if (cmd.materialColor !== undefined && cmd.materialColor.length === 0) {
      return { valid: false, reason: 'materialColor must be non-empty when provided' };
    }
    if (cmd.materialId !== undefined && cmd.materialId !== null && cmd.materialId.length === 0) {
      return { valid: false, reason: 'materialId must be non-empty when provided' };
    }
    if (!ctx.stores.ceiling[cmd.ceilingId]) {
      return { valid: false, reason: `ceiling not found: ${cmd.ceilingId}` };
    }
    // §FIX-DEAD-VERB-REFUSE (W3-3) — the payload is well-formed, and it still cannot
    // reach authoritative state. Say so; never report success.
    return { valid: false, reason: CEILING_MATERIAL_UNREACHABLE };
  }

  execute(ctx: HandlerContext<CeilingHandlerStores>, cmd: SetCeilingMaterialPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.ceiling[cmd.ceilingId]) throw new CeilingNotFoundError(cmd.ceilingId);

    const [next, forward, inverse] = produceCommand<CeilingsState>(ctx.stores.ceiling, (draft) => {
      const c = draft[cmd.ceilingId];
      if (!c) return;
      if (cmd.materialId === null) delete c.materialId;
      else if (cmd.materialId !== undefined) c.materialId = cmd.materialId;
      if (cmd.materialColor !== undefined) c.materialColor = cmd.materialColor;
    });
    return { forward, inverse, nextStates: { ceiling: next } };
    }); // withHandlerSpan — C10 §2
  }
}
