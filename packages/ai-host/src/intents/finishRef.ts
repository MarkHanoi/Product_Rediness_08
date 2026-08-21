// §FEAT-WALL-LAYER-ADD-BATCH (ADR-0315) — the ONE finish-name table.
//
// The exact colorRef.ts pattern one file over: the chat resolver owns the
// LANGUAGE ("plaster", "paint") and hands the command RESOLVED values
// ({name, materialColor, materialId}); `AddWallLayerBatchCommand` deliberately
// owns no name table, so there is exactly one name-to-finish site.
//
// --- C85 section 4.4 / ADR-0333: the hexes are DERIVED now, not transcribed ---
// This file used to carry `materialColor` and `name` for all 15 finishes,
// transcribed by hand from the master library, under a header that instructed
// future authors: "If the library recolours a finish, update the hex here in the
// same commit." A maintenance obligation written in a comment is the weakest
// possible gate - it is drift with a due date.
//
// The reason it was transcribed was real, and it is now GONE: the master used to
// build `THREE.Color` at module load, so a pure resolver could not import it. The
// data has moved to `@pryzm/schemas/materials` (L0, plain scalars), so this file
// reads the master directly and stays exactly as pure as before - no THREE, no
// DOM, no stores. What remains local is the ALIASES, which is correct: the
// language belongs to the resolver, the values belong to the master (C68 5.d).
//
// PURE - no I/O, no stores; safe for tier-0 and the NL layer.

import { findMaterialRecord, MATERIAL_CATALOG } from '@pryzm/schemas/materials';

export interface ResolvedFinish {
  /** Display name for the layer row (the library's label). */
  readonly name: string;
  /** '#rrggbb' - what WallFragmentBuilder actually renders. */
  readonly materialColor: string;
  /** The material library id, kept on the layer for the inspector. */
  readonly materialId: string;
}

/**
 * Alias -> master material id. THE ONLY hand-maintained column left.
 *
 * An id here that names nothing in the master is a BUG, not a fallback: the entry
 * is dropped and {@link finishRefIntegrityErrors} reports it by name. Silently
 * resolving it to a plausible colour is the NO-EMPTY-MEANS-UNKNOWN failure this
 * contract exists to remove (C85 section 5).
 */
