// packages/sync-client/__tests__/_chaos/RandomEditGenerator.ts — W-04.
//
// Drives chaos peers by producing pseudo-random PRYZM-shape commits.  Each
// commit is shaped like a real `EventEnvelope` so EventBridge.forward (the
// CommandBus.onCommitted path) is exercised end-to-end.
//
// Edit mix (uniform over the listed families per W-04 §"random-edit
// generator"; the actual proportions don't matter for convergence testing
// — diversity matters, so the harness covers all branches of the YDoc
// shape):
//
//   • wall.create     — payload: { x, y, z, length }
//   • wall.modify     — payload: { id, length }
//   • wall.delete     — payload: { id }
//   • door.create     — payload: { wallId, offset }
//   • cde.linkDocument — payload: { entityId, documentUri }
//
// "modify" / "delete" target an existing event id observed in the local
// doc; if none exists the generator falls back to "create".

import type { Doc as YDoc, Map as YMap } from 'yjs';
import type { SeededRng } from './prng.js';

const EVENTS_MAP_NAME = 'events';

export type ChaosEventType =
  | 'wall.create'
  | 'wall.modify'
  | 'wall.delete'
  | 'door.create'
  | 'cde.linkDocument';

export interface ChaosEvent {
  readonly id: string;
  readonly type: ChaosEventType;
  readonly actorId: string;
  readonly payload: Record<string, unknown>;
}

const EDIT_FAMILIES: readonly ChaosEventType[] = [
  'wall.create', 'wall.create', 'wall.create',
  'wall.modify', 'wall.delete',
  'door.create', 'cde.linkDocument',
];

export class RandomEditGenerator {
  constructor(
    private readonly rng: SeededRng,
    private readonly actorId: string,
  ) {}

  /** Generate one event.  Looks at the shared Y.Doc to decide between
   *  create / modify / delete (so generated events form a connected graph
   *  rather than orphans). */
  next(doc: YDoc): ChaosEvent {
    const events = doc.getMap<unknown>(EVENTS_MAP_NAME);
    const existing = [...events.keys()];
    const familyCandidate = this.rng.pick(EDIT_FAMILIES);
    // Fallback when the local doc is still empty.
    const family: ChaosEventType =
      (familyCandidate === 'wall.modify' || familyCandidate === 'wall.delete' || familyCandidate === 'door.create') &&
      existing.length === 0
        ? 'wall.create'
        : familyCandidate;

    const id = this.rng.newId('E');
    switch (family) {
      case 'wall.create':
        return {
          id, actorId: this.actorId, type: 'wall.create',
          payload: {
            x: this.rng.nextInt(0, 1000),
            y: this.rng.nextInt(0, 1000),
            z: 0,
            length: this.rng.nextInt(100, 5000),
            levelId: '__root__',
          },
        };
      case 'wall.modify': {
        const target = this.rng.pick(existing);
        return {
          id, actorId: this.actorId, type: 'wall.modify',
          payload: { targetId: target, length: this.rng.nextInt(100, 5000) },
        };
      }
      case 'wall.delete': {
        const target = this.rng.pick(existing);
        return { id, actorId: this.actorId, type: 'wall.delete', payload: { targetId: target } };
      }
      case 'door.create': {
        const wallId = this.rng.pick(existing);
        return {
          id, actorId: this.actorId, type: 'door.create',
          payload: { wallId, offset: this.rng.nextInt(0, 5000) },
        };
      }
      case 'cde.linkDocument':
        return {
          id, actorId: this.actorId, type: 'cde.linkDocument',
          payload: { entityId: `wall_${this.rng.nextInt(1, 1000)}`, documentUri: `https://docs.example/${this.rng.newId('D')}` },
        };
    }
  }
}

/** Convenience: dump every (id, payload) pair in the events map for the
 *  given doc.  Used by `convergence.ts` to compare peers. */
export function snapshotEventsMap(doc: YDoc): Map<string, unknown> {
  const events = doc.getMap<unknown>(EVENTS_MAP_NAME);
  const out = new Map<string, unknown>();
  for (const [k, v] of events.entries()) out.set(k, v);
  return out;
}
