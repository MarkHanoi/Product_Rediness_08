// @pryzm/sync-client — CRDTConflictResolver (Wave A19-T3; Phase 2D)
//
// CONTRACT (C08 §3.1, §3.2):
// When Yjs CRDT produces a semantically ambiguous merge (two clients edited
// the same scalar property concurrently and neither can be cleanly derived
// from the other), the system MUST:
//   1. Attempt auto-merge using the 3-way rules below.
//   2. If auto-merge succeeds → apply the merged value silently (no dialog).
//   3. If auto-merge fails (returns null) → surface a CRDTConflict descriptor
//      to the YjsDocAdapter, which sets runtime.sync.status = 'CONFLICTED'
//      and shows the ConflictResolutionDialog to the user.
//
// P8 compliance: silent LWW overwrite is FORBIDDEN.  Any code path that
// would silently discard either side must use this resolver instead.
//
// OTel: every public method has a span per P8 span requirement.

import { trace } from '@opentelemetry/api';
import type { CRDTConflict } from './YjsDocAdapter.js';

const tracer = trace.getTracer('pryzm.sync-client.conflict');

// ─── MergedOp ─────────────────────────────────────────────────────────────────

export type MergeResult =
  | { kind: 'merged'; value: unknown }
  | { kind: 'conflict'; descriptor: CRDTConflict };

// ─── CRDTConflictResolver ────────────────────────────────────────────────────

/**
 * CRDTConflictResolver — 3-way merge for PRYZM element properties.
 *
 * Yjs handles structural (array/map) CRDT conflicts automatically via its
 * CRDT algorithms.  This resolver handles **semantic** conflicts where both
 * parties edited the same scalar property (e.g. wall height) simultaneously
 * and Yjs chose one via timestamp without the user's knowledge.
 *
 * The resolver is called BEFORE Yjs applies the remote op, allowing us to
 * intercept and route through the dialog instead of silently applying.
 *
 * 3-way merge rules:
 *   1. If both edits produce the same value → trivially merge (no conflict).
 *   2. If only local changed from base → accept local (remote was no-op).
 *   3. If only remote changed from base → accept remote (local was no-op).
 *   4. If both changed from base (true conflict):
 *      a. Numeric: additive delta merge (both deltas applied on top of base).
 *      b. String / other scalar: cannot auto-merge → return conflict descriptor.
 */
export class CRDTConflictResolver {

  /**
   * Attempt automatic 3-way merge.
   *
   * @param base - The value before either client edited it (common ancestor).
   * @param local - The value after the local client's edit.
   * @param remote - The value after the remote client's edit.
   * @returns The merged value, or `null` if user resolution is required.
   */
  autoMerge(base: unknown, local: unknown, remote: unknown): unknown | null {
    const span = tracer.startSpan('pryzm.conflict.autoMerge');
    try {
      const localStr = JSON.stringify(local);
      const remoteStr = JSON.stringify(remote);
      const baseStr = JSON.stringify(base);

      // Rule 1: trivial — both edits are the same value
      if (localStr === remoteStr) return local;

      // Rule 2: only local changed
      const localChanged = localStr !== baseStr;
      const remoteChanged = remoteStr !== baseStr;
      if (localChanged && !remoteChanged) return local;
      if (!localChanged && remoteChanged) return remote;

      // Rule 3: both changed — try numeric additive merge
      if (
        typeof local === 'number' &&
        typeof remote === 'number' &&
        typeof base === 'number'
      ) {
        const localDelta = local - base;
        const remoteDelta = remote - base;
        return base + localDelta + remoteDelta;
      }

      // Rule 4: string / other scalar — cannot auto-merge
      return null;
    } finally {
      span.end();
    }
  }

  /**
   * Full merge attempt: first tries auto-merge, then produces a conflict
   * descriptor if auto-merge returns null.
   *
   * @param elementId - PRYZM element identifier
   * @param property - Property name (e.g. 'height', 'thickness')
   * @param base - Value before concurrent edits (common ancestor)
   * @param local - Local client's edited value
   * @param remote - Remote client's edited value
   * @param remoteAuthor - Display name of the remote author (server-authoritative)
   * @returns MergeResult — either a merged value or a conflict descriptor
   */
  mergeElement(
    elementId: string,
    property: string,
    base: unknown,
    local: unknown,
    remote: unknown,
    remoteAuthor: string,
  ): MergeResult {
    const span = tracer.startSpan('pryzm.conflict.mergeElement', {
      attributes: {
        'pryzm.element.id': elementId,
        'pryzm.element.property': property,
      },
    });
    try {
      const merged = this.autoMerge(base, local, remote);
      if (merged !== null) {
        return { kind: 'merged', value: merged };
      }
      return {
        kind: 'conflict',
        descriptor: this.describeConflict(elementId, property, local, remote, remoteAuthor),
      };
    } finally {
      span.end();
    }
  }

  /**
   * Produce a CRDTConflict descriptor for the user-facing resolution dialog.
   * This descriptor is stored in the runtime conflict queue and shown in
   * ConflictResolutionDialog.ts.
   */
  describeConflict(
    elementId: string,
    property: string,
    localValue: unknown,
    remoteValue: unknown,
    remoteAuthor: string,
  ): CRDTConflict {
    const span = tracer.startSpan('pryzm.conflict.describeConflict');
    try {
      return {
        elementId,
        property,
        localValue,
        remoteValue,
        remoteAuthor,
        timestamp: Date.now(),
      };
    } finally {
      span.end();
    }
  }

  /**
   * Resolve a known conflict with the user's chosen resolution.
   *
   * @param conflict - The conflict descriptor from describeConflict()
   * @param resolution - 'local' | 'remote' | 'merged'
   * @param mergedValue - Required when resolution === 'merged'
   * @returns The final value to apply to the element property
   */
  applyResolution(
    conflict: CRDTConflict,
    resolution: 'local' | 'remote' | 'merged',
    mergedValue?: unknown,
  ): unknown {
    const span = tracer.startSpan('pryzm.conflict.applyResolution', {
      attributes: {
        'pryzm.element.id': conflict.elementId,
        'pryzm.conflict.resolution': resolution,
      },
    });
    try {
      switch (resolution) {
        case 'local': return conflict.localValue;
        case 'remote': return conflict.remoteValue;
        case 'merged': {
          if (mergedValue === undefined) {
            throw new Error(
              'CRDTConflictResolver: mergedValue is required when resolution === "merged"',
            );
          }
          return mergedValue;
        }
      }
    } finally {
      span.end();
    }
  }
}
