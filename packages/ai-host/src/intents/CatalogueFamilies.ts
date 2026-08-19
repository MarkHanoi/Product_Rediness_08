// @pryzm/ai-host — CatalogueFamilies (RAC Phase U7.2)
// =============================================================================
//
// WHY THIS EXISTS. `set-window-type` and `set-door-type` are the SAME
// capability with a different noun: parse "change all <noun>s to <ref>",
// resolve <ref> through the ONE `resolveCatalogueRef` ladder, refuse by LISTING
// the real catalogue names, dispatch ONE batch verb. U4.3 already shared the
// GRAMMAR half (`makeHostedTypeParser`) and U4 already shared the EXECUTION half
// (`CapabilityExecutionSpec`), but the two halves were still stitched together
// by hand per family: an intent id in the union, a spec literal, a parse
// function, a matcher const, a matcher-list entry.
//
// This table is that stitching, done once. A catalogue family is now ONE entry:
// the element kind, its noun, the batch verb, the payload's id field, where its
// catalogue comes from, and the refusal copy. The spec and the grammar are
// GENERATED from it.
//
// ── WHAT A FAMILY MUST PROVE BEFORE IT IS LISTED (L-620) ────────────────────
//
// The plugin `*.setType` handlers are the anti-pattern: they `produceCommand`
// against DETACHED plugin DTO stores nothing renders, exports or persists — the
// slab one says so in its own header, and initBusHandlers records the
// founder-visible symptom of routing there ("slab not found: <id>"). A family
// belongs here only when its batch verb reaches the GEOMETRY store the builders
// read, through a command in `packages/command-registry`. Today:
//
//   window  → window.updateSystemTypeBatch   → UpdateWindowSystemTypeCommand
//   door    → door.updateSystemTypeBatch     → UpdateDoorSystemTypeCommand
//   slab    → slab.updateSystemTypeBatch     → UpdateSlabLayersCommand      (U7.2)
//   ceiling → ceiling.updateSystemTypeBatch  → UpdateCeilingLayersCommand   (U7.2)
//
// WALL is deliberately NOT in this table. Its grammar is entangled with the
// colour and rake grammars that share the "make all walls …" opening and must
// be tried in a specific order, and its refusal copy is the founding incident's
// verbatim wording. Generalising it would be a rewrite of pinned copy for no
// new capability — it stays a hand-written spec entry, and this comment is the
// reason rather than an oversight.
//
// ── DELIBERATELY ABSENT — ⚠ RE-MEASURED 2026-08-19 (lane RAC1, C84 §4F.10) ──
//
// ⛔ FOUR OF THE FIVE REASONS BELOW HAD EXPIRED. They are corrected IN PLACE,
// each with its measurement date, because a comment block that justifies a
// refusal with facts that have since become false is the defect class this
// repository keeps re-producing — and this block was being read as current.
//
// ⭐ AND THE FRAMING WAS WRONG AT THE TOP. This list reads as "these families
// have no machinery". They do. `element.changeType`
// (apps/editor/src/engine/initBusHandlers.ts:1518) routes SIXTEEN families —
// wall, furniture, floor, slab, door, window, ceiling, plumbing, stair,
// column, beam, stair-railing, HANDRAIL, roof, lighting, CURTAIN-WALL — each
// to the geometry store the builders and persistence read, each with
// ring-buffer undo parity, pinned by `elementChangeTypeCoverage.spec.ts:178`.
// What is missing is PUBLICATION to the chat, not implementation. That is a
// C84 EI-3 breach (what the UI offers, the pipeline must accept), and it is a
// much smaller and much lower-risk job than "build a capability".
//
//   • column, beam — ✅ REASON STILL HOLDS (2026-08-19). No named catalogue:
//     the "type" is a closed enum on the record (`profile` / `sectionType`),
//     so there are no catalogue NAMES for a refusal to list. Enum-driven type
//     changes are a different capability shape. **A catalogue must be MINTED
//     before either can join** — see C84 §4F.9 item 7.
//   • roof — ⚠ THE ENUM CLAIM WAS TRUE, THE "NO CATALOGUE" CLAIM WAS FALSE
//     (measured 2026-08-19). `roofType` is indeed an enum, but an 8-entry
//     `{id, name}` list ships at `ElementTypeCatalogRegistry.ts:115-124` and a
//     refusal CAN list it. Roof was grouped with column/beam in one sentence
//     covering three families whose truth values differ; the sentence is now
//     split, because a shared reason is how a false one survives.
//   • curtain-wall (the WALL type) — ⛔ THE REASON WAS FALSE, AND HAD BEEN
//     SINCE L-958 (measured 2026-08-19). It read "the only type is per-PANEL,
//     its command is marked ORPHANED, and `element.changeType` has no
//     curtain-wall branch". All three halves are wrong for the wall type:
//     `CurtainWallTypeStore` ships 20 `{id, name}` built-ins, the record
//     carries `systemTypeId`, and the branch is at `initBusHandlers.ts:2022`
//     (→ `UpdateCurtainWallCommand`, the geometry record the builders read).
//   • curtain-wall PANEL type — ✅ THIS is the genuinely orphaned one, and it
//     is A DIFFERENT SUBJECT from the row above. `PanelType` is a bare union
//     with no `{id, name}` store, and `ReplacePanelTypeCommand.ts:1` is
//     literally `TODO(E.5.x): ORPHANED`. ⛔ Do not re-conflate the two: the
//     wall type is READY and the panel type is NOT, and collapsing them is
//     exactly the error that kept the wall type dark for a release.
//   • floor — the count was stale: `floorSystemTypeStore` ships **22**
//     built-ins, not 14 (measured 2026-08-19). The live command
//     (`UpdateFloorLayersCommand`) and the `systemTypeId` field both exist, so
//     floor is READY. It stays out of THIS table only for the reason that was
//     always the real one: `floor` and `slab` are two element kinds users call
//     by the same word, and the disambiguation is a decision, not a coin-flip.
//   • furniture, plumbing — ✅ REASON STILL HOLDS (2026-08-19).
//     `ChangeFurnitureTypeCommand` / `UpdatePlumbingParametersCommand` are
//     live, but the catalogues are string UNIONS with no display names, so
//     `resolveCatalogueRef` (which needs `{id, name}`) has nothing to read and
//     a refusal could not list anything. ⛔ The answer is to MINT a catalogue,
//     never to narrow the user's vocabulary so the miss stops showing.
//   • stair — ⚠ NEARLY READY, and blocked by ONE METHOD (measured
//     2026-08-19). `StairTypeDefinitions.ts` ships 5 `{id, name}` types and
//     `StairTypes.ts:109` carries a real `typeId`, but `StairTypeStore`
//     exposes `get()` where `CatalogueReader` requires `getById()`
//     (`resolveCatalogueRef.ts:39-42`). That is an adapter, not a redesign.
//   • handrail — ✅ REASON STILL HOLDS, AND IT IS THE ONLY ONE OF THE FIVE
//     THAT DOES (measured 2026-08-19). The catalogue ships 20 `{id, name}`
//     types — including, verbatim, the founder's "Frameless Glass Balustrade"
//     (`HandrailTypeStore.ts:227`) — but `HandrailData` has no `typeId`, so a
//     type must be MATERIALISED whole into ~13 fields rather than stamped as
//     one id. That is a real difference from "stamp a systemTypeId". ⚠ It is
//     a PAYLOAD question, not a blocker: the property panel does it today in
//     13 lines (`RailingTypeSelectorWidget.ts:117-145`), and the chosen fix
//     moves that projection BEHIND the bus verb (mirroring
//     `resolveStairRailingTypeFields`) so the panel and the chat stop being
//     two authorities computing the same 13 fields (C84 EI-4a/EI-9).
//
// This module is PURE — no DOM, no stores, no I/O. Catalogue lookups arrive
// through the injected ResolverContext, exactly as the wall/window/door ones do.

