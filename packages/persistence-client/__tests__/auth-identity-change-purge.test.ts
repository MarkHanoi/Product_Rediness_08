// @vitest-environment happy-dom
//
// §AUTH-SESSION-LEAK-2 (CRITICAL SECURITY) — account-switch identity-purge signal.
//
// THE DEFECT (confirmed, previously fixed, previously UNTESTED). When a DIFFERENT
// user authenticates on a browser that still holds the previous user's session
// (account switch, or a second account created without signing out first), the
// token is overwritten but the previous user's CLIENT-SIDE caches survive:
// `ProjectListStore` in memory, IndexedDB, localStorage project metadata. The new
// account then SEES the previous user's projects in the hub, and gets HTTP 404 on
// open/delete because the server correctly scopes by owner.
//
// THE FIX is a two-part chain:
//   (1) `AuthClient.persistSession` — the single chokepoint every auth path
//       (email + OAuth) funnels through — compares the PREVIOUS stored user id to
//       the incoming one and emits `pryzm:auth:identity-changed` on the bus.
//   (2) `AuthModal.installAccountSwitchGuard` subscribes to that event and runs
//       `purgeUserScopedClientState()` + a hard reload.
//
// WHY THIS FILE EXISTS. Before it, link (1) had ZERO test coverage anywhere in the
// repo — the only occurrence of `pryzm:auth:identity-changed` outside the event
// catalog was the emitter itself and its consumer. A security control whose
// trigger condition is never asserted is a control that silently stops working the
// first time someone reorders `persistSession` (e.g. writes the new user to
// storage BEFORE reading the previous id — a one-line change that makes
// `previousUserId === user.id` always true and disables the purge forever, with no
// test, no type error and no console difference).
//
// These tests pin the TRIGGER CONDITION, which is the part that can silently
// invert. The purge/reload half lives in the editor app's `AuthModal` and is
// asserted there.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthClient, AUTH_TOKEN_KEY, AUTH_USER_KEY } from '../src/AuthClient.js';

/** An in-memory `Storage` good enough for AuthClient's four calls. */
function memoryStorage(seed: Record<string, string> = {}): Storage {
    const map = new Map<string, string>(Object.entries(seed));
    return {
        get length() { return map.size; },
        clear: () => map.clear(),
        getItem: (k: string) => map.get(k) ?? null,
        key: (i: number) => [...map.keys()][i] ?? null,
        removeItem: (k: string) => { map.delete(k); },
        setItem: (k: string, v: string) => { map.set(k, v); },
    } as Storage;
}

function userJson(id: string): string {
    return JSON.stringify({ id, email: `${id}@example.com`, createdAt: 1 });
}

/** A fetch stub that returns a successful sign-in for `userId`. */
function fetchReturning(userId: string): typeof fetch {
    return (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
            user: { id: userId, email: `${userId}@example.com`, createdAt: 1 },
            token: `token-for-${userId}`,
        }),
    })) as unknown as typeof fetch;
}

let events: Array<{ previousUserId: string; userId: string }>;
let listener: (e: Event) => void;

beforeEach(() => {
    events = [];
    listener = (e: Event) => events.push((e as CustomEvent<{ previousUserId: string; userId: string }>).detail);
    window.addEventListener('pryzm:auth:identity-changed', listener);
});

afterEach(() => {
    window.removeEventListener('pryzm:auth:identity-changed', listener);
});

describe('§AUTH-SESSION-LEAK-2 — AuthClient signals an identity change on account switch', () => {
    it('THE DEFECT CASE: User B signs in while User A is still cached → identity-changed is emitted', async () => {
        const storage = memoryStorage({
            [AUTH_USER_KEY]: userJson('user-A'),
            [AUTH_TOKEN_KEY]: 'token-for-user-A',
        });
        const client = new AuthClient({ fetch: fetchReturning('user-B'), storage, window: null });

        await client.signInWithEmail('b@example.com', 'password123');

        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({ previousUserId: 'user-A', userId: 'user-B' });
    });

    it('the NEW session is persisted (the purge must not cost the incoming user their token)', async () => {
        const storage = memoryStorage({
            [AUTH_USER_KEY]: userJson('user-A'),
            [AUTH_TOKEN_KEY]: 'token-for-user-A',
        });
        const client = new AuthClient({ fetch: fetchReturning('user-B'), storage, window: null });

        await client.signInWithEmail('b@example.com', 'password123');

        expect(storage.getItem(AUTH_TOKEN_KEY)).toBe('token-for-user-B');
        expect(JSON.parse(storage.getItem(AUTH_USER_KEY)!).id).toBe('user-B');
    });

    it('ORDERING GUARD: the previous id is read BEFORE the new one is written', async () => {
        // This is the exact one-line regression the fix is vulnerable to. If
        // `setItem` moved above the `getItem`, `previousUserId` would equal the
        // incoming id, the emit would be skipped, and the leak would return with
        // every other test in the repo still green.
        const storage = memoryStorage({
            [AUTH_USER_KEY]: userJson('user-A'),
            [AUTH_TOKEN_KEY]: 'token-for-user-A',
        });
        const client = new AuthClient({ fetch: fetchReturning('user-B'), storage, window: null });

        await client.signInWithEmail('b@example.com', 'password123');

        expect(events[0]?.previousUserId).toBe('user-A');
        expect(events[0]?.previousUserId).not.toBe(events[0]?.userId);
    });

    it('covers the SIGN-UP path too — a second account created without signing out', async () => {
        const storage = memoryStorage({
            [AUTH_USER_KEY]: userJson('user-A'),
            [AUTH_TOKEN_KEY]: 'token-for-user-A',
        });
        const client = new AuthClient({ fetch: fetchReturning('user-C'), storage, window: null });

        await client.signUpWithEmail('c@example.com', 'password123', 'User C');

        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({ previousUserId: 'user-A', userId: 'user-C' });
    });
});

describe('§AUTH-SESSION-LEAK-2 — ZERO false purges (a spurious reload would be its own defect)', () => {
    it('the SAME user re-authenticating does NOT emit (token refresh / re-login)', async () => {
        const storage = memoryStorage({
            [AUTH_USER_KEY]: userJson('user-A'),
            [AUTH_TOKEN_KEY]: 'old-token',
        });
        const client = new AuthClient({ fetch: fetchReturning('user-A'), storage, window: null });

        await client.signInWithEmail('a@example.com', 'password123');

        expect(events).toHaveLength(0);
        expect(storage.getItem(AUTH_TOKEN_KEY)).toBe('token-for-user-A');
    });

    it('a FIRST sign-in on a clean browser does NOT emit (no previous identity)', async () => {
        const storage = memoryStorage();
        const client = new AuthClient({ fetch: fetchReturning('user-A'), storage, window: null });

        await client.signInWithEmail('a@example.com', 'password123');

        expect(events).toHaveLength(0);
    });

    it('a CORRUPT cached user record does not emit a bogus switch', async () => {
        // Unparseable JSON ⇒ previousUserId resolves to null ⇒ "no previous
        // identity", not "a different identity". A spurious purge+reload loop here
        // would lock the user out of the app.
        const storage = memoryStorage({ [AUTH_USER_KEY]: '{not json', [AUTH_TOKEN_KEY]: 't' });
        const client = new AuthClient({ fetch: fetchReturning('user-A'), storage, window: null });

        await client.signInWithEmail('a@example.com', 'password123');

        expect(events).toHaveLength(0);
    });
});
