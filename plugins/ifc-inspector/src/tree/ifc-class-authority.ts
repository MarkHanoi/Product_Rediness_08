/**
 * `ifc-class-authority.ts` — THE single PRYZM-type → IFC-class authority.
 *
 * §IFC-TREE-AUTHORITY (L-8300..L-8305) · governed by C25 §2 (element coverage table).
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 * Before this file, the fact "what IFC class is a PRYZM `wall`?" was written in
 * FOUR places that did not agree, plus 58 hand-typed literals:
 *
 *   A  `packages/core-app-model/src/CoreElement.ts:77`  ELEMENT_TYPE_TO_IFC_CLASS
 *          ElementType -> IFC class NAME. 19 rows. ONE live consumer
 *          (`CreateHandrailCommand.ts:185`). Effectively dead.
 *   B  `packages/file-format/src/export/ifc/IfcModelBuilder.ts:24`  IFC_CLASS_MAP
 *          IFC class NAME -> web-ifc numeric type code. 20 rows.
 *   C  `packages/file-format/src/export/ifc/FragmentReader.ts:250`  mapImportedIfcClass
 *          raw IFC type -> IFC class NAME. Private, inline, import-side only.
 *   D  `docs/02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md §2`
 *          The NORMATIVE table. Per CLAUDE.md conflict-resolution order, when
 *          code disagrees with a contract THE CODE IS WRONG.
 *
 * A and B are NOT rivals — they COMPOSE (A then B). The rivalry is A vs D.
 * This module is the reconciliation, and D wins except where D is demonstrably
 * imprecise about a distinction PRYZM actually makes (see `floor`, below).
 *
 * ---------------------------------------------------------------------------
 * THE HONESTY RULE (C01 §6 rule 6)
 * ---------------------------------------------------------------------------
 * A resolution is NEVER invented. Every `mapped` row cites the authority that
 * ratified it. An element family with no ratified class resolves to `unmapped`
 * and SAYS SO — with the reason distinguished:
 *
 *   'not-a-product'   the family is not an IFC *product* at all (a view, a
 *                     sheet, a schedule). Absent from IFC by design, not by gap.
 *   'no-contract-row' a real, placed, building element that C25 §2 does not
 *                     yet rank. This is a GAP awaiting a founder decision.
 *
 * `candidate` is EXPLICITLY NON-NORMATIVE. It is the class a reviewer would
 * most likely ratify, carried so the founder has something concrete to say yes
 * or no to. It MUST NOT be written into an export, and no caller may treat it
 * as a class. The UI renders it as "candidate (not ratified)" or not at all.
 */

/** Where a mapping's authority comes from. There is no 'because it looked right'. */
export type IfcClassAuthoritySource =
  /** Ratified by the C25 §2 element-coverage table. */
  | 'C25§2'
  /**
   * Ratified by C25 §2 AS AMENDED by this lane (L-8302), where the original
   * row conflated two distinct PRYZM families under one IfcEntity.
   */
  | 'C25§2-amended';

export type IfcUnmappedReason = 'not-a-product' | 'no-contract-row';

export type IfcClassResolution =
  | {
      readonly status: 'mapped';
      readonly ifcClass: string;
      /** IFC PredefinedType enum literal, where the contract names one. */
      readonly predefinedType?: string;
      readonly authority: IfcClassAuthoritySource;
      readonly note?: string;
    }
  | {
      readonly status: 'unmapped';
      readonly reason: IfcUnmappedReason;
      /** NON-NORMATIVE. Never export this. See the header. */
      readonly candidate?: string;
      readonly note?: string;
    };

/**
 * The table.
 *
 * KEYED ON A PLAIN STRING, DELIBERATELY. PRYZM has TWO disagreeing
 * `ElementType` unions:
 *
 *   `packages/schemas/src/types/Id.ts:136`        — the L0 id vocabulary, 36 members
 *   `packages/core-app-model/src/CoreElement.ts:7` — 18 members
 *
 * They disagree on spelling (`curtainwall` vs `curtain-wall`), on membership
 * (`level` and `curtain-panel` exist only in core; eighteen kinds exist only in
 * L0), and therefore `Record<ElementType, string>` keyed on EITHER union is
 * silently partial against the other. Typing this table to one union would
 * re-mint exactly the defect it exists to remove.
 *
 * The exhaustiveness guarantee is a TEST that compares this table's key SET
 * against BOTH unions' member SETS, in both directions — never a count. That
 * is the `check-contract-index-equivalence.ts` shape: a count can be right
 * while the range is wrong.
 */
