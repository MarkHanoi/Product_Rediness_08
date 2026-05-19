// Shared command-side types for the family-editor constraint commands (S52 D2).
//
// Every constraint command takes the constraint store (for add/remove)
// plus an explicit set of entity ids — the bus is intentionally
// decoupled from the selection store so commands can be replayed from
// a recorded log without a live cursor.

import type { ConstraintStore } from '../../stores/constraintStore.js';
import type { EntityId } from '../../sketch/entities.js';

export interface ConstraintCommandContext {
  readonly constraintStore: ConstraintStore;
}

export interface AddCoincidentArgs {
  readonly p1: EntityId;
  readonly p2: EntityId;
}

export interface AddDistanceArgs {
  readonly p1: EntityId;
  readonly p2: EntityId;
  /** Either a literal mm number OR a parameter name resolved by the
   *  solver via `parameterValues` at solve time. */
  readonly value: number | string;
}

export interface AddParallelArgs {
  readonly l1: EntityId;
  readonly l2: EntityId;
}

export interface AddPerpendicularArgs {
  readonly l1: EntityId;
  readonly l2: EntityId;
}

export interface AddFixedArgs {
  readonly p: EntityId;
  readonly x: number;
  readonly y: number;
}

export const CONSTRAINT_COMMAND_CATEGORY = 'constraint';
