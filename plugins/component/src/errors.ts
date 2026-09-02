// Typed placed-component errors — §COMPONENT-PLACE (audit §12 Phase 4C).
//
// Mirrors `plugins/balcony/src/errors.ts` and `plugins/pool/src/errors.ts`: one
// typed DomainError per failure mode, so a handler never fails silently (C16 CA-3).
//
// ⛔ THIS IS NOT A NEW REFUSAL VOCABULARY. The audit's standing review rule R1
// rejects a lane that mints one, and this file mints none: it is the same
// per-family `<Family>SystemError` subclass tree every element plugin here carries,
// and the USER-FACING refusal text is produced by `canExecute`'s `reason` — the
// C16 CA-3 channel — not by these class names.

export class ComponentSystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComponentSystemError';
  }
}

/** The named occurrence is not in the component store. */
export class ComponentNotFoundError extends ComponentSystemError {
  constructor(componentId: string) {
    super(`placed component not found: ${componentId}`);
    this.name = 'ComponentNotFoundError';
  }
}

/**
 * The placement names no definition, or names one whose id is not a `fam_` + ULID.
 *
 * ⚠ THIS IS A REFUSAL, NOT A DEGRADATION, and the distinction is the reason the
 * class exists. A component with an empty `definitionId` is a legal PARSE of the L0
 * schema — `Component.parse({})` must succeed, which is `defineElement`'s contract
 * for every family — so nothing downstream would throw. It would simply be an
 * occurrence of nothing: unresolvable, unschedulable, and indistinguishable in the
 * store from a real one. Placing it is the failure; refusing at the boundary is
 * what keeps "could not resolve a definition" and "was placed without one" from
 * becoming the same value ([[context-data-honesty-family]]).
 */
export class ComponentDefinitionRefError extends ComponentSystemError {
  constructor(message: string) {
    super(message);
    this.name = 'ComponentDefinitionRefError';
  }
}

/** The named type id is absent or malformed (`typ_` + ULID). */
export class ComponentTypeRefError extends ComponentSystemError {
  constructor(message: string) {
    super(message);
    this.name = 'ComponentTypeRefError';
  }
}

/**
 * An instance-parameter write that cannot be carried out as asked — a malformed
 * `par_` key, a value of a kind the record cannot hold, `value` and `clear` sent
 * together or neither sent at all.
 *
 * ⭐ `value` AND `clear` BOTH ABSENT IS A REFUSAL, NOT A NO-OP. A command that
 * mutates nothing still mints a ring-buffer entry, so the user's next Ctrl+Z would
 * spend itself on an edit that never happened. C16 CA-3's rule is that a command
 * which cannot do what it was asked says so.
 */
export class ComponentParameterWriteError extends ComponentSystemError {
  constructor(message: string) {
    super(message);
    this.name = 'ComponentParameterWriteError';
  }
}

export function isComponentSystemError(e: unknown): e is ComponentSystemError {
  return e instanceof ComponentSystemError;
}
