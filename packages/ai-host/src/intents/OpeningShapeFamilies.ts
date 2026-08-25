// @pryzm/ai-host — OpeningShapeFamilies (§CHAT-OPENING-SHAPE, L-10945)
// =============================================================================
//
// The SHAPE axis as a capability family — "change all windows to segmental",
// "make all doors arched", "change all windows on level 2 to circular".
//
// ── WHY IT IS A FAMILY TABLE AND NOT A HAND-WRITTEN PAIR ────────────────────
//
// `set-window-shape` and `set-door-shape` are the SAME capability with a
// different noun and a different legality table, which is precisely the shape
// `CatalogueFamilies` and `DimensionFamilies` already generalise. Writing them
// by hand would be two spec literals, two parse functions and two matcher
// entries — and the sixth recurrence of "two spellings of one list" in this
// package.
//
// ── ⭐ WHY IT IS NOT A CATALOGUE FAMILY ─────────────────────────────────────
//
// It looks like one — "change all <noun>s to <ref>" — and it is deliberately
// NOT, because the two differ on the axis that matters:
//
//   • A CATALOGUE family resolves against a PROJECT-AUTHORED list that varies
//     per project, arrives through the injected `ctx.catalogues` channel, and
//     refuses by listing whatever that project happens to hold.
//   • A SHAPE family resolves against a CLOSED FOUR-VALUE ENUM shipped in
//     `@pryzm/geometry-wall`, identical in every project, needing no injection
//     — and carrying a per-family LEGALITY RULE (a door may not be circular)
//     that no catalogue has.
//
// Folding the shape onto the catalogue channel would mean either injecting a
// fake catalogue (a value source that lies about where it came from) or
// teaching `catalogueFamilySpec` a legality concept only one caller has. Both
// are worse than one more table.
//
// ── THE ROUTE THIS FAMILY DRIVES ────────────────────────────────────────────
//
//   window → element.updateOpeningProfileBatch → UpdateOpeningProfileBatchCommand
//   door   → element.updateOpeningProfileBatch → UpdateOpeningProfileBatchCommand
//
// which composes `UpdateWindow/DoorParameterCommand` — the LIVE single-opening
// route the property panel drives, and the only one that carries a profile all
// the way to `wall.openings[]`. Per L-620, a family belongs here only when its
// batch verb reaches the GEOMETRY store the builders read through a command in
// `packages/command-registry`. This one does; the test drives it.
//
// PURE — tables and one regex factory. The scope resolver and the level list
// arrive through the injected `ResolverContext`, as everywhere else.

import type { IntentScope, IntentSpatialScope } from './ScopeDescriptor.js';
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
import {
  resolveOpeningShapeRef,
  openingShapeNames,
  openingShapeLegalFor,
  joinNames,
  type OpeningFamily,
} from './OpeningShapeVocabulary.js';
import type { ResolverContext, SemanticIntent } from './ZeroTokenResolver.js';

export type OpeningShapeFamilyIntentId = 'set-window-shape' | 'set-door-shape';

export interface OpeningShapeFamily {
  readonly intent: OpeningShapeFamilyIntentId;
  readonly elementKind: OpeningFamily;
  /** Extra nouns the grammar accepts for the same family. */
  readonly nounAliases: readonly string[];
  readonly noSelectionReason: string;
  readonly mismatchPrefix: string;
  readonly suggestions: readonly string[];
}

export const OPENING_SHAPE_FAMILIES: readonly OpeningShapeFamily[] = [
  {
    intent: 'set-window-shape',
    elementKind: 'window',
    nounAliases: ['glazing unit', 'opening'],
    noSelectionReason:
      'No windows are selected — select some windows, or say "change all windows to segmental" ' +
      'to reshape the whole project.',
    mismatchPrefix: 'Opening shapes apply to windows',
    suggestions: [
      'change all windows to segmental',
      'change all windows to arched',
    ],
  },
  {
    intent: 'set-door-shape',
    elementKind: 'door',
    nounAliases: ['doorway'],
    noSelectionReason:
      'No doors are selected — select some doors, or say "change all doors to arched" ' +
      'to reshape the whole project.',
    mismatchPrefix: 'Opening shapes apply to doors',
    suggestions: [
      'change all doors to arched',
      'change all doors to segmental',
    ],
  },
];

const BY_INTENT: ReadonlyMap<OpeningShapeFamilyIntentId, OpeningShapeFamily> =
  new Map(OPENING_SHAPE_FAMILIES.map((f) => [f.intent, f]));

export function openingShapeFamily(intent: string): OpeningShapeFamily | null {
  return BY_INTENT.get(intent as OpeningShapeFamilyIntentId) ?? null;
}

