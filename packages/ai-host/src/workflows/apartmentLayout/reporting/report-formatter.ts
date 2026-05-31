// Apartment-layout VALIDATION REPORT FORMATTER.
//
// Pure string-formatting layer ABOVE the orchestrator
// (`validators/orchestrator.ts`). Takes the FROZEN
// `AggregatedViolationReport` and produces a human-readable Markdown
// report suitable for:
//   • CLI / console output  (`pryzmGenerateApartmentLayout()` echoes)
//   • server logs / OpenTelemetry attributes
//   • the apartment-layout modal status panel (eventually)
//
// Design rules:
//   • PURE — no I/O, no Date.now, no random IDs, no closures over module
//     state. Same input ⇒ exact same string (every test in
//     `reportFormatter.test.ts` is byte-stable).
//   • POJO inputs/outputs — consistent with the validators tree.
//   • NO `import * as THREE`, NO DOM, NO async, NO @pryzm/schemas dep.
//   • Map iteration order is non-deterministic across runtimes — every
//     grouping helper sorts keys (lex) BEFORE building the output Map.
//   • No ANSI escapes anywhere — terminals that want colour can post-
//     process, but the canonical surface stays clean for pipe / log
//     consumption.
//
// Sister file to `validators/orchestrator.ts`'s `summarise()` — that one
// returns a single 1-line summary; this one returns the full Markdown
// surface and richer grouped views.

import type { DimensionalViolation } from '../validators/dimensional/types.js';
import type { TopologyViolation } from '../validators/topology/types.js';
import type { AggregatedViolationReport } from '../validators/orchestrator-types.js';

// ── Options ────────────────────────────────────────────────────────────────

/**
 * Knobs for `formatViolationReport`. All optional — every default is the
 * "full Markdown render" surface used by the modal.
 */
export interface FormatOptions {
    /** Include per-violation details (default `true`). */
    readonly verbose?: boolean;
    /** Maximum violations per class to list before truncating (default `5`). */
    readonly maxPerClass?: number;
    /** Include a legend explaining classIds + severity (default `true`). */
    readonly includeLegend?: boolean;
}

// ── Internal helpers (kept module-local) ───────────────────────────────────

/**
 * Sorted union of every `classId` that appears in either violation array.
 * Sorting is lex on the raw string — this puts 'A-*' before 'G-*' which is
 * the same ordering the orchestrator's `summarise()` produces.
 */
function sortedClassIds(report: AggregatedViolationReport): readonly string[] {
    const set = new Set<string>();
    for (const v of report.dimensional) set.add(v.classId);
    for (const v of report.topology) set.add(v.classId);
    return Array.from(set).sort();
}

/** Stable display label for one classId — e.g. `'G-1'` → `'G-1 area-max'`. */
const CLASS_LABEL: Readonly<Record<string, string>> = Object.freeze({
    'G-1': 'G-1 area-max',
    'G-2': 'G-2 width-max',
    'G-3': 'G-3 aspect-ratio',
    'G-5': 'G-5 wall-usability',
    'G-6': 'G-6 circulation-width',
    'G-7': 'G-7 frontage',
    'G-8': 'G-8 hierarchy',
    'G-10': 'G-10 lighting',
    'A-1': 'A-1 mandatory',
    'A-2': 'A-2 preferred',
    'A-3': 'A-3 forbidden',
    'A-4': 'A-4 privacy',
    'A-5': 'A-5 acoustic',
    'A-6': 'A-6 wet-cluster',
    'A-7': 'A-7 frontage-topology',
});

/** "1 violation" / "N violations" — saves a ternary at every call site. */
function noun(count: number, singular: string, plural: string): string {
    return count === 1 ? singular : plural;
}

/**
 * Highest-severity verdict across the violations of one classId in the
 * report. Used to colour the summary table's "Severity" column.
 *
 * Returns `'error'` if any violation of that class is an error,
 * else `'warning'` if at least one warning exists,
 * else `'-'` if the class has no violations.
 */
