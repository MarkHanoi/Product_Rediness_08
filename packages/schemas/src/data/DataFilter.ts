// C28 DAT-α-1 (Data Panel & Automation) — L0 DataFilter substrate.
//
// The filter contract used by the unified Data tab to slice the active
// project by element type / level / apartment / room / per-parameter
// predicate.  Drives the future `DataStore` (C28 §3) and the
// `data.bulkUpdate` / `data.runQualityCheck` commands (C28 §5).
//
// L0-pure: Zod only.  No I/O, no THREE, no DOM, no `@pryzm/*` non-schema
// imports.  `ElementType` / `LevelId` / `ApartmentId` / `RoomId` are NOT
// currently published as Zod schemas in `@pryzm/schemas` (they exist only
// as TS branded-string types in `../types/Id.ts`), so we defensively use
// `z.string()` here — the typed-id factory still mints branded values at
// runtime, and the data engine will accept the raw string and re-brand
// at the consumer boundary.
//
// References:
//   - C28-DATA-PANEL-AND-AUTOMATION.md §2 (schema table)
//   - master plan Part VI (DAT-α-1 substrate slice)

import { z } from 'zod';

/**
 * A single per-parameter filter clause.
 *
 *   - `paramName`  the parameter on the element to test against
 *     (e.g. `"height"`, `"isExterior"`, `"finish"`).
 *   - `op`         the comparison operator.  `'in'` / `'nin'` expect an
 *                  array `value`; the other operators expect a scalar.
 *                  The schema does NOT enforce op ↔ value-shape pairing;
 *                  the data engine resolves that at evaluation time.
 *   - `value`      string | number | boolean | string[] | number[].
 */
export const ParameterFilterSchema = z.object({
    paramName: z.string().min(1),
    op: z.enum(['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'in', 'nin', 'contains']),
    value: z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.array(z.string()),
        z.array(z.number()),
    ]),
});
export type ParameterFilter = z.infer<typeof ParameterFilterSchema>;

/**
 * The Data tab's active filter.  Each field is optional — an empty
 * object `{}` is a valid filter and selects all elements.
 *
 *   - `type`               element-type discriminators (e.g. `'wall'`).
 *   - `level`              level / floor ids.
 *   - `apartment`          apartment / unit ids.
 *   - `room`               room / space ids.
 *   - `parameterFilters`   per-parameter predicates (AND-combined).
 */
export const DataFilterSchema = z.object({
    type: z.array(z.string()).optional(),
    level: z.array(z.string()).optional(),
    apartment: z.array(z.string()).optional(),
    room: z.array(z.string()).optional(),
    parameterFilters: z.array(ParameterFilterSchema).optional(),
});
export type DataFilter = z.infer<typeof DataFilterSchema>;