/** The element kinds a shape family covers — for the registry's targets. */
export function openingShapeFamilyTargets(intent: OpeningShapeFamilyIntentId): readonly string[] {
  return [BY_INTENT.get(intent)!.elementKind];
}

/**
 * Build the family's `CapabilityExecutionSpec`.
 *
 * ⛔ THE LEGALITY GATE IS IN THE VALUE STAGE, not left to the command. The
 * command refuses too (a validator in one of two callers is one that will be
 * bypassed), but a chat user asking for a circular door deserves the RULE in
 * the reply — "a door reaches the floor, so its opening is a notch" — rather
 * than a batch report saying nothing changed.
 */
export function openingShapeFamilySpec(
  family: OpeningShapeFamily,
): CapabilityExecutionSpec<{ intent: OpeningShapeFamilyIntentId; shapeRef: string; scope: never }> {
  return {
    elementKind: family.elementKind,
    busCommand: 'element.updateOpeningProfileBatch',
    idsField: 'elementIds',
    noSelectionReason: family.noSelectionReason,
    mismatchPrefix: family.mismatchPrefix,
    suggestions: family.suggestions,
    spatialAbility:
      `reshape all ${family.elementKind}s, the selected ones, the ones on a level or in a room, ` +
      `or the ones on one facade`,
    // ⭐ ORIENTATION IS CLAIMED — §CHAT-ORIENTATION-HOSTED-OPENINGS (L-10946)
    // teaches the scope resolver to answer "the south facade" with the OPENINGS
    // hosted in the south-facing walls rather than the walls themselves. Before
    // that hop existed this kind would have resized WALL ids, which is why
    // `DimensionFamilies` declares only level+room and says so.
    spatialKinds: ['level', 'room', 'orientation'],
    // A reshape is one undo entry, deletes nothing, and the command reports
    // "Changed N of M — K skipped: <reason>". Not destructive; gating it behind
    // a Confirm card would put a modal in front of the founder's exact sentence
    // for no safety gain. It DOES require resolved ids, because the verb has no
    // unbounded 'all' form at all (the command's own contract).
    destructive: false,
    requireResolvedIds: true,
    resolveValue: (si, _ctx): SpecValueOutcome => {
      const hit = resolveOpeningShapeRef(si.shapeRef);
      if (hit === null) {
        return {
          refusal: {
            reason:
              `I could not read "${si.shapeRef}" as an opening shape. ` +
              `The shapes a ${family.elementKind} can have are: ` +
              `${joinNames(openingShapeNames(family.elementKind))}. Nothing was changed.`,
            suggestions: family.suggestions,
          },
        };
      }
      // ⛔ §OPENING-PROFILE-BY-FAMILY (L-1251) — a door may not be circular, and
      // the refusal NAMES THE RULE rather than dropping the ask.
      const illegal = openingShapeLegalFor(family.elementKind, hit.kind);
      if (illegal !== null) {
        return { refusal: { reason: illegal, suggestions: family.suggestions } };
      }
      return {
        payload: { elementKind: family.elementKind, openingProfile: hit.kind },
        summary: (scopeLabel, notesTail) => `Change ${scopeLabel} to ${hit.label}${notesTail}`,
      };
    },
  } as CapabilityExecutionSpec<{ intent: OpeningShapeFamilyIntentId; shapeRef: string; scope: never }>;
}

// ─── The grammar ─────────────────────────────────────────────────────────────
//
// ⛔ THE SHARED SCOPE TAIL, NOT A SIXTH SPELLING. `SPATIAL_TAIL_SRC` is the ONE
// place that answers "which phrase names a place, and is it a level, a room or
// a facade" (§FIX-SCOPE-TAIL-ONE-PARSER, L-1201; §CHAT-ORIENTATION-IS-NOT-A-ROOM,
// L-10941). Every grammar in this package that re-spelled it got the founder's
// "in level 2" wrong; this one does not re-spell it.
//
// The VERB and SCOPE-WORD sets are byte-identical to `makeHostedTypeParser`'s,
// deliberately: "change all windows to X" must be understood the same way
// whether X turns out to be a type or a shape. What separates the two grammars
// is not the sentence — it is what the TAIL resolves to, and that is settled by
// arbitration in `ZeroTokenResolver` (the catalogue gets the first say), never
// by two different sentence shapes.

const SCOPE_ALL = String.raw`(?:all|every|each|the whole|the entire)`;
const SCOPE_SEL = String.raw`(?:these|those|this|the selected|selected|my)`;

