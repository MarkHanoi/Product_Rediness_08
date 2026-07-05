// @vitest-environment happy-dom
//
// §FIX-3D-DOOR-PICK-PRIORITY (L-99b) — a wall-hosted door/window under the cursor must WIN
// the 3D pick over its host wall (and over floor/slab). The founder could not select a door
// in 3D at all — every hover/click resolved to the WALL or FLOOR, never the door. When the
// door IS in the pick buffer but loses the exact-pixel race to its host (it sits set-back in
// the wall reveal), this pure resolver promotes the nearer small opening over the big host.
//
// (The OTHER L-99b root — the door mesh carrying no pick id at all — is surfaced by the new
// [PickDiag] doorsRegistered=N console diagnostics in SelectionManager, not by this helper.)

import { describe, it, expect } from 'vitest';
// NOTE: imported from the worktree source directly — a git worktree shares the parent's
// node_modules, so the '@pryzm/picking' package specifier would resolve to the un-edited
// main-repo copy in this test env. The barrel export + the SelectionManager integration are
// validated by the root `tsc` typecheck instead.
import {
    resolveHostedPickPriority,
    type HostedPickCandidate,
} from '../../../packages/picking/src/hostedPickPriority';

const c = (elementKind: string, distance: number, elementId = `${elementKind}-${distance}`): HostedPickCandidate =>
    ({ elementId, elementKind, distance });

describe('§FIX-3D-DOOR-PICK-PRIORITY (L-99b) — resolveHostedPickPriority', () => {
    it('returns null for an empty candidate list', () => {
        expect(resolveHostedPickPriority([])).toBeNull();
    });

    it('promotes a coplanar hosted DOOR over a frontmost host WALL (the founder repro)', () => {
        // Wall near-face is a few cm in front of the door leaf set into the reveal.
        const winner = resolveHostedPickPriority([c('wall', 5.00), c('door', 5.12)]);
        expect(winner?.elementKind).toBe('door');
    });

    it('promotes a hosted WINDOW over a frontmost FLOOR/WALL', () => {
        expect(resolveHostedPickPriority([c('floor', 6.00), c('window', 6.20)])?.elementKind).toBe('window');
        expect(resolveHostedPickPriority([c('wall', 3.00), c('window', 3.05)])?.elementKind).toBe('window');
    });

    it('leaves a direct DOOR hit untouched when the door is already frontmost', () => {
        const winner = resolveHostedPickPriority([c('door', 4.90), c('wall', 5.00)]);
        expect(winner?.elementKind).toBe('door');
        expect(winner?.distance).toBeCloseTo(4.90, 6);
    });

    it('does NOT promote a door that is genuinely FAR behind the host (beyond the coplanar epsilon)', () => {
        // A door 3 m behind the clicked wall is a different opening down the room — keep the wall.
        const winner = resolveHostedPickPriority([c('wall', 5.00), c('door', 8.00)]);
        expect(winner?.elementKind).toBe('wall');
    });

    it('keeps the frontmost host when no hosted opening is present', () => {
        expect(resolveHostedPickPriority([c('wall', 5.00), c('slab', 5.30)])?.elementKind).toBe('wall');
    });

    it('leaves a non-host frontmost element (e.g. furniture) untouched', () => {
        const winner = resolveHostedPickPriority([c('furniture', 2.00), c('door', 2.10)]);
        expect(winner?.elementKind).toBe('furniture');
    });

    it('chooses the NEAREST hosted opening when several are within epsilon', () => {
        const winner = resolveHostedPickPriority([c('wall', 5.00), c('window', 5.40), c('door', 5.10)]);
        expect(winner?.elementKind).toBe('door');   // 5.10 is nearer than 5.40
    });

    it('honours a custom depth epsilon', () => {
        // With a tight 0.05 m epsilon, a door 0.2 m back no longer qualifies.
        expect(resolveHostedPickPriority([c('wall', 5.00), c('door', 5.20)], { depthEpsilonM: 0.05 })?.elementKind).toBe('wall');
        expect(resolveHostedPickPriority([c('wall', 5.00), c('door', 5.20)], { depthEpsilonM: 0.5 })?.elementKind).toBe('door');
    });

    it('is case-insensitive on the element kind string', () => {
        expect(resolveHostedPickPriority([c('Wall', 5.00), c('Door', 5.10)])?.elementKind).toBe('Door');
    });
});
