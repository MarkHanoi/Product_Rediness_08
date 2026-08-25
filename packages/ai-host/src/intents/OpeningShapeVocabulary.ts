// @pryzm/ai-host — OpeningShapeVocabulary (§CHAT-OPENING-SHAPE, L-10940)
// =============================================================================
//
// ⭐ THE FOUNDER TYPED **"change all windows to segmental type"** AND WAS TOLD:
//
//     "There is no window type called 'segmental type' in this project. The
//      window types here are: Single Pane (Default), Timber Casement, …"
//
// That refusal is FALSE, and it is false in the most expensive way available:
// it names one axis's inventory and implies the inventory is the whole
// language. **"Segmental" is not a window TYPE. It is an opening SHAPE**, and
// the shape axis has been fully implemented since L-1200/L-1250 —
// `OpeningProfileKind` in `@pryzm/geometry-wall`, four values, family-aware,
// with a live edit route (`UpdateWindowParameterCommand`, commit 5e14c4de) the
// founder himself reached through the mode bar: *"via UI is possible"*.
//
// So the capability existed, the vocabulary did not. This module is the
// vocabulary — the SHAPE axis's language half, the exact counterpart of
// `colorRef.ts` for the colour axis.
//
// ── WHY A TOKEN VOCABULARY AND NOT A PHRASE LIST ────────────────────────────
//
// The founder's standing direction is **open language, never a narrowed
// vocabulary**: a capability that answers only the sentences someone remembered
// to type into a table is a capability that refuses most of its own users. A
// phrase list ("segmental" / "segmental arch" / "shallow arch" / …) is exactly
// that table, and it fails on the first synonym nobody thought of, on word
// order, and on every noise word a real sentence carries.
//
// What ships instead is a **token vocabulary with composition rules**:
//
//   1. NOISE is stripped by class, not by enumeration of sentences — the AXIS
//      NOUNS a user appends to any adjective ("type", "profile", "shape",
//      "head", "opening", "style"), the element nouns, and the determiners.
//   2. What remains is scored against DISCRIMINATOR TOKENS, each carrying the
//      kind it argues for and how SPECIFIC it is. Order does not matter, extra
//      words do not matter, and a token appearing anywhere in the phrase counts.
//   3. Two composition rules settle the only real ambiguities in the axis:
//      "round arch" is a ROUND ARCH (not a circle) and "segmental arch" is a
//      SEGMENTAL arch (not a generic one), because a MODIFIER beats the generic
//      noun it modifies.
//   4. A phrase that argues equally for two kinds resolves to NULL. Guessing
//      between two shapes on a mass edit is the §CONTEXT-DATA-HONESTY failure
//      this package exists to prevent; the caller refuses and lists the four.
//
// ── ⛔ NOTHING IS TRANSCRIBED ───────────────────────────────────────────────
//
// The kinds, their labels and the per-family legality all come from
// `@pryzm/geometry-wall` — the same `OPENING_PROFILE_KINDS`,
// `OPENING_PROFILE_LABELS` and `openingProfilesFor` the door mode bar, the
// window mode bar and the properties panel read. `OpeningProfile.ts` declares
// itself the ONE place those live precisely so a fifth surface cannot invent a
// fifth spelling (C84 EI-9), and the chat is that fifth surface. The
// `shapeVocabularyCoversEveryKind` test pins the equivalence so a value added
// there cannot ship mute here.
//
// ── ⚠ THE DOOR RULE IS GEOMETRY, AND IT IS NOT ENFORCED HERE ────────────────
//
// `openingProfilesFor('door')` excludes `circular` — a door is floor-reaching,
// its opening is a NOTCH rather than a closed hole, and a circle has no jamb
// feet for the notch walk to traverse (OpeningProfile.ts §OPENING-PROFILE-BY-
// FAMILY). This module RESOLVES "circular" for a door anyway, on purpose: the
// resolver must know what the user meant in order to refuse it BY NAME with the
// rule. Silently returning null here would produce "I don't know that shape"
// over a shape the user can see on the window bar — a miss wearing a
// vocabulary gap's clothes. `openingShapeLegalFor` is the gate.
//
// PURE — tables and string work. No DOM, no stores, no I/O; the same contract
// as every other module in `intents/`.

