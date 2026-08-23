/**
 * `tree-source.ts` — the normalised element the IFC tree groups over, and the
 * three-valued facet type that makes its honesty a TYPE rather than a habit.
 *
 * §IFC-TREE-SOURCE (L-8310..L-8313) · C01 §6 rule 6 · C25 §2.
 *
 * ---------------------------------------------------------------------------
 * SCOPING DECISION (recorded, per the lane brief)
 * ---------------------------------------------------------------------------
 * The tree presents BOTH halves — option (c):
 *
 *   'imported'  elements parsed out of a third-party IFC (Revit-authored and
 *               similar), carried by `IfcElementRecord` in
 *               `packages/file-format/src/import/ifc/IfcModelStore.ts`.
 *   'native'    PRYZM's OWN elements, PROJECTED into IFC classes through
 *               `ifc-class-authority.ts`.
 *
 * The native half is the valuable one and is the thing no import viewer gives:
 * PRYZM's model presented AS IFC without inventing anything, because the
 * class mapping already existed. That is what "almost native sync" means in
 * practice.
 *
 * ⚠ The two halves have GENUINELY DIFFERENT coverage, and the tree must not
 * average them into one comfortable answer. Measured at HEAD:
 *
 *   `IfcElementRecord` carries EXACTLY: id, expressID, name, ifcTypeName,
 *   rawIfcType, storeyName, storeyExpressID, psets.
 *
 *   It has NO material field and NO system field — not empty ones, NONE. So for
 *   an imported model, "By material" and "By IFC system" are NOT-EXTRACTED, and
 *   saying "no materials in this model" would be a lie about someone else's
 *   file. That is precisely the distinction C01 §6 rule 6 exists to force.
 *
 * ---------------------------------------------------------------------------
 * ZERO IMPORTS, DELIBERATELY
 * ---------------------------------------------------------------------------
 * This module imports nothing but its sibling authority. It does not reach for
 * `ifcModelStore`, any PRYZM store, the DOM, or THREE. Adapters hand it plain
 * data. That keeps it pure and testable, keeps the layer graph clean, and adds
 * no workspace dependency (so no pnpm-lock churn).
 *
 * The risk of a hand-written input type is the "fake more capable than real"
 * trap — a shape invented from a header cannot falsify the header. The guard is
 * `__tests__/tree-source-shape.test.ts`, which asserts this type against the
 * REAL `IfcElementRecord` field set copied from disk, so a drift in the store
 * fails a test instead of silently producing a prettier tree than the data
 * supports.
 */

import type { IfcClassResolution } from './ifc-class-authority.js';

export type PsetScalar = string | number | boolean | null;

/**
 * A facet whose value may be present, genuinely blank, or never read by PRYZM
 * at all. THESE THREE ARE DIFFERENT FACTS and collapsing them is the defect
 * this feature exists to expose.
 *
 *   'authored'      the source carries a value. Show it.
 *   'not-authored'  the source HAS this field and it is empty for THIS element.
 *                   "not authored on this element" — a fact about the model.
 *   'not-extracted' PRYZM never reads this field from this source. A fact about
 *                   PRYZM, NOT about the model. Saying "none" here would be an
 *                   assertion about data we did not look at.
 */
export type Facet =
  | { readonly kind: 'authored'; readonly value: string }
  /**
   * ⭐ §IFC-TREE-HOSTED-STOREY (L-8900). The element does NOT carry this value
   * and IS NOT MISSING IT — a HOST carries it, and we followed the reference.
   *
   * A PRYZM door or window has `wallId` and NO `levelId`
   * (`packages/schemas/src/elements/Door.ts:48`, `Window.ts:48`). That is
   * deliberate: C15 makes a hosted opening an offset along a wall, so its storey
   * is a property OF THE WALL. Calling such a door "not assigned to a storey" is
   * a FALSE STATEMENT ABOUT THE MODEL, not a gap in the model.
   *
   * `via` names the hop, so a derived answer is never mistaken for a carried one.
   */
  | { readonly kind: 'derived'; readonly value: string; readonly via: string }
  /**
   * ⭐ Hosted, derivable IN PRINCIPLE, and the resolution FAILED. Distinct from
   * `not-authored`, because the element was never supposed to carry the value.
   * `why` names WHICH failure — a missing host and a host with no level are
   * different defects with different owners.
   */
  | { readonly kind: 'unresolved'; readonly why: string }
  /**
   * ⭐ §IFC-TREE-PER-PART-MATERIAL (L-8903). The element deliberately carries
   * SEVERAL values, one per part, and no single one is the answer.
   *
   * `Door`/`Window` carry `frameFinish.materialId` + `leafFinish.materialId`
   * rather than one `materialId`, and C100 §9.1 rules that split CORRECT, NOT A
   * DEFECT. ⛔ So this must not be flattened to pick a winner, and must not be
   * reported as "not authored" — both would misdescribe a deliberate design.
   */
  | { readonly kind: 'per-part'; readonly parts: readonly { part: string; value: string }[] }
  | { readonly kind: 'not-authored' }
  | { readonly kind: 'not-extracted'; readonly why: string };

