/**
 * ifcIdentity.ts — Pipeline A's identity + honesty layer.
 *
 * Two jobs, both of them consequences of the L-8500 audit:
 *
 * ## 1. GlobalId (L-8500 / L-8501)
 *
 * Every `IfcGloballyUniqueId` written by this pipeline goes through
 * {@link ifcGlobalId}, which delegates to the ONE codec at
 * `@pryzm/schemas/ifc`. There is no other way to produce a GlobalId here, and
 * the codec cannot return an invalid value — so a future call site cannot
 * re-introduce the 36-character-UUID defect.
 *
 * The `stableKey` namespaces below are the *contract*: they must stay stable
 * forever, because changing one re-mints every GlobalId derived from it. They
 * are deliberately verbose and prefixed so two different kinds of entity about
 * the same element can never collide.
 *
 * ## 2. Diagnostics (L-8510..L-8515)
 *
 * The audit found five places where this pipeline produced WRONG OUTPUT WITHOUT
 * WARNING — an element relocated to the wrong storey, a dropped void/fill, an
 * opening with a null representation. A file that is wrong but looks fine is
 * worse than a file that fails, so every one of them now raises a
 * {@link ExportDiagnostic}. Diagnostics are printed to the console AND handed to
 * the caller, so the UI can surface them rather than the user discovering the
 * problem in Solibri three weeks later.
 */

import {
    toIfcGlobalId,
    isIfcGlobalId,
    globalIdFromStableKey,
} from '@pryzm/schemas/ifc';
// ADR-0385 — the sentinel lives with the resolver, never copied. See storeySlot().
import { DEFAULT_BUILDING_ID } from '@pryzm/core-app-model';

export { isIfcGlobalId, globalIdFromStableKey };
export { DEFAULT_BUILDING_ID };

/**
 * Coerce whatever identity the model carries into a valid, stable
 * `IfcGloballyUniqueId`.
 *
 * @param value     Persisted IFC identity (`ifcData.guid`), if the element has
 *                  one. An element round-tripped from an imported IFC file keeps
 *                  its original GlobalId — that is the point.
 * @param stableKey One of the `*Key()` helpers below. Never a random value.
 */
export function ifcGlobalId(value: string | null | undefined, stableKey: string): string {
    return toIfcGlobalId(value, stableKey);
}

// ── Stable-key vocabulary ───────────────────────────────────────────────────
// ⛔ These strings are a persistence format. Changing one silently re-mints every
//    GlobalId derived from it, in every project. See ADR-0363.

/** The element itself. */
export const elementKey = (pryzmId: string) => `el:${pryzmId}`;
/** A storey. Takes a STOREY SLOT (see {@link storeySlot}), not a bare levelId. */
export const storeyKey = (storeySlotId: string) => `storey:${storeySlotId}`;

/**
 * ⭐ ADR-0385 — the composite storey identity, and the whole of the L-8501
 * back-compatibility pin.
 *
 * An `IfcBuildingStorey` belongs to exactly ONE `IfcBuilding` (IFC4 4.1.4.4 /
 * IFC2x3 §Building: the storey is decomposed from the building by
 * `IfcRelAggregates`). So Block A "Level 1" and Block B "Level 1" are ONE PRYZM
 * `levelId` and TWO storeys, and a `Map<levelId, …>` cannot express that. Every
 * storey-scoped key in this pipeline is therefore derived from a SLOT rather than
 * from the raw `levelId`.
 *
 * ⛔ AND THE SLOT DEGENERATES TO THE LEVEL ID FOR THE DEFAULT BUILDING. That is
 * not a convenience — it is the guarantee. `storeyKey()` seeds `ifcGlobalId()`,
 * and so do `relContainedKey()` and the `storey-spaces:` aggregate. Every project
 * authored before ADR-0385 has exactly one building, and it is
 * {@link DEFAULT_BUILDING_ID}, so every one of those keys comes out BYTE-IDENTICAL
 * to what it was before this change. Widening the key unconditionally would
 * re-churn every storey GlobalId in every existing project — precisely the defect
 * L-8501 fixed, guarded by the "GlobalId churned between exports" arm.
 *
 * ⛔ Do NOT make the slot depend on how many buildings the model has. A rule like
 * "compose only when N > 1" would re-churn the first building's ids the moment a
 * second one is added. The sentinel is local to the building and nothing else.
 */
export const storeySlot = (buildingId: string, levelId: string): string =>
    buildingId === DEFAULT_BUILDING_ID ? levelId : `${buildingId}::${levelId}`;
