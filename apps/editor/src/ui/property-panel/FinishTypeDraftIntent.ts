/**
 * FinishTypeDraftIntent — §OPENING-PANEL-CHAT (L-9630 … L-9639)
 * =============================================================
 *
 * The DETERMINISTIC, ZERO-TOKEN understanding layer for the window/door type
 * editor's chat: plain English in, a list of edits to the draft out, or a NAMED
 * refusal. No network, no model, no `any`.
 *
 * ── THE FOUNDER'S ASK, AND THE HALF OF IT THAT IS THE ARCHITECTURE ──────────
 *
 * *"enable AI chat while in this new creation panel — the user could either do it
 * via UI or chat … and all parameters should be accessible via RAC / AI — this
 * should be architecturally sound implementation."*
 *
 * ⭐ "ALL PARAMETERS" IS THE LOAD-BEARING WORD, AND IT IS WHY THIS FILE CONTAINS
 * NO LIST OF PARAMETERS. The vocabulary is DERIVED from the family's
 * `ElementTypeAuthoring.finishEditor` declaration — the same declaration the
 * dialog renders its controls from. A field is chat-reachable because it is
 * UI-reachable, by construction. Add `sashThickness` to the registry tomorrow and
 * it is authorable by chat that same commit, with no edit here.
 *
 * ⛔ A hand-written table of the eight window dimensions would have been shorter
 * and would have been the defect: two enumerations of one vocabulary, drifting
 * from the first field anyone adds. C65 §3.5's rule — *specialise in the
 * DECLARATION, never with a family branch in the editor* — applies to the chat
 * exactly as it applies to the controls.
 *
 * ── WHAT IT DOES NOT MINT (C100 §1.1, C68 §5.d) ─────────────────────────────
 *
 *  - **No second material matcher.** A material reference goes through
 *    `suggestMaterialForLegacyName` — the ONE ladder already owned by
 *    `FinishMaterialSelect.ts`, the module that owns the picker. Its
 *    conservatism is inherited deliberately: "Steel Frame" resolving to nothing
 *    is the CORRECT answer, and this file reports the miss rather than reaching
 *    for a near-neighbour.
 *  - **No second field matcher.** Field resolution is `resolveCatalogueRef` from
 *    `@pryzm/command-registry` — the ladder ADR-0314 designates, run over an
 *    in-memory reader of the DECLARED fields. Ambiguity therefore behaves the way
 *    it behaves everywhere else in this repo: `entry: null` plus the candidate
 *    list, so the refusal can name both options. Never a coin-flip.
 *
 * ── THE ONE TABLE THAT IS AUTHORED HERE, AND WHY IT IS NOT A DUPLICATE ──────
 *
 * {@link MORPHOLOGY} maps English adjectives to the noun already present in the
 * declared vocabulary: `wide -> width`, `tall -> height`, `thick -> thickness`.
 * That is a LANGUAGE layer over the declaration, not a rival to it — the same
 * shape `finishRef.ts` states for its canonical-nickname arm. ⛔ Its values are
 * WORDS, never numbers and never keys: it can only ever help reach a field the
 * registry already declares, and it cannot invent one.
 *
 * ── CONTRACT ────────────────────────────────────────────────────────────────
 *  - **C03 / P6** — PURE. This module writes nothing, dispatches nothing and
 *    touches no store. It returns a description of the change; the caller applies
 *    it to the draft it already owns, and the existing Create path dispatches the
 *    one command.
 *  - **C16 §5.1 CA-21** — nothing here reports success. Success is what the store
 *    read-back in `FinishTypeAuthoringActions.onSave` says it is.
 *  - **C100 §5 / §CONTEXT-DATA-HONESTY** — an inferred material is returned as
 *    `inferred: true` and the caller says so. Inference that passes for
 *    resolution is the same lie one layer up.
 *  - **§RAC-FREEFORM-PLUS-HARD-STOPPERS** — a value outside a declared range is
 *    refused with BOTH numbers (what was asked, what is allowed), never clamped
 *    silently into something the user did not type.
 */

import {
    resolveCatalogueRef,
    type CatalogueEntry,
} from '@pryzm/command-registry';
import { suggestMaterialForLegacyName, finishMaterialHex, finishMaterialLabel } from '@pryzm/geometry-door';
import type { ElementTypeAuthoring } from './ElementTypeAuthoringRegistry';

