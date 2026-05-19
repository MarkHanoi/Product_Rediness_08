/**
 * @pryzm/api-gateway — pluggable ports.
 *
 * The api-gateway is a THIN HTTP+WS shell over four narrow ports:
 *
 *   ProjectExportPort   — return a .pryzm v1 ZIP for a projectId
 *   ProjectImportPort   — accept a .pryzm v1 ZIP, return new projectId
 *   AiInvokePort        — invoke a workflow id with given input
 *   WsEventBus          — subscribe to project events + awareness
 *
 * Ports keep the gateway TESTABLE without booting the editor, the bake
 * worker, or sync-server.  The default in-memory implementations below
 * are used by tests + the standalone `tsx src/index.ts` demo bootstrap.
 *
 * Production wiring at S65 D9 wires the real ports:
 *   • ProjectExportPort  → packages/file-format#pack(...)
 *   • ProjectImportPort  → packages/file-format#unpack(...)
 *   • AiInvokePort       → @pryzm/ai-host AiPlane.submit(...)
 *   • WsEventBus         → apps/sync-server WS bridge
 */

import type { WorkflowDescriptor } from '@pryzm/ai-host';

// ──────────────────────────────────────────────────────────────────────
//  ProjectExportPort
// ──────────────────────────────────────────────────────────────────────

export interface ProjectExportResult {
  /** The .pryzm v1 ZIP bytes. */
  readonly bytes: Uint8Array;
  /** ETag for the bytes — typically `"sha256:<hex>"`. */
  readonly etag: string;
  /** Last modified ISO-8601 timestamp. */
  readonly lastModified: string;
}

export interface ProjectExportPort {
  /** Return the .pryzm v1 export of `projectId`, or undefined if missing. */
  exportProject(projectId: string): Promise<ProjectExportResult | undefined>;
}

// ──────────────────────────────────────────────────────────────────────
//  ProjectImportPort
// ──────────────────────────────────────────────────────────────────────

export interface ProjectImportResult {
  /** Newly-allocated projectId. */
  readonly projectId: string;
  /** Project display name extracted from the manifest. */
  readonly name: string;
  /** Creation ISO-8601 timestamp. */
  readonly createdAt: string;
}

export class ProjectImportError extends Error {
  public readonly name = 'ProjectImportError';
  public readonly httpStatus: 400 | 422;
  public readonly reason: string;
  constructor(opts: { httpStatus: 400 | 422; reason: string }) {
    super(`ProjectImportError(${opts.httpStatus}): ${opts.reason}`);
    this.httpStatus = opts.httpStatus;
    this.reason = opts.reason;
  }
}

export interface ProjectImportPort {
  /** Validate + ingest a .pryzm v1 ZIP, return the new project. */
  importProject(bytes: Uint8Array): Promise<ProjectImportResult>;
}

// ──────────────────────────────────────────────────────────────────────
//  AiInvokePort
// ──────────────────────────────────────────────────────────────────────

export interface AiInvokeRequest {
  readonly workflowId: string;
  readonly projectId: string;
  readonly actorId: string;
  readonly input: unknown;
}

export interface AiInvokeResponse {
  readonly runId: string;
  readonly workflowId: string;
  readonly status: 'queued' | 'rejected';
  readonly estimatedCostUsd: number;
  /** Reason set when status==='rejected'. */
  readonly reason?: string;
}

export interface AiInvokePort {
  /** List all registered workflow descriptors. */
  listWorkflows(): readonly WorkflowDescriptor[];
  /** Get a single workflow descriptor (undefined if unknown). */
  getWorkflow(id: string): WorkflowDescriptor | undefined;
  /** Submit an AI run.  May reject pre-flight (budget, missing workflow). */
  invoke(req: AiInvokeRequest): Promise<AiInvokeResponse>;
}

// ──────────────────────────────────────────────────────────────────────
//  WsEventBus — pluggable so the gateway tests don't need sync-server.
// ──────────────────────────────────────────────────────────────────────

export interface WsEvent {
  readonly kind: 'project.event' | 'project.awareness';
  readonly projectId: string;
  /** Sequence number per (projectId, kind).  Monotonic. */
  readonly seq: number;
  /** ms since epoch. */
  readonly ts: number;
  /** Free-form payload — stringified as JSON over the wire. */
  readonly payload: unknown;
}

export type WsUnsubscribe = () => void;

export interface WsEventBus {
  subscribeProject(projectId: string, listener: (e: WsEvent) => void): WsUnsubscribe;
  subscribeAwareness(projectId: string, listener: (e: WsEvent) => void): WsUnsubscribe;
  /** For tests + the demo bootstrap. */
  publish(e: WsEvent): void;
}

// ──────────────────────────────────────────────────────────────────────
//  In-memory ports — for tests + demo bootstrap.
// ──────────────────────────────────────────────────────────────────────

export class InMemoryProjectStore implements ProjectExportPort, ProjectImportPort {
  private readonly exports = new Map<string, ProjectExportResult>();
  private seq = 0;

