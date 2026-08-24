/**
 * projectMembersFailedReadIsNotZero.spec.ts
 * §FIX-MEMBERS-ABSENT-VS-UNREACHABLE — the members modal must never render a
 * FAILED read as a successful answer meaning EMPTY.
 *
 * THE REPORT THIS PINS (production, app.pryzm.so, 2026-08-24)
 * ----------------------------------------------------------
 * The founder opened Project Members on a real project. The console showed
 *
 *     /api/projects/proj-1787554200066-a936f1ea8b34/members:1
 *       Failed to load resource: the server responded with a status of 400 ()
 *
 * and the modal showed, in the same breath:
 *
 *     "Project Members"  ·  "0 members"
 *     "No members yet. Invite your first collaborator below."
 *
 * Two sentences of confident fact, over a request that had failed. That is C01
 * §6 rule 6 — ABSENT and UNREACHABLE reported as the same value — and its cost
 * is not cosmetic: the next action the reading invites is re-inviting people who
 * are already on the project.
 *
 * WHY THE COUNT IS TESTED SEPARATELY FROM THE EMPTY-STATE
 * ------------------------------------------------------
 * On the pre-fix code these were TWO independent bugs that happened to agree.
 * `renderMemberList()` was already gated on `!this.error`, so the empty-state
 * line only appears when the callback RESOLVES with `[]`. The header count was
 * gated on nothing at all and printed `${members.length} members` in every
 * state, including mid-flight and post-failure. A fix that only addressed the
 * empty-state would leave "0 members" standing over a red error box — which is
 * still the lie, just quieter. Both arms are therefore required, and ARM 1 is
 * the one that fails on the pre-fix HEAD.
 *
 * WHAT THIS DOES NOT ESTABLISH
 * ----------------------------
 * That the server returns the right status codes (that is
 * `server/__tests__/projectMembersBackends.test.ts`), and that `ProjectHub`'s
 * `onLoadMembers` rejects rather than swallowing — this suite drives the panel
 * through its callback seam, so it pins the panel's half of the contract only.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectMemberPanel, type ProjectMember, type ProjectMemberPanelCallbacks } from '../ProjectMemberPanel';

function makeCallbacks(
    onLoadMembers: ProjectMemberPanelCallbacks['onLoadMembers'],
): ProjectMemberPanelCallbacks {
    return {
        onLoadMembers,
        onInviteMember: vi.fn(async () => ({} as ProjectMember)),
        onChangeRole: vi.fn(async () => ({} as ProjectMember)),
        onRemoveMember: vi.fn(async () => { /* no-op */ }),
        currentUserRole: 'lead_appointed',
        isOwner: true,
    };
}

/** Lets the constructor's fire-and-forget `loadMembers()` settle + re-render. */
async function settle(): Promise<void> {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
}

let host: HTMLElement;

beforeEach(() => {
    document.body.innerHTML = '';
    host = document.createElement('div');
    document.body.appendChild(host);
});

