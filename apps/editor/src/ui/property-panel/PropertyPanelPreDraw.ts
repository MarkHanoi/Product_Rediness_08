/**
 * PropertyPanelPreDraw
 *
 * Extracted from PropertyPanel.ts (WS-B S84-WIRE, Wave 7 cleanup).
 *
 * Contains all "pre-draw" panel renderers — the overlays shown when a creation
 * tool is active and the user has not yet placed an element on the canvas.
 * Each function builds and injects DOM into the provided `PreDrawPanelHost`
 * container; the host interface keeps all references to PropertyPanel state
 * minimal and explicit.
 *
 * Contract compliance:
 *  - §01 CORE: no store mutations here; only tool-parameter writes via the tool's
 *    own setters (e.g. wallTool.setSystemTypeId)
 *  - §01-1.1: Tool Layer — all functions are called from PropertyPanel methods
 */

import { buildWallTypeSelectorWidget } from './WallTypeSelectorWidget';
// §FEAT-HANDRAIL-CREATION-PARITY (founder 2026-08-18; C95 D4/D5) — the railing
// pre-draw panel reads the SAME catalogue widget a SELECTED railing offers, so the
// creation list and the retype list can never differ (C84 EI-9).
import { buildRailingTypeSelectorWidget } from './RailingTypeSelectorWidget';
import { handrailTypeStore } from '@pryzm/core-app-model/stores';
// ⚠ MOVED 2026-08-19 (L-1106) — see `@pryzm/geometry-handrail/handrailAuthoring`:
// the 3-D tool lives in that package and could not import an app-scoped store.
import {
    setActiveHandrailTypeId,
    resolveActiveHandrailTypeId,
} from '@pryzm/geometry-handrail';
import { setActiveWallSystemTypeId } from '../../engine/views/plantools/activeWallSystemType';
import { buildSlabTypeSelectorWidget } from './SlabTypeSelectorWidget';
import { buildCeilingTypeSelectorWidget } from './CeilingTypeSelectorWidget';
import { buildFloorTypeSelectorWidget } from './FloorTypeSelectorWidget';
// §FEAT-CURTAIN-WALL-CREATE-TYPE (L-964) — the creation panel reads the SAME
// registry declaration the property panel does, so it can never list a different
// set of types than the one a selected wall offers.
import { buildGenericTypeSelectorWidget } from './GenericTypeSelectorWidget';
import { resolveElementTypeCatalog } from './ElementTypeCatalogRegistry';
import { curtainWallTypeStore, resolveCurtainWallTypeFields } from '@pryzm/core-app-model';
import { doorSystemTypeStore } from '@pryzm/geometry-door';
import { windowSystemTypeStore } from '@pryzm/geometry-window';
// §FEAT-HOSTED-TYPE-AUTHORING (C65) — shared Duplicate/New machinery for the
// door/window pre-draw pickers (same entries the property-panel widgets render).
import {
    appendTypeAuthoringOptions,
    handleFinishTypeAuthoring,
    DUPLICATE_TYPE_OPTION,
    NEW_TYPE_OPTION,
    type ReadableTypeStore,
} from './FinishTypeAuthoringActions';
import { plumbingSystemTypeStore, TOILET_VARIANT_LABELS, SHOWER_VARIANT_LABELS } from '@pryzm/geometry-plumbing';
import type { ToiletVariant } from '@pryzm/geometry-plumbing';
import type { ShowerVariant } from '@pryzm/geometry-plumbing';

/**
 * Minimal interface that PropertyPanel exposes to the pre-draw renderers.
 * Keeps coupling explicit and testable.
 */
export interface PreDrawPanelHost {
    readonly element: HTMLDivElement;
    /** Resets panel state and clears innerHTML + injects CSS. */
    clearForPreDraw(elementType: string): void;
    buildCloseBtn(): HTMLButtonElement;
    makeVisible(): void;
    /** Positions panel beside the mode bar (wall/door/window/plumbing pre-draw). */
    positionBesideModeBar(): void;
}

// ── Internal helper ────────────────────────────────────────────────────────────

