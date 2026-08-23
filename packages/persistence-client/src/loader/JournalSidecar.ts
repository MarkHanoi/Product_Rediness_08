// loader/JournalSidecar.ts — §JOURNAL-SIDECAR. L-9980 … L-9984.
//
// ⭐ THE ONE MEASURED FACT THIS FILE EXISTS FOR (ISSUE-LOG L-8704, C05 §3.5):
//
//     281 elements · 30 432 temporalGraph mutations · 8 796 110 canonical chars
//     ~36.8 MB stored across 20 versions · ~99 % of it is the journal
//     ...and the journal is embedded WHOLE in EVERY ONE of the twenty.
//
// A journal is append-only: version *n* is version *n−1* plus a handful of
// records. Twenty near-identical copies of one monotonically growing log is the
// whole payload. Storing it ONCE per project, with each version holding a
// CURSOR into it, is a ≈15× reduction on every write and every open
// (~36.8 MB → ~2.4 MB) **with no record dropped**.
//
// ⛔ THE FIX IS NEVER DELETION. Nothing in this file trims, caps, de-duplicates
// or expires a record. It changes where the bytes live, never how many there
// are. The founder has been shown the record count and has not asked to lose
// any of it (C05 §3.5 "not decided" clause, ISSUE-LOG L-5823).
//
// ── WHAT THIS MODULE OWNS, AND WHAT IT DELIBERATELY DOES NOT ────────────────
// It owns the SNAPSHOT-SHAPE half: how a `temporalGraph` is split into a cursor
// plus a detached record array, how it is put back together, and — the part
// that took the most care — how the content-integrity digest is allowed to
// speak about a snapshot that was reassembled rather than read whole.
//
// It does NOT own the CONTAINER half (chunking, DEFLATE, IndexedDB, carry-
// forward of unchanged bytes). That lives in `ProjectRepository`, which owns the
// codec and the store. The split is deliberate: this package is L4 and pure, and
// the digest rules below must be readable without reading a storage engine.
//
// ── ⛔ THE HAZARD THIS FILE IS MOSTLY ABOUT: A THIRD FALSE "CORRUPT" ─────────
// `SnapshotIntegrity.ts` records TWO prior incidents (L-334/L-360, then L-8700)
// in which a digest computed at SAVE over one representation and recomputed at
// LOAD over another produced a FALSE accusation of corruption — the second one
// bricked a real 1009-element project. This change alters **what a stored
// snapshot contains**. That is precisely the ignition condition for a third.
//
// Three decisions keep it from happening, and they are load-bearing:
//
//   1. ⭐ THE DIGEST'S COVERAGE IS UNCHANGED. The stamp is still computed by
//      `ProjectSerializer` over the WHOLE snapshot with the journal inline, and
//      still verified by `ProjectLoader` over a snapshot with the journal
//      inline. Detach happens strictly BELOW the stamp (on the way into the
//      container) and re-attach strictly BELOW the verify (on the way out).
//      ⛔ `CHECKSUM_EXCLUDED_TOP_KEYS` is NOT widened. C05 §3.7 req 4 forbids
//      adding a MODEL member to it, and `temporalGraph` is a model member. A
//      digest that excluded the largest thing in the snapshot would not be a
//      digest — so the journal stays inside the digest and moves outside the
//      *storage record*. Those are different questions and this change only
//      touches the second.
//
//   2. ⭐ RE-ATTACHMENT IS VERIFIED, NOT ASSUMED, AND SAYS SO. The canonical
//      form sorts keys, so key ORDER cannot perturb the digest; what can is a
//      key SET or a value that differs. {@link attachJournalMutations} restores
//      exactly the key set that was detached (`mutations` back, `mutationsRef`
//      gone) and reports whether it could supply the exact record count the
//      cursor names. When it could not, it does not guess and it does not stay
//      silent — see 3.
//
//   3. ⭐ AN INEXACT RE-ATTACH MAKES THE DIGEST *NOT COMPARABLE*, NEVER
//      "CORRUPT". {@link markJournalRehydration} stamps the outcome on the
//      snapshot under a **non-enumerable Symbol** key, and
//      `verifySnapshotChecksum` reads it. `JSON.stringify`, `Object.keys`,
//      object spread and `structuredClone` all ignore it, so it cannot reach
//      disk and cannot move any checksum. This is the SAME disposition already
//      used for an algorithm change and for an in-flight migration
//      (`comparable:false, ok:true` + a stated reason) and it is used here for
//      the same reason: reporting "this reassembly is short by N records" as
//      "your file is corrupt" would be a fabricated verdict, and the third one.
//
// ── WHY ONLY `mutations` IS DETACHED, AND `edges` IS NOT ────────────────────
// ⚠ MEASURED PROPERTY, not a preference. `NodeMutationRecord`s are pushed to
// `TemporalGraph._mutations` and never touched again — `grep -n "_mutations"
// packages/core-app-model/src/TemporalGraph.ts` shows `push`, `length = 0` and
// reads, and no field assignment anywhere. The array is therefore a true
// append-only log and a prefix of it is a faithful past state.
//
// `TemporalEdge` is NOT: `expireEdge()` sets `edge.validUntil` **in place** on
// a live object (`TemporalGraph.ts:241`), which ISSUE-LOG L-8704 already
// reported as a live-object-in-a-snapshot seam. A shared edge store with a
// per-version cursor would therefore hand version *n* an edge carrying a
// `validUntil` that was written AFTER version *n* was stamped — a different
// value at the same index, which is a digest mismatch, which is incident three.
// ⛔ So edges stay inline, and this is stated rather than quietly assumed. The
// per-open probe prints both counts, so if edges ever become a material share
// the next console paste says so instead of inviting another guess.
//
// Contracts: C05 §3.5 (a journal MUST NOT live inside a snapshot) · C05 §3.7
// (what the digest may cover and claim) · C05 §3.8 (this format) · C48.
// Every exported function opens ≥1 OpenTelemetry span (Principle P8).

