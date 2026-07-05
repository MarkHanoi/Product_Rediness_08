// Furnish all-floors DRIVER — pure orchestration for the multi-floor /
// multi-apartment fan-out (§FIX-FURNISH-ALL-FLOORS-COVERAGE, L-101).
//
// Extracted from furnishLayoutTrigger so the enumeration + per-unit coverage +
// per-level robustness can be unit-tested WITHOUT the heavy runtime/store wiring
// the trigger pulls in. The trigger injects a `furnishOne(levelId)` closure that
// does the real work (set active level → emit `furnish.layout-execute` → await
// `furnish.layout-executed`); this module only sequences the floors, tolerates a
// per-floor failure, and rolls the coverage up into a report.
//
// C11 (element-creation pipeline) — the all-floors driver is the orchestration
// layer above per-level furnishing. P8 — both exported functions carry a span.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('@pryzm/editor', '0.1.0');

/** Per-level furnish coverage, resolved from `furnish.layout-executed` (or a
 *  `timedOut` marker when a storey never reported back). */
export interface FurnishLevelCoverage {
    levelId: string;
    placedCount: number;
    roomCount: number;
    roomsFurnished: number;
    roomsSkipped: number;
    skipped: ReadonlyArray<{ roomId: string; name?: string; reason: string }>;
    timedOut: boolean;
}

/** Aggregate roll-up + per-floor report lines. */
export interface FurnishCoverageSummary {
    floors: number;
    totalPlaced: number;
    totalFurnished: number;
    totalSkipped: number;
    timedOutFloors: number;
    lines: string[];
}

/** Sequence furnishing across EVERY level id, robust to a per-level failure:
 *  one storey throwing must NOT abort the remaining floors (it is recorded as a
 *  skipped level with an explicit reason and the loop continues). Returns the
 *  per-level coverage in enumeration order. */
export async function driveFurnishAllFloors(
    levelIds: readonly string[],
    furnishOne: (levelId: string) => Promise<FurnishLevelCoverage>,
): Promise<FurnishLevelCoverage[]> {
    return _tracer.startActiveSpan(
        'pryzm.editor.furnish.allFloors.drive',
        { attributes: { 'pryzm.furnish.floorCount': levelIds.length } },
        async (span) => {
            const coverage: FurnishLevelCoverage[] = [];
            try {
                for (const levelId of levelIds) {
                    try {
                        coverage.push(await furnishOne(levelId));
                    } catch (err) {
                        coverage.push({
                            levelId, placedCount: 0, roomCount: 0,
                            roomsFurnished: 0, roomsSkipped: 0,
                            skipped: [{ roomId: '', reason: `level threw: ${err instanceof Error ? err.message : String(err)}` }],
                            timedOut: false,
                        });
                    }
                }
                return coverage;
            } finally {
                span.end();
            }
        },
    );
}

/** Roll per-level coverage up into totals + human-readable report lines. */
export function summariseFurnishCoverage(
    coverage: readonly FurnishLevelCoverage[],
): FurnishCoverageSummary {
    return _tracer.startActiveSpan(
        'pryzm.editor.furnish.allFloors.summarise',
        { attributes: { 'pryzm.furnish.floorCount': coverage.length } },
        (span) => {
            try {
                const lines: string[] = [];
                for (const c of coverage) {
                    const flag = c.timedOut ? ' [TIMED-OUT]' : '';
                    lines.push(
                        `level=${c.levelId} furnished=${c.roomsFurnished}/${c.roomCount} ` +
                        `items=${c.placedCount} skipped=${c.roomsSkipped}${flag}` +
                        (c.skipped.length > 0
                            ? ` — ${c.skipped.map(s => `${s.name ?? s.roomId}(${s.reason})`).join('; ')}`
                            : ''),
                    );
                }
                return {
                    floors: coverage.length,
                    totalPlaced: coverage.reduce((s, c) => s + c.placedCount, 0),
                    totalFurnished: coverage.reduce((s, c) => s + c.roomsFurnished, 0),
                    totalSkipped: coverage.reduce((s, c) => s + c.roomsSkipped, 0),
                    timedOutFloors: coverage.filter(c => c.timedOut).length,
                    lines,
                };
            } finally {
                span.end();
            }
        },
    );
}
