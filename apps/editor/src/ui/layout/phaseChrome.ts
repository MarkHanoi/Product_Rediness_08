/**
 * @file apps/editor/src/ui/layout/phaseChrome.ts
 *
 * §UX1-PHASE-CHROME — applies the phase column of `panelDefaults.PANEL_REGISTRY`
 * to the DOM, in ONE place.
 *
 * ── Why a controller instead of a check at each panel ────────────────────────
 * The founder's 2026-08-19 report asks for four chrome groups to disappear while
 * the user is on the PRYZM Earth globe and to come back on the BIM canvas. The
 * obvious implementation — an `if (onGlobe) return;` at each mount site — is the
 * one that must not be used: it is exactly the shape the 2026-08-18 pass removed,
 * where the start-up state was the sum of unrelated literals in unrelated files
 * and therefore uncountable. `panelDefaults.ts` owns the DECISION; this module is
 * the single place that turns the decision into `style.display`.
 *
 * ── TWO enforcement strengths, and the difference is stated, not blurred ─────
 * `panelDefaults.panelAbsent()` means "do not render this at all". There are two
 * ways to honour that and they are NOT equivalent:
 *
 *   · **SKIP-MOUNT** — the owning code asks `panelAbsent(id)` before it builds
 *     anything, so nothing is created, subscribed or queried. This is the real
 *     thing. Used for the surfaces this lane owns (the launcher rail).
 *   · **HIDE** — the surface mounts as it always did and this controller sets
 *     `display: none` on its root. The pixels are gone; the subscriptions are
 *     NOT. A hidden panel that is still listening is still paying, and a hidden
 *     panel that is still computing sun positions for a model that does not
 *     exist is still wrong — just invisibly so.
 *
 * Every row in {@link PHASE_CHROME_SELECTORS} declares which of the two it gets
 * and why. The HIDE rows are surfaces owned by other lanes: converting them to
 * SKIP-MOUNT means editing their mount logic, which is their call, not this
 * lane's. They are recorded as a NAMED GAP (L-1025) rather than silently counted
 * as if they were skip-mounted — that difference is the whole point of saying it.
 *
 * ── Idempotence and ordering ────────────────────────────────────────────────
 * Chrome in this app mounts asynchronously and re-mounts on view switches, so
 * "apply once at phase change" is not enough — a pill mounted a second after the
 * phase flipped would appear anyway. {@link installPhaseChrome} therefore applies
 * on the phase event AND on a MutationObserver over `<body>`, and the apply pass
 * is idempotent and cheap (a handful of `querySelector` calls against ids).
 *
 * Contracts: C82 §1.1 (absence is legal; permanent absence is not — the
 * reachability rule is asserted in `panelDefaults.spec.ts`), C06 §7.2 (these are
 * declared screen regions, and this module never moves them, only shows/hides).
 */

import {
    appPhase,
    panelState,
    onAppPhaseChanged,
    onPanelStateChanged,
    type AppPhase,
    type PanelId,
} from './panelDefaults';
// §UX2-REOPEN-SHIPS-WITH-CLOSE — the reopen ROUTE is installed by this module, not
// by a caller. See `installPhaseChrome` for why that is a correctness property
// rather than a convenience.
import { installViewPropertiesLauncher } from './ViewPropertiesLauncher';

/** How strongly a row's absence is enforced. See the header — the words differ. */
export type PhaseEnforcement = 'skip-mount' | 'hide';

