/**
 * `story-model.ts` — the eight-slot element narrative, its provenance ledger,
 * and the completeness fraction.
 *
 * §IFC-TREE-STORY (L-8350..L-8358) · C23 (provenance & AI audit) · C01 §6 rule 6.
 *
 * ---------------------------------------------------------------------------
 * WHY "8" WHEN THE FOUNDER NAMED NINE LABELS
 * ---------------------------------------------------------------------------
 * The request lists NINE headings:
 *
 *   What it is · Why it exists · Where · Part of and made of · Feeds and fed by ·
 *   Who is responsible · State and history · If it fails · How we know
 *
 * …and then shows the fraction as **"2 of 8 answered"**. Nine labels, denominator
 * eight. ⭐ The reading this module implements is that **"How we know" is not a
 * ninth question — it is the PROVENANCE LEDGER OVER THE OTHER EIGHT.** It
 * answers "where did these answers come from", which is a different kind of
 * thing from "what is this object for", and it is the only one of the nine that
 * cannot be Unknown: it always has an answer, even when that answer is "nothing
 * is known yet, from any source".
 *
 * That reading makes the denominator come out at eight without discarding a
 * heading, and it puts provenance structurally at the centre rather than as
 * decoration — which is what C23 requires anyway.
 *
 * ⚠ THIS IS AN INFERENCE FROM A SCREENSHOT, NOT A MEASURED FACT. It is recorded
 * as L-8350 so the founder can overrule it in one line. If he intends nine
 * answerable slots, `ANSWERABLE_SLOTS` gains a row and the denominator moves;
 * nothing else changes.
 *
 * ---------------------------------------------------------------------------
 * THE PROVENANCE RULE (C23) — MERGE-BLOCKING
 * ---------------------------------------------------------------------------
 * ⛔ AN AI-INFERRED ANSWER IS NEVER PRESENTED AS A MODEL FACT. Every answer
 * carries its origin, and the origins are not interchangeable:
 *
 *   'model'    read out of the IFC file or the PRYZM store. A FACT about the
 *              building. Chip: "from the model".
 *   'mapping'  derived by the C25 §2 class authority. TRUE BY CONSTRUCTION, not
 *              authored by anyone. Chip: "from the PRYZM→IFC mapping".
 *   'user'     a person typed it into PRYZM. Authored, attributable.
 *   'ai'       INFERRED by a language model. Not a fact about the building; a
 *              guess about it. Chip: "AI-inferred — not from the model".
 *
 * A user's own API key (BYOK) does not upgrade 'ai' to 'model'. Who paid for
 * the inference has no bearing on whether it was measured.
 */

import type { IfcTreeElement } from './tree-source.js';

/** The eight answerable slots. Order is the render order. */
export const ANSWERABLE_SLOTS = [
  'what-it-is',
  'why-it-exists',
  'where',
  'part-of-and-made-of',
  'feeds-and-fed-by',
  'who-is-responsible',
  'state-and-history',
  'if-it-fails',
] as const;

export type SlotId = (typeof ANSWERABLE_SLOTS)[number];

export const SLOT_LABELS: Readonly<Record<SlotId, string>> = Object.freeze({
  'what-it-is': 'What it is',
  'why-it-exists': 'Why it exists',
  where: 'Where',
  'part-of-and-made-of': 'Part of and made of',
  'feeds-and-fed-by': 'Feeds and fed by',
  'who-is-responsible': 'Who is responsible',
  'state-and-history': 'State and history',
  'if-it-fails': 'If it fails',
});

export type ProvenanceKind = 'model' | 'mapping' | 'user' | 'ai';

export interface Provenance {
  readonly kind: ProvenanceKind;
  /** Short chip text, e.g. "1 from the model". */
  readonly chip: string;
  /** Where exactly, so a claim can be checked. e.g. "Pset_WallCommon.FireRating". */
  readonly detail?: string;
}

export const PROVENANCE_CHIP: Readonly<Record<ProvenanceKind, string>> = Object.freeze({
  model: 'from the model',
  mapping: 'from the PRYZM→IFC mapping',
  user: 'authored in PRYZM',
  ai: 'AI-inferred — not from the model',
});

