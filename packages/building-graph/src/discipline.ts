/**
 * discipline — the element FAMILY → DISCIPLINE taxonomy, and the IFC-class seam.
 *
 * Layer:      L2 (`@pryzm/building-graph`). Pure. No THREE, no DOM, no I/O (P5).
 * Contracts:  C71 §4.2 (the UBG's vocabulary is the canonical query vocabulary)
 * ADR:        ADR-0364 §3 (one graph, six projections)
 * Issue log:  L-8410 · L-8411 · L-8412
 * SPEC:       docs/03-execution/specs/SPEC-ANALYSIS-RELATIONSHIP-GRAPH-3D.md §2.3
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ WHAT THIS FILE IS, AND — MORE IMPORTANTLY — WHAT IT REFUSES TO BE
 * ═════════════════════════════════════════════════════════════════════════════
 * The founder's reference (BIMUniXchange IFC Network Analyzer) groups a model's
 * elements into five DISCIPLINE buckets with counts — Structural (278),
 * Architecture (86), MEP (9), Equipment (66), Spatial (11) — and hangs an IFC
 * TYPE tree under them (`WALL (47)`, `MEMBER (144)`, `SLAB (35)`, `DOOR (16)`…).
 *
 * ⛔ IT IS NOT A SECOND PRYZM-TYPE → IFC-CLASS MAP. That fact already has FOUR
 * homes in this repository — `core-app-model/src/CoreElement.ts`
 * (`ELEMENT_TYPE_TO_IFC_CLASS`), `file-format/src/export/ifc/IfcModelBuilder.ts`
 * (`IFC_CLASS_MAP`), `file-format/src/export/ifc/FragmentReader.ts`
 * (`mapImportedIfcClass`) and the NORMATIVE table in C25 §2 — and lane IFCTREE47
 * is reconciling them into one authority at
 * `plugins/ifc-inspector/src/tree/ifc-class-authority.ts`. A fifth would be the
 * exact defect this repository keeps paying for (five minima tables, three
 * commandManager counters, two IFC class maps, two create surfaces).
 *
 * ⭐ SO THE IFC CLASS ARRIVES AS AN INJECTED SEAM, NOT AS A TABLE HERE.
 * {@link IfcClassResolver} has precisely the return shape `ifc-class-authority.ts`
 * already produces — `mapped` with a class, or `unmapped` with a REASON that
 * separates *"not an IFC product at all"* from *"a real element C25 §2 does not
 * yet rank"*. Until that lane's files are tracked and importable (measured
 * 2026-08-23: `git status --porcelain plugins/ifc-inspector` → `?? src/tree/`),
 * the resolver is absent and every IFC column renders as NOT RESOLVED, naming
 * the reason. It never renders a guess.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⛔ DISCIPLINE IS ASSIGNED PER FAMILY, NEVER PER ELEMENT — AND THAT IS A LIMIT
 * ═════════════════════════════════════════════════════════════════════════════
 * A load-bearing wall is structural and a partition is not. **PRYZM does not
 * author that distinction on a wall.** Measured 2026-08-23:
 *
 *   grep -rn "loadBearing" packages/ apps/ plugins/ | grep -vi beam
 *     → `Wall.ts` declares NO `loadBearing` field; `WallStore` writes none;
 *       `ai-host/src/RuleEngine.ts:617` filters walls on
 *       `loadBearing === undefined`, i.e. it expects the absence;
 *       `core-app-model/src/stores/BeamStore.ts:408` READS `wall.loadBearing`
 *       against a schema that never declares it (recorded separately, L-8412).
 *
 * `BeamData.loadBearing` is real and required (`Beam.ts:75`), and
 * `SlabSystemTypeStore` carries an OPTIONAL `loadBearing` on the slab TYPE whose
 * own comment calls it *"metadata, with nothing enforcing it"* (:129). Neither is
 * a per-element structural role for the families that would need one.
 *
 * ⭐ So this table maps FAMILIES, and every consumer must say so. A count under
 * "Structural" is a count of families this product treats as structural — not a
 * structural analysis, and not a claim about any individual wall. Inventing a
 * per-element split from geometry would be a fabricated measurement, which is
 * strictly worse than a stated one.
 */