const FINISH_ALIASES: ReadonlyArray<{ readonly id: string; readonly aliases: readonly string[] }> = [
  { id: 'gypsum-skim', aliases: ['plaster', 'skim', 'skim coat', 'plaster skim'] },
  { id: 'gypsum-plasterboard', aliases: ['plasterboard', 'drywall', 'gypsum', 'gypsum board', 'sheetrock'] },
  { id: 'gypsum-acoustic', aliases: ['acoustic plasterboard', 'acoustic board'] },
  { id: 'gypsum-venetian', aliases: ['venetian plaster', 'polished plaster'] },
  { id: 'plaster-clay-natural', aliases: ['clay plaster', 'clay', 'natural clay'] },
  { id: 'plaster-tadelakt', aliases: ['tadelakt'] },
  { id: 'gypsum-fire-rated-pink', aliases: ['fire rated plasterboard', 'fire board', 'fire rated'] },
  { id: 'gypsum-moisture-green', aliases: ['moisture resistant plasterboard', 'moisture board', 'green board'] },
  { id: 'paint-matte-white', aliases: ['paint', 'matte white paint', 'white paint'] },
  { id: 'paint-eggshell-warm', aliases: ['eggshell paint', 'warm eggshell'] },
  { id: 'paint-satin-charcoal', aliases: ['charcoal paint', 'satin charcoal', 'dark paint'] },
  { id: 'paint-limewash-cream', aliases: ['limewash', 'limewash cream', 'lime wash'] },
  { id: 'paint-microcement-warm-grey', aliases: ['microcement', 'micro cement'] },
  { id: 'insulation-cellulose', aliases: ['cellulose insulation', 'blown cellulose'] },
  { id: 'insulation-wood-fibre', aliases: ['wood fibre insulation', 'wood fiber insulation', 'wood fibre'] },

  // ─── §L960-WOOD-IS-A-SURFACE (founder, 2026-08-18) ─────────────────────────
  // He typed *"make all inner finishes walls on the ground floor to wood"* and was
  // told the walls were now `Insulation · Wood Fibre Board`. The mechanism, exactly:
  // 'wood' matched no alias, fell to the substring arm, and the ONLY aliases
  // containing it were the three on `insulation-wood-fibre` — one group, so
  // `partial.length === 1` and the resolver returned it as an unambiguous hit.
  //
  // It was not an ambiguity bug. It was an ABSENCE: the master carries 21 visible
  // WOOD and TIMBER ENGINEERED surfaces and this table listed none of them, so the
  // buried insulation product was the only thing in the room that could answer. The
  // fix is therefore to ADD the surfaces (plus the category guard below for when a
  // future word straddles both), not to narrow the matcher.
  { id: 'wood-oak', aliases: ['wood', 'oak', 'timber', 'wood oak', 'oak wood', 'light oak'] },
  { id: 'wood-walnut', aliases: ['walnut', 'dark wood', 'walnut wood'] },
  { id: 'wood-pine', aliases: ['pine', 'pine wood'] },
  { id: 'wood-birch', aliases: ['birch', 'birch wood'] },
  { id: 'wood-teak', aliases: ['teak'] },
  { id: 'wood-ash', aliases: ['ash', 'ash wood'] },
  { id: 'wood-maple', aliases: ['maple'] },
  { id: 'wood-cherry', aliases: ['cherry'] },
  { id: 'wood-mahogany', aliases: ['mahogany'] },
  { id: 'wood-ebony', aliases: ['ebony'] },
  { id: 'wood-cedar-red', aliases: ['cedar', 'red cedar'] },
  { id: 'wood-oak-smoked', aliases: ['smoked oak'] },
  // 'white oak' is deliberately NOT an alias here: it is a different species from
  // whitewashed oak, and it would widen the 'white' collision below for no gain.
  { id: 'wood-oak-whitewashed', aliases: ['whitewashed oak'] },
  { id: 'wood-reclaimed', aliases: ['reclaimed wood', 'weathered wood'] },
  { id: 'wood-painted-white', aliases: ['painted wood', 'white painted wood'] },
  { id: 'wood-charred-shou-sugi-ban', aliases: ['charred wood', 'shou sugi ban', 'charred timber'] },
  { id: 'wood-thermowood', aliases: ['thermowood', 'thermally modified wood'] },
  { id: 'timber-veneer-oak', aliases: ['oak veneer', 'veneer', 'timber veneer', 'veneer panel'] },
  { id: 'timber-plywood', aliases: ['plywood', 'birch ply', 'ply'] },
  { id: 'timber-clt', aliases: ['clt', 'cross laminated timber'] },
  { id: 'timber-glulam', aliases: ['glulam', 'glued laminated timber'] },
  { id: 'timber-bamboo', aliases: ['bamboo'] },
  { id: 'timber-osb', aliases: ['osb', 'oriented strand board'] },
  { id: 'timber-mdf', aliases: ['mdf'] },
];

/**
 * §L960-WOOD-IS-A-SURFACE — categories that are BURIED inside the construction and
 * are never the visible face of a wall.
 *
 * A wall FINISH is by definition a visible surface, so when a bare word matches both
 * a visible-surface row and a concealed one, the concealed one is not a candidate —
 * it is the wrong KIND of answer, regardless of how well the letters line up. This
 * is the "category + visible-surface suitability" the substring arm was missing.
 *
 * ⚠ It filters CANDIDATES, it does not delete vocabulary: `'wood fibre insulation'`
 * still resolves, because an EXACT alias is a request for that product BY NAME and
 * is never overruled here. A user who asks for insulation gets insulation; a user who
 * asks for "wood" gets wood.
 */
const CONCEALED_CATEGORIES: ReadonlySet<string> = new Set([
  'Insulation',
  'Membrane & Waterproofing',
]);

/** Entries whose material id is absent from the master. Empty in a healthy build. */
export function finishRefIntegrityErrors(): string[] {
  return FINISH_ALIASES.filter((e) => !findMaterialRecord(e.id)).map((e) => e.id);
}

