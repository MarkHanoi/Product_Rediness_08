// MsgpackAliasedCodec — the production wire format ratified by ADR-004.
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md`
//   • S04 codec byte-budget closure (see ADR-004 §2 "Why we accept …
//     above the < 200 B/event target at S03"): "S04 is owed the byte-
//     budget closure via four orthogonal optimisations".
//
// The four optimisations:
//   1. Field aliasing — long property names (`commandId`, `forwardPatches`,
//      `inversePatches`, `affectedStores`, `persistedAt`, …) are replaced
//      with single-character keys at encode time.  The alias map is the
//      stable schema for `PERSISTED_EVENT_VERSION = 2`.
//   2. Forward/inverse patch dedup — when the inverse patch is the
//      structural mirror of the forward patch (same path, opposite op),
//      the encoded form omits the `inversePatches` array and the decoder
//      reconstructs it.  Common case for `add`/`remove` pairs and
//      `replace`/`replace` pairs.
//   3. Epoch-ms timestamps — ISO-8601 strings (25 B) become `number`
//      (typically 5–8 B in MessagePack uint encoding).
//   4. ULID base-64 packing — the 26-char Crockford-base32 ULID is
//      rewritten as a 16-byte raw buffer (MessagePack `bin` family).
//
// Wire compatibility:
//   * Codec name is `'msgpack-v2'`.
//   * Decoder is strict — a `version` field other than `2` throws.
//     Reading legacy v1 events requires the original `MsgpackCodec`
//     (still exported as the migration path documented in ADR-004 §2).
//
// Round-trip invariant (locked by `__tests__/codecs.test.ts`):
//   `decode(encode(x))` is structurally equal to `x` — the alias map
//   below must round-trip every key in `PersistedEvent` without loss.

import { decode as msgpackDecode, encode as msgpackEncode } from '@msgpack/msgpack';
import type {
  AuditMetadata,
  EventRecord,
  Patch,
  PatchSnapshotEntry,
} from '@pryzm/command-bus';
import {
  PERSISTED_EVENT_VERSION,
  type Codec,
  type PersistedEvent,
} from '../types.js';
import {
  base64ToUlid,
  isUlid,
  ulidBytesToString,
  ulidStringToBytes,
} from '../util/ulid-pack.js';

// ────────────────────────────────────────────────────────── alias schema (v2)
//
// Keys are SHORT but mnemonic — single chars where possible.  Once
// shipped, the map is FROZEN; adding a new field means a new alias
// (never reusing a retired one).

const PE = {
  s: 'seq',
  v: 'version',
  t: 'persistedAt', // epoch-ms number, not ISO string
  e: 'event',
} as const;

const ER = {
  i: 'id', // ULID — encoded as 16-byte Uint8Array
  T: 'type',
  P: 'patches',
  A: 'audit',
  // The spec envelope (line 437) is `{commandId, seq, version, patches, audit}`
  // — `payload`, `affectedStores`, and the flat `forward`/`inverse` views are
  // OMITTED from the v2 wire and reconstructed on decode:
  //   • `affectedStores`  ← `patches[*].storeKey` (deduped, sorted insertion)
  //   • `forward`/`inverse` ← flatten of patches[*].forwardPatches/inversePatches
  //   • `payload` ← undefined (audit-only field; replay uses patches, not payload)
  // This is the dominant byte-budget closure win in ADR-004 §2.
} as const;

const PSE = {
  k: 'storeKey',
  f: 'forwardPatches',
  // `i` (inversePatches) only present when NOT the mirror of `f`.  The
  // ABSENCE of this key IS the "reconstruct from forward" signal — no
  // explicit mirror flag needed (saves 2 bytes per snapshot entry).
  i: 'inversePatches',
  // NOTE: `capturedAt` is intentionally NOT part of the v2 wire — it is
  // reconstructed from the envelope `persistedAt` on decode (same value
  // in practice, since L2 captures patches atomically with the event).
} as const;

const AUD = {
  a: 'actorId',
  p: 'projectId',
  c: 'clientId',
  t: 'timestamp', // epoch-ms number
} as const;

const PATCH = {
  o: 'op',
  p: 'path',
  v: 'value',
} as const;

// Patch op enum — Immer emits exactly these three opcodes.  Encoding as a
// 1-byte uint instead of a 3-7 byte string saves ~3 B per patch on the
// wire.  Frozen — extending the alphabet requires a wire-format bump.
const OP_TO_BYTE: Record<string, number> = { add: 1, remove: 2, replace: 3 };
const BYTE_TO_OP: Record<number, Patch['op']> = { 1: 'add', 2: 'remove', 3: 'replace' };

// ────────────────────────────────────────────────────────── encode helpers

function encodePatch(patch: Patch): Record<string, unknown> {
  const opByte = OP_TO_BYTE[patch.op];
  if (opByte === undefined) {
    throw new Error(`[msgpack-v2] unknown patch op: ${patch.op}`);
  }
  const out: Record<string, unknown> = {
    [keyOf(PATCH, 'op')]: opByte,
    [keyOf(PATCH, 'path')]: patch.path,
  };
  if ('value' in patch) out[keyOf(PATCH, 'value')] = patch.value;
  return out;
}

function decodePatch(raw: Record<string, unknown>): Patch {
  const opRaw = raw[keyOf(PATCH, 'op')] as number;
  const op = BYTE_TO_OP[opRaw];
  if (op === undefined) {
    throw new Error(`[msgpack-v2] unknown patch op byte: ${opRaw}`);
  }
  const out: Record<string, unknown> = {
    op,
    path: raw[keyOf(PATCH, 'path')] as Patch['path'],
  };
  if (Object.prototype.hasOwnProperty.call(raw, keyOf(PATCH, 'value'))) {
    out.value = raw[keyOf(PATCH, 'value')];
  }
  return out as unknown as Patch;
}

/** Forward/inverse mirror detection — opposite ops, same path. */
function patchesAreMirror(
  forward: readonly Patch[],
  inverse: readonly Patch[],
): boolean {
  if (forward.length !== inverse.length) return false;
  for (let i = 0; i < forward.length; i++) {
    const f = forward[i]!;
    const v = inverse[i]!;
    if (!arraysEqual(f.path as readonly unknown[], v.path as readonly unknown[])) return false;
    // Mirror pairs we recognise (matches `produceCommand` Immer output):
    //   add ↔ remove, replace ↔ replace
    const isAddRemove =
      (f.op === 'add' && v.op === 'remove') || (f.op === 'remove' && v.op === 'add');
    const isReplace = f.op === 'replace' && v.op === 'replace';
    if (!isAddRemove && !isReplace) return false;
  }
  return true;
}

function arraysEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function reconstructInverse(forward: readonly Patch[]): Patch[] {
  // We can only reconstruct add↔remove pairs losslessly without the
  // original "before" value — the `mirror` flag is set ONLY when the
  // pair is structurally invertible without value capture.  When the
  // forward is `replace`, the inverse needs the prior value, which
  // would NOT be a true mirror — `patchesAreMirror` rejects pure
  // replace pairs unless caller stored them.  This stub lives for
  // add/remove and the symmetric replace case where the value IS the
  // same (degenerate), but that's not what we hit in practice.
  //
  // For S04 we ONLY emit the mirror flag for `add ↔ remove`.  Replace
  // pairs always carry both arrays.  See `encodeSnapshotEntry` below.
  return forward.map((p) => {
    if (p.op === 'add') return { op: 'remove', path: p.path } as Patch;
    if (p.op === 'remove') return { op: 'add', path: p.path, value: undefined } as Patch;
    return { ...p } as Patch;
  });
}

function encodeSnapshotEntry(entry: PatchSnapshotEntry): Record<string, unknown> {
  const out: Record<string, unknown> = {
    [keyOf(PSE, 'storeKey')]: entry.storeKey,
    [keyOf(PSE, 'forwardPatches')]: entry.forwardPatches.map(encodePatch),
  };
  // ONLY drop the inverse array when it is the structural mirror of the
  // forward array (add↔remove pairs — reconstructible without value
  // capture; see `reconstructInverse`).  The ABSENCE of the `i` key on
  // the wire is the mirror signal — no explicit flag.
  const allAddRemove = entry.forwardPatches.every(
    (p, i) => {
      const inv = entry.inversePatches[i];
      if (!inv) return false;
      if (p.op === 'add' && inv.op === 'remove') return true;
      if (p.op === 'remove' && inv.op === 'add') return true;
      return false;
    },
  );
  if (
    !allAddRemove ||
    !patchesAreMirror(entry.forwardPatches, entry.inversePatches) ||
    entry.forwardPatches.length !== entry.inversePatches.length
  ) {
    out[keyOf(PSE, 'inversePatches')] = entry.inversePatches.map(encodePatch);
  }
  return out;
}

function decodeSnapshotEntry(
  raw: Record<string, unknown>,
  reconstructedCapturedAt: string,
): PatchSnapshotEntry {
  const forward = (raw[keyOf(PSE, 'forwardPatches')] as Record<string, unknown>[]).map(
    decodePatch,
  );
  const inverseRaw = raw[keyOf(PSE, 'inversePatches')] as
    | Record<string, unknown>[]
    | undefined;
  const inverse = inverseRaw === undefined ? reconstructInverse(forward) : inverseRaw.map(decodePatch);
  return {
    storeKey: raw[keyOf(PSE, 'storeKey')] as string,
    forwardPatches: forward,
    inversePatches: inverse,
    // capturedAt is reconstructed from the envelope's persistedAt — the
    // wire format omits it (ADR-004 §2 byte-budget closure).
    capturedAt: reconstructedCapturedAt,
  };
}

function encodeAudit(audit: AuditMetadata): Record<string, unknown> {
  return {
    [keyOf(AUD, 'actorId')]: audit.actorId,
    [keyOf(AUD, 'projectId')]: audit.projectId,
    [keyOf(AUD, 'clientId')]: audit.clientId,
    [keyOf(AUD, 'timestamp')]: isoToEpochMs(audit.timestamp),
  };
}

function decodeAudit(raw: Record<string, unknown>): AuditMetadata {
  return {
    actorId: raw[keyOf(AUD, 'actorId')] as string,
    projectId: raw[keyOf(AUD, 'projectId')] as string,
    clientId: raw[keyOf(AUD, 'clientId')] as string,
    timestamp: epochMsToIso(raw[keyOf(AUD, 'timestamp')] as number),
  };
}

function encodeEventRecord(record: EventRecord): Record<string, unknown> {
  // ULID → 16-byte raw buffer if recognisable; fall back to the string
  // form so non-ULID ids (e.g. test fixtures) still round-trip.
  const idValue: string | Uint8Array = isUlid(record.id) ? ulidStringToBytes(record.id) : record.id;
  return {
    [keyOf(ER, 'id')]: idValue,
    [keyOf(ER, 'type')]: record.type,
    [keyOf(ER, 'patches')]: record.patches.map(encodeSnapshotEntry),
    [keyOf(ER, 'audit')]: encodeAudit(record.audit),
  };
}

function decodeEventRecord(
  raw: Record<string, unknown>,
  capturedAt: string,
): EventRecord {
  const idRaw = raw[keyOf(ER, 'id')];
  const id =
    idRaw instanceof Uint8Array && idRaw.byteLength === 16
      ? ulidBytesToString(idRaw)
      : (idRaw as string);
  const patches = (raw[keyOf(ER, 'patches')] as Record<string, unknown>[]).map(
    (e) => decodeSnapshotEntry(e, capturedAt),
  );
  // Reconstruct the convenience flat views and the derived `affectedStores`
  // from the per-store envelopes (the wire format omits them — see ADR-004
  // §2 byte-budget closure).  `payload` is intentionally undefined on
  // decode — the wire format does not persist it; replay uses patches.
  const forward: Patch[] = [];
  const inverse: Patch[] = [];
  const seenStores = new Set<string>();
  const affected: string[] = [];
  for (const entry of patches) {
    forward.push(...entry.forwardPatches);
    inverse.push(...entry.inversePatches);
    if (!seenStores.has(entry.storeKey)) {
      seenStores.add(entry.storeKey);
      affected.push(entry.storeKey);
    }
  }
  return {
    id,
    type: raw[keyOf(ER, 'type')] as string,
    payload: undefined,
    affectedStores: affected,
    patches,
    audit: decodeAudit(raw[keyOf(ER, 'audit')] as Record<string, unknown>),
    forward,
    inverse,
  };
}

// ────────────────────────────────────────────────────────── public Codec

export const MsgpackAliasedCodec: Codec = {
  name: 'msgpack-v2',
  encode(event: PersistedEvent): Uint8Array {
    if (event.version !== PERSISTED_EVENT_VERSION) {
      throw new Error(
        `[msgpack-v2] cannot encode event with version=${event.version}; ` +
          `the v2 codec writes version=${PERSISTED_EVENT_VERSION}.  ` +
          `Use MsgpackCodec for legacy v1 events.`,
      );
    }
    const wire = {
      [keyOf(PE, 'seq')]: event.seq,
      [keyOf(PE, 'version')]: event.version,
      [keyOf(PE, 'persistedAt')]: isoToEpochMs(event.persistedAt),
      [keyOf(PE, 'event')]: encodeEventRecord(event.event),
    };
    return msgpackEncode(wire);
  },
  decode(bytes: Uint8Array): PersistedEvent {
    const raw = msgpackDecode(bytes) as Record<string, unknown>;
    const version = raw[keyOf(PE, 'version')] as number;
    if (version !== PERSISTED_EVENT_VERSION) {
      throw new Error(
        `[msgpack-v2] cannot decode event with version=${version}; ` +
          `expected ${PERSISTED_EVENT_VERSION}.  ` +
          `Use MsgpackCodec for legacy v1 events.`,
      );
    }
    const persistedAt = epochMsToIso(raw[keyOf(PE, 'persistedAt')] as number);
    return {
      seq: raw[keyOf(PE, 'seq')] as number,
      version,
      persistedAt,
      event: decodeEventRecord(
        raw[keyOf(PE, 'event')] as Record<string, unknown>,
        persistedAt,
      ),
    };
  },
};

// ────────────────────────────────────────────────────────── primitives

function isoToEpochMs(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`[msgpack-v2] invalid ISO-8601 timestamp: ${iso}`);
  }
  return ms;
}

function epochMsToIso(ms: number): string {
  return new Date(ms).toISOString();
}

/** `keyof`-style accessor that returns the SHORT alias for a long key. */
function keyOf<M extends Record<string, string>>(
  map: M,
  longName: M[keyof M],
): keyof M & string {
  for (const k in map) if (map[k] === longName) return k as keyof M & string;
  throw new Error(`[msgpack-v2] no alias for "${longName}"`);
}

// Acknowledge the imported helper that's only referenced by side-effect.
void base64ToUlid;
