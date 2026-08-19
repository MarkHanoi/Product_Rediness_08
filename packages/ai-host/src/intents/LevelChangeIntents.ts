// @pryzm/ai-host — LevelChangeIntents (§L-1032, the CHAT half).
// =============================================================================
//
// The founder's ask, verbatim: *"Every element needs to be possible to be
// changed the level via properties panel … and via chat: e.g. 'Move/Change slab
// from Level 1 to Level 2'."* The PANEL half shipped in 40494b09 / d6a80d02.
// This module is the chat half's ARM — the semantic execution of
// `move-to-level`.
//
// ── ONE AUTHORITY, AND IT IS NOT HERE ───────────────────────────────────────
//
// The answer to *"can this family change storey, and by which verb, spelled
// how?"* is `LEVEL_CHANGE_VERBS` / `LEVEL_CHANGE_REFUSALS` in
// `@pryzm/command-bus/src/levelChangeVerbs.ts`. That register is at L1
// precisely so the L3 event bridge, the L7 property panel and this L2 chat arm
// read the SAME rows (C84 EI-9). Nothing here re-derives it:
//
//   • the movable families come from `LEVEL_CHANGE_VERBS`;
//   • the payload is built by `buildLevelChangePayload`, never by typing field
//     names — the families genuinely disagree (`wall.changeLevel` takes
//     `{id, newLevelId, newElevationY}`, `roof.changeLevel` takes
//     `{roofId, levelId}`, the rest take `{<family>Id, levelId}`), and §L-978
//     is what four hand-typed field names cost: every copied curtain wall
//     silently minted at the origin, because a key the payload interface does
//     not accept is not "extra", it is a value replaced by a schema default;
//   • the REFUSALS are read out of `LEVEL_CHANGE_REFUSALS` with the family's
//     own `reason`, so the sentence the chat says and the sentence the panel
//     shows are the same sentence.
//
// ── THREE ANSWERS, NEVER TWO ────────────────────────────────────────────────
//
// This is the point of the capability, not a nicety:
//
//   MOVABLE  → dispatch the family's own verb.
//   REFUSED  → answer with that family's `reason`. *"Move this door to level 2"*
//              says a door belongs to its host wall — NOT "I can't do that",
//              and emphatically not a success.
//   NEITHER  → an honest "I don't know". A family in neither table is one
//              NOBODY HAS LOOKED AT, which is a different fact from "may not"
//              (§CONTEXT-DATA-HONESTY: failure and empty are different values),
//              and guessing either way is how a blank comes to read as "fine".
//
// ── WHY `findLevel` IS INJECTED ─────────────────────────────────────────────
//
// Because the value dependency must run ONE way (ZeroTokenResolver → this
// module), exactly as `VisibilityIntents` documents for itself: this module
// imports only TYPES back, so there is no load-order cycle
// (§SCC-NO-BARREL-ACCESS-AT-MODULE-LOAD). It is still ONE implementation —
// `applySemanticIntent` hands over its own `findLevel`, the same function
// `go-to-level`, `duplicate-level` and the NL layer resolve level names with.
// A second level-name matcher inside this file would be the EI-9 breach the
// register exists to prevent, in the very module that exists to honour it.
//
// PURITY: no DOM, no stores, no I/O — same contract as the resolver.

import {
  LEVEL_CHANGE_REFUSALS,
  LEVEL_CHANGE_VERBS,
  buildLevelChangePayload,
  type LevelChangeRefusal,
  type LevelChangeVerbSpec,
} from '@pryzm/command-bus';
import {
  MOVE_TO_LEVEL_TARGETS,
  normalizeElementKind,
} from '../capabilities/ChatCapabilityRegistry.js';
import type {
  ResolverContext,
  ResolverLevel,
  SemanticApplication,
  SemanticIntent,
} from './ZeroTokenResolver.js';

export const MOVE_TO_LEVEL_INTENT_ID = 'move-to-level';

export type MoveToLevelIntent = Extract<SemanticIntent, { intent: 'move-to-level' }>;

/** Table-membership routing, like `asVisibilityIntent` — never a new
 *  hand-written `case` arm in `applySemanticIntent` (coverage-gate check 8 is a
 *  shrink-only ratchet sitting at its ceiling, and the family discipline is the
 *  point rather than a way around it). */
export function asMoveToLevelIntent(si: SemanticIntent): MoveToLevelIntent | null {
  return si.intent === MOVE_TO_LEVEL_INTENT_ID ? (si as MoveToLevelIntent) : null;
}

// ─── The register, seen through the chat's element-kind spelling ─────────────
//
// The register keys families the way `normalizeType()` in the property panel
// spells them (`panelTypes`); the chat keys them the way `PROBE_ELEMENT_KINDS`
// does. The ONLY difference is hyphenation ('curtainwall' vs 'curtain-wall'),
// and `normalizeElementKind` is already the function that reconciles it — so
// the mapping is COMPUTED from the register's own `panelTypes`, not restated.
// A row added to the register is a chat target in the same edit.
//
// `MOVE_TO_LEVEL_TARGETS` lives in the REGISTRY, not here, and the dependency
// runs registry → command-bus, this module → registry. The other arrangement
// (targets here, imported by the registry) would close a load-order cycle with
// `normalizeElementKind`, which is the §SCC-NO-BARREL-ACCESS-AT-MODULE-LOAD
// white screen.

