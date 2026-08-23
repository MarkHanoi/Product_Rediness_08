// loader/SnapshotIntegrity.ts — L-334 / L-360 / L-8700 save-reload content-integrity checksum.
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
//
// ── THE THIRD MEMBER OF THE SAME FAMILY — L-8700 (2026-08-23) ────────────────
// The founder opened TWO production projects and both reported a mismatch:
//     stored 5b6140fb-50432, computed f14e68b4-5041d
// The digest carries its own canonical length as the hex suffix, so the two
// halves are readable: 0x50432 = 328 242 chars at SAVE, 0x5041d = 328 221 at
// LOAD. **The LOAD side is 21 characters SMALLER.** Content counted by the
// SAVE-side walk is absent from the stored bytes — which is not corruption and
// not truncation, it is the SAVE walk counting members that `JSON.stringify`
// cannot persist at all.
//
// The v1 canonicaliser did not mirror `JSON.stringify` in FOUR ways (each
// MEASURED with a runnable probe; each now covered by a fixture in
// `__tests__/loader/SnapshotIntegrity.test.ts` that FAILS against v1):
//
//   | live member on the snapshot     | v1 canonical  | JSON.stringify | Δ len |
//   |---------------------------------|---------------|----------------|-------|
//   | `{ cb: () => {} }`              | `"cb":null`   | key OMITTED    |  −10  |
//   | `{ s: Symbol('x') }`            | `"s":null`    | key OMITTED    |   −9  |
//   | `{ d: { toJSON: () => undef } }`| `"d":null`    | key OMITTED    |   −9  |
//   | `[1, <hole>, 3]`                | `[1,,3]`      | `[1,null,3]`   |   +4  |
//
// The first three all shrink the LOAD side, which is exactly the sign of the
// founder's delta. `-21` is reachable as one 13-character function/symbol-valued
// property name, or two shorter ones. The v1 `.filter(k => obj[k] !== undefined)`
// guard looked like it covered this — it does not: it runs BEFORE `toJSON`, and
// it tests for `undefined`, never for `function` / `symbol`.
//
// WHY THE ROUND-TRIP TEST WAS GREEN THE WHOLE TIME: its fixture was pure JSON.
// A test whose fixture cannot contain the defect cannot fail on the defect, and
// is worth less than no test, because it is read as proof. The fixture set is
// now adversarial by construction.
//
// The determinism guarantee this file upholds:
//     computeSnapshotChecksum(s) === computeSnapshotChecksum(JSON.parse(JSON.stringify(s)))
// **v2 holds it for all nineteen probed value classes** (functions, symbols,
// toJSON→undefined, toJSON→function, array holes, Map/Set, NaN/±Infinity, −0,
// Date, lone surrogates, typed arrays, prototype methods, extreme floats). v1
// held it for fifteen of the nineteen.
//
// ── Why the algorithm TAG had to move with the fix ───────────────────────────
// Changing what the canonical form of a snapshot IS changes the algorithm, so
// `INTEGRITY_ALGO` moves `fnv1a32-canonical-v1` → `…-v2`. A tag that keeps
// claiming v1 while the code computes v2 would be a second false statement
// stacked on the first. {@link verifySnapshotChecksum} therefore treats a stored
// digest whose `algo` is NOT the one this build computes as **NOT COMPARABLE**
// (`comparable:false, ok:true`) rather than as a mismatch — the same disposition
// already used for a MIGRATED snapshot, and for the same reason: comparing two
// different algorithms' outputs and calling the difference "corruption" is a
// fabricated verdict. ⛔ This is NOT an exclusion and NOT a softened message:
// nothing was removed from the digest's coverage, and the window is one save
// wide — every project re-stamps at v2 the first time it is saved, after which
// real detection resumes at full strength.
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
 * The SUPERSEDED algorithm tag (L-334 … L-8700).
 *
 * `fnv1a32-canonical-v1`: FNV-1a/32 over {@link canonicalStringifyV1}. Retained,
 * NOT deleted, because (a) it is the tag stamped into every snapshot saved
 * before 2026-08-23 and {@link verifySnapshotChecksum} must recognise it, and
 * (b) {@link computeSnapshotChecksumV1} is what lets the test suite DEMONSTRATE
 * the four asymmetries rather than merely assert that v2 lacks them.
 */