function buildOpeningTypeSelector(
    labelText: string,
    defaultText: string,
    allTypes: Array<{ id: string; name: string; category?: string }>,
    currentTypeId: string,
    onApply: (systemTypeId: string | null) => void,
    // §FEAT-HOSTED-TYPE-AUTHORING (C65) — when given, the picker also offers the
    // "Duplicate Type… / New Type…" entries (rendered ONLY if the family declares
    // authoring in ElementTypeAuthoringRegistry). This is the violet pre-draw
    // panel the founder screenshotted with a FIXED list — parity with wall.
    authoringOpts?: { family: string; store: ReadableTypeStore },
): HTMLElement {
    const outer = document.createElement('div');
    outer.className = 'wts-outer';

    const labelEl = document.createElement('div');
    labelEl.className = 'wts-label';
    labelEl.textContent = labelText;
    outer.appendChild(labelEl);

    const row = document.createElement('div');
    row.className = 'wts-row';

    const sel = document.createElement('select');
    sel.className = 'wts-select';

    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = defaultText;
    noneOpt.className = 'wts-opt-dark';
    sel.appendChild(noneOpt);

    for (const t of allTypes) {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.category ? `${t.name}  (${t.category})` : t.name;
        opt.className = 'wts-opt-dark';
        sel.appendChild(opt);
    }
    sel.value = currentTypeId ?? '';

    if (authoringOpts) {
        const authoring = appendTypeAuthoringOptions(sel, authoringOpts.family, allTypes.length > 0);
        if (authoring) {
            // Duplicate copies the type the user last BROWSED TO in this dropdown
            // (there is no placed element yet to read a type from).
            let lastRealSelection = currentTypeId ?? '';
            sel.addEventListener('change', () => {
                const v = sel.value;
                if (v !== DUPLICATE_TYPE_OPTION && v !== NEW_TYPE_OPTION) {
                    lastRealSelection = v;
                    return;
                }
                // Opening the editor must not look like a selection; Cancel restores.
                sel.value = lastRealSelection;
                handleFinishTypeAuthoring({
                    mode: v === NEW_TYPE_OPTION ? 'create' : 'duplicate',
                    family: authoringOpts.family,
                    store: authoringOpts.store,
                    currentTypeId: lastRealSelection || undefined,
                    onCreated: (created) => {
                        // Self-refresh: the new type becomes selectable and selected;
                        // the user then Applies it to the tool explicitly.
                        const opt = document.createElement('option');
                        opt.value = created.id;
                        opt.textContent = created.name;
                        opt.className = 'wts-opt-dark';
                        sel.insertBefore(opt, sel.querySelector('.wts-opt-sep'));
                        sel.value = created.id;
                        lastRealSelection = created.id;
                    },
                });
            });
        }
    }

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.className = 'wts-apply-btn';
    applyBtn.addEventListener('click', () => {
        if (sel.value.startsWith('__')) return;
        onApply(sel.value || null);
        applyBtn.textContent = '✓ Applied';
        setTimeout(() => {
            applyBtn.textContent = 'Apply';
        }, 1400);
    });

    row.appendChild(sel);
    row.appendChild(applyBtn);
    outer.appendChild(row);
    return outer;
}

// ── Pre-draw renderers ─────────────────────────────────────────────────────────

export function showWallPreDraw(host: PreDrawPanelHost, wallTool: any): void {
    host.clearForPreDraw('wall');

    const header = document.createElement('div');
    header.className = 'gpp-header';

    const badge = document.createElement('div');
    badge.className = 'gpp-type-badge';
    badge.textContent = 'NEW WALL';
    header.appendChild(badge);

    // §FIX-PLAN-WALLTOOL-DEFAULT-ACTIVE (L-28): the plan-view wall handler is already
    // armed the instant the tool activates — its onClick sets the first point
    // UNCONDITIONALLY and commits with the current type (default undefined = Plain Wall,
    // thickness 0.2), exactly like 3D. The panel copy used to read "Select Wall Type" +
    // "Choose a type, then click on the canvas to draw" with a prominent Apply button,
    // which made the founder believe an Apply click was REQUIRED before drawing (the
    // 3D↔plan asymmetry reported in L-28). The tool never gated on Apply; only the copy
    // did. So the title/hint now say the tool is ready to draw and the type picker is
    // OPTIONAL. Nothing about wall creation semantics or the draw handler changes.
    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:13px;font-weight:700;color:#fff;margin-bottom:4px;';
    titleEl.textContent = 'Draw Wall';
    header.appendChild(titleEl);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.85);margin-bottom:8px;';
    header.appendChild(hint);

    // §WALL-TYPE-PLAN-FIX: resolve the canonical wall tool — the instance the plan
    // WallPlanToolHandler reads at commit (window.wallTool.getSystemTypeId()). The
    // passed `wallTool` arg can be a null/stale reference in some layout paths, so a
    // setSystemTypeId() on it silently no-ops and plan-drawn walls stay on the default.
    const canonicalWallTool = (window as { wallTool?: any }).wallTool ?? wallTool;
    const currentTypeId: string = canonicalWallTool?.getSystemTypeId?.() ?? '';

    // §FIX-PLAN-WALL-TYPE-ARM-ON-SELECT (L-115) — the WALL TYPE dropdown is the SINGLE source
    // of truth for the ARMED wall type. Selecting a type ARMS it IMMEDIATELY (no separate
    // Apply click): it writes BOTH the transient `window.wallTool` selection (read by the 3-D
    // builder) AND the stable, surface-independent `activeWallSystemType` store (read by the
    // plan handler at dispatch — L-98), and updates the "ready" label to the SELECTED type.
    // So the panel can NEVER say "Plain Wall ready" while a layered type is chosen — the
    // recurring "plan plain / 3-D layered" bug: the founder picked "Interior – Partition" in
    // the dropdown, the label still said "Plain Wall ready", drew → a PLAIN wall dispatching
    // `systemTypeId=none`. Apply still works (idempotent), but SELECTION alone arms.
    // Folds in the L-28 pre-apply (seed on open) + L-98 store write. ADR-0055; C16.
    const armWallType = (rawId: string | undefined): void => {
        const id = rawId && !rawId.startsWith('__') ? (rawId || undefined) : undefined;
        canonicalWallTool?.setSystemTypeId?.(id);
        setActiveWallSystemTypeId(id);
        const name = id
            ? ((window as { wallSystemTypeStore?: { getById?: (i: string) => { name?: string } | undefined } })
                .wallSystemTypeStore?.getById?.(id)?.name ?? 'Type')
            : null;
        hint.textContent = name
            ? `✓ ${name} ready — click on canvas to draw`
            : '✓ Plain Wall ready — click on canvas to draw. Change type below (optional).';
        hint.style.color = 'rgba(255,255,255,0.85)';
    };

    // Seed the armed type + label from the current selection: a pre-selected layered type is
    // armed on open (label reflects it); default → Plain Wall.
    armWallType(currentTypeId || undefined);

    const pseudoData = { elementType: 'wall', systemTypeId: currentTypeId };

    // The Apply button (and the widget's own applyOnChange) route here → arm.
    const typeWidget = buildWallTypeSelectorWidget(pseudoData, (payload) => {
        armWallType(payload.systemTypeId ?? undefined);
    }, { applyOnChange: true });

    if (typeWidget) {
        header.appendChild(typeWidget);
        // §FIX-PLAN-WALL-TYPE-ARM-ON-SELECT (L-115) — bind a DIRECT change listener on the
        // dropdown so a selection arms the type even if the widget's internal applyOnChange
        // path is ever unwired: dropdown-select is THE single source of truth for the armed
        // type, independent of the (optional) Apply button.
        const sel = typeWidget.querySelector('select');
        if (sel) sel.addEventListener('change', () => armWallType((sel as HTMLSelectElement).value));
    }

    const escNote = document.createElement('div');
    escNote.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.35);margin-top:6px;';
    escNote.textContent = 'Press Esc to cancel';
    header.appendChild(escNote);

    header.appendChild(host.buildCloseBtn());
    host.element.appendChild(header);
    host.makeVisible();
    host.positionBesideModeBar();

    // §FIX-PLAN-WALLTOOL-ARM-ON-ACTIVATE (L-66): the "Draw Wall" panel being visible
    // must IMPLY the plan-view draw handler is armed. L-28 fixed the handler + this
    // panel's COPY, but arming still depended on the async ToolManager.activateWall →
    // notify → subscribe → _activateHandler chain (and the pane not being paused)
    // finishing before the user's first click; until it had, the click was dropped and
    // users learned to press "Apply" first (turning an OPTIONAL change-type control into
    // the de-facto arm trigger — the reported parity break vs 3D, which arms
    // synchronously in WallTool.activate). Asserting the invariant here makes the very
    // first canvas click draw with the current/default (Plain Wall) type, and the
    // wall-type dropdown "Apply" only ever CHANGES the active type. Both calls are
    // idempotent + best-effort: each no-ops when its overlay is not attached / is paused
    // / is already armed, and the toolManager subscribe path remains the primary arm.
    try {
        (window as { planViewToolOverlay?: { ensureWallDrawArmed?: () => void } })
            .planViewToolOverlay?.ensureWallDrawArmed?.();
        (window as { svpPlanToolOverlay?: { ensureWallDrawArmed?: () => void } })
            .svpPlanToolOverlay?.ensureWallDrawArmed?.();
    } catch { /* arming is best-effort; toolManager subscribe remains the primary arm */ }
}

