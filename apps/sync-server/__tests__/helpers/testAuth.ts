// apps/sync-server/__tests__/helpers/testAuth.ts — L-391 R-B.
//
// Shared credentials for every suite that opens a socket against the sync
// server.  Since R-B, an unauthenticated upgrade is REFUSED — so the existing
// suites (Roundtrip, Chaos, YjsTwoClient) now connect the way a real client
// does: with a session token.  That is deliberate.  Had they been switched to
// `PRYZM_SYNC_WS_AUTH=trust-query` instead, the repo's convergence evidence
// would have been produced on a code path production will never run.

import { signSessionToken } from '../../src/auth/index.js';

/** Test-only shared secret.  Never a real SESSION_SECRET. */
export const TEST_SESSION_SECRET = 'sync-server-test-session-secret';

/** A valid 1-hour session token for `sub`. */
export function testToken(sub = 'u-test'): string {
  return signSessionToken({ sub, email: `${sub}@example.test`, secret: TEST_SESSION_SECRET });
}

/** URL-ready `token=…` fragment. */
export function tokenParam(sub = 'u-test'): string {
  return `token=${encodeURIComponent(testToken(sub))}`;
}