export const INTEGRITY_ALGO_V1 = 'fnv1a32-canonical-v1';

/**
 * Algorithm tag stored in the snapshot so a future format change is detectable.
 * `fnv1a32-canonical-v2`: FNV-1a/32 over a canonical (stable-key-ordered,
 * `JSON.stringify`-EQUIVALENT) JSON string, with the canonical length folded in.
 * A fast, synchronous, dependency-free STABLE hash — sufficient to detect
 * byte-corruption / truncation of the stored blob (the L-334 goal), NOT a
 * cryptographic integrity guarantee (the server-side backup tier uses SHA-256
 * per C48 §1.9; that is a separate concern from in-app content-integrity).
 */
export const INTEGRITY_ALGO = 'fnv1a32-canonical-v2';

/** The integrity block written into the snapshot at SAVE. */
export interface SnapshotIntegrityMeta {
  algo: string;
  checksum: string;
  schemaVersion?: number;
  /**
   * §L-8701 — how many members of the live snapshot `JSON.stringify` could not
   * persist at all (function-valued, symbol-valued, or `toJSON()`→`undefined`).
   * Under v2 these no longer perturb the digest, so this is DIAGNOSTIC, not
   * load-bearing: a non-zero value names real content that is being dropped on
   * every single save, and is worth seeing. Omitted entirely when zero, so a
   * clean snapshot stays byte-identical to a pre-L-8701 one.
   */
  jsonInvisible?: number;
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
 *
 * ⛔ THIS SET IS CLOSED. It has exactly two members and both are save-time
 * METADATA. Adding a MODEL member here to silence a mismatch would delete the
 * checksum's reason to exist while leaving whatever produced the mismatch in
 * place — see C05 §"Integrity digest" and the L-8700 register row. A digest that
 * excludes the largest member of the snapshot is not a digest.
 */
const CHECKSUM_EXCLUDED_TOP_KEYS: ReadonlySet<string> = new Set(['integrity', 'versionLabel']);

/**
 * A member of the LIVE snapshot that `JSON.stringify` cannot persist.
 *
 * These are not "hash quirks" — each one is content that silently does not reach
 * the stored file. Naming them is the point: the L-8700 investigation had to
 * reason about a 21-character delta because nothing in the save path could say
 * WHICH member differed.
 */
export interface JsonInvisibleMember {
  /** Dotted/bracketed path from the snapshot root, e.g. `site.parcel.onChange`. */
  path: string;
  kind: 'function' | 'symbol' | 'toJSON-undefined';
}

interface InvisibleSink {
  count: number;
  members: JsonInvisibleMember[];
}

/** Cap on RETAINED paths (the count is always exact) — a probe must not become the cost. */
const INVISIBLE_PATH_CAP = 25;

/**
 * ⚠ SUPERSEDED — the v1 canonical form, PRESERVED VERBATIM (founder's
 * delete-nothing rule) so that:
 *   • the historical digest of any pre-2026-08-23 snapshot stays reproducible;
 *   • the test suite can PROVE the four save/load asymmetries by exhibiting
 *     them, instead of asserting their absence in v2 and calling that proof.
 *
 * Do NOT call this from production stamping or verification. It is wrong in
 * exactly the four ways documented in this file's header.
 */
export function canonicalStringifyV1(value: unknown, excludeTopLevelKeys: ReadonlySet<string>): string {
  const seen = new WeakSet<object>();
  const walk = (raw: unknown, topLevel: boolean): string => {
    let v = raw;
    if (v !== null && typeof v === 'object' && typeof (v as { toJSON?: unknown }).toJSON === 'function') {
      v = (v as { toJSON: () => unknown }).toJSON();
    }
    if (v === null || typeof v !== 'object') {
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

/**
 * Deterministic JSON string with object keys sorted at every level, EQUIVALENT
 * to `JSON.stringify` in every disposition that changes the emitted characters.
 *
 * The equivalence is the whole point (L-8700). Where `JSON.stringify` OMITS an
 * object key, this omits it; where `JSON.stringify` renders `null`, this renders
 * `null`. Concretely, and each one MEASURED against a v1 counter-example:
 *   • `toJSON` is honoured first, WITH the key argument, exactly as
 *     `JSON.stringify` passes it;
 *   • a value that is (or whose `toJSON()` returns) `undefined`, a `function`,
 *     or a `symbol` is OMITTED in object position and rendered `null` in array
 *     position — v1 rendered `"key":null` in object position, which is the
 *     LOAD-side shrink the founder observed;
 *   • arrays are walked by INDEX, so a hole renders `null` — v1 used `.map`,
 *     which skips holes and lets `join` collapse them to nothing.
 *
 * @param sink optional probe collecting the members `JSON.stringify` cannot
 *   persist. Folded into THIS walk rather than run as a second pass: the save
 *   path already pays one full traversal of a snapshot that can be tens of MB,
 *   and a probe that measures by re-walking the largest member would BE the cost
 *   it reports (the same reasoning as §PROBE-SNAPSHOT-JOURNAL-WEIGHT). When
 *   `sink` is null the path stack is never maintained at all.
 */
function canonicalStringify(
  value: unknown,
  excludeTopLevelKeys: ReadonlySet<string>,
  sink: InvisibleSink | null = null,
): string {
  const seen = new WeakSet<object>();
  const path: string[] = [];

  const record = (kind: JsonInvisibleMember['kind']): void => {
    if (!sink) return;
    sink.count++;
    if (sink.members.length < INVISIBLE_PATH_CAP) {
      sink.members.push({ path: path.join('') || '<root>', kind });
    }
  };

  /** Returns the canonical text, or `undefined` when JSON would omit the value. */
  const render = (raw: unknown, key: string, topLevel: boolean): string | undefined => {
    let v = raw;
    if (v !== null && typeof v === 'object' && typeof (v as { toJSON?: unknown }).toJSON === 'function') {
      v = (v as { toJSON: (k: string) => unknown }).toJSON(key);
      if (v === undefined || typeof v === 'function' || typeof v === 'symbol') {
        record('toJSON-undefined');
        return undefined;
      }
    }
    if (v === undefined) return undefined;
    if (typeof v === 'function') { record('function'); return undefined; }
    if (typeof v === 'symbol') { record('symbol'); return undefined; }
    if (v === null || typeof v !== 'object') {
      // Primitives (incl. NaN/±Infinity → null, matching JSON.stringify).
      return JSON.stringify(v) ?? 'null';
    }
    if (seen.has(v as object)) return '"[Circular]"';
    seen.add(v as object);
    let out: string;
    if (Array.isArray(v)) {
      const parts: string[] = [];
      for (let i = 0; i < v.length; i++) {
        if (sink) path.push('[' + i + ']');
        // A HOLE reads as `undefined` here and renders `null` — which is exactly
        // what JSON.stringify emits for it. Never `.map`: map skips holes.
        parts.push(render(v[i], String(i), false) ?? 'null');
        if (sink) path.pop();
      }
      out = '[' + parts.join(',') + ']';
    } else {
      const obj = v as Record<string, unknown>;
      const keys = Object.keys(obj)
        // Drop undefined-valued keys up front — JSON.stringify omits them, so the
        // parsed-back snapshot lacks them entirely; filtering keeps SAVE === LOAD.
        // NOT recorded in the sink: writing `key: undefined` for an absent optional
        // is the serializer's deliberate idiom (see ProjectSerializer's `provenance`
        // / `site` / `ifcElementMeta` blocks), not a member being lost.
        .filter((k) => obj[k] !== undefined)
        .filter((k) => !(topLevel && excludeTopLevelKeys.has(k)))
        .sort();
      const parts: string[] = [];
      for (const k of keys) {
        if (sink) path.push(path.length === 0 ? k : '.' + k);
        const rendered = render(obj[k], k, false);
        if (sink) path.pop();
        if (rendered !== undefined) parts.push(JSON.stringify(k) + ':' + rendered);
      }
      out = '{' + parts.join(',') + '}';
    }
    seen.delete(v as object);
    return out;
  };

  return render(value, '', true) ?? 'null';
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

/** Fold the canonical length into the digest so truncation that preserves the hash is caught too. */
function stamp(canonical: string): string {
  return fnv1a(canonical) + '-' + (canonical.length >>> 0).toString(16);
}

/** Canonical FNV-1a digest over a snapshot, excluding volatile top-level keys. */
function digest(snapshot: unknown, sink: InvisibleSink | null = null): string {
  return stamp(canonicalStringify(snapshot, CHECKSUM_EXCLUDED_TOP_KEYS, sink));
}

/**
 * The canonical LENGTH a digest encodes, or `undefined` if it is unparseable.
 *
 * The suffix after the dash is `canonical.length` in hex, so a mismatch's two
 * digests carry a readable Δ. That Δ — not the hash halves — is what identified
 * L-8700 (`0x50432 → 0x5041d`, LOAD 21 characters SHORTER). Exported so the
 * loader can put it in the message instead of making the reader do hex by hand.
 */
export function decodeCanonicalLength(checksum: string | undefined): number | undefined {
  if (typeof checksum !== 'string') return undefined;
  const dash = checksum.lastIndexOf('-');
  if (dash < 0) return undefined;
  const n = Number.parseInt(checksum.slice(dash + 1), 16);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Stable content digest over a snapshot (volatile save metadata excluded).
 *
 * Computed over exactly the representation LOAD will recompute over
 * (JSON-round-trip-stable via `JSON.stringify` equivalence + volatile-key
 * exclusion), so a faithfully-saved project can never read back as a false
 * "corrupt".
 */
export function computeSnapshotChecksum(snapshot: unknown): string {
  return withSpan('pryzm.persistence.checksum.compute', {}, () => digest(snapshot));
}

/**
 * ⚠ SUPERSEDED digest — v1, for verifying pre-2026-08-23 snapshots in a
 * diagnostic and for exhibiting the four asymmetries in the test suite. Never
 * used to STAMP.
 */
export function computeSnapshotChecksumV1(snapshot: unknown): string {
  return withSpan('pryzm.persistence.checksum.compute_v1', { algo: INTEGRITY_ALGO_V1 }, () =>
    stamp(canonicalStringifyV1(snapshot, CHECKSUM_EXCLUDED_TOP_KEYS)),
  );
}

export interface ChecksumReport {
  checksum: string;
  /** Exact count of members `JSON.stringify` cannot persist (may exceed `members.length`). */
  jsonInvisibleCount: number;
  /** Up to {@link INVISIBLE_PATH_CAP} named paths, for the console line. */
  jsonInvisible: JsonInvisibleMember[];
}

/**
 * The digest PLUS the list of live members `JSON.stringify` cannot persist.
 *
 * ⭐ This is the instrument L-8700 did not have. Under v2 those members no
 * longer perturb the digest, so this cannot re-raise the false alarm — but each
 * one is still content that never reaches the file, and a save path that drops
 * content silently is the defect shape this repository keeps re-learning
 * ("committed ≠ reachable"). One walk, no second pass.
 */
export function computeSnapshotChecksumWithReport(snapshot: unknown): ChecksumReport {
  return withSpan('pryzm.persistence.checksum.compute_reported', {}, (span) => {
    const sink: InvisibleSink = { count: 0, members: [] };
    const checksum = digest(snapshot, sink);
    span.setAttribute('pryzm.integrity.json_invisible', sink.count);
    return { checksum, jsonInvisibleCount: sink.count, jsonInvisible: sink.members };
  });
}

export interface ChecksumVerification {
  /** Whether the snapshot carries a checksum at all (legacy snapshots do not). */
  present: boolean;
  /** True when absent (legacy) OR not comparable OR present-and-matching. False only on a real mismatch. */
  ok: boolean;
  /**
   * Whether the stored digest could be COMPARED at all. False when the snapshot
   * was stamped by a different algorithm version, or migrated to a different
   * schemaVersion since it was stamped. Only set when a checksum is present.
   */
  comparable?: boolean;
  /** Why it was not comparable — a fact, never a verdict about the user's file. */
  note?: string;
  /** The `integrity.algo` the snapshot was stamped with, when present. */
  algo?: string;
  expected?: string;
  actual?: string;
  /** Canonical lengths decoded from the two digests (see {@link decodeCanonicalLength}). */
  expectedBytes?: number;
  actualBytes?: number;
}

/**
 * Verify a snapshot's stored checksum.
 *
 * • ABSENT checksum  → `{ present:false, ok:true }`. Legacy/pre-L-334 snapshots
 *   simply carry no integrity block; that is NOT corruption and MUST load clean
 *   with no warning (backward-compat mandate).
 * • DIFFERENT ALGORITHM (`integrity.algo !== INTEGRITY_ALGO`) → `{ present:true,
 *   ok:true, comparable:false }`. §L-8700. This build cannot reproduce another
 *   algorithm's digest, so any difference between them is uninformative; calling
 *   it "corruption" would be a fabricated verdict, and calling it "clean" would
 *   overclaim — hence `comparable:false` with the reason attached. Self-limiting:
 *   the project re-stamps at the current algorithm on its next save.
 * • MIGRATED (`integrity.schemaVersion !== snapshot.schemaVersion`) → the same
 *   disposition, for the same reason: MigrationEngine has legitimately rewritten
 *   the content the pre-migration digest described.
 * • PRESENT + match  → `{ present:true, ok:true, comparable:true }`.
 * • PRESENT + mismatch → `{ present:true, ok:false, comparable:true, … }`. The
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

    // §L-8700 — ALGORITHM DRIFT. A digest is only meaningful against the
    // algorithm that produced it. `fnv1a32-canonical-v1` mis-hashed live members
    // that JSON.stringify omits (functions, symbols, toJSON→undefined) and
    // collapsed array holes; v2 mirrors JSON.stringify exactly. Re-hashing a v1
    // snapshot with v2 code and reporting the difference as corruption is
    // precisely the false accusation this module exists to avoid.
    const algo = meta?.algo;
    if (typeof algo === 'string' && algo.length > 0 && algo !== INTEGRITY_ALGO) {
      return {
        present: true,
        ok: true,
        comparable: false,
        algo,
        expected,
        expectedBytes: decodeCanonicalLength(expected),
        note:
          `stamped with "${algo}"; this build computes "${INTEGRITY_ALGO}" (§L-8700). ` +
          `Two different algorithms' digests are not comparable — the project will be ` +
          `re-stamped at "${INTEGRITY_ALGO}" on its next save.`,
      };
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
      return {
        present: true,
        ok: true,
        comparable: false,
        algo,
        expected,
        expectedBytes: decodeCanonicalLength(expected),
        note: `stamped at schemaVersion ${savedAt} but migrated to ${now} in flight; the pre-migration digest no longer describes this content.`,
      };
    }

    const actual = digest(snapshot);
    const common = {
      present: true as const,
      comparable: true as const,
      algo,
      expected,
      actual,
      expectedBytes: decodeCanonicalLength(expected),
      actualBytes: decodeCanonicalLength(actual),
    };
    return actual === expected ? { ...common, ok: true } : { ...common, ok: false };
  });
}