import type {
  CapabilityExecutionSpec,
  SpecValueOutcome,
} from './CapabilityExecutionSpec.js';
import type { ResolverContext } from './ZeroTokenResolver.js';

/** The intents generated from this table. */
export type CatalogueFamilyIntentId =
  | 'set-window-type'
  | 'set-door-type'
  | 'set-slab-type'
  | 'set-ceiling-type';

/** The catalogue lookup a family needs, however it was injected. */
export interface CatalogueLookup {
  readonly resolve: (ref: string) => { readonly id: string; readonly name: string } | null;
  readonly names: readonly string[];
}

export interface CatalogueFamily {
  readonly intent: CatalogueFamilyIntentId;
  /** The element kind, normalized (also the noun the grammar matches on). */
  readonly elementKind: string;
  /** The ONE batch bus command, and the payload field carrying the id list. */
  readonly busCommand: string;
  readonly idsField: string;
  /** The word used in refusal copy ("window type", "slab type"). */
  readonly typeNoun: string;
  readonly noSelectionReason: string;
  readonly mismatchPrefix: string;
  readonly suggestions: readonly string[];
  /**
   * Where the catalogue comes from. The named legacy fields are kept for the
   * families that had them before the generic channel existed; everything new
   * arrives through `ctx.catalogues[elementKind]`, so a new family costs ZERO
   * lines in `ResolverContext`.
   */
  readonly lookup: (ctx: ResolverContext) => CatalogueLookup | null;
  /** Refs this family must never claim, with the capability that owns them
   *  ("change all doors to left swing" is a swing ask). */
  readonly rejectRef?: (ref: string) => boolean;
}

