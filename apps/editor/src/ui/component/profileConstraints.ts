/**
 * profileConstraints — the authoring-side reading of **C74 §4.6**: which persisted profile
 * constraint kinds have an evaluator, which do not, and what the surface is allowed to author.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * §GLYPH-STATUS-IS-THE-C74-RECORD
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * ⛔ **C74 §4.6.0's measurement is the reason this file exists, and it is not `12 − 5 = 7`.**
 * The PERSISTED vocabulary (`ProfileConstraintSchema.kind`, 12 members) and the EXECUTABLE
 * vocabulary (`buildConstraintSet.ts`'s switch, 5 members) are **two alphabets, not a
 * subset**. Only `parallel` and `perpendicular` match verbatim; `coincident`/`coincident-pp`
 * and `distance`/`distance-pp` are **near-miss spellings of one concept** — what C71 §3.3
 * forbids by name — and `fixed` exists **only** on the executable side, with nowhere to be
 * written. So:
 *
 *   • **4 of 12 persisted kinds have an executor** (2 verbatim, 2 across a spelling gap);
 *   • **8 of 12 have none**;
 *   • **1 executable kind cannot be persisted at all** (`fixed`) — a LATENT loss, named in
 *     advance by C74 §4.6.0 so it is not discovered by a user the day save is wired.
 *
 * ⭐ **What this file is for.** C74 §4.6.3 is a MUST: *"the component editor MUST NOT persist
 * a constraint kind it cannot evaluate"*, with a C16 CA-18-shaped refusal — **name the kind,
 * name the reason, name the live alternative**. And §4.6.3's MUST NOT: the gap may **not** be
 * closed by deleting the eight from the enum, because deleting a persisted member breaks
 * `deserialize` for any document carrying one (C71 §2.4). They stay declared, they stay
 * **unauthorable**, *"and the difference is recorded here rather than inferred from an empty
 * editor toolbar."* This module is that record, in code, on the surface the author looks at.
 *
 * ⚠ **OWED — this table RESTATES C74 §4.6.0 and no gate keeps the two in sync.** It cannot be
 * DERIVED: `buildConstraintSet.ts` lives in `apps/component-editor` (an L7 sibling app, which
 * ADR-0376 **D1** retires) and speaks the other alphabet, so there is no import that would
 * make one of these the source of the other. The honest state is: one hand-kept table, its
 * source cited, and the owed gate named in
 * `audit/universal-component-editor/2026-09-01/phase4/lane-4f-the-authoring-ui.md`.
 * ⛔ Do not "fix" the drift risk by importing across the two apps — that is the second
 * composition root P1 forbids, reached through a type import.
 */

/** The twelve kinds `ProfileConstraintSchema.kind` persists, in schema order. */
export const PERSISTED_CONSTRAINT_KINDS = [
    'coincident',
    'parallel',
    'perpendicular',
    'horizontal',
    'vertical',
    'tangent',
    'distance',
    'radius',
    'angle',
    'diameter',
    'equalLength',
    'distancePointLine',
] as const;

export type PersistedConstraintKind = (typeof PERSISTED_CONSTRAINT_KINDS)[number];

/**
 * The four persisted kinds that reach an executor, each with the EXECUTABLE spelling it
 * reaches it through. ⭐ The spelling is carried, not hidden: a reader of this table can see
 * which two cross a near-miss gap, which is the defect C74 §4.6.3 requires resolved *before*
 * either side gains a member.
 */
export const EVALUABLE_CONSTRAINT_KINDS: Readonly<Record<string, string>> = {
    parallel: 'parallel',
    perpendicular: 'perpendicular',
    coincident: 'coincident-pp',
    distance: 'distance-pp',
};

/**
 * ⚠ Executable but **NOT PERSISTABLE**. A sketch that pins a point with `fixed` has nowhere
 * to write the pin (C74 §4.6.0). Declared here so the authoring UI can refuse it by name
 * rather than accepting a click that will be lost on save.
 */
export const EXECUTABLE_BUT_UNPERSISTABLE = ['fixed'] as const;

/** The short mark drawn in the glyph. Presentation only — the DOM carries the `kind`. */
const GLYPH_LABELS: Readonly<Record<PersistedConstraintKind, string>> = {
    coincident: '⊙',        // ⊙
    parallel: '∥',          // ∥
    perpendicular: '⊥',     // ⊥
    horizontal: 'H',
    vertical: 'V',
    tangent: 'T',
    distance: '↔',          // ↔
    radius: 'R',
    angle: '∠',             // ∠
    diameter: '⌀',          // ⌀
    equalLength: '=',
    distancePointLine: '⇥', // ⇥
};

export function isPersistedConstraintKind(kind: string): kind is PersistedConstraintKind {
    return (PERSISTED_CONSTRAINT_KINDS as readonly string[]).includes(kind);
}

