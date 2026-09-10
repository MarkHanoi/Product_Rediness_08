// §ARRAY-ALONG-PATH (ADR-0386, lane ARRAY-ALONG-PATH, 2026-09-10) — THE SURFACE: draw a spine,
// state a frequency, and the roster gains N more profiles.
//
// ADR-0386 D1–D7 · ADR-0383 D2 / D4 · C114 §6a / §12 · C08 §3.1 · C16 CA-18 · P6.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ IT ENDS AT THE ROSTER. IT HAS NO CREATE BUTTON AND MUST NEVER GROW ONE.
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Its last act is `addFootprint()` — N appends to the transient roster `masterPlanSection` already
// renders. The founder then presses the ONE **Create all blocks** button that already exists, and
// gets N independent `IfcBuilding` from ONE `spaceEnvelope.batch.create` under ONE Ctrl+Z, through
// machinery that shipped before this lane and is proven.
//
// A second create here would have been the easy build and the wrong one: it would have meant a
// second batch, a second undo story and a second group-minting path, and the guarding test would
// have stayed green over whichever copy it happened to measure
// ([[same-rule-two-implementations]], eight recurrences).
//
// ⭐ SO "PREVIEW BEFORE COMMIT" IS NOT A FEATURE THIS SECTION BUILDS — IT IS WHAT THE ROSTER
// ALREADY IS. The copies land as ordinary profile rows with the existing per-profile **Remove** and
// **Clear all profiles**, nothing is dispatched, and the panel's own preview then runs the ONE
// planner over the whole roster — which is also how the overlap advisory reaches the copies
// (ADR-0386 D5: `findMassingGroupOverlaps` through the kernel's `intersectPolygons2D`, measured
// once, never re-derived here).

import { trace } from '@opentelemetry/api';
import {
    ENVELOPE_ARRAY_MIN_SPACING_M,
    buildEnvelopeArrayAlongPath,
    type EnvelopeArrayOrientation,
    type EnvelopeArrayResult,
} from './envelopeArrayAlongPath';
import {
    DRAWN_ENVELOPE_MAX_PROFILES,
    type DrawnEnvelopeFootprint,
    type DrawnEnvelopeProfile,
} from './drawnEnvelopeFootprintState';
import type { DrawnArrayPath } from './envelopeArrayPathState';
import type { EnvelopeDrawActivation, EnvelopeDrawStatus } from './siteEnvelopeDrawArming';

const _tracer = trace.getTracer('pryzm.site.masterPlanArraySection');

const VIOLET = '#6600FF';
const INK_SOFT = '#8a83a0';
const ADVISORY_INK = '#8a5a00';
const REFUSAL_INK = '#9b2c2c';

export const MP_ARRAY_ROOT_TESTID = 'site-master-plan-array';
export const MP_ARRAY_SPINE_BTN_TESTID = 'site-master-plan-array-spine';
export const MP_ARRAY_SPACING_TESTID = 'site-master-plan-array-spacing';
export const MP_ARRAY_ORIENTATION_TESTID = 'site-master-plan-array-orientation';
export const MP_ARRAY_ORIENTATION_OPTION_ATTR = 'data-array-orientation';
export const MP_ARRAY_PREVIEW_TESTID = 'site-master-plan-array-preview';
export const MP_ARRAY_REFUSAL_TESTID = 'site-master-plan-array-refusal';
export const MP_ARRAY_APPLY_BTN_TESTID = 'site-master-plan-array-apply';
export const MP_ARRAY_CLEAR_BTN_TESTID = 'site-master-plan-array-clear';
export const MP_ARRAY_STATUS_TESTID = 'site-master-plan-array-status';
export const MP_ARRAY_PROTOTYPE_TESTID = 'site-master-plan-array-prototype';

/** The frequency the field starts at. The founder's own example: *"every, let's say, 10 metres"*. */
export const MP_ARRAY_DEFAULT_SPACING_M = 10;

