/**
 * D1 — DoorSection
 *
 * Builds a Property Panel section that exposes parametric door controls.
 * Each field dispatches UpdateDoorParameterCommand immediately on change —
 * no draft / Apply button pattern — so the 3D scene updates in real time.
 *
 * Contract compliance:
 *  - §03: All mutations flow through commands; never writes to store directly.
 *  - §05 UI: Pure DOM builder; no Three.js imports; no store writes.
 *  - dw- CSS prefix as specified in §D1 (§11-DOORS-WINDOWS-IMPLEMENTATION-PLAN.md).
 */

import { doorStore } from './DoorStore';
import { openingProfilesFor, OPENING_PROFILE_LABELS, SEGMENTAL_RISE_RATIO } from '@pryzm/geometry-wall';
import { DoorOpening } from './DoorTypes';
import { UpdateDoorParameterCommand } from '@pryzm/command-registry';
// §OPENING-FINISH-IS-A-REFERENCE (L-7700) — the private `makeMaterialSelect` that
// used to live in this file is now `buildFinishMaterialSelect`, shared with
// `WindowSection`. Door had library dropdowns and window had a free-text box for
// the same concept; two surfaces for one rule is how they drifted (C65 §3.5).
import { buildFinishMaterialSelect } from './FinishMaterialSelect';
import { appendDwGroup } from './DwPanelChrome';

/**
 * CSS is now managed by AppTheme.ts (DOOR_SECTION_STYLES in propertyInspector.ts).
 * No-op kept for API compatibility with WindowSection.ts.
 */
export function injectDwStyles(): void {}

/**
 * §DOOR-AUDIT-2026 (DI cleanup) — DoorSection accepts the CommandManager via
 * setDoorSectionCommandManager() instead of reading from window-global.
 * The bootstrap module wires this up; if not set we log loudly and abort the
 * mutation so the user sees the configuration error immediately.
 */
let _commandManager: { execute: (cmd: any) => any } | null = null;
export function setDoorSectionCommandManager(cm: { execute: (cmd: any) => any } | null): void {
    _commandManager = cm;
}

/**
 * ⭐ §FIX-PANEL-REFUSAL-SWALLOWED (L-10948) — RETURNS THE REFUSAL INSTEAD OF EATING IT.
 * The window twin of the same fix; see `WindowSection.dispatch` for the founder report that
 * produced it. Returns the reason on refusal, `null` on success — additive, so every caller
 * that ignores the return keeps its exact previous behaviour.
 */
function dispatch(doorId: string, patch: Partial<DoorOpening>): string | null {
    // §DOOR-AUDIT-2026: prefer injected reference; fall back to window during the
    // migration window so existing call sites keep working.
    const cmdMgr = _commandManager ?? window.commandManager; // TODO(TASK-06)
    if (!cmdMgr) {
        console.error('[DoorSection] commandManager not configured — call setDoorSectionCommandManager() at bootstrap');
        return 'The command manager is not available in this session, so nothing was changed.';
    }
    const current = doorStore.getById(doorId);
    if (!current) {
        console.warn('[DoorSection] Door not found in store:', doorId);
        return `This door is no longer in the model (${doorId}), so nothing was changed.`;
    }
    // NOTE: the previous-fields snapshot is now also captured by
    // UpdateDoorParameterCommand.execute() at execute-time (§DOOR-AUDIT-2026
    // P-EXEC-PREV) which makes the command robust to deferred/queued execution.
    // We still pass a snapshot here so the legacy single-tick path works without
    // an extra store read on the command side.
    const prevFields: Partial<DoorOpening> = {};
    for (const key of Object.keys(patch) as (keyof DoorOpening)[]) {
        (prevFields as any)[key] = current[key];
    }
    const cmd = new UpdateDoorParameterCommand(doorId, patch, prevFields);
    const result = cmdMgr.execute(cmd); // TODO(TASK-06)
    if (!result?.success) {
        console.warn('[DoorSection] UpdateDoorParameterCommand failed:', result?.info);
        // ⚠ UNREADABLE IS NOT REFUSED. No readable `info` means we were told nothing about
        // WHY; say that, rather than invent a reason (§CONTEXT-DATA-HONESTY).
        const stated = Array.isArray(result?.info) ? result.info.filter(Boolean).join(' ') : '';
        return stated.length > 0
            ? stated
            : 'That change was refused and no reason was given — nothing was changed, and nothing about the model is confirmed.';
    }
    return null;
}