/**
 * The five discipline buckets of the reference, plus the two honest non-answers.
 *
 * ⛔ `unclassified` and `unresolved` are NOT a sixth and seventh discipline and
 * must never be coloured as one — the Analysis surface's `ABSENCE_KEYS` neutral
 * exists for exactly this. They are different non-answers and stay separate:
 *
 *   `unclassified` — the family IS known and this taxonomy deliberately places
 *                    it in no discipline (a `grid` is a datum, a `rule` is a
 *                    synthetic constraint node). A stated decision.
 *   `unresolved`   — the family is NOT known for this node: no adapter stamped a
 *                    specific `kind` and the caller's census does not claim the
 *                    id. An absence of information, not a decision.
 */
export type Discipline =
  | 'structural'
  | 'architecture'
  | 'mep'
  | 'equipment'
  | 'spatial'
  | 'unclassified'
  | 'unresolved';

/** Display order on the category list. Absence buckets last, always. */
export const DISCIPLINE_ORDER: readonly Discipline[] = Object.freeze([
  'structural',
  'architecture',
  'mep',
  'equipment',
  'spatial',
  'unclassified',
  'unresolved',
]);

export const DISCIPLINE_LABEL: Readonly<Record<Discipline, string>> = Object.freeze({
  structural: 'Structural',
  architecture: 'Architecture',
  mep: 'MEP',
  equipment: 'Equipment',
  spatial: 'Spatial',
  unclassified: 'Not a product',
  unresolved: 'Family unresolved',
});

/**
 * One sentence per bucket, for the tooltip. The two absence rows carry the whole
 * reason, because a reader who cannot tell them apart has been given one
 * ambiguous fact instead of two clear ones.
 */
export const DISCIPLINE_BASIS: Readonly<Record<Discipline, string>> = Object.freeze({
  structural:
    'Families this product treats as load-carrying fabric: columns, beams and slabs. ' +
    '⚠ Assigned per FAMILY. PRYZM authors no per-wall load-bearing flag, so a load-bearing wall ' +
    'is counted under Architecture with every other wall — this is a family tally, not a ' +
    'structural analysis.',
  architecture:
    'The building envelope and its openings: walls, doors, windows, roofs, floor and ceiling ' +
    'finishes, stairs, handrails, curtain walls and openings.',
  mep: 'Mechanical, electrical and plumbing fixtures: plumbing and lighting.',
  equipment: 'Loose and fixed equipment: furniture.',
  spatial:
    'Spatial containers and circulation: rooms, spaces, storeys, and the synthetic circulation ' +
    'paths the room-graph projection mints.',
  unclassified:
    'Known families this taxonomy deliberately places in NO discipline — a grid is a datum and a ' +
    'rule node is a constraint artefact. Neither is a building product, so neither belongs in a ' +
    'discipline count.',
  unresolved:
    '⛔ NOT a discipline. No adapter stamped a specific kind on these nodes and the element census ' +
    'does not claim their ids, so their family is unknown. Every discipline count above is ' +
    'therefore a FLOOR while this row is non-zero.',
});

/**
 * Family → discipline. Keys are the vocabulary this product actually mints, from
 * two measured sources (2026-08-23):
 *
 *   1. the Analysis element census' declared source table — 18 families:
 *      `apps/editor/src/ui/analysis/analysisReadModel.ts` `CENSUS_SOURCES`;
 *   2. the UBG node kinds actually emitted — `kindFromId`'s 14 id prefixes in
 *      `apps/editor/src/engine/buildBuildingGraph.ts:918`, plus `room` / `door` /
 *      `window` / `circulation` (`roomGraphAdapter.ts`, `buildBuildingGraph.ts:651`)
 *      and `rule` (`constraintAdapter.ts:49`).
 *
 * Both singular and plural keys are present because those two sources disagree
 * about number — the census says `walls`, the graph says `wall` — and normalising
 * one into the other in a consumer is how the two vocabularies drift apart.
 */