export interface PhaseChromeRow {
    /** The registry row this DOM group belongs to. */
    readonly panel: PanelId;
    /**
     * CSS selectors for every element in the group. Ids rather than classes on
     * purpose: these are singletons, and a class selector here would silently
     * widen to whatever else picked up the class.
     */
    readonly selectors: readonly string[];
    readonly enforcement: PhaseEnforcement;
    /**
     * §UX2-PANEL-SHELL — OPTIONAL. When set, the nearest ANCESTOR of each matched
     * element that matches this selector is hidden alongside the element itself.
     *
     * It exists because a "section" selector can be honest about the content and
     * still leave the CHROME on screen. `view-properties` is exactly that: the
     * registry row targets `.vp-root`, but `PropertyPanel.showViewProperties()`
     * builds `.gpp-panel > [.gpp-header 'VIEW PROPERTIES' + close button] +
     * .vp-root` and then sets `display:block` on the SHELL. Hiding only `.vp-root`
     * therefore left the founder looking at a titled, closable panel with an empty
     * body — a panel that is neither open nor closed, i.e. the fourth state
     * `panelDefaults` exists to forbid.
     *
     * The ancestor is resolved from the MATCHED element rather than named as its
     * own selector on purpose: `.gpp-panel` is SHARED with the element inspector,
     * and a standalone `.gpp-panel` row would take the selection inspector down
     * with it. Reaching it only via `.vp-root` means it is hidden exactly when the
     * panel is in View-Properties mode and never when it is inspecting an element
     * (`showElement()` clears `innerHTML`, so `.vp-root` is simply not there).
     */
    readonly hideClosest?: string;
    /** Why this enforcement level, and what it therefore does not achieve. */
    readonly note: string;
}

/**
 * The DOM half of the table. Kept beside the decision, never inside it:
 * `panelDefaults.ts` must stay free of selectors so it can be read as policy.
 */
export const PHASE_CHROME_SELECTORS: readonly PhaseChromeRow[] = [
    {
        panel: 'launcher-rail',
        selectors: [
            '#pryzm-site-view-launcher',
            '#pryzm-plan-gis-launcher',
            '#pryzm-graph-launcher',
            '#pryzm-living-graph-launcher',
            '#pryzm-site-analysis-launcher',
            '#pryzm-envelope-card-launcher',
            '#pryzm-reset-panel-layout',
            '#svp-toggle-button',
        ],
        enforcement: 'skip-mount',
        note:
            'The six pills, the Split View toggle folded into the same slot accounting (L-159), ' +
            'and the Reset control. GISAreaLayout asks `panelAbsent` before mounting, so on the ' +
            'globe none of these is created; the selectors here are the belt to that braces, for ' +
            'the graph/living-graph pills which are mounted by their own modules.',
    },
    {
        panel: 'renderer-backend-toggle',
        selectors: ['#pryzm-renderer-backend-toggle'],
        enforcement: 'hide',
        note:
            'The WebGPU/WebGL escape hatch. HIDE rather than skip-mount deliberately: the toggle ' +
            'reads and writes a persisted backend preference at mount, and not mounting it would ' +
            'change more than its visibility. Hiding it on the globe costs nothing — the globe is ' +
            'Cesium and never goes through the swap path this pill drives.',
    },
    {
        panel: 'view-properties-launcher',
        selectors: ['#pryzm-view-properties-launcher'],
        enforcement: 'skip-mount',
        note:
            'The bottom-right reopen button (§UX1-VP-DEFAULT-CLOSED). SKIP-MOUNT: ' +
            '`ViewPropertiesLauncher.mount()` asks `panelAbsent` before creating anything, so on ' +
            'the globe the node never exists. The selector is the belt to that braces — if a ' +
            'future caller mounts it unconditionally, this row still takes it off the globe.',
    },
    {
        panel: 'view-properties',
        // MEASURED, not guessed: `ViewPropertiesSection.ts:76` — `root.className =
        // 'vp-root'`. This is a SECTION of the property panel, not a standalone
        // panel, which is why the selector targets `.vp-root` and never `.gpp-panel`:
        // hiding the whole property panel would take the selection inspector with it.
        selectors: ['.vp-root'],
        enforcement: 'hide',
        // §UX2-PANEL-SHELL — MEASURED, not assumed: `PropertyPanel.showViewProperties()`
        // (PropertyPanel.ts:642-680) clears `.gpp-panel`, appends a `.gpp-header` carrying
        // the 'VIEW PROPERTIES' badge, the 'Environment & Camera' subtitle and a CLOSE
        // BUTTON, appends `.vp-root`, then `_makeVisible()` (:545-547) sets
        // `display:block` on the SHELL. Hiding `.vp-root` alone left that header bar on
        // screen over an empty body. See `hideClosest` on the interface for why the shell
        // is reached through `.vp-root` instead of being given a row of its own.
        hideClosest: '.gpp-panel',
        note:
            'Sun / climate / wind / shadows / post-processing — all properties of a rendered ' +
            'model. HIDE, not skip-mount: this panel is owned by another lane and converting it ' +
            'is that lane’s call. NAMED GAP (L-1025): its subscriptions still run while hidden, ' +
            'so this removes the pixels, not the work — and `hideClosest` removes the SHELL’S ' +
            'pixels too, which is a strictly larger set than this row used to take.',
    },
    {
        panel: 'level-stepper',
        // MEASURED: `ActiveLevelHUD.ts:39` — `this.root.className = 'alh-hud'`,
        // mounted over the canvas into `#alh-hud-mount` (Layout.ts:182).
        selectors: ['.alh-hud'],
        enforcement: 'hide',
        note:
            'Steps the active level. On the globe it renders a real-looking "Ground +0.000 m" for ' +
            'a stack that does not exist. HIDE only: the level stack is another lane’s subject and ' +
            'this row governs the CHROME’S VISIBILITY, never level behaviour. Same pixels-not-work ' +
            'caveat as `view-properties`.',
    },
] as const;