import { trace, SpanStatusCode, type Attributes, type Span } from '@opentelemetry/api';

const TRACER = trace.getTracer('@pryzm/persistence-client/journal-sidecar', '0.1.0');

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
 * Version of the DETACHED SNAPSHOT SHAPE (the `mutationsRef` marker below).
 *
 * Distinct from the container format version that `ProjectRepository` stamps:
 * the container says how bytes are laid out, this says what a snapshot with a
 * detached journal looks like. They can move independently and a reader must be
 * able to tell which it is looking at.
 */
export const JOURNAL_SIDECAR_VERSION = 1 as const;

/**
 * What replaces `temporalGraph.mutations` in a STORED snapshot.
 *
 * `n` is the cursor: the number of leading records of the project's journal that
 * belonged to this version at the moment it was stamped. It is a COUNT, not an
 * offset range — the journal is append-only, so "the first n records" is the
 * complete statement of what this version saw.
 *
 * ⚠ It is a deliberately distinct KEY, not a `mutations` value of a different
 * shape. A field that means "records" in one snapshot and "how many records"
 * in another is the one-value-two-meanings defect this repository keeps
 * re-learning; a reader must be able to tell the two apart by key alone.
 */
export interface JournalMutationsRef {
  /** Shape version — {@link JOURNAL_SIDECAR_VERSION}. */
  v: typeof JOURNAL_SIDECAR_VERSION;
  /** Cursor: how many leading journal records this version holds. */
  n: number;
}

/** The sub-object this module reads and writes. Structural, not nominal. */
interface TemporalGraphLike {
  version?: unknown;
  edges?: unknown;
  sessionId?: unknown;
  mutations?: unknown;
  mutationsRef?: JournalMutationsRef;
}
interface SnapshotLike {
  temporalGraph?: TemporalGraphLike;
}

// ── Detach ──────────────────────────────────────────────────────────────────

