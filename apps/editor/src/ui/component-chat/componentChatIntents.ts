/**
 * componentChatIntents — the DETERMINISTIC, ZERO-TOKEN understanding layer for the
 * Component authoring chat (UI/UX wave, lane U6).
 * §U6-AI-AUTHORING · UIUX-PLAN §U6 · ADR-0376 D4/D5/D9 · C110 §2.2/§3.5-a/§4.2/§4.4 ·
 * C111 §1.1 · C16 CA-18/CA-21 · audit R1 · [[reuse-residential-house-pipeline-patterns]].
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ MIRRORS `FinishTypeDraftIntent` — plain English in, a described change out, or a
 *   NAMED refusal. No network, no model, no `any`, no store, no bus. The caller (the
 *   chat strip) carries the change to the same bus verb / draft op the controls use.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ── WHY THIS IS A CHAT STRIP AND NOT A GLOBAL `ChatCapability` (the measured reason) ─
 * `check-chat-capability-coverage`'s case-arm ratchet (`MAX_RESOLVER_CASE_ARMS`) is
 * AT its baseline (30/30 measured 2026-09-03). A main-chat capability for
 * `component.setInstanceParameter` / `component.swapType` needs a HAND-WRITTEN
 * `applySemanticIntent` case arm (its payload — a single `componentId` + `par_`/`typ_`
 * ULID — fits neither the `CapabilityExecutionSpec` `idsField` template nor the generic
 * property arm), so declaring it as a capability would push the ratchet to 31/30 and
 * FAIL the gate. `FinishTypeDraftIntent`'s own header names exactly this shape as the
 * architecturally-sound alternative: a deterministic offline resolver over the SAME
 * declaration the controls render, dispatching through the surface's existing command
 * path — no new verb, no new resolver case, no global capability row. The three
 * `component.*` verbs therefore stay DECLARED in `CHAT_UNAVAILABLE` (their promises are
 * now TRUE — a panel chat and a workspace chat exist), and `UNDECLARED` stays 0.
 *
 * ── ⛔ THE VOCABULARY IS DERIVED, NEVER HAND-LISTED (C65 §3.5) ──────────────────
 * A parameter is chat-reachable because the definition DECLARES it. Resolution runs
 * through {@link resolveDeclaredRef}: the ONE `resolveCatalogueRef` ladder over the
 * DECLARED names (so "Width", "CW-600", exact spellings resolve through its id →
 * name → case-insensitive tiers), plus a documented compound-word fallback using the
 * ladder's own `catalogueNameWords` tokeniser (so "opening width" reaches OpeningWidth,
 * which the ladder keeps whole). The single added tie-break — an exact word-set beats a
 * proper subset — is symmetric with the ladder's own "exact beats case-insensitive
 * beats subset" ordering and exists only because a parameter NAMED "Width" is a
 * sub-word of "OpeningWidth"/"FrameWidth". Ambiguity is REPORTED with candidates.
 */

import {
    resolveCatalogueRef,
    catalogueNameWords,
    type CatalogueReader,
} from '@pryzm/command-registry';
import { RUNTIME_LENGTH_UNITS_PER_METRE } from '@pryzm/family-instance';
import type {
    ComponentDefinitionParameterView,
    ComponentDefinitionView,
} from '@pryzm/plugin-component';

/* ══════════════════════════════════════════════════════════════════════════════ */
/* Shared vocabulary — the declared parameters/types as a resolvable catalogue      */
/* ══════════════════════════════════════════════════════════════════════════════ */

/** One authorable parameter, derived from the definition's declaration. */
export interface ParamEntry {
    readonly id: string;
    /** The declared name — matched by the resolver AND used verbatim inside an authored
     *  expression (C110 §4.2 references parameters BY NAME). */
    readonly declaredName: string;
    readonly kind: 'type' | 'instance';
    readonly dataType: ComponentDefinitionParameterView['dataType'];
}

