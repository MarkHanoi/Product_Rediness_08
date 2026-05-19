// Phase C — `runtime.persistence.eventLog.{tag,tags,replayUntil,diff}` bench.
//
// Spec: PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md §16.3 sub-phases
// C.6.04 (Save-as-named-version), C.7.01 (version list paint),
// C.7.02 (restore version), C.7.03 (diff between versions).

import { bench, describe } from 'vitest';
import { EventLog, InMemoryBackend, RuntimeEventLog } from '@pryzm/persistence-client';
import { ulid } from 'ulid';

function makeAudit(projectId: string) {
  return {
    actorId: 'tester',
    projectId,
    clientId: 'bench-client',
    sessionId: 'bench-session',
    causationId: undefined,
    correlationId: undefined,
    timestampMs: Date.now(),
  };
}

async function seed(log: EventLog, n: number) {
  const audit = makeAudit('bench');
  for (let i = 0; i < n; i++) {
    await log.append({
      id: ulid(),
      type: `bench.evt.${i % 4}`,
      payload: { i },
      affectedStores: [],
      patches: [],
      audit,
      forward: [],
      inverse: [],
    });
  }
}

describe('runtime.persistence.eventLog (RuntimeEventLog)', () => {
  for (const n of [10, 100, 1000]) {
    bench(`tag() append on a log of ${n} events`, async () => {
      const backend = new InMemoryBackend();
      const log = new EventLog(backend);
      await seed(log, n);
      const rel = new RuntimeEventLog({ eventLog: log, audit: makeAudit('bench') });
      await rel.tag(`v${n}`, { source: 'bench' });
    });

    bench(`tags() scan over ${n} events`, async () => {
      const backend = new InMemoryBackend();
      const log = new EventLog(backend);
      await seed(log, n);
      const rel = new RuntimeEventLog({ eventLog: log, audit: makeAudit('bench') });
      for (let i = 0; i < 4; i++) await rel.tag(`v${i}`, {});
      const tags = await rel.tags();
      void tags;
    });
  }
});