/** Alias -> finish, DERIVED from the master. First alias in each group is the canonical suggestion. */
const FINISHES: ReadonlyArray<{ aliases: readonly string[]; category: string; finish: ResolvedFinish }> =
  FINISH_ALIASES.flatMap((entry) => {
    const record = findMaterialRecord(entry.id);
    if (!record) return [];
    return [{
      aliases: entry.aliases,
      // Carried from the master, never restated here — it is what makes the
      // visible-surface guard a property of the CATALOGUE and not of this table.
      category: record.category,
      finish: { name: record.label, materialColor: record.color, materialId: record.id },
    }];
  });

const normalize = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

// ─── §FIX-FINISH-VOCABULARY-IS-THE-CATALOGUE (L-1262) ────────────────────────
//
// ⭐ TWO VOCABULARIES FOR ONE PRODUCT — MEASURED, 2026-08-19.
//
// The alias table above is 39 groups. The C100 MASTER CATALOGUE is **205
// materials in 17 categories**. Reachability of a master material FROM CHAT BY
// ITS OWN CATALOGUE LABEL — the string the founder is looking at in the material
// picker lane HR5 wired today — measured per category:
//
//   Metal            0/24   Landscape & Ground  0/33   Stone     0/15
//   Concrete         0/15   Glass               0/13   Masonry   0/13
//   Ceramic & Tile   0/10   Plastic & Polymer   0/ 9   Roofing   0/ 6
//   Fabric & Soft    0/ 6   Membrane            0/ 6   Specialty 0/ 6
//   Wood             1/17   Timber Engineered   3/ 9   Paint     2/ 7
//                                            ── TOTAL 7 / 205 ──
//
// He can PICK `Steel · Corten (Weathering)` in the panel and chat answers
// *"I don't know the finish 'copper'"*. One product, two vocabularies — C84
// EI-8/EI-9, and the most-repeated defect shape of this session.
//
// ⭐ AND THE HAND LIST DID NOT MERELY MISS — IT ANSWERED WRONGLY. The loose
// substring arm below matched a candidate against ALIAS FRAGMENTS, so:
//   • "polished concrete"  → **Plaster · Venetian (Polished)**   (via 'polished
//     plaster'; the founder asked for concrete and got plaster, reported as
//     success — the L-960 "wood → insulation" defect, still live for every word
//     the wood fix did not enumerate);
//   • "wall"               → **Plasterboard · Standard** (inside 'drywall'), so
//     a SCOPE WORD resolved as a material. The header already recorded fixing
//     "all" inside "drywall" by requiring ≥4 characters — and "wall" is exactly
//     four.
//
// THE FIX IS THE L-1201 FIX AGAIN: **derive the vocabulary, do not remember it.**
// The aliases stay — they are the LANGUAGE layer, and 'plaster' → skim coat is a
// deliberate canonical choice that a raw catalogue scan would make ambiguous.
// What is added is a CATALOGUE arm beneath them, matching the user's words
// against the master's own labels by TOKEN SUBSET, so all 205 become nameable
// without one more hand-maintained row.
//
// ⛔ AMBIGUITY IS A REFUSAL, NEVER A PICK. "copper" names two rows (New (Bright)
// / Patinated (Green)); "polished concrete" names two. Both now REFUSE and list
// the candidates, which is how the founder learns the catalogue instead of
// discovering next week that his building is the wrong colour.

/** Words this GRAMMAR uses structurally. A word that means "which walls" or
 *  "which face" can never simultaneously be a material name — that is what let
 *  "wall" resolve to Plasterboard and "coat" to Skim Coat. Derived from the
 *  wall grammars' own token vocabulary, not a wish-list. */
const GRAMMAR_STOPWORDS: ReadonlySet<string> = new Set([
  'wall', 'walls', 'side', 'sides', 'face', 'faces',
  'inner', 'interior', 'inside', 'internal', 'indoor',
  'outer', 'exterior', 'outside', 'external', 'outdoor', 'facade', 'façade',
  'layer', 'layers', 'coat', 'coats', 'coating', 'coatings',
  'finish', 'finishes', 'finished', 'finishing',
  'all', 'every', 'each', 'the', 'and', 'this', 'these', 'those', 'selected',
  'room', 'rooms', 'level', 'levels', 'floor', 'floors', 'storey', 'storeys',
  'make', 'change', 'set', 'apply', 'turn', 'update', 'refinish',
  'material', 'materials', 'colour', 'color',
]);