export interface TypeEntry {
    readonly id: string;
    readonly declaredName: string;
}

/** `columnDividerThickness` / `Column_Divider` -> "column divider thickness". */
function splitCamel(key: string): string {
    return key
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .toLowerCase();
}

export function paramEntriesFrom(
    params: readonly Pick<ComponentDefinitionParameterView, 'id' | 'name' | 'kind' | 'dataType'>[],
): ParamEntry[] {
    return params.map((p) => ({ id: p.id, declaredName: p.name, kind: p.kind, dataType: p.dataType }));
}

export function typeEntriesFrom(
    types: readonly { readonly id: string; readonly name: string }[],
): TypeEntry[] {
    return types.map((t) => ({ id: t.id, declaredName: t.name }));
}

const SPAN = 'pryzm.component.chatIntent';

interface Declared { readonly id: string; readonly declaredName: string; }

export type RefResult<T> =
    | { readonly kind: 'entry'; readonly entry: T }
    | { readonly kind: 'ambiguous'; readonly candidates: readonly T[] }
    | { readonly kind: 'none' };

/**
 * Resolve a spoken reference to exactly one DECLARED entry. Pass 1 is the ONE
 * `resolveCatalogueRef` ladder over the declared names (id → exact → case-insensitive
 * → its own single-token subset). Pass 2 is a compound-word fallback over `splitCamel`
 * tokens, with an exact-word-set tie-break — needed only because "Width" is a sub-word
 * of "OpeningWidth"/"FrameWidth". Never throws; ambiguity is DATA.
 */
export function resolveDeclaredRef<T extends Declared>(entries: readonly T[], ref: string): RefResult<T> {
    const trimmed = ref.trim();
    if (trimmed.length === 0) return { kind: 'none' };

    // Pass 1 — the ladder over declared names.
    const reader: CatalogueReader<{ id: string; name: string }> = {
        getById: (id) => {
            const e = entries.find((x) => x.id === id);
            return e ? { id: e.id, name: e.declaredName } : undefined;
        },
        getAll: () => entries.map((e) => ({ id: e.id, name: e.declaredName })),
    };
    const hit = resolveCatalogueRef(reader, trimmed, { spanDomain: SPAN });
    if (hit.entry) {
        const e = entries.find((x) => x.id === hit.entry!.id);
        if (e) return { kind: 'entry', entry: e };
    }
    if (hit.resolvedBy === 'ambiguous') {
        const cands = (hit.candidates ?? [])
            .map((c) => entries.find((x) => x.id === c.id))
            .filter((e): e is T => e !== undefined);
        if (cands.length > 0) return { kind: 'ambiguous', candidates: cands };
    }

    // Pass 2 — compound multi-word fallback.
    const wanted = new Set(catalogueNameWords(trimmed));
    if (wanted.size === 0) return { kind: 'none' };
    const wordsOf = (e: T): Set<string> => new Set(catalogueNameWords(splitCamel(e.declaredName)));
    const subset = entries.filter((e) => { const h = wordsOf(e); return [...wanted].every((w) => h.has(w)); });
    if (subset.length === 1) return { kind: 'entry', entry: subset[0]! };
    if (subset.length > 1) {
        const exact = subset.filter((e) => wordsOf(e).size === wanted.size);
        if (exact.length === 1) return { kind: 'entry', entry: exact[0]! };
        return { kind: 'ambiguous', candidates: subset };
    }
    return { kind: 'none' };
}

/* ══════════════════════════════════════════════════════════════════════════════ */
/* Value reading — one place a unit is interpreted                                  */
/* ══════════════════════════════════════════════════════════════════════════════ */

const LENGTH_RE = /(-?\d+(?:\.\d+)?)\s*(mm|millimet(?:er|re)s?|cm|centimet(?:er|re)s?|m|met(?:er|re)s?)\b/;
const BARE_RE = /(-?\d+(?:\.\d+)?)/;

