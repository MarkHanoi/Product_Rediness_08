// @pryzm/export-worker — Phase 2C skeleton (S114-WIRE, Wave 19).
//
// This module processes async export jobs queued by the HTTP server via
// POST /api/export/pdf (+ /ifc, /dxf in future phases).
//
// CURRENT STATE: In-process stub.
//   • `enqueueExportJob()` — accepts job metadata, stores status, returns jobId.
//   • `getJobStatus()` — poll interface for the client's GET /api/export/jobs/:id.
//
// FULL PIPELINE (Phase F.x) requires:
//   • plugins/export-pdf handlers (currently F-prereq.0 empty scaffold).
//   • plugins/ifc-export handlers (deferred Phase E.5.x).
//   • Object storage backend (SPEC-03 §4.2).
//   • Redis BRPOP or equivalent queue for multi-server deploys.
//   • WebSocket notification to requesting client on job completion.
//
// SPEC SOURCE: docs/03_PRYZM3/04-PLAN-FORWARD/19-WAVES-16-20-FULL-WIRE.md §4 Phase 2C.

export interface ExportJob {
  readonly jobId: string;
  readonly projectId: string;
  readonly format: 'pdf' | 'ifc' | 'dxf';
  readonly options?: Readonly<Record<string, unknown>>;
}

export type JobStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface JobRecord {
  readonly jobId: string;
  readonly format: ExportJob['format'];
  readonly projectId: string;
  readonly status: JobStatus;
  readonly createdAt: number;
  readonly completedAt?: number;
  readonly errorMessage?: string;
}

const _store = new Map<string, JobRecord>();

/**
 * Enqueue an export job.
 * Returns the jobId immediately; processing is asynchronous.
 * Phase F.x will replace the stub resolution with a real plugin handler dispatch.
 */
export function enqueueExportJob(job: ExportJob): string {
  const record: JobRecord = {
    jobId: job.jobId,
    format: job.format,
    projectId: job.projectId,
    status: 'queued',
    createdAt: Date.now(),
  };
  _store.set(job.jobId, record);

  console.log(`[export-worker] queued: jobId=${job.jobId} format=${job.format} project=${job.projectId}`);

  // Stub: immediately transition to 'done' after a short delay.
  // TODO(F.x): replace with real plugin handler dispatch:
  //   import { PLUGIN_ID } from '@pryzm/plugin-export-pdf';
  //   const handler = handlerRegistry.get(PLUGIN_ID);
  //   handler.execute(job) → write to object storage → notify client via WS.
  setTimeout(() => {
    const existing = _store.get(job.jobId);
    if (existing) {
      _store.set(job.jobId, { ...existing, status: 'done', completedAt: Date.now() });
      console.log(`[export-worker] done (stub): jobId=${job.jobId}`);
    }
  }, 200);

  return job.jobId;
}

/**
 * Poll job status by jobId.
 * Returns null if the jobId is unknown.
 */
export function getJobStatus(jobId: string): JobRecord | null {
  return _store.get(jobId) ?? null;
}

/**
 * Remove completed/failed jobs older than `maxAgeMs` (default 10 minutes).
 * Call periodically from the server process to avoid unbounded memory growth.
 */
export function pruneJobs(maxAgeMs = 10 * 60 * 1000): number {
  const cutoff = Date.now() - maxAgeMs;
  let pruned = 0;
  for (const [id, rec] of _store) {
    if ((rec.status === 'done' || rec.status === 'failed') && rec.createdAt < cutoff) {
      _store.delete(id);
      pruned++;
    }
  }
  return pruned;
}