import {
  OPENING_PROFILE_KINDS,
  OPENING_PROFILE_LABELS,
  openingProfilesFor,
  type OpeningProfileKind,
  // §OUTLINE80 (D10) — the preset rings a NAMED shape word resolves to. The vocabulary never
  // invents a ring: it names one of these four, exactly as `resolveOpeningShapeRef` names one of
  // the four built-in kinds via `OPENING_PROFILE_LABELS`.
  OPENING_OUTLINE_PRESET_LABELS,
  type OpeningOutlinePresetId,
} from '@pryzm/geometry-wall';

/** The families that can host an opening profile — geometry-wall's own split. */
export type OpeningFamily = 'door' | 'window';

/**
 * A discriminator token: one word that argues for one kind.
 *
 * `specificity` breaks ties in favour of the NARROWER claim. "segmental" can
 * only mean a segmental arch; "arch" could mean either arched kind; so
 * "segmental arch" resolves to segmental rather than being ambiguous. That is
 * rule 3 above, expressed as data rather than as an `if` per phrase.
 */
interface ShapeToken {
  readonly kind: OpeningProfileKind;
  /** 2 = names exactly one kind. 1 = names a family of kinds. */
  readonly specificity: 1 | 2;
  /**
   * §OUTLINE80 (D10) — present ONLY for a NAMED PRESET word ("triangular", "gothic", …). Such a
   * token still resolves to `kind: 'custom'` (the axis value that gets WRITTEN), but carries WHICH
   * preset ring the caller must apply. A bare "custom"/"freeform" token has no `presetId` — it
   * resolves so the door-family / no-ring refusal can name it (the same reason `resolveOpeningShapeRef`
   * already resolves "circular" for a door), but there is no ring for it to hand back.
   */
  readonly presetId?: OpeningOutlinePresetId;
}

/**
 * ⛔ ADJECTIVES, NOT SENTENCES. Every entry here is a word an architect uses
 * for the SHAPE OF A HOLE. None of them is a phrase, none carries a
 * preposition, and none encodes a sentence shape — the grammar upstream owns
 * that. Adding a synonym is one row; adding a sentence would be a defect.
 */
const SHAPE_TOKENS: Readonly<Record<string, ShapeToken>> = Object.freeze({
  // ── rectangular ───────────────────────────────────────────────────────────
  rectangular: { kind: 'rectangular', specificity: 2 },
  rectangle: { kind: 'rectangular', specificity: 2 },
  rectilinear: { kind: 'rectangular', specificity: 2 },
  square: { kind: 'rectangular', specificity: 1 },
  squared: { kind: 'rectangular', specificity: 1 },
  flat: { kind: 'rectangular', specificity: 1 },
  straight: { kind: 'rectangular', specificity: 1 },
  plain: { kind: 'rectangular', specificity: 1 },
  ordinary: { kind: 'rectangular', specificity: 1 },
  normal: { kind: 'rectangular', specificity: 1 },
  standard: { kind: 'rectangular', specificity: 1 },
  default: { kind: 'rectangular', specificity: 1 },
  box: { kind: 'rectangular', specificity: 1 },
  boxy: { kind: 'rectangular', specificity: 1 },
  orthogonal: { kind: 'rectangular', specificity: 1 },

  // ── round-arch (UI label "Arched") ────────────────────────────────────────
  arch: { kind: 'round-arch', specificity: 1 },
  arched: { kind: 'round-arch', specificity: 1 },
  arches: { kind: 'round-arch', specificity: 1 },
  archway: { kind: 'round-arch', specificity: 1 },
  semicircular: { kind: 'round-arch', specificity: 2 },
  semicircle: { kind: 'round-arch', specificity: 2 },
  semicirculars: { kind: 'round-arch', specificity: 2 },
  hemispherical: { kind: 'round-arch', specificity: 2 },
  roman: { kind: 'round-arch', specificity: 2 },
  romanesque: { kind: 'round-arch', specificity: 2 },
  barrel: { kind: 'round-arch', specificity: 2 },
  vaulted: { kind: 'round-arch', specificity: 1 },
  curved: { kind: 'round-arch', specificity: 1 },
  domed: { kind: 'round-arch', specificity: 1 },

  // ── segmental-arch (UI label "Segmental") ─────────────────────────────────
  segmental: { kind: 'segmental-arch', specificity: 2 },
  segment: { kind: 'segmental-arch', specificity: 2 },
  segmented: { kind: 'segmental-arch', specificity: 2 },
  shallow: { kind: 'segmental-arch', specificity: 2 },
  jack: { kind: 'segmental-arch', specificity: 2 },
  cambered: { kind: 'segmental-arch', specificity: 2 },
  camber: { kind: 'segmental-arch', specificity: 2 },

  // ── circular ──────────────────────────────────────────────────────────────
  circular: { kind: 'circular', specificity: 2 },
  circle: { kind: 'circular', specificity: 2 },
  round: { kind: 'circular', specificity: 1 },
  oculus: { kind: 'circular', specificity: 2 },
  oculi: { kind: 'circular', specificity: 2 },
  bullseye: { kind: 'circular', specificity: 2 },
  porthole: { kind: 'circular', specificity: 2 },
  rose: { kind: 'circular', specificity: 2 },
  disc: { kind: 'circular', specificity: 2 },
  disk: { kind: 'circular', specificity: 2 },

  // ── custom (bare) ─────────────────────────────────────────────────────────
  // §OUTLINE80 (D10) — resolves so the family gate / no-ring refusal can name it, exactly as
  // "circular" already resolves for a door it is illegal on. NEVER settable by adjective alone —
  // see `openingShapeChatRefusalFor`.
  custom: { kind: 'custom', specificity: 2 },
  freeform: { kind: 'custom', specificity: 2 },

  // ── custom PRESETS — D7/D10: named rings, claimable, zero new resolver arms ────────────────
  triangular: { kind: 'custom', specificity: 2, presetId: 'triangle' },
  triangle: { kind: 'custom', specificity: 2, presetId: 'triangle' },
  trapezoid: { kind: 'custom', specificity: 2, presetId: 'trapezoid' },
  trapezoidal: { kind: 'custom', specificity: 2, presetId: 'trapezoid' },
  gable: { kind: 'custom', specificity: 2, presetId: 'gable' },
  pentagon: { kind: 'custom', specificity: 2, presetId: 'gable' },
  pentagonal: { kind: 'custom', specificity: 2, presetId: 'gable' },
  gothic: { kind: 'custom', specificity: 2, presetId: 'gothic' },
});

