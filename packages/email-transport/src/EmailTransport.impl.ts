// @pryzm/email-transport — impl (loaded only via dynamic import).
//
// Selection logic that picks between MemoryEmailTransport (default,
// dev) and the SMTP adapter (S48 D9 launch + SMTP_URL).

import { MemoryEmailTransport } from './MemoryEmailTransport.js';
import type {
  EmailTransport,
  EmailTransportEnv,
  EmailTransportOptions,
} from './types.js';

export async function createEmailTransport(
  opts: EmailTransportOptions,
): Promise<EmailTransport> {
  const env: EmailTransportEnv = opts.env ?? readProcessEnv();

  const explicit = env.PRYZM_EMAIL_TRANSPORT;
  const wantSmtp = explicit === 'smtp' || (!explicit && Boolean(env.SMTP_URL));

  if (wantSmtp) {
    if (!env.SMTP_URL) {
      throw new Error(
        '[email-transport] SMTP transport requested (PRYZM_EMAIL_TRANSPORT=smtp) ' +
          'but SMTP_URL is not set. Set SMTP_URL or omit PRYZM_EMAIL_TRANSPORT to ' +
          'use MemoryEmailTransport. See ADR-0038 §3 for the deferred SMTP adapter binding.',
      );
    }
    // SMTP adapter is deferred to S48 D9 launch. Until then, requesting
    // SMTP loud-fails per the project's "explicit when it fails" principle.
    throw new Error(
      '[email-transport] SMTP transport not yet shipped. ' +
        'Bound to S48 D9 launch when SMTP_URL is provisioned. See ADR-0038 §3 ' +
        '("Deferred bindings — real SMTP/Resend/Postmark adapter").',
    );
  }

  const memOpts: { now?: () => number } = {};
  if (opts.now) memOpts.now = opts.now;
  return new MemoryEmailTransport(memOpts);
}

function readProcessEnv(): EmailTransportEnv {
  const e = (typeof process !== 'undefined' ? process.env : undefined) ?? {};
  const pryzm = e['PRYZM_EMAIL_TRANSPORT'];
  return {
    ...(pryzm === 'memory' || pryzm === 'smtp' ? { PRYZM_EMAIL_TRANSPORT: pryzm } : {}),
    ...(e['SMTP_URL'] ? { SMTP_URL: e['SMTP_URL'] } : {}),
    ...(e['EMAIL_DEFAULT_FROM'] ? { EMAIL_DEFAULT_FROM: e['EMAIL_DEFAULT_FROM'] } : {}),
  };
}
