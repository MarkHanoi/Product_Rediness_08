// SetPlumbingMaterialHandler — uniform material-set command (L-08). §FEAT-UNIFORM-MATERIAL-COMMAND
//
// One `plumbing.setMaterial` handler mirroring the family-uniform shape used
// across every element family.  The scene-committer's MATERIAL_FIELDS
// dirty-check swaps materials on the next commit — no builder/committer
// change is required here.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { PlumbingNotFoundError } from '../errors.js';
import type { PlumbingsState } from '../store.js';

export interface SetPlumbingMaterialPayload {
  readonly plumbingId: string;
  readonly materialId?: string | null;
  readonly materialColor?: string;
}

type PlumbingHandlerStores = Readonly<{ plumbing: PlumbingsState } & Record<string, unknown>>;

/**
 * §FIX-DEAD-VERB-REFUSE (W3-3, Class A "dead verb") — why `plumbing.setMaterial` now REFUSES.
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
const PLUMBING_MATERIAL_UNREACHABLE =
  "The plumbing builder honours `data.color` for the BATH fixture only (createBathMesh); sink, toilet, urinal, bidet, shower and accessory meshes hardcode their ceramic/chrome colours. Applying a material would work on one fixture type in six and silently do nothing on the other five — and this verb writes the detached plugin DTO store in any case. Tracked under Gate G7.";

export class SetPlumbingMaterialHandler
  implements CommandHandler<SetPlumbingMaterialPayload, PlumbingHandlerStores>
{
  readonly type = 'plumbing.setMaterial';
  readonly affectedStores = ['plumbing'] as const;

  canExecute(ctx: HandlerContext<PlumbingHandlerStores>, cmd: SetPlumbingMaterialPayload): ValidationResult {
    if (typeof cmd.plumbingId !== 'string' || cmd.plumbingId.length === 0) {
      return { valid: false, reason: 'plumbingId must be a non-empty string' };
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
    if (!ctx.stores.plumbing[cmd.plumbingId]) {
      return { valid: false, reason: `plumbing not found: ${cmd.plumbingId}` };
    }
    // §FIX-DEAD-VERB-REFUSE (W3-3) — the payload is well-formed, and it still cannot
    // reach authoritative state. Say so; never report success.
    return { valid: false, reason: PLUMBING_MATERIAL_UNREACHABLE };
  }

  execute(ctx: HandlerContext<PlumbingHandlerStores>, cmd: SetPlumbingMaterialPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.plumbing[cmd.plumbingId]) throw new PlumbingNotFoundError(cmd.plumbingId);

    const [next, forward, inverse] = produceCommand<PlumbingsState>(ctx.stores.plumbing, (draft) => {
      const p = draft[cmd.plumbingId];
      if (!p) return;
      if (cmd.materialId === null) delete p.materialId;
      else if (cmd.materialId !== undefined) p.materialId = cmd.materialId;
      // materialColor accepted for uniform shape but not applied — plumbing colour derives from the material-library entry (materialId). §FEAT-UNIFORM-MATERIAL-COMMAND
    });
    return { forward, inverse, nextStates: { plumbing: next } };
    }); // withHandlerSpan — C10 §2
  }
}
