// The registered instrument priority tables, keyed by the caller's jurisdiction id.
//
// A jurisdiction ABSENT from this registry has NO table, and `resolveParameter`
// answers `conflicted('no-priority-table')` for any real disagreement. That is the
// designed behaviour for France/Paris today: precedence between `plub_filet`,
// `plub_hauteur` and `plub_hmc` is genuinely UNKNOWN, and a refusal that produces a
// data-sourcing question beats a default that produces a silent wrong number.
//
// Registering a table is therefore a POSITIVE CLAIM that the jurisdiction's
// precedence has been sourced and cited. Do not add an empty one to make a test pass.

import { type InstrumentPriorityTable } from '../priority.js';
import { GERMANY_PRIORITY_TABLE } from './germany.js';
import { MADRID_PRIORITY_TABLE } from './madrid.js';
import { DENMARK_PRIORITY_TABLE } from './denmark.js';

export * from './germany.js';
export * from './madrid.js';
export * from './denmark.js';

const REGISTRY: readonly InstrumentPriorityTable[] = [
    GERMANY_PRIORITY_TABLE,
    MADRID_PRIORITY_TABLE,
    DENMARK_PRIORITY_TABLE,
];

/**
 * The priority table for a jurisdiction, or `undefined` when none is registered.
 *
 * ⚠ `undefined` is a legitimate, honest answer — pass it straight to
 * `resolveParameter`, which refuses rather than guesses. Do NOT substitute a
 * "default" table.
 */
export function priorityTableFor(jurisdiction: string): InstrumentPriorityTable | undefined {
    return REGISTRY.find((t) => t.jurisdiction === jurisdiction);
}

/** Every registered table (audit / docs). */
export function registeredPriorityTables(): readonly InstrumentPriorityTable[] {
    return REGISTRY;
}