const FAMILY_DISCIPLINE: ReadonlyMap<string, Discipline> = new Map<string, Discipline>([
  // ── Structural ───────────────────────────────────────────────────────────
  ['column', 'structural'], ['columns', 'structural'],
  ['beam', 'structural'], ['beams', 'structural'],
  ['slab', 'structural'], ['slabs', 'structural'],

  // ── Architecture ─────────────────────────────────────────────────────────
  ['wall', 'architecture'], ['walls', 'architecture'],
  ['door', 'architecture'], ['doors', 'architecture'],
  ['window', 'architecture'], ['windows', 'architecture'],
  ['roof', 'architecture'], ['roofs', 'architecture'],
  ['floor', 'architecture'], ['floors', 'architecture'],
  ['ceiling', 'architecture'], ['ceilings', 'architecture'],
  ['stair', 'architecture'], ['stairs', 'architecture'],
  ['handrail', 'architecture'], ['handrails', 'architecture'],
  ['curtainwall', 'architecture'], ['curtainWalls', 'architecture'],
  ['opening', 'architecture'], ['openings', 'architecture'],

  // ── MEP ──────────────────────────────────────────────────────────────────
  ['plumbing', 'mep'],
  ['lighting', 'mep'],

  // ── Equipment ────────────────────────────────────────────────────────────
  ['furniture', 'equipment'],

  // ── Spatial ──────────────────────────────────────────────────────────────
  ['room', 'spatial'], ['rooms', 'spatial'],
  ['space', 'spatial'], ['spaces', 'spatial'],
  ['level', 'spatial'], ['levels', 'spatial'],
  ['circulation', 'spatial'],

  // ── Deliberately in no discipline ────────────────────────────────────────
  ['grid', 'unclassified'], ['grids', 'unclassified'],
  ['rule', 'unclassified'],
]);

/**
 * The discipline of a family name, or `'unresolved'` when the name is not one
 * this taxonomy knows.
 *
 * ⛔ `'element'` resolves to `'unresolved'` ON PURPOSE and this is the single
 * most load-bearing line in the file. Three of the five UBG adapters
 * (`semanticAdapter`, `dependencyAdapter`, `constraintAdapter`) stamp
 * `kind: 'element'` on every endpoint they materialise — a GENERIC label meaning
 * *"an adapter created this node and did not know what it was"*. Folding that
 * into any discipline would put an unknown quantity inside a named count and
 * make every bucket unfalsifiable.
 */
export function disciplineOfFamily(family: string | null | undefined): Discipline {
  if (!family) return 'unresolved';
  return FAMILY_DISCIPLINE.get(family) ?? 'unresolved';
}

/** Every family name this taxonomy classifies. For tests and for the type tree. */
export function knownFamilies(): readonly string[] {
  return [...FAMILY_DISCIPLINE.keys()];
}

// ═════════════════════════════════════════════════════════════════════════════
// THE TWO INJECTED SEAMS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * How a node id is resolved to an element FAMILY. Supplied by the caller for the
 * same reason {@link GraphPlacement} is: the authority is the element census,
 * which lives at L7 and reads the element stores, and this package must not
 * reach up to it.
 *
 * ⛔ THE THREE RETURN VALUES ARE THREE DIFFERENT ANSWERS AND MUST STAY APART —
 * the identical discipline `graphReadModel`'s `levelOf` already draws:
 *
 *   `string`    — the census claims this id and names its family;
 *   `null`      — the census claims the id but it carries NO family (should not
 *                 happen today; kept so a future store that cannot type its rows
 *                 has a truthful answer available);
 *   `undefined` — ⛔ the census DOES NOT CLAIM this id. Synthetic nodes
 *                 (`rule:*`, `circulation:*`) and any element in a store outside
 *                 the declared table land here. They are NOT "elements of an
 *                 unknown discipline"; they are ids the census never indexed.
 */
export interface ElementFamilyResolver {
  familyOf(id: string): string | null | undefined;
}

/**
 * The IFC-class seam. ⭐ Deliberately shaped to accept lane IFCTREE47's
 * `ifc-class-authority.ts` return value verbatim, so wiring it is one import and
 * no logic moves.
 */
export type IfcClassResolution =
  | { readonly status: 'mapped'; readonly ifcClass: string }
  | { readonly status: 'unmapped'; readonly reason: 'not-a-product' | 'no-contract-row' };

/** `undefined` ⇒ the authority is not wired yet; the caller renders NOT RESOLVED. */
export type IfcClassResolver = (family: string) => IfcClassResolution | undefined;

/**
 * The label to print in an IFC column. ⛔ Never a guess, never a blank.
 *
 * ⚠ `unmapped` is rendered with its reason intact because *"a view is not an IFC
 * product"* and *"C25 §2 does not yet rank this real element"* are opposite
 * facts: the first is complete, the second is a gap awaiting a founder decision.
 */
export function ifcClassLabel(family: string, resolve: IfcClassResolver | null): string {
  if (!resolve) return 'IFC class not resolved — the class authority is not wired yet';
  const r = resolve(family);
  if (!r) return 'IFC class not resolved — the authority returned nothing for this family';
  if (r.status === 'mapped') return r.ifcClass;
  return r.reason === 'not-a-product'
    ? 'Not an IFC product — absent from IFC by design, not by gap'
    : 'No ratified IFC class — C25 §2 does not yet rank this family';
}