/**
 * A length in the RUNTIME CANONICAL unit (mm today — `RUNTIME_LENGTH_UNITS_PER_METRE`),
 * so the chat and `ComponentSection`'s edit affordance (which labels the field in that
 * same canonical unit and sends the number as typed) store the identical value for the
 * identical words. A BARE number is taken as canonical as-typed — the panel's own
 * convention; a unit-tagged number is converted TO canonical. ⚠ The mm/metres D3 delta
 * (C110 §3.3) is INHERITED from that seam, never re-decided here.
 */
function readCanonicalLength(clause: string): { value: number; span: string } | null {
    const lm = LENGTH_RE.exec(clause);
    if (lm) {
        const n = parseFloat(lm[1]!);
        const unit = lm[2]!;
        const metres = unit.startsWith('mm') || unit.startsWith('milli')
            ? n / 1000
            : unit.startsWith('cm') || unit.startsWith('centi')
                ? n / 100
                : n;
        return { value: metres * RUNTIME_LENGTH_UNITS_PER_METRE, span: lm[0] };
    }
    const bm = BARE_RE.exec(clause);
    if (bm) return { value: parseFloat(bm[1]!), span: bm[0] };
    return null;
}

/* ══════════════════════════════════════════════════════════════════════════════ */
/* Sentence shapes shared by both surfaces                                          */
/* ══════════════════════════════════════════════════════════════════════════════ */

const DESCRIBE_RE = /^(?:what (?:can (?:i|you) (?:do|change|set|author)|is authorable|are the (?:parameters|options|types))|help|options|parameters|types|list)\??$/i;

const FILLER = new Set([
    'set', 'make', 'change', 'use', 'give', 'put', 'let', 'please', 'the', 'a', 'an',
    'to', 'of', 'be', 'as', 'is', 'are', 'this', 'that', 'it', 'its', "it's", 'component',
    'parameter', 'param', 'value', 'now', 'just', 'about', 'around', 'exactly',
]);

