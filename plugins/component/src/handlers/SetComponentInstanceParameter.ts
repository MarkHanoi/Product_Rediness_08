// SetComponentInstanceParameterHandler — `component.setInstanceParameter`.
// §COMPONENT-PLACE (Phase 4C) · ADR-0376 D4 · C110.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THE OTHER HALF OF SPEC §66's F-2: THE OVERRIDE THAT DOES *NOT* FOLLOW THE TYPE.
// ═══════════════════════════════════════════════════════════════════════════════
//
// ADR-0376 D4 ordered the ladder *instance > type > expression > definition
// default*, and this verb writes the TOP rung: **a user's deliberate act on this
// occurrence**. `component.swapType` moves the rung below it and cannot see this
// one, which is what makes "change the type, the nineteen follow and the overridden
// one does not" a property of the model rather than a behaviour someone maintains.
//
// ─── ⭐ CLEARING AN OVERRIDE IS A DIFFERENT ACT FROM SETTING ONE ──────────────
// `value` sets; `clear: true` REMOVES the key, returning the parameter to the
// type → expression → definition-default ladder. They are two payload fields rather
// than one nullable `value` on purpose: the L0 schema deliberately excludes `null`
// from `ComponentParameterValue`, so a `null` arriving as a VALUE and a `null`
// meaning CLEAR would be the same bytes carrying two different instructions. That is
// the failure-vs-empty collapse ([[context-data-honesty-family]]) at the one place
// in this family where it would silently delete a user's authored value.
//
// ⛔ SENDING BOTH, OR NEITHER, IS REFUSED. Neither is not a no-op: a command that
// mutates nothing still mints a ring-buffer entry, and the user's next Ctrl+Z would
// spend itself on an edit that never happened.
//
// ─── ⭐ THE PARAMETER IS NOW VALIDATED AGAINST THE DEFINITION — lane U0 ────────
// This header used to declare three gaps: parameter-not-declared, kind-not-
// instance, and value-shape-vs-dataType (C110 §3.5-a) — all three blocked on
// *"the definition document, which needs the registry."* The registry now exists
// (the ONE catalogue in `apps/editor/src/services/componentCatalog/`, injected
// through the `ComponentDefinitionResolver` port), and with it wired the SET leg
// refuses all three BY NAME.
//
// ⚠ THE CLEAR LEG IS DELIBERATELY NOT GATED ON THE CATALOGUE. Clearing removes an
// override — it moves the occurrence TOWARD the ladder, asserting nothing new —
// and refusing to remove data because the definition is not currently loaded
// would be a regression wearing a contract citation
// ([[refusing-half-needs-its-escape-hatch]]). The existing checks (component
// exists, key format, override actually present) still guard it. Without the port
// the Phase-4C behaviour is unchanged and the gaps stay DECLARED, never faked.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { ComponentNotFoundError, ComponentParameterWriteError } from '../errors.js';
import { valueShapeRefusal, type ComponentDefinitionResolver } from '../definitionResolver.js';
import type { ComponentData, ComponentsState } from '../store.js';

const PARAMETER_RE = /^par_[0-9A-HJKMNP-TV-Z]{26}$/;

export interface SetComponentInstanceParameterPayload {
  readonly componentId: string;
  /** The parameter being overridden, by ID (`par_` + ULID) — never by name. */
  readonly parameterId: string;
  /**
   * The override to write. Mutually exclusive with `clear`.
   *
   * ⚠ A number here is in **canonical units** (metres for a length — ADR-0376 D3).
   * The `1200mm` a user types is converted by `@pryzm/family-runtime`'s typed unit
   * literals at parse; the authored spelling is provenance, never the stored value.
   */
  readonly value?: number | string | boolean;
  /** Remove the override, returning the parameter to the ladder below it. */
  readonly clear?: boolean;
}

type Stores = Readonly<{ component: ComponentsState } & Record<string, unknown>>;

