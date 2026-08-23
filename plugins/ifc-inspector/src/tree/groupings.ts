/**
 * `groupings.ts` — the five IFC tree groupings, and the empty-state vocabulary
 * that keeps each of them honest.
 *
 * §IFC-TREE-GROUPINGS (L-8320..L-8331) · C01 §6 rule 6 · C25 §2 · C66 (scale).
 *
 *   IFC spatial · By IFC class · By IFC system · By material · By storey
 *
 * ---------------------------------------------------------------------------
 * THE PERFORMANCE INVARIANT — why counts can cover 111,263 rows and rendering
 * cannot, without either half lying
 * ---------------------------------------------------------------------------
 * Grouping is a SINGLE O(n) counting pass that never materialises a row. A
 * group holds its member IDS and its COUNT, so "IfcWall — 4,812" is exact for
 * every element in the model. Row materialisation is a SEPARATE, BOUNDED step
 * (`row-window.ts`). That separation is what lets the tree state a true total
 * while rendering a preview, instead of the usual choice between freezing the
 * editor and quietly under-reporting.
 *
 * ---------------------------------------------------------------------------
 * THE EMPTY-STATE RULE (merge-blocking, C01 §6 rule 6)
 * ---------------------------------------------------------------------------
 * ⛔ A grouping with nothing to show MUST say WHY, and the four causes are
 * DIFFERENT FACTS that happen to produce the same empty array:
 *
 *   'no-model'          nothing is loaded at all.
 *   'absent'            we DID extract this facet and the model authors none.
 *                       A fact about the model.
 *   'not-extracted'     PRYZM does not read this facet from this source.
 *                       A fact about PRYZM. Says nothing about the model.
 *   'absent-or-not-extracted'
 *                       both halves are in play (one source extracts it and
 *                       found none, another never looked) and we CANNOT
 *                       distinguish. ⭐ Then NAME BOTH CAUSES IN ONE SENTENCE
 *                       rather than picking the flattering one.
 *
 * A grouping may also be PARTIAL — populated, but with a stated limit (e.g.
 * spatial depth stops at storey because the parse gives no Site or Building).
 * Partial is not empty and must not be dressed as complete.
 */

import type {
  Facet,
  IfcTreeElement,
  IfcTreeSource,
  SpatialRung,
} from './tree-source.js';

export type GroupingId = 'spatial' | 'class' | 'system' | 'material' | 'storey';

export interface IfcGroup {
  readonly key: string;
  readonly label: string;
  /** EXACT — covers every element in the model, not just rendered ones. */
  readonly count: number;
  /** Member ids, in source order. Ids only; rows are materialised elsewhere. */
  readonly memberIds: readonly string[];
  /** Nested groups, for the spatial chain. */
  readonly children: readonly IfcGroup[];
  /**
   * Set when this group exists because a facet was MISSING rather than shared —
   * e.g. the "Unmapped" class bucket or the "Not authored" material bucket.
   * The UI renders these distinctly; they are findings, not categories.
   */
  readonly deficit?: 'unmapped' | 'not-authored' | 'unassigned';
}

export type Coverage =
  | {
      readonly kind: 'populated';
      /** Elements that landed in a real group. */
      readonly grouped: number;
      /** Elements that landed in a deficit bucket. */
      readonly deficit: number;
      /** Stated when populated-but-limited. Rendered under the tree. */
      readonly limitNote?: string;
    }
  | {
      readonly kind: 'empty';
      readonly cause: 'no-model' | 'absent' | 'not-extracted' | 'absent-or-not-extracted';
      /** The exact sentence shown to the user. */
      readonly message: string;
    };