function makeField(label: string, control: HTMLElement): HTMLElement {
    const row = document.createElement('div');
    row.className = 'dw-field';
    const lbl = document.createElement('div');
    lbl.className = 'dw-label';
    lbl.textContent = label;
    // §OPENING-PANEL-PARITY (L-7740) — labels wrap rather than elide; hover still
    // reveals the exact string at the narrowest panel width. Door and window get the
    // SAME treatment, because the two panels drifting is this lane's other finding.
    lbl.title = label;
    const wrap = document.createElement('div');
    wrap.className = 'dw-control';
    wrap.appendChild(control);
    row.appendChild(lbl);
    row.appendChild(wrap);
    return row;
}

function makeSelect(options: { value: string; label: string }[], current: string, onChange: (v: string) => void): HTMLSelectElement {
    const sel = document.createElement('select');
    sel.className = 'dw-select';
    for (const opt of options) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === current) o.selected = true;
        sel.appendChild(o);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
}

function makeColorPicker(current: string, onChange: (v: string) => void): HTMLInputElement {
    const inp = document.createElement('input');
    inp.type = 'color';
    inp.className = 'dw-color';
    inp.value = current;
    inp.addEventListener('input', () => onChange(inp.value));
    inp.addEventListener('change', () => onChange(inp.value));
    return inp;
}

function makeNumberInput(current: number, min: number, max: number, step: number, onChange: (v: number) => void): HTMLInputElement {
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.className = 'dw-number';
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.value = String(current);
    inp.addEventListener('change', () => {
        const v = parseFloat(inp.value);
        if (!isNaN(v) && v >= min && v <= max) onChange(v);
    });
    return inp;
}

function makeTextInput(current: string, onChange: (v: string) => void): HTMLInputElement {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'dw-text';
    inp.value = current;
    inp.addEventListener('change', () => onChange(inp.value.trim()));
    return inp;
}

function makeToggle(options: { value: string; label: string }[], current: string, onChange: (v: string) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'dw-toggle-row';
    const buttons: HTMLButtonElement[] = [];
    for (const opt of options) {
        const btn = document.createElement('button');
        btn.className = 'dw-toggle-btn' + (opt.value === current ? ' active' : '');
        btn.textContent = opt.label;
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            onChange(opt.value);
        });
        buttons.push(btn);
        row.appendChild(btn);
    }
    return row;
}

/**
 * Builds the door parameters section element.
 * Returns null if the door is not found in DoorStore.
 *
 * @param doorId  The Opening.elementId (== DoorOpening.id)
 */
