// loader/SnapshotIntegrity.ts — L-334 / L-360 save-reload content-integrity checksum.
//
// §SS-FIX-SNAPSHOT-INTEGRITY-CHECKSUM.
//
// Pure, dependency-free primitives that stamp a stable content digest into a
// project snapshot at SAVE and re-verify it at LOAD, so silent byte-corruption
// / truncation of the stored blob is DETECTED — without ever REJECTING a valid
// project.
//
// ── The L-334 / L-360 lesson (why the first attempt was reverted) ────────────
// The original L-334 checksum computed the digest at SAVE over a DIFFERENT
// representation than it was recomputed over at LOAD, producing a systematic
// FALSE "corrupt" that bricked a real 1009-element project (L-360). Two
// confirmed causes, both fixed here:
//   (1) VOLATILE SAVE METADATA — the autosave single-serialize path stamps the
//       digest via a label-free serialize, then mutates `versionLabel` onto the
//       SAME object AFTERWARDS. If the digest covered the label, LOAD (which
//       recomputes WITH the label present) never matched → false "corrupt".
//       → FIX: exclude `versionLabel` (and the `integrity` block itself) from
//         the digest. The checksum covers persisted MODEL CONTENT only.
//   (2) toJSON DIVERGENCE — a Date (or any object with toJSON) hashes as its
//       live structural walk at SAVE but as its JSON (ISO string) form at LOAD.
//       → FIX: mirror JSON.stringify's toJSON contract in canonicalStringify.
// The determinism guarantee this file upholds:
//     computeSnapshotChecksum(s) === computeSnapshotChecksum(JSON.parse(JSON.stringify(s)))
// (proven by the round-trip test). A faithfully-saved project ALWAYS re-verifies.
//
// ── The no-brick mandate (C08 P8) ────────────────────────────────────────────
// A checksum MISMATCH is a resolvable SIGNAL, never a brick. This module only
// COMPUTES and VERIFIES; the loader treats a present-but-mismatched checksum as
// a non-blocking integrity WARNING (load best-effort), and treats an ABSENT
// checksum (legacy/pre-L-334 snapshots) as clean. It never throws or refuses.
//
// Contracts: C05 (persistence & file-format), C48 (backup/DR integrity), C10 (obs).
// Every exported function opens ≥1 OpenTelemetry span (Principle P8).

import { trace, SpanStatusCode, type Attributes, type Span } from '@opentelemetry/api';

const TRACER = trace.getTracer('@pryzm/persistence-client/integrity', '0.1.0');

/** Wrap a synchronous unit of work in an OTel span (P8). */
function withSpan<T>(name: string, attrs: Attributes, fn: (span: Span) => T): T {
  const span = TRACER.startSpan(name, { attributes: attrs });
  try {
    const out = fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return out;
  } catch (err) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
    span.recordException(err as Error);
    throw err;
  } finally {
    span.end();
  }
}

/**
 * Algorithm tag stored in the snapshot so a future format change is detectable.
 * `fnv1a32-canonical-v1`: FNV-1a/32 over a canonical (stable-key-ordered,
 * toJSON-normalised) JSON string, with the canonical length folded in. A fast,
 * synchronous, dependency-free STABLE hash — sufficient to detect byte-corruption
 * / truncation of the stored blob (the L-334 goal), NOT a cryptographic integrity
 * guarantee (the server-side backup tier uses SHA-256 per C48 §1.9; that is a
 * separate concern from in-app content-integrity).
 */
export const INTEGRITY_ALGO = 'fnv1a32-canonical-v1';

/** The integrity block written into the snapshot at SAVE. */
export interface SnapshotIntegrityMeta {
  algo: string;
  checksum: string;
  schemaVersion?: number;
}

// ── Canonical hashing ────────────────────────────────────────────────────────

/**
 * Top-level keys EXCLUDED from the content digest.
 *   • `integrity`    — stores the checksum itself; it cannot summarise itself.
 *   • `versionLabel` — VOLATILE save-time label, NOT model content. The autosave
 *     single-serialize path (§PERF-AUTOSAVE-SINGLE-SERIALIZE) stamps the digest
 *     via a label-free serialize, then writes `snapshot.versionLabel = label`
 *     onto the SAME object AFTERWARDS. Excluding it makes SAVE-checksum ===
 *     LOAD-recompute regardless of when (or whether) the label is set — this is
 *     the exact false-positive that bricked a valid project under L-334/L-360.
 */
const CHECKSUM_EXCLUDED_TOP_KEYS: ReadonlySet<string> = new Set(['integrity', 'versionLabel']);

/**
 * Deterministic JSON string with object keys sorted at every level, so the digest
 * is stable regardless of property insertion order after a stringify/parse
 * round-trip. Volatile top-level metadata keys are excluded so the checksum covers
 * only persisted MODEL CONTENT and matches whether it is computed over the live
 * snapshot (SAVE) or the parsed-back snapshot (LOAD).
 */