/** The move spec for a chat element kind, or `null`. `null` is NOT "may not
 *  move" — ask `levelChangeRefusalForChatKind` before concluding anything. */
export function levelChangeSpecForChatKind(elementKind: string): LevelChangeVerbSpec | null {
  const k = normalizeElementKind(elementKind);
  for (const spec of Object.values(LEVEL_CHANGE_VERBS)) {
    if (spec.panelTypes.some((p) => normalizeElementKind(p) === k)) return spec;
  }
  return null;
}

/** The DECLARED refusal for a chat element kind, or `null` when the family is
 *  in neither table — which is "nobody looked", not "no". */
export function levelChangeRefusalForChatKind(elementKind: string): LevelChangeRefusal | null {
  const k = normalizeElementKind(elementKind);
  for (const refusal of Object.values(LEVEL_CHANGE_REFUSALS)) {
    if (refusal.panelTypes.some((p) => normalizeElementKind(p) === k)) return refusal;
  }
  return null;
}

/** Every element kind either table names — the vocabulary a spoken noun is
 *  checked against before it is allowed to contradict the selection. */
export function levelChangeKnownKinds(): readonly string[] {
  return [
    ...MOVE_TO_LEVEL_TARGETS,
    ...Object.values(LEVEL_CHANGE_REFUSALS).flatMap((r) => r.panelTypes.map(normalizeElementKind)),
  ];
}

// ─── The arm ─────────────────────────────────────────────────────────────────

type Refusal = Extract<SemanticApplication, { kind: 'refusal' }>;

function refuse(reason: string, suggestions: readonly string[] = []): Refusal {
  return { kind: 'refusal', intent: MOVE_TO_LEVEL_INTENT_ID, reason, suggestions };
}

function levelNames(ctx: ResolverContext): string {
  return ctx.levels.map((l) => l.name).join(', ');
}

function speakKind(kind: string): string {
  return kind === 'curtain-wall' ? 'curtain wall' : kind;
}

/**
 * The three-way answer, in one function.
 *
 * `findLevel` is injected — see the header. It is the resolver's own, so a
 * level name means the same thing here as it does to "go to level 2".
 */
