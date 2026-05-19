import { z } from 'zod';
import { Metadata, IfcData } from './primitives.js';
import { elementType } from './refs.js';
import type { ElementType, IdFor } from '../types/Id.js';
import { createId } from '../factory/createId.js';

/**
 * Fields every PRYZM 2 node carries. Concrete element schemas extend this and
 * narrow `id` / `type` to their typed brand and literal discriminator.
 */
export const BaseNodeShape = {
  parentId: z.string().nullable().default(null),
  childrenIds: z.array(z.string()).default([]),
  // NOTE: zod v4's `.default(v)` uses `v` AS-IS (no re-parse), so we must
  // hand it a fully-populated default — otherwise the first parse would emit
  // `metadata: {}` while the second parse would fill in inner defaults,
  // breaking byte-identical round-trip.
  metadata: Metadata.default(() => Metadata.parse({})),
  ifcData: IfcData.optional(),
};

/**
 * Build the canonical schema for an element family.
 *
 * Returns a Zod object whose `.parse({})` succeeds and produces a fully-typed
 * default instance — the exit-criteria contract for `Wall.parse({})` etc.
 *
 * The `id` field is brand-typed as `IdFor<T>` so consumers see the correct
 * branded ID on the inferred type without having to cast.
 */
export function defineElement<T extends ElementType, ExtShape extends z.ZodRawShape>(
  type: T,
  extension: ExtShape,
) {
  const idRe = new RegExp(`^${type}_[0-9A-HJKMNP-TV-Z]{26}$`);
  // The regex enforces the canonical `<prefix>_<ulid>` shape; the default
  // mints a fresh branded ID when the caller omits one. The cast brands the
  // inferred output type without a runtime change.
  const idField = z
    .string()
    .regex(idRe, `Expected ${type}_<ulid> id`)
    .default(() => createId(type) as string) as unknown as z.ZodType<IdFor<T>>;

  return z.object({
    id: idField,
    // `elementType(type)` is the canonical literal-discriminator helper; the
    // default ensures `Schema.parse({})` succeeds and stamps the discriminator.
    type: elementType(type).default(type),
    ...BaseNodeShape,
    ...extension,
  });
}
