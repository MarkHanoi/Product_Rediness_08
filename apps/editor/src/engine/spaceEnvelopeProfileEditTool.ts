/**
 * spaceEnvelopeProfileEditTool — the space envelope's FOOTPRINT becomes editable in the
 * outline editor PRYZM already has.
 *
 * §RESI-STAGE-G (2026-09-06) · C114 §10b / §11 item 7 / §12 / §14 ·
 * STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §12 · RESI-ORCHESTRATOR-PLAN §4 Stage G ·
 * C16 §8.6 · C83 §1.2 · C84 EI-9 · P6.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ NOTHING HERE DRAWS. IT JOINS TWO THINGS THAT ALREADY EXIST.
 * ═══════════════════════════════════════════════════════════════════════════════
 * C114 §10b: *"THE PROFILE EDITOR IS JOINED, NOT REBUILT. `WallProfileEditorPort` /
 * `WallProfileEditorSubject` are already generic by port; the shared surface
 * `ElevationOutlineSurface` is already reused by `ComponentProfilePanel`; the resolver is
 * `ui/ContextualEditBar.ts _profileEditToolFor(type)`. The envelope adds a row to that
 * resolver. ⛔ A new outline surface is forbidden."*
 *
 * So this file is exactly three things and deliberately nothing else:
 *   1. `profileEditAvailability(id)` — the resolver's per-element verdict, so the button is
 *      SHOWN+DISABLED with a reason rather than SHOWN+DEAD (§FIX-DEAD-EDIT-PROFILE-BUTTON).
 *   2. `enterProfileEditMode(id)` — read the ONE store, map the footprint into the
 *      surface's frame (`@pryzm/geometry-space-envelope`, pure and tested), open the port.
 *   3. The commit callback — map the ring back and dispatch `spaceEnvelope.setFootprint`.
 *
 * ⛔ P6, WITHOUT AN EXCEPTION. This class never writes a store. The ONLY way an edit
 * reaches the model is `dispatchSetFootprint`, which `initTools` wires to
 * `runtime.bus.executeCommand('spaceEnvelope.setFootprint', …)`. One Apply = one command =
 * one Ctrl+Z, because the handler mints exactly one `produceCommand` patch pair.
 *
 * ⛔ AND IT RE-ASKS NOTHING THE COMMAND ASKS. Containment (`room ⊂ level`, and a level
 * edit that would strand a room) is judged by `containmentGate.containmentRefusalFor`
 * inside `SetSpaceEnvelopeFootprintHandler` — including on the LEVEL side, which is the
 * founder's *"rooms re-check containment after a level edit"*. Re-implementing that test
 * here would be the second copy C84 EI-9.2 forbids, and the two copies would answer
 * differently the first time either changed. What this file does instead is SURFACE the
 * command's refusal verbatim, in the dialog, with the dialog still open and the author's
 * ring still on screen — a refusal that also destroys the work is a punishment, not an
 * answer.
 *
 * ⚠ THE SUBJECT FIELD IS STILL CALLED `wallId`, AND THAT IS RECORDED, NOT HIDDEN. The port
 * is generic in every way that matters (the surface has no wall in it) except the entry
 * field's NAME, which the modal also stamps as `data-wall-id`. Renaming it touches L2
 * `geometry-wall`, `WallTool`, the modal and its byte-pinned chrome test — the same shape
 * as C114 §10c's owed `WallMoveReweld` type parameter, and strictly larger than this lane.
 * ⛔ Do not read the name as evidence that a wall is involved; do not add a SECOND port.
 *
 * ⚠ WHAT THIS FILE DOES NOT ESTABLISH: that the button appears, that a double-click opens
 * it, or that any of it has been seen in a browser. Those are `initTools` /
 * `ContextualEditBar` wiring and a human at a screen — [[committed-is-not-reachable]].
 *
 * ⛔ NO THREE, NO DOM CONSTRUCTION, NO STORE, NO rAF in this file. The dialog is injected
 * as a factory (`createProfileEditor`) exactly as `WallToolCallbacks` injects it, because
 * a port whose implementation nobody supplies is a dead feature with an interface attached.
 */

import type {
    WallProfileEditorCallbacks,
    WallProfileEditorPort,
    WallProfileEditorSubject,
} from '@pryzm/geometry-wall/profile-editor';
import type { WallProfileVertex } from '@pryzm/geometry-wall/profile';
import {
    footprintFromProfileRing,
    isProfileFrameRefusal,
    spaceEnvelopeProfileFrame,
    type SpaceEnvelopeProfileFrame,
} from '@pryzm/geometry-space-envelope';