/** Split a catalogue label or a spoken phrase into comparable word tokens.
 *  The label separator `·`, slashes, parentheses and hyphens are all just
 *  punctuation here: "Steel · Corten (Weathering)" → {steel, corten, weathering}. */
function tokens(s: string): string[] {
  return normalize(s)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w.length > 1);
}

/** The master, pre-tokenised once. DERIVED — adding a material to C100 makes it
 *  chat-nameable with no edit here, which is the whole point. */
const CATALOGUE_TOKENS: ReadonlyArray<{
  readonly finish: ResolvedFinish;
  readonly category: string;
  readonly tokens: ReadonlySet<string>;
}> = MATERIAL_CATALOG.map((m) => ({
  finish: { name: m.label, materialColor: m.color, materialId: m.id },
  category: m.category,
  tokens: new Set(tokens(m.label)),
}));

/**
 * Every master material whose label CONTAINS all the words the user said.
 *
 * Exported so a refusal can list the real candidates ("'copper' matches Copper ·
 * New (Bright) and Copper · Patinated (Green)") instead of the strictly weaker
 * "I don't know that finish" — U8.3's teach-don't-just-say-no rule applied to
 * the material vocabulary.
 */
export function finishRefCandidates(ref: string): ResolvedFinish[] {
  const want = tokens(ref);
  if (want.length === 0) return [];
  // ⭐ THE FULL LABEL, EXACTLY AS THE PICKER SHOWS IT, ALWAYS WINS — before the
  //    stopword guard and before the concealed-category filter.
  //
  //    Measured cost of not doing this: six real materials became unnameable by
  //    their own label because the label CONTAINS a word this grammar uses
  //    structurally — `Plaster · Skim COAT (Painted)`, `Glass · Reflective
  //    (Curtain WALL)`, `Plywood · Birch FACE`, `Steel · White Intumescent
  //    COATING`, `Blockwork · Split FACE Concrete`. A guard against sentence
  //    fragments must not veto a name the product itself prints.
  //
  //    It also restores §L960's own rule for concealed products: an exact
  //    request BY NAME is never overruled — "a user who asks for insulation
  //    gets insulation".
  const exactLabel = CATALOGUE_TOKENS.filter(
    (c) => c.tokens.size === want.length && want.every((w) => c.tokens.has(w)),
  );
  if (exactLabel.length === 1) return [exactLabel[0]!.finish];
  // ⛔ A candidate carrying a word THIS GRAMMAR uses structurally is not a
  //    material name — it is a fragment of the sentence. Measured while writing
  //    this: stripping the stopwords and matching on what was left made the
  //    shrinking-window scan resolve the span "exterior finish plaster", so a
  //    three-word garbage span answered before the clean one-word "plaster" was
  //    ever tried. REJECT the span; do not launder it.
  if (want.some((w) => GRAMMAR_STOPWORDS.has(w))) return [];
  const hits = CATALOGUE_TOKENS.filter(
    (c) => !CONCEALED_CATEGORIES.has(c.category) && want.every((w) => c.tokens.has(w)),
  );
  if (hits.length <= 1) return hits.map((h) => h.finish);
  // ⛔ OTHERWISE IT STAYS AN AMBIGUITY, AND THE CALLER MUST ASK.
  //    An earlier draft of this function preferred the record with the FEWEST
  //    extra words, calling it "most specific". Measured, that made "plaster"
  //    resolve to **Plaster · Tadelakt** — the shortest label — instead of the
  //    canonical Skim Coat. A tie-break that always produces an answer is a
  //    coin-flip with a rationale attached, which is the exact defect the
  //    substring arm below was already convicted of (§L960-WOOD-IS-A-SURFACE).
  return hits.map((h) => h.finish);
}

