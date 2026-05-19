// @pryzm/ai-host — AiBus (S49 D1).
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md` §S49
//     "Implementation Detail — L7.5 Promotion" lines 102-135.
//   • SPEC-07 §3 — AI workflows do NOT pollute the command bus's event
//     log with intermediate proposals; only approved workflow outputs
//     commit through the command bus.
//   • [strategic ADR-014] — AI runs at L7.5 with its own observability
//     prefix `pryzm.ai`.
//
// Contract: the AiBus is independent of `@pryzm/command-bus`. AI
// workflows publish lifecycle events here (start, progress, propose,
// commit, error). The approval queue + the public AI API (S53) listen
// to these events. ONLY workflow outputs that pass through the
// approval queue are forwarded to the command bus.
//
// PURE: no DOM, no THREE, no React, no Node-only deps. Bake-worker
// safe per the §0 sprint test. OTel spans go through `tracing.ts`
// when emitted.

import { trace, type Tracer } from '@opentelemetry/api';

const TRACER_NAME = '@pryzm/ai-host/AiBus';
const TRACER_VERSION = '0.1.0';

/** Lifecycle stages an AI workflow run goes through. The bus emits
 *  one event per stage tagged with the workflow id + projectId. */
export type AiBusEventKind =
  | 'workflow.start'
  | 'workflow.progress'
  | 'workflow.propose'
  | 'workflow.commit'
  | 'workflow.reject'
  | 'workflow.error'
  // S54 D1 — batched-undo lifecycle.  `batchStart` is emitted once
  // before the first run in a batch; `batchEnd` is emitted after the
  // last run completes (either with all proposals enqueued, or with a
  // partial-failure summary).  Both carry `aiBatchId` in the payload
  // so subscribers can correlate per-workflow events that share the id.
  | 'workflow.batchStart'
  | 'workflow.batchEnd'
  // ADR-050 — AI response cache hit.  Emitted when `AiPlane.submit()`
  // returns a cached `WorkflowRunResult` and skips the budget check,
  // Anthropic relay call, and `CostMeter.recordCall`.  Carries
  // `contentHash` in the payload for observability.
  | 'workflow.cacheHit';

/** Generic AI bus event envelope. The `payload` is workflow-specific
 *  but always serialisable so the public AI API (S53) can forward it
 *  over WebSocket. */
export interface AiBusEvent<P = unknown> {
  /** Stable event kind — see `AiBusEventKind`. */
  readonly kind: AiBusEventKind;
  /** Workflow identifier (matches `WorkflowDescriptor.id`). */
  readonly workflow: string;
  /** Project the event belongs to. */
  readonly projectId: string;
  /** Run identifier — uniquely names one execution of a workflow. */
  readonly runId: string;
  /** Wall-clock timestamp (epoch ms) when the event was emitted. */
  readonly atMs: number;
  /** Stage-specific payload. */
  readonly payload: P;
}

/** Listener signature. The bus invokes listeners synchronously in
 *  registration order; throwing listeners are caught + logged but do
 *  not abort dispatch. */
export type AiBusListener<P = unknown> = (event: AiBusEvent<P>) => void;

export interface AiBusOptions {
  /** OTel span / metric prefix for events emitted on this bus.
   *  Defaults to `'pryzm.ai'` per ADR-014. */
  readonly otelPrefix?: string;
  /** Optional clock injection — tests pass a fixed clock. */
  readonly now?: () => number;
}

/** Independent AI message bus. Mirrors the simple `EventTarget`-style
 *  shape used elsewhere in @pryzm/* (no Node `events` dep so the
 *  module loads in browsers + workers + bake-worker). */
export class AiBus {
  readonly otelPrefix: string;
  private readonly now: () => number;
  private readonly listeners = new Map<AiBusEventKind, Set<AiBusListener>>();
  private readonly anyListeners = new Set<AiBusListener>();
  private cachedTracer: Tracer | null = null;

  constructor(opts: AiBusOptions = {}) {
    this.otelPrefix = opts.otelPrefix ?? 'pryzm.ai';
    this.now = opts.now ?? Date.now;
  }

  /** Subscribe to events of a specific kind. Returns a disposer. */
  on<P = unknown>(kind: AiBusEventKind, listener: AiBusListener<P>): () => void {
    let set = this.listeners.get(kind);
    if (!set) { set = new Set(); this.listeners.set(kind, set); }
    set.add(listener as AiBusListener);
    return () => { set!.delete(listener as AiBusListener); };
  }

  /** Subscribe to all events on the bus. Returns a disposer.
   *  Used by the public AI API forwarder (S53) to mirror events to
   *  WebSocket clients. */
  onAny(listener: AiBusListener): () => void {
    this.anyListeners.add(listener);
    return () => { this.anyListeners.delete(listener); };
  }

  /** Emit an event. The bus stamps `atMs` from the injected clock if
   *  the caller has not. */
  emit<P>(event: Omit<AiBusEvent<P>, 'atMs'> & Partial<Pick<AiBusEvent<P>, 'atMs'>>): AiBusEvent<P> {
    const stamped: AiBusEvent<P> = {
      kind: event.kind,
      workflow: event.workflow,
      projectId: event.projectId,
      runId: event.runId,
      payload: event.payload,
      atMs: event.atMs ?? this.now(),
    };
    // Per-kind dispatch.
    const set = this.listeners.get(stamped.kind);
    if (set) {
      for (const l of [...set]) {
        try { (l as AiBusListener<P>)(stamped); }
        catch (err) { this.recordListenerError(err, stamped); }
      }
    }
    // Any-listener dispatch.
    for (const l of [...this.anyListeners]) {
      try { (l as AiBusListener<P>)(stamped); }
      catch (err) { this.recordListenerError(err, stamped); }
    }
    // Best-effort OTel instrumentation — prefer adding an *event* to
    // the currently-active workflow span (zero allocation, correct
    // semantics: bus events are synchronous and sub-millisecond so
    // they are better represented as span events rather than as new
    // zero-duration child spans).  Fall back to a point span only when
    // there is no active span context (e.g. code-paths that call
    // `emit()` outside of a `withWorkflowSpan` block).
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.addEvent(`${this.otelPrefix}.bus.${stamped.kind}`, {
        'pryzm.ai.workflow': stamped.workflow,
        'pryzm.project.id': stamped.projectId,
        'pryzm.ai.run_id': stamped.runId,
      });
    } else {
      this.tracer().startActiveSpan(
        `${this.otelPrefix}.bus.${stamped.kind}`,
        { attributes: {
          'pryzm.ai.workflow': stamped.workflow,
          'pryzm.project.id': stamped.projectId,
          'pryzm.ai.run_id': stamped.runId,
        } },
        (span) => { span.end(); },
      );
    }
    return stamped;
  }

  /** Drop every listener. Test-only. */
  _clear(): void {
    this.listeners.clear();
    this.anyListeners.clear();
  }

  /** Diagnostic — total registered listeners (per-kind + any). */
  listenerCount(): number {
    let n = this.anyListeners.size;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }

  private tracer(): Tracer {
    this.cachedTracer ??= trace.getTracer(TRACER_NAME, TRACER_VERSION);
    return this.cachedTracer;
  }

  private recordListenerError(err: unknown, ev: AiBusEvent): void {
    // Listeners must not abort dispatch. We swallow but allow callers
    // to wire a global handler via `onAny` to surface them.
    if (typeof console !== 'undefined') {
      console.error(
        `[ai-host/AiBus] listener for '${ev.kind}' (workflow=${ev.workflow} run=${ev.runId}) threw:`,
        err,
      );
    }
  }
}