/** The record this tool needs. Structural over the L0 record — no plugin import is owed. */
export interface ProfileEditableSpaceEnvelope {
    readonly id: string;
    readonly role?: string;
    readonly name?: string;
    readonly footprint: ReadonlyArray<{ readonly x: number; readonly z: number }>;
}

export interface SpaceEnvelopeProfileEditDeps {
    /**
     * The AUTHORITATIVE record for an id — read LAZILY on every gesture, never captured.
     * A reference threaded in at install time goes stale the moment the runtime is
     * recomposed (project switch, device-loss recovery), which is the §L-545-SITE-CAPTURE
     * lesson `spaceEnvelopeFaceDragController` already states for the drag.
     */
    readonly getRecord: (id: string) => ProfileEditableSpaceEnvelope | undefined;
    /** Build the L7 dialog. Absent ⇒ the tool REFUSES OUT LOUD rather than opening nothing. */
    readonly createProfileEditor?: () => WallProfileEditorPort;
    /**
     * Dispatch `spaceEnvelope.setFootprint` through the bus. THE only mutation path (P6).
     * Returning a rejected promise is how the handler's refusal reaches the dialog.
     */
    readonly dispatchSetFootprint: (payload: {
        spaceEnvelopeId: string;
        footprint: readonly { x: number; z: number }[];
    }) => unknown;
    /** Report a refusal in the app's own idiom (a toast) when no dialog is open to hold it. */
    readonly onRefusal?: (message: string) => void;
}

/** The verdict shape `ContextualEditBar._profileEditToolFor` consumes. */
export interface ProfileEditVerdict {
    readonly ok: boolean;
    readonly reason?: string;
}

/**
 * ⛔ THE ROLES THAT CAN BE AUTHORED AT ALL (ADR-0380 D2). `maximumBuildable` is refused at
 * the create verb, so no such record can be in the store — this is defence in depth against
 * a future promotion, and it names its reason instead of silently doing nothing.
 */
const AUTHORABLE_ROLES = new Set(['level', 'room']);

const MAX_BUILDABLE_REFUSAL =
    'The maximum buildable volume is SOLVED from the zoning rules, not drawn — it is a study, '
    + 'and PRYZM will not let you edit its outline. Edit a LEVEL envelope instead.';

export class SpaceEnvelopeProfileEditTool {
    private readonly _deps: SpaceEnvelopeProfileEditDeps;
    private _editor: WallProfileEditorPort | null = null;
    private _frame: SpaceEnvelopeProfileFrame | null = null;
    private _subjectId: string | null = null;

    constructor(deps: SpaceEnvelopeProfileEditDeps) {
        this._deps = deps;
    }

    /** TRUE while a dialog is open on an envelope. */
    get isEditing(): boolean {
        return this._editor !== null;
    }

    /** The envelope currently under edit, or null. Exposed for the wiring and for tests. */
    get editingId(): string | null {
        return this._subjectId;
    }

    /**
     * ⭐ THE PER-ELEMENT VERDICT (§FEAT-WALL-PROFILE-EDIT-MATRIX, L-1065). Three states and
     * only the third lies: SHOWN+ENABLED, SHOWN+DISABLED with the reason as its tooltip,
     * HIDDEN. This returns the middle one — with the frame's OWN sentence, including its
     * numbers, rather than a paraphrase (C84 EI-8a).
     */
    profileEditAvailability(id: string): ProfileEditVerdict {
        const record = this._deps.getRecord(id);
        if (!record) {
            return { ok: false, reason: `no such space envelope: ${id}` };
        }
        if (record.role !== undefined && !AUTHORABLE_ROLES.has(record.role)) {
            return { ok: false, reason: MAX_BUILDABLE_REFUSAL };
        }
        if (!this._deps.createProfileEditor) {
            // ⛔ LOUD, NEVER SILENT. Without a factory the feature is authored, registered
            // and unreachable — the state a port with no implementation always produces.
            return {
                ok: false,
                reason: 'The outline editor is not available in this session — no editor was wired.',
            };
        }
        const frame = spaceEnvelopeProfileFrame(record.footprint ?? []);
        if (isProfileFrameRefusal(frame)) return { ok: false, reason: frame.message };
        return { ok: true };
    }

