// E1a (EUROPE-IMPLEMENTATION-PLAN §E1a · REPORT §I) — pure recursive JSON value.
//
// WHY THIS EXISTS: REPORT §I `Rule.body?: JSONLogic` — a JSON-Logic expression is
// arbitrary JSON. The E1b evaluator (a separate lane) gives it semantics; at L0 the
// only honest schema is "any JSON value", typed recursively so `undefined`,
// functions, class instances and cycles are REJECTED at the parse boundary rather
// than silently serialised to garbage.
//
// L0-pure (P5): Zod only. Zero I/O, zero THREE, zero DOM.
// Grepped before authoring (2026-09-01): no existing JsonValue schema in
// packages/schemas/src — this is the first, not a rival.

import { z } from 'zod';

/** A JSON primitive — the leaves of any JSON document. */
export type JsonPrimitive = string | number | boolean | null;

/** Any JSON value (primitive, array, or string-keyed object), recursively. */
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/**
 * Zod schema for {@link JsonValue}. `z.lazy` forward-references itself, mirroring
 * the package's existing recursive pattern (`view/view-template.ts`
 * `FilterConditionSchema`).
 */
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
    z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.null(),
        z.array(JsonValueSchema),
        z.record(z.string(), JsonValueSchema),
    ]),
);
