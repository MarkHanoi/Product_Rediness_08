// @pryzm/ai-host — PlacementActivation (L-906, founder-urgent).
// =============================================================================
//
// "Create a bed" dead-ended at "No matching commands". The founder's ask,
// verbatim: *"what he will be provided is like if the user clicks via UI in Bed
// element — it could then go with the mouse and see preview of the element and
// set it via UI, in the canvas. ENABLE THIS FOR ALL ELEMENTS."*
//
// This module is the RESOLVER half of that capability, and it is deliberately
// thin (C68 §5.i — a capability of known shape is a table row, not resolver
// code):
//
//   • `parsePlacementRef` — the tier-0 grammar's noun extraction for
//     "create/place/add/insert/draw/put <thing>". It claims ONLY a bare
//     verb + noun-phrase sentence; anything carrying a scope word, a number,
//     or a preposition falls through to the grammars and ladders that own
//     those shapes. It runs LAST in the matcher list, so every existing
//     sentence ("create a wall from (0,0) to (5,0)", "add a level at 3m",
//     "create a 3 bedroom apartment", "create a window in every wall
//     segment") keeps its owner.
//   • `applyActivatePlacement` — turns the parsed noun into a LOCAL
//     `activateTool` action carrying the RAW reference.
//
// WHY THE RAW REFERENCE IS FORWARDED INSTEAD OF RESOLVED HERE (C69, one
// ladder, no rival list): the two enumeration sources — the element creation
// matrix (`apps/editor/.../elementCreationMatrix.ts`) and the furniture
// catalogue (`FurnitureCategoryRegistry`) — are EDITOR-layer artefacts this
// pure L2 module must not copy; a transcription here would be exactly the
// "capability table that lies" the registry's header warns about. The editor
// bridge (`apps/editor/src/ui/ai/chatPlacementActivation.ts`) resolves the
// reference against the REAL sources through the ONE `resolveCatalogueRef`
// ladder at dispatch time, and speaks the honest outcome (activated /
// ambiguous-with-choices / no-match-with-nearest). This mirrors the
// catalogue-family precedent ("Absent injection forwards the raw string and
// the COMMAND resolves and refuses" — CatalogueFamilies.ts).
//
// This module is PURE — no DOM, no stores, no I/O.

import type { SemanticApplication, SemanticIntent } from './ZeroTokenResolver.js';

/** The payload an `activateTool` local action asks the bridge to act on. The
 *  bridge resolves `itemRef` against the real creation matrix + catalogue and
 *  activates the SAME tool the palette button activates — or refuses/asks. */
export interface PlacementLocalDispatch {
  readonly itemRef: string;
}

/** The verbs that open a placement sentence. Also declared (as documentation)
 *  on the `activate-placement` registry entry. `\s` lookahead keeps "created"
 *  (a report paste-back) from matching "create". */
const PLACEMENT_VERB_RE = /^(?:create|place|add|insert|draw|put)\s+/;

/** Optional article/determiner between the verb and the noun. */
const ARTICLE_RE = /^(?:a\s+new|another|a|an|the|new|some)\s+/;

/**
 * Words that mark the sentence as belonging to a richer grammar (scopes,
 * prepositions, sequencing) — a placement noun-phrase never carries them.
 * "add a bathroom in room 001" and "place a bed and a sofa" must fall through
 * to the ladders that own those shapes, never be half-claimed here.
 */
const REF_STOPWORD_RE =
  /\b(?:in|on|at|to|from|with|without|for|of|by|into|onto|near|under|over|every|all|each|and|or|then|this|that|it|here|there|selected|is|are|was|be|my|me|please)\b/;

/** A noun-phrase: 1–4 words of letters/hyphens/apostrophes. Digits are
 *  deliberately excluded — a number in the sentence means dimensions, counts
 *  or level elevations, all owned by other grammars. */
const REF_SHAPE_RE = /^[a-z][a-z'-]*(?:\s+[a-z][a-z'-]*){0,3}$/;

/**
 * Extract the placement reference from a normalized utterance, or null when
 * this grammar does not claim it.
 *
 * @param excludedNouns Nouns the tier-1 synonym table rewrites into OTHER
 *   grammars' words ("floor" → "level", "storey" → "level"): claiming them at
 *   tier 0 would steal "add a floor" from `add-level`, which has owned that
 *   sentence since ADR-0313. The set is built FROM the resolver's own
 *   `SYNONYMS` table — never a second hand-written list.
 */
export function parsePlacementRef(
  text: string,
  excludedNouns?: ReadonlySet<string>,
): string | null {
  const verbMatch = PLACEMENT_VERB_RE.exec(text);
  if (verbMatch === null) return null;
  let ref = text.slice(verbMatch[0].length).trim();
  const article = ARTICLE_RE.exec(ref);
  if (article !== null) ref = ref.slice(article[0].length).trim();
  if (ref.length === 0 || ref.length > 40) return null;
  if (REF_STOPWORD_RE.test(ref)) return null;
  if (!REF_SHAPE_RE.test(ref)) return null;
  if (excludedNouns?.has(ref) ?? false) return null;
  return ref;
}

/**
 * The `activate-placement` semantic → a LOCAL `activateTool` action. No
 * command is dispatched and nothing mutates (C83 §4.2 — no position is ever
 * guessed): the bridge activates the palette's own placement tool and the
 * USER places the element with the existing mouse preview; the mutation flows
 * through the one command path when they click (P6).
 */
export function applyActivatePlacement(
  si: Extract<SemanticIntent, { intent: 'activate-placement' }>,
): SemanticApplication {
  const ref = si.itemRef.trim();
  return {
    kind: 'local',
    intent: 'activate-placement',
    summary: `Activate ${ref} placement`,
    action: 'activateTool',
    placement: { itemRef: ref },
  };
}