export function showSlabPreDraw(host: PreDrawPanelHost, slabTool: any): void {
    host.clearForPreDraw('slab');

    const header = document.createElement('div');
    header.className = 'gpp-header';

    const badge = document.createElement('div');
    badge.className = 'gpp-type-badge';
    badge.textContent = 'NEW SLAB';
    header.appendChild(badge);

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:13px;font-weight:700;color:#fff;margin-bottom:4px;';
    titleEl.textContent = 'Select Slab Type';
    header.appendChild(titleEl);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.55);margin-bottom:8px;';
    if (slabTool?.getSystemTypeId?.()) {
        hint.textContent = '✓ Type set — draw the slab on canvas';
        hint.style.color = 'rgba(255,255,255,0.85)';
    } else {
        hint.textContent = 'Choose a type, then draw the slab on canvas.';
    }
    header.appendChild(hint);

    const currentTypeId: string = slabTool?.getSystemTypeId?.() ?? '';
    const pseudoData = { elementType: 'slab', systemTypeId: currentTypeId };

    const typeWidget = buildSlabTypeSelectorWidget(pseudoData, (payload) => {
        slabTool?.setSystemTypeId?.(payload.systemTypeId ?? undefined);
        hint.textContent = payload.systemTypeId
            ? `✓ Type set — draw the slab on canvas`
            : `✓ Plain Slab — draw the slab on canvas`;
        hint.style.color = 'rgba(255,255,255,0.85)';
    });

    if (typeWidget) header.appendChild(typeWidget);

    const escNote = document.createElement('div');
    escNote.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.35);margin-top:6px;';
    escNote.textContent = 'Press Esc to cancel';
    header.appendChild(escNote);

    header.appendChild(host.buildCloseBtn());
    host.element.appendChild(header);
    host.makeVisible();
}