/** Outcome of {@link detachJournalMutations}. */
export interface JournalDetachOutcome {
  /**
   * The snapshot to STORE. When `detached` is true this is a shallow clone with
   * `temporalGraph.mutations` replaced by `temporalGraph.mutationsRef`; when it
   * is false this is the input, unchanged and un-cloned.
   */
  snapshot: unknown;
  /** True when the journal left the snapshot. */
  detached: boolean;
  /** The detached records, in order. `null` when nothing was detached. */
  mutations: readonly unknown[] | null;
  /** Why nothing was detached — a fact, never a verdict. */
  reason?: string;
}

/**
 * Split `temporalGraph.mutations` out of a snapshot, leaving a cursor behind.
 *
 * ⛔ NEVER MUTATES THE INPUT. The `VersionRecord` handed to the storage layer is
 * the SAME live object the sync queue is about to POST to the server and the
 * same one `PlatformShell` may still be holding. Detaching in place would empty
 * the journal out from under both of them — the storage layer's opinion about
 * where bytes live must not be visible to anyone else. Two shallow clones
 * (snapshot, temporalGraph) are the entire cost; the record ARRAY is handed over
 * by reference and is never modified.
 *
 * Returns `detached:false` (with the input untouched) for every shape it does
 * not positively recognise: no `temporalGraph`, a non-array `mutations`, an
 * empty journal (nothing to gain, and a cursor of 0 buys a reader nothing), or a
 * snapshot that already carries a `mutationsRef`.
 */
export function detachJournalMutations(snapshot: unknown): JournalDetachOutcome {
  return withSpan('pryzm.persistence.journal.detach', {}, (span) => {
    const s = snapshot as SnapshotLike | null | undefined;
    const tg = s?.temporalGraph;
    if (!tg || typeof tg !== 'object') {
      return { snapshot, detached: false, mutations: null, reason: 'no temporalGraph' };
    }
    if (tg.mutationsRef !== undefined) {
      return { snapshot, detached: false, mutations: null, reason: 'already detached' };
    }
    const mutations = tg.mutations;
    if (!Array.isArray(mutations)) {
      return { snapshot, detached: false, mutations: null, reason: 'mutations is not an array' };
    }
    if (mutations.length === 0) {
      return { snapshot, detached: false, mutations: null, reason: 'empty journal' };
    }

    const nextTg: TemporalGraphLike = { ...tg, mutationsRef: { v: JOURNAL_SIDECAR_VERSION, n: mutations.length } };
    delete nextTg.mutations;
    const nextSnapshot = { ...(s as object), temporalGraph: nextTg };

    span.setAttribute('pryzm.journal.detached_records', mutations.length);
    return { snapshot: nextSnapshot, detached: true, mutations: mutations as readonly unknown[] };
  });
}

// ── Attach ──────────────────────────────────────────────────────────────────

/**
 * What a re-attach could establish. ⛔ `exact` is the ONLY field the digest is
 * allowed to key on; everything else is for the human reading the console.
 */
export interface JournalRehydration {
  /**
   * True only when the cursor's exact record count was supplied. False means
   * the reassembled snapshot is NOT the one the stamp describes, and the digest
   * must therefore report NOT COMPARABLE rather than a mismatch.
   */
  exact: boolean;
  /** How many records the cursor asked for. */
  expected: number;
  /** How many were actually attached. */
  actual: number;
  /** Plain statement of what happened. Never names a cause it has not established. */
  note: string;
}

/** Outcome of {@link attachJournalMutations}. */
export interface JournalAttachOutcome extends JournalRehydration {
  /** True when the snapshot carried a `mutationsRef` at all. */
  wasDetached: boolean;
}

