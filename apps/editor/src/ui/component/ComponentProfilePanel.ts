/**
 * ComponentProfilePanel — the authoring surface for a component `Profile`, composed from the
 * ONE elevation surface, the ONE profile evaluator and the C74 §4.6 constraint record.
 *
 * ⛔ **It mints nothing.** Per audit **R1**, a lane proposing a new sketch surface is rejected
 * on sight; this panel is a COMPOSITION of `ElevationOutlineSurface` (extended in place,
 * §SUBJECT-IS-A-PROFILE-ON-A-DECLARED-PLANE), `profileSurfaceAdapter` (which delegates every
 * flattening to `@pryzm/family-instance`'s `profileToPolygon`) and `profileConstraints`.
 *
 * ⛔ **NO STORE, NO COMMAND BUS** (P6) — identical to the split `WallProfileEditor`,
 * `WindowOutlineEditorDialog` and `FinishTypeEditorModal` already made. The panel hands an
 * updated `Profile` to `onCommit`; the CALLER dispatches the command.
 *
 * ⭐ **Every refusal reaches the screen.** The three ways this panel can decline — the profile
 * did not evaluate, the profile cannot be written back, a constraint has no evaluator — each
 * render their own text into the status line, by name, with the live alternative (C16 CA-18).
 * A panel that swallowed them would reproduce §OPENING-PROFILE-PANEL-REACHABILITY's measured
 * defect one surface over: *"a control that appeared to do nothing"*.
 *
 * ⭐ **§PROFILE-RING-IS-AUTHORABLE (lane CE-MAKE-IT-REACHABLE · L-12976) — the panel can now
 * DRAW.** `ElevationOutlineSurface` has had a `polyline` construction mode, a midpoint INSERT
 * and a vertex DELETE since it was written; what it never had was a caller that offered them
 * or a commit that could absorb the result. Pass `mintEntityId` and this panel mounts a
 * `Draw outline` / `Finish` / `Cancel` trio over the surface's OWN gesture (it re-implements
 * none of it — `setMode`, `closeDraft`, `cancelDraft`) and commits through the same
 * `commitRingToProfile`, which then admits a changed vertex count. Omit `mintEntityId` and the
 * panel is byte-for-byte what it was: move-only, with the count-change refusal intact.
 */

import type { Profile, ReferencePlane } from '@pryzm/file-format';
import type { EvalScope } from '@pryzm/family-runtime';
import { wallProfileEditorSnap } from '@pryzm/geometry-wall/profile-editor';
import { ElevationOutlineSurface } from '../ElevationOutlineSurface';
import {
    commitRingToProfile,
    profileConstraintGlyphs,
    profileToSurfaceRing,
    profileWriteBackDisposition,
    type ProfileSurfaceRefusal,
} from './profileSurfaceAdapter';
import type { OutlineSurfaceMode } from '../ElevationOutlineSurface';
import {
    authorableConstraintKinds,
    constraintAuthoringDisposition,
} from './profileConstraints';

const MUTED = '#6b6b76';
const REFUSAL = '#b3261e';

/** ⛔ A profile needs three vertices to bound an area — the same floor the opening callers use. */
const MIN_PROFILE_VERTICES = 3;

export interface ComponentProfilePanelOptions {
    readonly profile: Profile;
    readonly plane: ReferencePlane;
    /** Resolved parameter scope for expression-valued coordinates. Empty is valid. */
    readonly scope?: EvalScope;
    /** Called with the UPDATED profile when the author commits. The caller dispatches. */
    readonly onCommit?: (profile: Profile) => void;
    /**
     * ⭐ §PROFILE-RING-IS-AUTHORABLE — a bare-ULID factory. Supplying it turns on the
     * DRAW affordances and lets a commit change the vertex count; omitting it leaves the
     * panel move-only, exactly as it shipped. The factory is the CALLER's because id
     * minting belongs to the surface owning `@pryzm/schemas`'s `createId` — this panel
     * mints nothing.
     */
    readonly mintEntityId?: () => string;
    /**
     * Fraction of the profile's extent added around the drawing sheet, so an author can
     * place a vertex outside the shape already there. 0 (the default) keeps the sheet
     * exactly the profile's bounds — which silently CLAMPS a click aimed past them.
     */
    readonly marginFraction?: number;
    readonly attrPrefix?: string;
}

export interface ComponentProfilePanelHandle {
    readonly root: HTMLElement;
    /** The composed surface, or null when the profile refused to evaluate. */
    readonly surface: ElevationOutlineSurface | null;
    /** The refusal that stopped the panel opening, or null. */
    readonly refusal: ProfileSurfaceRefusal | null;
    /** Ask to author a constraint of `kind`. Returns true iff it was accepted. */
    requestConstraint(kind: string): boolean;
    /** ⭐ Begin drawing a replacement outline. False when this panel cannot draw
     *  (no `mintEntityId`, or the profile is read-only) — the status line says which. */
    beginDraw(): boolean;
    /** Close the open draft into the ring (the author's "Finish"). False when the draft
     *  cannot bound an area yet; the status line carries the reason. */
    finishDraw(): boolean;
    /** Abandon the open draft and return to select mode. */
    cancelDraw(): void;
    /** The surface's current construction mode — what the author is doing right now. */
    readonly mode: OutlineSurfaceMode;
    /** Commit the current ring back onto the profile. Returns true iff it was accepted. */
    commit(): boolean;
    /** The status line's current text — the layer a user reads. */
    readonly statusText: string;
}