export const NOT_EXTRACTED = (why: string): Facet => ({ kind: 'not-extracted', why });
export const NOT_AUTHORED: Facet = Object.freeze({ kind: 'not-authored' });
export const authored = (value: string): Facet => ({ kind: 'authored', value });
export const derived = (value: string, via: string): Facet => ({ kind: 'derived', value, via });
export const unresolved = (why: string): Facet => ({ kind: 'unresolved', why });
export const perPart = (parts: readonly { part: string; value: string }[]): Facet =>
  parts.length === 0 ? NOT_AUTHORED : { kind: 'per-part', parts };

/** A rung of the IFC spatial chain: Project -> Site -> Building -> Storey -> Space. */
export interface SpatialRung {
  readonly level: 'project' | 'site' | 'building' | 'storey' | 'space';
  readonly id: string;
  readonly name: string;
}

export type Origin = 'imported' | 'native';

/**
 * One element, normalised. Both adapters produce this; every grouping consumes
 * only this.
 */
export interface IfcTreeElement {
  readonly id: string;
  readonly name: string;
  readonly origin: Origin;
  /** For 'native': from the authority. For 'imported': the file's own class. */
  readonly ifcClass: IfcClassResolution;
  /**
   * The spatial chain, deepest rung LAST. May be SHORT — an imported model
   * gives storey only, and a short chain is reported as such rather than
   * padded with invented Site/Building rungs.
   */
  readonly spatial: readonly SpatialRung[];
  readonly storey: Facet;
  readonly material: Facet;
  readonly system: Facet;
  readonly globalId: Facet;
  readonly psets: Readonly<Record<string, Readonly<Record<string, PsetScalar>>>>;
}

/**
 * What a whole SOURCE can and cannot answer, declared UP FRONT by the adapter
 * rather than inferred from whether results came back empty.
 *
 * ⭐ This is the load-bearing idea. "Zero groups" and "we never looked" produce
 * the SAME EMPTY ARRAY — the identical-value trap. An adapter that declares its
 * own capability lets the grouping say WHICH of the two happened without
 * guessing from a length check.
 */
export interface SourceCapability {
  /**
   * ⭐ READ THE VERB. These say "can this source ANSWER the question", NOT "did
   * it find any". `true` means a definitive answer is available AND THAT ANSWER
   * MAY BE 'none' — an interrogated source that authors nothing is ABSENT, a
   * fact about the model. `false` means the source was never interrogated, so
   * 'none' CANNOT be concluded from an empty result.
   *
   * ⚠ These were first written as `extracts*`, and that name caused a real
   * defect this suite caught: the native source authors no IfcSystem, which is
   * a COMPLETE answer, but `extractsSystem: false` made the grouping report
   * NOT-EXTRACTED — blaming PRYZM's parser for a fact about PRYZM's data model.
   * The verb is the whole distinction; do not rename it back.
   */
  readonly answersMaterial: boolean;
  readonly answersSystem: boolean;
  readonly answersGlobalId: boolean;
  /** Deepest spatial rung this source can populate. */
  readonly deepestSpatialRung: SpatialRung['level'] | 'none';
  /** Human sentence naming the parse's limit, shown verbatim in empty states. */
  readonly limitNote: string;
}

export interface IfcTreeSource {
  readonly origin: Origin;
  readonly label: string;
  readonly capability: SourceCapability;
  readonly elements: readonly IfcTreeElement[];
}

/**
 * Capability of the IMPORTED half, derived from the measured `IfcElementRecord`
 * field set. Every `false` here is a MEASUREMENT, not a guess.
 */
export const IMPORTED_CAPABILITY: SourceCapability = Object.freeze({
  // IfcElementRecord has no material field — we never looked, so 'none' is unsayable.
  answersMaterial: false,
  // IfcElementRecord has no system/group field — likewise unsayable.
  answersSystem: false,
  // IfcElementRecord carries expressID, not the IFC GlobalId string.
  answersGlobalId: false,
  // storeyName + storeyExpressID only; no Site, no Building, no Space.
  deepestSpatialRung: 'storey',
  limitNote:
    'Imported IFC is parsed for class, name, storey and property sets. Material, ' +
    'system membership and GlobalId are present in the file but not yet extracted ' +
    'by PRYZM (data-only parse).',
});