function escapeReSrc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/** Hyphens and spaces are one separator to a user. */
function nounSrc(noun: string): string {
  return escapeReSrc(noun).replace(/(?:\\-|-|\s)+/g, '[- ]');
}

interface CompiledShapeFamily {
  readonly family: OpeningShapeFamily;
  readonly scopedRe: RegExp;
  readonly shapeWordRe: RegExp;
}

const COMPILED: readonly CompiledShapeFamily[] = OPENING_SHAPE_FAMILIES.map((family) => {
  const nouns = [family.elementKind, ...family.nounAliases].map(nounSrc).join('|');
  return {
    family,
    scopedRe: new RegExp(
      `^(?:change|set|make|convert|swap|turn|reshape) (?:the )?(${SCOPE_ALL}|${SCOPE_SEL})` +
      `(?: selected)?(?: of)?(?: the)? (?:${nouns})s?` +
      SPATIAL_TAIL_SRC +
      // The axis noun may lead the value ("… to segmental shape" / "… shape to
      // segmental"); both are stripped by the vocabulary, so the grammar only
      // has to let them through.
      `(?:'s)?(?: (?:opening )?(?:shapes?|profiles?|heads?))?(?: (?:to|into|as|be))? (?:a |an |the )?(.+)$`,
    ),
    // The SHAPE-SPECIFIC verb form: "make all windows arched" needs no "to".
    // Already covered by the shape above; this second regex exists for the
    // PROPERTY-FIRST order English also uses — "change the shape of all windows
    // to segmental" — which the type grammar's own §FIX-DIMENSION-PROPERTY-FIRST
    // sibling records as an ordinary phrasing the product understood in only one
    // direction.
    shapeWordRe: new RegExp(
      `^(?:change|set|make|convert|swap|turn|reshape) (?:the )?(?:opening )?(?:shapes?|profiles?|heads?)` +
      `(?:'s)? (?:of|for|on) (?:the )?(${SCOPE_ALL}|${SCOPE_SEL})(?: of)?(?: the)? (?:${nouns})s?` +
      SPATIAL_TAIL_SRC +
      `(?: (?:to|into|as|be))? (?:a |an |the )?(.+)$`,
    ),
  };
});

/** Clean a captured reference the way every other grammar here does. */
function clean(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ');
}

/**
 * Parse an opening-shape sentence into its family intent, or null when no
 * family claims it.
 *
 * ⛔ THE VOCABULARY DECIDES WHETHER TO CLAIM. A tail the shape axis does not
 * resolve is NOT claimed at all — it falls through to the catalogue grammar, so
 * "change all windows to timber casement" still reaches the TYPE capability
 * untouched. This is the same arbitration the colour guard already uses inside
 * `makeHostedTypeParser` ("only a ref the table resolves claims"), applied in
 * the other direction, and it is what makes this grammar strictly ADDITIVE.
 */
export function parseOpeningShapeIntent(
  text: string,
  ctx: ResolverContext | undefined,
): SemanticIntent | null {
  for (const { family, scopedRe, shapeWordRe } of COMPILED) {
    const lifted = parseFilterClauses(text, family.elementKind);
    const m = scopedRe.exec(lifted.stripped);
    const pf = m === null ? shapeWordRe.exec(lifted.stripped) : null;
    if (m === null && pf === null) continue;
    const hit = m ?? pf!;
    // Groups: 1 = scope word, 2/3/4 = SPATIAL_TAIL_SRC, 5 = the reference.
    const shapeRef = clean(hit[5] ?? '');
    if (shapeRef.length === 0) continue;
    // ⛔ The claim gate. Not a shape ⇒ not this capability's sentence.
    if (resolveOpeningShapeRef(shapeRef) === null) continue;

    const isAll = new RegExp(`^${SCOPE_ALL}$`).test(hit[1]!);
    const tail = readSpatialTail(hit[2], joinTailPhrase(hit[3], hit[4]), ctx);
    // ⛔ A place WAS named and cannot be resolved ("this floor" with no active
    // level). DECLINE — never widen to the whole project (C68 §7.d).
    if (tail.kind === 'unusable') return null;
    let base: 'all' | 'selection' | IntentSpatialScope;
    if (tail.kind === 'scope') {
      // Spatial phrases compose with the ALL scope only — combining them with
      // "these/selected" would contradict the live selection, and that is not
      // claimed (the ruling every sibling grammar here made).
      if (!isAll) return null;
      base = tail.scope;
    } else {
      base = isAll ? 'all' : 'selection';
    }
    const scope: IntentScope = lifted.filters.length === 0
      ? base
      : { kind: 'filter', base, filters: lifted.filters };
    return { intent: family.intent, shapeRef, scope } as SemanticIntent;
  }
  return null;
}