export function createComponentProfilePanel(
    opts: ComponentProfilePanelOptions,
): ComponentProfilePanelHandle {
    const prefix = opts.attrPrefix ?? 'cpp';
    const root = document.createElement('div');
    root.setAttribute(`data-${prefix}-root`, opts.profile.id);
    root.style.cssText = 'font:13px/1.45 system-ui,sans-serif;color:#1a1a1a;';

    const status = document.createElement('div');
    status.setAttribute(`data-${prefix}-status`, '');
    status.style.cssText = `margin:6px 2px;min-height:16px;font-size:12px;color:${MUTED};`;
    const setStatus = (msg: string, isRefusal = false): void => {
        status.textContent = msg;
        status.style.color = isRefusal ? REFUSAL : MUTED;
        status.setAttribute(`data-${prefix}-status-kind`, isRefusal ? 'refusal' : 'info');
    };

    const evaluated = profileToSurfaceRing(opts.profile, opts.plane, opts.scope ?? {},
        { marginFraction: opts.marginFraction ?? 0 });
    if (!evaluated.ok) {
        // ⛔ The panel does not open EMPTY over a profile it could not read. An empty drawing
        // surface and a profile that failed to evaluate are different facts, and rendering
        // the first for the second is this repository's signature defect class.
        root.setAttribute(`data-${prefix}-refused`, evaluated.refusal.code);
        setStatus(`${evaluated.refusal.reason}. Try: ${evaluated.refusal.alternative}.`, true);
        root.appendChild(status);
        return {
            root, surface: null, refusal: evaluated.refusal,
            requestConstraint: () => false,
            beginDraw: () => false,
            finishDraw: () => false,
            cancelDraw: () => { /* there is no surface to draw on */ },
            mode: 'select',
            commit: () => false,
            get statusText(): string { return status.textContent ?? ''; },
        };
    }

    const { ring, extents, origin, plane } = evaluated.value;
    const writeBack = profileWriteBackDisposition(opts.profile);

    // ⚠ TDZ-SAFE BY CONSTRUCTION. `onChanged` fires from inside the surface (and from
    //   `setRing`, below) BEFORE the draw toolbar exists, so the syncer is a mutable
    //   binding seeded with a no-op and replaced once the buttons are on the DOM.
    //   A `const` arrow declared further down would throw a ReferenceError on the
    //   first change — a white panel where a profile should be.
    let syncDrawButtons: () => void = () => { /* the toolbar is not mounted yet */ };

    const surface = new ElevationOutlineSurface({
        extents,
        plane,
        snap: wallProfileEditorSnap,
        minVertices: MIN_PROFILE_VERTICES,
        onChanged: () => {
            // Keep the DRAW trio honest with every ring/draft change.
            syncDrawButtons();
            if (surface.mode !== 'select') {
                const n = surface.draft?.length ?? 0;
                setStatus(`${surface.mode} — ${n} point${n === 1 ? '' : 's'} placed. Enter closes the ring, Esc abandons it.`);
                return;
            }
            const unanchored = surface.unanchoredGlyphCount;
            const parts = [`${surface.ring.length} vertices on ${plane.name}`];
            if (!writeBack.writable) parts.push(`read-only — ${writeBack.refusal.reason}`);
            if (unanchored > 0) {
                parts.push(
                    `${unanchored} constraint glyph${unanchored === 1 ? '' : 's'} could not be placed on the ` +
                    'flattened ring and are NOT drawn',
                );
            }
            setStatus(parts.join(' · '), !writeBack.writable);
        },
        onDeleteRefused: () =>
            setStatus(`A profile needs at least ${MIN_PROFILE_VERTICES} vertices.`, true),
        attrPrefix: prefix,
    });
    surface.setRing(ring);

    const built = profileConstraintGlyphs(opts.profile, surface.ring, origin);
    surface.setConstraintGlyphs(built.glyphs);
    if (built.unanchored.length > 0) {
        // ⚠ Reported, per constraint, with its own reason. `unanchoredGlyphCount` counts what
        // the SURFACE could not place; this list says WHY the adapter could not supply it.
        for (const u of built.unanchored) {
            const line = document.createElement('div');
            line.setAttribute(`data-${prefix}-unanchored`, u.id);
            line.style.cssText = `font-size:11.5px;color:${MUTED};`;
            line.textContent = `Constraint '${u.kind}' is not drawn: ${u.reason}.`;
            root.appendChild(line);
        }
    }

    root.appendChild(surface.svg);

    /* ══════════════════════════════════════════════════════════════════════
     * §PROFILE-RING-IS-AUTHORABLE — the DRAW trio.
     *
     * ⛔ Mounted ONLY when the caller supplied an id factory AND the profile is
     *    write-back admissible. A read-only profile (an arc, a circle, an
     *    expression-valued coordinate) gets NO draw button, for the same reason
     *    it gets no commit button: an affordance whose commit is guaranteed to
     *    refuse is an affordance that lies (spec §75).
     * ══════════════════════════════════════════════════════════════════════ */
    const canDraw = opts.mintEntityId !== undefined && writeBack.writable;
    let drawBtn: HTMLButtonElement | null = null;
    let finishBtn: HTMLButtonElement | null = null;
    let cancelBtn: HTMLButtonElement | null = null;

    syncDrawButtons = (): void => {
        if (!drawBtn || !finishBtn || !cancelBtn) return;
        const drawing = surface.mode !== 'select';
        drawBtn.hidden = drawing;
        finishBtn.hidden = !drawing;
        cancelBtn.hidden = !drawing;
        finishBtn.disabled = (surface.draft?.length ?? 0) < MIN_PROFILE_VERTICES;
    };

    function beginDraw(): boolean {
        if (!canDraw) {
            setStatus(
                opts.mintEntityId === undefined
                    ? 'This surface cannot draw a replacement outline: its caller supplied no id factory, ' +
                      'so a new vertex would have no identity in the document.'
                    : `Read-only geometry: ${writeBack.writable ? '' : writeBack.refusal.reason}.`,
                true);
            return false;
        }
        surface.setMode('polyline');
        setStatus('Click to place each vertex of the new outline. Finish closes it; Cancel keeps the current shape.');
        syncDrawButtons();
        return true;
    }

    function finishDraw(): boolean {
        const n = surface.draft?.length ?? 0;
        if (!surface.closeDraft()) {
            // ⛔ NAMED, never a dead button. `closeDraft` keeps the draft when it
            //    cannot bound an area, so the author's work is not thrown away.
            setStatus(
                `The outline has ${n} vertex${n === 1 ? '' : 'es'} and needs at least ` +
                `${MIN_PROFILE_VERTICES} to bound an area — keep placing points, or Cancel.`,
                true);
            syncDrawButtons();
            return false;
        }
        setStatus(`Outline closed with ${surface.ring.length} vertices — commit to write it into the draft definition.`);
        syncDrawButtons();
        return true;
    }

    function cancelDraw(): void {
        surface.cancelDraft();
        surface.setMode('select');
        setStatus(`${surface.ring.length} vertices on ${plane.name} — the drawn outline was abandoned.`);
        syncDrawButtons();
    }

    if (canDraw) {
        const bar = document.createElement('div');
        bar.setAttribute(`data-${prefix}-drawbar`, '');
        bar.style.cssText = 'display:flex;gap:6px;margin:6px 2px;flex-wrap:wrap;';
        const mk = (attr: string, label: string, onClick: () => void): HTMLButtonElement => {
            const b = document.createElement('button');
            b.type = 'button';
            b.setAttribute(`data-${prefix}-${attr}`, '');
            b.textContent = label;
            b.style.cssText =
                'background:#fff;color:#1a1a1a;border:1px solid #d6d6de;padding:3px 10px;' +
                'border-radius:6px;font-size:12px;cursor:pointer;';
            b.addEventListener('click', onClick);
            bar.appendChild(b);
            return b;
        };
        drawBtn = mk('draw', 'Draw outline', () => { beginDraw(); });
        finishBtn = mk('finish', 'Finish outline', () => { finishDraw(); });
        cancelBtn = mk('cancel-draw', 'Cancel', () => { cancelDraw(); });
        root.appendChild(bar);
        syncDrawButtons();
    }

    root.appendChild(status);
    surface.redraw();

    return {
        root,
        surface,
        refusal: null,
        beginDraw,
        finishDraw,
        cancelDraw,
        get mode(): OutlineSurfaceMode { return surface.mode; },
        requestConstraint(kind: string): boolean {
            const d = constraintAuthoringDisposition(kind);
            if (!d.authorable) {
                // ⛔ C74 §4.6.3: *"Silently accepting the author's click and writing an inert
                // record is the forbidden outcome."*
                root.setAttribute(`data-${prefix}-constraint-refused`, kind);
                setStatus(d.refusal.message, true);
                return false;
            }
            setStatus(`Pick the entities for '${kind}'. Kinds available today: ${authorableConstraintKinds().join(', ')}.`);
            return true;
        },
        commit(): boolean {
            const res = commitRingToProfile(opts.profile, surface.ring, origin,
                opts.mintEntityId ? { mintEntityId: opts.mintEntityId } : {});
            if (!res.ok) {
                root.setAttribute(`data-${prefix}-commit-refused`, res.refusal.code);
                setStatus(`Not committed: ${res.refusal.reason}. Try: ${res.refusal.alternative}.`, true);
                return false;
            }
            opts.onCommit?.(res.profile);
            setStatus(`Committed ${surface.ring.length} vertices to '${opts.profile.name}'.`);
            return true;
        },
        get statusText(): string { return status.textContent ?? ''; },
    };
}
