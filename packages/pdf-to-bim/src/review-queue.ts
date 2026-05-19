/**
 * Review-queue model — the in-memory store that feeds the S60 D2
 * review-queue UI sidebar entry.
 *
 * Phase 3-B Sprint S60 Track A
 * (PHASE-3B-Q2-M28-M30-PLUGINS-IFC-DXF-RHINO.md §S60 D2 line 543)
 * per `[strategic ADR-029]` Part A.
 *
 * The store owns three things and three things only:
 *   1. the **set** of pending review entries (one per low-confidence proposal);
 *   2. the **decision log** for SOC2 / S57 audit-log fan-out;
 *   3. the **subscription** surface so the sidebar can re-render on change.
 *
 * It is intentionally framework-free — no DOM, no React, no Yjs — so the
 * AI worker can construct it server-side, the editor can consume it
 * client-side, and the bench can drive it headless. Real rendering is the
 * responsibility of `apps/editor` (S60 D2 — out of scope this commit).
 */

import { trace, type Tracer } from '@opentelemetry/api';
import type { ConfidencedElement, PdfBimElementKind } from './confidence.js';

export type ReviewDecision = 'accepted' | 'rejected' | 'edited';

export interface ReviewEntry<TProposal = unknown> {
  readonly id: string;
  readonly kind: PdfBimElementKind;
  readonly proposal: TProposal;
  readonly confidence: number;
  /** Page id from the source PDF, for the reviewer's "show in PDF" jumper. */
  readonly pageId: string;
  /** Optional natural-language hint produced by the extractor. */
  readonly hint?: string;
  /** ISO-8601 timestamp the entry was enqueued. */
  readonly enqueuedAt: string;
}

export interface ReviewDecisionRecord {
  readonly entryId: string;
  readonly decision: ReviewDecision;
  readonly reviewer: string;
  readonly decidedAt: string;
  /** Optional patch applied when `decision === 'edited'`. */
  readonly patch?: Readonly<Record<string, unknown>>;
}

export interface ReviewQueueSnapshot {
  readonly pending: readonly ReviewEntry[];
  readonly decided: readonly ReviewDecisionRecord[];
}

export type ReviewQueueListener = (snapshot: ReviewQueueSnapshot) => void;

export const PRYZM_REVIEW_QUEUE_TRACER = 'pryzm.pdf.review-queue';

export interface EnqueueProposalInput<TProposal = unknown> {
  readonly id: string;
  readonly element: ConfidencedElement<TProposal>;
  readonly pageId: string;
  readonly hint?: string;
}

export class ReviewQueue {
  private readonly pending: Map<string, ReviewEntry> = new Map();
  private readonly decided: ReviewDecisionRecord[] = [];
  private readonly listeners: Set<ReviewQueueListener> = new Set();
  private readonly tracer: ReturnType<typeof trace.getTracer>;
  private readonly clock: () => Date;

  constructor(opts: { tracer?: Tracer; clock?: () => Date } = {}) {
    this.tracer = opts.tracer ?? trace.getTracer(PRYZM_REVIEW_QUEUE_TRACER);
    this.clock = opts.clock ?? (() => new Date());
  }

  /** Enqueue a single proposal. Returns the entry. */
  enqueue<T>(input: EnqueueProposalInput<T>): ReviewEntry<T> {
    if (this.pending.has(input.id)) {
      throw new Error(`ReviewQueue: duplicate entry id "${input.id}"`);
    }
    const entry: ReviewEntry<T> = {
      id: input.id,
      kind: input.element.kind,
      proposal: input.element.proposal,
      confidence: input.element.confidence,
      pageId: input.pageId,
      ...(input.hint !== undefined ? { hint: input.hint } : {}),
      enqueuedAt: this.clock().toISOString(),
    };
    this.pending.set(input.id, entry);
    this.tracer.startSpan('pryzm.pdf.review-queue.enqueue', {
      attributes: {
        entry_id: entry.id, kind: entry.kind, confidence: entry.confidence,
        page_id: entry.pageId,
      },
    }).end();
    this.notify();
    return entry;
  }

  /** Bulk enqueue — short-circuits the per-call notify so the listeners run once. */
  enqueueAll<T>(inputs: readonly EnqueueProposalInput<T>[]): readonly ReviewEntry<T>[] {
    const entries: ReviewEntry<T>[] = [];
    const suspendedListeners = Array.from(this.listeners);
    this.listeners.clear();
    try {
      for (const input of inputs) entries.push(this.enqueue(input));
    } finally {
      for (const l of suspendedListeners) this.listeners.add(l);
    }
    this.notify();
    return entries;
  }

  /**
   * Record a reviewer's decision. Removes the entry from the pending list
   * and appends an immutable decision record. The decision record is what
   * the audit-log middleware (S57 schema) writes to the `audit_log` table.
   */
  decide(input: {
    entryId: string;
    decision: ReviewDecision;
    reviewer: string;
    patch?: Readonly<Record<string, unknown>>;
  }): ReviewDecisionRecord {
    const entry = this.pending.get(input.entryId);
    if (!entry) {
      throw new Error(`ReviewQueue: unknown entry id "${input.entryId}"`);
    }
    this.pending.delete(input.entryId);
    const record: ReviewDecisionRecord = {
      entryId: input.entryId,
      decision: input.decision,
      reviewer: input.reviewer,
      decidedAt: this.clock().toISOString(),
      ...(input.patch !== undefined ? { patch: input.patch } : {}),
    };
    this.decided.push(record);
    this.tracer.startSpan('pryzm.pdf.review-queue.decide', {
      attributes: {
        entry_id: input.entryId,
        decision: input.decision,
        reviewer: input.reviewer,
        kind: entry.kind,
      },
    }).end();
    this.notify();
    return record;
  }

  /** Snapshot the entire queue + decision log. The arrays are fresh copies. */
  snapshot(): ReviewQueueSnapshot {
    return {
      pending: Array.from(this.pending.values()),
      decided: this.decided.slice(),
    };
  }

  /** Subscribe to snapshot deltas. Returns an unsubscribe thunk. */
  subscribe(listener: ReviewQueueListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Counts only — no allocation. Cheap to call inside a UI useFrame. */
  pendingCount(): number { return this.pending.size; }
  decidedCount(): number { return this.decided.length; }

  private notify(): void {
    if (this.listeners.size === 0) return;
    const snapshot = this.snapshot();
    for (const l of this.listeners) {
      try { l(snapshot); } catch {
        // listeners must not break the queue; swallow + continue.
      }
    }
  }
}
