/**
 * IFC `GloballyUniqueId` helpers — **re-exports only**.
 *
 * ⭐ L-8502. This file used to hold its own implementation of buildingSMART's
 * encoder. It was CORRECT (verified: bijective over 20k random UUIDs, first
 * character always in `0..3`, `max` -> `3$$$$$$$$$$$$$$$$$$$$$`) and it had ZERO
 * production call sites, while the pipeline the app actually runs
 * (`packages/file-format/src/export/ifc/**`) wrote raw 36-character UUIDs into
 * `GlobalId` through an identity function.
 *
 * The audit's structural finding was two non-communicating pipelines with
 * divergent feature sets and nothing shared — "not the GUID minter, not the pset
 * writers, not the spatial writer". Copying this implementation into the other
 * pipeline would have produced a second copy free to drift from a third.
 *
 * So the ONE implementation now lives at `@pryzm/schemas/ifc` (L0 — the only
 * layer both `@pryzm/file-format` at L3 and this plugin at L6 can import
 * downward from), and this module is a thin re-export. **There is no longer any
 * code here that could diverge.** Do not re-implement any of it; add to
 * `packages/schemas/src/ifc/GlobalId.ts` instead.
 *
 * See ADR-0362 (pipeline convergence), ADR-0363 (GlobalId stability), C25 §3.
 */

export {
    globalIdFromUuid,
    uuidFromGlobalId,
    isIfcGlobalId,
    globalIdFromStableKey,
    stableUuidFromKey,
    toIfcGlobalId,
    IFC_GLOBAL_ID_ALPHABET,
    IFC_GLOBAL_ID_LENGTH,
} from '@pryzm/schemas/ifc';

const HEX_CHARS = '0123456789abcdef';
function toHex(byte: number): string {
  return (HEX_CHARS[(byte >>> 4) & 0xf] ?? '0') + (HEX_CHARS[byte & 0xf] ?? '0');
}

/**
 * Tiny deterministic UUID builder for tests — accepts a seed string and emits
 * a UUIDv4-shaped value. Not cryptographically random; suitable only for
 * golden-file fixtures.
 *
 * Kept here (rather than moved to L0) deliberately: it is a TEST affordance, and
 * L0 should not grow one. Production determinism is `globalIdFromStableKey`.
 */
export function deterministicUuid(seed: string): string {
  const bytes = new Uint8Array(16);
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = (h >>> ((i % 4) * 8)) & 0xff;
    if (i % 4 === 3) {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      h >>>= 0;
    }
  }
  // Version 4 + RFC 4122 variant bits.
  bytes[6] = (((bytes[6] ?? 0) & 0x0f) | 0x40) & 0xff;
  bytes[8] = (((bytes[8] ?? 0) & 0x3f) | 0x80) & 0xff;
  const hex: string[] = [];
  for (let i = 0; i < 16; i += 1) hex.push(toHex(bytes[i] ?? 0));
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