export function buildDoorSection(doorId: string): HTMLElement | null {
    const door = doorStore.getById(doorId);
    if (!door) return null;

    injectDwStyles();

    const section = document.createElement('div');
    section.className = 'dw-section';

    const header = document.createElement('div');
    header.className = 'dw-section-header';

    const title = document.createElement('div');
    title.className = 'dw-section-title';
    title.textContent = 'Door Parameters';

    const toggle = document.createElement('div');
    toggle.className = 'dw-section-toggle';
    toggle.textContent = '▲';

    header.appendChild(title);
    header.appendChild(toggle);
    section.appendChild(header);

    const body = document.createElement('div');
    body.className = 'dw-section-body';

    header.addEventListener('click', () => {
        // §FIX-PROPERTIES-PANEL-POLISH — body is a CSS grid; restore to 'grid'.
        const collapsed = body.style.display === 'none';
        body.style.display = collapsed ? 'grid' : 'none';
        toggle.textContent = collapsed ? '▲' : '▼';
    });

    appendDwGroup(body, 'Dimensions');
    body.appendChild(makeField('Width (m)',
        makeNumberInput(door.width, 0.4, 4.0, 0.05, v => dispatch(doorId, { width: v }))
    ));

    body.appendChild(makeField('Height (m)',
        makeNumberInput(door.height, 1.6, 4.0, 0.05, v => dispatch(doorId, { height: v }))
    ));

    body.appendChild(makeField('Sill Height (m)',
        makeNumberInput(door.sillHeight, 0, 0.5, 0.01, v => dispatch(doorId, { sillHeight: v }))
    ));

    appendDwGroup(body, 'Type & Shape');
    body.appendChild(makeField('Door Type',
        makeSelect(
            [{ value: 'single', label: 'Single' }, { value: 'double', label: 'Double' }],
            door.doorType,
            v => dispatch(doorId, { doorType: v as 'single' | 'double' })
        )
    ));

    // §OPENING-PROFILE (L-1252) — the HEAD SHAPE of a door already placed, mirroring the window
    // panel. ⛔ THREE options, not four: `openingProfilesFor('door')` excludes `circular` because
    // a floor-reaching opening has no jambs for a circle to spring from (C84 EI-3 — do not offer
    // what the pipeline must refuse). A curved host is refused by `UpdateDoorParameterCommand`
    // with the reason and the live alternative.
    //
    // ⚠ The segmental rise (1/6 of the span) is printed in the option itself: it is a DECLARED
    // default with no authored source, and NOT MEASURED against an architect's expectation.
    //
    // ⭐⭐ §FIX-PANEL-REFUSAL-SWALLOWED (L-10948) — the reason is rendered, and the select is
    // PUT BACK to what the store holds. A dropdown left showing a head the model refused is the
    // panel asserting a shape the model does not have (C86 §11 #1, in the UI).
    const shapeNote = document.createElement('div');
    shapeNote.className = 'dw-label';
    shapeNote.style.cssText = 'grid-column:1/-1;opacity:0.85;font-size:11px;line-height:1.45;display:none;';
    const shapeSelect = makeSelect(
        openingProfilesFor('door').map(k => ({
            value: k,
            label: k === 'segmental-arch'
                ? `${OPENING_PROFILE_LABELS[k]} (rise 1/${Math.round(1 / SEGMENTAL_RISE_RATIO)} of width)`
                : OPENING_PROFILE_LABELS[k],
        })),
        (door as { openingProfile?: string }).openingProfile ?? 'rectangular',
        v => {
            const refusal = dispatch(doorId, { openingProfile: v as never });
            if (refusal === null) {
                shapeNote.textContent = '';
                shapeNote.style.display = 'none';
                return;
            }
            shapeNote.textContent = `⛔ ${refusal}`;
            shapeNote.style.display = '';
            shapeSelect.value =
                (doorStore.getById(doorId) as { openingProfile?: string } | undefined)?.openingProfile ?? 'rectangular';
        },
    );
    body.appendChild(makeField('Head Shape', shapeSelect));
    body.appendChild(shapeNote);

    appendDwGroup(body, 'Operation');
    body.appendChild(makeField('Hinges Side',
        makeToggle(
            [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }],
            door.hingesSide,
            v => dispatch(doorId, { hingesSide: v as 'left' | 'right' })
        )
    ));

    body.appendChild(makeField('Swing',
        makeToggle(
            [{ value: 'inward', label: 'Inward' }, { value: 'outward', label: 'Outward' }],
            door.swingDirection,
            v => dispatch(doorId, { swingDirection: v as 'inward' | 'outward' })
        )
    ));

    body.appendChild(makeField('Leaf Visible in Plan',
        makeToggle(
            [{ value: 'false', label: 'Hidden (symbol only)' }, { value: 'true', label: 'Visible' }],
            String(door.leafVisibleInPlan ?? false),
            v => dispatch(doorId, { leafVisibleInPlan: v === 'true' })
        )
    ));

    appendDwGroup(body, 'Members');
    body.appendChild(makeField('Leaf Thickness (m)',
        makeNumberInput(door.leafThickness ?? 0.04, 0.02, 0.12, 0.005, v => dispatch(doorId, { leafThickness: v }))
    ));

    body.appendChild(makeField('Frame Thickness (m)',
        makeNumberInput(door.frameThickness ?? 0.05, 0.01, 0.15, 0.005, v => dispatch(doorId, { frameThickness: v }))
    ));

    body.appendChild(makeField('Frame Depth (m)',
        makeNumberInput(door.frameDepth ?? 0.07, 0.03, 0.30, 0.005, v => dispatch(doorId, { frameDepth: v }))
    ));

    appendDwGroup(body, 'Appearance');
    body.appendChild(makeField('Frame Color',
        makeColorPicker(door.frameColor, v => dispatch(doorId, { frameColor: v }))
    ));

    body.appendChild(makeField('Leaf Color',
        makeColorPicker(door.leafColor, v => dispatch(doorId, { leafColor: v }))
    ));

    body.appendChild(makeField('Handle Height (m)',
        makeNumberInput(door.handleHeight, 0.8, 1.2, 0.01, v => dispatch(doorId, { handleHeight: v }))
    ));


    appendDwGroup(body, 'Finishes');
    // §OPENING-FINISH-IS-A-REFERENCE (L-7700) — `legacyName` is the half that was
    // missing. A door placed before openings referenced materials carries
    // `frameFinish.name === 'Steel Frame'` and no id; the old picker showed that as
    // "— select material —", making a user's real value and an unset slot the same
    // value on screen (C100 §5 / §CONTEXT-DATA-HONESTY). The string is now shown AS
    // a legacy value and is kept in the record until the user replaces it.
    body.appendChild(makeField('Frame Finish',
        buildFinishMaterialSelect({
            currentId:  door.frameFinish?.materialId,
            legacyName: door.frameFinish?.name,
            onChange: (id, color, label) => dispatch(doorId, {
                frameFinish: { name: label, materialId: id || undefined, materialColor: color },
            }),
        })
    ));

    body.appendChild(makeField('Leaf Finish',
        buildFinishMaterialSelect({
            currentId:  door.leafFinish?.materialId,
            legacyName: door.leafFinish?.name,
            onChange: (id, color, label) => dispatch(doorId, {
                leafFinish: { name: label, materialId: id || undefined, materialColor: color },
                // A door's schedule finish is its LEAF (CreateWallOpeningCommand :226).
                // The window's is its FRAME. Different by construction, not by drift.
                finishMaterial: label || undefined,
            }),
        })
    ));

    // ⭐ §OPENING-PANEL-PARITY (L-7745) — THE DOOR/WINDOW ASYMMETRY, STATED ON PURPOSE.
    //
    // The window panel carries a REVEAL & SPLAY group; this one does not, and that is
    // construction rather than an unfinished panel. A window's reveal is the splayed
    // return between the frame and the wall faces — a light-admitting detail with four
    // independently angled edges (§FEAT-WINDOW-REVEAL, L-1920). A door's opening is a
    // trafficked void: it has a lining and a threshold, not a splayed sill, and
    // `DoorOpening` carries no `revealSplay*` field to author.
    //
    // ⚠ Written here because the alternative is that the next reader compares the two
    // panels, finds a group missing, and "restores" it — shipping four controls that
    // write nothing. Two panels differing by accident and two panels differing on
    // purpose look identical from the outside; only a sentence tells them apart.
    appendDwGroup(body, 'Performance');
    // §OPENING-PANEL-PARITY (L-7743) — the honest empty box, IDENTICAL to the window's.
    // Measured the same way: schema `DoorTypes.ts:95`, persisted by the whole-record
    // spread at `ProjectSerializer.ts:1216`, and READ by `QuantityTakeoff.ts:741`
    // which counts rated vs unrated. Blank means UNSET, and unset is measured as
    // unrated — so the placeholder says that rather than leaving a silent gap.
    // ⚠ A door's designations differ from a window's (FD30/FD60 are door products),
    // so the list differs. The two panels are symmetric in SHAPE, not in vocabulary.
    const fireInput = makeTextInput(door.fireRating ?? '', v => dispatch(doorId, { fireRating: v || undefined }));
    fireInput.placeholder = 'Not set — counts as unrated';
    fireInput.title = 'Fire resistance designation, e.g. FD30, FD60, EI30. '
        + 'Left blank the opening is measured as UNRATED in the quantity take-off.';
    fireInput.setAttribute('list', 'dw-fire-ratings-door');
    const fireList = document.createElement('datalist');
    fireList.id = 'dw-fire-ratings-door';
    for (const r of ['FD30', 'FD60', 'FD90', 'EI30', 'EI60', 'E30']) {
        const o = document.createElement('option');
        o.value = r;
        fireList.appendChild(o);
    }
    const fireRow = makeField('Fire Rating', fireInput);
    fireRow.appendChild(fireList);
    body.appendChild(fireRow);

    section.appendChild(body);
    return section;
}