/**
 * Words that carry no shape meaning: the AXIS NOUNS a user hangs an adjective
 * on, the element nouns, the determiners and the plural/copula noise.
 *
 * ⭐ This is what makes "segmental type", "segmental arch profile", "the
 * segmental one" and "segmental-headed windows" all one input. The founder's
 * literal sentence ended in "type" — a word that belongs to the axis he was
 * NOT on — and that single trailing noun is the whole reason the shape axis was
 * never consulted.
 */
const NOISE_WORDS: ReadonlySet<string> = new Set([
  // axis nouns
  'type', 'types', 'typed',
  'profile', 'profiles', 'profiled',
  'shape', 'shapes', 'shaped',
  'head', 'heads', 'headed',
  'top', 'tops', 'topped',
  'style', 'styles', 'styled',
  'form', 'forms',
  'kind', 'kinds',
  'opening', 'openings',
  'void', 'voids',
  'aperture', 'apertures',
  // element nouns
  'window', 'windows', 'door', 'doors', 'doorway', 'doorways',
  // determiners / copulas
  'a', 'an', 'the', 'to', 'into', 'as', 'be', 'is', 'are', 'them', 'they',
  'it', 'one', 'ones', 'all', 'every', 'each', 'their',
]);

/** Normalise for token work: lowercase, quotes off, hyphens/underscores are
 *  separators, whitespace collapsed. "Semi-circular" and "semi circular" are
 *  the same input; "semicircular" is caught by the glue pass below. */
