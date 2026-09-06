// §RESI-STAGE-G (2026-09-06) · C114 §11 item 7 / §10b / §12 — the profile-edit JOIN.
//
// ✅ ESTABLISHES, against a fake `WallProfileEditorPort` and a fake dispatch: the per-element
//    verdict (`profileEditAvailability`) refuses by name and carries the frame's own numbers;
//    opening hands the port a subject in the FRAME's coordinates with a title that does not
//    say "wall"; Apply dispatches EXACTLY ONE `spaceEnvelope.setFootprint` whose ring is the
//    author's, in world metres; "Clear profile" is REFUSED rather than committing an empty
//    footprint; a REFUSED dispatch keeps the dialog open with the handler's sentence verbatim.
// ⛔ DOES NOT ESTABLISH: that the real dialog renders, that the button appears, that a
//    double-click reaches this, or anything seen in a browser. The port is a fake here, and
//    the wiring is asserted separately — [[committed-is-not-reachable]], C114 §14a.

import { describe, expect, it, vi } from 'vitest';
import type {
    WallProfileEditorCallbacks,
    WallProfileEditorPort,
    WallProfileEditorSubject,
} from '@pryzm/geometry-wall/profile-editor';
import { headroomFor } from '@pryzm/geometry-space-envelope';
import {
    SpaceEnvelopeProfileEditTool,
    type ProfileEditableSpaceEnvelope,
} from '../spaceEnvelopeProfileEditTool';

/** The port, faked — the SAME seam `initTools` fills with `new WallProfileEditor()`. */
class FakePort implements WallProfileEditorPort {
    isActive = false;
    subject: WallProfileEditorSubject | null = null;
    cbs: WallProfileEditorCallbacks | null = null;
    refusals: string[] = [];
    deactivateCount = 0;

    activate(subject: WallProfileEditorSubject, cbs: WallProfileEditorCallbacks): void {
        this.isActive = true;
        this.subject = subject;
        this.cbs = cbs;
    }
    deactivate(): void {
        this.isActive = false;
        this.deactivateCount += 1;
    }
    showRefusal(text: string): void {
        this.refusals.push(text);
    }
}

const LEVEL: ProfileEditableSpaceEnvelope = {
    id: 'spaceEnvelope_L',
    role: 'level',
    name: 'Ground',
    // 10 × 10 at a NEGATIVE origin — the case a bbox-free map gets wrong silently.
    footprint: [{ x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 }],
};

function build(overrides: Partial<{
    records: readonly ProfileEditableSpaceEnvelope[];
    dispatch: (p: { spaceEnvelopeId: string; footprint: readonly { x: number; z: number }[] }) => unknown;
    withEditor: boolean;
}> = {}) {
    const records = overrides.records ?? [LEVEL];
    const port = new FakePort();
    const dispatch = vi.fn(overrides.dispatch ?? (() => undefined));
    const onRefusal = vi.fn();
    const tool = new SpaceEnvelopeProfileEditTool({
        getRecord: (id) => records.find((r) => r.id === id),
        ...(overrides.withEditor === false ? {} : { createProfileEditor: () => port }),
        dispatchSetFootprint: dispatch as never,
        onRefusal,
    });
    return { tool, port, dispatch, onRefusal };
}

