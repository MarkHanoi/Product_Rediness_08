/**
 * cross handler set — cascade-rule registration seam (PR-11).
 *
 * ⚠ HONESTY HEADER (2026-08-13, PR-11). The previous version of this file
 * claimed "handlers now wired" and probed a `bus.registerCascade` surface
 * that has NEVER existed on `@pryzm/command-bus` — so even a caller that
 * existed would have hit a `console.warn` and silently registered nothing.
 * That is the §10.2b coverage-lie shape the BIM30 gap register names on
 * PR-11 itself.
 *
 * The REAL registry is `CascadeRunner` (`packages/command-bus/src/cascade.ts`),
 * whose recorded disposition (BIM30-DISPOSITION-DOCKET §1 / ADR-0322 verdict,
 * STR-06 §18) is: PROMOTED as the cascade branch of the future
 * ConsequencePlanner, with production registration DEFERRED to plan R2 —
 * global registration before R2 is explicitly out of scope.  This function is
 * therefore the R2 wiring point, not a bootstrap call site:
 *
 *   • handed a live `CascadeRunner`, it registers the three rules and
 *     REPORTS what it registered (idempotently — re-registration is not an
 *     error, it is reported as `alreadyRegistered`);
 *   • handed anything else, it returns a typed `CapabilityRefusal`
 *     (C78 §8 / C80 §1.4) as a VALUE — never a warn-and-skip, never a
 *     silent void.  A registration that cannot happen must say so in a
 *     shape the caller is forced to read.
 *
 * Note the second half of PR-11 lives OUTSIDE this plugin: the
 * `room.recomputeBoundary` handler in `plugins/rooms` is a deliberate no-op
 * legacy bridge (L-79 / §FIX-ROOM-SIBLING-HANDLERS-STORE, blocked on F-1.4).
 * Registering these rules in production before that handler does real work
 * would make the cascade synthesise commands whose execution changes nothing.
 */

import {
  capabilityRefused,
  type CapabilityRefusal,
  type CascadeRule,
} from '@pryzm/plugin-sdk';
import {
  buildSlabWallCascadeRule,
  type SlabWallCascadeDeps,
} from '../slab-wall.js';
import {
  buildStairHandrailCascadeRule,
  type StairHandrailCascadeDeps,
} from '../stair-handrail.js';
import {
  buildWallRoomCascadeRule,
  type WallRoomCascadeDeps,
} from '../wall-room.js';
import { CROSS_COMMANDS } from '../intent.js';

export type { CrossCommandId } from '../intent.js';
export { CROSS_COMMANDS };

/** Combined deps for all three cascade rules. */
export interface CrossHandlerDeps
  extends SlabWallCascadeDeps,
    StairHandrailCascadeDeps,
    WallRoomCascadeDeps {}

export const CROSS_HANDLER_TYPES = [CROSS_COMMANDS.REGISTER_RULES] as const;
export type CrossHandlerType = typeof CROSS_HANDLER_TYPES[number];

/**
 * The registry surface this seam requires — structurally the
 * `CascadeRunner` API (`register` + `has`), accepted structurally so tests
 * and the R2 planner can hand in the real runner or a conforming wrapper.
 */
export interface CascadeRuleRegistry {
  register(rule: CascadeRule): void;
  has(key: string): boolean;
}

/** Successful registration report — what was newly registered vs already there. */
export interface CrossRulesRegistered {
  readonly kind: 'registered';
  /** Rule keys registered BY THIS CALL. */
  readonly ruleKeys: readonly string[];
  /** Rule keys that were already present on the registry (idempotent re-call). */
  readonly alreadyRegistered: readonly string[];
}

/** Registration either happens and is reported, or is refused with a typed reason. */
export type CrossRegistrationResult = CrossRulesRegistered | CapabilityRefusal;

function isCascadeRuleRegistry(x: unknown): x is CascadeRuleRegistry {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as CascadeRuleRegistry).register === 'function' &&
    typeof (x as CascadeRuleRegistry).has === 'function'
  );
}

/**
 * Register the three cross-element cascade rules with the cascade registry.
 *
 * @param registry — a live `CascadeRunner` (or structural equivalent). The
 *   old signature took the CommandBus and probed a `registerCascade` method
 *   that never existed; passing a bus now yields a typed refusal instead of
 *   a silent skip.
 * @returns a report of what was registered, or a `CapabilityRefusal`
 *   (reason `ENGINE_NOT_AVAILABLE`) when no conforming registry was handed in.
 */
export function registerCrossHandlers(
  registry: unknown,
  deps: CrossHandlerDeps,
): CrossRegistrationResult {
  const rules: readonly CascadeRule[] = [
    buildSlabWallCascadeRule(deps),
    buildStairHandrailCascadeRule(deps),
    buildWallRoomCascadeRule(deps),
  ];

  if (!isCascadeRuleRegistry(registry)) {
    return capabilityRefused({
      commandType: CROSS_COMMANDS.REGISTER_RULES,
      reason: 'ENGINE_NOT_AVAILABLE',
      asked: rules.length,
      unaccountedFor: rules.length,
      protects:
        'the cross-element derived-update coverage claim — a rule that is not ' +
        'on a live CascadeRunner must never be reported as wired (PR-11, C72 §2.2)',
      detail:
        `asked to register ${rules.length} cascade rules; 0 of ${rules.length} could be ` +
        'registered: no CascadeRunner-shaped registry (register + has) was provided. ' +
        'CommandBus has no cascade surface; production registration is deferred to ' +
        'BIM30 R2 per the disposition docket §1 (STR-06 §18).',
    });
  }

  const ruleKeys: string[] = [];
  const alreadyRegistered: string[] = [];
  for (const rule of rules) {
    if (registry.has(rule.key)) {
      alreadyRegistered.push(rule.key);
    } else {
      registry.register(rule);
      ruleKeys.push(rule.key);
    }
  }
  return { kind: 'registered', ruleKeys, alreadyRegistered };
}
