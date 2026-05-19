// @pryzm/email-transport — public lazy entry (S48 D1).
//
// Mirrors `getAiHost()` from @pryzm/ai-host: the only public way to
// obtain an EmailTransport. The impl module is dynamically imported
// so callers (and the editor's first-paint bundle) never statically
// link the SMTP adapter.
//
// Selection (matches createEventLog / createQueue):
//
//   env.PRYZM_EMAIL_TRANSPORT  | env.SMTP_URL set? | result
//   ─────────────────────────────────────────────────────────────────
//   'memory'                   | any                | MemoryEmailTransport
//   'smtp'                     | yes                | dynamic import of './smtp-transport.js' (NOT shipped in S48 — throws clear error)
//   'smtp' or unset            | no                 | MemoryEmailTransport
//   unset                      | no                 | MemoryEmailTransport (default)
//
// SMTP adapter binding: deferred to S48 D9 launch when SMTP_URL is
// provisioned. See ADR-0038 §3.

import type {
  EmailTransport,
  EmailTransportOptions,
} from './types.js';

let _transport: EmailTransport | null = null;
let _pending: Promise<EmailTransport> | null = null;

export async function getEmailTransport(
  opts?: EmailTransportOptions,
): Promise<EmailTransport> {
  if (_transport) return _transport;
  if (_pending) return _pending;
  _pending = (async () => {
    const mod = await import('./EmailTransport.impl.js');
    _transport = await mod.createEmailTransport(opts ?? {});
    _pending = null;
    return _transport;
  })();
  return _pending;
}

/** Test-only — drop the cached transport so the next `getEmailTransport()`
 *  re-loads the impl. Not exported from the barrel. */
export function _resetEmailTransportForTests(): void {
  _transport = null;
  _pending = null;
}

/** True when the impl has been loaded. K3-A-style polling for cold-
 *  start budget assertions in CI. */
export function isEmailTransportLoaded(): boolean {
  return _transport !== null;
}
