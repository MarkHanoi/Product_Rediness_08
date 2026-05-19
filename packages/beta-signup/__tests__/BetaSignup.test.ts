import { describe, it, expect } from 'vitest';
import { MemoryEmailTransport } from '@pryzm/email-transport';
import { BetaSignupStore } from '../src/BetaSignupStore.js';
import { submitBetaSignup } from '../src/submitBetaSignup.js';
import { validateBetaSignup, normaliseBetaSignup } from '../src/validation.js';
import type { BetaSignupPayload } from '../src/types.js';

const PAYLOAD: BetaSignupPayload = {
  email: '  Beta@Example.COM ',
  name: '  Bea Tester ',
  cohort: 'c2',
  useCase: '5-person studio testing collab',
};

const FROM = { email: 'hello@pryzm.com', name: 'PRYZM' };

function harness() {
  let nowVal = 1_700_000_000_000;
  let idSeq = 0;
  const store = new BetaSignupStore();
  const transport = new MemoryEmailTransport({ now: () => nowVal });
  return {
    store,
    transport,
    deps: {
      store,
      transport,
      fromAddress: FROM,
      now: () => nowVal,
      genId: () => `bs_${(idSeq += 1).toString().padStart(3, '0')}`,
    },
    advance: (ms: number) => {
      nowVal += ms;
    },
  };
}

describe('validation', () => {
  it('flags invalid email + missing name + invalid cohort + long use-case', () => {
    const r = validateBetaSignup({
      email: 'not-an-email',
      name: '',
      cohort: 'enterprise' as never,
      useCase: 'x'.repeat(600),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const codes = r.errors.map((e) => e.code).sort();
      expect(codes).toEqual([
        'invalid-cohort',
        'invalid-email',
        'missing-name',
        'use-case-too-long',
      ]);
    }
  });

  it('accepts a clean payload', () => {
    expect(validateBetaSignup(PAYLOAD).ok).toBe(true);
  });

  it('normalises trims + lowercases the email', () => {
    const n = normaliseBetaSignup(PAYLOAD);
    expect(n.email).toBe('beta@example.com');
    expect(n.name).toBe('Bea Tester');
    expect(n.useCase).toBe('5-person studio testing collab');
  });
});

describe('submitBetaSignup', () => {
  it('records the signup + dispatches confirmation email', async () => {
    const h = harness();
    const r = await submitBetaSignup(PAYLOAD, h.deps);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.deduplicated).toBe(false);
      expect(r.record.email).toBe('beta@example.com');
      expect(r.record.status).toBe('pending');
      expect(r.record.confirmationMessageId).toMatch(/^mem_/);
    }
    expect(h.store.count()).toBe(1);
    expect(h.transport.countTo('beta@example.com')).toBe(1);
    const msg = h.transport.inspect()[0];
    expect(msg?.subject).toMatch(/PRYZM beta/);
  });

  it('returns ok:false with structured errors on bad input', async () => {
    const h = harness();
    const r = await submitBetaSignup(
      { ...PAYLOAD, email: 'nope' },
      h.deps,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.field).toBe('email');
    expect(h.store.count()).toBe(0);
    expect(h.transport.countTo()).toBe(0);
  });

  it('dedupes by email — second submit returns the existing record', async () => {
    const h = harness();
    const a = await submitBetaSignup(PAYLOAD, h.deps);
    const b = await submitBetaSignup(
      { ...PAYLOAD, name: 'Different Name' },
      h.deps,
    );
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.deduplicated).toBe(true);
      expect(b.record.id).toBe(a.record.id);
      expect(b.record.name).toBe('Bea Tester'); // not "Different Name"
    }
    expect(h.store.count()).toBe(1);
    expect(h.transport.countTo()).toBe(1);
  });

  it('records the signup even when email transport throws', async () => {
    const h = harness();
    await h.transport.close();
    const r = await submitBetaSignup(PAYLOAD, h.deps);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.record.confirmationMessageId).toBeNull();
    }
    expect(h.store.count()).toBe(1);
  });

  it('countByCohort enumerates all 4 buckets', async () => {
    const h = harness();
    await submitBetaSignup({ ...PAYLOAD, email: 'a@x.com', cohort: 'c1' }, h.deps);
    await submitBetaSignup({ ...PAYLOAD, email: 'b@x.com', cohort: 'c2' }, h.deps);
    await submitBetaSignup({ ...PAYLOAD, email: 'c@x.com', cohort: 'c2' }, h.deps);
    await submitBetaSignup({ ...PAYLOAD, email: 'd@x.com', cohort: 'academic' }, h.deps);
    expect(h.store.countByCohort()).toEqual({ c1: 1, c2: 2, c3: 0, academic: 1 });
  });

  it('setStatus transitions pending → invited', async () => {
    const h = harness();
    const r = await submitBetaSignup(PAYLOAD, h.deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    h.store.setStatus(r.record.id, 'invited');
    expect(h.store.byId(r.record.id)?.status).toBe('invited');
  });
});
