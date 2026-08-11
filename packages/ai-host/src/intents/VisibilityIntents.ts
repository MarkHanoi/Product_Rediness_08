// @pryzm/ai-host — VisibilityIntents (§GATE-VIS-INTENT, VIS-CLASS 2026-08-11).
// =============================================================================
//
// The visibility-intent FAMILY — the structural half left open at 6b538355:
// the guard (`visibilityAskClass`) partitioned visibility asks, but zero
// capabilities could hide, isolate, reveal, or answer "what is hidden". The
// four intents here ride the intent path wired in `composeRuntime` §4d-bis
// (`visibility.hide.selection` / `.isolate.selection` / `.reveal.all` →
// `ViewVisibilityIntentStore`), reached as LOCAL actions — see
// `ZeroTokenLocalAction`'s doc for why the compose-root verbs are carried in
// the resolution payload rather than declared as registry `busCommand`s.
//
// ITS OWN MODULE, like `CapabilityExecutionSpec` and `PropertyVocabulary`: a
// family is one module plus registry metadata, and `applySemanticIntent`
// routes to it by table membership — never by new hand-written case arms
// (coverage-gate check 8 is a shrink-only ratchet at its ceiling, and the
// family discipline is the point, not a way around it).
//
// ── ROUTING DECISION, with the evidence ("hide level 2", task step 4) ────────
// `hide level 2`, `hide all walls`, `isolate level 2` and every other
// non-selection visibility ask stay honest MISSES and reach the LIVE legacy
// QueryEngine handlers (`QueryEngine.ts` hide-level/category patterns →
// `pryzm-visibility-command` → `UnifiedBrowserPanel.handleVisibilityCommand`).
// The NEW path is NOT given them, because:
//   1. The intent path is per-ELEMENT-ID and has NO per-element unhide bus
//      verb — "hide level 2" here would be a one-way trap only "reveal all"
//      exits, strictly worse than the panel's reversible level toggle.
//   2. The level-visibility state the panel toggles and the per-view intent
//      store are DIFFERENT authorities; claiming the sentence here would mint
//      a second, disagreeing owner for level visibility.
//   3. The 6b538355 regression set (SECTION D, QueryEngineDrain DRAINED) pins
//      these sentences as misses — re-claiming one is the named regression.
//
// ── HONESTY (task step 6) ────────────────────────────────────────────────────
// Visibility intents have NO undo (`affectedStores: []` — the composeRuntime
// adapter says so), NO persistence caller and NO sync. Every summary carries
// the view-only tail; nothing implies durability that does not exist.
//
// PURITY: no DOM, no stores, no I/O — same contract as the resolver. Imports
// from ZeroTokenResolver are TYPE-ONLY, so the value dependency runs one way
// (resolver → this module) and no load-order cycle exists
// (§SCC-NO-BARREL-ACCESS-AT-MODULE-LOAD).

import type {
  ResolverContext,
  SemanticApplication,
  SemanticIntent,
} from './ZeroTokenResolver.js';

export type VisibilityIntent = Extract<
  SemanticIntent,
  { intent: 'hide-selection' | 'isolate-selection' | 'reveal-all' | 'visibility-query' }
>;

export const VISIBILITY_INTENT_IDS: ReadonlySet<string> = new Set([
  'hide-selection', 'isolate-selection', 'reveal-all', 'visibility-query',
]);

export function asVisibilityIntent(si: SemanticIntent): VisibilityIntent | null {
  return VISIBILITY_INTENT_IDS.has(si.intent) ? (si as VisibilityIntent) : null;
}

/** The one honesty tail every mutating visibility summary carries. */
const VIS_EPHEMERAL_TAIL =
  'view-only: not undoable, not saved with the project, and collaborators do not see it';

/** Local copy of the resolver's noun singulariser (a value import from the
 *  resolver would close a runtime cycle; three lines is the cheaper truth). */
function singularNoun(noun: string): string {
  return noun.endsWith('s') ? noun.slice(0, -1) : noun;
}

