// @pryzm/ai-host — DeleteFamilies (RAC Phase U9.2, the SAFE DESTRUCTIVE tranche)
// =============================================================================
//
// WHAT SHIPS HERE. "delete all furniture in the kitchen", "remove every window
// on level 2", "clear the furniture on this floor" — scoped deletion, which the
// chat could not say at all. `delete-selected` only ever meant "the thing you
// already clicked"; every ask that names a PLACE and a KIND was unreachable.
//
// ── WHY A DESTRUCTIVE CAPABILITY IS ALLOWED TO EXIST NOW ────────────────────
//
// ADR-0313 deferred bulk destructive verbs because the inline Confirm/Cancel
// card "shows no preview of what will appear". That reasoning is about
// GENERATION — you cannot preview a building that does not exist yet. Deletion
// is the opposite shape: everything it touches already exists and has already
// been counted, so the card can state the exact truth before anything happens:
//
//     "This deletes 42 furniture items on Level 1. Nothing else changes."
//
// Four properties make that honest, and all four are enforced rather than
// promised:
//   1. THE COUNT IS REAL. `requireResolvedIds` on the generated spec forbids
//      the unbounded `idsField: 'all'` form, so the scope is resolved to ids —
//      through the SAME U3/U8 resolver every other scoped capability uses,
//      filters included — before the card is drawn. An absent resolver refuses;
//      it never widens.
//   2. AN EMPTY SCOPE REFUSES. "delete every window on level 2" with no windows
//      there is a refusal naming the level, never a cheerful no-op.
//   3. ONE UNDO ENTRY. `element.deleteBatch` → `DeleteElementsBatchCommand`,
//      which composes the existing per-element `DeleteElementCommand` children.
//      N dispatches of `element.delete` would have been N Ctrl-Zs.
//   4. HONEST PARTIAL OUTCOME. "Deleted 40 of 42 — 2 skipped: <reason>" comes
//      from the command, in the same vocabulary the type batches use.
//
// ── WHAT A FAMILY MUST PROVE BEFORE IT IS LISTED ────────────────────────────
//
// `DeleteElementsBatchCommand` delegates to `DeleteElementCommand`, so a kind
// belongs here only if that command has a REAL branch for it — one that both
// removes the record and restores it on undo. Today's four:
//
//   furniture → branch 7  (cascades child furniture, e.g. dining chairs)
//   window    → branch 2  (dual-store: wall opening + the external windowStore)
//   door      → branch 3  (dual-store, mirror of the window branch)
//   column    → branch 5  (delegates to DeleteColumnCommand for registry +
//                          SemanticGraph cleanup, restored as a unit)
//
// DELIBERATELY ABSENT, each with the real reason:
//
//   • WALL. `DeleteElementCommand` handles walls correctly, but a wall delete
//     cascades its hosted windows and doors AND re-trims every neighbouring
//     wall through the join resolver. "Delete all walls on level 2" is
//     therefore not 40 deletions — it is 40 deletions plus an unstated number
//     of openings and a re-solve of the level's join topology, and a Confirm
//     card that says "40 walls" would be understating what the user is agreeing
//     to. The card cannot yet count the cascade, so the verb waits for one that
//     can. This is a PREVIEW gap, stated, not a liveness gap.
//   • LIGHTING. `element.delete` routes lighting to `DeleteLightingCommand`
//     specially — `DeleteElementCommand` has NO lighting branch, so a batch
//     built on it would report "not found in any store" for every fixture. The
//     honest fix is a lighting arm in the batch, not a claim here.
//   • ROOM / LEVEL. Deleting a room or a level is a model-topology change with
//     dependants (bounding walls, everything stamped on the level); it is not
//     the same verb wearing a different noun.
//   • SLAB / STAIR / ROOF. Real branches exist, and these are the next entries.
//     They are out of THIS tranche only to bound it: each cascades (slab
//     openings, stair railings + the auto-opening heal, roof skylights) and
//     each deserves its own count-what-you-cascade decision rather than being
//     swept in behind the four that do not.
//
// This module is PURE — tables and regexes. The scope resolver and the level
// list arrive through the injected ResolverContext, exactly as everywhere else.

import type { ElementFilter, IntentScope, IntentSpatialScope } from './ScopeDescriptor.js';
import { parseFilterClauses } from './FilterScope.js';
import {
  SPATIAL_TAIL_SRC,
  joinTailPhrase,
  readSpatialTail,
} from './SpatialScopeTail.js';
import type {
  CapabilityExecutionSpec,
  SpecValueOutcome,
} from './CapabilityExecutionSpec.js';
import type { ResolverContext, SemanticIntent } from './ZeroTokenResolver.js';

/** The intents generated from this table. */
export type DeleteFamilyIntentId =
  | 'delete-furniture-scoped'
  | 'delete-windows-scoped'
  | 'delete-doors-scoped'
  | 'delete-columns-scoped';

