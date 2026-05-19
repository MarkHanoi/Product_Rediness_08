// @pryzm/email-transport — public type surface (S48 D1).
//
// The transport is small and intentionally schema-stable: the email
// shape is the same in dev (MemoryEmailTransport) and prod (real
// SMTP/Resend/Postmark adapter). The transactional pipeline used by
// the beta sign-up flow + future invitations + future digest emails
// only ever talks to this interface.

export interface EmailAddress {
  readonly email: string;
  /** Optional human-readable name, rendered in the From/To headers. */
  readonly name?: string;
}

export interface EmailMessage {
  readonly to: EmailAddress;
  readonly from: EmailAddress;
  readonly subject: string;
  readonly text: string;
  /** Optional HTML body. When absent, transports MAY render `text` as
   *  preformatted HTML or send text-only at their discretion. */
  readonly html?: string;
  /** Optional headers passed through verbatim. Reserved keys (To, From,
   *  Subject, Date, Message-ID) MUST NOT be set here. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Optional ISO-8601 timestamp the caller wants the message stamped
   *  with. Transports default to the wall clock. */
  readonly sentAt?: string;
  /** Idempotency key — transports MUST treat repeated `send()` calls
   *  with the same key as one delivery. */
  readonly idempotencyKey?: string;
}

export interface EmailSendResult {
  /** Provider-assigned message id. For MemoryEmailTransport this is a
   *  ULID. */
  readonly messageId: string;
  /** Wall-clock time the transport accepted the message. */
  readonly acceptedAt: number;
  /** Echoed from the request when supplied. */
  readonly idempotencyKey?: string;
}

export interface EmailTransport {
  /** Best-effort enqueue — returns a delivery receipt. Throws on
   *  validation failure (missing to/from/subject). */
  send(msg: EmailMessage): Promise<EmailSendResult>;
  /** Drain any in-memory buffer. The MemoryEmailTransport flushes
   *  sync. Real adapters may flush retry buffers here. */
  flush(): Promise<void>;
  /** Close the transport. Idempotent. After close, `send()` rejects. */
  close(): Promise<void>;
}

/** Selection env passed into `getEmailTransport(env)`. Mirrors the
 *  `createEventLog({env})` pattern in apps/sync-server. */
export interface EmailTransportEnv {
  readonly PRYZM_EMAIL_TRANSPORT?: 'memory' | 'smtp';
  readonly SMTP_URL?: string;
  /** Default sender if a message omits it. Required for `smtp`. */
  readonly EMAIL_DEFAULT_FROM?: string;
}

export interface EmailTransportOptions {
  readonly env?: EmailTransportEnv;
  /** Optional clock injection for tests. */
  readonly now?: () => number;
}
