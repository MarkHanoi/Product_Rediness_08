import { describe, it, expect } from 'vitest';
import { InMemoryDeliveryQueue, InMemoryWebhookStore, PRYZM_SIGNATURE_HEADER, RETRY_BACKOFF_MS, computeFireAt, deliverOnce, deliverWithRetry, } from '../src/index.js';
function envelope(o = {}) {
    return {
        id: 'd_1',
        eventId: 'e_1',
        event: 'project.created',
        workspaceId: 'ws-1',
        projectId: 'p-1',
        ts: 1700000000000,
        data: { name: 'demo' },
        ...o,
    };
}
function makeStore() {
    let n = 0;
    const store = new InMemoryWebhookStore({
        idFactory: () => `wh_${++n}`,
        secretFactory: () => 'k'.repeat(32),
    });
    const sub = store.create({
        workspaceId: 'ws-1',
        createdBy: 'u',
        body: { url: 'https://example.com/hook', events: ['project.created'] },
    });
    return { store, sub };
}
describe('deliverOnce()', () => {
    it('sends POST with signed body + correct headers + records ok', async () => {
        const { store, sub } = makeStore();
        let captured = null;
        const fetchImpl = async (url, init) => {
            captured = { url, init };
            return { status: 200, ok: true };
        };
        const result = await deliverOnce(sub, envelope(), store, { fetchImpl });
        expect(result.status).toBe('ok');
        expect(result.httpStatus).toBe(200);
        expect(captured).not.toBeNull();
        expect(captured.url).toBe('https://example.com/hook');
        expect(captured.init.method).toBe('POST');
        expect(captured.init.headers['content-type']).toBe('application/json');
        expect(captured.init.headers[PRYZM_SIGNATURE_HEADER]).toMatch(/^t=\d+,v1=[a-f0-9]+/);
        expect(captured.init.headers['pryzm-event']).toBe('project.created');
        expect(captured.init.headers['pryzm-attempt']).toBe('1');
        expect(store.get(sub.id)?.lastDeliveryStatus).toBe('ok');
    });
    it('records failed when receiver returns 500', async () => {
        const { store, sub } = makeStore();
        const fetchImpl = async () => ({ status: 500, ok: false });
        const result = await deliverOnce(sub, envelope(), store, { fetchImpl });
        expect(result.status).toBe('failed');
        expect(result.httpStatus).toBe(500);
        expect(store.get(sub.id)?.lastDeliveryStatus).toBe('failed');
    });
    it('records failed when transport throws', async () => {
        const { store, sub } = makeStore();
        const fetchImpl = async () => { throw new Error('econn'); };
        const result = await deliverOnce(sub, envelope(), store, { fetchImpl });
        expect(result.status).toBe('failed');
        expect(result.error).toBe('econn');
    });
});
describe('computeFireAt()', () => {
    it('returns now + backoff for valid attempt', () => {
        expect(computeFireAt(1000, 1)).toBe(1000 + RETRY_BACKOFF_MS[0]);
        expect(computeFireAt(1000, 2)).toBe(1000 + RETRY_BACKOFF_MS[1]);
        expect(computeFireAt(0, 5)).toBe(RETRY_BACKOFF_MS[4]);
    });
    it('returns undefined when attempts exhausted', () => {
        expect(computeFireAt(0, 6)).toBeUndefined();
        expect(computeFireAt(0, 0)).toBeUndefined();
    });
});
describe('InMemoryDeliveryQueue', () => {
    it('drainReady returns items ordered by fireAt', () => {
        const q = new InMemoryDeliveryQueue();
        q.enqueue({ subscriptionId: 's', envelope: envelope({ id: 'a' }), nextAttempt: 2, fireAt: 200 });
        q.enqueue({ subscriptionId: 's', envelope: envelope({ id: 'b' }), nextAttempt: 2, fireAt: 100 });
        q.enqueue({ subscriptionId: 's', envelope: envelope({ id: 'c' }), nextAttempt: 2, fireAt: 300 });
        const ready = q.drainReady(250);
        expect(ready.map((i) => i.envelope.id)).toEqual(['b', 'a']);
        expect(q.size()).toBe(1);
    });
    it('drainReady returns empty when nothing ready', () => {
        const q = new InMemoryDeliveryQueue();
        q.enqueue({ subscriptionId: 's', envelope: envelope(), nextAttempt: 2, fireAt: 1000 });
        expect(q.drainReady(500)).toHaveLength(0);
        expect(q.size()).toBe(1);
    });
});
describe('deliverWithRetry()', () => {
    it('returns ok without enqueueing when first attempt succeeds', async () => {
        const { store, sub } = makeStore();
        const queue = new InMemoryDeliveryQueue();
        const fetchImpl = async () => ({ status: 200, ok: true });
        const result = await deliverWithRetry(sub, envelope(), store, queue, { fetchImpl });
        expect(result.status).toBe('ok');
        expect(queue.size()).toBe(0);
    });
    it('enqueues attempt 2 with correct backoff when first attempt fails', async () => {
        const { store, sub } = makeStore();
        const queue = new InMemoryDeliveryQueue();
        const fetchImpl = async () => ({ status: 503, ok: false });
        let now = 1_000_000;
        const result = await deliverWithRetry(sub, envelope(), store, queue, {
            fetchImpl,
            clock: () => now,
        });
        expect(result.status).toBe('failed');
        expect(queue.size()).toBe(1);
        // computeFireAt(now, 2) uses RETRY_BACKOFF_MS[1] — the index is
        // (nextAttempt - 1), so attempt 2's wait is the 5s slot.
        expect(queue.drainReady(now + RETRY_BACKOFF_MS[0])).toHaveLength(0);
        const ready = queue.drainReady(now + RETRY_BACKOFF_MS[1]);
        expect(ready).toHaveLength(1);
        expect(ready[0].nextAttempt).toBe(2);
    });
});
//# sourceMappingURL=delivery.test.js.map