export interface DeleteFamily {
  readonly intent: DeleteFamilyIntentId;
  /** The element kind, normalized — also the singular noun the grammar matches. */
  readonly elementKind: string;
  /** Extra nouns the grammar accepts ("furniture item", "glazing"). */
  readonly nounAliases: readonly string[];
  /** The plural spoken in cards and summaries ("furniture", not "furnitures"). */
  readonly nounPlural: string;
  /** Refusal copy when the SELECTION scope finds nothing of this kind. */
  readonly noSelectionReason: string;
  /** Sentence head when the selection is the wrong kind. */
  readonly mismatchPrefix: string;
  readonly suggestions: readonly string[];
  /** The DeleteElementCommand branch that proves the kind is really deletable —
   *  quoted in the registry's commandProof note, so the claim and its evidence
   *  are written down together. */
  readonly branchNote: string;
}

export const DELETE_FAMILIES: readonly DeleteFamily[] = [
  {
    intent: 'delete-furniture-scoped',
    elementKind: 'furniture',
    nounAliases: ['furniture item', 'furnishing'],
    nounPlural: 'furniture items',
    noSelectionReason:
      'No furniture is selected — select some, or say "delete all furniture in the kitchen".',
    mismatchPrefix: 'That deletes furniture',
    suggestions: ['delete all furniture in the kitchen', 'clear the furniture on this floor'],
    branchNote:
      'DeleteElementCommand branch 7 (furniture): snapshots the record, CASCADES to child furniture (parentFurnitureId, e.g. dining chairs), unregisters from bimManager / semanticGraph / elementRegistry, and undo() re-adds parent then children and re-runs the fragment builder.',
  },
  {
    intent: 'delete-windows-scoped',
    elementKind: 'window',
    nounAliases: ['glazing unit'],
    nounPlural: 'windows',
    noSelectionReason:
      'No windows are selected — select some, or say "remove every window on level 2".',
    mismatchPrefix: 'That deletes windows',
    suggestions: ['remove every window on level 2', 'delete all windows in the kitchen'],
    branchNote:
      'DeleteElementCommand branch 2 (window): removes the wall opening AND the external windowStore record — the L-308 dual-store fix, without which the 3D frame survived on the healed wall — and undo() restores both plus the opening descriptor.',
  },
  {
    intent: 'delete-doors-scoped',
    elementKind: 'door',
    nounAliases: [],
    nounPlural: 'doors',
    noSelectionReason:
      'No doors are selected — select some, or say "delete all doors on level 2".',
    mismatchPrefix: 'That deletes doors',
    suggestions: ['delete all doors on level 2'],
    branchNote:
      'DeleteElementCommand branch 3 (door): the mirror of the window branch — wall opening + the external doorStore record, both restored by undo().',
  },
  {
    intent: 'delete-columns-scoped',
    elementKind: 'column',
    nounAliases: ['post'],
    nounPlural: 'columns',
    noSelectionReason:
      'No columns are selected — select some, or say "delete all columns on level 2".',
    mismatchPrefix: 'That deletes columns',
    suggestions: ['delete all columns on level 2'],
    branchNote:
      'DeleteElementCommand branch 5 (column): delegates to DeleteColumnCommand so the store, bimManager, elementRegistry and the SemanticGraph "sitsOn" edge are removed together AND restored together by undo().',
  },
];

const BY_INTENT: ReadonlyMap<DeleteFamilyIntentId, DeleteFamily> =
  new Map(DELETE_FAMILIES.map((f) => [f.intent, f]));

export function deleteFamily(intent: string): DeleteFamily | null {
  return BY_INTENT.get(intent as DeleteFamilyIntentId) ?? null;
}

/** The element kinds a delete family covers — for the registry's targets. */
export function deleteFamilyTargets(intent: DeleteFamilyIntentId): readonly string[] {
  return [BY_INTENT.get(intent)!.elementKind];
}

export function isDeleteFamilyIntentId(id: string): id is DeleteFamilyIntentId {
  return BY_INTENT.has(id as DeleteFamilyIntentId);
}

// ─── The generated spec ──────────────────────────────────────────────────────

/**
 * Build the family's `CapabilityExecutionSpec`. The value stage carries no
 * value at all — a delete has nothing to resolve — so all it does is build the
 * summary the Confirm card shows. That summary is the card's whole safety
 * argument, so it always names the COUNT (which `requireResolvedIds` guarantees
 * is real) and the KIND, and it ends by saying what does NOT change.
 */