// ═════════════════════════════════════════════════════════════════════════════
// The derived vocabulary
// ═════════════════════════════════════════════════════════════════════════════

/** What kind of thing a field holds — which decides how a value is read for it. */
export type DraftFieldKind = 'length' | 'count' | 'fraction' | 'material' | 'text';

/**
 * One authorable field, derived from the family's declaration.
 *
 * `name` is the WORD BAG the resolver matches against — the human label plus the
 * record key split at its camel humps, so both *"mullion"* and *"column divider
 * thickness"* reach `columnDividerThickness`. `label` is what a human is shown.
 */
export interface DraftField extends CatalogueEntry {
    readonly id: string;
    readonly name: string;
    readonly label: string;
    readonly kind: DraftFieldKind;
    /** Where the value is written: which of the draft's shapes owns it. */
    readonly target: 'dimension' | 'grid' | 'finish' | 'glazing' | 'identity';
    readonly min?: number;
    readonly max?: number;
}

/** `columnDividerThickness` -> "column divider thickness". */
function splitCamel(key: string): string {
    return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
}

/**
 * The chat's whole vocabulary for a family, derived from its declaration.
 *
 * ⚠ Order is not significant — `resolveCatalogueRef` is a ladder over the SET,
 * not a first-match scan, and ambiguity is reported rather than broken by
 * position. That is precisely why the declared order may change without changing
 * what the chat understands.
 */
export function draftFieldsFor(authoring: ElementTypeAuthoring): DraftField[] {
    const fe = authoring.finishEditor;
    const out: DraftField[] = [];

    out.push({ id: '__name__', name: 'name title called', label: 'Name', kind: 'text', target: 'identity' });
    out.push({ id: '__description__', name: 'description note', label: 'Description', kind: 'text', target: 'identity' });

    for (const slot of fe?.slots ?? []) {
        out.push({
            id: slot.key,
            name: `${slot.label} finish material`,
            label: `${slot.label} finish`,
            kind: 'material',
            target: 'finish',
        });
    }

    if (fe?.glazingOpacity) {
        out.push({
            id: 'glazingOpacity',
            name: 'glazing opacity glass',
            label: 'Glazing opacity',
            kind: 'fraction',
            target: 'glazing',
            min: 0,
            max: 1,
        });
    }

    for (const f of fe?.dimensions ?? []) {
        out.push({
            id: f.key,
            name: `${f.label} ${splitCamel(f.key)}`,
            label: f.label,
            kind: 'length',
            target: 'dimension',
            min: f.min,
            max: f.max,
        });
    }

    if (fe?.grid) {
        out.push({ id: fe.grid.columnsKey, name: 'columns column', label: 'Columns', kind: 'count', target: 'grid', min: 1, max: fe.grid.maxColumns });
        out.push({ id: fe.grid.rowsKey, name: 'rows row', label: 'Rows', kind: 'count', target: 'grid', min: 1, max: fe.grid.maxRows });
    }

    return out;
}

// ═════════════════════════════════════════════════════════════════════════════
// The language layer
// ═════════════════════════════════════════════════════════════════════════════

/**
 * English adjective -> the noun the DECLARATION already uses.
 *
 * ⛔ Every value here must be a word that appears in some declared label or key.
 * {@link morphologyIsGrounded} asserts exactly that against a live vocabulary, so
 * this table can never grow an entry that names a field the registry does not
 * declare — which is the only way it could become a rival vocabulary.
 */
const MORPHOLOGY: Readonly<Record<string, string>> = {
    wide: 'width',
    wider: 'width',
    tall: 'height',
    taller: 'height',
    high: 'height',
    deep: 'depth',
    deeper: 'depth',
    thick: 'thickness',
    thicker: 'thickness',
    opaque: 'opacity',
    transparent: 'opacity',
    // ⛔ "clear" is NOT here, though "clear glass" is idiomatic. It is also the word a
    // user reaches for to UNSET a field ("clear the height"), and a token that means
    // both a field and an operation cannot be resolved by either. The glazing case
    // keeps a first-class spelling — "glazing 0%" — so nothing is lost by refusing to
    // overload it.
    pane: 'columns',
    panes: 'columns',
};