/** Marks an element hidden BY THIS CONTROLLER, so restoring never clobbers a peer. */
const MARK = 'data-pryzm-phase-hidden';

/** What one apply pass actually did — returned so callers can report honestly. */
export interface PhaseChromeReport {
    readonly phase: AppPhase;
    /** Elements hidden in this pass. */
    readonly hidden: number;
    /** Elements restored in this pass. */
    readonly shown: number;
    /**
     * Rows whose selectors matched NOTHING. Not an error — a surface may simply
     * not be mounted yet — but reported rather than swallowed, because "matched
     * nothing" and "matched and hid it" must never print the same result. A row
     * that is permanently unresolved is a selector that has rotted, and the only
     * way to see that is to publish this number.
     */
    readonly unresolved: readonly PanelId[];
}

/**
 * Apply the current phase to the DOM. Idempotent; safe to call at any time and
 * from any number of triggers.
 */
export function applyPhaseChrome(root: ParentNode = document): PhaseChromeReport {
    const phase = appPhase();
    let hidden = 0;
    let shown = 0;
    const unresolved: PanelId[] = [];

    for (const row of PHASE_CHROME_SELECTORS) {
        // §UX1-VP-DEFAULT-CLOSED — this used to read `panelAbsent(...)`, i.e. it only
        // enforced the ABSENT state and treated `closed` as if it were `open`. That was
        // survivable while no governed row was ever `closed` in a phase this controller
        // touches; it stopped being survivable the moment `view-properties` became
        // CLOSED on the canvas. `panelState` is the LIVE answer (absent > session
        // override > table), so both non-open states are honoured through one call and
        // a reopen click is reflected by the same code path as a phase change.
        const shouldHide = panelState(row.panel) !== 'open';
        let matched = 0;
        for (const sel of row.selectors) {
            let els: Element[];
            try {
                els = Array.from(root.querySelectorAll(sel));
            } catch {
                // A malformed selector must not take the whole pass down with it.
                continue;
            }
            for (const el of els) {
                matched += 1;
                // §UX2-PANEL-SHELL — the element, plus its shell when the row declares one.
                const targets: HTMLElement[] = [el as HTMLElement];
                if (row.hideClosest) {
                    const shell = (el as HTMLElement).closest(row.hideClosest);
                    if (shell instanceof HTMLElement && shell !== el) targets.push(shell);
                }
                for (const t of targets) {
                    const style = t.style;
                    if (shouldHide) {
                        // §UX2-REASSERT — the condition is "is it VISIBLE?", not "have I marked
                        // it?". The old test was `getAttribute(MARK) === null`, which meant that
                        // once ANOTHER module set `display` back — and `_makeVisible()` does
                        // exactly that, unconditionally, on every `showViewProperties()` — this
                        // controller saw its own stale mark, concluded it had already done the
                        // job, and never hid it again. The panel came back and stayed back.
                        // Marking is still once-only, so the ORIGINAL authored value is never
                        // overwritten by a value some other module happened to leave behind.
                        if (style.display !== 'none') {
                            if (t.getAttribute(MARK) === null) t.setAttribute(MARK, style.display || '');
                            style.display = 'none';
                            hidden += 1;
                        }
                    } else if (t.getAttribute(MARK) !== null) {
                        // Restore exactly what was there before, not a guessed value.
                        style.display = t.getAttribute(MARK) ?? '';
                        t.removeAttribute(MARK);
                        shown += 1;
                    }
                }
            }
        }
        if (matched === 0) unresolved.push(row.panel);
    }

    return { phase, hidden, shown, unresolved };
}