export function showDoorPreDraw(host: PreDrawPanelHost, doorTool: any): void {
    host.clearForPreDraw('door');

    const header = document.createElement('div');
    header.className = 'gpp-header';

    const badge = document.createElement('div');
    badge.className = 'gpp-type-badge';
    badge.textContent = 'NEW DOOR';
    header.appendChild(badge);

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:13px;font-weight:700;color:#fff;margin-bottom:4px;';
    titleEl.textContent = 'Select Door Type';
    header.appendChild(titleEl);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.55);margin-bottom:8px;';
    if (doorTool?.systemTypeId) {
        hint.textContent = '✓ Type set — click on a wall to place';
        hint.style.color = 'rgba(255,255,255,0.85)';
    } else {
        hint.textContent = 'Choose a type, then click on a wall to place.';
    }
    header.appendChild(hint);

    const typeWidget = buildOpeningTypeSelector(
        'Door Type',
        '— Default Door —',
        doorSystemTypeStore.getAll(),
        doorTool?.systemTypeId ?? '',
        (systemTypeId) => {
            if (doorTool) doorTool.systemTypeId = systemTypeId || undefined;
            hint.textContent = systemTypeId
                ? '✓ Type set — click on a wall to place'
                : '✓ Default Door — click on a wall to place';
            hint.style.color = 'rgba(255,255,255,0.85)';
        },
        { family: 'door', store: doorSystemTypeStore as ReadableTypeStore },
    );
    header.appendChild(typeWidget);

    const escNote = document.createElement('div');
    escNote.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.35);margin-top:6px;';
    escNote.textContent = 'Press Esc to cancel';
    header.appendChild(escNote);

    header.appendChild(host.buildCloseBtn());
    host.element.appendChild(header);
    host.makeVisible();
    host.positionBesideModeBar();
}

/**
 * Pre-draw panel for plumbing fixtures (toilet / sink / bath / urinal / bidet).
 *
 * Mirrors the standardized "NEW WALL / NEW DOOR / NEW WINDOW" pattern
 * (Contracts 05-PLATFORM-UI §3 + 06-UI-ARCHITECTURE + 39 §2):
 *   • Family-aware badge title.
 *   • Variant dropdown sourced from `plumbingSystemTypeStore.getByFamily()`
 *     so type-as-data parity is preserved.
 *   • Apply changes immediately via `setFixtureType()` / `setToiletVariant()`
 *     so the live preview rebuilds without re-activating the tool.
 */
export function showPlumbingPreDraw(host: PreDrawPanelHost, plumbingTool: any): void {
    if (!plumbingTool) return;

    const family = (plumbingTool.fixtureType ?? window._pryzmActivePlumbingType ?? 'toilet') as string; // TODO(E.plumbing.X): legacy _pryzmActivePlumbingType — replace with runtime.tools.plumbing active-fixture state
    const familyLabel = family.charAt(0).toUpperCase() + family.slice(1);

    host.clearForPreDraw('plumbing');

    const header = document.createElement('div');
    header.className = 'gpp-header';

    const badge = document.createElement('div');
    badge.className = 'gpp-type-badge';
    badge.textContent = `NEW ${family.toUpperCase()}`;
    header.appendChild(badge);

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:13px;font-weight:700;color:#fff;margin-bottom:4px;';
    titleEl.textContent = `Select ${familyLabel} Type`;
    header.appendChild(titleEl);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.55);margin-bottom:8px;';
    hint.textContent = family === 'bath'
        ? 'Choose a type, then click two points on canvas to draw.'
        : 'Choose a type, then click on a wall to place.';
    header.appendChild(hint);

    const variants = plumbingSystemTypeStore.getByFamily(family);
    if (variants.length > 0) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:6px;';

        const label = document.createElement('label');
        label.style.cssText = 'font-size:9px;font-weight:600;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.06em;';
        label.textContent = `${familyLabel} Type`;
        wrapper.appendChild(label);

        const sel = document.createElement('select');
        sel.style.cssText = 'padding:6px 8px;background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.18);border-radius:6px;font-family:inherit;font-size:12px;outline:none;';

        const currentVariant: string | undefined =
            family === 'toilet'
                ? (plumbingTool.toiletVariant ?? window._pryzmActiveToiletVariant) // TODO(E.plumbing.X): legacy _pryzmActiveToiletVariant — replace with runtime.tools.plumbing active-toilet-variant state
                : family === 'shower'
                    ? (plumbingTool.showerVariant ?? window._pryzmActiveShowerVariant) // TODO(E.plumbing.X): legacy _pryzmActiveShowerVariant — replace with runtime.tools.plumbing active-shower-variant state
                    : undefined;
        variants.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.variant;
            opt.textContent = v.name;
            opt.style.color = '#000';
            if (currentVariant && v.variant === currentVariant) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.addEventListener('change', () => {
            if (family === 'toilet' && typeof plumbingTool.setToiletVariant === 'function') {
                plumbingTool.setToiletVariant(sel.value as ToiletVariant);
            }
            if (family === 'shower' && typeof plumbingTool.setShowerVariant === 'function') {
                plumbingTool.setShowerVariant(sel.value as ShowerVariant);
            }
            const variantLabel =
                family === 'toilet'
                    ? (TOILET_VARIANT_LABELS[sel.value as ToiletVariant] ?? sel.options[sel.selectedIndex]?.text ?? '')
                    : family === 'shower'
                        ? (SHOWER_VARIANT_LABELS[sel.value as ShowerVariant] ?? sel.options[sel.selectedIndex]?.text ?? '')
                        : (sel.options[sel.selectedIndex]?.text ?? '');
            hint.textContent = `✓ ${variantLabel} — ${family === 'bath' ? 'click two points to draw' : 'click on a wall to place'}`;
            hint.style.color = 'rgba(255,255,255,0.85)';
        });
        wrapper.appendChild(sel);
        header.appendChild(wrapper);
    }

    const escNote = document.createElement('div');
    escNote.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.35);margin-top:6px;';
    escNote.textContent = 'Press Esc to cancel';
    header.appendChild(escNote);

    header.appendChild(host.buildCloseBtn());
    host.element.appendChild(header);
    host.makeVisible();
    host.positionBesideModeBar();
}