export function applyMoveToLevelIntent(
  si: MoveToLevelIntent,
  ctx: ResolverContext,
  findLevel: (query: string, levels: readonly ResolverLevel[]) => ResolverLevel | undefined,
): SemanticApplication {
  // ── 1. THE SPOKEN NOUN DECIDES THE FAMILY VERDICT FIRST ──────────────────
  //
  // "move this door to level 2" must answer *why a door has no storey of its
  // own* whether or not a door happens to be selected. Answering "nothing is
  // selected" to that sentence would be true and useless: the user would select
  // the door and get the refusal on the second try, having been told nothing
  // the first time.
  if (si.nounRef !== undefined) {
    const spokenKind = normalizeElementKind(si.nounRef);
    const spokenRefusal = levelChangeRefusalForChatKind(spokenKind);
    if (spokenRefusal !== null) {
      return refuse(spokenRefusal.reason, []);
    }
    const known = levelChangeSpecForChatKind(spokenKind) !== null;
    if (!known && levelChangeKnownKinds().includes(spokenKind)) {
      // Unreachable by construction (a known kind is in exactly one table) —
      // kept as a total branch so a future third table cannot fall through
      // silently.
      return refuse(`I don't know whether a ${speakKind(spokenKind)} can change level.`);
    }
  }

  // ── 2. "ALL" IS NOT A SCOPE THIS ARM HAS ─────────────────────────────────
  //
  // There is no project-wide level-change verb: every row in the register is
  // one element per command. Reading "move all walls to level 2" as "move the
  // one selected wall" and answering "Done" is the over-claim §L-995…L-998
  // were, so it refuses and names the escape hatch that does exist.
  if (si.projectScopeAsked === true) {
    return refuse(
      'I can only move what you have selected — there is no whole-project level change. ' +
      'Select the elements you want to move, then say "move them to level 2". Nothing was moved.',
      ['move this to level 2'],
    );
  }

  // ── 3. WHAT MOVES IS WHAT IS SELECTED ────────────────────────────────────
  if (ctx.selection.length === 0) {
    return refuse(
      'Nothing is selected — select the element you want to move, then say "move it to level 2".',
      ['move this to level 2'],
    );
  }

  // ── 4. PER-FAMILY VERDICT, ALL-OR-NOTHING OVER THE SELECTION ─────────────
  //
  // One refused or unknown family in the set refuses the WHOLE ask. Moving the
  // slabs and quietly leaving the door behind, then reporting "moved 3", is the
  // partial-execution dishonesty this resolver exists to stop (§L-995…L-998).
  const planned: { readonly elementId: string; readonly spec: LevelChangeVerbSpec }[] = [];
  for (const sel of ctx.selection) {
    const kind = normalizeElementKind(sel.elementType);
    const spec = levelChangeSpecForChatKind(kind);
    if (spec !== null) {
      planned.push({ elementId: sel.elementId, spec });
      continue;
    }
    const declined = levelChangeRefusalForChatKind(kind);
    if (declined !== null) {
      // THE SECOND ANSWER — the family's own sentence, not "I can't do that".
      return refuse(
        ctx.selection.length > 1
          ? `${declined.reason} Nothing was moved — one of the selected elements is a ${speakKind(kind)}.`
          : declined.reason,
        [],
      );
    }
    // THE THIRD ANSWER — neither table names this family, so the honest state
    // is "unknown", never a guess in either direction.
    return refuse(
      `I don't know whether a ${speakKind(kind)} can change level — it is in neither the list of ` +
      `families that can nor the list of families that must not, so I won't guess. Nothing was moved.`,
      [],
    );
  }

  // ── 5. THE SPOKEN NOUN MUST NOT CONTRADICT THE SELECTION ─────────────────
  if (si.nounRef !== undefined) {
    const spokenKind = normalizeElementKind(si.nounRef);
    if (levelChangeKnownKinds().includes(spokenKind)) {
      const mismatch = ctx.selection.find((s) => normalizeElementKind(s.elementType) !== spokenKind);
      if (mismatch !== undefined) {
        return refuse(
          `You asked to move a ${speakKind(spokenKind)}, but the selected element is a ` +
          `${speakKind(normalizeElementKind(mismatch.elementType))}. Nothing was moved.`,
          [],
        );
      }
    }
  }

  // ── 6. THE DESTINATION ───────────────────────────────────────────────────
  const dest = findLevel(si.levelQuery, ctx.levels);
  if (dest === undefined) {
    return refuse(
      ctx.levels.length === 0
        ? 'No levels exist in this project yet — say "add a level" first. Nothing was moved.'
        : `No level called "${si.levelQuery}" — the levels here are: ${levelNames(ctx)}. Nothing was moved.`,
      ctx.levels.slice(0, 2).map((l) => `move this to ${l.name.toLowerCase()}`),
    );
  }

  // ── 7. A STATED ORIGIN MUST RESOLVE, AND IT IS NOT A FILTER ──────────────
  //
  // The founder's third phrasing is "move slab FROM Level 1 to Level 2". The
  // selection carries no level (`ResolverSelection` is id + type), so this arm
  // CANNOT verify that what is selected is on Level 1 — and it will not pretend
  // to. An unresolvable origin refuses; a resolvable one is reported as the
  // user's own statement, so the reply never asserts a fact it did not check.
  let originNote = '';
  if (si.fromLevelQuery !== undefined) {
    const from = findLevel(si.fromLevelQuery, ctx.levels);
    if (from === undefined) {
      return refuse(
        `No level called "${si.fromLevelQuery}" — the levels here are: ${levelNames(ctx)}. Nothing was moved.`,
        [],
      );
    }
    if (from.id === dest.id) {
      return refuse(
        `${dest.name} is both the source and the destination — nothing to move.`,
        [],
      );
    }
    originNote = ` (you said it is on ${from.name}; I move what is selected, whichever storey it is on)`;
  }

  // ── 8. THE ELEVATION A FAMILY GENUINELY REQUIRES ─────────────────────────
  //
  // Only `wall.changeLevel` carries one, and its `canExecute` REJECTS a
  // non-finite `newElevationY` — the handler rebases `baseLine.y` so the L0
  // schema's "endpoints share the same y" refine stays satisfied. A level with
  // no elevation in the injected list is therefore a real gap, and it refuses
  // by name rather than dispatching a payload the bus will bounce.
  const needsElevation = planned.some((p) => p.spec.elevationField !== undefined);
  if (needsElevation && !Number.isFinite(dest.elevation ?? Number.NaN)) {
    return refuse(
      `I can't move a wall to ${dest.name}: that level has no elevation recorded, and a wall's ` +
      `level change needs one. Nothing was moved.`,
      [],
    );
  }

  const commands = planned.map((p) => ({
    type: p.spec.verb,
    payload: {
      ...buildLevelChangePayload(p.spec, p.elementId, dest.id, dest.elevation),
    },
  }));

  const kinds = [...new Set(planned.map((p) => speakKind(normalizeElementKind(p.spec.kind))))];
  const what = planned.length === 1
    ? `the selected ${kinds[0]}`
    : `the ${planned.length} selected element${planned.length === 1 ? '' : 's'}`;

  return {
    kind: 'commands',
    intent: MOVE_TO_LEVEL_INTENT_ID,
    summary: `Move ${what} to ${dest.name}${originNote}`,
    commands,
    // A level change deletes nothing and is one undo entry per element — the
    // reversible-and-reported path. Putting a Confirm card in front of the
    // founder's own sentence would buy no safety.
    destructive: false,
  };
}