function classSeverity(
    report: AggregatedViolationReport,
    classId: string,
): 'error' | 'warning' | '-' {
    let sawWarning = false;
    for (const v of report.dimensional) {
        if (v.classId !== classId) continue;
        if (v.severity === 'error') return 'error';
        if (v.severity === 'warning') sawWarning = true;
    }
    for (const v of report.topology) {
        if (v.classId !== classId) continue;
        if (v.severity === 'error') return 'error';
        if (v.severity === 'warning') sawWarning = true;
    }
    return sawWarning ? 'warning' : '-';
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Format an aggregated violation report as a Markdown string.
 *
 * Layout:
 *
 *   ## Apartment Layout Validation Report
 *   **Total**: N violations (X errors, Y warnings)
 *
 *   ### Summary by class
 *   | Class | Count | Severity |
 *   | --- | --- | --- |
 *   | G-1 area-max | 2 | error |
 *   | A-3 forbidden | 1 | error |
 *
 *   ### Dimensional violations (G-classes)
 *   - **G-1** [roomId]: observed 9.5 m², max 8.0 m² — "<message>"
 *
 *   ### Topology violations (A-classes)
 *   - **A-3** [roomAId → roomBTypeName]: "<message>"
 *
 *   ### Legend
 *   - G-1..G-10: dimensional constraints
 *   - A-1..A-8: topological constraints
 *   - error: hard legality fail
 *   - warning: soft penalty
 *
 * If `report.total === 0` the function returns the short "no violations"
 * Markdown form — see header in `reportFormatter.test.ts` for the byte-
 * stable expected value.
 */
export function formatViolationReport(
    report: AggregatedViolationReport,
    opts: FormatOptions = {},
): string {
    const verbose = opts.verbose ?? true;
    const maxPerClass = opts.maxPerClass ?? 5;
    const includeLegend = opts.includeLegend ?? true;

    // ─── Empty report fast-path ────────────────────────────────────────────
    if (report.total === 0) {
        return [
            '## Apartment Layout Validation Report',
            '',
            '**No violations.** Layout passes all 15 validator slices.',
        ].join('\n');
    }

    const lines: string[] = [];
    lines.push('## Apartment Layout Validation Report');
    lines.push('');
    lines.push(
        `**Total**: ${report.total} ${noun(report.total, 'violation', 'violations')} ` +
        `(${report.errors} ${noun(report.errors, 'error', 'errors')}, ` +
        `${report.warnings} ${noun(report.warnings, 'warning', 'warnings')})`,
    );

    // ─── Summary by class (always present, even when !verbose) ─────────────
    lines.push('');
    lines.push('### Summary by class');
    lines.push('| Class | Count | Severity |');
    lines.push('| --- | --- | --- |');
    const classes = sortedClassIds(report);
    for (const cid of classes) {
        const label = CLASS_LABEL[cid] ?? cid;
        const count = report.violationsByClass[cid] ?? 0;
        const sev = classSeverity(report, cid);
        lines.push(`| ${label} | ${count} | ${sev} |`);
    }

    // ─── Per-violation detail sections (only when verbose) ─────────────────
    if (verbose) {
        if (report.dimensional.length > 0) {
            lines.push('');
            lines.push('### Dimensional violations (G-classes)');
            // Group by classId (lex-sorted) for stable output.
            const byClass = new Map<string, DimensionalViolation[]>();
            for (const v of report.dimensional) {
                const arr = byClass.get(v.classId) ?? [];
                arr.push(v);
                byClass.set(v.classId, arr);
            }
            const dimClasses = Array.from(byClass.keys()).sort();
            for (const cid of dimClasses) {
                const arr = byClass.get(cid)!;
                const shown = arr.slice(0, maxPerClass);
                for (const v of shown) {
                    lines.push(
                        `- **${v.classId}** [${v.roomId}]: observed ${v.observed}, ` +
                        `max ${v.maximum} — "${v.message}"`,
                    );
                }
                if (arr.length > shown.length) {
                    const more = arr.length - shown.length;
                    lines.push(`- ...${more} more truncated`);
                }
            }
        }

        if (report.topology.length > 0) {
            lines.push('');
            lines.push('### Topology violations (A-classes)');
            const byClass = new Map<string, TopologyViolation[]>();
            for (const v of report.topology) {
                const arr = byClass.get(v.classId) ?? [];
                arr.push(v);
                byClass.set(v.classId, arr);
            }
            const topoClasses = Array.from(byClass.keys()).sort();
            for (const cid of topoClasses) {
                const arr = byClass.get(cid)!;
                const shown = arr.slice(0, maxPerClass);
                for (const v of shown) {
                    lines.push(
                        `- **${v.classId}** [${v.roomAId} → ${v.roomBTypeName}]: ` +
                        `"${v.message}"`,
                    );
                }
                if (arr.length > shown.length) {
                    const more = arr.length - shown.length;
                    lines.push(`- ...${more} more truncated`);
                }
            }
        }
    }

    // ─── Legend ────────────────────────────────────────────────────────────
    if (includeLegend) {
        lines.push('');
        lines.push('### Legend');
        lines.push('- G-1..G-10: dimensional constraints');
        lines.push('- A-1..A-8: topological constraints');
        lines.push('- error: hard legality fail');
        lines.push('- warning: soft penalty');
    }

    return lines.join('\n');
}

/**
 * One-line human-readable summary, richer than the orchestrator's
 * `summarise()` (which is intentionally minimal).
 *
 * Examples:
 *   • Empty:  `"0 violations"`
 *   • Mixed:  `"3 violations: 2 errors, 1 warning (A-3×1, G-1×2)"`
 *
 * Same format spirit as `summarise()` — sorted class tally, error/warning
 * pluralisation — so the two helpers stay drop-in compatible. No ANSI
 * colours: the line is safe for pipe / log consumption.
 */
export function formatViolationLine(
    report: AggregatedViolationReport,
): string {
    if (report.total === 0) return '0 violations';
    const tallyKeys = Object.keys(report.violationsByClass).sort();
    const tally = tallyKeys
        .map(k => `${k}×${report.violationsByClass[k]}`)
        .join(', ');
    return (
        `${report.total} ${noun(report.total, 'violation', 'violations')}: ` +
        `${report.errors} ${noun(report.errors, 'error', 'errors')}, ` +
        `${report.warnings} ${noun(report.warnings, 'warning', 'warnings')} ` +
        `(${tally})`
    );
}

/**
 * Group violations by `classId`. Keys are lex-sorted on insertion so the
 * Map's iteration order is deterministic across runtimes.
 *
 * The value arrays preserve each violation's discriminated type — callers
 * narrow via the `classId` prefix (`'G-*'` ⇒ `DimensionalViolation`,
 * `'A-*'` ⇒ `TopologyViolation`).
 */
export function groupByClass(
    report: AggregatedViolationReport,
): ReadonlyMap<string, Array<DimensionalViolation | TopologyViolation>> {
    const bag = new Map<string, Array<DimensionalViolation | TopologyViolation>>();
    for (const v of report.dimensional) {
        const arr = bag.get(v.classId) ?? [];
        arr.push(v);
        bag.set(v.classId, arr);
    }
    for (const v of report.topology) {
        const arr = bag.get(v.classId) ?? [];
        arr.push(v);
        bag.set(v.classId, arr);
    }
    // Re-build with sorted keys for deterministic iteration.
    const sorted = new Map<string, Array<DimensionalViolation | TopologyViolation>>();
    for (const k of Array.from(bag.keys()).sort()) sorted.set(k, bag.get(k)!);
    return sorted;
}

/**
 * Group violations by `roomId`. `DimensionalViolation.roomId` is the room
 * directly; `TopologyViolation.roomAId` is the "owner" room per the
 * existing topology convention. Keys are lex-sorted for determinism.
 */
export function groupByRoom(
    report: AggregatedViolationReport,
): ReadonlyMap<string, Array<DimensionalViolation | TopologyViolation>> {
    const bag = new Map<string, Array<DimensionalViolation | TopologyViolation>>();
    for (const v of report.dimensional) {
        const arr = bag.get(v.roomId) ?? [];
        arr.push(v);
        bag.set(v.roomId, arr);
    }
    for (const v of report.topology) {
        const arr = bag.get(v.roomAId) ?? [];
        arr.push(v);
        bag.set(v.roomAId, arr);
    }
    const sorted = new Map<string, Array<DimensionalViolation | TopologyViolation>>();
    for (const k of Array.from(bag.keys()).sort()) sorted.set(k, bag.get(k)!);
    return sorted;
}