export type Slot =
  | {
      readonly id: SlotId;
      readonly label: string;
      readonly state: 'answered';
      readonly text: string;
      /** One or more sources. Multiple provenances is normal and is shown. */
      readonly provenance: readonly Provenance[];
    }
  | {
      readonly id: SlotId;
      readonly label: string;
      readonly state: 'unknown';
      /**
       * ⭐ WHY it is unknown, distinguished. "The model does not carry this" and
       * "PRYZM does not read this" are different facts, and the Ask/Send
       * affordance is only honest for the first.
       */
      readonly reason: 'not-in-model' | 'not-extracted' | 'needs-judgement';
      readonly note: string;
    };

export interface Completeness {
  /** Slots with any answer, of any provenance. */
  readonly answered: number;
  /** Always 8 (see the header). */
  readonly total: number;
  /** Slots grounded in the model or the mapping — NOT AI. The honest core. */
  readonly grounded: number;
  /** Slots whose only answer is AI-inferred. Surfaced, never hidden in `answered`. */
  readonly aiOnly: number;
  /** "2 of 8 answered" */
  readonly headline: string;
}

export interface ElementStory {
  readonly elementId: string;
  readonly name: string;
  /** "IfcWall · Level 2" — the subtitle under the name. */
  readonly classAndContainer: string;
  readonly oneLine: string;
  readonly slots: readonly Slot[];
  readonly completeness: Completeness;
  /** The ninth heading — the ledger over the other eight. Never "unknown". */
  readonly howWeKnow: HowWeKnow;
}

export interface HowWeKnow {
  readonly byProvenance: Readonly<Record<ProvenanceKind, number>>;
  /** A sentence a human can act on. */
  readonly summary: string;
}

// ---------------------------------------------------------------------------

function answeredSlot(
  id: SlotId,
  text: string,
  provenance: readonly Provenance[],
): Slot {
  return { id, label: SLOT_LABELS[id], state: 'answered', text, provenance };
}

function unknownSlot(
  id: SlotId,
  reason: Extract<Slot, { state: 'unknown' }>['reason'],
  note: string,
): Slot {
  return { id, label: SLOT_LABELS[id], state: 'unknown', reason, note };
}

/**
 * Build the story for one element FROM THE MODEL ONLY.
 *
 * ⭐ This function NEVER calls AI and never fabricates. Every slot it fills is
 * traceable to a field that was actually read. Slots it cannot ground are left
 * `unknown` WITH A REASON, which is what the Ask/Send affordance then acts on.
 * AI answers are merged in afterwards by `withAiAnswers`, which stamps them
 * 'ai' and cannot stamp anything else.
 */
