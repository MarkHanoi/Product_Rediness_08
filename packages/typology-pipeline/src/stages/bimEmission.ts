// A.1 (Phase A · Sprint 1) — Stage 7 helpers: bimEmission.
//
// Stage 7 translates the validated plan into a sequence of editor
// `Command` objects (per C16 Command Authoring Protocol).  These commands
// are NOT executed here — the pipeline returns them to the L5 dispatch
// caller, which feeds them to the editor's commandBus inside one batch
// (single undo).
//
// Apartment pack emits: wall.batch.create + wall.createOpening +
// door.batch.create + window.batch.create + slab.batch.create + ...
// House pack adds: roof.batch.create + foundation.batch.create.
// Office pack adds: partition-system.batch.create + ceiling-grid.batch.create.
//
// This file ships ONLY the pure shape adapter — the per-typology emitters
// live in each pack's own package.

import type { EmittedCommand } from '../types.js';

/**
 * Concatenate command groups (eg "wall commands" + "door commands" + ...)
 * preserving order — the editor's batchCoordinator dispatches them in
 * this exact sequence inside one runBatch().
 */
export function concatCommandGroups(
    groups: readonly (readonly EmittedCommand[])[],
): readonly EmittedCommand[] {
    const out: EmittedCommand[] = [];
    for (const g of groups) {
        for (const c of g) {
            out.push(c);
        }
    }
    return out;
}

/**
 * Type-guard for an `EmittedCommand`.  Validates the shape only — the
 * commandBus runs the full per-command Zod validation when the dispatch
 * caller fires them.
 */
export function isEmittedCommand(value: unknown): value is EmittedCommand {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return typeof v.type === 'string' && 'payload' in v;
}
