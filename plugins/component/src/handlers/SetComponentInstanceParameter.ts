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
// ─── ⛔ IT DOES NOT VALIDATE THE PARAMETER AGAINST THE DEFINITION ─────────────
// Same honest gap as `component.swapType`: there is no project-level definition
// registry at this commit, so this handler cannot say whether `par_…` is a
// parameter the definition declares, whether its `kind` is `instance` rather than
// `type` (C111 — a TYPE parameter must not be overridable per occurrence), or
// whether the value's unit kind matches the parameter's `dataType` (C110 §3.5-a,
// whose `UnitMismatchError` lane 4A made throwable). ⚠ ALL THREE ARE REAL,
// DECLARED GAPS — the third especially: 4A built the kind algebra, and reaching it
// from here needs the definition document, which needs the registry. Naming them is
// the C84 §6.2c obligation; a fabricated "looks fine" check would be worse.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { ComponentNotFoundError, ComponentParameterWriteError } from '../errors.js';
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
}
