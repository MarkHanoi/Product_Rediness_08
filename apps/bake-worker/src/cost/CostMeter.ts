// apps/bake-worker/cost/CostMeter.ts — per-event R2 cost accounting.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S21 line 639 — R2 cost model: ~$0.015/GB stored + ~$0.36/M
//                    Class B (write) + ~$0.36/10M Class A (read).
//   • S21 line 862 — D7: audit chunk cost; 100 jobs/hour = 100 Class B
//                    operations/hour.
//   • S21 exit #5  — per-event R2 cost audited and documented.
//   • S21 exit #10 — `bake.event.cost` telemetry stream live; used to
//                    validate `[strategic ADR-018]` cut-list pricing.
//
// The meter wraps a `StorageDriverStats` snapshot delta with the R2
// pricing tables and emits a per-event `bake.event.cost` event so
// downstream observability can budget chargebacks.

import { trace, type Attributes } from '@opentelemetry/api';
import type { StorageDriver, StorageDriverStats } from '@pryzm/storage-driver';

const TRACER = trace.getTracer('@pryzm/bake-worker.cost', '0.1.0');

/** Cloudflare R2 pricing as of 2026-Q2.  Update via PR when prices change. */
export const R2_PRICING = {
  /** USD per Class B (write/list) operation. */
  classBOpUsd: 0.36 / 1_000_000,
  /** USD per Class A (read) operation. */
  classAOpUsd: 0.36 / 10_000_000,
  /** USD per byte stored per month — averaged from $0.015/GB-month. */
  storageUsdPerByteMonth: 0.015 / (1024 ** 3),
  /** USD per byte egress. */
  egressUsdPerByte: 0.0,
} as const;

export interface CostDelta {
  readonly classBOps: number;
  readonly classAOps: number;
  readonly bytesUploaded: number;
  readonly bytesDownloaded: number;
  /** USD spent on this delta (write ops + read ops + egress).  Storage
   *  cost is deferred — the manifest's `byteLength` field is the
   *  source of truth for monthly storage chargebacks. */
  readonly opCostUsd: number;
}

export class CostMeter {
  private last: StorageDriverStats;
  private readonly perEventRecords: CostDelta[] = [];

  constructor(private readonly driver: StorageDriver) {
    this.last = driver.stats();
  }

  /**
   * Snapshot the cost incurred since the last call (or since
   * construction).  Emits a `bake.event.cost` OTel event with the
   * full delta + per-event attribution.
   */
  recordEvent(attribution: { projectId: string; levelId: string; jobId: string }): CostDelta {
    const next = this.driver.stats();
    const delta: CostDelta = {
      classBOps: next.puts - this.last.puts,
      classAOps: (next.gets - this.last.gets) + (next.heads - this.last.heads),
      bytesUploaded: next.bytesPut - this.last.bytesPut,
      bytesDownloaded: next.bytesGet - this.last.bytesGet,
      opCostUsd: 0, // computed below
    };
    const opCostUsd =
      delta.classBOps * R2_PRICING.classBOpUsd +
      delta.classAOps * R2_PRICING.classAOpUsd +
      delta.bytesDownloaded * R2_PRICING.egressUsdPerByte;
    const record: CostDelta = { ...delta, opCostUsd };

    this.last = next;
    this.perEventRecords.push(record);

    // OTel — per-event cost attribution.  Renders into Honeycomb /
    // Datadog as `bake.event.cost` events tagged with project/level.
    const attrs: Attributes = {
      'pryzm.bake.projectId': attribution.projectId,
      'pryzm.bake.levelId': attribution.levelId,
      'pryzm.bake.jobId': attribution.jobId,
      'pryzm.bake.cost.classBOps': record.classBOps,
      'pryzm.bake.cost.classAOps': record.classAOps,
      'pryzm.bake.cost.bytesUploaded': record.bytesUploaded,
      'pryzm.bake.cost.bytesDownloaded': record.bytesDownloaded,
      'pryzm.bake.cost.opCostUsd': record.opCostUsd,
    };
    const span = TRACER.startSpan('bake.event.cost', { attributes: attrs });
    span.end();

    return record;
  }

  /** Aggregate of all per-event records since construction. */
  totals(): CostDelta {
    const sum: CostDelta = this.perEventRecords.reduce<CostDelta>(
      (acc, r) => ({
        classBOps: acc.classBOps + r.classBOps,
        classAOps: acc.classAOps + r.classAOps,
        bytesUploaded: acc.bytesUploaded + r.bytesUploaded,
        bytesDownloaded: acc.bytesDownloaded + r.bytesDownloaded,
        opCostUsd: acc.opCostUsd + r.opCostUsd,
      }),
      {
        classBOps: 0,
        classAOps: 0,
        bytesUploaded: 0,
        bytesDownloaded: 0,
        opCostUsd: 0,
      },
    );
    return sum;
  }

  /** How many events have been recorded.  Used for "USD per event" math. */
  eventCount(): number {
    return this.perEventRecords.length;
  }

  /** Human-readable summary for the `/cost` endpoint and the docs. */
  summary(): {
    eventCount: number;
    classBOps: number;
    classAOps: number;
    bytesUploaded: number;
    bytesDownloaded: number;
    opCostUsd: number;
    perEventUsd: number;
  } {
    const t = this.totals();
    const n = this.perEventRecords.length;
    return {
      eventCount: n,
      classBOps: t.classBOps,
      classAOps: t.classAOps,
      bytesUploaded: t.bytesUploaded,
      bytesDownloaded: t.bytesDownloaded,
      opCostUsd: t.opCostUsd,
      perEventUsd: n > 0 ? t.opCostUsd / n : 0,
    };
  }
}
