// §STABLE-CREATED-ID — the shared mechanism for C03 §2.6 element-id stability
// across undo → redo.
//
// THE DEFECT CLASS IT CLOSES
// ----------------------------------------------------------------------------
// `CommandManager.redo()` re-runs the SAME command instance's `execute()`. A
// create command that mints its element id INSIDE execute —
//
//     const id = this.payload.id || crypto.randomUUID();     // ← every redo differs
//
// — therefore produces a DIFFERENT element id on every redo. The user sees the
// element "come back", but it is a new element: selection, marks, schedules,
// hosted-child references, the semantic graph and every persisted reference to
// the original id are silently orphaned, and a second undo cannot find what the
// first one removed. The founder's requirement is explicit — an element must
// keep "always the same ID" through undo and redo — and C03 §2.6 says the same:
// ids are pre-generated, never minted in execute.
//
// It was already fixed once, per command, for wall openings ("FIX C7" in
// CreateWallOpeningCommand). The audit found the same shape in the lighting,
// stair-railing, furniture, plumbing and slab creates. This is that fix as ONE
// mechanism rather than N hand-rolled copies.
//
// USAGE — replace the mint site, keep everything else:
//
//     const id = stableCreatedId(this, 'element', this.payload.id);
//
// First call mints (or adopts the caller-supplied id) and memoises it on the
// command instance; every later call — i.e. every redo — returns the SAME
// string. Multi-element creates pass distinct keys (or an index):
//
//     const wallId  = stableCreatedId(this, 'wall');
//     const slabId  = stableCreatedId(this, `slab:${i}`);
//
// The cache lives on the command instance, so it is per-gesture: a NEW command
// object (a fresh user action, or a replay reconstructed from the wire) mints
// fresh ids, exactly as it should. Commands that already pre-generate ids in
// their constructor need no change — they are already compliant.

/** Hidden per-command cache. Non-enumerable so it never reaches serialize(). */
const CACHE = Symbol('pryzm.stableCreatedIds');

interface IdCarrier {
  [CACHE]?: Map<string, string>;
}

/**
 * Return a creation id that is STABLE for the lifetime of this command instance
 * — identical on the first execute and on every redo (C03 §2.6).
 *
 * @param command  the command instance (`this` at the call site)
 * @param key      slot name; use distinct keys for multi-element creates
 * @param supplied an id supplied by the caller/payload — always wins when present,
 *                 so tool-minted and wire-replayed ids are honoured unchanged
 * @param mint     id factory (defaults to `crypto.randomUUID()`)
 */
export function stableCreatedId(
  command: object,
  key: string,
  supplied?: string | null,
  mint: () => string = () => crypto.randomUUID(),
): string {
  if (typeof supplied === 'string' && supplied.length > 0) return supplied;
  const carrier = command as IdCarrier;
  let cache = carrier[CACHE];
  if (!cache) {
    cache = new Map<string, string>();
    Object.defineProperty(command, CACHE, { value: cache, enumerable: false, writable: true, configurable: true });
  }
  const existing = cache.get(key);
  if (existing !== undefined) return existing;
  const minted = mint();
  cache.set(key, minted);
  return minted;
}

/** Test/diagnostic seam: has this command already minted an id for `key`? */
export function hasStableCreatedId(command: object, key: string): boolean {
  return (command as IdCarrier)[CACHE]?.has(key) === true;
}
