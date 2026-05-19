// @pryzm/email-transport — in-memory transport (S48 D1 default).
//
// Used in dev + tests. Captures every sent message into an in-memory
// log so the caller can assert delivery without provisioning SMTP.
//
// Idempotency: messages sent with the same `idempotencyKey` resolve to
// the *first* call's result; subsequent sends do NOT append.

import type {
  EmailMessage,
  EmailSendResult,
  EmailTransport,
} from './types.js';

let _seq = 0;
function nextMessageId(): string {
  // Predictable, ULID-shaped enough to be obvious in logs but stable
  // across test runs. Real transports use provider IDs.
  _seq += 1;
  return `mem_${Date.now().toString(36)}_${_seq.toString(36).padStart(4, '0')}`;
}

export class MemoryEmailTransport implements EmailTransport {
  private readonly _log: EmailMessage[] = [];
  private readonly _byIdem = new Map<string, EmailSendResult>();
  private _closed = false;
  private readonly _now: () => number;

  constructor(opts?: { now?: () => number }) {
    this._now = opts?.now ?? (() => Date.now());
  }

  async send(msg: EmailMessage): Promise<EmailSendResult> {
    if (this._closed) throw new Error('MemoryEmailTransport: closed');
    if (!msg.to?.email) throw new Error('MemoryEmailTransport: missing to.email');
    if (!msg.from?.email) throw new Error('MemoryEmailTransport: missing from.email');
    if (!msg.subject) throw new Error('MemoryEmailTransport: missing subject');
    if (!msg.text && !msg.html) {
      throw new Error('MemoryEmailTransport: missing body (text or html required)');
    }

    if (msg.idempotencyKey) {
      const prior = this._byIdem.get(msg.idempotencyKey);
      if (prior) return prior;
    }

    const result: EmailSendResult = {
      messageId: nextMessageId(),
      acceptedAt: this._now(),
      ...(msg.idempotencyKey ? { idempotencyKey: msg.idempotencyKey } : {}),
    };
    this._log.push(msg);
    if (msg.idempotencyKey) this._byIdem.set(msg.idempotencyKey, result);
    return result;
  }

  async flush(): Promise<void> {
    /* in-memory transport is sync — nothing to drain. */
  }

  async close(): Promise<void> {
    this._closed = true;
  }

  /** Test-only — read the captured log. Returns a defensive copy. */
  inspect(): readonly EmailMessage[] {
    return this._log.slice();
  }

  /** Test-only — drop captured state. Reopens the transport. */
  reset(): void {
    this._log.length = 0;
    this._byIdem.clear();
    this._closed = false;
  }

  /** Test-only — count messages, optionally filtered by To address. */
  countTo(email?: string): number {
    if (!email) return this._log.length;
    return this._log.filter((m) => m.to.email === email).length;
  }
}