describe('profileEditAvailability — the button is enabled, disabled with a reason, or hidden', () => {
    it('says OK for a level envelope with a real footprint', () => {
        const { tool } = build();
        expect(tool.profileEditAvailability(LEVEL.id)).toEqual({ ok: true });
    });

    it('refuses an id the ONE store does not hold, naming it', () => {
        const { tool } = build();
        const v = tool.profileEditAvailability('spaceEnvelope_missing');
        expect(v.ok).toBe(false);
        expect(v.reason).toContain('spaceEnvelope_missing');
    });

    it('⛔ refuses `maximumBuildable` as a PRODUCT POSITION, not a data problem (ADR-0380 D2)', () => {
        const study = { ...LEVEL, id: 'spaceEnvelope_S', role: 'maximumBuildable' };
        const { tool } = build({ records: [study] });
        const v = tool.profileEditAvailability(study.id);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain('SOLVED from the zoning rules');
    });

    it('⛔ refuses OUT LOUD when no dialog factory was wired — the dead-port state', () => {
        const { tool } = build({ withEditor: false });
        const v = tool.profileEditAvailability(LEVEL.id);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain('no editor was wired');
    });

    it('forwards the FRAME refusal verbatim, numbers included, for a degenerate footprint', () => {
        const line = { ...LEVEL, id: 'spaceEnvelope_D', footprint: [{ x: 0, z: 2 }, { x: 6, z: 2 }, { x: 3, z: 2 }] };
        const { tool } = build({ records: [line] });
        const v = tool.profileEditAvailability(line.id);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain('6.000');
        expect(v.reason).toContain('0.000');
    });
});

describe('enterProfileEditMode — the subject handed to the SHARED port', () => {
    it('is the footprint in frame coordinates, inside a box grown by the headroom rule', () => {
        const { tool, port } = build();
        tool.enterProfileEditMode(LEVEL.id);
        expect(port.isActive).toBe(true);
        const h = headroomFor(10, 10);
        expect(port.subject!.length).toBeCloseTo(10 + 2 * h, 12);
        expect(port.subject!.height).toBeCloseTo(10 + 2 * h, 12);
        expect(port.subject!.ring).toHaveLength(4);
        for (const p of port.subject!.ring!) {
            expect(p.u).toBeGreaterThan(0);
            expect(p.v).toBeGreaterThan(0);
        }
        expect(tool.isEditing).toBe(true);
        expect(tool.editingId).toBe(LEVEL.id);
    });

    it('⭐ titles itself so the panel never calls a storey outline a WALL', () => {
        const { tool, port } = build();
        tool.enterProfileEditMode(LEVEL.id);
        expect(port.subject!.title).toContain('Level Footprint');
        expect(port.subject!.title).toContain('Ground');
        expect(port.subject!.title).toContain('across X');
        expect(port.subject!.title?.toLowerCase()).not.toContain('wall');
    });

    it('says ROOM for a room envelope', () => {
        const room = { ...LEVEL, id: 'spaceEnvelope_R', role: 'room', name: 'Kitchen' };
        const { tool, port } = build({ records: [room] });
        tool.enterProfileEditMode(room.id);
        expect(port.subject!.title).toContain('Room Footprint');
        expect(port.subject!.title).toContain('Kitchen');
    });

    it('refuses through the SAME verdict when reached past a disabled button', () => {
        const { tool, port, onRefusal } = build();
        tool.enterProfileEditMode('spaceEnvelope_missing');
        expect(port.isActive).toBe(false);
        expect(onRefusal).toHaveBeenCalledTimes(1);
    });
});

