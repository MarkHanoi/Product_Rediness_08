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
    /**
     * ⭐ ADR-0385 §3 — PRYZM levels that became SEVERAL `IfcBuildingStorey` entities
     * because several blocks share them. The normal shape of a master plan, not a
     * fault; reported so a caller can explain why the storey count exceeds the level
     * count.
     */
    readonly fannedLevelIds: readonly string[];
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
    // ⛔ THE LEVEL SET IS DE-DUPLICATED BEFORE THE ROSTER IS BUILT, AND THAT IS WHAT
    // KEEPS THIS FUNCTION IDEMPOTENT AFTER THE FAN-OUT BELOW. A previous call may have
    // already expanded one PRYZM level into N `ExportLevel` rows sharing an id; feeding
    // those back in unchanged would fan each of them out again, and three storeys would
    // become nine and then twenty-seven. Collapsing first means the second call
    // recomputes exactly the first call's answer (ADR-0328 discipline).
    const distinctLevels = [...new Map(model.levels.map((l) => [l.id, l])).values()];
    const roster = buildBuildingRoster(distinctLevels.map((l) => l.id), substrate);

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
    // levelId -> the buildings that own it, built from the roster so it cannot
    // disagree with the building list above.
    //
    // ⭐ ONE-TO-MANY, NOT ONE-TO-ONE, AND THAT WAS THE COLLAPSE. This was a
    // `Map<string, string>`, so when a master plan's three blocks shared the project's
    // storey ladder — which is exactly what `masterPlanAuthoringPlan` produces, since
    // every profile is handed the same `levels` — the last block to be seen won and
    // three buildings emitted as one. C25 §1.3 as amended: Block A "Level 1" and Block
    // B "Level 1" are ONE PRYZM levelId and TWO `IfcBuildingStorey` entities.
    const buildingsOfLevel = new Map<string, string[]>();
    for (const b of roster.buildings) {
        for (const levelId of b.levelIds) {
            const row = buildingsOfLevel.get(levelId);
            if (row) row.push(b.id);
            else buildingsOfLevel.set(levelId, [b.id]);
        }
    }

    // ⭐ THE FAN-OUT. `IfcSpatialStructure` already keys its storeys by
    // `storeySlot(buildingId, level.id)`, so N rows sharing an `ExportLevel.id` with
    // different `buildingId`s become N distinct storeys with N distinct GlobalIds —
    // the shape `multiBuildingModel` in the validity suite already pins. This is what
    // finally produces it from a real read instead of from a hand-built fixture.
    const expanded: typeof model.levels = [];
    for (const level of distinctLevels) {
        const owners = buildingsOfLevel.get(level.id) ?? [];
        if (owners.length > 1) {
            for (const buildingId of owners) expanded.push({ ...level, buildingId });
            continue;
        }
        const buildingId = owners[0];
        // Leave `undefined` for the default — see the header. An absent field and
        // an explicit `'building-1'` produce the same slot; absence keeps the
        // "nothing claimed this level" intent readable in a dumped model.
        if (buildingId && buildingId !== DEFAULT_BUILDING_ID) level.buildingId = buildingId;
        else delete level.buildingId;
        expanded.push(level);
    }
    model.levels = expanded;

    // ── the elements ───────────────────────────────────────────────────────
    // ⛔ AN ELEMENT ON A FANNED LEVEL IS LEFT UNSTAMPED, DELIBERATELY. ADR-0385 §4
    // names it before it is built: no element schema carries a building axis, so a
    // wall on a storey two blocks share genuinely cannot be routed to one of them.
    // Choosing would be the "answer confidently and be wrong" failure C84 §9 records;
    // `IfcModelBuilder` then places it in the explicit UNASSIGNED storey with a loud
    // `UNRESOLVED_LEVEL` diagnostic (L-8510), which is visible rather than wrong.
    for (const element of model.elements) {
        const owners = element.levelId ? buildingsOfLevel.get(element.levelId) ?? [] : [];
        const buildingId = owners.length === 1 ? owners[0] : undefined;
        if (buildingId && buildingId !== DEFAULT_BUILDING_ID) element.buildingId = buildingId;
        else delete element.buildingId;
    }

    // ── report every failure, and never as an emptiness ────────────────────
    const fanned = new Set(roster.fannedLevelIds);
    for (const u of roster.unknown) {
        diagnostics?.add({
            severity: 'warning',
            code: 'UNRESOLVED_BUILDING',
            message: fanned.has(u.levelId)
                // ⭐ A FANNED LEVEL IS NOT A FALLBACK, AND SAYING SO WOULD BE A LIE.
                // Its storeys were written correctly, one per owning building; what
                // could not be answered is which of them the ELEMENTS belong to.
                ? `${u.why}. The STOREYS are written correctly — one IfcBuildingStorey per ` +
                  `owning building, per C25 §1.3 — but ELEMENTS on this level carry no ` +
                  `building axis and are therefore placed in the explicit UNASSIGNED ` +
                  `storey rather than guessed into one of the blocks.`
                : `${u.why}. The storey is still written, under building ` +
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
        fannedLevelIds: roster.fannedLevelIds,
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
