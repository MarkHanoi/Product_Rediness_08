// SwapComponentTypeHandler — `component.swapType`. §COMPONENT-PLACE (Phase 4C).
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THIS VERB IS ONE HALF OF SPEC §66's F-2 FALSIFIER, AND THE HALF THAT FAILS
//    IN EVERY BIM TOOL THAT GETS IT WRONG.
// ═══════════════════════════════════════════════════════════════════════════════
//
// The audit's F-2, verbatim: *"Place 20 instances; change ONE to Width = 1800; the
// other 19 must be unchanged. Then change the TYPE to 1600 and the 19 must follow
// while the overridden one does not."* This handler moves the TYPE rung of ADR-0376
// D4's ladder (instance > type > expression > definition default).
//
// ─── ⛔ IT WRITES `typeId` AND NOTHING ELSE. THAT IS THE ENTIRE DESIGN. ────────
// The tempting implementation resolves the new type's values and writes them onto
// the occurrence "so it stays consistent". That single line would destroy the model:
//
//   1. It stores a DERIVED value (C84 §8.i) — stale the next time the TYPE is
//      edited, silently, on every occurrence that has one.
//   2. It would overwrite the user's INSTANCE OVERRIDES with type values, which is
//      exactly F-2's *"the instance has collapsed into the type"* failure. The
//      overridden occurrence would silently follow the swap and the falsifier would
//      fail — and it would fail QUIETLY, because the record would look correct.
//
// So `instanceParameters` is untouched here, deliberately and permanently. An
// override survives a type swap because a type swap does not know overrides exist.
//
// ─── ⭐ TYPE-MEMBERSHIP IS NOW VALIDATED AGAINST THE DEFINITION — lane U0 ──────
// This header used to say the opposite: *"there is no project-level definition
// registry at this commit … a swap to a type the definition does not declare is
// REPRESENTABLE today."* The registry now exists (the ONE catalogue in
// `apps/editor/src/services/componentCatalog/`, injected through the
// `ComponentDefinitionResolver` port). With the port wired, a swap to a type the
// occurrence's definition does not declare is REFUSED NAMING BOTH IDS — so
// "wrong type" and "wrong definition" stay different answers — and a swap on an
// occurrence whose definition is NOT LOADED is refused naming the definition,
// because membership cannot be validated against a document that is not there
// (loading it is the escape hatch, stated in the refusal). Without the port the
// Phase-4C format-only behaviour is unchanged and the gap stays declared —
// there is deliberately NO default resolver (see the port's header).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { ComponentNotFoundError, ComponentTypeRefError } from '../errors.js';
import type { ComponentDefinitionResolver } from '../definitionResolver.js';
import type { ComponentData, ComponentsState } from '../store.js';

const TYPE_RE = /^typ_[0-9A-HJKMNP-TV-Z]{26}$/;

export interface SwapComponentTypePayload {
  readonly componentId: string;
  /** The named type to wear (`typ_` + ULID). */
  readonly typeId: string;
}

type Stores = Readonly<{ component: ComponentsState } & Record<string, unknown>>;

export class SwapComponentTypeHandler
  implements CommandHandler<SwapComponentTypePayload, Stores>
{
  readonly type = 'component.swapType';

  readonly affectedStores = ['component'] as const;

  /** ⭐ Lane U0 — the definition catalogue; optional BY CONTRACT (see the header). */
  constructor(private readonly definitions?: ComponentDefinitionResolver) {}

  canExecute(ctx: HandlerContext<Stores>, cmd: SwapComponentTypePayload): ValidationResult {
    const current = ctx.stores.component[cmd.componentId];
    if (!current) {
      return { valid: false, reason: `placed component not found: ${cmd.componentId}` };
    }
    if (!TYPE_RE.test(cmd.typeId ?? '')) {
      return {
        valid: false,
        reason:
          `component.swapType needs a typeId of the form typ_<ULID> (C111 §1.1-a); got ` +
          `${JSON.stringify(cmd.typeId)}.`,
      };
    }
    // ⭐ A SWAP TO THE TYPE ALREADY WORN IS REFUSED, NOT SILENTLY ACCEPTED. A
    // command that mutates nothing still mints a ring-buffer entry, so the user's
    // next Ctrl+Z would be spent undoing an edit that never happened — the undo
    // stack would drift one step away from what the user believes they did. The
    // refusal names both the id and the type so the caller can tell "already done"
    // from "failed".
    if (current.typeId === cmd.typeId) {
      return {
        valid: false,
        reason: `component ${cmd.componentId} already wears type ${cmd.typeId}; nothing to swap.`,
      };
    }
    // ⭐ Lane U0 — membership against the occurrence's OWN definition.
    const membership = this._membershipRefusal(current as ComponentData, cmd.typeId);
    if (membership !== null) {
      return { valid: false, reason: membership };
    }
    return { valid: true };
  }

  /**
   * ⭐ Lane U0 — shared by `canExecute` (reason) and `execute` (typed throw).
   * `null` means: the type is a member, or no resolver is wired (the declared
   * Phase-4C gap, unchanged for hosts without a catalogue).
   */
  private _membershipRefusal(current: ComponentData, typeId: string): string | null {
    if (this.definitions === undefined) return null;
    const view = this.definitions.view(current.definitionId);
    if (view === undefined) {
      return (
        `component.swapType: component ${current.id} references definition ` +
        `${current.definitionId}, which is not loaded in this project's component catalogue — ` +
        `type membership cannot be validated against a document that is not there. Load the ` +
        `definition, then swap.`
      );
    }
    if (!view.types.some((t) => t.id === typeId)) {
      // ⭐ BOTH ids, deliberately: "wrong type" and "wrong definition" must stay
      // distinguishable at the refusal, or the UI can only say "failed".
      return (
        `component.swapType: typeId ${typeId} is not a type of definition ` +
        `${current.definitionId} (${view.name}); its types are ` +
        `[${view.types.map((t) => t.id).join(', ')}].`
      );
    }
    return null;
  }

  execute(ctx: HandlerContext<Stores>, cmd: SwapComponentTypePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const current = ctx.stores.component[cmd.componentId] as ComponentData | undefined;
      if (!current) throw new ComponentNotFoundError(cmd.componentId);
      if (!TYPE_RE.test(cmd.typeId ?? '')) {
        throw new ComponentTypeRefError(
          `component.swapType: typeId ${JSON.stringify(cmd.typeId)} is not a typ_<ULID>.`,
        );
      }
      // ⭐ Lane U0 — re-checked, not assumed (CA-3's throw half); runs again on REDO.
      const membership = this._membershipRefusal(current, cmd.typeId);
      if (membership !== null) throw new ComponentTypeRefError(membership);

      // ⭐ A NESTED PATCH ON ONE FIELD, not a whole-record replace. The inverse Immer
      // generates is then `replace typeId -> <the old one>`, so an undo restores the
      // type and demonstrably cannot disturb `instanceParameters` — the property
      // F-2 depends on is enforced by the SHAPE of the patch, not by a promise in a
      // comment.
      const [next, forward, inverse] = produceCommand<ComponentsState>(
        ctx.stores.component,
        (draft) => {
          (draft as Record<string, Record<string, unknown>>)[cmd.componentId]!['typeId'] =
            cmd.typeId;
        },
      );
      return { forward, inverse, nextStates: { component: next } };
    });
  }
}
