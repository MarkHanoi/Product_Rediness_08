// L1-α-3 — format DimensionalReport for the L5 modal.
//
// Pure L2 transform from the engine's `DimensionalReport`
// (validateAllDimensional output) into the JSON-serializable shape the
// React / Astro / preview modal renders. NO React, NO DOM — the modal
// imports this + renders the rows.
//
// Strategic context:
//   - APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK §9.6
//   - APARTMENT-COGNITION-STACK L1-α (Environmental Intelligence summary)

import type { DimensionalReport } from './validateAllDimensional.js';
import type { ValidationFinding } from './types.js';

/** Severity bucket the L5 badge component renders. */
export type FormattedSeverity = 'pass' | 'warning' | 'error';

/** One row in the formatted report — one room's per-validator status. */
export interface FormattedRoomRow {
    readonly roomId: string;
    /** Worst severity across all validators for this room. */
    readonly worstSeverity: FormattedSeverity;
    /** Hard findings affecting this room, formatted for display. */
    readonly errors: readonly FormattedFinding[];
    /** Soft findings affecting this room, formatted for display. */
    readonly warnings: readonly FormattedFinding[];
}

/** One per-section roll-up (e.g. "G1-G6 room shape" or "G8 daylight"). */
export interface FormattedSection {
    readonly id:
        | 'roomShape'
        | 'roomHierarchy'
        | 'roomDaylight'
        | 'corridorWidth'
        | 'entrySightline';
    readonly displayName: string;
    readonly status: FormattedSeverity;
    readonly hardCount: number;
    readonly softCount: number;
}

export interface FormattedFinding {
    readonly metric: string;
    readonly reason: string;
    readonly severity: 'hard' | 'soft';
    /** 0..1 — for soft findings, how serious is it. */
    readonly delta: number;
}

/** The shape the modal renders. */
export interface FormattedReport {
    readonly admissible: boolean;
    readonly overallSeverity: FormattedSeverity;
    /** Per-section roll-ups (4 sections matching the 4 sub-validators). */
    readonly sections: readonly FormattedSection[];
    /** Per-room breakdown — only rooms with findings appear. */
    readonly rooms: readonly FormattedRoomRow[];
    /** Total counts for the modal header chip. */
    readonly totals: { readonly errors: number; readonly warnings: number };
}

const SECTION_DISPLAY: Readonly<Record<FormattedSection['id'], string>> = {
    roomShape: 'Room shape (G1–G6)',
    roomHierarchy: 'Room hierarchy (G9)',
    roomDaylight: 'Daylight (G8)',
    corridorWidth: 'Corridor comfort (L5)',
    entrySightline: 'Entry sightline (L5)',
};

function toFormattedFinding(f: ValidationFinding): FormattedFinding {
    return {
        metric: f.metric,
        reason: f.reason,
        severity: f.severity,
        delta: f.delta,
    };
}

function sectionStatus(
    hardCount: number,
    softCount: number,
): FormattedSeverity {
    if (hardCount > 0) return 'error';
    if (softCount > 0) return 'warning';
    return 'pass';
}

/**
 * Turn a DimensionalReport into the modal's render shape.
 *
 *   - `admissible` is the AND across sub-validators (already on the
 *     input).
 *   - `overallSeverity` = 'error' if any hard, else 'warning' if any
 *     soft, else 'pass'.
 *   - `sections` carries one roll-up per sub-validator.
 *   - `rooms` groups every finding by `roomId` so the modal can render
 *     per-room badges + tooltips. Rooms with no findings are omitted
 *     (the modal renders them in a separate "passed" section if needed).
 *   - `totals` is the global header count.
 */
export function formatDimensionalReport(
    report: DimensionalReport,
): FormattedReport {
    const sections: FormattedSection[] = (
        Object.keys(report.perValidator) as Array<FormattedSection['id']>
    ).map((id) => {
        const sub = report.perValidator[id];
        return {
            id,
            displayName: SECTION_DISPLAY[id],
            status: sectionStatus(sub.hardFindings.length, sub.softFindings.length),
            hardCount: sub.hardFindings.length,
            softCount: sub.softFindings.length,
        };
    });

    // Group findings by roomId.
    const byRoom = new Map<string, { errors: FormattedFinding[]; warnings: FormattedFinding[] }>();
    for (const f of report.hardFindings) {
        const row = byRoom.get(f.roomId) ?? { errors: [], warnings: [] };
        row.errors.push(toFormattedFinding(f));
        byRoom.set(f.roomId, row);
    }
    for (const f of report.softFindings) {
        const row = byRoom.get(f.roomId) ?? { errors: [], warnings: [] };
        row.warnings.push(toFormattedFinding(f));
        byRoom.set(f.roomId, row);
    }

    const rooms: FormattedRoomRow[] = Array.from(byRoom.entries())
        .map(([roomId, { errors, warnings }]) => ({
            roomId,
            worstSeverity:
                errors.length > 0
                    ? ('error' as const)
                    : warnings.length > 0
                      ? ('warning' as const)
                      : ('pass' as const),
            errors,
            warnings,
        }))
        // Errors first; then by roomId for determinism.
        .sort((a, b) => {
            if (a.errors.length !== b.errors.length) {
                return b.errors.length - a.errors.length;
            }
            return a.roomId.localeCompare(b.roomId);
        });

    const overallSeverity: FormattedSeverity =
        report.hardFindings.length > 0
            ? 'error'
            : report.softFindings.length > 0
              ? 'warning'
              : 'pass';

    return {
        admissible: report.admissible,
        overallSeverity,
        sections,
        rooms,
        totals: {
            errors: report.hardFindings.length,
            warnings: report.softFindings.length,
        },
    };
}
