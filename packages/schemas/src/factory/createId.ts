import { ulid as makeUlid } from 'ulid';
import type { ElementType, Id, IdFor } from '../types/Id.js';

/**
 * Produce a freshly-branded ID for a given element prefix.
 *
 * `createId('wall')` → `"wall_01H8X..."` typed as `WallId`.
 * Pass an explicit `ulid` for deterministic tests / fixture replay.
 *
 * Format: `<prefix>_<26-char ULID>`. The ULID is monotonic-ish, sortable, and
 * URL-safe — see https://github.com/ulid/spec.
 */
export function createId<T extends ElementType>(prefix: T, ulid?: string): IdFor<T> {
  const tail = ulid ?? makeUlid();
  if (!isValidUlid(tail)) {
    throw new Error(
      `createId(${prefix}): supplied ulid "${tail}" is not a 26-char Crockford-base32 ULID.`,
    );
  }
  return `${prefix}_${tail}` as IdFor<T>;
}

/**
 * Type guard — true iff `value` looks like an ID with the requested prefix.
 *
 * Runtime check (string shape); the branded TypeScript narrowing is the
 * caller's reward for using `createId`/`isId` rather than raw casts.
 */
export function isId<T extends ElementType>(value: unknown, prefix: T): value is IdFor<T> {
  if (typeof value !== 'string') return false;
  if (!value.startsWith(`${prefix}_`)) return false;
  return isValidUlid(value.slice(prefix.length + 1));
}

/** Parse a typed-ID string back into its prefix + ulid components, or null. */
export function parseId(value: string): { prefix: string; ulid: string } | null {
  const idx = value.indexOf('_');
  if (idx <= 0) return null;
  const prefix = value.slice(0, idx);
  const tail = value.slice(idx + 1);
  if (!isValidUlid(tail)) return null;
  return { prefix, ulid: tail };
}

/** Strip the brand. Use for serialization adapters; never inside business code. */
export function unbrand<T extends string>(id: Id<T>): string {
  return id as unknown as string;
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
function isValidUlid(s: string): boolean {
  return ULID_RE.test(s);
}
