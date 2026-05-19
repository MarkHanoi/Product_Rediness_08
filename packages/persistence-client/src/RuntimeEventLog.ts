// RuntimeEventLog — runtime-side facade over `EventLog` adding the
// version-control helpers (`tag` / `tags` / `replayUntil` / `diff`)
// consumed by CDEVersionPanel and the SaveUndoRedoHUD's "Save as named
// version" flow.
//
// Spec: PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md §16.3 sub-phases
// C.6.04 (Save-as-named-version), C.7.01 (version list paint),
// C.7.02 (restore version), C.7.03 (diff between versions).
//
// Tags are persisted as a synthetic event (`type === '__pryzm.tag__'`)
// appended through the underlying log so they share the log's
// monotonic seq + ULID identity — no separate tag table required.

import type { AuditDefaults, EventRecord } from '@pryzm/command-bus';
import { ulid } from 'ulid';
import type { EventLog } from './EventLog.js';
import type { PersistedEvent } from './types.js';

export const TAG_EVENT_TYPE = '__pryzm.tag__';

export interface TagPayload {
  readonly name: string;
  readonly meta: Readonly<Record<string, unknown>>;
}

export interface TagRecord {
  readonly name: string;
  readonly seq: number;
  readonly eventId: string;
  readonly persistedAt: string;
  readonly meta: Readonly<Record<string, unknown>>;
}

export interface DiffSummary {
  readonly fromEventId: string;
  readonly toEventId: string;
  readonly fromSeq: number;
  readonly toSeq: number;
  readonly totalPatches: number;
  readonly affectedEvents: number;
  readonly byStore: Readonly<Record<string, number>>;
}

/**
 * Constructor deps for the runtime-side event-log facade.
 *
 * `audit` is `AuditDefaults` (actorId / projectId / clientId) — the
 * timestamp is **stamped per write** (mirroring `CommandBus.buildContext`
 * — see `@pryzm/command-bus` `types.ts` §28-37).  A boot-time timestamp
 * would lie about every subsequent tag's true append time, so the
 * facade refuses to accept a pre-stamped timestamp and produces one
 * itself at the moment of `append`.
 */
export interface RuntimeEventLogDeps {
  readonly eventLog: EventLog;
  readonly audit: AuditDefaults;
  /** Test seam — defaults to `() => new Date().toISOString()`. */
  readonly now?: () => string;
}

export class RuntimeEventLog {
  readonly eventLog: EventLog;
  readonly audit: AuditDefaults;
  private readonly now: () => string;

  constructor(deps: RuntimeEventLogDeps) {
    this.eventLog = deps.eventLog;
    this.audit = deps.audit;
    this.now = deps.now ?? ((): string => new Date().toISOString());
  }

  /** Append a synthetic tag event marking the current head as a named version. */
  async tag(name: string, meta: Record<string, unknown> = {}): Promise<TagRecord> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new RangeError('[RuntimeEventLog] tag name must be non-empty.');
    }
    const frozenMeta = Object.freeze({ ...meta });
    const record: EventRecord<TagPayload> = {
      id: ulid(),
      type: TAG_EVENT_TYPE,
      payload: { name: trimmed, meta: frozenMeta },
      affectedStores: [],
      patches: [],
      audit: { ...this.audit, timestamp: this.now() },
      forward: [],
      inverse: [],
    };
    const persisted = await this.eventLog.append(record);
    return {
      name: trimmed,
      seq: persisted.seq,
      eventId: record.id,
      persistedAt: persisted.persistedAt,
      meta: frozenMeta,
    };
  }

  /** Enumerate all tag events in the log, oldest first.  The optional
   *  `projectId` argument is accepted for spec-conformance with the
   *  caller surface in §16.3 C.7.01 — the EventLog is already
   *  per-project, so it is verified against `audit.projectId`. */
  async tags(projectId?: string): Promise<TagRecord[]> {
    if (projectId !== undefined && projectId !== this.audit.projectId) {
      throw new Error(
        `[RuntimeEventLog] tags(projectId="${projectId}") called on a log scoped ` +
        `to projectId="${this.audit.projectId}".`,
      );
    }
    const out: TagRecord[] = [];
    for await (const evt of this.eventLog.replay(0)) {
      if (evt.event.type !== TAG_EVENT_TYPE) continue;
      const payload = evt.event.payload as TagPayload;
      out.push({
        name: payload.name,
        seq: evt.seq,
        eventId: evt.event.id,
        persistedAt: evt.persistedAt,
        meta: payload.meta,
      });
    }
    return out;
  }

  /** Replay events strictly up to and including the given event id. */
  async replayUntil(eventId: string): Promise<PersistedEvent[]> {
    const out: PersistedEvent[] = [];
    for await (const evt of this.eventLog.replay(0)) {
      out.push(evt);
      if (evt.event.id === eventId) return out;
    }
    throw new Error(`[RuntimeEventLog] eventId not found in log: ${eventId}`);
  }

  /** Summarise the JSON-Patch deltas between two events (exclusive→inclusive). */
  async diff(fromEventId: string, toEventId: string): Promise<DiffSummary> {
    let fromSeq = -1;
    let toSeq = -1;
    let totalPatches = 0;
    let affectedEvents = 0;
    const byStore: Record<string, number> = {};
    for await (const evt of this.eventLog.replay(0)) {
      if (evt.event.id === fromEventId) {
        fromSeq = evt.seq;
        continue;
      }
      if (evt.event.id === toEventId) {
        toSeq = evt.seq;
      }
      if (fromSeq >= 0 && evt.seq > fromSeq && (toSeq < 0 || evt.seq <= toSeq)) {
        if (evt.event.type === TAG_EVENT_TYPE) continue;
        affectedEvents += 1;
        for (const entry of evt.event.patches) {
          totalPatches += entry.forwardPatches.length;
          const k = String(entry.storeKey);
          byStore[k] = (byStore[k] ?? 0) + entry.forwardPatches.length;
        }
      }
      if (toSeq >= 0 && evt.seq >= toSeq) break;
    }
    if (fromSeq < 0) {
      throw new Error(`[RuntimeEventLog] fromEventId not found: ${fromEventId}`);
    }
    if (toSeq < 0) {
      throw new Error(`[RuntimeEventLog] toEventId not found: ${toEventId}`);
    }
    return {
      fromEventId,
      toEventId,
      fromSeq,
      toSeq,
      totalPatches,
      affectedEvents,
      byStore,
    };
  }

  // ── pass-throughs so consumers use one slot for everything ───────────────

  async append<T>(event: EventRecord<T>): Promise<PersistedEvent<T>> {
    return this.eventLog.append(event);
  }
  replay(fromSeq = 0): AsyncIterable<PersistedEvent> {
    return this.eventLog.replay(fromSeq);
  }
  highestSeq(): Promise<number> {
    return this.eventLog.highestSeq();
  }
}