function generic(kind: string) {
  return (ctx: ResolverContext): CatalogueLookup | null => {
    const hit = ctx.catalogues?.[kind];
    return hit === undefined ? null : hit;
  };
}

export const CATALOGUE_FAMILIES: readonly CatalogueFamily[] = [
  {
    intent: 'set-window-type',
    elementKind: 'window',
    busCommand: 'window.updateSystemTypeBatch',
    idsField: 'windowIds',
    typeNoun: 'window type',
    noSelectionReason:
      'No windows are selected — select a window, or say "change all windows to …" to retype every window.',
    mismatchPrefix: 'Window types apply to windows',
    suggestions: ['change all windows to timber casement'],
    lookup: (ctx) =>
      ctx.resolveWindowSystemType === undefined
        ? generic('window')(ctx)
        : { resolve: ctx.resolveWindowSystemType, names: ctx.windowSystemTypeNames ?? [] },
  },
  {
    intent: 'set-door-type',
    elementKind: 'door',
    busCommand: 'door.updateSystemTypeBatch',
    idsField: 'doorIds',
    typeNoun: 'door type',
    noSelectionReason:
      'No doors are selected — select a door, or say "change all doors to …" to retype every door.',
    mismatchPrefix: 'Door types apply to doors',
    suggestions: ['change all doors to white primed softwood'],
    lookup: (ctx) =>
      ctx.resolveDoorSystemType === undefined
        ? generic('door')(ctx)
        : { resolve: ctx.resolveDoorSystemType, names: ctx.doorSystemTypeNames ?? [] },
    // door.setSwing owns "change all doors to left swing".
    rejectRef: (ref) => /\bswings?\b/.test(ref),
  },
  {
    // §FEAT-SLAB-TYPE-BATCH (RAC U7.2) — "change all slabs to RC 250".
    // The catalogue (`slabSystemTypeStore`) ships four real assemblies; the
    // batch MATERIALISES the chosen type's layer stack and derived thickness
    // onto each slab through the live UpdateSlabLayersCommand.
    intent: 'set-slab-type',
    elementKind: 'slab',
    busCommand: 'slab.updateSystemTypeBatch',
    idsField: 'slabIds',
    typeNoun: 'slab type',
    noSelectionReason:
      'No slabs are selected — select a slab, or say "change all slabs to …" to retype every slab.',
    mismatchPrefix: 'Slab types apply to slabs',
    suggestions: ['change all slabs to rc slab monolithic 200mm'],
    lookup: generic('slab'),
  },
  {
    // §FEAT-CEILING-TYPE-BATCH (RAC U7.2) — "change all ceilings to suspended
    // act 600x600". Ten built-in assemblies; same materialisation discipline.
    intent: 'set-ceiling-type',
    elementKind: 'ceiling',
    busCommand: 'ceiling.updateSystemTypeBatch',
    idsField: 'ceilingIds',
    typeNoun: 'ceiling type',
    noSelectionReason:
      'No ceilings are selected — select a ceiling, or say "change all ceilings to …" to retype every ceiling.',
    mismatchPrefix: 'Ceiling types apply to ceilings',
    suggestions: ['change all ceilings to plasterboard 12.5mm'],
    lookup: generic('ceiling'),
  },
];

