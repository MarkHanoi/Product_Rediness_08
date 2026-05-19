import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryEmailTransport } from '../src/MemoryEmailTransport.js';
import {
  getEmailTransport,
  isEmailTransportLoaded,
  _resetEmailTransportForTests,
} from '../src/EmailTransport.js';
import type { EmailMessage } from '../src/types.js';

const SAMPLE: EmailMessage = {
  to: { email: 'beta@example.com', name: 'Beta User' },
  from: { email: 'hello@pryzm.com', name: 'PRYZM' },
  subject: 'Welcome to the PRYZM beta',
  text: 'Thanks for signing up.',
};

describe('MemoryEmailTransport', () => {
  let t: MemoryEmailTransport;
  beforeEach(() => {
    t = new MemoryEmailTransport({ now: () => 1_700_000_000_000 });
  });

  it('captures every send and returns a stable receipt', async () => {
    const r = await t.send(SAMPLE);
    expect(r.messageId).toMatch(/^mem_/);
    expect(r.acceptedAt).toBe(1_700_000_000_000);
    expect(t.countTo()).toBe(1);
    expect(t.countTo('beta@example.com')).toBe(1);
    expect(t.countTo('other@example.com')).toBe(0);
  });

  it('rejects malformed messages with clear errors', async () => {
    await expect(t.send({ ...SAMPLE, to: { email: '' } })).rejects.toThrow(
      /missing to\.email/,
    );
    await expect(t.send({ ...SAMPLE, from: { email: '' } })).rejects.toThrow(
      /missing from\.email/,
    );
    await expect(t.send({ ...SAMPLE, subject: '' })).rejects.toThrow(/missing subject/);
    await expect(t.send({ ...SAMPLE, text: '' })).rejects.toThrow(/missing body/);
  });

  it('idempotency-key short-circuits repeat sends to the same receipt', async () => {
    const a = await t.send({ ...SAMPLE, idempotencyKey: 'beta-signup-001' });
    const b = await t.send({ ...SAMPLE, idempotencyKey: 'beta-signup-001' });
    expect(a.messageId).toBe(b.messageId);
    expect(t.countTo()).toBe(1);
    expect(a.idempotencyKey).toBe('beta-signup-001');
  });

  it('rejects sends after close', async () => {
    await t.close();
    await expect(t.send(SAMPLE)).rejects.toThrow(/closed/);
  });
});

describe('getEmailTransport (lazy)', () => {
  beforeEach(() => _resetEmailTransportForTests());

  it('is unloaded before first call, loaded after', async () => {
    expect(isEmailTransportLoaded()).toBe(false);
    await getEmailTransport({ env: {} });
    expect(isEmailTransportLoaded()).toBe(true);
  });

  it('returns the memory transport by default in a clean env', async () => {
    const t = await getEmailTransport({ env: {} });
    const r = await t.send(SAMPLE);
    expect(r.messageId).toMatch(/^mem_/);
  });

  it('shares the in-flight Promise across concurrent first calls', async () => {
    const [a, b] = await Promise.all([
      getEmailTransport({ env: {} }),
      getEmailTransport({ env: {} }),
    ]);
    expect(a).toBe(b);
  });

  it('SMTP requested + URL set → loud-fails with ADR-0038 pointer', async () => {
    _resetEmailTransportForTests();
    await expect(
      getEmailTransport({
        env: { PRYZM_EMAIL_TRANSPORT: 'smtp', SMTP_URL: 'smtp://x:y@example.com:587' },
      }),
    ).rejects.toThrow(/ADR-0038/);
  });

  it('SMTP requested without URL → loud-fails with config hint', async () => {
    _resetEmailTransportForTests();
    await expect(
      getEmailTransport({ env: { PRYZM_EMAIL_TRANSPORT: 'smtp' } }),
    ).rejects.toThrow(/SMTP_URL is not set/);
  });
});