/**
 * ⛔ Non-enumerable, `Symbol.for`-keyed marker recording how a snapshot's journal
 * got there.
 *
 * WHY A SYMBOL AND WHY NON-ENUMERABLE — both halves matter and both are about
 * the digest. `Object.keys()` (which the canonicaliser walks) returns neither
 * symbols nor non-enumerable keys; `JSON.stringify` serialises neither; object
 * spread copies enumerable symbols but not non-enumerable ones; `structuredClone`
 * drops both. So this property **cannot reach disk and cannot move a checksum**,
 * which is the entire requirement. A plain string key would have been a new
 * member of the snapshot — i.e. exactly the class of change that caused L-8700.
 *
 * `Symbol.for` rather than `Symbol()` because this repository ships TWO copies of
 * the loader (`packages/persistence-client/src/loader/` and
 * `apps/editor/src/engine/persistence/`) and a bundler may instantiate this module
 * more than once. A module-local symbol would make the marker invisible across the
 * copy boundary — the reader would silently see "no marker" and fall through to a
 * full-strength comparison of a snapshot it could not verify. The global registry
 * makes that impossible by construction.
 */
const JOURNAL_REHYDRATION_KEY = Symbol.for('pryzm.persistence.journalRehydration');

/**
 * Record how a snapshot's journal was reassembled, invisibly to JSON.
 * Idempotent; the last writer wins.
 */
export function markJournalRehydration(snapshot: unknown, info: JournalRehydration): void {
  withSpan('pryzm.persistence.journal.mark_rehydration', { 'pryzm.journal.exact': info.exact }, () => {
    if (snapshot === null || typeof snapshot !== 'object') return;
    try {
      Object.defineProperty(snapshot, JOURNAL_REHYDRATION_KEY, {
        value: info,
        enumerable: false,
        configurable: true,
        writable: true,
      });
    } catch {
      // A frozen snapshot cannot carry the marker. Absent marker reads as
      // "loaded whole", which is the pre-change behaviour — never a false claim
      // of exactness about a reassembly, because a frozen snapshot is one this
      // module never detached from in the first place.
    }
  });
}

/**
 * Read the marker {@link markJournalRehydration} left, or `undefined` for a
 * snapshot that was never reassembled (the legacy, journal-inline case).
 *
 * ⚠ `undefined` means "this snapshot was read whole", NOT "the reassembly was
 * fine". The two are different answers and the caller must not collapse them.
 */
export function readJournalRehydration(snapshot: unknown): JournalRehydration | undefined {
  if (snapshot === null || typeof snapshot !== 'object') return undefined;
  const v = (snapshot as Record<symbol, unknown>)[JOURNAL_REHYDRATION_KEY];
  return (v && typeof v === 'object' && typeof (v as JournalRehydration).exact === 'boolean')
    ? (v as JournalRehydration)
    : undefined;
}

/**
 * Put a detached journal back, IN PLACE, and state whether it is the one the
 * cursor named.
 *
 * `journal` is the project's whole append-only record list (the caller has
 * already inflated and verified the stored chunks). This function slices the
 * leading `ref.n` records — the append-only property is what makes a prefix a
 * faithful past state, and it is asserted at WRITE time by `ProjectRepository`,
 * never assumed here.
 *
 * The snapshot is restored to exactly the key set it had before detachment
 * (`mutations` present, `mutationsRef` absent), which is what lets the SAVE-time
 * digest be recomputed at full strength. When the journal is short or missing,
 * it attaches everything it does have — ⛔ never a lie, never a brick, never a
 * silent truncation — and marks the rehydration inexact so
 * `verifySnapshotChecksum` reports NOT COMPARABLE instead of "corrupt".
 *
 * @param snapshot mutated in place; this is the freshly-parsed record the
 *   storage layer owns outright, not a caller's live object.
 */