/** The project / site / building singletons. */
export const projectKey = (id: string) => `project:${id}`;
export const siteKey = (id: string) => `site:${id}`;
export const buildingKey = (id: string) => `building:${id}`;
/** The `IfcOpeningElement` cut for a hosted element. */
export const openingKey = (hostId: string, hostedId: string) => `opening:${hostId}:${hostedId}`;
/** `IfcRelVoidsElement` / `IfcRelFillsElement`. */
export const relVoidsKey = (hostId: string, hostedId: string) => `relvoids:${hostId}:${hostedId}`;
export const relFillsKey = (hostId: string, hostedId: string) => `relfills:${hostId}:${hostedId}`;
/** `IfcRelContainedInSpatialStructure`, one per storey. Takes a STOREY SLOT. */
export const relContainedKey = (storeySlotId: string) => `relcontained:${storeySlotId}`;
/** `IfcRelAggregates`, keyed by the aggregating entity. */
export const relAggregatesKey = (relatingKey: string) => `relaggregates:${relatingKey}`;
/** An `IfcPropertySet` and its `IfcRelDefinesByProperties`. */
export const psetKey = (ownerKey: string, psetName: string) => `pset:${ownerKey}:${psetName}`;
export const relDefinesKey = (ownerKey: string, psetName: string) =>
    `reldefines:${ownerKey}:${psetName}`;
/** `IfcRelSpaceBoundary` for a SemanticGraph adjacency. */
export const relSpaceBoundaryKey = (relId: string) => `relspaceboundary:${relId}`;

/**
 * The storey every element whose `levelId` does not resolve is placed into.
 *
 * ⛔ Pipeline A used to reassign such elements to *the first storey in the map*
 * (`IfcModelBuilder.ts:229-233`), silently. That is the worst defect the audit
 * found: the file opens cleanly, every element is present, and a wall is simply
 * on the wrong floor. An explicit, obviously-named storey is honest — the
 * element is still exported, still visible, and unmistakably not placed.
 */
export const UNASSIGNED_LEVEL_ID = '__PRYZM_UNASSIGNED__';
// ASCII only: STEP escapes non-ASCII as `\X2\2014\X0\`, which is valid but reads as
// mojibake in a viewer's storey list — the one place this name must be legible.
export const UNASSIGNED_LEVEL_NAME = 'UNASSIGNED (PRYZM export - source level not found)';

// ── Diagnostics ─────────────────────────────────────────────────────────────

export type DiagnosticSeverity = 'error' | 'warning';

export interface ExportDiagnostic {
    severity: DiagnosticSeverity;
    /** Stable machine-readable code — greppable, and safe to assert on in tests. */
    code:
        | 'UNRESOLVED_LEVEL'
        /**
         * ADR-0385 — the hierarchy substrate could not say which `IfcBuilding`
         * a level belongs to: unreadable store, a dangling `buildingId`, or two
         * buildings both claiming one `bimLevelId`. The storey is still written
         * (under the default building) so no element is lost, and the failure is
         * REPORTED rather than laundered into "ungrouped" — an unreadable
         * substrate and a genuinely ungrouped project must not look the same
         * (§CONTEXT-DATA-HONESTY, L-581/L-616).
         */
        | 'UNRESOLVED_BUILDING'
        | 'MISSING_HOST_WALL'
        | 'OPENING_WITHOUT_GEOMETRY'
        | 'EMPTY_GEOMETRY'
        | 'UNKNOWN_IFC_CLASS';
    message: string;
    elementId?: string;
}

/**
 * Collects the things that went wrong during one export and makes sure they are
 * never merely swallowed. `console.error`/`console.warn` fire immediately (so a
 * developer sees them at the moment of the export), and the full list is handed
 * back to the caller for the UI.
 */
export class ExportDiagnostics {
    private readonly items: ExportDiagnostic[] = [];
    /** Codes already logged, so a 5000-element model does not emit 5000 lines. */
    private readonly loggedCodes = new Set<string>();

    add(d: ExportDiagnostic): void {
        this.items.push(d);
        const prefix = `[IFC export] ${d.code}`;
        if (!this.loggedCodes.has(d.code)) {
            this.loggedCodes.add(d.code);
            const emit = d.severity === 'error' ? console.error : console.warn;
            emit(`${prefix}: ${d.message}${d.elementId ? ` (element ${d.elementId})` : ''}`);
        }
    }

    all(): readonly ExportDiagnostic[] {
        return this.items;
    }

    count(code: ExportDiagnostic['code']): number {
        return this.items.filter((d) => d.code === code).length;
    }

    get errorCount(): number {
        return this.items.filter((d) => d.severity === 'error').length;
    }

    /** One-line summary for the console group at the end of an export. */
    summary(): string {
        if (this.items.length === 0) return 'no defects detected';
        const byCode = new Map<string, number>();
        for (const d of this.items) byCode.set(d.code, (byCode.get(d.code) ?? 0) + 1);
        return [...byCode.entries()].map(([code, n]) => `${code}×${n}`).join(', ');
    }
}