  /** Test seed: associate `projectId` with arbitrary export bytes. */
  put(projectId: string, bytes: Uint8Array, opts: { etag?: string; lastModified?: string } = {}): void {
    this.exports.set(projectId, Object.freeze({
      bytes,
      etag: opts.etag ?? `"local-${projectId}-${bytes.length}"`,
      lastModified: opts.lastModified ?? new Date().toISOString(),
    }));
  }

  async exportProject(projectId: string): Promise<ProjectExportResult | undefined> {
    return this.exports.get(projectId);
  }

  async importProject(bytes: Uint8Array): Promise<ProjectImportResult> {
    if (bytes.length === 0) {
      throw new ProjectImportError({ httpStatus: 400, reason: 'empty body' });
    }
    // Minimal ZIP magic check — production wiring uses @pryzm/file-format#unpack.
    const zipMagic = bytes[0] === 0x50 && bytes[1] === 0x4b;
    if (!zipMagic) {
      throw new ProjectImportError({ httpStatus: 422, reason: 'not a ZIP archive' });
    }
    this.seq += 1;
    const projectId = `imported-${Date.now()}-${this.seq}`;
    const result: ProjectImportResult = Object.freeze({
      projectId,
      name: `Imported project #${this.seq}`,
      createdAt: new Date().toISOString(),
    });
    // Echo bytes back so subsequent export-of-import works for round-trip tests.
    this.put(projectId, bytes);
    return result;
  }

  size(): number { return this.exports.size; }
  _clear(): void { this.exports.clear(); this.seq = 0; }
}

/**
 * Stub AiInvokePort.  Carries an injected workflow descriptor list +
 * an injected `submit` callback, so tests can wire either the real
 * AiPlane (integration mode) or a mock (unit mode).
 */
export interface StubAiInvokeOptions {
  readonly workflows: readonly WorkflowDescriptor[];
  readonly submit?: (req: AiInvokeRequest) => Promise<AiInvokeResponse>;
}

export class StubAiInvokePort implements AiInvokePort {
  private readonly map = new Map<string, WorkflowDescriptor>();
  private readonly submit: (req: AiInvokeRequest) => Promise<AiInvokeResponse>;

  constructor(opts: StubAiInvokeOptions) {
    for (const w of opts.workflows) this.map.set(w.id, w);
    this.submit = opts.submit ?? (async (req) => ({
      runId: `stub-${Date.now()}`,
      workflowId: req.workflowId,
      status: 'queued' as const,
      estimatedCostUsd: this.map.get(req.workflowId)?.estimatedCostUsd ?? 0,
    }));
  }

  listWorkflows(): readonly WorkflowDescriptor[] {
    return Array.from(this.map.values());
  }

  getWorkflow(id: string): WorkflowDescriptor | undefined {
    return this.map.get(id);
  }

  async invoke(req: AiInvokeRequest): Promise<AiInvokeResponse> {
    if (!this.map.has(req.workflowId)) {
      return Object.freeze({
        runId: `rej-${Date.now()}`,
        workflowId: req.workflowId,
        status: 'rejected' as const,
        estimatedCostUsd: 0,
        reason: 'workflow not registered',
      });
    }
    return this.submit(req);
  }
}

/** Pure in-memory event bus with monotonic per-(project,kind) sequence ids. */
export class InMemoryWsEventBus implements WsEventBus {
  private readonly listeners = new Map<string, Set<(e: WsEvent) => void>>();
  private readonly seqs = new Map<string, number>();

  private chanKey(projectId: string, kind: WsEvent['kind']): string {
    return `${kind}|${projectId}`;
  }

  private nextSeq(key: string): number {
    const n = (this.seqs.get(key) ?? 0) + 1;
    this.seqs.set(key, n);
    return n;
  }

  subscribeProject(projectId: string, listener: (e: WsEvent) => void): WsUnsubscribe {
    return this.subscribe(this.chanKey(projectId, 'project.event'), listener);
  }

  subscribeAwareness(projectId: string, listener: (e: WsEvent) => void): WsUnsubscribe {
    return this.subscribe(this.chanKey(projectId, 'project.awareness'), listener);
  }

  private subscribe(key: string, listener: (e: WsEvent) => void): WsUnsubscribe {
    let set = this.listeners.get(key);
    if (!set) { set = new Set(); this.listeners.set(key, set); }
    set.add(listener);
    return () => { set!.delete(listener); };
  }

  /** Test/demo helper: publish + auto-stamp seq if not provided. */
  publish(e: WsEvent): void {
    const key = this.chanKey(e.projectId, e.kind);
    const seq = e.seq > 0 ? e.seq : this.nextSeq(key);
    const stamped: WsEvent = Object.freeze({ ...e, seq });
    const set = this.listeners.get(key);
    if (set) for (const l of set) l(stamped);
  }

  listenerCount(projectId: string, kind: WsEvent['kind']): number {
    return this.listeners.get(this.chanKey(projectId, kind))?.size ?? 0;
  }
}