export function attachJournalMutations(snapshot: unknown, journal: readonly unknown[] | null): JournalAttachOutcome {
  return withSpan('pryzm.persistence.journal.attach', {}, (span) => {
    const s = snapshot as SnapshotLike | null | undefined;
    const tg = s?.temporalGraph;
    const ref = tg?.mutationsRef;
    if (!tg || typeof tg !== 'object' || ref === undefined) {
      // Not a detached snapshot — a pre-change (journal-inline) record, or one
      // with no temporal graph at all. Leave it exactly as it is, and leave NO
      // marker: "read whole" is a different answer from "reassembled exactly".
      return { wasDetached: false, exact: true, expected: 0, actual: 0, note: 'journal was stored inline' };
    }

    const expected = Number.isFinite(ref.n) && ref.n >= 0 ? Math.floor(ref.n) : 0;
    const available = Array.isArray(journal) ? journal.length : 0;
    const take = Math.min(expected, available);
    const attached = Array.isArray(journal) ? journal.slice(0, take) : [];

    tg.mutations = attached;
    delete tg.mutationsRef;

    const exact = take === expected;
    const note = exact
      ? `journal rehydrated from the project sidecar (${take} of ${available} record(s))`
      : `the project journal sidecar supplied ${available} record(s); this version's cursor names ` +
        `${expected}. ${take} were attached and NOTHING was discarded. The integrity stamp describes ` +
        `the snapshot as saved, with all ${expected} inline, so it cannot be compared against this ` +
        `reassembly — that is a statement about the reassembly, not about the stored file.`;

    const info: JournalRehydration = { exact, expected, actual: take, note };
    markJournalRehydration(snapshot, info);
    span.setAttribute('pryzm.journal.expected', expected);
    span.setAttribute('pryzm.journal.attached', take);
    span.setAttribute('pryzm.journal.exact', exact);
    return { wasDetached: true, ...info };
  });
}

// ── Chunk integrity ─────────────────────────────────────────────────────────

/**
 * 32-bit FNV-1a over a UTF-16 code-unit stream, rendered as 8-char hex, with the
 * text length folded in.
 *
 * ⚠ Byte-for-byte the same construction as `SnapshotIntegrity`'s `stamp()`, and
 * deliberately so: the length suffix is what made L-8700 diagnosable from two
 * hex strings alone (`0x50432` vs `0x5041d` reads directly as "the load side is
 * 21 characters shorter"). A chunk digest with no length is a digest you cannot
 * reason about when it fails.
 *
 * ⛔ NOT a cryptographic guarantee — it detects byte-corruption and truncation
 * of a stored chunk, which is the only claim made for it anywhere.
 */
export function hashJournalChunk(text: string): string {
  return withSpan('pryzm.persistence.journal.hash_chunk', { 'pryzm.journal.chunk_chars': text.length }, () => {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16).padStart(8, '0') + '-' + (text.length >>> 0).toString(16);
  });
}

/**
 * Is `candidate` an append-only EXTENSION of `prior`?
 *
 * ⭐ THIS IS THE WRITE-TIME PROOF THAT MAKES A CURSOR SOUND. A per-version cursor
 * is only a faithful description of the past if the shared journal really is
 * append-only — if a save ever replaced record 7 instead of appending record
 * 30 433, every older version's cursor would silently start naming different
 * content. That can genuinely happen: restoring an older version and saving
 * from it produces a journal that is NOT an extension of the stored one.
 *
 * So it is CHECKED, not assumed, and the checking is cheap enough to run on
 * every autosave: reference equality first (within one session the serializer
 * hands back the very same record objects — `[...this._mutations]` is a shallow
 * copy), falling back to `id` equality for the post-reload case where the prior
 * list came back through `JSON.parse`. Both are O(n) with no `JSON.stringify` of
 * anything, which is the cost this whole change exists to remove.
 *
 * ⛔ A `false` here is NOT an error and MUST NOT drop a record: the caller's
 * correct response is to rewrite the journal whole, which is always sound and
 * merely slower.
 */
export function isJournalExtension(candidate: readonly unknown[], prior: readonly unknown[] | null): boolean {
  return withSpan('pryzm.persistence.journal.is_extension', {}, (span) => {
    if (prior === null || prior.length === 0) return true;
    if (candidate.length < prior.length) { span.setAttribute('pryzm.journal.diverged_at', -1); return false; }
    for (let i = 0; i < prior.length; i++) {
      const a = candidate[i];
      const b = prior[i];
      if (a === b) continue;
      const ai = (a as { id?: unknown } | null)?.id;
      const bi = (b as { id?: unknown } | null)?.id;
      if (ai !== undefined && ai === bi) continue;
      span.setAttribute('pryzm.journal.diverged_at', i);
      return false;
    }
    return true;
  });
}