export function deleteFamilySpec(
  family: DeleteFamily,
): CapabilityExecutionSpec<{ intent: DeleteFamilyIntentId; scope: never }> {
  return {
    elementKind: family.elementKind,
    busCommand: 'element.deleteBatch',
    idsField: 'elementIds',
    nounPlural: family.nounPlural,
    noSelectionReason: family.noSelectionReason,
    mismatchPrefix: family.mismatchPrefix,
    suggestions: family.suggestions,
    spatialAbility: `delete all ${family.nounPlural}, the selected ones, or the ones on a level or in a room`,
    // The two halves of "safe destructive": the card must state a real number
    // (so 'all' may never be forwarded unresolved), and the card must be shown.
    requireResolvedIds: true,
    destructive: true,
    resolveValue: (_si, _ctx): SpecValueOutcome => ({
      // The noun rides the payload for the COMMAND's report copy only; the ids
      // are the scope, and the command never filters by it.
      payload: { elementKind: family.elementKind },
      summary: (scopeLabel, notesTail) =>
        `This deletes ${scopeLabel}. Nothing else changes.${notesTail}`,
    }),
  } as CapabilityExecutionSpec<{ intent: DeleteFamilyIntentId; scope: never }>;
}

// ─── The generated grammar ───────────────────────────────────────────────────
//
// One parser per family, from the table. The scope word is REQUIRED and the
// ambiguous readings are NOT claimed — on a destructive verb an unclaimed
// sentence falls through to an honest "I'm not sure", which is strictly better
// than a coin flip that deletes something.
//
//   "delete all furniture"                → all (project-wide, count resolved)
//   "clear the furniture on this floor"   → the ACTIVE level
//   "remove every window on level 2"      → level 2
//   "delete all furniture in the kitchen" → the kitchen
//   "delete the furniture"                → NOT CLAIMED. "the" with no place
//                                           and no scope word could mean the
//                                           selection or the project, and this
//                                           verb does not guess.
//
// ── THE SELECTION IS DELIBERATELY NOT HERE ──────────────────────────────────
//
// "remove those doors" / "delete the selected furniture" already resolve, to
// `delete-selected` — the kind-agnostic capability that has owned the selection
// ask since before this table existed. An early draft of this grammar claimed
// them too, and the acceptance suite caught it immediately: the same sentence
// had two capabilities, which is the two-sources-of-truth defect the whole RAC
// registry exists to remove. A scoped delete claims a PLACE (or the whole
// project); a selection delete stays where it was.

const DELETE_VERB = String.raw`(?:delete|remove|clear|erase|wipe|get rid of)`;
const SCOPE_ALL = String.raw`(?:all|every|each)`;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// §FIX-SCOPE-TAIL-ONE-PARSER (L-1201) — the local `HERE_RE` + `levelScope` and
// the hand-written `on`→level / `in`→room tail are gone; both now come from
// `SpatialScopeTail`. This family had the SAME defect the dimension family did:
// "delete all windows in level 2" resolved to a ROOM called "level 2".

interface CompiledDeleteFamily {
  readonly family: DeleteFamily;
  readonly re: RegExp;
}

const COMPILED: readonly CompiledDeleteFamily[] = DELETE_FAMILIES.map((family) => {
  const nouns = [family.elementKind, ...family.nounAliases]
    .map((n) => escapeRe(n.replace('-', ' ')))
    .join('|');
  return {
    family,
    re: new RegExp(
      `^${DELETE_VERB} (?:the )?(${SCOPE_ALL})?\\s*(?:the )?(?:${nouns})s?` +
      SPATIAL_TAIL_SRC + `$`,
    ),
  };
});

/**
 * Parse a scoped-delete sentence into its family intent, or null when no
 * family claims it. Filters are LIFTED FIRST (the U8.1 pre-strip), so
 * "delete all windows smaller than 1 m² on level 2" composes with no extra
 * grammar here.
 */
export function parseDeleteScopedIntent(
  text: string,
  ctx?: ResolverContext,
): SemanticIntent | null {
  for (const { family, re } of COMPILED) {
    const lifted = parseFilterClauses(text, family.elementKind);
    const m = re.exec(lifted.stripped);
    if (m === null) continue;
    const scopeWord = m[1];
    // Groups 2/3/4 are `SPATIAL_TAIL_SRC`'s.
    const tail = readSpatialTail(m[2], joinTailPhrase(m[3], m[4]), ctx);

    let base: 'all' | IntentSpatialScope | null = null;
    if (tail.kind === 'scope') {
      // A place beats the article: "clear the furniture on this floor" is a
      // level ask even though it says "the".
      base = tail.scope;
    } else if (tail.kind === 'unusable') {
      // A place was named and could not be resolved. NOT claimed — and above
      // all never widened to 'all', which on a DELETE would be catastrophic.
      return null;
    } else if (scopeWord !== undefined && new RegExp(`^${SCOPE_ALL}$`).test(scopeWord)) {
      base = 'all';
    }
    // No scope word AND no place ⇒ ambiguous ⇒ not claimed (see the header).
    if (base === null) return null;

    return {
      intent: family.intent,
      scope: withDeleteFilters(base, lifted.filters),
    } as SemanticIntent;
  }
  return null;
}

function withDeleteFilters(
  base: 'all' | IntentSpatialScope,
  filters: readonly ElementFilter[],
): IntentScope {
  return filters.length === 0 ? base : { kind: 'filter', base, filters };
}
