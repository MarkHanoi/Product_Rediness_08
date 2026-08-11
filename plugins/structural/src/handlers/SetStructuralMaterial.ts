// SetStructuralMaterialHandler — assign material (S26).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { StructuralNotFoundError } from '../errors.js';
import type { StructuralsState } from '../store.js';

export interface SetStructuralMaterialPayload {
  readonly structuralId: string;
  readonly materialId?: string;
}

type Stores = Readonly<{ structural: StructuralsState } & Record<string, unknown>>;

/**
 * §FIX-DEAD-VERB-REFUSE (W3-3, Class A "dead verb") — why `structural.setMaterial` now REFUSES.
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
const STRUCTURAL_MATERIAL_UNREACHABLE =
  "There is no structural runtime family: schemas/elements/Structural.ts defines the element, but no structuralStore, no builder and no legacy command exists anywhere — it is schema-only, so nothing could observe this write. The real structural element is `column`, which has a live material path (`column.update`).";

export class SetStructuralMaterialHandler
  implements CommandHandler<SetStructuralMaterialPayload, Stores>
{
  readonly type = 'structural.setMaterial';
  readonly affectedStores = ['structural'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetStructuralMaterialPayload): ValidationResult {
    if (!ctx.stores.structural[cmd.structuralId]) {
      return { valid: false, reason: `structural not found: ${cmd.structuralId}` };
    }
    // §FIX-DEAD-VERB-REFUSE (W3-3) — the payload is well-formed, and it still cannot
    // reach authoritative state. Say so; never report success.
    return { valid: false, reason: STRUCTURAL_MATERIAL_UNREACHABLE };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetStructuralMaterialPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.structural[cmd.structuralId]) throw new StructuralNotFoundError(cmd.structuralId);
    const [next, forward, inverse] = produceCommand<StructuralsState>(ctx.stores.structural, (draft) => {
      const s = draft[cmd.structuralId];
      if (!s) return;
      s.materialId = cmd.materialId;
    });
    return { forward, inverse, nextStates: { structural: next } };
    }); // withHandlerSpan — C10 §2
  }
}