describe('§FIX-MEMBERS-ABSENT-VS-UNREACHABLE — a failed members read', () => {
    it('ARM 1 — does NOT print "0 members" (the exact string on the founder screenshot)', async () => {
        const panel = new ProjectMemberPanel(
            host,
            'proj-1787554200066-a936f1ea8b34',
            makeCallbacks(async () => { throw new Error('HTTP 400 — Bad Request'); }),
        );
        await settle();

        const html = host.innerHTML;
        // The measured quantity: occurrences of the literal count sentence.
        expect(html.match(/0 members/g) ?? []).toHaveLength(0);
        // …and the header must still say something, rather than going blank.
        const count = host.querySelector('.mp-count');
        expect(count).not.toBeNull();
        expect(count!.textContent!.trim()).toBe('count unavailable');
        panel.destroy();
    });

    it('ARM 2 — does NOT print the empty-state invitation copy', async () => {
        const panel = new ProjectMemberPanel(
            host, 'p1',
            makeCallbacks(async () => { throw new Error('HTTP 503 — members_store_unavailable'); }),
        );
        await settle();

        expect(host.innerHTML).not.toContain('No members yet');
        expect(host.querySelector('.mp-empty')).toBeNull();
        panel.destroy();
    });

    it('ARM 3 — says the read failed, quotes the status, and offers a retry', async () => {
        const panel = new ProjectMemberPanel(
            host, 'p1',
            makeCallbacks(async () => { throw new Error('HTTP 400 — Bad Request'); }),
        );
        await settle();

        const err = host.querySelector('.mp-error');
        expect(err).not.toBeNull();
        expect(err!.textContent).toContain('Could not load the member list');
        // The status code must survive into the UI — "400" and "503" send the
        // reader to different places.
        expect(err!.textContent).toContain('400');
        expect(host.querySelector('#mp-retry-btn')).not.toBeNull();
        panel.destroy();
    });

    it('ARM 4 — the retry button re-issues the read and a later success renders normally', async () => {
        let attempt = 0;
        const load = vi.fn(async () => {
            attempt += 1;
            if (attempt === 1) throw new Error('HTTP 503 — transient');
            return {
                members: [{
                    id: 'm1', projectId: 'p1', userId: 'u1',
                    displayName: 'Ada Lovelace', email: 'ada@example.com',
                    role: 'team_member' as const, acceptedAt: 1,
                }],
                source: 'postgres',
            };
        });
        const panel = new ProjectMemberPanel(host, 'p1', makeCallbacks(load));
        await settle();
        expect(host.querySelector('.mp-error')).not.toBeNull();

        host.querySelector<HTMLButtonElement>('#mp-retry-btn')!.click();
        await settle();

        expect(load).toHaveBeenCalledTimes(2);
        expect(host.querySelector('.mp-error')).toBeNull();
        expect(host.querySelector('.mp-count')!.textContent!.trim()).toBe('1 member');
        expect(host.innerHTML).toContain('Ada Lovelace');
        panel.destroy();
    });
});

describe('§FIX-MEMBERS-ABSENT-VS-UNREACHABLE — a SUCCESSFUL empty read still says empty', () => {
    it('ARM 5 — a genuine postgres-backed zero prints "0 members" and the empty-state', async () => {
        // The false-positive arm. A fix that suppressed the empty-state
        // everywhere would trade one lie for another: a project with genuinely
        // no members must still read as having none.
        const panel = new ProjectMemberPanel(
            host, 'p1',
            makeCallbacks(async () => ({ members: [], source: 'postgres' })),
        );
        await settle();

        expect(host.querySelector('.mp-count')!.textContent!.trim()).toBe('0 members');
        expect(host.innerHTML).toContain('No members yet');
        expect(host.querySelector('.mp-error')).toBeNull();
        // postgres is durable — no volatility warning.
        expect(host.querySelector('.mp-source-notice')).toBeNull();
        panel.destroy();
    });

    it('ARM 6 — a zero from the VOLATILE in-memory store is flagged as not durable', async () => {
        const panel = new ProjectMemberPanel(
            host, 'p1',
            makeCallbacks(async () => ({ members: [], source: 'memory' })),
        );
        await settle();

        const notice = host.querySelector('.mp-source-notice');
        expect(notice).not.toBeNull();
        expect(notice!.textContent).toContain('memory only');
        panel.destroy();
    });

    it('ARM 7 — a bare array (no source) is still accepted, for back-compat', async () => {
        const panel = new ProjectMemberPanel(
            host, 'p1',
            makeCallbacks(async () => ([] as ProjectMember[])),
        );
        await settle();

        expect(host.querySelector('.mp-count')!.textContent!.trim()).toBe('0 members');
        expect(host.querySelector('.mp-source-notice')).toBeNull();
        panel.destroy();
    });
});

describe('§FIX-MEMBERS-ROW-SHAPE — a member row with missing identity fields', () => {
    it('ARM 8 — renders instead of throwing (the Supabase snake_case row could not)', async () => {
        // `listMembersFromSupabase` returned RAW snake_case, so `displayName`
        // AND `userId` were both undefined here: `undefined[0]` and
        // `escHtml(undefined).replace` each threw and blanked the modal. The
        // server now normalises, but the UI must not be the thing that crashes.
        const panel = new ProjectMemberPanel(
            host, 'p1',
            makeCallbacks(async () => ({
                members: [{ email: 'nobody@example.com', role: 'viewer' } as unknown as ProjectMember],
                source: 'supabase',
            })),
        );
        await settle();

        expect(host.querySelector('.mp-error')).toBeNull();
        expect(host.querySelectorAll('.mp-member-row')).toHaveLength(1);
        expect(host.innerHTML).toContain('nobody@example.com');
        panel.destroy();
    });
});
