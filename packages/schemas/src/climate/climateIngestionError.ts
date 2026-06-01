// A.10.a (Phase A · Sprint 2) — Typed climate ingestion error (C21 §2.9).
//
// Discriminated union the climate-host adapter throws / returns.
// Consumers MUST exhaustively switch on `kind` (TypeScript guarantees
// via assertNever in runtime-composer).

import { z } from 'zod';
import { SiteIdSchema } from '../site/types.js';

/**
 * Per [C21 §2.9] — six known failure modes. Each carries the minimum
 * context the UI needs to surface a useful error message.
 */
export const ClimateIngestionErrorSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('no-site') }),
    z.object({
        kind: z.literal('epw-parse-failed'),
        /** EPW source-file line number where the parse failed. */
        line: z.number().int().min(1),
        message: z.string().min(1).max(2000),
    }),
    z.object({
        kind: z.literal('noaa-fetch-failed'),
        httpStatus: z.number().int().min(100).max(599),
        siteRef: SiteIdSchema,
    }),
    z.object({
        kind: z.literal('license-violation'),
        license: z.string().min(1).max(200),
        siteRef: SiteIdSchema,
    }),
    z.object({
        kind: z.literal('unit-conversion-failed'),
        field: z.string().min(1).max(120),
        rawValue: z.string().min(0).max(200),
    }),
    z.object({
        kind: z.literal('site-coordinates-missing'),
        siteRef: SiteIdSchema,
    }),
]);
export type ClimateIngestionError = z.infer<
    typeof ClimateIngestionErrorSchema
>;