let installed = false;
let observer: MutationObserver | null = null;
let disposePhaseSub: (() => void) | null = null;
let disposeStateSub: (() => void) | null = null;
let disposeLauncher: (() => void) | null = null;

/**
 * Install the controller: apply now, on every phase change, and whenever chrome
 * is added to `<body>`.
 *
 * The MutationObserver is not belt-and-braces caution — it is required. Chrome
 * here mounts asynchronously and re-mounts on view switches, so a pill created
 * one tick after the phase flipped would otherwise appear on the globe anyway.
 * That is the null-at-mount race this codebase has already paid for, in the
 * opposite direction.
 *
 * Idempotent. Returns a disposer.
 */
export function installPhaseChrome(): () => void {
    if (installed) return () => { /* already installed; the first disposer owns it */ };
    installed = true;

    const apply = (): void => {
        try {
            applyPhaseChrome();
        } catch (e) {
            console.warn('[phase-chrome] apply failed (non-fatal):', e);
        }
    };

    // §UX2-REOPEN-SHIPS-WITH-CLOSE — install the reopen ROUTE here, in the same call
    // that starts enforcing the closed state. This is a correctness property, not
    // tidiness: `panelDefaults` flips `view-properties` to CLOSED on the canvas, and
    // C82 §1.1 permits absence but never unreachability, so the close mechanism and
    // the route back must not be separately installable. They were: the only
    // `installViewPropertiesLauncher()` call in the tree lived in `GISAreaLayout.ts`,
    // was UNCOMMITTED, and sat in a file another lane was mid-refactor in — so at HEAD
    // the panel was closed by default with NOTHING that could reopen it, and
    // `panelDefaults.spec.ts`'s reachability assertion was red saying so. Binding them
    // here means that combination cannot be reconstructed by dropping one file.
    // `installViewPropertiesLauncher` is idempotent, so the pre-existing caller (if it
    // lands) is a harmless second call, not a double mount.
    try {
        disposeLauncher = installViewPropertiesLauncher();
    } catch (e) {
        console.warn('[phase-chrome] view-properties launcher failed to install:', e);
    }

    apply();
    disposePhaseSub = onAppPhaseChanged(() => apply());
    // §UX1-VP-DEFAULT-CLOSED — the third trigger. Without it a reopen click changes
    // the model and nothing on screen; see `onPanelStateChanged`'s note.
    disposeStateSub = onPanelStateChanged(() => apply());

    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.body) {
        observer = new MutationObserver((records) => {
            // Only re-apply when NODES were added — attribute churn (including our
            // own `display` writes) must not re-enter, or this becomes a loop.
            for (const r of records) {
                if (r.addedNodes.length > 0) { apply(); return; }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
        installed = false;
        try { observer?.disconnect(); } catch { /* gone */ }
        observer = null;
        try { disposePhaseSub?.(); } catch { /* gone */ }
        disposePhaseSub = null;
        try { disposeStateSub?.(); } catch { /* gone */ }
        disposeStateSub = null;
        try { disposeLauncher?.(); } catch { /* gone */ }
        disposeLauncher = null;
    };
}

/** TEST-ONLY: forget the install guard so a spec can install into a fresh DOM. */
export function __resetPhaseChromeForTests(): void {
    try { observer?.disconnect(); } catch { /* gone */ }
    try { disposePhaseSub?.(); } catch { /* gone */ }
    try { disposeStateSub?.(); } catch { /* gone */ }
    try { disposeLauncher?.(); } catch { /* gone */ }
    observer = null;
    disposePhaseSub = null;
    disposeStateSub = null;
    disposeLauncher = null;
    installed = false;
}