function canonicalStringify(value: unknown, excludeTopLevelKeys: ReadonlySet<string>): string {
  const seen = new WeakSet<object>();
  const walk = (raw: unknown, topLevel: boolean): string => {
    // Mirror JSON.stringify's `toJSON` contract BEFORE the structural walk. A Date
    // (or any object with toJSON) is serialised to the store as its toJSON() form
    // (a string) but, without this, would be hashed at SAVE as its empty own-key
    // set (`{}`) — so SAVE (live Date) != LOAD (parsed ISO string) → false
    // "corrupt". Honouring toJSON keeps the two representations identical.
    let v = raw;
    if (v !== null && typeof v === 'object' && typeof (v as { toJSON?: unknown }).toJSON === 'function') {
      v = (v as { toJSON: () => unknown }).toJSON();
    }
    if (v === null || typeof v !== 'object') {
      // Primitives (incl. NaN/Infinity → null, matching JSON.stringify).
      return JSON.stringify(v) ?? 'null';
    }
    if (seen.has(v as object)) return '"[Circular]"';
    seen.add(v as object);
    let out: string;
    if (Array.isArray(v)) {
      out = '[' + v.map((el) => walk(el, false)).join(',') + ']';
    } else {
      const obj = v as Record<string, unknown>;
      const keys = Object.keys(obj)
        // Drop undefined-valued keys — JSON.stringify omits them, so the parsed-back
        // snapshot lacks them entirely; filtering keeps SAVE === LOAD.
        .filter((k) => obj[k] !== undefined)
        .filter((k) => !(topLevel && excludeTopLevelKeys.has(k)))
        .sort();
      out = '{' + keys.map((k) => JSON.stringify(k) + ':' + walk(obj[k], false)).join(',') + '}';
    }
    seen.delete(v as object);
    return out;
  };
  return walk(value, true);
}

/** 32-bit FNV-1a over a UTF-16 code-unit stream, rendered as 8-char hex. */
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts to stay inside 32-bit int math.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Canonical FNV-1a digest over a snapshot, excluding volatile top-level keys. */
function digest(snapshot: unknown): string {
  const canonical = canonicalStringify(snapshot, CHECKSUM_EXCLUDED_TOP_KEYS);
  // Fold the canonical length in so trivial truncation that preserves the hash
  // is caught too.
  return fnv1a(canonical) + '-' + (canonical.length >>> 0).toString(16);
}

/**
 * Stable content digest over a snapshot (volatile save metadata excluded).
 *
 * Computed over exactly the representation LOAD will recompute over
 * (JSON-round-trip-stable via toJSON parity + volatile-key exclusion), so a
 * faithfully-saved project can never read back as a false "corrupt".
 */
export function computeSnapshotChecksum(snapshot: unknown): string {
  return withSpan('pryzm.persistence.checksum.compute', {}, () => digest(snapshot));
}

export interface ChecksumVerification {
  /** Whether the snapshot carries a checksum at all (legacy snapshots do not). */
  present: boolean;
  /** True when absent (legacy) OR present-and-matching. False only on a real mismatch. */
  ok: boolean;
  expected?: string;
  actual?: string;
}

/**
 * Verify a snapshot's stored checksum.
 *
 * • ABSENT checksum  → `{ present:false, ok:true }`. Legacy/pre-L-334 snapshots
 *   simply carry no integrity block; that is NOT corruption and MUST load clean
 *   with no warning (backward-compat mandate).
 * • PRESENT + match  → `{ present:true, ok:true }`.
 * • PRESENT + mismatch → `{ present:true, ok:false, expected, actual }`. The
 *   loader surfaces this as a non-blocking WARNING and loads best-effort; it
 *   NEVER hard-refuses on the checksum alone (the L-360 no-brick lesson).
 */
export function verifySnapshotChecksum(snapshot: unknown): ChecksumVerification {
  return withSpan('pryzm.persistence.checksum.verify', {}, () => {
    const s = snapshot as { integrity?: SnapshotIntegrityMeta; schemaVersion?: number } | null;
    const meta = s?.integrity;
    const expected = meta?.checksum;
    if (typeof expected !== 'string' || expected.length === 0) {
      return { present: false, ok: true };
    }
    // Migration-tolerant: the stored checksum describes the CONTENT AS SAVED, at
    // `integrity.schemaVersion`. If the snapshot reaching us has a different
    // schemaVersion, MigrationEngine has upgraded its content in flight — the
    // pre-migration digest legitimately no longer matches, and recomputing it
    // would raise a FALSE "corrupt" on every migrated project (the L-360 failure
    // mode). Soft-pass; corruption of a migrated snapshot is simply out of scope
    // for a pre-migration checksum, and a false brick is the worse outcome.
    const savedAt = meta?.schemaVersion;
    const now = s?.schemaVersion;
    if (typeof savedAt === 'number' && typeof now === 'number' && savedAt !== now) {
      return { present: true, ok: true, expected };
    }
    const actual = digest(snapshot);
    return actual === expected
      ? { present: true, ok: true, expected, actual }
      : { present: true, ok: false, expected, actual };
  });
}
