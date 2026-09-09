/**
 * buildingContainment.ts — the JOIN between PRYZM's containment authority and the
 * IFC intermediate model.
 *
 * ADR-0385 · amends C25 §1.3 · C84 EI-9 · §CONTEXT-DATA-HONESTY (L-581/L-616) ·
 * L-8501 · ADR-0383 D3.
 *
 * ── WHAT THIS DOES, IN ONE SENTENCE ──────────────────────────────────────────
 *
 * Reads `hierarchyStore` ONCE through `@pryzm/core-app-model`'s
 * {@link readBuildingSubstrate}, asks the ONE resolver which `IfcBuilding` each
 * exported level belongs to, and stamps `buildings` / `ExportLevel.buildingId` /
 * `ExportElement.buildingId` onto the {@link IntermediateModel}.
 *
 * ── ⛔ WHY IT DOES NOT RESOLVE ANYTHING ITSELF ───────────────────────────────
 *
 * [[same-rule-two-implementations]] is this repo's dominant defect, and the
 * question *"which building is this element in"* had FOUR possible answers before
 * ADR-0385 (`IntermediateModel.building`, `hierarchyStore.BuildingData`,
 * `plugins/ifc-export/hierarchy.ts`, `SpaceEnvelope.group`). ADR-0385 §2 made
 * `hierarchyStore` the authority and named ONE resolver. This module contains no
 * rule of its own — every decision is `buildBuildingRoster()`'s, and the inspect
 * trees call the same function. A second copy here is precisely how the IFC file
 * and the tree would come to disagree.
 *
 * ⛔ It does NOT read `SpaceEnvelope.group` (ADR-0385 §2 point 3), and it does not
 * write to the hierarchy store. The projection `massing group -> BuildingData` is
 * the AUTHORING half and belongs behind the command bus (P6).
 *
 * ── ⛔ THE BACK-COMPATIBILITY GUARANTEE THIS FILE MUST NOT BREAK ─────────────
 *
 * ADR-0383 D3 / ADR-0385 §3: an ungrouped project must emit EXACTLY what it
 * emitted before. `buildBuildingRoster()` guarantees that a level set nothing
 * claims produces one building whose id is `DEFAULT_BUILDING_ID`, and
 * `ifcIdentity.storeySlot` makes every storey key for that building byte-identical
 * to the pre-ADR-0385 key. So the whole of the guarantee is: **do not stamp a
 * `buildingId` that is not the default unless the substrate actually said so.**
 * That is why `undefined` is left in place rather than written as the default —
 * an absent field and an explicitly-defaulted one read the same downstream, and
 * leaving it absent keeps the intent legible.
 *
 * ── ⛔ AND THE HONEST PART ───────────────────────────────────────────────────
 *
 * ADR-0385 §4 states it before it is built: mapping group -> `IfcBuilding` alone
 * produces N correct CONTAINERS with NO CONTENTS, because no element schema
 * carries a building or group axis (`Wall` and `Slab`: 0 grep hits). An element's
 * building is therefore resolved THROUGH ITS LEVEL, and when two buildings claim
 * one PRYZM levelId the element is genuinely unroutable — that resolves `unknown`
 * and is REPORTED, never guessed at. The storeys are still correct; the element
 * lands in the fallback building with an `UNRESOLVED_BUILDING` diagnostic against
 * it, so the gap is visible in the export report instead of being discovered in
 * Solibri.
 */

import {
    buildBuildingRoster,
    readBuildingSubstrate,
    resolveLevelBuilding,
    DEFAULT_BUILDING_ID,
    type BuildingSubstrate,
} from '@pryzm/core-app-model';
import type { IntermediateModel } from './IntermediateModel';
import type { ExportDiagnostics } from './ifcIdentity';

export interface BuildingContainmentReport {
    /** How many `IfcBuilding` entities the model will now emit. Always >= 1. */
    readonly buildingCount: number;
    /** Levels whose building could not be resolved, with the reason for each. */
    readonly unresolvedLevels: readonly { readonly levelId: string; readonly why: string }[];
    /**
     * Buildings `hierarchyStore` holds that NO exported level resolved into. Not
     * emitted — an `IfcBuilding` owning no storey asserts something the model does
     * not — but counted, so "my third block is missing" has an answer.
     */
    readonly unusedBuildingIds: readonly string[];
    /** The substrate note, so a report can say WHY it saw one building. */
    readonly substrateNote: string;
}

