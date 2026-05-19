// EventLogPersistor — PatchEmitter subscriber that POSTs EventRecords to
// the server-side /api/event-log endpoint for audit trail persistence.
//
// S04 scope: doc 34 §2 Row 6 — "Wire PatchEmitter.subscribe() → server-side
// persistor that INSERTs rows."
//
// Design:
//   Fire-and-forget HTTP POST — never blocks the command pipeline.
//   Wired by composeRuntime when opts.eventLogEndpoint is provided.
//
// CONTRACT (C03 §4, ADR-002):
//   The persistor MUST be non-blocking (async, errors swallowed with warn).
//   The server endpoint MUST accept JSON matching EventRecord shape.

import type { EmitterListener } from './PatchEmitter.js';

export interface EventLogPersistorOptions {
  /** Server endpoint — e.g. '/api/event-log'. */
  readonly endpoint: string;
  /** Optional extra headers (e.g. Authorization: Bearer <token>). */
  readonly headers?: Record<string, string>;
  /** Called on non-fatal network errors.  Defaults to console.warn. */
  readonly onError?: (err: unknown) => void;
}

/** Returns a PatchEmitter subscriber that POSTs each EventRecord to the
 *  server as a JSON body.  Non-blocking — errors are swallowed. */
export function createEventLogPersistor(
  opts: EventLogPersistorOptions,
): EmitterListener {
  const { endpoint, headers = {}, onError } = opts;
  return (_bytes, record) => {
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(record),
    }).then(res => {
      if (!res.ok) {
        console.warn(`[EventLogPersistor] POST ${endpoint} → HTTP ${res.status}`);
      }
    }).catch(err => {
      if (onError) onError(err);
      else console.warn('[EventLogPersistor] POST failed (non-fatal):', err);
    });
  };
}
