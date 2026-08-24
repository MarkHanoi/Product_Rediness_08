/**
 * workspaceMembersFailedReadIsNotEmpty.spec.ts
 * §FIX-MEMBERS-ABSENT-VS-UNREACHABLE — the SECOND members surface.
 *
 * `ProjectMemberPanel` (the Project Hub modal) is the surface the founder had
 * open when a 400 rendered as "0 members / No members yet"; that half is pinned
 * by `projectMembersFailedReadIsNotZero.spec.ts`. `PlatformProjectBrowser`'s
 * workspace "Team Members" modal carried the IDENTICAL defect in a different
 * shape, and fixing only the one that happened to be open would leave the next
 * failure free to lie on the other:
 *
 *     apiFetch(url).then(r => r.json()).then(({ members }) => {
 *         if (!members || members.length === 0) → "No team members yet."
 *
 * `res.ok` was never consulted. An HTTP 400 / 403 / 503 whose body is
 * `{error: "..."}` yields `members === undefined` and lands in the empty-state
 * branch — a request that FAILED presented as a successful answer meaning
 * "nobody is on this project". The `.catch()` underneath only ever covered a
 * NETWORK failure, which is exactly why the founder's 400 never reached it.
 * C01 §6 rule 6: ABSENT and UNREACHABLE have opposite fixes.
 *
 * ARM 4 is the false-positive arm. A fix that suppressed the empty state
 * everywhere would trade one lie for another — a project with genuinely no
 * members must still read as having none.
 *
 * NOT ESTABLISHED HERE: anything about the server's status codes (that is
 * `server/__tests__/projectMembersBackends.test.ts`). This drives the modal
 * through a stubbed `apiFetch`, so it pins this surface's half only.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const apiFetchMock = vi.fn();

vi.mock('@pryzm/core-app-model', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

const { PlatformProjectBrowser } = await import('../PlatformProjectBrowser');

/** A minimal Response-alike — only the members path is exercised. */
function jsonResponse(status: number, body: unknown): unknown {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 400 ? 'Bad Request' : '',
        json: async () => body,
        text: async () => JSON.stringify(body),
    };
}

function makeBrowser() {
    const ctx = { projectId: 'proj-1787554200066-a936f1ea8b34', projectName: 'Untitled Site' };
    return new PlatformProjectBrowser(ctx as never, null as never, null as never);
}

/** Opens the modal and lets the fire-and-forget load settle. */
async function openModal(): Promise<HTMLElement> {
    const browser = makeBrowser();
    (browser as unknown as { openWorkspaceMembersModal(): void }).openWorkspaceMembersModal();
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    return document.querySelector('#plat-members-body') as HTMLElement;
}

beforeEach(() => {
    document.body.innerHTML = '';
    apiFetchMock.mockReset();
});

describe('§FIX-MEMBERS-ABSENT-VS-UNREACHABLE — the workspace Team Members modal', () => {
    it('ARM 1 — an HTTP 400 does NOT render "No team members yet."', async () => {
        apiFetchMock.mockResolvedValue(
            jsonResponse(400, { error: 'Inviting by email requires the database connection.' }),
        );
        const body = await openModal();

        expect(body.innerHTML).not.toContain('No team members yet');
        expect(body.querySelector('#plat-members-empty')).toBeNull();
        const err = body.querySelector('#plat-members-error');
        expect(err).not.toBeNull();
        expect(err!.textContent).toContain('Could not load the member list');
        // The status code must survive into the UI.
        expect(err!.textContent).toContain('400');
    });

    it('ARM 2 — a 503 store-unavailable is shown as a failed read, with a retry', async () => {
        apiFetchMock.mockResolvedValue(
            jsonResponse(503, { error: 'members store unreachable', code: 'members_store_unavailable' }),
        );
        const body = await openModal();

        expect(body.innerHTML).not.toContain('No team members yet');
        expect(body.textContent).toContain('503');
        expect(body.querySelector('#plat-members-retry')).not.toBeNull();
    });

    it('ARM 3 — a 200 whose body carries no member list is a failed read, not zero members', async () => {
        apiFetchMock.mockResolvedValue(jsonResponse(200, { error: 'something else entirely' }));
        const body = await openModal();

        expect(body.querySelector('#plat-members-empty')).toBeNull();
        expect(body.querySelector('#plat-members-error')).not.toBeNull();
    });

    it('ARM 4 — a GENUINE postgres-backed zero still reads as empty (false-positive arm)', async () => {
        apiFetchMock.mockResolvedValue(jsonResponse(200, { members: [], source: 'postgres' }));
        const body = await openModal();

        expect(body.querySelector('#plat-members-empty')).not.toBeNull();
        expect(body.innerHTML).toContain('No team members yet');
        expect(body.querySelector('#plat-members-error')).toBeNull();
        // postgres is durable — no volatility warning.
        expect(body.innerHTML).not.toContain('held in memory only');
    });

    it('ARM 5 — a zero from the VOLATILE in-memory store says so', async () => {
        apiFetchMock.mockResolvedValue(jsonResponse(200, { members: [], source: 'memory' }));
        const body = await openModal();

        expect(body.innerHTML).toContain('held in memory only');
    });

    it('ARM 6 — snake_case AND camelCase rows both render a name, never "Unknown"', async () => {
        apiFetchMock.mockResolvedValue(jsonResponse(200, {
            members: [
                { user_id: 'u-1', display_name: 'Ada Lovelace', email: 'ada@example.com', role: 'team_member', accepted_at: '2026-08-20T10:00:00Z' },
                { userId: 'u-2', displayName: 'Grace Hopper', email: 'grace@example.com', role: 'viewer', acceptedAt: 1 },
            ],
            source: 'postgres',
        }));
        const body = await openModal();

        expect(body.querySelectorAll('.plat-member-row')).toHaveLength(2);
        expect(body.innerHTML).toContain('Ada Lovelace');
        expect(body.innerHTML).toContain('Grace Hopper');
        expect(body.innerHTML).not.toContain('Unknown');
        // Both are accepted — neither may be badged Pending.
        expect(body.innerHTML).not.toContain('Pending');
    });

    it('ARM 7 — the retry button re-issues the read and a later success renders rows', async () => {
        apiFetchMock
            .mockResolvedValueOnce(jsonResponse(503, { error: 'transient' }))
            .mockResolvedValueOnce(jsonResponse(200, {
                members: [{ userId: 'u-1', displayName: 'Ada Lovelace', role: 'viewer', acceptedAt: 1 }],
                source: 'postgres',
            }));
        const body = await openModal();
        expect(body.querySelector('#plat-members-error')).not.toBeNull();

        body.querySelector<HTMLButtonElement>('#plat-members-retry')!.click();
        for (let i = 0; i < 8; i += 1) await Promise.resolve();
        await new Promise((r) => setTimeout(r, 0));

        expect(apiFetchMock).toHaveBeenCalledTimes(2);
        expect(body.querySelector('#plat-members-error')).toBeNull();
        expect(body.querySelectorAll('.plat-member-row')).toHaveLength(1);
        expect(body.innerHTML).toContain('Ada Lovelace');
    });
});