export interface Grouping {
  readonly id: GroupingId;
  readonly label: string;
  readonly groups: readonly IfcGroup[];
  readonly coverage: Coverage;
  /** Total elements considered — the TRUE total, always. */
  readonly totalElements: number;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * The groupable value of a facet.
 *
 * §IFC-TREE-HOSTED-STOREY (L-8900). `derived` COUNTS — a door whose storey came
 * from its host wall belongs in that storey's group, which is exactly what the
 * founder (and Revit, and every other viewer) expects to see. The fact that it
 * was derived is not lost: it is carried on the facet and surfaced by the story
 * card's provenance chip and by `deriveStats()` below.
 *
 * `per-part` deliberately does NOT return a single value — see `partsKey`.
 */
function facetValue(f: Facet): string | null {
  if (f.kind === 'authored') return f.value;
  if (f.kind === 'derived') return f.value;
  return null;
}

/** Stable label/key for a deliberately multi-valued facet (C100 §9.1). */
function partsKey(f: Facet): { key: string; label: string } | null {
  if (f.kind !== 'per-part') return null;
  const parts = [...f.parts].sort((a, b) => a.part.localeCompare(b.part));
  return {
    key: `parts:${parts.map((x) => `${x.part}=${x.value}`).join('|')}`,
    label: parts.map((x) => `${x.part}: ${x.value}`).join(' · '),
  };
}

/**
 * How many of a grouping's members were DERIVED rather than directly carried.
 * Reported in the limit note so a derived tree never passes as an authored one.
 */
function deriveStats(
  elements: readonly IfcTreeElement[],
  pick: (e: IfcTreeElement) => Facet,
): { derived: number; unresolved: number } {
  let d = 0;
  let u = 0;
  for (const e of elements) {
    const f = pick(e);
    if (f.kind === 'derived') d++;
    else if (f.kind === 'unresolved') u++;
  }
  return { derived: d, unresolved: u };
}

/** One O(n) pass. Returns insertion-ordered groups. */
function bucket(
  elements: readonly IfcTreeElement[],
  keyOf: (e: IfcTreeElement) => { key: string; label: string; deficit?: IfcGroup['deficit'] },
): IfcGroup[] {
  const acc = new Map<string, { label: string; ids: string[]; deficit?: IfcGroup['deficit'] }>();
  for (const e of elements) {
    const { key, label, deficit } = keyOf(e);
    let slot = acc.get(key);
    if (!slot) {
      slot = { label, ids: [], deficit };
      acc.set(key, slot);
    }
    slot.ids.push(e.id);
  }
  return [...acc.entries()].map(([key, v]) => ({
    key,
    label: v.label,
    count: v.ids.length,
    memberIds: v.ids,
    children: [],
    ...(v.deficit ? { deficit: v.deficit } : {}),
  }));
}

function countDeficit(groups: readonly IfcGroup[]): number {
  return groups.reduce((n, g) => n + (g.deficit ? g.count : 0), 0);
}

/**
 * Decide the empty cause across a set of sources for one facet.
 *
 * ⭐ THE POINT OF THIS FUNCTION. `elements.length === 0` after filtering is the
 * same value whether the model authored nothing or PRYZM never looked. This
 * asks the SOURCES what they are capable of instead of inferring from the
 * result — the only way to tell the two apart.
 */
function emptyCause(
  sources: readonly IfcTreeSource[],
  extracts: (s: IfcTreeSource) => boolean,
): Extract<Coverage, { kind: 'empty' }>['cause'] {
  if (sources.length === 0) return 'no-model';
  const canLook = sources.filter(extracts);
  if (canLook.length === 0) return 'not-extracted';
  if (canLook.length === sources.length) return 'absent';
  return 'absent-or-not-extracted';
}

function allElements(sources: readonly IfcTreeSource[]): IfcTreeElement[] {
  return sources.flatMap((s) => [...s.elements]);
}

// ---------------------------------------------------------------------------
// 1 — IFC spatial
// ---------------------------------------------------------------------------

const RUNG_ORDER: readonly SpatialRung['level'][] = [
  'project',
  'site',
  'building',
  'storey',
  'space',
];

/**
 * Nests elements down the Project -> Site -> Building -> Storey -> Space chain.
 *
 * ⚠ A SHORT CHAIN IS REPORTED, NOT PADDED. An imported model gives storey only.
 * Inventing a "Building" rung to make the tree look like Revit's would be
 * fabricating spatial structure that is not in the file — the exact failure
 * C01 §6 rule 6 forbids. Instead the depth reached is stated.
 */
export function groupBySpatial(sources: readonly IfcTreeSource[]): Grouping {
  const elements = allElements(sources);
  const total = elements.length;

  if (total === 0) {
    return {
      id: 'spatial',
      label: 'IFC spatial',
      groups: [],
      coverage: {
        kind: 'empty',
        cause: 'no-model',
        message: 'No model loaded. Import an IFC file, or create PRYZM elements, to populate the spatial tree.',
      },
      totalElements: 0,
    };
  }

  // Deepest rung any source can reach, for the honest limit note.
  const deepest = sources.reduce<SpatialRung['level'] | 'none'>((best, s) => {
    const d = s.capability.deepestSpatialRung;
    if (d === 'none') return best;
    if (best === 'none') return d;
    return RUNG_ORDER.indexOf(d) > RUNG_ORDER.indexOf(best) ? d : best;
  }, 'none');

  const root: IfcGroup[] = [];
  // Build the nest by walking each element's chain.
  const mutable = new Map<string, { key: string; label: string; ids: string[] }>();
  const childrenOf = new Map<string, string[]>();
  const rootKeys: string[] = [];
  const unplaced: string[] = [];

  for (const e of elements) {
    if (e.spatial.length === 0) {
      unplaced.push(e.id);
      continue;
    }
    let parentKey: string | null = null;
    for (const rung of e.spatial) {
      const key = `${rung.level}:${rung.id}`;
      let slot = mutable.get(key);
      if (!slot) {
        slot = { key, label: rung.name, ids: [] };
        mutable.set(key, slot);
        if (parentKey === null) {
          if (!rootKeys.includes(key)) rootKeys.push(key);
        } else {
          const sib: string[] = childrenOf.get(parentKey) ?? [];
          if (!sib.includes(key)) sib.push(key);
          childrenOf.set(parentKey, sib);
        }
      }
      parentKey = key;
    }
    // The element belongs to its DEEPEST rung.
    const leafKey = `${e.spatial[e.spatial.length - 1]!.level}:${e.spatial[e.spatial.length - 1]!.id}`;
    mutable.get(leafKey)!.ids.push(e.id);
  }

  const build = (key: string): IfcGroup => {
    const slot = mutable.get(key)!;
    const children = (childrenOf.get(key) ?? []).map(build);
    const nestedCount = children.reduce((n, c) => n + c.count, 0);
    return {
      key,
      label: slot.label,
      count: slot.ids.length + nestedCount,
      memberIds: slot.ids,
      children,
    };
  };

  for (const k of rootKeys) root.push(build(k));

  if (unplaced.length > 0) {
    root.push({
      key: 'spatial:unplaced',
      label: 'Not in any spatial container',
      count: unplaced.length,
      memberIds: unplaced,
      children: [],
      deficit: 'unassigned',
    });
  }

  const limitNote =
    deepest === 'storey'
      ? 'Spatial depth reaches STOREY. Site, Building and Space rungs are not extracted from this source, so this tree is shallower than the file — it is not a claim that the file lacks them.'
      : deepest === 'none'
        ? 'No spatial containment extracted.'
        : undefined;

  return {
    id: 'spatial',
    label: 'IFC spatial',
    groups: root,
    coverage: {
      kind: 'populated',
      grouped: total - unplaced.length,
      deficit: unplaced.length,
      ...(limitNote ? { limitNote } : {}),
    },
    totalElements: total,
  };
}

// ---------------------------------------------------------------------------
// 2 — By IFC class
// ---------------------------------------------------------------------------

/**
 * The one grouping that is complete for BOTH halves — imported elements carry
 * their own class, native elements resolve through the C25 §2 authority.
 *
 * ⭐ Elements whose PRYZM family has no ratified IFC class land in an
 * "Unmapped" bucket that NAMES THEM. That bucket is the whole point: it is the
 * first surface in PRYZM that makes the eighteen unranked element families
 * visible, instead of silently proxying them to IfcBuildingElementProxy the way
 * `IfcModelBuilder.ts:156` does.
 */
export function groupByClass(sources: readonly IfcTreeSource[]): Grouping {
  const elements = allElements(sources);
  const total = elements.length;

  if (total === 0) {
    return {
      id: 'class',
      label: 'By IFC class',
      groups: [],
      coverage: {
        kind: 'empty',
        cause: 'no-model',
        message: 'No model loaded. Import an IFC file, or create PRYZM elements, to group by IFC class.',
      },
      totalElements: 0,
    };
  }

  const groups = bucket(elements, (e) => {
    if (e.ifcClass.status === 'mapped') {
      return { key: e.ifcClass.ifcClass, label: e.ifcClass.ifcClass };
    }
    const reason =
      e.ifcClass.reason === 'not-a-product'
        ? 'Not an IFC product'
        : 'Unmapped — no C25 §2 row';
    return { key: `unmapped:${e.ifcClass.reason}`, label: reason, deficit: 'unmapped' as const };
  });

  groups.sort((a, b) => {
    if (!!a.deficit !== !!b.deficit) return a.deficit ? 1 : -1;
    return b.count - a.count;
  });

  return {
    id: 'class',
    label: 'By IFC class',
    groups,
    coverage: { kind: 'populated', grouped: total - countDeficit(groups), deficit: countDeficit(groups) },
    totalElements: total,
  };
}

// ---------------------------------------------------------------------------
// 3 — By IFC system
// ---------------------------------------------------------------------------

/**
 * ⭐⭐ THE HONEST-EMPTY CASE, and the reason the empty-state vocabulary exists.
 *
 * Measured at HEAD: `IfcSystem` / `IfcDistributionSystem` appear NOWHERE in
 * production code. `IfcElementRecord` has no system field, so imported models
 * are NOT-EXTRACTED. PRYZM authors no MEP networks, so the native half is
 * ABSENT. When both halves are loaded the two causes are simultaneously true
 * and indistinguishable per-element — so the message NAMES BOTH, which is
 * exactly the wording pattern the founder's reference uses.
 *
 * ⛔ PRYZM's wall/floor/ceiling "system types" are NOT IFC systems. They are
 * IFC TYPE OBJECTS (IfcWallType and friends). Grouping them here would produce
 * a populated, plausible, WRONG tree — worse than an empty honest one.
 */
export function groupBySystem(sources: readonly IfcTreeSource[]): Grouping {
  const elements = allElements(sources);
  const total = elements.length;
  const withSystem = elements.filter((e) => facetValue(e.system) !== null);

  if (withSystem.length === 0) {
    const cause = emptyCause(sources, (s) => s.capability.answersSystem);
    const message =
      cause === 'no-model'
        ? 'No model loaded.'
        : cause === 'not-extracted'
          ? 'No systems authored in this model (or system extraction is not yet enabled). PRYZM does not currently read IfcSystem membership from imported files, so this is a limit of the parse, not a statement about the file.'
          : cause === 'absent'
            ? 'No systems authored in this model. PRYZM elements do not carry IfcSystem (MEP or functional network) membership — note that PRYZM system TYPES are IFC type objects, which is a different relation.'
            : 'No systems authored in this model (or system extraction is not yet enabled). Both causes are in play: PRYZM authors no IfcSystem membership on its own elements, and does not extract it from imported files. These are different facts and neither can be ruled out here.';
    return {
      id: 'system',
      label: 'By IFC system',
      groups: [],
      coverage: { kind: 'empty', cause, message },
      totalElements: total,
    };
  }

  const groups = bucket(elements, (e) => {
    const v = facetValue(e.system);
    if (v) return { key: `sys:${v}`, label: v };
    return {
      key: e.system.kind === 'not-extracted' ? 'sys:not-extracted' : 'sys:not-authored',
      label: e.system.kind === 'not-extracted' ? 'System not extracted' : 'No system assigned',
      deficit: (e.system.kind === 'not-extracted' ? 'unassigned' : 'not-authored') as IfcGroup['deficit'],
    };
  });

  return {
    id: 'system',
    label: 'By IFC system',
    groups,
    coverage: { kind: 'populated', grouped: withSystem.length, deficit: total - withSystem.length },
    totalElements: total,
  };
}

// ---------------------------------------------------------------------------
// 4 — By material
// ---------------------------------------------------------------------------

/**
 * ⭐ The PARTIAL case. The native half genuinely carries materials; the
 * imported half does not extract them. Reporting either number alone would
 * misdescribe the other. So the limit note states which half is covered, and
 * "material — not authored on this element" stays distinct from "not
 * extracted", exactly as the reference distinguishes them.
 */
export function groupByMaterial(sources: readonly IfcTreeSource[]): Grouping {
  const elements = allElements(sources);
  const total = elements.length;
  const withMaterial = elements.filter(
    (e) => facetValue(e.material) !== null || e.material.kind === 'per-part',
  );

  if (withMaterial.length === 0) {
    const cause = emptyCause(sources, (s) => s.capability.answersMaterial);
    const message =
      cause === 'no-model'
        ? 'No model loaded.'
        : cause === 'not-extracted'
          ? 'Materials are present in the model; per-element assignment is not yet extracted (data-only parse). PRYZM does not read IfcRelAssociatesMaterial from imported files.'
          : cause === 'absent'
            ? 'No materials authored on any element in this model.'
            : 'No materials to group. Both causes are in play: some elements author none, and imported elements have their material present in the file but not yet extracted (data-only parse).';
    return {
      id: 'material',
      label: 'By material',
      groups: [],
      coverage: { kind: 'empty', cause, message },
      totalElements: total,
    };
  }

  const groups = bucket(elements, (e) => {
    const v = facetValue(e.material);
    if (v) return { key: `mat:${v}`, label: v };

    // §IFC-TREE-PER-PART-MATERIAL (L-8903). A door carries frame AND leaf
    // finishes and C100 §9.1 rules that split CORRECT. It is a REAL group, not
    // a deficit — reporting it as "not authored" would misdescribe a deliberate
    // design, and flattening it would pick a winner between two right answers.
    const pk = partsKey(e.material);
    if (pk) return { key: `mat:${pk.key}`, label: pk.label };

    if (e.material.kind === 'not-extracted') {
      return {
        key: 'mat:not-extracted',
        label: 'Material not extracted',
        deficit: 'unassigned' as const,
      };
    }
    return {
      key: 'mat:not-authored',
      label: 'Material not authored on this element',
      deficit: 'not-authored' as const,
    };
  });

  groups.sort((a, b) => {
    if (!!a.deficit !== !!b.deficit) return a.deficit ? 1 : -1;
    return b.count - a.count;
  });

  const notExtracted = elements.filter((e) => e.material.kind === 'not-extracted').length;
  const limitNote =
    notExtracted > 0
      ? `${notExtracted.toLocaleString()} of ${total.toLocaleString()} elements have their material present in the source but not extracted by PRYZM. Those are grouped under "Material not extracted" and are NOT counted as unmaterialed.`
      : undefined;

  return {
    id: 'material',
    label: 'By material',
    groups,
    coverage: {
      kind: 'populated',
      grouped: withMaterial.length,
      deficit: total - withMaterial.length,
      ...(limitNote ? { limitNote } : {}),
    },
    totalElements: total,
  };
}

// ---------------------------------------------------------------------------
// 5 — By storey
// ---------------------------------------------------------------------------

/**
 * The flat storey list — the same rung the spatial tree reaches, without the
 * nesting. Complete for BOTH halves: imported elements carry `storeyName`,
 * native elements carry a level.
 */
export function groupByStorey(sources: readonly IfcTreeSource[]): Grouping {
  const elements = allElements(sources);
  const total = elements.length;

  if (total === 0) {
    return {
      id: 'storey',
      label: 'By storey',
      groups: [],
      coverage: {
        kind: 'empty',
        cause: 'no-model',
        message: 'No model loaded. Import an IFC file, or create PRYZM elements, to group by storey.',
      },
      totalElements: 0,
    };
  }

  const groups = bucket(elements, (e) => {
    // `derived` lands here too — a hosted door groups under its host's storey.
    const v = facetValue(e.storey);
    if (v) return { key: `st:${v}`, label: v };

    if (e.storey.kind === 'not-extracted') {
      return { key: 'st:not-extracted', label: 'Storey not extracted', deficit: 'unassigned' as const };
    }

    // §IFC-TREE-HOSTED-STOREY (L-8901). A hosted opening whose host did not
    // resolve is NOT "unassigned" — it is derivable in principle and the
    // derivation failed. The bucket says WHICH failure, because a missing host
    // and a host with no level have different owners.
    if (e.storey.kind === 'unresolved') {
      const noHost = /carries no wallId|not in the wall store/.test(e.storey.why);
      return noHost
        ? {
            key: 'st:unresolved-host',
            label: 'Hosted, but the host wall could not be found',
            deficit: 'unassigned' as const,
          }
        : {
            key: 'st:unresolved-level',
            label: 'Hosted, but the host wall carries no level',
            deficit: 'unassigned' as const,
          };
    }

    return { key: 'st:unassigned', label: 'Not assigned to a storey', deficit: 'unassigned' as const };
  });

  const stats = deriveStats(elements, (e) => e.storey);
  const limitNote =
    stats.derived > 0
      ? `${stats.derived.toLocaleString()} of ${total.toLocaleString()} elements are hosted openings ` +
        '(doors and windows) whose storey was DERIVED from their host wall. PRYZM does not store a ' +
        'level on a door or a window — C15 makes it an offset along a wall — so this is a resolved ' +
        'reference, not a value the element carries.'
      : undefined;

  return {
    id: 'storey',
    label: 'By storey',
    groups,
    coverage: {
      kind: 'populated',
      grouped: total - countDeficit(groups),
      deficit: countDeficit(groups),
      ...(limitNote ? { limitNote } : {}),
    },
    totalElements: total,
  };
}

// ---------------------------------------------------------------------------

export const GROUPINGS: readonly {
  readonly id: GroupingId;
  readonly label: string;
  readonly build: (s: readonly IfcTreeSource[]) => Grouping;
}[] = Object.freeze([
  { id: 'spatial', label: 'IFC spatial', build: groupBySpatial },
  { id: 'class', label: 'By IFC class', build: groupByClass },
  { id: 'system', label: 'By IFC system', build: groupBySystem },
  { id: 'material', label: 'By material', build: groupByMaterial },
  { id: 'storey', label: 'By storey', build: groupByStorey },
]);

export function buildGrouping(id: GroupingId, sources: readonly IfcTreeSource[]): Grouping {
  const entry = GROUPINGS.find((g) => g.id === id);
  if (!entry) throw new Error(`Unknown grouping '${id}'`);
  return entry.build(sources);
}
