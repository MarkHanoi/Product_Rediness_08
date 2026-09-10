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
 * ADR-0385 §4 stated it before it was built: mapping group -> `IfcBuilding` alone
 * produces N correct CONTAINERS with NO CONTENTS, because no element schema
 * carries a building or group axis (`Wall` and `Slab`: 0 grep hits). An element's
 * building is resolved THROUGH ITS LEVEL — and, when two buildings claim one PRYZM
 * levelId, through the grouped ENVELOPE it stands in (lane BLOCK-CONTAINMENT,
 * 2026-09-10): this module hands the resolver a plan sample taken from the export
 * model's world-space geometry, and the resolver selects among the store's
 * candidates. An element standing in no envelope, or in two, resolves `unknown`
 * and is REPORTED, never guessed at. The storeys are still correct; the element
 * lands in the explicit UNASSIGNED storey with an `UNRESOLVED_BUILDING` diagnostic
 * naming the reason, so the gap is visible in the export report instead of being
 * discovered in Solibri.
 */

import {
    buildBuildingRoster,
    readBuildingSubstrate,
    resolveElementBuilding,
    resolveLevelBuilding,
    DEFAULT_BUILDING_ID,
    type BuildingSubstrate,
} from '@pryzm/core-app-model';
import type { ExportElement, IntermediateModel } from './IntermediateModel';
import type { ExportDiagnostics } from './ifcIdentity';

export interface BuildingContainmentReport {
    /** How many `IfcBuilding` entities the model will now emit. Always >= 1. */
    readonly buildingCount: number;
    /** Levels whose building could not be resolved, with the reason for each. */
    readonly unresolvedLevels: readonly { readonly levelId: string; readonly why: string }[];
    /**
     * ⭐ ADR-0385 §4 — elements on a FANNED storey that envelope geometry placed in
     * one block. The "contents" half of the founder's ask, counted.
     */
    readonly routedElements: number;
    /**
     * Elements on a fanned storey that could NOT be routed, each with the resolver's
     * reason (no plan position, envelope geometry unreadable, standing in no grouped
     * envelope, standing in two). They land in the explicit UNASSIGNED storey with an
     * `UNRESOLVED_LEVEL` diagnostic from `IfcModelBuilder`; listed here so the report
     * can say WHY rather than only THAT.
     */
    readonly unroutedElements: readonly {
        readonly elementId: string;
        readonly levelId: string;
        readonly why: string;
    }[];
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
    // ⭐ ADR-0385 §4 — THE CONTENTS JOIN. Every element asks the ONE resolver, and
    // hands it where it stands on the plan. On a storey with one owner the answer is
    // the store's, as before. On a FANNED storey — the founder's master plan, where
    // every block sits on the project's shared ladder — the resolver selects among
    // the store's candidates by the grouped envelope the element stands in, and
    // says `unknown` for anything it cannot place: no position, unreadable envelope
    // geometry, standing in no envelope, standing in two. Such an element is LEFT
    // UNSTAMPED and `IfcModelBuilder` places it in the explicit UNASSIGNED storey
    // with a loud `UNRESOLVED_LEVEL` diagnostic (L-8510) — visible rather than wrong,
    // which is ADR-0385's own rule. This module still contains NO RULE: it computes
    // the plan sample from what the export model holds, and the resolver decides.
    const fanned = new Set(roster.fannedLevelIds);
    const unroutedElements: { elementId: string; levelId: string; why: string }[] = [];
    const routedOn = new Map<string, number>();
    const unroutedOn = new Map<string, number>();
    let routedElements = 0;
    for (const element of model.elements) {
        const r = resolveElementBuilding(
            element.id, element.levelId, substrate, elementPlanSample(element),
        );
        if (r.kind === 'carried' && r.buildingId !== null && r.buildingId !== DEFAULT_BUILDING_ID) {
            element.buildingId = r.buildingId;
            if (r.envelopeId !== undefined && element.levelId) {
                routedElements++;
                routedOn.set(element.levelId, (routedOn.get(element.levelId) ?? 0) + 1);
            }
            continue;
        }
        delete element.buildingId;
        if (r.kind === 'unknown' && element.levelId && fanned.has(element.levelId)) {
            unroutedElements.push({ elementId: element.id, levelId: element.levelId, why: r.why });
            unroutedOn.set(element.levelId, (unroutedOn.get(element.levelId) ?? 0) + 1);
        }
    }

    // ── report every failure, and never as an emptiness ────────────────────
    for (const u of roster.unknown) {
        diagnostics?.add({
            severity: 'warning',
            code: 'UNRESOLVED_BUILDING',
            message: fanned.has(u.levelId)
                // ⭐ A FANNED LEVEL IS NOT A FALLBACK, AND SAYING SO WOULD BE A LIE.
                // Its storeys were written correctly, one per owning building, and
                // its elements were routed by the envelope each stands in; what is
                // reported is how many could not be.
                ? `${u.why}. The STOREYS are written correctly — one IfcBuildingStorey per ` +
                  `owning building, per C25 §1.3. ELEMENTS on this level are routed by the ` +
                  `grouped envelope each stands in (ADR-0385 §4): ` +
                  `${routedOn.get(u.levelId) ?? 0} routed, ${unroutedOn.get(u.levelId) ?? 0} ` +
                  `could not be and are placed in the explicit UNASSIGNED storey rather than ` +
                  `guessed into a block.`
                : `${u.why}. The storey is still written, under building ` +
                  `"${DEFAULT_BUILDING_ID}", so nothing is lost — but its building is a ` +
                  `FALLBACK, not a recorded fact.`,
        });
    }
    for (const u of unroutedElements) {
        // One per element, with the resolver's reason and the element named, so the
        // export report answers "why is wall_7 in UNASSIGNED" without a debugger.
        diagnostics?.add({
            severity: 'warning',
            code: 'UNRESOLVED_BUILDING',
            message: u.why,
            elementId: u.elementId,
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
        routedElements,
        unroutedElements,
        unusedBuildingIds: roster.unusedBuildingIds,
        fannedLevelIds: roster.fannedLevelIds,
        substrateNote: substrate.note,
    };
}

/**
 * Where an element stands on the plan — the XZ centre of its world-space geometry,
 * or its placement when it carries no vertices, or `null` when it carries neither.
 *
 * `FragmentReader.extractGeometry` bakes `matrixWorld` into every vertex and
 * `WallReader`'s parametric fallback builds from the world base line, so the
 * vertices ARE world metres — the same frame `SpaceEnvelope.footprint` is drawn in
 * (`attachSpaceEnvelopeRender` reads the ring as world XZ). The bounding-box centre
 * is used rather than a vertex mean so a wall's sample is its midpoint however its
 * mesh happens to be triangulated.
 *
 * ⛔ This is a READ of the export model, not a rule: which building the sample lands
 * in is decided by `resolveElementBuilding` and nowhere else.
 */
export function elementPlanSample(element: ExportElement): { x: number; z: number } | null {
    const v = element.geometry?.vertices;
    if (v && v.length >= 9) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i + 2 < v.length; i += 3) {
            const x = v[i]!;
            const z = v[i + 2]!;
            if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        }
        if (Number.isFinite(minX) && Number.isFinite(minZ)) {
            return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
        }
    }
    const p = element.position;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) return { x: p.x, z: p.z };
    return null;
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
