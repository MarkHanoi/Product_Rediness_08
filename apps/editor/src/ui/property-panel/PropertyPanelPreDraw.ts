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
import { setActiveWallSystemTypeId } from '../../engine/views/plantools/activeWallSystemType';
import { buildSlabTypeSelectorWidget } from './SlabTypeSelectorWidget';
import { buildCeilingTypeSelectorWidget } from './CeilingTypeSelectorWidget';
import { buildFloorTypeSelectorWidget } from './FloorTypeSelectorWidget';
import { doorSystemTypeStore } from '@pryzm/geometry-door';
import { windowSystemTypeStore } from '@pryzm/geometry-window';
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
    onApply: (systemTypeId: string | null) => void
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

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.className = 'wts-apply-btn';
    applyBtn.addEventListener('click', () => {
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
        }
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
        }
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

    function pushConfig(): void {
        curtainWallTool?.setPredrawConfig?.({ height, uSpacing, vSpacing, mullionSize: mullion });
    }

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

    header.appendChild(makeField('Height (m)',          height,   0.5,  50, 0.1,  v => { height   = v; }));
    header.appendChild(makeField('Grid Spacing U (m)',  uSpacing, 0.1,  10, 0.1,  v => { uSpacing = v; }));
    header.appendChild(makeField('Grid Spacing V (m)',  vSpacing, 0.1,  10, 0.1,  v => { vSpacing = v; }));
    header.appendChild(makeField('Mullion Size (m)',    mullion,  0.01, 0.5, 0.01, v => { mullion  = v; }));

    pushConfig();

    const escNote = document.createElement('div');
    escNote.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.35);margin-top:6px;';
    escNote.textContent = 'Press Esc to cancel';
    header.appendChild(escNote);

    header.appendChild(host.buildCloseBtn());
    host.element.appendChild(header);
    host.makeVisible();
}