/** `'evaluated'` iff the kind reaches an executor (C74 §4.6.0's four). */
export function constraintStatus(kind: string): 'evaluated' | 'declared-only' {
    return Object.prototype.hasOwnProperty.call(EVALUABLE_CONSTRAINT_KINDS, kind)
        ? 'evaluated'
        : 'declared-only';
}

export function constraintGlyphLabel(kind: string): string {
    return isPersistedConstraintKind(kind) ? GLYPH_LABELS[kind] : '?';
}

/**
 * The long-form text a glyph's `<title>` carries. ⭐ A declared-only glyph SAYS it is
 * declared-only. A tooltip that read the same for both would make *"this constraint holds"*
 * and *"this constraint is recorded and nothing enforces it"* the same value on the only
 * surface the author consults.
 */
export function constraintGlyphTitle(kind: string): string {
    if (constraintStatus(kind) === 'evaluated') {
        const via = EVALUABLE_CONSTRAINT_KINDS[kind]!;
        return via === kind
            ? `${kind} — evaluated.`
            : `${kind} — evaluated, through the executable spelling '${via}' (C74 §4.6.0: a near-miss spelling, not a second concept).`;
    }
    return `${kind} — PERSISTED ONLY. No evaluator exists for this constraint (C74 §4.6.0), so nothing enforces it. It is drawn hollow for that reason.`;
}

/* ------------------------------------------------------------------ */
/* Authoring — C74 §4.6.3's MUST, as a refusal rather than a silence.  */
/* ------------------------------------------------------------------ */

export interface ConstraintAuthoringRefusal {
    /** The kind the author asked for. */
    readonly kind: string;
    /** WHY it is refused — never a generic failure string. */
    readonly reason: string;
    /** The LIVE ALTERNATIVE (C16 CA-18): what the author can do instead, today. */
    readonly alternative: string;
    /** One sentence, ready for a status line. */
    readonly message: string;
}

export type ConstraintAuthoringDisposition =
    | { readonly authorable: true; readonly kind: PersistedConstraintKind }
    | { readonly authorable: false; readonly refusal: ConstraintAuthoringRefusal };

const LIVE_ALTERNATIVE =
    `the four kinds that do execute — ${Object.keys(EVALUABLE_CONSTRAINT_KINDS).join(', ')}`;

/**
 * May the author create a constraint of this kind?
 *
 * ⛔ **C74 §4.6.3, MUST:** *"The component editor MUST NOT persist a constraint kind it cannot
 * evaluate. A `.pryzm-family` that round-trips, validates, signs and reports success while
 * carrying eight kinds nothing can execute is a file that lies about its own contents."*
 * ⛔ *"Silently accepting the author's click and writing an inert record is the forbidden
 * outcome"* — so this returns a REFUSAL, never `false`.
 */
export function constraintAuthoringDisposition(kind: string): ConstraintAuthoringDisposition {
    if ((EXECUTABLE_BUT_UNPERSISTABLE as readonly string[]).includes(kind)) {
        const reason =
            `'${kind}' can be evaluated but has no member in ProfileConstraintSchema.kind, so there ` +
            'is nowhere in the document to write it (C74 §4.6.0)';
        return {
            authorable: false,
            refusal: {
                kind, reason, alternative: LIVE_ALTERNATIVE,
                message: `Cannot add '${kind}': ${reason}. Use ${LIVE_ALTERNATIVE}.`,
            },
        };
    }
    if (!isPersistedConstraintKind(kind)) {
        const reason = `'${kind}' is not a member of ProfileConstraintSchema.kind`;
        return {
            authorable: false,
            refusal: {
                kind, reason, alternative: LIVE_ALTERNATIVE,
                message: `Cannot add '${kind}': ${reason}. Use ${LIVE_ALTERNATIVE}.`,
            },
        };
    }
    if (constraintStatus(kind) === 'declared-only') {
        const reason =
            `no evaluator exists for '${kind}' (C74 §4.6.0 measured 4 of the 12 persisted kinds ` +
            'with an executor); persisting it would write an inert record the file then reports as content';
        return {
            authorable: false,
            refusal: {
                kind, reason, alternative: LIVE_ALTERNATIVE,
                message: `Cannot add '${kind}': ${reason}. Use ${LIVE_ALTERNATIVE}.`,
            },
        };
    }
    return { authorable: true, kind };
}

/** The kinds an authoring toolbar may offer today. Derived, never hand-listed. */
export function authorableConstraintKinds(): readonly PersistedConstraintKind[] {
    return PERSISTED_CONSTRAINT_KINDS.filter(
        (k) => constraintAuthoringDisposition(k).authorable,
    );
}