const BY_INTENT: ReadonlyMap<CatalogueFamilyIntentId, CatalogueFamily> =
  new Map(CATALOGUE_FAMILIES.map((f) => [f.intent, f]));

export function catalogueFamily(intent: string): CatalogueFamily | null {
  return BY_INTENT.get(intent as CatalogueFamilyIntentId) ?? null;
}

/** The element kinds a catalogue family covers — for the registry's targets. */
export function catalogueFamilyTargets(intent: CatalogueFamilyIntentId): readonly string[] {
  return [BY_INTENT.get(intent)!.elementKind];
}

/**
 * Build the family's `CapabilityExecutionSpec` — the value stage is the ONE
 * shape every catalogue family shares: resolve through the injected lookup, and
 * refuse by LISTING the project's real type names (§CONTEXT-DATA-HONESTY).
 * Absent injection forwards the raw string and the COMMAND resolves and refuses
 * with the same honesty; never a silent mismatch, never a guess.
 */
export function catalogueFamilySpec(
  family: CatalogueFamily,
): CapabilityExecutionSpec<{ intent: CatalogueFamilyIntentId; typeRef: string; scope: never }> {
  return {
    elementKind: family.elementKind,
    busCommand: family.busCommand,
    idsField: family.idsField,
    noSelectionReason: family.noSelectionReason,
    mismatchPrefix: family.mismatchPrefix,
    suggestions: family.suggestions,
    destructive: false,
    resolveValue: (si, ctx): SpecValueOutcome => {
      const lookup = family.lookup(ctx);
      if (lookup === null) {
        return {
          payload: { systemType: si.typeRef },
          summary: (scopeLabel) => `Change ${scopeLabel} to "${si.typeRef}"`,
        };
      }
      const hit = lookup.resolve(si.typeRef);
      if (hit === null) {
        return {
          refusal: {
            reason: lookup.names.length === 0
              ? `I could not find a ${family.typeNoun} called "${si.typeRef}" in this project.`
              : `There is no ${family.typeNoun} called "${si.typeRef}" in this project. ` +
                `The ${family.typeNoun}s here are: ${lookup.names.join(', ')}.`,
            suggestions: lookup.names.slice(0, 2).map(
              (n) => `change all ${family.elementKind}s to ${n.toLowerCase()}`,
            ),
          },
        };
      }
      return {
        payload: { systemType: hit.id },
        summary: (scopeLabel) => `Change ${scopeLabel} to "${hit.name}"`,
      };
    },
  } as CapabilityExecutionSpec<{ intent: CatalogueFamilyIntentId; typeRef: string; scope: never }>;
}