export function applyVisibilityIntent(
  si: VisibilityIntent,
  ctx: ResolverContext,
): SemanticApplication {
  const refuse = (
    intent: string, reason: string, suggestions: readonly string[] = [],
  ): SemanticApplication => ({ kind: 'refusal', intent, reason, suggestions });

  if (si.intent === 'hide-selection' || si.intent === 'isolate-selection') {
    const verb = si.intent === 'hide-selection' ? 'hide' : 'isolate';
    if (ctx.selection.length === 0) {
      return refuse(
        si.intent,
        `Nothing is selected — select what you want to ${verb} first. Nothing was changed.`,
      );
    }
    if (si.noun !== undefined) {
      const wanted = singularNoun(si.noun);
      if (!['element', 'item', 'object'].includes(wanted)) {
        // Same discipline as delete-selected: the noun must match EVERY
        // selected element — "hide the selected walls" over a wall+door
        // selection must refuse whole, never hide the door as collateral.
        const mismatch = ctx.selection.find((s) => wanted !== s.elementType);
        if (mismatch !== undefined) {
          return refuse(
            si.intent,
            `You asked to ${verb} a ${wanted}, but the selected element is a ` +
            `${mismatch.elementType}. Nothing was changed.`,
            [`${verb} the selected ${mismatch.elementType}`],
          );
        }
      }
    }
    const ids = ctx.selection.map((s) => s.elementId);
    const n = ids.length;
    const subject = n === 1
      ? `the selected ${ctx.selection[0]!.elementType}`
      : `the ${n} selected elements`;
    return {
      kind: 'local',
      intent: si.intent,
      action: 'applyVisibilityIntent',
      summary: si.intent === 'hide-selection'
        ? `Hid ${subject} in this view (${VIS_EPHEMERAL_TAIL}; say "reveal all" to bring it back)`
        : `Isolated ${subject} — everything else in this view is hidden (${VIS_EPHEMERAL_TAIL}; say "reveal all" to exit isolation)`,
      visibility: {
        busCommand: si.intent === 'hide-selection'
          ? 'visibility.hide.selection'
          : 'visibility.isolate.selection',
        elementIds: ids,
      },
    };
  }

  if (si.intent === 'reveal-all') {
    if (si.onlySelection === true) {
      // "unhide this wall" — there is no per-element unhide bus command
      // (`visibility.unhide.selection` is not registered; the store's
      // `unhide()` has no command carrier). Refusing and offering the real
      // ability beats silently revealing everything the user did not ask for.
      return refuse(
        'reveal-all',
        'I can only reveal everything hidden in this view — per-element unhide ' +
        'is not connected to chat yet. Nothing was changed.',
        ['reveal all'],
      );
    }
    return {
      kind: 'local',
      intent: 'reveal-all',
      action: 'applyVisibilityIntent',
      summary:
        `Revealed everything hidden in this view and cleared any isolation (${VIS_EPHEMERAL_TAIL})`,
      visibility: { busCommand: 'visibility.reveal.all', elementIds: [] },
    };
  }

  // §GATE-QUERYENGINE-READ-ONLY — visibility-query ANSWERS, never mutates.
  // The summary IS the answer; action 'answer' asks the bridge to dispatch
  // NOTHING.
  const answer = (summary: string): SemanticApplication => ({
    kind: 'local', intent: 'visibility-query', action: 'answer', summary,
  });
  if (si.topic === 'levels') {
    if (ctx.levels.length === 0) {
      return answer('I cannot see any levels in this project from here');
    }
    const names = ctx.levels.map((l) => l.name).join(', ');
    const active = ctx.levels.find((l) => l.id === ctx.activeLevelId)?.name;
    return answer(
      `This project has ${ctx.levels.length} level${ctx.levels.length === 1 ? '' : 's'}: ${names}` +
      `${active !== undefined ? ` — ${active} is active` : ''}. ` +
      'I cannot read the per-level visibility toggles in the browser panel from chat, ' +
      'so I will not guess which are switched off',
    );
  }
  const snap = ctx.visibility;
  if (snap === undefined) {
    // UNREADABLE is a different fact from EMPTY (§CONTEXT-DATA-HONESTY):
    // never report "nothing is hidden" when the store cannot be read.
    return answer(
      'I cannot read the visibility state in this chat context, so I will not guess. ' +
      'Nothing was changed',
    );
  }
  const iso = snap.isolationActive
    ? `an isolation over ${snap.isolationCount} element${snap.isolationCount === 1 ? '' : 's'} is active (everything outside it is hidden)`
    : 'no isolation is active';
  if (snap.hiddenCount === 0 && !snap.isolationActive) {
    return answer('Nothing is hidden in this view, and no isolation is active');
  }
  return answer(
    `${snap.hiddenCount} element${snap.hiddenCount === 1 ? ' is' : 's are'} explicitly hidden ` +
    `in this view, and ${iso}. I cannot name them from chat yet — hidden state is ` +
    'view-only and is not saved with the project',
  );
}
