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

    const evaluated = profileToSurfaceRing(opts.profile, opts.plane, opts.scope ?? {});
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
            commit: () => false,
            get statusText(): string { return status.textContent ?? ''; },
        };
    }

    const { ring, extents, origin, plane } = evaluated.value;
    const writeBack = profileWriteBackDisposition(opts.profile);

    const surface = new ElevationOutlineSurface({
        extents,
        plane,
        snap: wallProfileEditorSnap,
        minVertices: MIN_PROFILE_VERTICES,
        onChanged: () => {
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
    root.appendChild(status);
    surface.redraw();

    return {
        root,
        surface,
        refusal: null,
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
            const res = commitRingToProfile(opts.profile, surface.ring, origin);
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