/**
 * §FIX-LOOSE-ALIAS-DROPS-A-CATALOGUE-WORD (L-1880, lane RAC1, 2026-08-21) — every
 * word the MASTER's own labels contain, derived once.
 *
 * ⭐ MEASURED, and it is the founder's sentence: he typed *"finish to wooden
 * parquet"*. `finishRefCandidates('wooden parquet')` is **0** — no label contains
 * "wooden" — so the phrase fell through to the loose alias arm, where
 * `n.includes('wood')` is true for the `wood-oak` group and NOTHING else matched.
 *
 *     resolveFinishRef('wooden parquet')  ->  'wood-oak'      (measured, before)
 *
 * He asked for PARQUET and would have been given plain flat oak, reported as a
 * success. That is §L960-WOOD-IS-A-SURFACE one notch milder: not a wrong KIND of
 * product this time, but a SILENT NARROWING (C84 EI-2) of the one word that
 * carried his whole ask. The catalogue holds thirteen rows whose label says
 * "Parquet"; the answer given named none of them.
 *
 * ⛔ THE FIX IS NOT TO ADD 'wooden' AS AN ALIAS. That is the remember-don't-derive
 * defect this file's own header convicts. The rule is structural: a LOOSE match
 * may not ignore a word the CATALOGUE KNOWS. If the user said a word that appears
 * in real material labels and the row we landed on carries it in neither its
 * aliases nor its label, we matched on a fragment and dropped the ask — which is
 * a question, never an answer.
 */
const CATALOGUE_WORDS: ReadonlySet<string> = new Set(
  MATERIAL_CATALOG.flatMap((m) => tokens(m.label)),
);

/**
 * Every catalogue word the user said that a candidate row does NOT account for.
 *
 * Empty ⇒ the row explains every catalogue-known word in the request. Non-empty
 * ⇒ the match silently dropped part of the ask.
 */
function droppedCatalogueWords(
  ref: string,
  entry: { readonly aliases: readonly string[]; readonly finish: ResolvedFinish },
): string[] {
  const covered = new Set<string>([
    ...tokens(entry.finish.name),
    ...entry.aliases.flatMap((a) => tokens(a)),
  ]);
  return tokens(ref).filter((w) => CATALOGUE_WORDS.has(w) && !covered.has(w));
}

/**
 * Resolve a finish reference ("plaster", "limewash") to the library values.
 * Exact alias first, then unique-substring (ambiguity ⇒ null, never a
 * coin-flip — same ruling as resolveCatalogueRef). Returns null on a miss;
 * callers refuse by LISTING real options via {@link exampleFinishNames}.
 */
export function resolveFinishRef(ref: string): ResolvedFinish | null {
  const n = normalize(ref);
  if (n.length === 0) return null;
  // ── 1. THE CANONICAL NICKNAME. The LANGUAGE layer wins outright: 'plaster'
  //    means Skim Coat here by decision, and 'wood' means Oak (§L960). A raw
  //    catalogue scan would make both ambiguous, so this arm stays first.
  for (const entry of FINISHES) {
    if (entry.aliases.some((a) => a === n)) return entry.finish;
  }
  // ── 2. §FIX-FINISH-VOCABULARY-IS-THE-CATALOGUE (L-1262) — THE MASTER, by its
  //    own labels. This is what makes all 205 materials nameable rather than 39,
  //    and it is DERIVED: a new C100 row is chat-nameable with no edit here.
  //
  //    ⛔ It also GUARDS arm 3. When the user's words name several real
  //    materials the answer is "which one", never a pick — and we must not fall
  //    through to the looser alias arm, because that is precisely how "polished
  //    concrete" became Venetian Plaster.
  const catalogue = finishRefCandidates(n);
  if (catalogue.length === 1) return catalogue[0]!;
  if (catalogue.length > 1) return null;
  // ── 3. The loose alias arm. Substring matching needs ≥4 chars — short
  //    scope/stop words otherwise hit inside longer aliases ("all" inside
  //    "drywall" was the live false positive).
  //    §L-1262: and a word this GRAMMAR uses structurally is never a material,
  //    which is what "wall" → Plasterboard (inside 'drywall') and "coat" →
  //    Skim Coat were. Four characters was never the discriminator; MEANING is.
  if (n.length < 4) return null;
  // ANY structural word disqualifies the span, not merely all of them. "layer
  // finish plaster" must not resolve — the shrinking-window scan would then
  // record that whole fragment as the finish NAME and quote it back in a
  // refusal as though the user had typed it as a material.
  if (tokens(n).some((w) => GRAMMAR_STOPWORDS.has(w))) return null;
  const partial = FINISHES.filter((e) => e.aliases.some((a) => a.includes(n) || n.includes(a)));
  // §L960-WOOD-IS-A-SURFACE — a finish is a VISIBLE face, so a buried product is
  // not a candidate for a loose match while a real surface also matches. When only
  // concealed rows match, they stay the answer (nothing else was asked for), so this
  // narrows the coin-flip rather than removing vocabulary.
  const visible = partial.filter((e) => !CONCEALED_CATEGORIES.has(e.category));
  const pool = visible.length > 0 ? visible : partial;
  if (pool.length !== 1) return null;
  // §FIX-LOOSE-ALIAS-DROPS-A-CATALOGUE-WORD (L-1880) — the loose arm matched on a
  // FRAGMENT of what was asked for. "wooden parquet" landed on `wood-oak` through
  // the alias 'wood' while dropping 'parquet', a word thirteen master labels carry.
  // A single survivor is only an answer when it accounts for the whole ask.
  if (droppedCatalogueWords(n, pool[0]!).length > 0) return null;
  return pool[0]!.finish;
}