export function showWindowPreDraw(host: PreDrawPanelHost, windowTool: any): void {
    host.clearForPreDraw('window');

    const header = document.createElement('div');
    header.className = 'gpp-header';

    const badge = document.createElement('div');
    badge.className = 'gpp-type-badge';
    badge.textContent = 'NEW WINDOW';
    header.appendChild(badge);

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:13px;font-weight:700;color:#fff;margin-bottom:4px;';
    titleEl.textContent = 'Select Window Type';
    header.appendChild(titleEl);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.55);margin-bottom:8px;';
    if (windowTool?.systemTypeId) {
        hint.textContent = '✓ Type set — click on a wall to place';
        hint.style.color = 'rgba(255,255,255,0.85)';
    } else {
        hint.textContent = 'Choose a type, then click on a wall to place.';
    }
    header.appendChild(hint);

    const typeWidget = buildOpeningTypeSelector(
        'Window Type',
        '— Default Window —',
        windowSystemTypeStore.getAll(),
        windowTool?.systemTypeId ?? '',
        (systemTypeId) => {
            if (windowTool) windowTool.systemTypeId = systemTypeId || undefined;
            hint.textContent = systemTypeId
                ? '✓ Type set — click on a wall to place'
                : '✓ Default Window — click on a wall to place';
            hint.style.color = 'rgba(255,255,255,0.85)';
        },
        { family: 'window', store: windowSystemTypeStore as ReadableTypeStore },
    );
    header.appendChild(typeWidget);

    const escNote = document.createElement('div');
    escNote.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.35);margin-top:6px;';
    escNote.textContent = 'Press Esc to cancel';
    header.appendChild(escNote);

    header.appendChild(host.buildCloseBtn());
    host.element.appendChild(header);
    host.makeVisible();
    host.positionBesideModeBar();
}

/**
 * Shows the panel in "pre-draw" mode when the ceiling creation tool is activated.
 * Lets the user pick a ceiling system type before drawing the first point.
 * Calls ceilingTool.setSystemTypeId() when the user clicks Apply — no element
 * is selected yet so no store mutation / command is needed here.
 */
export function showCeilingPreDraw(host: PreDrawPanelHost, ceilingTool: any): void {
    host.clearForPreDraw('ceiling');

    const header = document.createElement('div');
    header.className = 'gpp-header';

    const badge = document.createElement('div');
    badge.className = 'gpp-type-badge';
    badge.textContent = 'NEW CEILING';
    header.appendChild(badge);

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:13px;font-weight:700;color:#fff;margin-bottom:4px;';
    titleEl.textContent = 'Select Ceiling Type';
    header.appendChild(titleEl);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.55);margin-bottom:8px;';
    hint.textContent = 'Choose a type, then draw the ceiling on canvas.';
    header.appendChild(hint);

    const currentTypeId: string = ceilingTool?.getSystemTypeId?.() ?? '';
    const pseudoData = { elementType: 'ceiling', systemTypeId: currentTypeId };

    const typeWidget = buildCeilingTypeSelectorWidget(pseudoData, (payload) => {
        ceilingTool?.setSystemTypeId?.(payload.systemTypeId ?? undefined);
        hint.textContent = payload.systemTypeId
            ? `✓ Type set — draw the ceiling on canvas`
            : `✓ Plain Ceiling — draw the ceiling on canvas`;
        hint.style.color = 'rgba(255,255,255,0.85)';
    });

    if (typeWidget) header.appendChild(typeWidget);

    const escNote = document.createElement('div');
    escNote.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.35);margin-top:6px;';
    escNote.textContent = 'Press Esc to cancel';
    header.appendChild(escNote);

    header.appendChild(host.buildCloseBtn());
    host.element.appendChild(header);
    host.makeVisible();
}

/**
 * Shows the panel in "pre-draw" mode when the floor creation tool is activated.
 * Lets the user pick a floor system type before drawing the first point.
 * Calls floorTool.setSystemTypeId() when the user clicks Apply — no element
 * is selected yet so no store mutation / command is needed here.
 */
export function showFloorPreDraw(host: PreDrawPanelHost, floorTool: any): void {
    host.clearForPreDraw('floor');

    const header = document.createElement('div');
    header.className = 'gpp-header';

    const badge = document.createElement('div');
    badge.className = 'gpp-type-badge';
    badge.textContent = 'NEW FLOOR';
    header.appendChild(badge);

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:13px;font-weight:700;color:#fff;margin-bottom:4px;';
    titleEl.textContent = 'Select Floor Type';
    header.appendChild(titleEl);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.55);margin-bottom:8px;';
    hint.textContent = 'Choose a type, then draw the floor on canvas.';
    header.appendChild(hint);

    const currentTypeId: string = floorTool?.getSystemTypeId?.() ?? '';
    const pseudoData = { elementType: 'floor', systemTypeId: currentTypeId };

    const typeWidget = buildFloorTypeSelectorWidget(pseudoData, (payload) => {
        floorTool?.setSystemTypeId?.(payload.systemTypeId ?? undefined);
        hint.textContent = payload.systemTypeId
            ? `✓ Type set — draw the floor on canvas`
            : `✓ Plain Floor — draw the floor on canvas`;
        hint.style.color = 'rgba(255,255,255,0.85)';
    });

    if (typeWidget) header.appendChild(typeWidget);

    const escNote = document.createElement('div');
    escNote.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.35);margin-top:6px;';
    escNote.textContent = 'Press Esc to cancel';
    header.appendChild(escNote);

    header.appendChild(host.buildCloseBtn());
    host.element.appendChild(header);
    host.makeVisible();
}

