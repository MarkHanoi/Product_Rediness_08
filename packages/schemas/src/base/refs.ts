import { z } from 'zod';
import type { ElementType, IdFor } from '../types/Id.js';

/**
 * Zod schema that validates any string with the canonical
 * `<prefix>_<26-char ULID>` shape and brands the inferred output as
 * `IdFor<T>`. Use this for cross-store reference fields (e.g. `Door.wallId`).
 */
export function idRef<T extends ElementType>(prefix: T) {
  const re = new RegExp(`^${prefix}_[0-9A-HJKMNP-TV-Z]{26}$`);
  return z.string().regex(re, `Expected ${prefix}_<ulid> id`) as unknown as z.ZodType<IdFor<T>>;
}

/** Literal discriminator for the `type` field of a node schema. */
export function elementType<T extends ElementType>(t: T) {
  return z.literal(t);
}
