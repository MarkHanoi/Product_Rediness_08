// §CW-2a / C87 §13.2 — THE CURTAIN-PANEL VOCABULARY, IN ONE PLACE.
//
// ─── WHAT WAS WRONG ───────────────────────────────────────────────────────────
// C87 §9 recorded "THREE incompatible panel vocabularies". Re-measured 2026-08-19,
// the 4-member "kind" answer alone was hand-written FOUR times, independently:
//
//   1. packages/schemas/src/elements/CurtainWall.ts       z.enum([...])
//   2. geometry-kernel/.../curtain-wall/buildPanels.ts    type PanelKind
//   3. packages/types-builtin/src/curtain-wall/index.ts   type CurtainPanelKind
//                                                          ⚠ DIFFERENT MEMBER ORDER
//   4. plugins/curtain-wall/.../material-bridge.ts        PANEL_KINDS
//
// Copy 3 is re-exported through `types-builtin/src/index.ts` and
// `plugin-sdk/src/index.ts`, so the duplication is PUBLISHED on the SDK facade.
// Its member order differs from every other copy — which is exactly what a
// transcription looks like and what a generated projection could not produce.
//
// One question — "what kind of panel is this?" — had FIVE answers (four 4-member
// copies plus the 13-member `PanelType` in `@pryzm/geometry-curtain-wall`).
// That is C84 EI-9 at its plainest.
//
// ─── WHY THE MASTER LIVES HERE AND NOT IN `geometry-curtain-wall` ─────────────
// C87 CW-Voc-5 originally named `PanelType` (in `@pryzm/geometry-curtain-wall`)
// the master. MEASURED, THAT IS NOT BUILDABLE, and the dependency graph is why:
//
//   package                 depends on @pryzm/schemas?  can import geometry-curtain-wall?
//   geometry-kernel         YES                         no — a sideways dep it does not have
//   types-builtin           NO DEPS AT ALL (by design)  no
//   schemas (this package)  n/a — it IS L0              NO — upward import (P5: schemas are pure)
//
// A master nobody can import is not a master. `packages/schemas` is L0 with zero
// dependencies, so it is the ONLY layer every consumer can reach downward. The
// vocabulary therefore lives here, and C87 CW-Voc-5 is corrected accordingly.
//
// ─── WHAT THIS DOES NOT DO, STATED SO IT IS NOT MISREAD ───────────────────────
// `geometry-curtain-wall` and `types-builtin` still declare their own copies,
// because neither depends on this package and adding a dependency edge means a
// `package.json` + lockfile change this lane will not make in a shared tree.
// Those copies are therefore LICENSED under C84 EI-10, which requires all four of:
//   (a) a NAMED REASON — the dependency boundary above. Not "convenience".
//   (b) an EXECUTED EQUIVALENCE PROOF — `CurtainPanelVocabularyIsOne.test.ts`,
//       which compares EVERY member of EVERY copy against this file. C84 EI-8a is
//       explicit that a comment is not a synchronisation mechanism, and that the
//       comment mechanism has already failed twice, measured.
//   (c) a DECLARED DIVERGENCE LIST — empty. The copies must be member-identical;
//       the test asserts that rather than assuming it.
//   (d) a RETIREMENT CONDITION — when `geometry-curtain-wall` and `types-builtin`
//       gain a dependency on `@pryzm/schemas`, both copies become re-exports and
//       this licence is void.

/**
 * THE MASTER. Every panel form the geometry layer can build, in declaration order.
 *
 * Widest of the vocabularies and therefore the one that cannot be derived from
 * another: `CURTAIN_PANEL_KINDS` below is a projection OF this, and it is lossy.
 */
export const CURTAIN_PANEL_TYPES = [
  'SystemPanel_Glass',
  'SystemPanel_Opaque',
  'SystemPanel_Empty',
  'SystemPanel_Door',
  'SystemPanel_SlatsVerticalFramed',
  'SystemPanel_SlatsVerticalDense',
  'SystemPanel_SlatsVerticalOpen',
  'SystemPanel_SlatsHorizontal',
  'SystemPanel_CurtainCornerFold',
  'SystemPanel_CurtainFlat',
  'SystemPanel_CurtainOrganic',
  'SystemPanel_CurtainSide',
  'SystemPanel_CurtainDoubleMixed',
] as const;

export type CurtainPanelTypeName = (typeof CURTAIN_PANEL_TYPES)[number];

/**
 * The RENDER-CLASS projection: the four buckets the kernel producer and the
 * material bridge classify a panel into when picking a colour and a material slot.
 *
 * ⚠ THIS IS A COARSER QUESTION THAN `CURTAIN_PANEL_TYPES`, NOT A RIVAL ANSWER TO
 * THE SAME ONE. Keeping both is correct; keeping both UNRECONCILED was the defect.
 */
export const CURTAIN_PANEL_KINDS = ['glazed', 'spandrel', 'door', 'opaque'] as const;

export type CurtainPanelKindName = (typeof CURTAIN_PANEL_KINDS)[number];