export const IFC_CLASS_AUTHORITY: Readonly<Record<string, IfcClassResolution>> = Object.freeze({
  // ---- structural / architectural products, ratified by C25 §2 ----
  wall: { status: 'mapped', ifcClass: 'IfcWall', authority: 'C25§2' },
  slab: { status: 'mapped', ifcClass: 'IfcSlab', authority: 'C25§2' },
  column: { status: 'mapped', ifcClass: 'IfcColumn', authority: 'C25§2' },
  beam: { status: 'mapped', ifcClass: 'IfcBeam', authority: 'C25§2' },
  door: { status: 'mapped', ifcClass: 'IfcDoor', authority: 'C25§2' },
  window: { status: 'mapped', ifcClass: 'IfcWindow', authority: 'C25§2' },
  roof: { status: 'mapped', ifcClass: 'IfcRoof', authority: 'C25§2' },
  stair: { status: 'mapped', ifcClass: 'IfcStair', authority: 'C25§2' },
  handrail: { status: 'mapped', ifcClass: 'IfcRailing', authority: 'C25§2' },
  ceiling: {
    status: 'mapped',
    ifcClass: 'IfcCovering',
    predefinedType: 'CEILING',
    authority: 'C25§2',
    note: "C25 §2 row: 'Ceiling | IfcCovering (ceiling type)'.",
  },

  /**
   * §IFC-TREE-FLOOR-IS-A-COVERING (L-8302) — the ONE row where the CODE was
   * right and the CONTRACT was imprecise, so C25 §2 was amended rather than the
   * code changed.
   *
   * C25 §2 carried one row, "Slab / Floor -> IfcSlab", conflating two families
   * PRYZM keeps separate. `packages/core-app-model/src/stores/FloorSystemTypeStore.ts`
   * stamps `ifcTypeName: 'FLOORING'` on every floor system type — that is
   * literally `IfcCoveringTypeEnum.FLOORING`. PRYZM's `floor` is a FINISH, and
   * its `slab` is the STRUCTURE. Mapping the finish to IfcSlab would emit two
   * structural slabs where the model has one slab and one floor finish.
   */
  floor: {
    status: 'mapped',
    ifcClass: 'IfcCovering',
    predefinedType: 'FLOORING',
    authority: 'C25§2-amended',
    note:
      "C25 §2 originally read 'Slab / Floor -> IfcSlab', conflating PRYZM's structural " +
      "`slab` with its finish `floor`. FloorSystemTypeStore stamps ifcTypeName 'FLOORING' " +
      '(= IfcCoveringTypeEnum.FLOORING). Row split by L-8302.',
  },

  /**
   * §IFC-TREE-FURNITURE (L-8303) — code said `IfcFurnishingElement`,
   * C25 §2 says `IfcFurniture`. THE CONTRACT WINS.
   *
   * NOT VERIFIED OFFLINE: the usual rationale is that IFC4/IFC4X3 demoted
   * IfcFurnishingElement to an abstract supertype over IfcFurniture and
   * IfcSystemFurnitureElement. This lane did not verify schema abstractness
   * against a buildingSMART EXPRESS schema and does not assert it. The binding
   * reason here is simply the CLAUDE.md conflict-resolution order: when code
   * disagrees with a contract, the code is wrong.
   */
  furniture: {
    status: 'mapped',
    ifcClass: 'IfcFurniture',
    authority: 'C25§2',
    note:
      "Code said 'IfcFurnishingElement' (CoreElement.ts:77). C25 §2 says IfcFurniture. " +
      'Contract wins. web-ifc exposes IFCFURNITURE = 1509553395, so this is emittable.',
  },

  /**
   * §IFC-TREE-PLUMBING (L-8304) — code said `IfcFlowTerminal`,
   * C25 §2 says `IfcSanitaryTerminal`. THE CONTRACT WINS. Same caveat as
   * `furniture`: this lane did not verify IFC4X3 abstractness offline.
   */
  plumbing: {
    status: 'mapped',
    ifcClass: 'IfcSanitaryTerminal',
    authority: 'C25§2',
    note:
      "Code said 'IfcFlowTerminal' (CoreElement.ts:77). C25 §2 says IfcSanitaryTerminal " +
      'with PredefinedType BATH/SINK/SHOWER/TOILET/WASHHANDBASIN. web-ifc exposes ' +
      'IFCSANITARYTERMINAL = 3053780830.',
  },

  // ---- curtain walling. BOTH spellings, because both unions ship one each. ----
  'curtain-wall': { status: 'mapped', ifcClass: 'IfcCurtainWall', authority: 'C25§2' },
  curtainwall: {
    status: 'mapped',
    ifcClass: 'IfcCurtainWall',
    authority: 'C25§2',
    note:
      'L0 (schemas/Id.ts) spells this `curtainwall`; core-app-model spells it ' +
      '`curtain-wall`. Both resolve here so neither vocabulary is silently partial. ' +
      'The SPELLING SPLIT ITSELF is logged as L-8301 and is not fixed by this lane.',
  },
  'curtain-panel': {
    status: 'mapped',
    ifcClass: 'IfcPlate',
    predefinedType: 'CURTAIN_PANEL',
    authority: 'C25§2-amended',
    note:
      'C25 §2 has no `curtain-panel` row. IfcPlate/CURTAIN_PANEL is the buildingSMART ' +
      'infill member for a curtain wall and IfcModelBuilder already carries IfcPlate. ' +
      'Row ADDED to C25 §2 by L-8302 rather than invented here.',
  },

  // ---- spatial / non-product ----
  room: {
    status: 'mapped',
    ifcClass: 'IfcSpace',
    authority: 'C25§2',
    note: 'C25 §2: Space / Room -> IfcSpace, Pset_SpaceCommon.',
  },
  grid: {
    status: 'mapped',
    ifcClass: 'IfcGrid',
    authority: 'C25§2',
    note:
      'C25 §2 ranks Grid -> IfcGrid. ⚠ IFC_CLASS_MAP (IfcModelBuilder.ts:24) has NO ' +
      'IfcGrid row, so a grid reaching that builder falls through line 156 to ' +
      'IFCBUILDINGELEMENTPROXY. Logged as L-8305.',
  },
  level: {
    status: 'mapped',
    ifcClass: 'IfcBuildingStorey',
    authority: 'C25§2',
    note:
      'Spatial structure, NOT a product. Written by hierarchy.ts, never by ' +
      'IfcModelBuilder. Its absence from IFC_CLASS_MAP is CORRECT, not a gap — a ' +
      'storey emitted as a product would be a schema error.',
  },
  opening: {
    status: 'mapped',
    ifcClass: 'IfcOpeningElement',
    authority: 'C25§2',
    note: 'Voiding element; related via IfcRelVoidsElement, not contained as a product.',
  },

  // ---- ratified by C25 but recorded there as GAP-not-yet-emitted ----
  lighting: {
    status: 'mapped',
    ifcClass: 'IfcLightFixture',
    authority: 'C25§2',
    note:
      "C25 §2 row 'Light | IfcLightFixture | Pset_LightFixtureTypeCommon | GAP — IFC-β'. " +
      'The CLASS is ratified; the EXPORTER is not written. Mapped here so the tree can ' +
      'group it honestly; that is not a claim that it exports.',
  },
  annotation: {
    status: 'mapped',
    ifcClass: 'IfcAnnotation',
    authority: 'C25§2',
    note: "C25 §4 — annotation export is ratified as IfcAnnotation and recorded NOT implemented.",
  },
  dimension: {
    status: 'mapped',
    ifcClass: 'IfcAnnotation',
    authority: 'C25§2',
    note: 'C25 §4 groups dimension strings with annotation under IfcAnnotation.',
  },

  // ---------------------------------------------------------------------
  // UNMAPPED — 'no-contract-row'. Real, placed building elements that C25 §2
  // does not rank. ⛔ NOTHING HERE IS INVENTED. Each carries a NON-NORMATIVE
  // candidate so the founder has a concrete yes/no, and the tree shows them as
  // unmapped and NAMES them. Logged as L-8306.
  // ---------------------------------------------------------------------
  lift: {
    status: 'unmapped',
    reason: 'no-contract-row',
    candidate: 'IfcTransportElement',
    note:
      'IfcTransportElement/ELEVATOR is the obvious buildingSMART fit, but C25 §2 has no ' +
      'row and this lane will not mint one. Founder decision — L-8306.',
  },
  liftPart: {
    status: 'unmapped',
    reason: 'no-contract-row',
    note:
      'A sub-part of a lift. Whether it is an IFC product at all, or an aggregate member ' +
      'of the lift via IfcRelAggregates, is undecided. No candidate offered.',
  },
  verticalCirculation: {
    status: 'unmapped',
    reason: 'no-contract-row',
    note:
      'A PRYZM abstraction spanning stair + lift. It may have no single IFC class and may ' +
      'be correct to decompose rather than map. No candidate offered.',
  },
  balcony: {
    status: 'unmapped',
    reason: 'no-contract-row',
    candidate: 'IfcSlab',
    note:
      'Commonly IfcSlab with a BALCONY-ish PredefinedType, but IFC4 has no BALCONY enum ' +
      'and practice varies. C25 §2 has no row. Founder decision — L-8306.',
  },
  pool: {
    status: 'unmapped',
    reason: 'no-contract-row',
    note:
      'IFC has no swimming-pool product. Candidates are all compromises ' +
      '(IfcBuildingElementProxy, or a decomposition into slab + walls + water). ' +
      'Deliberately NO candidate — offering one would be inventing.',
  },
  water: {
    status: 'unmapped',
    reason: 'no-contract-row',
    note: 'A material/volume, not a placed product. No IFC product class is honest here.',
  },
  boundaryLine: {
    status: 'unmapped',
    reason: 'no-contract-row',
    candidate: 'IfcAnnotation',
    note:
      'C105 setting-out line. IfcAnnotation carries it as drafting; IfcSite boundary ' +
      'semantics would be richer. C25 §2 has no row. Founder decision — L-8306.',
  },
  structural: {
    status: 'unmapped',
    reason: 'no-contract-row',
    note:
      'A category, not a family — IFC would express it as IfcStructuralAnalysisModel or ' +
      'as LoadBearing=true on the member. No single class. No candidate offered.',
  },
  section: {
    status: 'unmapped',
    reason: 'not-a-product',
    note:
      'A drawing view definition. C102 (View & Sheet Integrity) governs it. IFC4 can carry ' +
      'it as IfcAnnotation on a sheet, but the section itself is not a building product.',
  },
  projectOrigin: {
    status: 'unmapped',
    reason: 'not-a-product',
    note:
      'The survey/project datum. Expressed in IFC as IfcMapConversion + ' +
      'IfcGeometricRepresentationContext (C25 §7), never as a product.',
  },

  // ---- 'not-a-product' — absent from IFC by DESIGN, not by gap ----
  view: { status: 'unmapped', reason: 'not-a-product', note: 'A drawing view. C102 governs.' },
  sheet: { status: 'unmapped', reason: 'not-a-product', note: 'A drawing sheet. C102 governs.' },
  schedule: {
    status: 'unmapped',
    reason: 'not-a-product',
    note: 'A tabular report over elements, not an element.',
  },
  project: {
    status: 'unmapped',
    reason: 'not-a-product',
    note: 'IfcProject is the spatial ROOT, emitted by hierarchy.ts. Not a product row.',
  },
});

/**
 * Resolve a PRYZM element type to its IFC class.
 *
 * An UNKNOWN type — one in neither vocabulary — is NOT silently proxied to
 * IfcBuildingElementProxy the way `IfcModelBuilder.ts:156` does. It resolves to
 * `unmapped`, because "we have never heard of this" and "this is a generic
 * building element" are different facts and the tree must not blur them.
 */
export function resolveIfcClass(elementType: string): IfcClassResolution {
  const hit = IFC_CLASS_AUTHORITY[elementType];
  if (hit) return hit;
  return {
    status: 'unmapped',
    reason: 'no-contract-row',
    note: `'${elementType}' is in neither the L0 id vocabulary nor core-app-model's ElementType. Unrecognised, not proxied.`,
  };
}

/** Every element type this authority ranks. Used by the equivalence test. */
export function authorityKeys(): readonly string[] {
  return Object.keys(IFC_CLASS_AUTHORITY);
}

/** The IFC classes this authority can actually produce (deduped, sorted). */
export function mappedIfcClasses(): readonly string[] {
  const out = new Set<string>();
  for (const r of Object.values(IFC_CLASS_AUTHORITY)) {
    if (r.status === 'mapped') out.add(r.ifcClass);
  }
  return [...out].sort();
}