export class SetComponentInstanceParameterHandler
  implements CommandHandler<SetComponentInstanceParameterPayload, Stores>
{
  readonly type = 'component.setInstanceParameter';

  readonly affectedStores = ['component'] as const;

  /** ⭐ Lane U0 — the definition catalogue; optional BY CONTRACT (see the header). */
  constructor(private readonly definitions?: ComponentDefinitionResolver) {}

  canExecute(
    ctx: HandlerContext<Stores>,
    cmd: SetComponentInstanceParameterPayload,
  ): ValidationResult {
    const current = ctx.stores.component[cmd.componentId];
    if (!current) {
      return { valid: false, reason: `placed component not found: ${cmd.componentId}` };
    }
    if (!PARAMETER_RE.test(cmd.parameterId ?? '')) {
      return {
        valid: false,
        reason:
          `parameterId ${JSON.stringify(cmd.parameterId)} is not a par_<ULID>. Overrides are ` +
          `keyed by parameter ID, never by display name — a rename would silently orphan a ` +
          `name-keyed override.`,
      };
    }
    const setting = cmd.value !== undefined;
    const clearing = cmd.clear === true;
    if (setting && clearing) {
      return {
        valid: false,
        reason:
          `component.setInstanceParameter was sent BOTH a value and clear:true for ` +
          `${cmd.parameterId}. Setting and clearing are different acts; send one.`,
      };
    }
    if (!setting && !clearing) {
      return {
        valid: false,
        reason:
          `component.setInstanceParameter needs either a value or clear:true for ` +
          `${cmd.parameterId}. A command that changes nothing still costs the user a Ctrl+Z.`,
      };
    }
    if (setting) {
      const t = typeof cmd.value;
      if (t !== 'number' && t !== 'string' && t !== 'boolean') {
        return {
          valid: false,
          reason: `instance parameter value must be a number, string or boolean; got ${t}.`,
        };
      }
      if (t === 'number' && !Number.isFinite(cmd.value as number)) {
        return { valid: false, reason: 'instance parameter value must be a finite number.' };
      }
      // ⭐ Lane U0 — the three definition checks, on the SET leg only (header).
      const defRefusal = this._setRefusal(current as ComponentData, cmd.parameterId, cmd.value as number | string | boolean);
      if (defRefusal !== null) {
        return { valid: false, reason: defRefusal };
      }
    }
    if (clearing && (current as ComponentData).instanceParameters[cmd.parameterId] === undefined) {
      // ⭐ CLEARING SOMETHING THAT IS NOT OVERRIDDEN IS REFUSED, not silently
      // accepted. It would mutate nothing while minting an undo entry — and, worse,
      // it would tell the caller the override had been removed when there was never
      // one, which is how a UI ends up showing the type value as an override.
      return {
        valid: false,
        reason:
          `component ${cmd.componentId} has no instance override for ${cmd.parameterId}; ` +
          `there is nothing to clear.`,
      };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<Stores>,
    cmd: SetComponentInstanceParameterPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const current = ctx.stores.component[cmd.componentId] as ComponentData | undefined;
      if (!current) throw new ComponentNotFoundError(cmd.componentId);
      if (!PARAMETER_RE.test(cmd.parameterId ?? '')) {
        throw new ComponentParameterWriteError(
          `component.setInstanceParameter: parameterId ${JSON.stringify(cmd.parameterId)} ` +
            `is not a par_<ULID>.`,
        );
      }
      const setting = cmd.value !== undefined;
      const clearing = cmd.clear === true;
      if (setting === clearing) {
        throw new ComponentParameterWriteError(
          `component.setInstanceParameter: send exactly one of value / clear:true ` +
            `(got value=${JSON.stringify(cmd.value)}, clear=${JSON.stringify(cmd.clear)}).`,
        );
      }
      // ⭐ Lane U0 — re-checked, not assumed (CA-3's throw half); runs again on REDO.
      if (setting) {
        const defRefusal = this._setRefusal(current, cmd.parameterId, cmd.value as number | string | boolean);
        if (defRefusal !== null) throw new ComponentParameterWriteError(defRefusal);
      }

      // A NESTED patch on the one map entry — so the inverse Immer generates is
      // scoped to that entry and an undo cannot disturb the occurrence's type,
      // origin, host or any other override.
      const [next, forward, inverse] = produceCommand<ComponentsState>(
        ctx.stores.component,
        (draft) => {
          const rec = (draft as Record<string, Record<string, unknown>>)[cmd.componentId]!;
          const params = rec['instanceParameters'] as Record<string, unknown>;
          if (clearing) delete params[cmd.parameterId];
          else params[cmd.parameterId] = cmd.value as number | string | boolean;
        },
      );
      return { forward, inverse, nextStates: { component: next } };
    });
  }

  /**
   * ⭐ Lane U0 — the SET-leg definition checks, shared by `canExecute` (reason)
   * and `execute` (typed throw). `null` means: the write resolves, or no resolver
   * is wired (the declared Phase-4C gap, unchanged for hosts without a catalogue).
   */
  private _setRefusal(
    current: ComponentData,
    parameterId: string,
    value: number | string | boolean,
  ): string | null {
    if (this.definitions === undefined) return null;
    const view = this.definitions.view(current.definitionId);
    if (view === undefined) {
      return (
        `component.setInstanceParameter: component ${current.id} references definition ` +
        `${current.definitionId}, which is not loaded in this project's component catalogue — ` +
        `the parameter cannot be validated against a document that is not there. Load the ` +
        `definition, then set the override (clearing an existing override needs no catalogue).`
      );
    }
    const param = view.parameters.find((p) => p.id === parameterId);
    if (param === undefined) {
      return (
        `component.setInstanceParameter: ${parameterId} is not a parameter of definition ` +
        `${current.definitionId} (${view.name}); it declares ` +
        `[${view.parameters.map((p) => p.id).join(', ')}].`
      );
    }
    if (param.kind !== 'instance') {
      return (
        `component.setInstanceParameter: parameter ${parameterId} (${param.name}) of definition ` +
        `${current.definitionId} has kind '${param.kind}' — a TYPE parameter is not overridable ` +
        `per occurrence (C111); edit the type instead.`
      );
    }
    const shape = valueShapeRefusal(param.dataType, value);
    if (shape !== null) {
      return (
        `component.setInstanceParameter: override for parameter ${parameterId} (${param.name}) ` +
        `of definition ${current.definitionId}: ${shape} (C110 §3.5-a).`
      );
    }
    return null;
  }
}