export function buildElementStory(el: IfcTreeElement): ElementStory {
  const slots: Slot[] = [];

  // 1 — What it is. Grounded whenever the class resolves.
  if (el.ifcClass.status === 'mapped') {
    const isNative = el.origin === 'native';
    slots.push(
      answeredSlot(
        'what-it-is',
        `${el.name} — ${el.ifcClass.ifcClass}${el.ifcClass.predefinedType ? ` (${el.ifcClass.predefinedType})` : ''}`,
        [
          isNative
            ? {
                kind: 'mapping',
                chip: PROVENANCE_CHIP.mapping,
                detail: `C25 §2 via ${el.ifcClass.authority}`,
              }
            : { kind: 'model', chip: PROVENANCE_CHIP.model, detail: 'IFC class in the imported file' },
        ],
      ),
    );
  } else {
    slots.push(
      unknownSlot(
        'what-it-is',
        'not-in-model',
        el.ifcClass.reason === 'not-a-product'
          ? `'${el.name}' is not an IFC product (it is a view, sheet or similar). It has no IFC class by design.`
          : `'${el.name}' has no ratified IFC class — C25 §2 has no row for its family. This is a gap awaiting a decision, not a missing value.`,
      ),
    );
  }

  // 2 — Why it exists. NOT derivable from IFC. Requires design intent.
  slots.push(
    unknownSlot(
      'why-it-exists',
      'needs-judgement',
      'Design intent is not carried by IFC. No field in the model answers this; it has to be authored or asked.',
    ),
  );

  // 3 — Where. Grounded by the spatial chain.
  if (el.spatial.length > 0) {
    slots.push(
      answeredSlot('where', el.spatial.map((r) => r.name).join(' → '), [
        { kind: 'model', chip: PROVENANCE_CHIP.model, detail: 'IFC spatial containment' },
      ]),
    );
  } else if (el.storey.kind === 'authored') {
    slots.push(
      answeredSlot('where', el.storey.value, [
        { kind: 'model', chip: PROVENANCE_CHIP.model, detail: 'storey assignment' },
      ]),
    );
  } else {
    slots.push(
      unknownSlot(
        'where',
        el.storey.kind === 'not-extracted' ? 'not-extracted' : 'not-in-model',
        el.storey.kind === 'not-extracted'
          ? 'Spatial containment is present in the source but not extracted by PRYZM.'
          : 'This element is not assigned to any spatial container in the model.',
      ),
    );
  }

  // 4 — Part of and made of. Material half is often the honest gap.
  if (el.material.kind === 'authored') {
    slots.push(
      answeredSlot('part-of-and-made-of', `Material: ${el.material.value}`, [
        { kind: 'model', chip: PROVENANCE_CHIP.model, detail: 'material assignment' },
      ]),
    );
  } else {
    slots.push(
      unknownSlot(
        'part-of-and-made-of',
        el.material.kind === 'not-extracted' ? 'not-extracted' : 'not-in-model',
        el.material.kind === 'not-extracted'
          ? 'Material is present in the source but per-element assignment is not yet extracted (data-only parse).'
          : 'Material — not authored on this element.',
      ),
    );
  }

  // 5 — Feeds and fed by. IfcSystem membership; PRYZM has none.
  if (el.system.kind === 'authored') {
    slots.push(
      answeredSlot('feeds-and-fed-by', el.system.value, [
        { kind: 'model', chip: PROVENANCE_CHIP.model, detail: 'IfcSystem membership' },
      ]),
    );
  } else {
    slots.push(
      unknownSlot(
        'feeds-and-fed-by',
        el.system.kind === 'not-extracted' ? 'not-extracted' : 'not-in-model',
        el.system.kind === 'not-extracted'
          ? 'System membership is not extracted from imported IFC.'
          : 'No system authored on this element (or system extraction is not yet enabled).',
      ),
    );
  }

  // 6 — Who is responsible. IfcOwnerHistory. Measured ABSENT in PRYZM's export.
  slots.push(
    unknownSlot(
      'who-is-responsible',
      'not-in-model',
      'No responsible party on this element. IfcOwnerHistory is null on every entity except IfcProject in the export path the app runs.',
    ),
  );

  // 7 — State and history. Pset_*Common.Status, when present.
  const status = findPsetValue(el, 'Status');
  if (status !== null) {
    slots.push(
      answeredSlot('state-and-history', `Status: ${String(status)}`, [
        { kind: 'model', chip: PROVENANCE_CHIP.model, detail: 'Pset Status property' },
      ]),
    );
  } else {
    slots.push(
      unknownSlot(
        'state-and-history',
        'not-in-model',
        'No Status property on this element, and PRYZM keeps no per-element change history that reaches IFC.',
      ),
    );
  }

  // 8 — If it fails. Fire/acoustic/load-bearing ratings, when present.
  const ratings = ['FireRating', 'AcousticRating', 'LoadBearing', 'Combustible']
    .map((k) => [k, findPsetValue(el, k)] as const)
    .filter(([, v]) => v !== null);
  if (ratings.length > 0) {
    slots.push(
      answeredSlot(
        'if-it-fails',
        ratings.map(([k, v]) => `${k}: ${String(v)}`).join(' · '),
        [
          {
            kind: 'model',
            chip: `${ratings.length} from the model`,
            detail: ratings.map(([k]) => k).join(', '),
          },
        ],
      ),
    );
  } else {
    slots.push(
      unknownSlot(
        'if-it-fails',
        'not-in-model',
        'No fire, acoustic or load-bearing rating is authored on this element.',
      ),
    );
  }

  return finalise(el, slots);
}

function findPsetValue(el: IfcTreeElement, prop: string): string | number | boolean | null {
  for (const props of Object.values(el.psets)) {
    if (prop in props) {
      const v = props[prop];
      if (v !== null && v !== undefined && v !== '') return v;
    }
  }
  return null;
}