    /**
     * Open the outline editor on this envelope's footprint.
     *
     * Idempotent by construction: the port's `activate` closes any previous session first,
     * and this method re-derives the frame from the CURRENT record every time, so a dialog
     * can never be opened against a footprint the store no longer holds.
     */
    enterProfileEditMode(id: string): void {
        const verdict = this.profileEditAvailability(id);
        if (!verdict.ok) {
            // The bar disables the button using this same verdict, so reaching here means a
            // keyboard path or a double-click got past it. The user still hears the reason —
            // the §FIX-OP-SILENT-NOOP rule.
            this._deps.onRefusal?.(verdict.reason ?? 'That envelope cannot have its outline edited.');
            return;
        }
        const record = this._deps.getRecord(id)!;
        const frame = spaceEnvelopeProfileFrame(record.footprint);
        if (isProfileFrameRefusal(frame)) {
            this._deps.onRefusal?.(frame.message);
            return;
        }

        const editor = this._deps.createProfileEditor!();
        this._editor = editor;
        this._frame = frame;
        this._subjectId = id;

        const label = (record.name ?? '').trim();
        const subject: WallProfileEditorSubject = {
            // ⚠ The port's field name. See the header: the NAME is owed a generalisation,
            // the VALUE is a space-envelope id and nothing here treats it as a wall.
            wallId: id,
            length: frame.length,
            height: frame.height,
            ring: frame.ring.map((p) => ({ u: p.u, v: p.v })),
            // ⭐ The subject names ITSELF, so the panel cannot call a storey outline a wall.
            title:
                `Edit ${record.role === 'level' ? 'Level' : 'Room'} Footprint`
                + `${label ? ` - ${label}` : ''}`
                + ` - ${frame.length.toFixed(3)} m across X, ${frame.height.toFixed(3)} m deep in Z`,
            // ⭐ §PL-ENVELOPE-AUTHORING (2026-09-06) — the founder's *"the user can define the
            // perimeter using CURVED LINES, STRAIGHT LINES, OR ORTHOGONALS"* for the space
            // envelope. `ElevationOutlineSurface` has had all three since §OUTLINE81; the wall
            // modal never left `'select'` mode, so for THIS subject they existed and were
            // unreachable. Asking for them is one flag — ⛔ not a second outline surface, which
            // C114 §10b forbids and which nothing in this lane wrote.
            //
            // ⛔ IT GRANTS NOTHING. An arc-authored ring is still judged by
            // `spaceEnvelope.setFootprint` and its containment gate, which refuses with both
            // numbers exactly as before. Headroom is not permission (C114 §14).
            drawModes: true,
        };

        const cbs: WallProfileEditorCallbacks = {
            onCommit: (ring: WallProfileVertex[] | null) => { this._onCommit(ring); },
            onCancel: () => { this.exitProfileEditMode(); },
        };
        editor.activate(subject, cbs);
    }

    /** Close the dialog and forget the session. Safe to call any number of times. */
    exitProfileEditMode(): void {
        const editor = this._editor;
        this._editor = null;
        this._frame = null;
        this._subjectId = null;
        try { editor?.deactivate(); } catch { /* the port declares this safe; be safe anyway */ }
    }

    private _onCommit(ring: WallProfileVertex[] | null): void {
        const editor = this._editor;
        const frame = this._frame;
        const id = this._subjectId;
        if (!editor || !frame || !id) return;

        // ⛔ `null` IS THE MODAL'S "Clear profile", AND IT HAS NO MEANING HERE. For a wall it
        // means "restore the implicit rectangle" — a wall without a profile is still a wall.
        // A space envelope has no implicit footprint to fall back to: clearing it would leave
        // a prism with no ring, which the schema refuses and which nothing could draw. So the
        // button is REFUSED with the reason rather than committing an empty ring or silently
        // doing nothing, and the dialog stays open with the author's work intact.
        if (ring === null) {
            editor.showRefusal(
                'A space envelope has no outline to fall back to — clearing it would leave a volume '
                + 'with no footprint. Delete the envelope instead, or press Cancel.',
            );
            return;
        }

        const footprint = footprintFromProfileRing(frame, ring).map((p) => ({ x: p.x, z: p.z }));
        let outcome: unknown;
        try {
            outcome = this._deps.dispatchSetFootprint({ spaceEnvelopeId: id, footprint });
        } catch (e) {
            // A synchronous throw from the handler — the containment gate's own sentence,
            // with both numbers, forwarded VERBATIM into the dialog (C84 EI-8a).
            editor.showRefusal(messageOf(e));
            return;
        }
        if (isThenable(outcome)) {
            void Promise.resolve(outcome).then(
                () => { this.exitProfileEditMode(); },
                (e: unknown) => {
                    // ⭐ THE DIALOG STAYS OPEN ON A REFUSAL. The author's ring is still on
                    // screen and still editable, so a room dragged 1.2 m outside its level can
                    // be pulled back rather than redrawn from scratch.
                    if (this._editor === editor) editor.showRefusal(messageOf(e));
                    else this._deps.onRefusal?.(messageOf(e));
                },
            );
            return;
        }
        this.exitProfileEditMode();
    }
}

function isThenable(v: unknown): v is PromiseLike<unknown> {
    return typeof (v as { then?: unknown } | null | undefined)?.then === 'function';
}

function messageOf(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
