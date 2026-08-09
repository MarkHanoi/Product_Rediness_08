// @vitest-environment happy-dom
//
// §FEAT-ELEMENT-TYPE-AUTHORING — the coverage spec for WHO MAY AUTHOR A TYPE.
//
// The rule this file exists to keep true: a family may offer "New type…" ONLY if a
// type authored there survives a save/reload (C05) and does not follow the user into
// the next project (C13). Both proofs are recorded on the declaration itself, so this
// spec can check that the declaration is complete rather than trusting a comment.
//
// The failure mode it prevents is the one the codebase keeps paying for: a control
// that appears to work and quietly loses the user's work. Three families (stair, lift,
// room) have type stores that are NOT registered with ProjectScopeRegistry and are NOT
// written to the snapshot — offering authoring for them would manufacture founder
// complaint #2 on purpose. They are listed as unavailable WITH the reason, so the gap
// is visible to an audit of this file instead of being invisible by omission.

import { describe, it, expect } from 'vitest';
import {
    allElementTypeAuthoring,
    resolveElementTypeAuthoring,
    authoringUnavailableReason,
    AUTHORING_UNAVAILABLE,
} from '../ElementTypeAuthoringRegistry';

describe('§FEAT-ELEMENT-TYPE-AUTHORING — declaration completeness', () => {

    it('every authorable family carries BOTH proofs — persistence and project scope', () => {
        for (const a of allElementTypeAuthoring()) {
            // C05 — without a snapshot field + a shared codec, a created type is lost
            // on reload. This is founder complaint #2 stated as an assertion.
            expect(a.persisted.snapshotField, `${a.family} snapshotField`).toBeTruthy();
            expect(a.persisted.codec, `${a.family} codec`).toMatch(/\.ts$/);
            // C13 — without a registered scope, a type authored in project A appears
            // in project B.
            expect(a.projectScope, `${a.family} projectScope`).toBeTruthy();
        }
    });

    it('every authorable family declares its editor and its instance linkage', () => {
        for (const a of allElementTypeAuthoring()) {
            expect(a.editorKind).toBe('layer-stack');
            // The Revit-semantics question, answered explicitly rather than left for
            // the user to discover after editing a type and seeing nothing change.
            expect(a.instanceLinkage).toBe('instance-owned');
            expect(a.noun.length).toBeGreaterThan(0);
        }
    });

    it('wall is authorable, and points at the shared codec that fixed the `function` drop', () => {
        const wall = resolveElementTypeAuthoring('wall');
        expect(wall).not.toBeNull();
        expect(wall!.persisted.snapshotField).toBe('wallSystemTypes');
        expect(wall!.persisted.codec).toContain('wallSystemTypeCodec');
        expect(wall!.projectScope).toBe('wallSystemTypeStore');
    });

    it('a family is never BOTH authorable and declared unavailable', () => {
        for (const a of allElementTypeAuthoring()) {
            expect(AUTHORING_UNAVAILABLE.has(a.family), `${a.family} is double-declared`).toBe(false);
        }
    });

    it('every unavailable family states a REASON, never a bare absence', () => {
        for (const [family, reason] of AUTHORING_UNAVAILABLE) {
            expect(reason.length, `${family} reason`).toBeGreaterThan(20);
            expect(reason.trim().endsWith('.'), `${family} reason is a sentence`).toBe(true);
        }
    });

    describe('the families blocked on PERSISTENCE + ISOLATION, not on UI', () => {
        // stair / lift / room each have a working type store with real built-ins and a
        // mutating API. What they lack is a snapshot field and a ProjectScopeRegistry
        // registration — so a type authored into them is silently lost on save AND
        // leaks into the next project. Wiring a modal for them first would be exactly
        // the "authored-but-unwired" trap: it would look finished and be worse than absent.
        it.each(['stair', 'lift', 'room'])('%s is NOT authorable, and says why', (family) => {
            expect(resolveElementTypeAuthoring(family)).toBeNull();
            expect(authoringUnavailableReason(family)).toMatch(/cannot be saved with the project/);
        });
    });

    it('an authorable family reports NO unavailable reason', () => {
        expect(authoringUnavailableReason('wall')).toBeUndefined();
    });

    it('an unknown family is neither authorable nor given a reason', () => {
        expect(resolveElementTypeAuthoring('sprocket')).toBeNull();
        expect(authoringUnavailableReason('sprocket')).toBeUndefined();
    });
});