/** Test/gate seam — every {@link MORPHOLOGY} value is a word some field declares. */
export function morphologyIsGrounded(fields: readonly DraftField[]): string[] {
    const declared = new Set<string>();
    for (const f of fields) for (const w of f.name.toLowerCase().split(/[^a-z0-9]+/)) if (w) declared.add(w);
    return Object.values(MORPHOLOGY).filter((v) => !declared.has(v));
}

/**
 * Filler that carries no field meaning. Stripped from the field phrase so
 * *"set the frame face to 5 cm please"* reduces to *"frame face"*.
 *
 * ⚠ NOT a synonym list and not a stopword list for matching — `resolveCatalogueRef`
 * has its own noise handling. This only removes IMPERATIVE scaffolding, which is a
 * property of the sentence rather than of the vocabulary.
 */
const FILLER = new Set([
    'set', 'make', 'change', 'use', 'give', 'put', 'let', 'have', 'want', 'need', 'please',
    'it', 'its', "it's", 'the', 'a', 'an', 'to', 'of', 'be', 'as', 'is', 'are', 'with',
    'and', 'for', 'on', 'at', 'in', 'this', 'that', 'them', 'i', 'we', 'you', 'my', 'our',
    'window', 'door', 'type', 'create', 'add', 'new', 'should', 'would', 'can', 'could',
    'about', 'around', 'roughly', 'exactly', 'just', 'only', 'now', 'then',
]);

// ═════════════════════════════════════════════════════════════════════════════
// The result
// ═════════════════════════════════════════════════════════════════════════════

/** One change to make to the draft. The caller applies it; this module never does. */
export interface DraftEdit {
    readonly field: DraftField;
    /** metres for `length`, an integer for `count`, 0..1 for `fraction`, a string otherwise. */
    readonly value: number | string | null;
    /** `null` value on a dimension means CLEAR IT BACK TO AUTO — never "set it to zero". */
    readonly clearsToAuto: boolean;
    /** For a material edit: the resolved master id and its label. */
    readonly materialId?: string;
    readonly materialLabel?: string;
    readonly materialHex?: string;
    /**
     * C100 §5 — TRUE when the material was reached by INFERENCE from the user's
     * words rather than by an exact library name. The caller must say so.
     */
    readonly inferred?: boolean;
    /** One line the chat can echo back, in the user's terms. */
    readonly said: string;
}

export type DraftResolution =
    | { readonly kind: 'edits'; readonly edits: readonly DraftEdit[] }
    | { readonly kind: 'commit' }
    | { readonly kind: 'describe' }
    /** Understood the field, refused the value. Both numbers are in `reason`. */
    | { readonly kind: 'refusal'; readonly reason: string; readonly options?: readonly string[] }
    /** Did not understand at all. `options` lists what IS authorable. */
    | { readonly kind: 'miss'; readonly reason: string; readonly options: readonly string[] };

// ═════════════════════════════════════════════════════════════════════════════
// Value reading
// ═════════════════════════════════════════════════════════════════════════════

const LENGTH_RE = /(-?\d+(?:\.\d+)?)\s*(mm|millimet(?:er|re)s?|cm|centimet(?:er|re)s?|m|met(?:er|re)s?)\b/;
const PERCENT_RE = /(-?\d+(?:\.\d+)?)\s*(?:%|percent|per cent)\b/;
const BARE_RE = /(-?\d+(?:\.\d+)?)/;

/** Convert a magnitude + unit to METRES. The one place a unit is interpreted. */
function toMetres(n: number, unit: string): number {
    if (unit.startsWith('mm') || unit.startsWith('milli')) return n / 1000;
    if (unit.startsWith('cm') || unit.startsWith('centi')) return n / 100;
    return n;
}

const CLEAR_WORDS = /\b(auto|automatic|inherit|inherited|default|standard|unset|clear|blank|reset)\b/;

/**
 * Naming is handled BEFORE the field ladder, not through it.
 *
 * ⚠ "call it Kitchen Casement" carries a free-text VALUE that is deliberately in
 * nobody's vocabulary — feeding it to a word-subset matcher asks for a field
 * called "kitchen casement", and the clause missed silently. A naming verb is a
 * property of the SENTENCE, so it is recognised as one rather than being made to
 * compete with the finish slots for the same words.
 */