/**
 * Shows the panel in "pre-draw" mode when the curtain wall creation tool is activated.
 * Lets the user configure height, spacing, and mullion size before placing points.
 * Calls curtainWallTool.setPredrawConfig() when any field changes — no element
 * exists yet so no store mutation / command is needed here.
 *
 * Contract: §01 §1.1 — UI Tool Layer only, no command dispatch needed for pre-draw config.
 */
export function showCurtainWallPreDraw(host: PreDrawPanelHost, curtainWallTool: any): void {
    host.clearForPreDraw('curtainwall');

    const header = document.createElement('div');
    header.className = 'gpp-header';

    const badge = document.createElement('div');
    badge.className = 'gpp-type-badge';
    badge.textContent = 'NEW CURTAIN WALL';
    header.appendChild(badge);

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:13px;font-weight:700;color:#fff;margin-bottom:4px;';
    titleEl.textContent = 'Curtain Wall Settings';
    header.appendChild(titleEl);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.55);margin-bottom:10px;';
    hint.textContent = 'Set options, then click two points on the canvas.';
    header.appendChild(hint);

    const cfg = curtainWallTool?.getPredrawConfig?.() ?? {};
    let height:    number = cfg.height    ?? 3;
    let uSpacing:  number = cfg.uSpacing  ?? 1.5;
    let vSpacing:  number = cfg.vSpacing  ?? 1.0;
    let mullion:   number = cfg.mullionSize ?? 0.05;
    // §FEAT-CURTAIN-WALL-CREATE-TYPE (L-964) — the armed type and the finish it resolves to.
    let armedTypeId: string | undefined = cfg.systemTypeId;
    let armedFinish: Record<string, unknown> = {};

    let uField: HTMLElement | undefined;
    let vField: HTMLElement | undefined;
    let mField: HTMLElement | undefined;

    function pushConfig(): void {
        curtainWallTool?.setPredrawConfig?.({
            height, uSpacing, vSpacing, mullionSize: mullion,
            systemTypeId: armedTypeId,
            ...armedFinish,
        });
    }

    /** Push the resolved numbers back into the demoted inputs. */
    function syncFieldInputs(): void {
        const set = (el: HTMLElement | undefined, v: number): void => {
            const inp = el?.querySelector('input');
            if (inp) (inp as HTMLInputElement).value = String(v);
        };
        set(uField, uSpacing);
        set(vField, vSpacing);
        set(mField, mullion);
    }

    // ── §FEAT-CURTAIN-WALL-CREATE-TYPE (L-964) — arm a published type ────────
    //
    // The founder's report: the WALL creation panel offers a type dropdown and this one
    // asked for four raw numbers. The types already existed (L-958), so this is the last
    // mile — and the numbers this form was asking for are exactly what a type carries.
    //
    // ⛔ THE LIST IS NOT DUPLICATED. It comes from the SAME `ElementTypeCatalogRegistry`
    // declaration the property panel renders, which reads `CurtainWallTypeStore`. A
    // hand-copied list here would be a second enumeration of one fact (C84 EI-9) and would
    // silently omit every type published later — invisible until someone asked why a type
    // they can see when a wall is SELECTED is missing when they go to DRAW one.
    //
    // HEIGHT IS NOT A TYPE PROPERTY. A published type is height-agnostic:
    // `transomCourse: undefined` means "top and bottom rails only", and the V spacing that
    // expresses it depends on the wall's own height, because `migrateToGridSystem` computes
    // numV = max(1, floor(height / vSpacing)). So the type is re-resolved when HEIGHT
    // changes as well as when the TYPE changes — otherwise picking a type at 3 m and then
    // typing 6 m would lay a transom across a facade that asked for none.
    const armType = (rawId: string | undefined): void => {
        const id = rawId && !rawId.startsWith('__') ? (rawId || undefined) : undefined;
        armedTypeId = id;
        const def = id ? curtainWallTypeStore.getById(id) : undefined;

        if (def) {
            const fields = resolveCurtainWallTypeFields(def, height) as Record<string, unknown>;
            uSpacing = fields.gridXSpacing as number;
            vSpacing = fields.gridYSpacing as number;
            mullion  = fields.mullionSize as number;
            armedFinish = {
                panelThickness:    fields.panelThickness,
                mullionMaterialId: fields.mullionMaterialId,
                mullionColor:      fields.mullionColor,
                glazingMaterialId: fields.glazingMaterialId,
            };
            hint.textContent = `✓ ${def.name} ready — click two points on the canvas.`;
        } else {
            armedFinish = {};
            hint.textContent =
                '✓ Plain Curtain Wall ready — click two points on the canvas. Change type below (optional).';
        }
        hint.style.color = 'rgba(255,255,255,0.85)';
        // Keep the demoted fields showing what the wall will actually be built with. A
        // stale readout here is the "panel says one thing, model does another" defect in
        // miniature.
        syncFieldInputs();
        pushConfig();
    };

    function makeField(labelText: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'cw-predraw-field';

        const lbl = document.createElement('div');
        lbl.className = 'cw-predraw-label';
        lbl.textContent = labelText;
        wrap.appendChild(lbl);

        const inp = document.createElement('input');
        inp.type = 'number';
        inp.className = 'cw-predraw-input';
        inp.min = String(min);
        inp.max = String(max);
        inp.step = String(step);
        inp.value = String(value);
        inp.addEventListener('change', () => {
            const v = parseFloat(inp.value);
            if (!isNaN(v) && v >= min && v <= max) {
                onChange(v);
                pushConfig();
            }
        });
        wrap.appendChild(inp);

        return wrap;
    }

    // ── The TYPE picker, first — it is the primary control now ──────────────
    const cwCatalog = resolveElementTypeCatalog('curtainwall');
    const typeWidget = cwCatalog
        ? buildGenericTypeSelectorWidget(
            cwCatalog,
            { elementType: 'curtainwall', systemTypeId: armedTypeId ?? '' },
            (payload) => armType(payload.typeId || undefined),
        )
        : null;
    if (typeWidget) {
        header.appendChild(typeWidget);
        // §FIX-PLAN-WALL-TYPE-ARM-ON-SELECT (L-115), same reasoning as the wall panel:
        // SELECTION alone arms the type. Requiring an Apply click is how a panel comes to
        // say "Plain ready" while a type is visibly chosen in the dropdown.
        const sel = typeWidget.querySelector('select');
        if (sel) sel.addEventListener('change', () => armType((sel as HTMLSelectElement).value));
    }

    // ── The raw parameters, DEMOTED but not removed ─────────────────────────
    // The founder asked for a type panel, not for the numbers to disappear. HEIGHT is an
    // INSTANCE property and stays first-class; the other three are what a type sets, so
    // they move below a divider as overrides for the plain / fine-tuning case.
    header.appendChild(makeField('Height (m)', height, 0.5, 50, 0.1, v => {
        height = v;
        // Re-resolve: a height-agnostic type's V spacing follows the wall's height.
        if (armedTypeId) armType(armedTypeId);
        else pushConfig();
    }));

    const advLabel = document.createElement('div');
    advLabel.style.cssText =
        'font-size:9px;letter-spacing:0.05em;text-transform:uppercase;' +
        'color:rgba(255,255,255,0.35);margin:10px 0 4px;';
    advLabel.textContent = 'Grid & mullion';
    header.appendChild(advLabel);

    uField = makeField('Grid Spacing U (m)',  uSpacing, 0.1,  10, 0.1,  v => { uSpacing = v; });
    vField = makeField('Grid Spacing V (m)',  vSpacing, 0.1,  10, 0.1,  v => { vSpacing = v; });
    mField = makeField('Mullion Size (m)',    mullion,  0.01, 0.5, 0.01, v => { mullion  = v; });
    header.appendChild(uField);
    header.appendChild(vField);
    header.appendChild(mField);

    // Seed the armed type + label exactly as the wall panel does: a pre-selected type is
    // armed on open, otherwise the panel says Plain and the user can draw IMMEDIATELY
    // without touching the dropdown. That default-to-drawable behaviour is the parity the
    // founder asked for — not merely the presence of a widget.
    armType(armedTypeId);

    const escNote = document.createElement('div');
    escNote.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.35);margin-top:6px;';
    escNote.textContent = 'Press Esc to cancel';
    header.appendChild(escNote);

    header.appendChild(host.buildCloseBtn());
    host.element.appendChild(header);
    host.makeVisible();
}