export interface MasterPlanArraySectionDeps {
    /** The session roster, oldest first. Production: `getDrawnEnvelopeProfiles`. */
    readonly readProfiles: () => readonly DrawnEnvelopeProfile[];
    readonly subscribeProfiles: (fn: () => void) => () => void;
    /**
     * Append ONE generated footprint to the roster. Production: `addDrawnEnvelopeProfile`.
     * Returns `null` when the roster refused it (degenerate, or full) — REPORTED, never assumed.
     */
    readonly addFootprint: (f: DrawnEnvelopeFootprint) => DrawnEnvelopeProfile | null;
    /** Arm the ONE stroke driver with the spine intent. Production: `() => armEnvelopeDraw('array-path')`. */
    readonly armSpine: () => EnvelopeDrawActivation;
    readonly readDrawStatus: () => EnvelopeDrawStatus;
    readonly subscribeDrawStatus: (fn: () => void) => () => void;
    /** The spine slot. Production: `getDrawnArrayPath` / `subscribeDrawnArrayPath`. */
    readonly readSpine: () => DrawnArrayPath | null;
    readonly subscribeSpine: (fn: () => void) => () => void;
    readonly clearSpine: () => void;
}

export interface MasterPlanArraySectionHandle {
    readonly element: HTMLElement;
    refresh(): void;
    dispose(): void;
}

const el = (tag: string, css: string, text?: string): HTMLElement => {
    const n = document.createElement(tag);
    n.style.cssText = css;
    if (text !== undefined) n.textContent = text;
    return n;
};

const fmt = (n: number, dp = 1): string => n.toFixed(dp).replace(/\.0+$/, '');

/**
 * ⭐ ADR-0386 D7 — WHICH PROFILE IS THE PROTOTYPE, ANSWERED ONCE.
 *
 * The MOST RECENT one, which is this module family's established meaning of *"the profile the user
 * is working on"*: `getDrawnEnvelopeFootprint()` returns exactly that, and a redraw replaces exactly
 * that. The founder's *"the first envelope"* means the first one he drew, which in the session he
 * describes IS the most recent.
 *
 * ⛔ AND THE PANEL NAMES IT rather than leaving it to be inferred. A tool that silently repeats a
 * different block than the user is looking at is the [[same-rule-two-implementations]] failure
 * expressed as a UI: right answer, wrong subject.
 */
export function arrayPrototypeOf(
    profiles: readonly DrawnEnvelopeProfile[],
): DrawnEnvelopeProfile | null {
    return profiles.length === 0 ? null : profiles[profiles.length - 1]!;
}