/**
 * TYPE → KIND, total and explicit. `null` means "this type has no render kind",
 * which is a real answer and not a missing one.
 *
 * ⛔ THERE WAS NO SUCH MAPPING ANYWHERE IN THE REPOSITORY BEFORE THIS FILE
 * (`grep -rn SystemPanel_Glass` → not one site converts a type to a kind). C87 §9's
 * "nine of thirteen `PanelType` members have no `PanelKind`" was therefore not a
 * lossy bridge — it was the ABSENCE of a bridge, and every hop that needed one
 * defaulted to `'glazed'` instead (see `material-bridge.ts`, L-1053).
 *
 * Each row is justified by the measured render defaults in
 * `geometry-curtain-wall/src/CurtainPanelTypes.ts:198-289` — `transparent` and
 * `opacity` are what the kernel's colour buckets actually key on — so the
 * projection is derived from what the geometry DOES, not from what the names suggest.
 */
export const CURTAIN_PANEL_TYPE_TO_KIND: Readonly<
  Record<CurtainPanelTypeName, CurtainPanelKindName | null>
> = {
  SystemPanel_Glass: 'glazed',                    // transparent, opacity 0.4
  SystemPanel_Opaque: 'opaque',                   // opacity 1.0
  // A VOID, not a panel. opacity 0.0 — nothing is built for this cell, so it has
  // no render class. Mapping it to 'glazed' would put glass in an empty opening;
  // `null` is the honest answer and callers must handle it.
  SystemPanel_Empty: null,
  SystemPanel_Door: 'door',                       // opacity 1.0, hosted door
  // The Phase-3 slat family: all four are opaque, non-transparent timber
  // (`transparent: false`, opacity 1.0). They are joinery, not glazing.
  SystemPanel_SlatsVerticalFramed: 'opaque',
  SystemPanel_SlatsVerticalDense: 'opaque',
  SystemPanel_SlatsVerticalOpen: 'opaque',
  SystemPanel_SlatsHorizontal: 'opaque',
  // The Phase-4 fabric family: all five are `transparent: true` at opacity
  // 0.86-0.92, so their RENDER class is the translucent one.
  // ⚠ THE PROJECTION IS LOSSY HERE AND THE LOSS IS DECLARED: translucent fabric is
  // not glass, and a consumer that needs that distinction MUST read the TYPE, not
  // the kind. This is the strongest argument for the type staying the master.
  SystemPanel_CurtainCornerFold: 'glazed',
  SystemPanel_CurtainFlat: 'glazed',
  SystemPanel_CurtainOrganic: 'glazed',
  SystemPanel_CurtainSide: 'glazed',
  SystemPanel_CurtainDoubleMixed: 'glazed',
};

/**
 * Kinds NO panel type projects onto — the gap in the OTHER direction.
 *
 * `'spandrel'` is expressible in L0 and in the kernel and has no counterpart the
 * geometry layer can build, so an L0 record carrying `kind: 'spandrel'` describes a
 * panel Stack A cannot render. Declared here rather than discovered later (C84
 * EI-3: an enum member the pipeline cannot carry is an affordance without an
 * implementation).
 */
export const CURTAIN_PANEL_KINDS_WITHOUT_A_TYPE: readonly CurtainPanelKindName[] = ['spandrel'];

/**
 * Panel types whose identity does NOT survive a trip through the kind vocabulary —
 * i.e. those sharing a kind with at least one other type, so `kind` alone cannot
 * say which panel the user chose.
 *
 * DERIVED, never transcribed. C87 §9 states the headline as "four of thirteen
 * survive the round trip"; this function is where that number comes from, so the
 * contract can cite a computation rather than a copied count.
 */
export function curtainPanelTypesLosingIdentityInKind(): CurtainPanelTypeName[] {
  const owners = new Map<string, CurtainPanelTypeName[]>();
  for (const t of CURTAIN_PANEL_TYPES) {
    const k = CURTAIN_PANEL_TYPE_TO_KIND[t];
    if (k === null) continue;                     // a void loses nothing; it IS nothing
    const list = owners.get(k);
    if (list) list.push(t); else owners.set(k, [t]);
  }
  const lossy: CurtainPanelTypeName[] = [];
  for (const [, types] of owners) if (types.length > 1) lossy.push(...types);
  return lossy;
}

/**
 * The render class of a panel type.
 *
 * ⛔ NO SILENT DEFAULT. An unknown string returns `undefined` and a void returns
 * `null`, and those are DIFFERENT ANSWERS: "I do not recognise this" versus "this
 * cell holds nothing". Collapsing either into `'glazed'` is the L-1053 defect —
 * a total fallback makes a total mismatch indistinguishable from a working default.
 */
export function curtainPanelKindOf(type: string): CurtainPanelKindName | null | undefined {
  if (!isCurtainPanelType(type)) return undefined;
  return CURTAIN_PANEL_TYPE_TO_KIND[type];
}

export function isCurtainPanelType(v: string): v is CurtainPanelTypeName {
  return (CURTAIN_PANEL_TYPES as readonly string[]).includes(v);
}

export function isCurtainPanelKind(v: string): v is CurtainPanelKindName {
  return (CURTAIN_PANEL_KINDS as readonly string[]).includes(v);
}