/**
 * showHandrailPreDraw — §FEAT-HANDRAIL-CREATION-PARITY (founder, 2026-08-18).
 *
 * THE FOUNDER, in substance: *"once the user clicks it should have the same UI/UX
 * as the wall's authoring panel. The user could select from a number of railings
 * (please create 20 types)."*
 *
 * This is `showWallPreDraw`, structurally: same `gpp-header` shell, same
 * `gpp-type-badge`, same "ready — click on canvas to draw" hint that names the
 * ARMED type, same `wts-*` dropdown, same Esc note, same
 * `positionBesideModeBar()` so it sits beside the `DrawingModeBar` exactly as the
 * wall panel sits beside the wall bar.
 *
 * THREE THINGS ARE COPIED DELIBERATELY, EACH BECAUSE ITS ABSENCE WAS A LOGGED BUG:
 *
 *  1. **SELECTION ALONE ARMS** (§FIX-PLAN-WALL-TYPE-ARM-ON-SELECT, L-115). No
 *     separate Apply click. Requiring one is how a panel comes to say "Plain
 *     ready" while a type is visibly chosen in the dropdown, and the user then
 *     draws the wrong thing. The widget's Apply still works and is idempotent.
 *  2. **THE TOOL IS READY BEFORE ANY TYPE IS PICKED** (§FIX-PLAN-WALLTOOL-DEFAULT-ACTIVE,
 *     L-28). The hint says so. The railing handler's first click commits with the
 *     current/default type; the dropdown only ever CHANGES it.
 *  3. **THE ARMED TYPE LIVES IN A STORE, NOT IN THIS PANEL** (L-98). It is written
 *     to `activeHandrailAuthoring`, which both the plan handler and the 3-D tool
 *     read, so a type chosen here applies on whichever surface the user draws on.
 *
 * ⛔ THE LIST IS NOT DUPLICATED. It comes from `handrailTypeStore` via the SAME
 * `buildRailingTypeSelectorWidget` the property panel renders for a SELECTED
 * railing. A hand-copied list here would be a second enumeration of one fact and
 * would silently omit every type published later — invisible until someone asked
 * why a type they can see when a railing is selected is missing when they go to
 * draw one (C84 EI-9).
 */
