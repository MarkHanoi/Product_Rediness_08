// @pryzm/beta-signup — orchestrator (S48 D1).
//
// Validates → normalises → records → dispatches confirmation email.
// Pure of side effects until the final two steps; transport + store
// are injected.

import type { EmailTransport, EmailMessage } from '@pryzm/email-transport';
import type { BetaSignupStore } from './BetaSignupStore.js';
import { normaliseBetaSignup, validateBetaSignup } from './validation.js';
import type {
  BetaSignupPayload,
  BetaSignupRecord,
  BetaSignupValidationError,
} from './types.js';

export interface SubmitBetaSignupDeps {
  readonly store: BetaSignupStore;
  readonly transport: EmailTransport;
  readonly fromAddress: { email: string; name?: string };
  /** Test injection. Defaults to Date.now / a counter. */
  readonly now?: () => number;
  readonly genId?: () => string;
}

export type SubmitBetaSignupResult =
  | {
      readonly ok: true;
      readonly record: BetaSignupRecord;
      /** True when an existing signup with the same email was returned. */
      readonly deduplicated: boolean;
    }
  | {
      readonly ok: false;
      readonly errors: ReadonlyArray<BetaSignupValidationError>;
    };

let _idSeq = 0;
function defaultGenId(): string {
  _idSeq += 1;
  return `bs_${Date.now().toString(36)}_${_idSeq.toString(36).padStart(4, '0')}`;
}

export async function submitBetaSignup(
  raw: BetaSignupPayload,
  deps: SubmitBetaSignupDeps,
): Promise<SubmitBetaSignupResult> {
  const validation = validateBetaSignup(raw);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }
  const payload = normaliseBetaSignup(raw);

  const existing = deps.store.byEmail(payload.email);
  if (existing) {
    return { ok: true, record: existing, deduplicated: true };
  }

  const id = (deps.genId ?? defaultGenId)();
  const now = (deps.now ?? Date.now)();

  const message: EmailMessage = {
    to: { email: payload.email, ...(payload.name ? { name: payload.name } : {}) },
    from: deps.fromAddress,
    subject: 'Thanks for joining the PRYZM beta wait-list',
    text:
      `Hi ${payload.name},\n\n` +
      `Thanks for signing up for the PRYZM beta. We're curating the first ` +
      `cohort (8 × independent practitioner, 10 × small studio, 5 × large ` +
      `practice IT, 2 × educator) and will reach out individually once ` +
      `your slot is ready.\n\n` +
      `— The PRYZM team`,
    idempotencyKey: `beta-signup-${id}`,
  };

  let confirmationMessageId: string | null = null;
  try {
    const r = await deps.transport.send(message);
    confirmationMessageId = r.messageId;
  } catch {
    // Email failure does NOT abort the signup — the record is still
    // captured. Operations resends manually from the inspect log.
    confirmationMessageId = null;
  }

  const record: BetaSignupRecord = {
    ...payload,
    id,
    receivedAt: now,
    confirmationMessageId,
    status: 'pending',
  };
  deps.store.enqueue(record);

  return { ok: true, record, deduplicated: false };
}
