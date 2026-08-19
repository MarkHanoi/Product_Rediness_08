// SetBeamMaterialHandler — uniform material-set command (L-08). §FEAT-UNIFORM-MATERIAL-COMMAND
//
// One `beam.setMaterial` handler mirroring the family-uniform shape used
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
import { BeamNotFoundError } from '../errors.js';
import type { BeamsState } from '../store.js';

export interface SetBeamMaterialPayload {
  readonly beamId: string;
  readonly materialId?: string | null;
  readonly materialColor?: string;
}

type BeamHandlerStores = Readonly<{ beam: BeamsState } & Record<string, unknown>>;

/**
 * §FIX-DEAD-VERB-REFUSE (W3-3, Class A "dead verb") — why `beam.setMaterial` now REFUSES.
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
/**
 * ⚠ UPDATED 2026-08-19 (MT4 / L-1127 ARM D+F) — HALF OF THIS REFUSAL'S STATED
 * REASON BECAME FALSE, AND A REFUSAL THAT LIES IS THE `ElementCapabilities.ts`
 * DEFECT WEARING THE OTHER FACE (C68 §2.2).
 *
 * It used to read, verbatim: *"Beams have no per-beam material at all:
 * BeamFragmentBuilder picks between two module-scoped shared materials
 * (_steelMat / _concreteMat) from `sectionType` and never reads a material field,
 * and BeamData carries neither materialId nor materialColor. Writing one would put
 * a dead field on a detached record."*
 *
 * ⭐ ALL THREE OF THOSE CLAUSES ARE NOW OUT OF DATE. `BeamData` carries
 * `materialId`; `BeamFragmentBuilder.resolveBeamMaterial` resolves it through the
 * ONE master authority into a per-COLOUR shared material; `serializeBeam` writes
 * it and `ProjectLoader` reads it back. The field is neither dead nor detached.
 *
 * ⛔ AND YET THE VERB STILL REFUSES, because the OTHER reason — the one this
 * lane did NOT fix — is untouched and is on its own sufficient. The bus's
 * storesProvider hands this handler a snapshot of the FRESH plugin DTO store built
 * by `PluginRegistry`, not the legacy geometry singleton that
 * `BeamFragmentBuilder`, the plan projector, the IFC exporter and persistence all
 * read. There is still no update bridge in either direction. Writing here would
 * still change nothing a user can see, and would still report success while doing
 * it — §FIX-CHAT-DEAD-ROUTES, thirteen out of thirteen.
 *
 * ⚠ SO THE REFUSAL IS NARROWED, NOT LIFTED. Lifting it because the rendering half
 * now works would resurrect exactly the dead verb §FIX-DEAD-VERB-REFUSE killed —
 * "Done" over an unchanged model. What changed is that the REMAINING obstacle is
 * now a routing problem with a known shape (bridge the plugin store to the
 * geometry store, as L-815 did for `wall.updateDimensions`) rather than a missing
 * data model. The escape hatch this refusal was waiting on is half-built; naming
 * which half is the point (§REFUSING-HALF-NEEDS-ITS-ESCAPE-HATCH).
 */
const BEAM_MATERIAL_UNREACHABLE =
  "A beam's material now resolves and persists (BeamData.materialId is rendered by BeamFragmentBuilder and round-trips through save/load), but THIS command still cannot reach it: the bus hands this handler a detached plugin DTO store, not the geometry store the builder and persistence read, and there is no bridge between them. Writing here would report success and change nothing you could see. Set the material through a command in packages/command-registry (CreateBeamCommand accepts materialId), or bridge this verb to the geometry store as L-815 did for wall.updateDimensions.";

export class SetBeamMaterialHandler
  implements CommandHandler<SetBeamMaterialPayload, BeamHandlerStores>
{
  readonly type = 'beam.setMaterial';
  readonly affectedStores = ['beam'] as const;

  canExecute(ctx: HandlerContext<BeamHandlerStores>, cmd: SetBeamMaterialPayload): ValidationResult {
    if (typeof cmd.beamId !== 'string' || cmd.beamId.length === 0) {
      return { valid: false, reason: 'beamId must be a non-empty string' };
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
    if (!ctx.stores.beam[cmd.beamId]) {
      return { valid: false, reason: `beam not found: ${cmd.beamId}` };
    }
    // §FIX-DEAD-VERB-REFUSE (W3-3) — the payload is well-formed, and it still cannot
    // reach authoritative state. Say so; never report success.
    return { valid: false, reason: BEAM_MATERIAL_UNREACHABLE };
  }

  execute(ctx: HandlerContext<BeamHandlerStores>, cmd: SetBeamMaterialPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.beam[cmd.beamId]) throw new BeamNotFoundError(cmd.beamId);

    const [next, forward, inverse] = produceCommand<BeamsState>(ctx.stores.beam, (draft) => {
      const b = draft[cmd.beamId];
      if (!b) return;
      if (cmd.materialId === null) delete b.materialId;
      else if (cmd.materialId !== undefined) b.materialId = cmd.materialId;
      // materialColor accepted for uniform shape but not applied — beam colour derives from the material-library entry (materialId). §FEAT-UNIFORM-MATERIAL-COMMAND
    });
    return { forward, inverse, nextStates: { beam: next } };
    }); // withHandlerSpan — C10 §2
  }
}
