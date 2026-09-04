// §ENVELOPE-SLOT-COVERAGE — the bits both country arms need, defined once.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BuildableEnvelope } from '@pryzm/schemas';
import { ENVELOPE_SLOTS, type EnvelopeSlot, type PointResult } from './slots.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * WHICH SLOTS THE ENGINE ACTUALLY FILLED — read off the SOLVED envelope, never off the pack.
 *
 * ⚠ WHY NOT "count the pack's non-null fields": a pack field can be non-null and still not reach
 * the envelope (a `geometricRule` that supersedes the setback triple, a confidence ceiling, a
 * degenerate solve). The user sees the ENVELOPE. So does this.
 *
 * Setbacks and `permittedUse` are read from `derivationTrace`, because the solved envelope exposes
 * only the inset polygon and the trace is where the engine records that a setback RESOLVED (it
 * calls `addEntry` only for non-null values — that early-return IS the "resolved" predicate).
 * The four scalars are read from the envelope's own fields; `maxFloors` in particular has no
 * `DerivationConstraint` member at all, so the trace could not answer for it.
 */
export function slotsFromEnvelope(env: BuildableEnvelope): EnvelopeSlot[] {
    const traced = new Set<string>(
        (env.derivationTrace ?? [])
            .filter((e) => e.value !== null && !(Array.isArray(e.value) && e.value.length === 0))
            .map((e) => e.constraint),
    );
    const out: EnvelopeSlot[] = [];
    for (const s of ENVELOPE_SLOTS) {
        switch (s) {
            case 'maxHeight':
                if (env.maxHeight_m !== null) out.push(s);
                break;
            case 'maxFloors':
                if (env.maxFloors !== null) out.push(s);
                break;
            case 'maxFAR':
                if (env.maxFAR !== null) out.push(s);
                break;
            case 'maxCoverage':
                if (env.maxCoverage !== null) out.push(s);
                break;
            default:
                if (traced.has(s)) out.push(s);
                break;
        }
    }
    return out;
}

/**
 * A neutral square parcel ring for the solve, in scene-XZ metres. The measurement asks *"does the
 * engine resolve a VALUE for this slot?"*, not *"what footprint does this parcel get?"* — so the
 * ring must be the same for every point or the answer would vary with parcel shape rather than
 * with coverage. `side` is deliberately large enough (40 m) that a normal setback triple does not
 * produce a `degenerate` solve and hide a resolved value behind a geometry failure.
 */
export function squareRing(half: number): Array<{ x: number; z: number }> {
    return [
        { x: -half, z: -half },
        { x: half, z: -half },
        { x: half, z: half },
        { x: -half, z: half },
    ];
}

/** Write both the raw per-point JSON (the audit trail) and the markdown block, next to this tool. */
export function writeArtefact(
    country: string,
    args: unknown,
    frames: Record<string, { frame: string; points: PointResult[] }>,
    markdown: string,
): void {
    const outDir = path.join(HERE, 'out');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
        path.join(outDir, `${country}.slots.json`),
        `${JSON.stringify({ version: '1.0', country, measuredAt: new Date().toISOString(), args, frames }, null, 2)}\n`,
        'utf8',
    );
    fs.writeFileSync(path.join(outDir, `${country}.slots.md`), `${markdown}\n`, 'utf8');
}
