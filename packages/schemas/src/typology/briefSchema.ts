// O.12.a (Onboarding · typology-declared brief) — L0 BriefField/BriefSchema.
//
// The project brief is DECLARED BY THE TYPOLOGY, not hard-coded in the UI.
// Each typology's `TypologyManifest` carries an optional `briefSchema` — an
// ordered list of typed, bounded fields. The onboarding RAC renders that
// schema dynamically as controls (sliders / steppers / toggles / chips); the
// captured values become the structured `Brief` that drives the generation
// pipeline. Apartment is one case; house / office declare their own schema.
//
// One source of truth — the same `briefSchema` feeds the RAC brief step AND
// the "Choose a layout" picker (O.10), so they never drift.
//
// L0-pure: Zod-only. No I/O, no THREE, no DOM, no `@pryzm/*` imports (P5).
//
// Design of record:
//   - docs/03-execution/specs/SPEC-TYPOLOGY-BRIEF-SCHEMA.md §2-§3
//   - docs/02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md §2.6
//   - docs/02-decisions/adrs/0056-typology-declared-brief.md

import { z } from 'zod';

/**
 * A single option in a `select` / `multiselect` brief field. `value` is the
 * machine key persisted into the structured `Brief`; `label` is the on-brand
 * human caption rendered in the chip / dropdown.
 */
export const BriefFieldOptionSchema = z.object({
    value: z.string().min(1),
    label: z.string().min(1),
});
export type BriefFieldOption = z.infer<typeof BriefFieldOptionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Field members — keyed by `kind`. A plain `z.union` (NOT discriminatedUnion):
// we need `.refine()` for cross-field invariants (min ≤ max, default in range,
// default in options) and Zod forbids `.refine()` on discriminatedUnion members
// while still allowing arbitrary refinement on the members of a plain union.
// ─────────────────────────────────────────────────────────────────────────────

/** Slider — a bounded numeric value with a step. */
export const RangeBriefFieldSchema = z
    .object({
        kind: z.literal('range'),
        id: z.string().min(1),
        label: z.string().min(1),
        min: z.number(),
        max: z.number(),
        step: z.number().positive(),
        default: z.number(),
        unit: z.string().min(1).optional(),
    })
    .refine((f) => f.min <= f.max, {
        message: 'range field: min must be ≤ max',
        path: ['min'],
    })
    .refine((f) => f.default >= f.min && f.default <= f.max, {
        message: 'range field: default must be within [min, max]',
        path: ['default'],
    });

/** ± integer stepper — a bounded numeric value adjusted one unit at a time. */
export const StepperBriefFieldSchema = z
    .object({
        kind: z.literal('stepper'),
        id: z.string().min(1),
        label: z.string().min(1),
        min: z.number(),
        max: z.number(),
        default: z.number(),
        unit: z.string().min(1).optional(),
    })
    .refine((f) => f.min <= f.max, {
        message: 'stepper field: min must be ≤ max',
        path: ['min'],
    })
    .refine((f) => f.default >= f.min && f.default <= f.max, {
        message: 'stepper field: default must be within [min, max]',
        path: ['default'],
    });

/** Single-choice — exactly one option selected. */
export const SelectBriefFieldSchema = z
    .object({
        kind: z.literal('select'),
        id: z.string().min(1),
        label: z.string().min(1),
        options: z.array(BriefFieldOptionSchema).min(1),
        default: z.string().min(1),
    })
    .refine((f) => f.options.some((o) => o.value === f.default), {
        message: 'select field: default must be one of the option values',
        path: ['default'],
    });

/** Multi-choice — zero or more option values selected (chips). */
export const MultiselectBriefFieldSchema = z
    .object({
        kind: z.literal('multiselect'),
        id: z.string().min(1),
        label: z.string().min(1),
        options: z.array(BriefFieldOptionSchema).min(1),
        default: z.array(z.string().min(1)),
    })
    .refine(
        (f) => {
            const valid = new Set(f.options.map((o) => o.value));
            return f.default.every((d) => valid.has(d));
        },
        {
            message:
                'multiselect field: every default must be one of the option values',
            path: ['default'],
        },
    );

/** On/off switch. */
export const ToggleBriefFieldSchema = z.object({
    kind: z.literal('toggle'),
    id: z.string().min(1),
    label: z.string().min(1),
    default: z.boolean(),
});

/** Free-text — the "anything else" supplementary hint. */
export const TextBriefFieldSchema = z.object({
    kind: z.literal('text'),
    id: z.string().min(1),
    label: z.string().min(1),
    placeholder: z.string().optional(),
});

/**
 * A single brief field. A plain `z.union` (see note above) of the six member
 * kinds, keyed by `kind`.
 */
export const BriefFieldSchema = z.union([
    RangeBriefFieldSchema,
    StepperBriefFieldSchema,
    SelectBriefFieldSchema,
    MultiselectBriefFieldSchema,
    ToggleBriefFieldSchema,
    TextBriefFieldSchema,
]);
export type BriefField = z.infer<typeof BriefFieldSchema>;

/**
 * The ordered list of typed fields a typology declares. The RAC renders these
 * in order; field `id`s MUST be unique (they key the structured `Brief`).
 */
export const BriefSchemaSchema = z
    .object({
        fields: z.array(BriefFieldSchema).min(1),
    })
    .refine(
        (s) => {
            const ids = s.fields.map((f) => f.id);
            return new Set(ids).size === ids.length;
        },
        { message: 'briefSchema: field ids must be unique', path: ['fields'] },
    );
export type BriefSchema = z.infer<typeof BriefSchemaSchema>;
