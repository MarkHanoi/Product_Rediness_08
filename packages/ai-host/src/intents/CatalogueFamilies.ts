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
// DELIBERATELY ABSENT, with the real reason (a family the chat cannot drive is
// said out loud, never silently missing):
//   • roof, column, beam — no named type CATALOGUE exists at all; the "type" is
//     a closed enum on the record (roofType / profile / sectionType), so there
//     are no catalogue names for a refusal to list. Enum-driven type changes are
//     a different capability shape, not this one.
//   • curtain-wall — the only type is per-PANEL (`PanelType`), its command is
//     marked ORPHANED, and `element.changeType` has no curtain-wall branch.
//   • floor — the catalogue (`floorSystemTypeStore`, 14 built-ins) and the live
//     command (`UpdateFloorLayersCommand`) both exist, so this is the next entry
//     to add; it is left out of THIS tranche only because `floor` and `slab` are
//     two different element kinds that users call by the same word, and the
//     disambiguation deserves its own decision rather than a coin-flip.
//   • furniture — `ChangeFurnitureTypeCommand` is live, but the catalogue is a
//     string UNION with no display names, so `resolveCatalogueRef` (which needs
//     `{id, name}`) has nothing to read and a refusal could not list anything.
//   • handrail — the catalogue exists but `HandrailData` has no typeId: a type
//     must be MATERIALISED whole into its fields. That is a real capability, and
//     a different one from "stamp a systemTypeId".
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
