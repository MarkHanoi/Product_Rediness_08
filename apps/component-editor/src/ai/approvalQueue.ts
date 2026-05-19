// AI approval queue (S54).
//
// Holds the AI-proposed actions awaiting the author's accept-whole /
// reject-whole / accept-with-edits decision (rewrite plan §19.3).
// In-memory FIFO with a tiny pub-sub so the panel UI (when wired in
// a later sprint) can render the queue reactively.
//
// LAYER — L7 chrome-side. No THREE, no DOM, no `(window as any)`.

import type {
  AiApprovalQueueEvent,
  AiApprovalQueueListener,
  AiPendingActionLike,
} from './types.js';

export interface AiApprovalQueue {
  /** Append an action to the queue.  Throws on duplicate id. */
  enqueue(action: AiPendingActionLike): void;
  /** Read-only ordered snapshot of the queue. */
  list(): ReadonlyArray<AiPendingActionLike>;
  /** Inspect the head without removing it. */
  peek(): AiPendingActionLike | undefined;
  /** Remove and return the action with the given id; emits `accepted`. */
  accept(id: string): AiPendingActionLike | undefined;
  /** Remove and return the action with the given id; emits `rejected`. */
  reject(id: string, reason?: string): AiPendingActionLike | undefined;
  /** Remove every action; emits `cleared`. */
  clear(): void;
  /** Subscribe to lifecycle events.  Returns the unsubscribe function. */
  subscribe(listener: AiApprovalQueueListener): () => void;
  /** Live size accessor. */
  size(): number;
}

export function createAiApprovalQueue(): AiApprovalQueue {
  const items: AiPendingActionLike[] = [];
  const listeners: Set<AiApprovalQueueListener> = new Set();

  function emit(event: AiApprovalQueueEvent): void {
    for (const l of listeners) {
      try {
        l(event);
      } catch {
        // Listeners must not throw into the producer.
      }
    }
  }

  function spliceById(id: string): AiPendingActionLike | undefined {
    const idx = items.findIndex((a) => a.id === id);
    if (idx < 0) return undefined;
    const [removed] = items.splice(idx, 1);
    return removed;
  }

  return {
    enqueue(action) {
      if (items.some((a) => a.id === action.id)) {
        throw new Error(`approvalQueue.enqueue: duplicate id "${action.id}".`);
      }
      items.push(action);
      emit({ kind: 'enqueued', action });
    },
    list() {
      return Object.freeze(items.slice());
    },
    peek() {
      return items[0];
    },
    accept(id) {
      const removed = spliceById(id);
      if (removed) emit({ kind: 'accepted', id });
      return removed;
    },
    reject(id, reason) {
      const removed = spliceById(id);
      if (removed) {
        emit(reason !== undefined ? { kind: 'rejected', id, reason } : { kind: 'rejected', id });
      }
      return removed;
    },
    clear() {
      if (items.length === 0) return;
      items.length = 0;
      emit({ kind: 'cleared' });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    size() {
      return items.length;
    },
  };
}