/**
 * Capability of the NATIVE half.
 *
 * ⭐ `answersSystem: TRUE` — and the answer is "none". This is the case that
 * proves the verb matters. PRYZM authors no IfcSystem, and that is a COMPLETE,
 * CHECKABLE fact about PRYZM's data model, not a gap in a parser. Measured:
 * `grep -rn 'IFCSYSTEM|IfcSystem|IfcDistributionSystem'` over packages+plugins
 * returns ZERO production hits. So a native-only model reports ABSENT, while an
 * imported model reports NOT-EXTRACTED — different sentences, both true.
 *
 * ⛔ PRYZM's wall/floor/ceiling SYSTEM TYPES are NOT IFC systems. An IFC system
 * (IfcSystem / IfcDistributionSystem) is an MEP or functional network; a PRYZM
 * system type is a TYPE OBJECT (IfcWallType and friends). Grouping type objects
 * here would put a plausible, populated, WRONG tree in front of the founder —
 * worse than an honest empty one.
 */
export const NATIVE_CAPABILITY: SourceCapability = Object.freeze({
  /**
   * TRUE, but THIN — and the thinness is stated rather than averaged away.
   *
   * Measured: PRYZM authors material on only a few families, and only ever as a
   * STRING inside a property set, never as an IFC material entity:
   *   `readers/BeamReader.ts:28`   beam.material            -> pset 'Material'
   *   `readers/StairReader.ts:30`  stair.properties.material-> pset 'Material'
   *   `readers/RoomReader.ts:133`  room.finishes.*.materialName
   *                                -> Floor/Wall/CeilingCovering
   * Every other family authors none. So an empty result here means ABSENT (we
   * looked), not NOT-EXTRACTED — which is why this flag is true.
   *
   * ⛔ RENDER COLOUR IS NOT MATERIAL. `FragmentReader.ts:363` and
   * `IfcGeometryWriter.ts:78` extract RGB for IfcStyledItem. That is
   * PRESENTATION. Deriving a material grouping from it would manufacture data.
   */
  answersMaterial: true,
  answersSystem: true,
  answersGlobalId: true,
  deepestSpatialRung: 'storey',
  limitNote:
    'PRYZM elements are projected into IFC classes via the C25 §2 authority. ' +
    'Material is authored on a few families only (beams, stairs, room finishes) and ' +
    'only as a property-set string. IfcSystem (MEP/functional networks) is not a ' +
    'concept PRYZM authors — its system TYPES are IFC type objects, a different relation.',
});

/**
 * ⚠ §IFC-TREE-MATERIAL-DOES-NOT-SURVIVE-EXPORT (L-8332).
 *
 * A material the tree can honestly show is NOT a material that will reach an
 * IFC file. Measured 2026-08-23:
 *
 *   grep -rn 'IFCMATERIAL|IfcMaterial|RelAssociatesMaterial|MaterialLayerSet' \
 *        packages/file-format/src/export plugins/ifc-export/src   ->  0
 *
 * ZERO, in BOTH export pipelines. Material survives only as an opaque pset
 * string, so no downstream tool can do a material takeoff from PRYZM's output.
 *
 * The story card MUST say this when it shows a material, because "PRYZM knows
 * the beam is steel" and "PRYZM will tell your consultant the beam is steel"
 * are different claims and the second one is false. Owned by lane IFCEXP49.
 */
export const MATERIAL_EXPORT_CAVEAT =
  'Shown from the PRYZM model. ⚠ Material is NOT emitted as an IFC material entity by ' +
  'either export pipeline (0 IfcMaterial / IfcRelAssociatesMaterial), so it survives export ' +
  'only as a property-set string.';

/**
 * ⚠ §IFC-TREE-DESCRIBE-THE-PATH-THE-APP-RUNS (L-8333).
 *
 * There are TWO IFC export pipelines and the app runs the LESS enriched one.
 * Measured 2026-08-23:
 *
 *   grep -rn 'exportProjectToIFC4X3' over packages/plugins/apps/src/server
 *     -> definition, ONE barrel re-export (`plugins/ifc-export/src/index.ts:18`),
 *        and TESTS ONLY. ZERO production callers.
 *   The UI calls `exportIFC` from '@pryzm/file-format'
 *     -> `apps/editor/src/engine/initUI.ts:1035` and `:1990`.
 *
 * So the richly-enriched `IFC4X3Exporter` (Pset_WallCommon, Qto, IfcSpace,
 * IfcZone) is authored-but-unreachable. When the story card reports what PRYZM
 * emits, it must describe `IfcExporter`, NOT the richest file on disk.
 */
export const EXPORT_PATH_CAVEAT =
  'Export facts describe the pipeline the app actually runs (packages/file-format IfcExporter). ' +
  'The richer IFC4X3 exporter exists but has no production caller.';