const NAME_RE = /^\s*(?:please\s+)?(?:re)?(?:call(?:ed)?|nam(?:e|ed|ing)|title[d]?)\s+(?:it|this|the type)?\s*["']?(.+?)["']?\s*$/i;
const DESC_RE = /^\s*(?:description|describe(?: it)?|note)\s*:?\s*["']?(.+?)["']?\s*$/i;
const COMMIT_WORDS = /^(?:ok(?:ay)?[, ]*)?(?:go|do it|create(?: it| the type| this)?|save(?: it| this)?|make it|apply|confirm|done|finish|that's it|thats it)\.?$/;
const DESCRIBE_WORDS = /^(?:what (?:can (?:i|you) (?:do|change|set)|is authorable|are the (?:fields|parameters|options))|help|options|fields|parameters|list)\??$/;

// ═════════════════════════════════════════════════════════════════════════════
// The resolver
// ═════════════════════════════════════════════════════════════════════════════

/** Split a sentence into independent clauses. "2m wide and 3 columns" is two asks. */
function clauses(text: string): string[] {
    return text
        .split(/(?:,|;|\band\b|\bwith\b|\bplus\b|\bthen\b)/i)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

/**
 * Strip filler, value tokens and any clear-word, then apply the morphology layer.
 *
 * ⚠ The clear-words go FIRST and unconditionally. "width auto" must reduce to
 * "width" — leaving "auto" in the phrase makes the word-subset tier demand a field
 * whose name contains it, and no field ever will, so the whole utterance missed.
 */
function fieldPhrase(clause: string, valueSpan: string | null): string {
    let rest = clause;
    if (valueSpan) rest = rest.replace(valueSpan, ' ');
    rest = rest.replace(new RegExp(CLEAR_WORDS.source, 'gi'), ' ');
    const words = rest
        .toLowerCase()
        .replace(/[^a-z0-9'% ]+/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 0 && !FILLER.has(w) && !/^\d+(?:\.\d+)?$/.test(w))
        .map((w) => MORPHOLOGY[w] ?? w);
    return words.join(' ');
}

function humanRange(f: DraftField): string {
    if (f.kind === 'length') return `${f.min} m to ${f.max} m`;
    if (f.kind === 'fraction') return '0% to 100%';
    return `${f.min} to ${f.max}`;
}

/**
 * Understand ONE utterance against the family's declared vocabulary.
 *
 * ⛔ Returns a REFUSAL rather than a best guess whenever the field is ambiguous or
 * the value is out of the declared range, and the refusal carries the numbers and
 * the candidates. A silent clamp would make the dialog assert a dimension the user
 * never typed, which is the exact defect §OPENING-AUTO-IS-A-STATE exists to stop
 * one control down.
 */
export function resolveDraftUtterance(
    text: string,
    fields: readonly DraftField[],
): DraftResolution {
    const raw = text.trim();
    if (raw.length === 0) {
        return { kind: 'miss', reason: 'Nothing to do — say what to change.', options: exampleAsks(fields) };
    }
    const lower = raw.toLowerCase();
    if (COMMIT_WORDS.test(lower)) return { kind: 'commit' };
    if (DESCRIBE_WORDS.test(lower)) return { kind: 'describe' };

    const edits: DraftEdit[] = [];
    const refusals: string[] = [];
    let sawField = false;

    for (const clause of clauses(raw)) {
        const c = clause.toLowerCase();

        // ── read the value first, so its digits never pollute the field phrase ──
        let value: number | null = null;
        let valueSpan: string | null = null;
        let sawUnit = false;
        let sawPercent = false;

        const pm = PERCENT_RE.exec(c);
        const lm = LENGTH_RE.exec(c);
        if (pm) {
            value = parseFloat(pm[1]!) / 100;
            valueSpan = pm[0];
            sawPercent = true;
        } else if (lm) {
            value = toMetres(parseFloat(lm[1]!), lm[2]!);
            valueSpan = lm[0];
            sawUnit = true;
        } else {
            const bm = BARE_RE.exec(c);
            if (bm) { value = parseFloat(bm[1]!); valueSpan = bm[0]; }
        }

        const wantsClear = value === null && CLEAR_WORDS.test(c);
        // ── identity, before anything else ──────────────────────────────────────
        const nameM = NAME_RE.exec(clause.trim());
        const descM = DESC_RE.exec(clause.trim());
        const idField = (id: string): DraftField | undefined => fields.find((f) => f.id === id);
        if (descM?.[1]) {
            const f = idField('__description__');
            if (f) {
                sawField = true;
                edits.push({ field: f, value: descM[1].trim(), clearsToAuto: false, said: `Description → "${descM[1].trim()}"` });
                continue;
            }
        }
        if (nameM?.[1]) {
            const f = idField('__name__');
            if (f) {
                sawField = true;
                edits.push({ field: f, value: nameM[1].trim(), clearsToAuto: false, said: `Name → "${nameM[1].trim()}"` });
                continue;
            }
        }

        const phrase = fieldPhrase(clause, valueSpan);
        if (phrase.length === 0) continue;

        // ── narrow the candidate set by what the VALUE could possibly be ────────
        //
        // ⭐ THIS IS WHAT MAKES "frame" UNAMBIGUOUS IN PRACTICE. `Frame finish`,
        // `Frame face` and `Frame depth` all contain the word, so a bare "frame"
        // over the whole vocabulary is genuinely ambiguous — but "set the frame to
        // oak" carries no number and only ONE of the three can hold a material,
        // while "frame 50mm" carries a length and only the two dimensions can. The
        // narrowing is a fact about the value, not a preference about the field.
        const numeric = value !== null;
        const pool = fields.filter((f) => {
            if (f.target === 'identity') return !numeric && /\b(name|title|called|description|note)\b/.test(phrase);
            if (f.kind === 'material') return !numeric;
            if (wantsClear) return f.target === 'dimension';
            return numeric;
        });
        if (pool.length === 0) {
            refusals.push(
                `I understood "${clause.trim()}" as naming a value, but nothing in a ${''}type takes it that way.`,
            );
            continue;
        }

        // ⭐ A MATERIAL CLAUSE CARRIES TWO VOCABULARIES AT ONCE, and only one of them
        // is the field's. "frame in oak" is `frame` (the slot) plus `oak` (the master's
        // language). Feeding the whole phrase to the field ladder asks it to find a
        // field called "frame oak", which no declaration will ever contain — so the
        // clause missed entirely rather than refusing honestly.
        //
        // ⛔ The split is by MEMBERSHIP IN THE DECLARED BAGS, not by position or by a
        // list of prepositions: a word is part of the field reference iff some
        // candidate field declares it. The ladder still decides WHICH field, ambiguity
        // included — this only stops feeding it words that were never about a field.
        let fieldWords = phrase;
        let materialRef = '';
        if (pool.some((f) => f.kind === 'material')) {
            const declared = new Set<string>();
            for (const f of pool) {
                for (const w of f.name.toLowerCase().split(/[^a-z0-9]+/)) if (w) declared.add(w);
            }
            const words = phrase.split(' ').filter(Boolean);
            fieldWords = words.filter((w) => declared.has(w)).join(' ');
            materialRef = words.filter((w) => !declared.has(w)).join(' ');
            if (fieldWords.length === 0) {
                // Nothing named a slot. Not a material ask at all.
                continue;
            }
        }

        const reader = {
            getById: (id: string) => pool.find((f) => f.id === id),
            getAll: () => [...pool],
        };
        const hit = resolveCatalogueRef(reader, fieldWords, { spanDomain: 'pryzm.opening.draftIntent' });

        if (hit.resolvedBy === 'ambiguous') {
            const names = (hit.candidates ?? []).map((f) => f.label);
            return {
                kind: 'refusal',
                reason: `"${fieldWords}" could mean more than one thing here. Which did you want?`,
                options: names,
            };
        }
        const f = hit.entry;
        if (!f) continue;
        sawField = true;

        // ── material ────────────────────────────────────────────────────────────
        if (f.kind === 'material') {
            // The reference is what the field-word split already set aside above.
            const ref = materialRef.trim();
            if (ref.length === 0) {
                refusals.push(`Which material for the ${f.label.toLowerCase()}? Name one from the library.`);
                continue;
            }
            // ⛔ THE ONE LADDER. Not a lookup of our own — see the header.
            const id = suggestMaterialForLegacyName(ref);
            const hex = finishMaterialHex(id);
            const label = finishMaterialLabel(id);
            if (!id || !hex || !label) {
                refusals.push(
                    `"${ref}" is not a material in the library, so I have not set the ${f.label.toLowerCase()}. ` +
                    'Pick one from the list — a near-enough guess here would put a colour on your type that ' +
                    'nobody chose.',
                );
                continue;
            }
            edits.push({
                field: f, value: label, clearsToAuto: false,
                materialId: id, materialLabel: label, materialHex: hex,
                // C100 §5 — reached by inference, reported as inference.
                inferred: label.toLowerCase() !== ref.toLowerCase(),
                said: `${f.label} → ${label}`,
            });
            continue;
        }

        // ── clear back to auto ──────────────────────────────────────────────────
        if (wantsClear) {
            edits.push({ field: f, value: null, clearsToAuto: true, said: `${f.label} → auto (inherited)` });
            continue;
        }

        if (value === null) {
            refusals.push(`Give ${f.label.toLowerCase()} a value, e.g. "${f.label.toLowerCase()} ${f.min}".`);
            continue;
        }

        // ── numeric, range-checked ──────────────────────────────────────────────
        let v = value;
        if (f.kind === 'fraction') {
            // "80% opaque" and "0.8" both mean the same fraction; ">1 and no percent
            // sign" is read as a percentage because nobody types 80 meaning 8000%.
            if (!sawPercent && v > 1) v = v / 100;
        } else if (f.kind === 'count') {
            v = Math.round(v);
        } else if (f.kind === 'length' && !sawUnit) {
            // ⚠ A BARE NUMBER ON A LENGTH IS AMBIGUOUS AND IS NOT GUESSED AT when it
            // cannot be metres. "frame face 50" is 50 metres if read literally and
            // 50 mm if read charitably; refusing names both readings instead of
            // silently choosing the flattering one.
            const min = f.min ?? 0;
            const max = f.max ?? Number.POSITIVE_INFINITY;
            if (v < min || v > max) {
                const asMm = v / 1000;
                const hint = asMm >= min && asMm <= max ? ` Did you mean ${v} mm?` : '';
                refusals.push(
                    `${f.label} accepts ${humanRange(f)}, and "${v}" has no unit.${hint} ` +
                    'Say the unit and I will set it.',
                );
                continue;
            }
        }

        const min = f.min ?? Number.NEGATIVE_INFINITY;
        const max = f.max ?? Number.POSITIVE_INFINITY;
        if (!Number.isFinite(v) || v < min || v > max) {
            const shown = f.kind === 'fraction' ? `${Math.round(v * 100)}%` : String(v);
            refusals.push(
                // §RAC-FREEFORM-PLUS-HARD-STOPPERS — both numbers, always. A clamp here
                // would author a value the user never typed.
                `${f.label} accepts ${humanRange(f)}. You asked for ${shown}, so I have not changed it.`,
            );
            continue;
        }

        const shown = f.kind === 'fraction'
            ? `${Math.round(v * 100)}% opaque`
            : f.kind === 'count' ? String(v) : `${v} m`;
        edits.push({ field: f, value: v, clearsToAuto: false, said: `${f.label} → ${shown}` });
    }

    if (edits.length > 0) return { kind: 'edits', edits };
    if (refusals.length > 0) return { kind: 'refusal', reason: refusals.join(' ') };
    if (sawField) return { kind: 'refusal', reason: 'I found the field but not a value to put in it.' };
    return {
        kind: 'miss',
        reason: 'I did not recognise a parameter in that.',
        options: exampleAsks(fields),
    };
}

/**
 * Concrete example asks, BUILT FROM THE DECLARATION so the help can never offer a
 * field the dialog does not have. C06: never a suggestion the surface cannot honour.
 */
export function exampleAsks(fields: readonly DraftField[]): string[] {
    const out: string[] = [];
    const dim = fields.find((f) => f.target === 'dimension');
    if (dim) out.push(`${dim.label.toLowerCase()} ${dim.min} m`);
    const fin = fields.find((f) => f.kind === 'material');
    if (fin) out.push(`${fin.label.toLowerCase().replace(' finish', '')} in oak`);
    const grid = fields.find((f) => f.target === 'grid');
    if (grid) out.push(`${grid.max} ${grid.label.toLowerCase()}`);
    const glz = fields.find((f) => f.target === 'glazing');
    if (glz) out.push('glazing 20% opaque');
    if (dim) out.push(`${dim.label.toLowerCase()} auto`);
    out.push('call it Kitchen Casement');
    return out;
}

/** Everything this chat can author, for the "what can I change?" answer. */
export function authorableSummary(fields: readonly DraftField[]): string[] {
    return fields
        .filter((f) => f.target !== 'identity')
        .map((f) => (f.kind === 'length' ? `${f.label} (${f.min}–${f.max} m)` : f.label));
}