export function showHandrailPreDraw(host: PreDrawPanelHost, handrailTool: unknown): void {
    host.clearForPreDraw('handrail');

    const header = document.createElement('div');
    header.className = 'gpp-header';

    const badge = document.createElement('div');
    badge.className = 'gpp-type-badge';
    badge.textContent = 'NEW HANDRAIL';
    header.appendChild(badge);

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:13px;font-weight:700;color:#fff;margin-bottom:4px;';
    titleEl.textContent = 'Draw Handrail';
    header.appendChild(titleEl);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.85);margin-bottom:8px;';
    header.appendChild(hint);

    /**
     * ARM the type: write the surface-independent store (which also forwards to
     * `window.handrailTool.setTypeId` for the 3-D builder, exactly as the wall
     * picker writes both `activeWallSystemType` and `window.wallTool`), and update
     * the readout to the SELECTED type so the panel can never say "Default ready"
     * while a catalogue type is chosen.
     */
    const armHandrailType = (rawId: string | undefined): void => {
        const id = rawId && !rawId.startsWith('__') ? (rawId || undefined) : undefined;
        setActiveHandrailTypeId(id);
        // Belt and braces for the layout paths where the passed tool reference is
        // the live one but the window global is not yet assigned.
        (handrailTool as { setTypeId?: (i: string | undefined) => void } | undefined)?.setTypeId?.(id);

        const def = id ? handrailTypeStore.getById(id) : undefined;
        hint.textContent = def
            ? `\u2713 ${def.name} ready \u2014 ${Math.round(def.height * 1000)} mm, ${def.fillType} infill. Click on canvas to draw.`
            : '\u2713 Default Handrail ready \u2014 click on canvas to draw. Change type below (optional).';
        hint.style.color = 'rgba(255,255,255,0.85)';
    };

    const currentTypeId = resolveActiveHandrailTypeId();

    // The widget resolves "current" by matching the record's materialised fields,
    // so the pseudo-element is seeded from the armed type's own fields rather than
    // from a `typeId` the family deliberately does not store.
    const armedDef = currentTypeId ? handrailTypeStore.getById(currentTypeId) : undefined;
    const pseudoData: Record<string, unknown> = {
        elementType: 'railing',
        height: armedDef?.height,
        fillType: armedDef?.fillType,
        railProfile: armedDef?.railProfile,
    };

    const typeWidget = buildRailingTypeSelectorWidget(pseudoData, (payload) => {
        armHandrailType(payload.typeId);
    });

    if (typeWidget) {
        header.appendChild(typeWidget);
        // L-115: the dropdown is THE single source of truth for the armed type, so
        // a plain SELECT arms it even if the widget's Apply path is ever unwired.
        const sel = typeWidget.querySelector('select');
        if (sel) {
            if (currentTypeId) (sel as HTMLSelectElement).value = currentTypeId;
            sel.addEventListener('change', () => armHandrailType((sel as HTMLSelectElement).value));
        }
    } else {
        // NOT a silent blank: say WHY there is no picker (C84 §CONTEXT-DATA-HONESTY —
        // "failure and emptiness are the same value" unless someone distinguishes them).
        const why = document.createElement('div');
        why.style.cssText = 'font-size:10px;color:rgba(255,200,120,0.9);margin-bottom:8px;';
        why.textContent =
            'No railing type picker \u2014 the catalogue offers fewer than two types, '
            + 'so there is nothing to choose between. Drawing still works with the defaults.';
        header.appendChild(why);
    }

    // Seed the armed type + label from the current selection, exactly as the wall
    // panel does: a pre-armed type shows in the label, otherwise the panel says
    // Default and the user can draw IMMEDIATELY without touching the dropdown.
    armHandrailType(currentTypeId);

    // §FIX-HANDRAIL-PANEL-ORDER (L-1104) — the mode LIST is deleted from this card.
    //
    // It named all seven modes and their accelerators and said "bar below". That was
    // both a second, rival statement of what `DrawingModeBar` already renders (C84
    // EI-9 — one question, two answers, and this copy rots the moment the creation
    // matrix changes) and a claim about LAYOUT that the fix falsifies: the bar is not
    // below, it is BESIDE, at the same top, which is the wall's arrangement the
    // founder asked for. The wall's card carries no such list. The bar is the one
    // authority for what the modes are.

    const escNote = document.createElement('div');
    escNote.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.35);margin-top:6px;';
    escNote.textContent = 'Press Esc to cancel';
    header.appendChild(escNote);

    header.appendChild(host.buildCloseBtn());
    host.element.appendChild(header);
    host.makeVisible();
    host.positionBesideModeBar();
}