function normalise(ref: string): string {
  return ref
    .toLowerCase()
    .replace(/["'`]/g, '')
    .replace(/[-_/]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * "semi circular" → "semicircular", "bulls eye" → "bullseye", "half round" →
 * "semicircular". A handful of English compounds people split; folded BEFORE
 * tokenising so the token table stays a table of single words.
 */
const COMPOUND_GLUE: readonly (readonly [RegExp, string])[] = [
  [/\bsemi (circular|circle)\b/g, 'semicircular'],
  [/\bhalf (round|circle|circular)\b/g, 'semicircular'],
  [/\bbulls? eye\b/g, 'bullseye'],
  [/\bport hole\b/g, 'porthole'],
  [/\bfull (arch|arched)\b/g, 'semicircular'],
  [/\bsquare head(ed)?\b/g, 'square'],
  [/\bflat head(ed)?\b/g, 'flat'],
  // §OUTLINE80 (D10) — "free form" / "free-form" (the hyphen is already a space by `normalise`).
  [/\bfree form\b/g, 'freeform'],
];

function glue(text: string): string {
  let out = text;
  for (const [re, to] of COMPOUND_GLUE) out = out.replace(re, to);
  return out;
}

/** A shape reference the user made, resolved. */
export interface ResolvedOpeningShape {
  readonly kind: OpeningProfileKind;
  /** The user-facing name — geometry-wall's own label, never re-spelled. */
  readonly label: string;
  /** §OUTLINE80 (D10) — present ONLY when a NAMED PRESET resolved (see {@link ShapeToken}). */
  readonly presetId?: OpeningOutlinePresetId;
}

/**
 * ⭐ THE AXIS PROBE. Resolve any phrasing of a shape reference to its kind, or
 * null when the phrase argues for no kind — or for two of them equally.
 *
 * ⛔ Returning null for an AMBIGUOUS phrase is deliberate and is not a gap. On
 * a mass edit ("change all 85 windows to …") a coin-flip between two shapes is
 * strictly worse than a refusal that lists four names: the user can retype a
 * sentence, but cannot see a wrong shape they were not told about.
 */
export function resolveOpeningShapeRef(ref: string): ResolvedOpeningShape | null {
  const words = glue(normalise(ref)).split(' ').filter((w) => w.length > 0 && !NOISE_WORDS.has(w));
  if (words.length === 0) return null;

  // Score: the best specificity each kind was argued for at, and how many
  // distinct tokens argued for it.
  const best = new Map<OpeningProfileKind, { specificity: 1 | 2; hits: number; presetId?: OpeningOutlinePresetId }>();
  let unknownWords = 0;
  for (const w of words) {
    const tok = SHAPE_TOKENS[w];
    if (tok === undefined) { unknownWords += 1; continue; }
    const prev = best.get(tok.kind);
    // §OUTLINE80 (D10) — a NAMED preset always wins the slot over a bare "custom" token co-
    // occurring in the same phrase ("custom triangular" names a real ring; the bare word does
    // not). Two DIFFERENT presets in one phrase is not a sentence anyone types, so last-wins is
    // an acceptable, simple tie-break rather than a case worth its own refusal.
    const presetId = tok.presetId ?? prev?.presetId;
    best.set(tok.kind, {
      specificity: prev === undefined ? tok.specificity : (Math.max(prev.specificity, tok.specificity) as 1 | 2),
      hits: (prev?.hits ?? 0) + 1,
      // `exactOptionalPropertyTypes` — omit the key entirely rather than set it to `undefined`.
      ...(presetId === undefined ? {} : { presetId }),
    });
  }
  if (best.size === 0) return null;

  // ⛔ A phrase MOSTLY made of words this axis does not know is not a shape
  // reference that happens to contain one — it is another axis's phrase with a
  // collision in it. "Timber Casement Round Top" must stay a TYPE name. One
  // stray word is tolerated (adjectives travel with nouns); a majority is not.
  if (unknownWords > words.length - unknownWords) return null;

  // Composition rule: a MODIFIER beats the generic noun it modifies. Specificity
  // 2 tokens name exactly one kind, so if any kind was argued at 2 and the
  // others only at 1, the specific one wins outright — "round arch" (round=1,
  // arch=1 … both generic) is settled by the explicit pair rule below, while
  // "segmental arch" (segmental=2, arch=1) is settled here.
  const maxSpec = Math.max(...[...best.values()].map((v) => v.specificity));
  const leaders = [...best.entries()].filter(([, v]) => v.specificity === maxSpec);

  if (leaders.length === 1) return described(leaders[0]![0], leaders[0]![1].presetId);

  // Two or more kinds argued at the same specificity. ONE English pair is
  // genuinely common and genuinely unambiguous to a reader: "round arch" —
  // `round` argues circular, `arch` argues round-arch, and every architect
  // means the ARCH. The arch wins because `round` is modifying it.
  const kinds = new Set(leaders.map(([k]) => k));
  if (kinds.has('circular') && kinds.has('round-arch')) return described('round-arch');
  // "flat arch" / "shallow flat head" — `flat` argues rectangular, but the
  // presence of an ARCH token means the user asked for an arch, and the flat
  // one is the segmental. Same modifier-beats-noun reading.
  if (kinds.has('rectangular') && kinds.has('round-arch')) return described('segmental-arch');

  // Anything else genuinely argues two ways. Refuse rather than guess.
  return null;
}

function described(kind: OpeningProfileKind, presetId?: OpeningOutlinePresetId): ResolvedOpeningShape {
  return presetId === undefined
    ? { kind, label: OPENING_PROFILE_LABELS[kind] }
    // §OUTLINE80 (D10) — a preset's user-facing label is ITS OWN name ("Triangular"), never the
    // bare axis label ("Custom") — the vocabulary's whole job here is to let the user say the
    // shape they mean and see that name reflected back.
    : { kind, label: OPENING_OUTLINE_PRESET_LABELS[presetId], presetId };
}

/** Every shape name this project offers a family, in the labels the mode bar
 *  and the properties panel already speak. For refusal copy. */
export function openingShapeNames(family?: OpeningFamily): readonly string[] {
  const kinds = family === undefined ? OPENING_PROFILE_KINDS : openingProfilesFor(family);
  return kinds.map((k) => OPENING_PROFILE_LABELS[k]);
}

/**
 * ⛔ THE FAMILY GATE — §OPENING-PROFILE-BY-FAMILY (L-1251). A door may not be
 * circular, and the reason is geometry rather than taste (see this file's
 * header and `openingProfilesFor`). Returns null when legal, or the refusal
 * text NAMING THE RULE when not — never a silent drop, per C74.
 */
export function openingShapeLegalFor(
  family: OpeningFamily,
  kind: OpeningProfileKind,
): string | null {
  if ((openingProfilesFor(family) as readonly string[]).includes(kind)) return null;
  return (
    `A ${family} cannot be ${OPENING_PROFILE_LABELS[kind].toLowerCase()}: a ${family} reaches the ` +
    `floor, so its opening is a notch in the wall rather than a closed hole, and a circle has no ` +
    `jambs at the floor for that notch to spring from. ` +
    `A ${family} can be ${joinNames(openingShapeNames(family))}. Nothing was changed.`
  );
}

/** "A, B or C" — refusal copy joins names the same way everywhere. */
export function joinNames(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]!}`;
}

/**
 * §OUTLINE80 (D10) — THE CHAT-SPECIFIC GATE, composed IN FRONT of {@link openingShapeLegalFor}.
 *
 * `'custom'` is a legal WINDOW value (`openingProfilesFor('window')` includes it) but is NOT
 * something chat can set by adjective — a free-form outline is DRAWN, not named. A NAMED PRESET
 * ("triangular", "gothic", …) is different: it resolves to a REAL ring
 * (`OpeningOutlinePresetId`), so it is exactly as settable as any other named shape.
 *
 * ⛔ Every caller that resolves a shape through this axis for a CHAT-DRIVEN write MUST call this
 * function INSTEAD OF (not in addition to, though it delegates internally) `openingShapeLegalFor` —
 * calling the family gate alone would let "make the windows custom" through, since `'custom'` IS a
 * legal window value.
 */
export function openingShapeChatRefusalFor(
  family: OpeningFamily,
  resolved: ResolvedOpeningShape,
): string | null {
  const familyRefusal = openingShapeLegalFor(family, resolved.kind);
  if (familyRefusal) return familyRefusal;
  if (resolved.kind === 'custom' && resolved.presetId === undefined) {
    return (
      `"Custom" is not a shape I can set directly — a free-form outline is DRAWN, not named. ` +
      `Open the window type editor's Elevation outline tool to draw one, or ask for a named preset ` +
      `(${joinNames(Object.values(OPENING_OUTLINE_PRESET_LABELS))}), which I can apply. ` +
      `Nothing was changed.`
    );
  }
  return null;
}

/**
 * ⚠ §SEGMENTAL-RISE-IS-DECLARED (L-1252, restated here so the chat cannot
 * quietly promote it). `SEGMENTAL_RISE_RATIO` is a DECLARED constant —
 * `WindowModePicker.ts:37-40` records that no authored source has been asked
 * for, and NOBODY HAS BEEN ASKED. Setting a segmental arch from chat does not
 * measure the rise and must not claim to: this note is what a summary or a
 * contract citation quotes instead of inventing provenance.
 */
export const SEGMENTAL_RISE_PROVENANCE =
  'declared, not measured — the segmental rise ratio has no authored source yet';