describe('the commit — P6, and exactly one command per Apply', () => {
    it('dispatches the UNCHANGED ring back as the SAME world footprint', () => {
        const { tool, port, dispatch } = build();
        tool.enterProfileEditMode(LEVEL.id);
        port.cbs!.onCommit([...port.subject!.ring!]);
        expect(dispatch).toHaveBeenCalledTimes(1);
        const payload = dispatch.mock.calls[0]![0] as {
            spaceEnvelopeId: string; footprint: readonly { x: number; z: number }[];
        };
        expect(payload.spaceEnvelopeId).toBe(LEVEL.id);
        payload.footprint.forEach((p, i) => {
            expect(p.x).toBeCloseTo(LEVEL.footprint[i]!.x, 12);
            expect(p.z).toBeCloseTo(LEVEL.footprint[i]!.z, 12);
        });
    });

    it('carries an EDITED vertex to the world position the author dragged it to', () => {
        const { tool, port, dispatch } = build();
        tool.enterProfileEditMode(LEVEL.id);
        // Pull vertex 1 (world x = 5, z = -5) 2 m further out in +X.
        const edited = port.subject!.ring!.map((p, i) => (i === 1 ? { u: p.u + 2, v: p.v } : { u: p.u, v: p.v }));
        port.cbs!.onCommit(edited);
        const payload = dispatch.mock.calls[0]![0] as { footprint: readonly { x: number; z: number }[] };
        expect(payload.footprint[1]!.x).toBeCloseTo(7, 12);
        expect(payload.footprint[1]!.z).toBeCloseTo(-5, 12);
        expect(payload.footprint[0]!.x).toBeCloseTo(-5, 12);
    });

    it('⛔ REFUSES "Clear profile" instead of committing a footprint-less volume', () => {
        const { tool, port, dispatch } = build();
        tool.enterProfileEditMode(LEVEL.id);
        port.cbs!.onCommit(null);
        expect(dispatch).not.toHaveBeenCalled();
        expect(port.refusals[0]).toContain('no outline to fall back to');
        // The dialog stays open — the author's work is not destroyed by a refused button.
        expect(port.isActive).toBe(true);
        expect(tool.isEditing).toBe(true);
    });

    it('closes on a resolved dispatch', async () => {
        const { tool, port } = build({ dispatch: () => Promise.resolve() });
        tool.enterProfileEditMode(LEVEL.id);
        port.cbs!.onCommit([...port.subject!.ring!]);
        await Promise.resolve();
        await Promise.resolve();
        expect(tool.isEditing).toBe(false);
        expect(port.deactivateCount).toBe(1);
    });

    it('⭐ keeps the dialog OPEN on a refusal and shows the handler sentence VERBATIM', async () => {
        const reason =
            "'Kitchen' would sit 1.20 m outside 'Ground' in plan — the move asks for 1.20 m; the limit is 0.00 m";
        const { tool, port } = build({ dispatch: () => Promise.reject(new Error(reason)) });
        tool.enterProfileEditMode(LEVEL.id);
        port.cbs!.onCommit([...port.subject!.ring!]);
        await Promise.resolve();
        await Promise.resolve();
        expect(port.refusals).toEqual([reason]);
        expect(port.isActive).toBe(true);
        expect(tool.isEditing).toBe(true);
    });

    it('surfaces a SYNCHRONOUS handler throw the same way, without closing', () => {
        const { tool, port } = build({
            dispatch: () => { throw new Error('no such space envelope: x'); },
        });
        tool.enterProfileEditMode(LEVEL.id);
        port.cbs!.onCommit([...port.subject!.ring!]);
        expect(port.refusals[0]).toBe('no such space envelope: x');
        expect(tool.isEditing).toBe(true);
    });

    it('Cancel closes and dispatches NOTHING — a no-op must not spend a Ctrl+Z (C113 §6.4)', () => {
        const { tool, port, dispatch } = build();
        tool.enterProfileEditMode(LEVEL.id);
        port.cbs!.onCancel();
        expect(dispatch).not.toHaveBeenCalled();
        expect(tool.isEditing).toBe(false);
        expect(port.deactivateCount).toBe(1);
    });

    it('re-opening re-reads the CURRENT record rather than a captured one', () => {
        const records = [{ ...LEVEL }];
        const port = new FakePort();
        const tool = new SpaceEnvelopeProfileEditTool({
            getRecord: (id) => records.find((r) => r.id === id),
            createProfileEditor: () => port,
            dispatchSetFootprint: () => undefined,
        });
        tool.enterProfileEditMode(LEVEL.id);
        const firstLength = port.subject!.length;
        // The store moved under the tool — a face drag, an undo, another lane's command.
        records[0] = { ...LEVEL, footprint: [{ x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 12 }, { x: 0, z: 12 }] };
        tool.enterProfileEditMode(LEVEL.id);
        expect(port.subject!.length).not.toBeCloseTo(firstLength, 6);
        expect(port.subject!.length).toBeCloseTo(30 + 2 * headroomFor(30, 12), 12);
    });
});