export function mountMasterPlanArraySection(
    host: HTMLElement,
    deps: MasterPlanArraySectionDeps,
): MasterPlanArraySectionHandle {
    const span = _tracer.startSpan('pryzm.site.mountMasterPlanArraySection');
    try {
        const root = el('div',
            'margin-top:8px;padding-top:7px;border-top:1px dashed #e7e3f2;min-width:0;max-width:100%;');
        root.setAttribute('data-testid', MP_ARRAY_ROOT_TESTID);
        host.appendChild(root);

        let disposed = false;
        /** Held across repaints — the spine channel fires while the user is typing. */
        let typedSpacing = String(MP_ARRAY_DEFAULT_SPACING_M);
        /** ⭐ D2 — DEFAULTS TO TANGENT, and the control only appears when the spine actually bends. */
        let orientation: EnvelopeArrayOrientation = 'tangent';
        let statusNote: string | null = null;
        let statusKind: 'ok' | 'refused' | null = null;

        const heading = el('div', `font-weight:700;font-size:10.5px;color:${VIOLET};`,
            'Array along a line');
        const lede = el('div', `margin-top:2px;font-size:9px;line-height:1.45;color:${INK_SOFT};`,
            'Draw a line out from the first block\'s centre and repeat it along that line. The '
            + 'spacing is CENTRE TO CENTRE, measured along the line — not gap to gap.');
        const prototypeLine = el('div', `margin-top:3px;font-size:9.5px;line-height:1.4;color:#2b2440;`);
        prototypeLine.setAttribute('data-testid', MP_ARRAY_PROTOTYPE_TESTID);

        const controls = el('div', 'display:flex;gap:5px;flex-wrap:wrap;margin-top:5px;align-items:flex-end;');

        const btn = (label: string, testid: string, primary: boolean): HTMLButtonElement => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.setAttribute('data-testid', testid);
            b.style.cssText =
                'appearance:none;cursor:pointer;padding:4px 8px;border-radius:7px;font-weight:600;'
                + 'font-size:9.5px;font-family:system-ui,sans-serif;flex:none;'
                + (primary
                    ? `border:1px solid ${VIOLET};background:${VIOLET};color:#ffffff;`
                    : `border:1px solid #d8d3e6;background:#faf9fd;color:${VIOLET};`);
            return b;
        };

        const spineBtn = btn('Draw the spine', MP_ARRAY_SPINE_BTN_TESTID, false);
        const clearBtn = btn('Clear the spine', MP_ARRAY_CLEAR_BTN_TESTID, false);

        const spacingLabel = el('label', `display:block;font-size:9px;color:${INK_SOFT};`,
            'Every … metres (centre to centre)');
        const spacingInput = document.createElement('input');
        spacingInput.type = 'number';
        spacingInput.min = String(ENVELOPE_ARRAY_MIN_SPACING_M);
        spacingInput.step = '0.5';
        spacingInput.value = typedSpacing;
        spacingInput.setAttribute('data-testid', MP_ARRAY_SPACING_TESTID);
        spacingInput.style.cssText =
            'width:100%;box-sizing:border-box;padding:4px 6px;border-radius:6px;border:1px solid #d8d3e6;'
            + 'font-weight:600;font-size:10.5px;font-family:system-ui,sans-serif;';
        spacingInput.addEventListener('input', () => { typedSpacing = spacingInput.value; render(); });
        const spacingCol = el('div', 'flex:1;min-width:96px;');
        spacingCol.append(spacingLabel, spacingInput);

        controls.append(spineBtn, clearBtn, spacingCol);

        /**
         * ⭐ D2 — THE ORIENTATION CONTROL, MOUNTED ALWAYS AND SHOWN ONLY WHEN THE CHOICE IS REAL.
         *
         * ⛔ `hidden`, never `remove()`/`append()` per render: a control that is destroyed and
         * rebuilt loses focus mid-interaction, and rebuilding it is also how two rival copies of a
         * control come to exist. One node, one owner of its visibility.
         */
        const orientationRow = el('div', 'margin-top:5px;');
        orientationRow.setAttribute('data-testid', MP_ARRAY_ORIENTATION_TESTID);
        const orientationLabel = el('div', `font-size:9px;color:${INK_SOFT};`,
            'This line bends — how should the copies sit on it?');
        const orientationBtns = el('div', 'display:flex;gap:4px;margin-top:3px;flex-wrap:wrap;');
        const OPTIONS: ReadonlyArray<[EnvelopeArrayOrientation, string, string]> = [
            ['tangent', 'Turn with the line',
                'Each block meets the line at the same angle as the first — what a terrace along a '
                + 'curving street looks like.'],
            ['prototype', 'Keep the first bearing',
                'Every block keeps the first block\'s orientation, and the line is only a ruler — '
                + 'right for a solar or grid-aligned master plan.'],
        ];
        const orientationButtons = new Map<EnvelopeArrayOrientation, HTMLButtonElement>();
        for (const [id, label, why] of OPTIONS) {
            const b = btn(label, `${MP_ARRAY_ORIENTATION_TESTID}-${id}`, false);
            b.setAttribute(MP_ARRAY_ORIENTATION_OPTION_ATTR, id);
            b.title = why;
            b.onclick = (ev): void => {
                ev.preventDefault();
                ev.stopPropagation();
                orientation = id;
                render();
            };
            orientationButtons.set(id, b);
            orientationBtns.appendChild(b);
        }
        orientationRow.append(orientationLabel, orientationBtns);

        // ⛔ TWO NODES, NOT ONE THAT SWAPS ITS OWN IDENTITY. The first draft had a single line
        // whose `data-testid` became the refusal id when the plan was refused — so a reader
        // querying the PREVIEW got nothing back on exactly the states it most needed to see, and
        // the end-to-end arm caught it by reading `''` where a sentence with both numbers belonged.
        // A node that renames itself is a node with two owners; one hidden node each is the same
        // discipline the orientation row uses.
        const previewLine = el('div', 'margin-top:5px;font-size:9.5px;line-height:1.5;color:#4b4460;');
        previewLine.setAttribute('data-testid', MP_ARRAY_PREVIEW_TESTID);
        const refusalLine = el('div',
            `margin-top:5px;font-size:9.5px;line-height:1.5;color:${REFUSAL_INK};`);
        refusalLine.setAttribute('data-testid', MP_ARRAY_REFUSAL_TESTID);
        const applyRow = el('div', 'margin-top:5px;');
        const applyBtn = btn('Add the blocks to the roster', MP_ARRAY_APPLY_BTN_TESTID, false);
        applyRow.appendChild(applyBtn);
        const statusLine = el('div', 'margin-top:4px;font-size:9px;line-height:1.5;min-height:10px;');
        statusLine.setAttribute('data-testid', MP_ARRAY_STATUS_TESTID);
        statusLine.setAttribute('data-state', 'idle');

        root.append(heading, lede, prototypeLine, controls, orientationRow, previewLine,
            refusalLine, applyRow, statusLine);

        // ── the ONE plan producer, asked by BOTH the render and the click ────────────────────

        /**
         * ⛔ THE SAME CALL THE APPLY MAKES. A preview computed one way and a commit computed
         * another is how a panel comes to promise five blocks and place four; `render()` and
         * `runApply()` both come through here, with `runApply` re-reading in its own beat.
         */
        const planNow = (): { plan: EnvelopeArrayResult | null; spine: DrawnArrayPath | null;
            prototype: DrawnEnvelopeProfile | null; rosterLength: number } => {
            let profiles: readonly DrawnEnvelopeProfile[] = [];
            try { profiles = deps.readProfiles(); } catch { profiles = []; }
            let spine: DrawnArrayPath | null = null;
            try { spine = deps.readSpine(); } catch { spine = null; }
            const prototype = arrayPrototypeOf(profiles);
            if (prototype === null || spine === null) {
                return { plan: null, spine, prototype, rosterLength: profiles.length };
            }
            const plan = buildEnvelopeArrayAlongPath({
                prototypeRing: prototype.footprint.ring,
                prototypeAreaM2: prototype.footprint.areaM2,
                path: spine.path,
                requestedSpacingM: typedSpacing,
                orientation,
                // ⛔ THE REAL HEADROOM, not the ceiling. The roster refuses past
                // DRAWN_ENVELOPE_MAX_PROFILES, so a generator told "23" while 20 are already held
                // would plan blocks the roster then silently dropped.
                maxCopies: DRAWN_ENVELOPE_MAX_PROFILES - profiles.length,
            });
            return { plan, spine, prototype, rosterLength: profiles.length };
        };

        // ── render ───────────────────────────────────────────────────────────────────────────

        const render = (): void => {
            if (disposed) return;
            const { plan, spine, prototype } = planNow();

            const drawStatus = (() => {
                try { return deps.readDrawStatus(); } catch { return null; }
            })();
            const strokingSpine = drawStatus?.armed === true && drawStatus.intent === 'array-path';
            spineBtn.textContent = strokingSpine ? 'Drawing — click along the line' : 'Draw the spine';
            spineBtn.setAttribute('aria-pressed', String(strokingSpine));

            if (prototype === null) {
                prototypeLine.textContent =
                    'Nothing is drawn yet. Draw one block\'s perimeter above, then come back — the '
                    + 'array repeats THAT block along a line you draw from its centre.';
            } else {
                prototypeLine.textContent =
                    `Repeating ${prototype.label} — ${fmt(prototype.footprint.areaM2)} m². `
                    + (spine === null
                        ? 'Press Draw the spine and click along the line the blocks should follow.'
                        : `Spine: ${fmt(spine.lengthM)} m over ${spine.path.length} points.`);
            }

            spineBtn.disabled = prototype === null;
            spineBtn.style.opacity = spineBtn.disabled ? '0.45' : '1';
            spineBtn.title = prototype === null
                ? 'Draw a block\'s perimeter first — the array needs something to repeat.'
                : 'Starts at the first block\'s centre. Linear, Orthogonal and Curved all work; '
                    + 'double-click or Enter finishes the line.';
            clearBtn.disabled = spine === null;
            clearBtn.style.opacity = clearBtn.disabled ? '0.45' : '1';

            // ⭐ D2 — DISCLOSED ONLY WHEN THE AMBIGUITY IS REAL. On a straight spine the two options
            // produce the identical drawing (pinned in the generator's spec), so offering the choice
            // there would teach the user that they differ when they do not.
            const curves = plan !== null && plan.ok && plan.pathCurves;
            orientationRow.hidden = !curves;
            for (const [id, b] of orientationButtons) {
                const on = id === orientation;
                b.setAttribute('aria-pressed', String(on));
                b.style.background = on ? VIOLET : '#faf9fd';
                b.style.color = on ? '#ffffff' : VIOLET;
            }

            previewLine.style.color = '#4b4460';
            refusalLine.removeAttribute('data-reason');
            if (plan === null) {
                previewLine.textContent = '';
                previewLine.hidden = true;
                refusalLine.textContent = '';
                refusalLine.hidden = true;
            } else if (!plan.ok) {
                // ⛔ THE GENERATOR'S OWN SENTENCE, VERBATIM — one refusal, one wording. It carries
                // both numbers and the route back, so re-phrasing it here would be a second answer.
                previewLine.textContent = '';
                previewLine.hidden = true;
                refusalLine.textContent = plan.statement;
                refusalLine.hidden = false;
                refusalLine.setAttribute('data-reason', plan.reason);
            } else {
                previewLine.textContent = plan.statement;
                previewLine.hidden = false;
                refusalLine.textContent = '';
                refusalLine.hidden = true;
                if (plan.truncatedBy > 0 || plan.anchorOffsetM > 0.5) {
                    previewLine.style.color = ADVISORY_INK;
                }
            }

            const n = plan !== null && plan.ok ? plan.copies.length : 0;
            applyBtn.disabled = n === 0;
            applyBtn.style.opacity = n === 0 ? '0.45' : '1';
            applyBtn.textContent = n === 0
                ? 'Add the blocks to the roster'
                : `Add ${n} block${n === 1 ? '' : 's'} to the roster`;
            applyBtn.title = n === 0
                ? 'Draw a spine and state a spacing first.'
                : 'Adds them as profiles you can still remove. ⛔ Nothing is created until you press '
                    + 'Create all blocks above — that one press makes every block in ONE command, '
                    + 'undone by ONE Ctrl+Z.';

            if (statusNote !== null) {
                statusLine.textContent = statusNote;
                statusLine.setAttribute('data-state', statusKind ?? 'idle');
                statusLine.style.color = statusKind === 'refused' ? REFUSAL_INK : VIOLET;
            } else {
                statusLine.textContent = '';
                statusLine.setAttribute('data-state', 'idle');
            }

            span.setAttribute('pryzm.masterPlanArray.copies', n);
        };

        // ── gestures ─────────────────────────────────────────────────────────────────────────

        const setStatus = (text: string, kind: 'ok' | 'refused'): void => {
            statusNote = text;
            statusKind = kind;
        };

        spineBtn.onclick = (ev): void => {
            ev.preventDefault();
            ev.stopPropagation();
            statusNote = null;
            statusKind = null;
            let act: EnvelopeDrawActivation;
            try {
                act = deps.armSpine();
            } catch (e) {
                setStatus(`PRYZM could not start the spine: ${String((e as Error)?.message ?? e)}.`,
                    'refused');
                render();
                return;
            }
            // ⛔ THE ARMING MODULE'S OWN REFUSAL — it names the route back (C16 CA-18).
            if (!act.ok) setStatus(act.reason ?? 'No site view accepted the spine.', 'refused');
            render();
        };

        clearBtn.onclick = (ev): void => {
            ev.preventDefault();
            ev.stopPropagation();
            statusNote = null;
            statusKind = null;
            try { deps.clearSpine(); } catch { /* non-fatal */ }
            render();
        };

        /**
         * ⭐ THE APPLY — N generated rings appended to the roster, and NOTHING ELSE. No command, no
         * id, no store. Re-planned in THIS beat rather than reused from the last paint, for the
         * same reason `runCreate` re-reads: a roster or spine change between the paint and the
         * click is exactly the state a stale plan would append blind on.
         */
        const runApply = (): void => {
            statusNote = null;
            statusKind = null;
            const { plan, prototype } = planNow();
            if (prototype === null || plan === null) {
                setStatus('There is no block and no spine to array yet.', 'refused');
                render();
                return;
            }
            if (!plan.ok) {
                setStatus(plan.statement, 'refused');
                render();
                return;
            }
            let added = 0;
            let refusedByRoster = 0;
            for (const copy of plan.copies) {
                // ⛔ THE PROVENANCE IS THE PROTOTYPE'S, carried rather than invented: this ring came
                // from that gesture, on that surface, in that mode. Stamping a copy with a surface
                // nobody drew it on would put a false provenance on the roster row.
                const made = deps.addFootprint({
                    ring: copy.ring,
                    areaM2: copy.areaM2,
                    surfaceId: prototype.footprint.surfaceId,
                    mode: prototype.footprint.mode,
                });
                if (made === null) refusedByRoster++;
                else added++;
            }
            // ⭐ THE SPINE IS CLEARED ON A SUCCESSFUL APPLY. Its job is done — the copies are
            // profiles now — and leaving it armed would make a second press silently double them.
            if (added > 0) {
                try { deps.clearSpine(); } catch { /* non-fatal */ }
            }
            setStatus(
                added === 0
                    ? 'No block was added — the session roster refused every one. Remove a profile '
                        + 'you no longer want, or create the blocks you already have.'
                    : `${added} block${added === 1 ? '' : 's'} added to the roster below`
                        + (refusedByRoster > 0
                            ? `, and ${refusedByRoster} refused by the roster`
                            : '')
                        + '. The spine is cleared. Remove any you do not want, then press Create all '
                        + 'blocks — one press, one command, one Ctrl+Z.',
                added === 0 ? 'refused' : 'ok');
            render();
        };

        applyBtn.onclick = (ev): void => {
            ev.preventDefault();
            ev.stopPropagation();
            runApply();
        };

        // ── channels ─────────────────────────────────────────────────────────────────────────

        let offProfiles: (() => void) | null = null;
        let offDraw: (() => void) | null = null;
        let offSpine: (() => void) | null = null;
        try { offProfiles = deps.subscribeProfiles(() => { if (!disposed) render(); }); } catch { /* none */ }
        try { offDraw = deps.subscribeDrawStatus(() => { if (!disposed) render(); }); } catch { /* none */ }
        try { offSpine = deps.subscribeSpine(() => { if (!disposed) render(); }); } catch { /* none */ }

        render();

        return {
            element: root,
            refresh: render,
            dispose: (): void => {
                disposed = true;
                try { offProfiles?.(); } catch { /* mid-teardown */ }
                try { offDraw?.(); } catch { /* ditto */ }
                try { offSpine?.(); } catch { /* ditto */ }
                offProfiles = null;
                offDraw = null;
                offSpine = null;
                root.remove();
            },
        };
    } finally {
        span.end();
    }
}