/** Canonical names for refusal copy (first alias of each group). */
export function exampleFinishNames(): string[] {
  return FINISHES.map((e) => e.aliases[0]!);
}

/**
 * §FIX-FINISH-VOCABULARY-IS-THE-CATALOGUE (L-1262) — the refusal copy for an
 * unresolved finish, in ONE place so every caller says the same true thing.
 *
 * ⛔ IT NO LONGER LISTS THIRTY-NINE NICKNAMES AS THOUGH THEY WERE THE
 * VOCABULARY. That list was the measurable lie: it read as an inventory while
 * 205 materials existed, so a founder who typed a name he was LOOKING AT in the
 * picker was told the product did not know it, followed by a wall of words that
 * did not include it. The copy now states the real size and, when the words
 * matched several real rows, NAMES THEM — an ambiguity is a question, never a
 * pick (§CONTEXT-DATA-HONESTY, U8.3 teach-don't-just-say-no).
 */
export function finishRefusalCopy(ref: string | null): string {
  const examples = exampleFinishNames().slice(0, 8).join(', ');
  const total = catalogueFinishCount();
  if (ref === null || ref.trim().length === 0) {
    return `Tell me which finish — I know ${total} materials, including ${examples}.`;
  }
  const candidates = finishRefCandidates(ref);
  if (candidates.length > 1) {
    return (
      `"${ref}" matches ${candidates.length} materials — ` +
      `${candidates.map((c) => c.name).join(', ')}. ` +
      `Say which one; nothing was changed.`
    );
  }
  // §FIX-LOOSE-ALIAS-DROPS-A-CATALOGUE-WORD (L-1880) — TEACH FROM THE WORD THAT
  // DID LAND, rather than from a generic list of eight nicknames.
  //
  // The founder's *"wooden parquet"* matches NO label as a whole phrase, so the
  // clause above cannot fire and the old copy fell through to "I don't know the
  // finish …" followed by plaster, plasterboard, gypsum … — none of which is what
  // he asked for, while the catalogue holds thirteen rows whose label literally
  // says Parquet. A phrase the catalogue cannot match is still usually a phrase
  // ONE of whose words it knows perfectly well; naming those rows is the
  // difference between a refusal that teaches the vocabulary and one that hides
  // it (U8.3, §CONTEXT-DATA-HONESTY).
  if (candidates.length === 0) {
    const perWord = tokens(ref)
      .map((w) => ({ word: w, hits: finishRefCandidates(w) }))
      .filter((r) => r.hits.length > 0)
      .sort((a, b) => a.hits.length - b.hits.length)[0];
    if (perWord !== undefined) {
      const shown = perWord.hits.slice(0, 8).map((c) => c.name).join(', ');
      const more = perWord.hits.length > 8 ? `, and ${perWord.hits.length - 8} more` : '';
      return (
        `I don't have a material called "${ref}". "${perWord.word}" names ` +
        `${perWord.hits.length} of my ${total} materials — ${shown}${more}. ` +
        `Say one of those exactly; nothing was changed.`
      );
    }
  }
  return (
    `I don't know the finish "${ref}". I know ${total} materials, including ` +
    `${examples} — or name one exactly as the material picker shows it, ` +
    `like "Steel · Corten" or "Brick · Red Facing".`
  );
}

/** How many materials chat can actually name. DERIVED from the master, so it can
 *  never drift from the picker the founder is looking at. */
export function catalogueFinishCount(): number {
  return MATERIAL_CATALOG.length;
}