function stripFiller(phrase: string): string {
    return phrase
        .toLowerCase()
        .replace(/[^a-z0-9'% ]+/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 0 && !FILLER.has(w) && !/^-?\d+(?:\.\d+)?$/.test(w))
        .join(' ');
}

/* ══════════════════════════════════════════════════════════════════════════════ */
/* Surface 1 — the placed-instance ask (set override / clear / swap type)           */
/* ══════════════════════════════════════════════════════════════════════════════ */

export type ComponentInstanceResolution =
    | { readonly kind: 'set-parameter'; readonly parameterId: string; readonly value: number | string | boolean; readonly said: string }
    | { readonly kind: 'clear-parameter'; readonly parameterId: string; readonly said: string }
    | { readonly kind: 'swap-type'; readonly typeId: string; readonly said: string }
    | { readonly kind: 'describe' }
    | { readonly kind: 'refusal'; readonly reason: string; readonly options?: readonly string[] }
    | { readonly kind: 'miss'; readonly reason: string; readonly options: readonly string[] };

const SWAP_RE = /\b(?:swap|switch|change|set)\s+(?:the\s+)?(?:type|it)?\s*(?:to|into|=)\s+(.+)$/i;
const CLEAR_RE = /\b(auto|automatic|inherit(?:ed)?|default|unset|clear|reset)\b/i;

/**
 * Understand ONE ask against a placed component's LOADED definition. Returns a
 * REFUSAL (never a guess) when the parameter is ambiguous, the value shape is wrong,
 * or a TYPE parameter is asked to be overridden per-instance (the handler's own rule,
 * stated here so the chat refuses BY NAME before the bus does — C110 §3.5-a / C111).
 */
export function resolveComponentInstanceAsk(
    text: string,
    view: ComponentDefinitionView,
): ComponentInstanceResolution {
    const raw = text.trim();
    const params = paramEntriesFrom(view.parameters);
    const types = typeEntriesFrom(view.types);
    if (raw.length === 0) {
        return { kind: 'miss', reason: 'Nothing to do — say what to change.', options: instanceExamples(view) };
    }
    if (DESCRIBE_RE.test(raw)) return { kind: 'describe' };

    // ── type swap, recognised before the parameter ladder ──────────────────────
    // ⚠ A type NAME must carry a letter ("CW-600", "W1200"); a purely numeric tail
    // ("change it to 1500") is a value, not a type, and falls through to the
    // parameter ladder rather than refusing "1500 is not a type".
    const swapM = SWAP_RE.exec(raw);
    if (swapM?.[1] && /[a-z]/i.test(swapM[1])) {
        const res = resolveDeclaredRef(types, swapM[1].trim());
        if (res.kind === 'ambiguous') {
            return { kind: 'refusal', reason: `"${swapM[1].trim()}" could be more than one type.`, options: res.candidates.map((t) => t.declaredName) };
        }
        if (res.kind === 'entry') return { kind: 'swap-type', typeId: res.entry.id, said: `Type → ${res.entry.declaredName}` };
        return { kind: 'refusal', reason: `"${swapM[1].trim()}" is not a type of ${view.name}.`, options: types.map((t) => t.declaredName) };
    }

    // ── read the value first, so its digits never pollute the parameter phrase ──
    const val = readCanonicalLength(raw);
    const wantsClear = val === null && CLEAR_RE.test(raw);

    let phrase = raw;
    if (val) phrase = phrase.replace(val.span, ' ');
    phrase = phrase.replace(new RegExp(CLEAR_RE.source, 'gi'), ' ');
    const paramRef = stripFiller(phrase);
    if (paramRef.length === 0) {
        return { kind: 'miss', reason: 'I did not recognise a parameter in that.', options: instanceExamples(view) };
    }

    const res = resolveDeclaredRef(params, paramRef);
    if (res.kind === 'ambiguous') {
        return { kind: 'refusal', reason: `"${paramRef}" could mean more than one parameter.`, options: res.candidates.map((p) => p.declaredName) };
    }
    if (res.kind === 'none') {
        return { kind: 'miss', reason: `"${paramRef}" is not a parameter of ${view.name}.`, options: params.map((q) => q.declaredName) };
    }
    const p = res.entry;

    // ⛔ A TYPE parameter is not overridable per occurrence (C111) — refuse BY NAME,
    // the same reason the handler returns, so the chat never sends a doomed dispatch.
    if (p.kind !== 'instance') {
        return {
            kind: 'refusal',
            reason:
                `${p.declaredName} is a TYPE parameter of ${view.name} — it cannot be overridden on ` +
                'one placed instance. Edit the type, or swap to one that carries the value you want.',
        };
    }

    if (wantsClear) {
        return { kind: 'clear-parameter', parameterId: p.id, said: `${p.declaredName} → cleared (back to type/default)` };
    }
    if (val === null) {
        return { kind: 'refusal', reason: `Give ${p.declaredName} a value, e.g. "set ${p.declaredName.toLowerCase()} 1500".` };
    }

    // Value SHAPE is the handler's `valueShapeRefusal` domain (C110 §3.5-a); the chat
    // reads the number and lets the bus be the one voice on a bad shape. For a boolean
    // parameter a number is meaningless, so translate the two words it accepts.
    let value: number | string | boolean = val.value;
    if (p.dataType === 'boolean') {
        if (/\btrue\b|\bon\b|\byes\b/i.test(raw)) value = true;
        else if (/\bfalse\b|\boff\b|\bno\b/i.test(raw)) value = false;
        else return { kind: 'refusal', reason: `${p.declaredName} is a yes/no parameter — say "${p.declaredName.toLowerCase()} true" or "…false".` };
    }
    return { kind: 'set-parameter', parameterId: p.id, value, said: `${p.declaredName} → ${String(value)}` };
}

export function instanceExamples(view: ComponentDefinitionView): string[] {
    const out: string[] = [];
    const inst = view.parameters.find((p) => p.kind === 'instance' && (p.dataType === 'length' || p.dataType === 'number' || p.dataType === 'count'));
    if (inst) out.push(`set ${inst.name.toLowerCase()} 1500`);
    if (view.types.length > 1) out.push(`swap to ${view.types[1]!.name}`);
    else if (view.types[0]) out.push(`swap to ${view.types[0].name}`);
    out.push('what can I change');
    return out;
}

export function instanceAuthorable(view: ComponentDefinitionView): string[] {
    const inst = view.parameters.filter((p) => p.kind === 'instance').map((p) => p.name);
    const typeNames = view.types.map((t) => t.name);
    const out: string[] = [];
    if (inst.length > 0) out.push(`override: ${inst.join(', ')}`);
    if (typeNames.length > 0) out.push(`types: ${typeNames.join(', ')}`);
    return out;
}

/* ══════════════════════════════════════════════════════════════════════════════ */
/* Surface 2 — the definition-authoring ask (introduce an expression, §64)          */
/* ══════════════════════════════════════════════════════════════════════════════ */

export type ComponentExpressionResolution =
    | { readonly kind: 'expression'; readonly parameterId: string; readonly expression: string; readonly said: string }
    | { readonly kind: 'describe' }
    | { readonly kind: 'refusal'; readonly reason: string; readonly options?: readonly string[] }
    | { readonly kind: 'miss'; readonly reason: string; readonly options: readonly string[] };

/** target + expression, split at the first authored connective. */
const EXPR_SPLIT_RE = /^\s*(?:make|set|let)?\s*(.+?)\s*(?:=|:=|\bequals?\b|\bis equal to\b|\bshould be\b|\bis\b|\bto be\b|\bthe\b|\bto\b)\s+(.+?)\s*$/i;

/**
 * Understand "make GlassWidth the opening width minus twice the frame width" over a
 * definition's DECLARED parameters. Produces `{ parameterId, expression }` — an
 * expression STRING referencing the other parameters BY THEIR DECLARED NAMES (C110
 * §4.2). The diagnostics (`expression-parse` / `unknown-identifier` / `cycle` /
 * `unit-mismatch`, C110 §4.4) are NOT run here — the workspace's `previewExpression`
 * gates the applied string, exactly as the U3 UI does when a user types it. This layer
 * only reaches the field and assembles the operands it can resolve; a phrase it cannot
 * resolve to a declared parameter is a NAMED refusal, never a fabricated identifier.
 */
export function resolveComponentExpressionAsk(
    text: string,
    params: readonly Pick<ComponentDefinitionParameterView, 'id' | 'name' | 'kind' | 'dataType'>[],
): ComponentExpressionResolution {
    const raw = text.trim();
    if (raw.length === 0) return { kind: 'miss', reason: 'Nothing to do — describe a formula.', options: expressionExamples(params) };
    if (DESCRIBE_RE.test(raw)) return { kind: 'describe' };

    const entries = paramEntriesFrom(params);

    // Prefer an explicit '=' split; otherwise the connective form.
    let targetPhrase: string;
    let exprPhrase: string;
    const eq = raw.indexOf('=');
    if (eq > 0) {
        targetPhrase = raw.slice(0, eq);
        exprPhrase = raw.slice(eq + 1);
    } else {
        const m = EXPR_SPLIT_RE.exec(raw);
        if (!m) {
            return { kind: 'miss', reason: 'Say it as "make <parameter> = <formula>" or "make <parameter> the <formula>".', options: expressionExamples(params) };
        }
        targetPhrase = m[1]!;
        exprPhrase = m[2]!;
    }

    const targetRes = resolveDeclaredRef(entries, stripFiller(targetPhrase) || targetPhrase.trim());
    if (targetRes.kind === 'ambiguous') {
        return { kind: 'refusal', reason: `"${targetPhrase.trim()}" could mean more than one parameter.`, options: targetRes.candidates.map((p) => p.declaredName) };
    }
    if (targetRes.kind === 'none') {
        return { kind: 'refusal', reason: `"${targetPhrase.trim()}" is not a parameter of this definition.`, options: entries.map((p) => p.declaredName) };
    }

    const built = buildExpression(exprPhrase, entries);
    if (!built.ok) return { kind: 'refusal', reason: built.reason, options: built.options };

    return {
        kind: 'expression',
        parameterId: targetRes.entry.id,
        expression: built.expression,
        said: `${targetRes.entry.declaredName} = ${built.expression}`,
    };
}

/** Arithmetic-word normalisation → the DSL's `+ - * /` (C110 §4.2 grammar). */
function normaliseOperators(s: string): string {
    return s
        .replace(/\b(twice|double)\s+(?:the\s+|of\s+the\s+|a\s+)?/gi, '2 * ')
        .replace(/\b(triple)\s+(?:the\s+|of\s+the\s+|a\s+)?/gi, '3 * ')
        .replace(/\bhalf\s+(?:of\s+)?(?:the\s+|a\s+)?/gi, '0.5 * ')
        .replace(/\b(?:minus|less|subtract(?:ed by)?)\b/gi, ' - ')
        .replace(/\bplus\b/gi, ' + ')
        .replace(/\b(?:times|multiplied by|multiply by)\b/gi, ' * ')
        .replace(/\b(?:divided by|over)\b/gi, ' / ');
}

type ExprBuild =
    | { readonly ok: true; readonly expression: string }
    | { readonly ok: false; readonly reason: string; readonly options?: readonly string[] };

/**
 * Turn a natural-language operand-and-operator phrase into a DSL expression string.
 * Operators are normalised to symbols, the phrase is split on symbols, and every
 * non-numeric operand is resolved to a DECLARED parameter name — an unresolvable
 * operand REFUSES by name and never becomes a fabricated identifier the resolver would
 * only fail on later.
 */
function buildExpression(phrase: string, entries: readonly ParamEntry[]): ExprBuild {
    const normalised = normaliseOperators(phrase);
    const parts = normalised.split(/(\s*[+\-*/()]\s*)/).map((s) => s.trim()).filter((s) => s.length > 0);
    if (parts.length === 0) return { ok: false, reason: 'I could not find a formula in that.' };

    const out: string[] = [];
    for (const part of parts) {
        if (/^[+\-*/()]$/.test(part)) { out.push(part); continue; }
        if (/^-?\d+(?:\.\d+)?$/.test(part)) { out.push(part); continue; }
        const ref = stripFiller(part);
        if (ref.length === 0) continue; // pure filler between operators
        const res = resolveDeclaredRef(entries, ref);
        if (res.kind === 'ambiguous') {
            return { ok: false, reason: `"${part.trim()}" in the formula could mean more than one parameter.`, options: res.candidates.map((p) => p.declaredName) };
        }
        if (res.kind === 'none') {
            return { ok: false, reason: `"${part.trim()}" in the formula is not a parameter of this definition.`, options: entries.map((p) => p.declaredName) };
        }
        out.push(res.entry.declaredName);
    }
    const expression = out.join(' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
    if (expression.length === 0) return { ok: false, reason: 'I could not assemble a formula from that.' };
    if (!/[A-Za-z_]/.test(expression)) {
        return { ok: false, reason: 'A formula needs at least one parameter reference (e.g. "opening width minus twice frame width").' };
    }
    return { ok: true, expression };
}

export function expressionExamples(
    params: readonly Pick<ComponentDefinitionParameterView, 'id' | 'name'>[],
): string[] {
    const names = params.map((p) => p.name);
    const out: string[] = [];
    if (names.length >= 2) out.push(`make ${names[0]!.toLowerCase()} = ${names[1]!} - 2 * ${names[names.length - 1]!}`);
    out.push('what can I author');
    return out;
}