/**
 * Stamp building containment onto `model`, in place.
 *
 * ⛔ MUST be called after the level set is FINAL — `IfcExporter` appends imported
 * IFC storeys to `model.levels` after `FragmentReader.read()`, and a level added
 * afterwards would carry no `buildingId` and silently fall to the default.
 *
 * Idempotent: containment is re-derived from `levelId` every call, never
 * accumulated, so running it twice cannot drift (the ADR-0328 projection
 * discipline `PartOfProjection` follows).
 *
 * @param substrate injectable for tests; defaults to a live `hierarchyStore` read.
 */
export function applyBuildingContainment(
    model: IntermediateModel,
    diagnostics?: ExportDiagnostics,
    substrate: BuildingSubstrate = readBuildingSubstrate(),
): BuildingContainmentReport {
    const roster = buildBuildingRoster(model.levels.map((l) => l.id), substrate);

    // ── the buildings ──────────────────────────────────────────────────────
    model.buildings = roster.buildings.map((b) => ({
        id: b.id,
        name: b.name,
        // A building imported from IFC keeps its original GlobalId; a PRYZM-native
        // one carries none and `IfcSpatialStructure` derives a stable id from
        // `building:${id}` (L-8501).
        ...(b.ifcGuid ? { guid: b.ifcGuid } : {}),
    }));

    // ── the storeys ────────────────────────────────────────────────────────
    // levelId -> buildingId, built from the roster so it cannot disagree with the
    // building list above.
    const buildingOfLevel = new Map<string, string>();
    for (const b of roster.buildings) {
        for (const levelId of b.levelIds) buildingOfLevel.set(levelId, b.id);
    }
    for (const level of model.levels) {
        const buildingId = buildingOfLevel.get(level.id);
        // Leave `undefined` for the default — see the header. An absent field and
        // an explicit `'building-1'` produce the same slot; absence keeps the
        // "nothing claimed this level" intent readable in a dumped model.
        if (buildingId && buildingId !== DEFAULT_BUILDING_ID) level.buildingId = buildingId;
        else delete level.buildingId;
    }

    // ── the elements ───────────────────────────────────────────────────────
    for (const element of model.elements) {
        const buildingId = element.levelId ? buildingOfLevel.get(element.levelId) : undefined;
        if (buildingId && buildingId !== DEFAULT_BUILDING_ID) element.buildingId = buildingId;
        else delete element.buildingId;
    }

    // ── report every failure, and never as an emptiness ────────────────────
    for (const u of roster.unknown) {
        diagnostics?.add({
            severity: 'warning',
            code: 'UNRESOLVED_BUILDING',
            message:
                `${u.why}. The storey is still written, under building ` +
                `"${DEFAULT_BUILDING_ID}", so nothing is lost — but its building is a ` +
                `FALLBACK, not a recorded fact.`,
        });
    }
    if (roster.unusedBuildingIds.length > 0) {
        diagnostics?.add({
            severity: 'warning',
            code: 'UNRESOLVED_BUILDING',
            message:
                `${roster.unusedBuildingIds.length} building(s) in the project hierarchy own no ` +
                `exported storey and were NOT written to the file ` +
                `(${roster.unusedBuildingIds.join(', ')}). An IfcBuilding with no ` +
                `IfcBuildingStorey would assert a structure the model does not have.`,
        });
    }

    return {
        buildingCount: model.buildings.length,
        unresolvedLevels: roster.unknown,
        unusedBuildingIds: roster.unusedBuildingIds,
        substrateNote: substrate.note,
    };
}

/**
 * Why one level resolved the way it did — for a UI that wants to explain the
 * export rather than only perform it. A thin pass-through to the ONE resolver;
 * it exists so callers do not reach past this module and re-read the substrate
 * with a second snapshot.
 */
export function explainLevelBuilding(levelId: string, substrate: BuildingSubstrate) {
    return resolveLevelBuilding(levelId, substrate);
}