function finalise(el: IfcTreeElement, slots: readonly Slot[]): ElementStory {
  const byProvenance: Record<ProvenanceKind, number> = { model: 0, mapping: 0, user: 0, ai: 0 };
  let answered = 0;
  let grounded = 0;
  let aiOnly = 0;

  for (const s of slots) {
    if (s.state !== 'answered') continue;
    answered++;
    const kinds = new Set(s.provenance.map((p) => p.kind));
    for (const k of kinds) byProvenance[k]++;
    if (kinds.has('model') || kinds.has('mapping') || kinds.has('user')) grounded++;
    else if (kinds.has('ai')) aiOnly++;
  }

  const total = ANSWERABLE_SLOTS.length;
  const container =
    el.spatial.length > 0
      ? el.spatial[el.spatial.length - 1]!.name
      : el.storey.kind === 'authored'
        ? el.storey.value
        : 'no container';
  const cls = el.ifcClass.status === 'mapped' ? el.ifcClass.ifcClass : 'Unmapped';

  return {
    elementId: el.id,
    name: el.name,
    classAndContainer: `${cls} · ${container}`,
    oneLine:
      el.ifcClass.status === 'mapped'
        ? `A ${cls} in ${container}.`
        : `${el.name} — no ratified IFC class. See "What it is".`,
    slots,
    completeness: {
      answered,
      total,
      grounded,
      aiOnly,
      headline: `${answered} of ${total} answered`,
    },
    howWeKnow: {
      byProvenance,
      summary: summarise(byProvenance, answered, total, aiOnly),
    },
  };
}

function summarise(
  by: Readonly<Record<ProvenanceKind, number>>,
  answered: number,
  total: number,
  aiOnly: number,
): string {
  if (answered === 0) {
    return `Nothing is known about this element from any source. All ${total} questions are open.`;
  }
  const parts: string[] = [];
  if (by.model > 0) parts.push(`${by.model} from the model`);
  if (by.mapping > 0) parts.push(`${by.mapping} from the PRYZM→IFC mapping`);
  if (by.user > 0) parts.push(`${by.user} authored in PRYZM`);
  if (by.ai > 0) parts.push(`${by.ai} AI-inferred`);
  const tail =
    aiOnly > 0
      ? ` ⚠ ${aiOnly} ${aiOnly === 1 ? 'answer rests' : 'answers rest'} on AI inference alone and ${aiOnly === 1 ? 'is' : 'are'} not a fact about the building.`
      : '';
  return `${parts.join(', ')}.${tail}`;
}

/**
 * Merge AI answers into a story.
 *
 * ⛔ THE ONLY WAY AN AI ANSWER ENTERS A STORY, and it CANNOT stamp any
 * provenance but 'ai'. There is deliberately no parameter to override that:
 * making it impossible to mislabel is stronger than remembering not to.
 */
export function withAiAnswers(
  story: ElementStory,
  answers: ReadonlyMap<SlotId, string>,
): ElementStory {
  if (answers.size === 0) return story;
  const merged = story.slots.map((s): Slot => {
    const a = answers.get(s.id);
    if (!a || s.state === 'answered') return s;
    return answeredSlot(s.id, a, [{ kind: 'ai', chip: PROVENANCE_CHIP.ai }]);
  });
  return finaliseFromStory(story, merged);
}

function finaliseFromStory(prev: ElementStory, slots: readonly Slot[]): ElementStory {
  const byProvenance: Record<ProvenanceKind, number> = { model: 0, mapping: 0, user: 0, ai: 0 };
  let answered = 0;
  let grounded = 0;
  let aiOnly = 0;
  for (const s of slots) {
    if (s.state !== 'answered') continue;
    answered++;
    const kinds = new Set(s.provenance.map((p) => p.kind));
    for (const k of kinds) byProvenance[k]++;
    if (kinds.has('model') || kinds.has('mapping') || kinds.has('user')) grounded++;
    else if (kinds.has('ai')) aiOnly++;
  }
  const total = ANSWERABLE_SLOTS.length;
  return {
    ...prev,
    slots,
    completeness: { answered, total, grounded, aiOnly, headline: `${answered} of ${total} answered` },
    howWeKnow: { byProvenance, summary: summarise(byProvenance, answered, total, aiOnly) },
  };
}

/** Slots an "Ask AI" run would target — unknown, and not merely unextracted. */
export function openQuestions(story: ElementStory): readonly SlotId[] {
  return story.slots
    .filter((s): s is Extract<Slot, { state: 'unknown' }> => s.state === 'unknown')
    .filter((s) => s.reason !== 'not-extracted')
    .map((s) => s.id);
}
