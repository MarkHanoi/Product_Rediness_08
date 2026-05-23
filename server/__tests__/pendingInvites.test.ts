/**
 * pendingInvites.test.ts — #114 phase 1 (pending-invite store).
 *
 * Locks in the pure in-memory lifecycle: create/dedup, case-insensitive email
 * matching (the invite-time key must equal the signup-time key), project + email
 * lookups, idempotent delete, signup resolution, and input validation.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
    createPendingInvite,
    listPendingInvitesByEmail,
    listPendingInvitesForProject,
    deletePendingInvite,
    resolvePendingInvitesForEmail,
    normalizeInviteEmail,
    __resetPendingInvitesForTests,
} from '../pendingInvites.js';

beforeEach(() => __resetPendingInvitesForTests());

describe('#114 pending-invite store', () => {
    it('creates a pending invite and finds it by email (normalised shape)', () => {
        const rec = createPendingInvite('proj-1', 'New.User@Example.com', 'team_member', 'owner-1');
        expect(rec).toMatchObject({
            projectId: 'proj-1',
            email: 'new.user@example.com', // normalised
            role: 'team_member',
            invitedBy: 'owner-1',
        });
        expect(rec.id).toMatch(/^pi-/);
        expect(typeof rec.invitedAt).toBe('number');

        const found = listPendingInvitesByEmail('new.user@example.com');
        expect(found).toHaveLength(1);
        expect(found[0]!.id).toBe(rec.id);
    });

    it('matches email case-insensitively and trims whitespace', () => {
        createPendingInvite('proj-1', 'Foo@Bar.com', 'viewer', 'owner-1');
        expect(listPendingInvitesByEmail('  foo@bar.com ')).toHaveLength(1);
        expect(normalizeInviteEmail('  Foo@BAR.com ')).toBe('foo@bar.com');
    });

    it('dedups on (project, email) — re-inviting updates the role, not stacks', () => {
        const a = createPendingInvite('proj-1', 'x@y.com', 'viewer', 'owner-1');
        const b = createPendingInvite('proj-1', 'x@y.com', 'team_manager', 'owner-2');
        expect(b.id).toBe(a.id);
        const found = listPendingInvitesByEmail('x@y.com');
        expect(found).toHaveLength(1);
        expect(found[0]!.role).toBe('team_manager');
        expect(found[0]!.invitedBy).toBe('owner-2');
    });

    it('keeps separate invites for the same email across different projects', () => {
        createPendingInvite('proj-1', 'x@y.com', 'viewer', 'o');
        createPendingInvite('proj-2', 'x@y.com', 'viewer', 'o');
        expect(listPendingInvitesByEmail('x@y.com')).toHaveLength(2);
        expect(listPendingInvitesForProject('proj-1')).toHaveLength(1);
        expect(listPendingInvitesForProject('proj-2')).toHaveLength(1);
    });

    it('deletePendingInvite removes the invite and is idempotent', () => {
        const rec = createPendingInvite('proj-1', 'x@y.com', 'viewer', 'o');
        expect(deletePendingInvite(rec.id)).toBe(true);
        expect(listPendingInvitesByEmail('x@y.com')).toHaveLength(0);
        expect(deletePendingInvite(rec.id)).toBe(false);
    });

    it('resolvePendingInvitesForEmail returns the invites a new signup should join', () => {
        createPendingInvite('proj-1', 'newbie@x.com', 'team_member', 'o');
        createPendingInvite('proj-2', 'newbie@x.com', 'viewer', 'o');
        const toJoin = resolvePendingInvitesForEmail('NEWBIE@x.com');
        expect(toJoin.map(i => i.projectId).sort()).toEqual(['proj-1', 'proj-2']);
    });

    it('rejects an invalid role and a blank email', () => {
        expect(() => createPendingInvite('proj-1', 'x@y.com', 'overlord' as never, 'o')).toThrow(/invalid role/i);
        expect(() => createPendingInvite('proj-1', '   ', 'viewer', 'o')).toThrow(/email is required/i);
    });
});
