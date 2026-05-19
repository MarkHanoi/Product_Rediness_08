/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Property Inspector
 * Phase:             Phase 8 (redesigned)
 * Files Modified:    src/ui/property-inspector/RoomPropertySection.ts
 * Classification:    A
 *
 * Contract:
 *   docs/01_ELEMENTS/09_Rooms_Contract/ROOM-IMPLEMENTATION-PLAN.md §8.1
 *   docs/00_Contracts/05-BIM-UI-ARCHITECTURE-CONTRACT.md
 *
 * Pure DOM factory — no class state. No direct store writes.
 * All mutations go through the legacy command manager.
 */

import { RoomData, RoomOccupancyType } from '@pryzm/room-topology';
import { RoomColourSystem, OCCUPANCY_PALETTE } from '@pryzm/room-topology';
import { RoomRelationshipService } from '@pryzm/room-topology';
import { resolveRoomFinishes } from '@pryzm/core-app-model';
import { worldModelAdapter } from '@pryzm/ai-host';

import {
    C, INPUT_S, LABEL_S,
    resetCardCounter,
    makeRow, makeReadonlyValue, makePrimaryBtn, makeGhostBtn, makeWideBtn,
    showFeedback, makeCard,
} from './RoomPropertySectionHelpers';

export function appendRoomPropertySection(
    content: HTMLElement,
    room: RoomData,
    roomStore: any,
    _commandManager: any,
    _onReinspect: (obj: any) => void,
    runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime appendRoomPropertySection */,
): void {
    resetCardCounter(); // reset per-panel counter

    content.style.cssText = 'display:flex;flex-direction:column;gap:0;';

    // ── 1  IDENTITY ──────────────────────────────────────────────────────────

    const id1 = makeCard('Identity');
    content.appendChild(id1.card);

    // Name
    {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid ' + C.rowSep + ';';
        const lbl = document.createElement('span');
        lbl.style.cssText = LABEL_S;
        lbl.textContent = 'Name';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = room.name;
        inp.placeholder = 'Room name';
        inp.style.cssText = INPUT_S;
        const btn = makePrimaryBtn('Save', { small: true });
        const origStyle = btn.style.cssText;
        btn.addEventListener('click', () => {
            const val = inp.value.trim();
            if (!val) return;
            // Phase C (Task 3.2): bus is primary. SetRoomNameHandler is a real handler.
            // RenameRoomCommand + dynamic import removed.
            window.runtime?.bus?.executeCommand('room.setName', { roomId: room.id, name: val })?.catch(console.error);
            showFeedback(btn, '✓', '✗', 'Save', origStyle, true);
        });
        wrap.appendChild(lbl);
        wrap.appendChild(inp);
        wrap.appendChild(btn);
        id1.body.appendChild(wrap);
    }

    // Number
    {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid ' + C.rowSep + ';';
        const lbl = document.createElement('span');
        lbl.style.cssText = LABEL_S;
        lbl.textContent = 'Number';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = room.roomNumber ?? '';
        inp.placeholder = 'e.g. 101';
        inp.style.cssText = INPUT_S;
        const btn = makePrimaryBtn('Save', { small: true });
        const origStyle = btn.style.cssText;
        btn.addEventListener('click', () => {
            // Phase C (Task 3.2): bus is primary. SetRoomNumberHandler is a real handler.
            window.runtime?.bus?.executeCommand('room.setNumber', { roomId: room.id, number: inp.value.trim() })?.catch(console.error);
            showFeedback(btn, '✓', '✗', 'Save', origStyle, true);
        });
        wrap.appendChild(lbl);
        wrap.appendChild(inp);
        wrap.appendChild(btn);
        id1.body.appendChild(wrap);
    }

    // Occupancy
    {
        const ALL_OCC: RoomOccupancyType[] = Object.keys(OCCUPANCY_PALETTE) as RoomOccupancyType[];

        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 0;';
        const lbl = document.createElement('span');
        lbl.style.cssText = LABEL_S;
        lbl.textContent = 'Occupancy';

        const swatch = document.createElement('div');
        swatch.style.cssText = `width:13px;height:13px;border-radius:3px;flex-shrink:0;background:${RoomColourSystem.forOccupancy(room.occupancyType)};border:1px solid rgba(0,0,0,0.1);`;

        const sel = document.createElement('select');
        sel.style.cssText = INPUT_S + 'flex:1;cursor:pointer;';
        ALL_OCC.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            if (t === room.occupancyType) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.addEventListener('change', () => {
            swatch.style.background = RoomColourSystem.forOccupancy(sel.value as RoomOccupancyType);
        });

        const btn = makePrimaryBtn('Apply', { small: true });
        const origStyle = btn.style.cssText;
        btn.addEventListener('click', () => {
            // Phase C (Task 3.2): bus is primary. SetRoomOccupancyHandler is a real handler.
            window.runtime?.bus?.executeCommand('room.setOccupancy', { roomId: room.id, occupancy: sel.value })?.catch(console.error);
            showFeedback(btn, '✓', '✗', 'Apply', origStyle, true);
            const builder = window.roomBoundaryBuilder; // TODO(E.rooms.X): replace with runtime.bus.executeCommand(rooms.build) — Phase E.rooms.X
            const updated = roomStore?.getById(room.id);
            if (builder && updated) builder.updateRoom(updated);
        });

        wrap.appendChild(lbl);
        wrap.appendChild(swatch);
        wrap.appendChild(sel);
        wrap.appendChild(btn);
        id1.body.appendChild(wrap);
    }

    // AI Type Suggestion Banner
    {
        const engine = window.roomTypeInferenceEngine; // TODO(E.rooms.S): replace with runtime.stores.rooms (inference engine) — Phase E.rooms.S
        if (engine && typeof engine.inferType === 'function') {
            let sug: { suggested: string; confidence: number; reason: string } | null = null;
            try { sug = engine.inferType(room.id); } catch { /* not ready */ }

            if (sug) {
                const banner = document.createElement('div');
                banner.style.cssText = [
                    'display:flex;align-items:flex-start;gap:8px;',
                    'margin-top:8px;padding:8px 10px;',
                    `background:${C.purpleSoft};border:1px solid ${C.purpleBorder};`,
                    'border-radius:8px;',
                ].join('');

                const icon = document.createElement('span');
                icon.style.cssText = 'font-size:14px;flex-shrink:0;line-height:1.5;';
                icon.textContent = '💡';

                const textBlock = document.createElement('div');
                textBlock.style.cssText = 'flex:1;min-width:0;';

                const titleLine = document.createElement('div');
                titleLine.style.cssText = `font-size:11px;font-weight:600;color:${C.purpleDk};line-height:1.4;`;
                const typeLabel = sug.suggested.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                titleLine.textContent = `Suggested: ${typeLabel} (${Math.round(sug.confidence * 100)}%)`;

                const reasonLine = document.createElement('div');
                reasonLine.style.cssText = `font-size:10px;color:${C.purple};margin-top:2px;opacity:0.8;`;
                reasonLine.textContent = sug.reason;

                const btnRow = document.createElement('div');
                btnRow.style.cssText = 'display:flex;gap:5px;margin-top:6px;';

                const applyBtn = makePrimaryBtn('Apply', { small: true });
                applyBtn.addEventListener('click', () => {
                    // Phase C (Task 3.2): bus is primary. SetRoomOccupancyHandler is a real handler.
                    window.runtime?.bus?.executeCommand('room.setOccupancy', { roomId: room.id, occupancy: sug!.suggested })?.catch(console.error);
                    banner.style.display = 'none';
                    const builder = window.roomBoundaryBuilder; // TODO(E.rooms.X): replace with runtime.bus.executeCommand(rooms.build) — Phase E.rooms.X
                    const updated = roomStore?.getById(room.id);
                    if (builder && updated) builder.updateRoom(updated);
                });

                const dismissBtn = makeGhostBtn('Dismiss', { small: true });
                dismissBtn.addEventListener('click', () => { banner.style.display = 'none'; });

                btnRow.appendChild(applyBtn);
                btnRow.appendChild(dismissBtn);
                textBlock.appendChild(titleLine);
                textBlock.appendChild(reasonLine);
                textBlock.appendChild(btnRow);
                banner.appendChild(icon);
                banner.appendChild(textBlock);
                id1.body.appendChild(banner);
            }
        }
    }

    // ── 2  METRICS ───────────────────────────────────────────────────────────

    const id2 = makeCard('Metrics');
    content.appendChild(id2.card);

    const mc = room.computed;
    id2.body.appendChild(makeRow('Gross Area',  makeReadonlyValue(`${mc.area.toFixed(2)} m²`)));
    if (mc.grossArea && mc.grossArea !== mc.area) {
        id2.body.appendChild(makeRow('Net Area', makeReadonlyValue(`${mc.grossArea.toFixed(2)} m²`)));
    }
    id2.body.appendChild(makeRow('Perimeter', makeReadonlyValue(`${mc.perimeter.toFixed(2)} m`)));
    id2.body.appendChild(makeRow('Volume',    makeReadonlyValue(`${mc.volume.toFixed(2)} m³`)));
    id2.body.appendChild(makeRow('Height',    makeReadonlyValue(`${room.boundary.height.toFixed(2)} m`)));
    id2.body.appendChild(makeRow('Vertices',  makeReadonlyValue(`${room.boundary.polygon.length}`)));

    // ── 3  VALIDATION ────────────────────────────────────────────────────────

    const id3 = makeCard('Validation');
    content.appendChild(id3.card);

    {
        const vs = window.roomValidationService; // TODO(E.rooms.S): replace with runtime.stores.rooms (validation service) — Phase E.rooms.S
        if (vs && typeof vs.validate === 'function') {
            let issues: Array<{ code: string; severity: string; message: string; suggestedFix?: string }> = [];
            try { issues = vs.validate(room.id); } catch { /* not ready */ }

            if (issues.length === 0) {
                const ok = document.createElement('div');
                ok.style.cssText = `display:flex;align-items:center;gap:7px;padding:4px 2px;font-size:11px;color:${C.green};font-weight:600;`;
                ok.innerHTML = '<span style="font-size:14px;">✓</span> No issues found';
                id3.body.appendChild(ok);
            } else {
                const wrap = document.createElement('div');
                wrap.style.cssText = 'display:flex;flex-direction:column;gap:5px;';
                issues.forEach(issue => {
                    const row = document.createElement('div');
                    const bg  = issue.severity === 'error' ? C.redSoft   : issue.severity === 'warning' ? C.amberSoft  : C.purpleSoft;
                    const brd = issue.severity === 'error' ? C.redBorder : issue.severity === 'warning' ? C.amberBorder : C.purpleBorder;
                    const col = issue.severity === 'error' ? C.red       : issue.severity === 'warning' ? C.amber      : C.purple;
                    row.style.cssText = `display:flex;align-items:flex-start;gap:7px;padding:7px 9px;border-radius:7px;font-size:11px;background:${bg};border:1px solid ${brd};`;
                    const icon = document.createElement('span');
                    icon.style.cssText = 'flex-shrink:0;font-size:12px;line-height:1.5;';
                    icon.textContent = issue.severity === 'error' ? '✕' : issue.severity === 'warning' ? '!' : 'ℹ';
                    icon.style.cssText += `color:${col};font-weight:700;`;
                    const inner = document.createElement('div');
                    inner.style.cssText = 'flex:1;min-width:0;';
                    const msg = document.createElement('div');
                    msg.style.cssText = `color:${C.text};line-height:1.4;`;
                    msg.textContent = issue.message;
                    inner.appendChild(msg);
                    if (issue.suggestedFix) {
                        const fix = document.createElement('div');
                        fix.style.cssText = `font-size:10px;color:${C.textMid};margin-top:2px;`;
                        fix.textContent = issue.suggestedFix;
                        inner.appendChild(fix);
                    }
                    row.appendChild(icon);
                    row.appendChild(inner);
                    wrap.appendChild(row);
                });
                id3.body.appendChild(wrap);
            }
        } else {
            const loading = document.createElement('div');
            loading.style.cssText = `font-size:10px;color:${C.textFaint};padding:2px 0;`;
            loading.textContent = 'Validation service initialising…';
            id3.body.appendChild(loading);
        }
    }

    // ── 4  FINISHES ──────────────────────────────────────────────────────────
    // All values are resolved live from actual element layer data — no manual strings.
    // The finish rows are reactive: they re-resolve automatically when any linked
    // element store fires an update event.

    const id4 = makeCard('Finishes', true);
    content.appendChild(id4.card);

    // Helper to make a single finish row
    function makeFinishRow(label: string, value: string, sourceHint: string): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid ${C.rowSep};`;

        const lbl = document.createElement('span');
        lbl.style.cssText = LABEL_S;
        lbl.textContent = label;

        const right = document.createElement('div');
        right.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:flex-end;gap:2px;min-width:0;';

        const chip = document.createElement('span');
        const hasValue = value !== '—';
        chip.style.cssText = [
            'font-size:11px;font-weight:600;',
            `color:${hasValue ? C.text : C.textFaint};`,
            hasValue
                ? `background:${C.purpleSoft};border:1px solid ${C.purpleBorder};border-radius:5px;padding:2px 8px;`
                : 'padding:0;',
        ].join('');
        chip.textContent = value;

        const hint = document.createElement('span');
        hint.style.cssText = `font-size:9px;color:${C.textFaint};`;
        hint.textContent = sourceHint;

        right.appendChild(chip);
        right.appendChild(hint);
        row.appendChild(lbl);
        row.appendChild(right);
        return row;
    }

    // Dedicated container for the five finish rows — cleared and rebuilt on every refresh
    const finishRowsContainer = document.createElement('div');
    id4.body.appendChild(finishRowsContainer);

    function renderFinishRows(): void {
        finishRowsContainer.innerHTML = '';
        // Always fetch the latest room snapshot from the store so that
        // boundingWallIds and other fields reflect any changes made since the
        // panel was first opened (e.g. walls added, boundary re-detected).
        const freshRoom = roomStore?.getById?.(room.id) ?? room;
        const f = resolveRoomFinishes(freshRoom);
        finishRowsContainer.appendChild(makeFinishRow('Floor',   f.floor,   'from floor / slab finish layer'));
        finishRowsContainer.appendChild(makeFinishRow('Walls',   f.walls,   'from wall finish-interior layer'));
        finishRowsContainer.appendChild(makeFinishRow('Ceiling', f.ceiling, 'from ceiling finish layer'));
        finishRowsContainer.appendChild(makeFinishRow('Doors',   f.doors,   'from door finish material'));
        finishRowsContainer.appendChild(makeFinishRow('Windows', f.windows, 'from window finish material'));
    }

    renderFinishRows();

    // Reactive refresh — re-resolve finishes whenever any linked element changes.
    // The AbortController ties the listeners to the card's DOM lifetime.
    const finishAC = new AbortController();
    const finishSignal = { signal: finishAC.signal };
    const refreshEvents = [
        'bim-floor-updated',
        'bim-ceiling-updated',
        'bim-wall-updated',
        'bim-slab-updated',
    ];
    refreshEvents.forEach(evt => {
        window.addEventListener(evt, renderFinishRows, finishSignal);
    });

    // Disconnect listeners when the card is removed from the DOM (MutationObserver guard)
    const finishObserver = new MutationObserver(() => {
        if (!id4.card.isConnected) {
            finishAC.abort();
            finishObserver.disconnect();
        }
    });
    const observerTarget = id4.card.parentNode ?? content;
    finishObserver.observe(observerTarget, { childList: true, subtree: false });

    // Source note
    const note = document.createElement('div');
    note.style.cssText = [
        `font-size:9px;color:${C.textFaint};`,
        'margin-top:8px;line-height:1.5;',
        `background:${C.purpleSoft};border:1px solid ${C.purpleBorder};`,
        'border-radius:6px;padding:5px 8px;',
    ].join('');
    note.textContent = 'Finishes are read live from element layer data. Edit finish layers on floor, ceiling, wall, door or window elements — this panel updates automatically.';
    id4.body.appendChild(note);

    // AI Finishes suggestion — shows AI-recommended finish names as guidance
    const aiFin = makeWideBtn('✨  AI Suggest Finishes', {
        bg:     '#faf5ff',
        color:  C.purple,
        border: C.purpleBorder,
    });
    aiFin.style.marginTop = '8px';
    const afOrig = aiFin.style.cssText;
    aiFin.addEventListener('click', async () => {
        aiFin.textContent = 'Thinking…';
        aiFin.disabled = true;
        try {
            const res = await fetch('/api/ai/rooms/suggest-finishes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: room.id,
                    occupancy: room.occupancyType,
                    buildingContext: worldModelAdapter.toPromptContext('current'),
                }),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.finishes) {
                    // Show suggestions as an informational panel — user applies them
                    // to the actual element layer systems.
                    const suggBox = document.createElement('div');
                    suggBox.style.cssText = [
                        'margin-top:6px;padding:8px 10px;',
                        `background:${C.purpleSoft};border:1px solid ${C.purpleBorder};`,
                        'border-radius:7px;',
                    ].join('');
                    const suggTitle = document.createElement('div');
                    suggTitle.style.cssText = `font-size:10px;font-weight:700;color:${C.purpleDk};margin-bottom:4px;`;
                    suggTitle.textContent = 'AI Suggested Finishes:';
                    suggBox.appendChild(suggTitle);
                    const fields: Array<{ key: string; label: string }> = [
                        { key: 'floor', label: 'Floor' },
                        { key: 'walls', label: 'Walls' },
                        { key: 'ceiling', label: 'Ceiling' },
                    ];
                    fields.forEach(({ key, label }) => {
                        const mat = data.finishes[key]?.materialName;
                        if (!mat) return;
                        const line = document.createElement('div');
                        line.style.cssText = `font-size:10px;color:${C.text};line-height:1.6;`;
                        line.textContent = `${label}: ${mat}`;
                        suggBox.appendChild(line);
                    });
                    const dismiss = document.createElement('button');
                    dismiss.textContent = 'Dismiss';
                    dismiss.style.cssText = `margin-top:5px;font-size:9px;color:${C.purple};background:none;border:none;cursor:pointer;padding:0;`;
                    dismiss.addEventListener('click', () => suggBox.remove());
                    suggBox.appendChild(dismiss);
                    id4.body.appendChild(suggBox);
                    showFeedback(aiFin, '✓ Suggestions Ready', '✗ Error', '✨  AI Suggest Finishes', afOrig, true);
                } else { throw new Error('No finishes returned'); }
            } else { throw new Error(`HTTP ${res.status}`); }
        } catch (err: any) {
            showFeedback(aiFin, `✗ ${err.message ?? 'AI failed'}`, '✗ Error', '✨  AI Suggest Finishes', afOrig, false);
        } finally {
            aiFin.disabled = false;
        }
    });
    id4.body.appendChild(aiFin);

    // ── 5  APPEARANCE ────────────────────────────────────────────────────────

    const id5 = makeCard('Appearance', true);
    content.appendChild(id5.card);

    // Fill colour
    {
        const wrap = document.createElement('div');
        wrap.style.cssText = `display:flex;align-items:center;gap:7px;padding:5px 0;border-bottom:1px solid ${C.rowSep};`;
        const lbl = document.createElement('span');
        lbl.style.cssText = LABEL_S;
        lbl.textContent = 'Fill Colour';

        const picker = document.createElement('input');
        picker.type = 'color';
        picker.value = room.colour ?? RoomColourSystem.resolve(room);
        picker.style.cssText = 'width:32px;height:26px;border:1px solid #ddd;padding:0;cursor:pointer;border-radius:5px;flex-shrink:0;';

        const applyBtn = makePrimaryBtn('Apply', { small: true });
        const aOrig = applyBtn.style.cssText;
        applyBtn.addEventListener('click', () => {
            // Phase C (Task 3.2): bus is primary. SetRoomMaterialHandler is a real handler.
            window.runtime?.bus?.executeCommand('room.setMaterial', { roomId: room.id, materialColor: picker.value })?.catch(console.error);
            const builder2 = window.roomBoundaryBuilder; // TODO(E.rooms.X): replace with runtime.bus.executeCommand(rooms.build) — Phase E.rooms.X
            const updated2 = roomStore?.getById(room.id);
            if (builder2 && updated2) builder2.updateRoom(updated2);
            showFeedback(applyBtn, '✓', '✗', 'Apply', aOrig, true);
        });

        const resetBtn = makeGhostBtn('Reset', { small: true });
        resetBtn.addEventListener('click', () => {
            // Phase C (Task 3.2): bus is primary for colour reset (room.update stub).
            window.runtime?.bus?.executeCommand('room.update', { roomId: room.id, updates: { colour: undefined } })?.catch(console.error);
            const occ = roomStore?.getById(room.id)?.occupancyType ?? room.occupancyType;
            picker.value = RoomColourSystem.forOccupancy(occ);
            const builder3 = window.roomBoundaryBuilder; // TODO(E.rooms.X): replace with runtime.bus.executeCommand(rooms.build) — Phase E.rooms.X
            const updated3 = roomStore?.getById(room.id);
            if (builder3 && updated3) builder3.updateRoom(updated3);
        });

        wrap.appendChild(lbl);
        wrap.appendChild(picker);
        wrap.appendChild(applyBtn);
        wrap.appendChild(resetBtn);
        id5.body.appendChild(wrap);
    }

    // Opacity
    {
        const opSlider = document.createElement('input');
        opSlider.type  = 'range';
        opSlider.min   = '0.05';
        opSlider.max   = '0.9';
        opSlider.step  = '0.05';
        opSlider.value = String(room.opacity ?? RoomColourSystem.defaultOpacity());
        opSlider.style.cssText = 'flex:1;cursor:pointer;accent-color:' + C.purple + ';';

        const opVal = document.createElement('span');
        opVal.style.cssText = `font-size:10px;color:${C.textMid};min-width:32px;text-align:right;`;
        opVal.textContent = `${Math.round(Number(opSlider.value) * 100)}%`;

        opSlider.addEventListener('input', () => {
            opVal.textContent = `${Math.round(Number(opSlider.value) * 100)}%`;
        });
        opSlider.addEventListener('change', () => {
            // Phase C (Task 3.2): bus is primary for opacity update (room.update stub).
            window.runtime?.bus?.executeCommand('room.update', { roomId: room.id, updates: { opacity: Number(opSlider.value) } })?.catch(console.error);
            const builder4 = window.roomBoundaryBuilder; // TODO(E.rooms.X): replace with runtime.bus.executeCommand(rooms.build) — Phase E.rooms.X
            const updated4 = roomStore?.getById(room.id);
            if (builder4 && updated4) builder4.updateRoom(updated4);
        });

        const wrap = document.createElement('div');
        wrap.style.cssText = `display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid ${C.rowSep};`;
        const lbl = document.createElement('span');
        lbl.style.cssText = LABEL_S;
        lbl.textContent = 'Opacity';
        wrap.appendChild(lbl);
        wrap.appendChild(opSlider);
        wrap.appendChild(opVal);
        id5.body.appendChild(wrap);
    }

    // Colour-by mode toolbar
    {
        const modes: Array<{ mode: string; label: string }> = [
            { mode: 'detection',  label: 'Type'       },
            { mode: 'occupancy',  label: 'Occupancy'  },
            { mode: 'area',       label: 'Area'       },
            { mode: 'custom',     label: 'Custom'     },
            { mode: 'sync-state', label: 'Sync State' },
        ];

        const wrap = document.createElement('div');
        wrap.style.cssText = `display:flex;align-items:center;gap:8px;padding:5px 0;flex-wrap:wrap;`;
        const lbl = document.createElement('span');
        lbl.style.cssText = LABEL_S;
        lbl.textContent = 'Colour by';

        const grp = document.createElement('div');
        grp.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap;';

        const setActive = (activeMode: string) => {
            grp.querySelectorAll<HTMLButtonElement>('button[data-vis]').forEach(b => {
                const on = b.dataset.vis === activeMode;
                b.style.background = on ? C.purple    : '#f3f0fb';
                b.style.color      = on ? '#fff'      : C.textMid;
                b.style.borderColor= on ? C.purpleDk  : C.cardBorder;
            });
        };

        const builder = window.roomBoundaryBuilder; // TODO(E.rooms.X): replace with runtime.bus.executeCommand(rooms.build) — Phase E.rooms.X
        const currentMode = builder?.currentVisualisationMode ?? 'detection';

        modes.forEach(({ mode, label }) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.dataset.vis = mode;
            btn.style.cssText = `font-size:10px;padding:3px 8px;border:1px solid ${C.cardBorder};border-radius:5px;background:#f3f0fb;color:${C.textMid};cursor:pointer;transition:all 0.12s;`;
            btn.addEventListener('click', () => {
                if (builder?.setVisualisationMode) builder.setVisualisationMode(mode);
                setActive(mode);
            });
            grp.appendChild(btn);
        });

        setActive(currentMode);
        wrap.appendChild(lbl);
        wrap.appendChild(grp);
        id5.body.appendChild(wrap);
    }

    // ── 6  SPATIAL INTELLIGENCE ──────────────────────────────────────────────

    const id6 = makeCard('Spatial Intelligence');
    content.appendChild(id6.card);

    {
        const qs = window.roomQueryService; // TODO(E.rooms.S): replace with runtime.stores.rooms (query service) — Phase E.rooms.S

        if (!qs) {
            const na = document.createElement('div');
            na.style.cssText = `font-size:11px;color:${C.textFaint};padding:2px 0;`;
            na.textContent = 'Spatial services initialising…';
            id6.body.appendChild(na);
        } else {
            const makeSubHdr = (text: string) => {
                const el = document.createElement('div');
                el.style.cssText = `font-size:9px;font-weight:700;color:${C.textFaint};text-transform:uppercase;letter-spacing:0.06em;margin:8px 0 4px;`;
                el.textContent = text;
                return el;
            };

            const makeRoomChip = (r: any) => {
                const chip = document.createElement('button');
                const colour = RoomColourSystem.resolve(r);
                chip.style.cssText = [
                    'display:inline-flex;align-items:center;gap:4px;',
                    'padding:3px 9px;font-size:10px;font-weight:500;',
                    `border:1px solid ${C.cardBorder};border-radius:12px;`,
                    'background:#fafafa;cursor:pointer;transition:background 0.12s;',
                    `color:${C.text};`,
                ].join('');
                chip.title = 'Select room';
                const sw = document.createElement('span');
                sw.style.cssText = `width:7px;height:7px;border-radius:2px;flex-shrink:0;background:${colour};border:1px solid rgba(0,0,0,0.1);`;
                const nm = document.createElement('span');
                nm.textContent = r.name || `Room ${(r.id ?? '').substring(0, 6)}`;
                chip.appendChild(sw);
                chip.appendChild(nm);
                chip.addEventListener('mouseenter', () => { chip.style.background = C.purpleSoft; });
                chip.addEventListener('mouseleave', () => { chip.style.background = '#fafafa'; });
                chip.addEventListener('click', () => {
                    const sm = window.selectionManager; // TODO(D.13): replace with runtime.picking.select — Phase D.13
                    if (sm?.selectById) sm.selectById(r.id);
                });
                return chip;
            };

            // Adjacent rooms
            id6.body.appendChild(makeSubHdr('Adjacent — shared wall'));
            try {
                const adj: any[] = qs.getAdjacentRooms(room.id) ?? [];
                if (adj.length === 0) {
                    const empty = document.createElement('div');
                    empty.style.cssText = `font-size:10px;color:${C.textFaint};`;
                    empty.textContent = 'No adjacent rooms detected';
                    id6.body.appendChild(empty);
                } else {
                    const grid = document.createElement('div');
                    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';
                    adj.forEach((r: any) => grid.appendChild(makeRoomChip(r)));
                    id6.body.appendChild(grid);
                }
            } catch {
                const err = document.createElement('div');
                err.style.cssText = `font-size:10px;color:${C.textFaint};`;
                err.textContent = 'Adjacency unavailable';
                id6.body.appendChild(err);
            }

            // Connected rooms (via door)
            id6.body.appendChild(makeSubHdr('Connected — via door'));
            try {
                const conn: any[] = qs.getConnectedRooms(room.id) ?? [];
                if (conn.length === 0) {
                    const empty = document.createElement('div');
                    empty.style.cssText = `font-size:10px;color:${C.red};`;
                    empty.textContent = 'No door connections — room is isolated';
                    id6.body.appendChild(empty);
                } else {
                    const grid = document.createElement('div');
                    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';
                    conn.forEach((r: any) => grid.appendChild(makeRoomChip(r)));
                    id6.body.appendChild(grid);
                }
            } catch {
                const err = document.createElement('div');
                err.style.cssText = `font-size:10px;color:${C.textFaint};`;
                err.textContent = 'Connectivity unavailable';
                id6.body.appendChild(err);
            }

            // Contents summary
            try {
                const elements: any[] = qs.getElementsInRoom(room.id) ?? [];
                if (elements.length > 0) {
                    id6.body.appendChild(makeSubHdr(`Contents — ${elements.length} element${elements.length === 1 ? '' : 's'}`));
                    const byType: Record<string, number> = {};
                    elements.forEach((el: any) => { byType[el.type] = (byType[el.type] || 0) + 1; });
                    const summary = document.createElement('div');
                    summary.style.cssText = `font-size:10px;color:${C.textMid};line-height:1.6;`;
                    summary.textContent = Object.entries(byType).map(([t, c]) => `${c} ${t}`).join('  ·  ');
                    id6.body.appendChild(summary);
                }
            } catch { /* skip */ }
        }

        // Find Path button
        const pathBtn = makeWideBtn('⬡  Find Path →');
        pathBtn.style.marginTop = '10px';
        pathBtn.addEventListener('click', () => {
            import('./RoomPathfinderPanel').then(m => { m.openRoomPathfinderPanel(room.id); });
        });
        id6.body.appendChild(pathBtn);

        // Phase C row: Room Graph + Evacuation
        const pcRow = document.createElement('div');
        pcRow.style.cssText = 'display:flex;gap:5px;margin-top:5px;';

        const graphBtn = makeWideBtn('⬡  Room Graph', {
            bg:     C.purpleSoft,
            color:  C.purpleDk,
            border: C.purpleBorder,
        });
        graphBtn.style.flex = '1';
        graphBtn.addEventListener('click', () => {
            // Phase B.37 (S73-WIRE) — thread runtime to RoomGraphPanel.
            import('../../ui/rooms/RoomGraphPanel').then(m => { m.openRoomGraphPanel(room.levelId, runtime /* B-runtime-thread openRoomGraphPanel */); });
        });

        const evacBtn = makeWideBtn('⚠  Evacuation', {
            bg:     C.redSoft,
            color:  C.red,
            border: C.redBorder,
        });
        evacBtn.style.flex = '1';
        evacBtn.addEventListener('click', () => {
            // Phase B.37 (S73-WIRE) — thread runtime to EvacuationSimulatorPanel.
            import('../../ui/rooms/EvacuationSimulatorPanel').then(m => { m.openEvacuationSimulatorPanel(room.id, runtime /* B-runtime-thread openEvacuationSimulatorPanel */); });
        });

        pcRow.appendChild(graphBtn);
        pcRow.appendChild(evacBtn);
        id6.body.appendChild(pcRow);

        // Auto-Organise
        const aoBtn = makeWideBtn('⚡  Auto-Organise Floor…', {
            bg:     C.purpleSoft,
            color:  C.purple,
            border: C.purpleBorder,
        });
        aoBtn.style.marginTop = '4px';
        aoBtn.addEventListener('click', () => {
            import('./RoomAutoOrganiser').then(m => { m.openAutoOrganiseModal(room.levelId); });
        });
        id6.body.appendChild(aoBtn);
    }

    // ── 7  CONTAINED ELEMENTS ────────────────────────────────────────────────

    const id7 = makeCard('Contained Elements', true);
    content.appendChild(id7.card);

    {
        const wallStore      = window.wallStore; // TODO(E.wall.S): replace with runtime.stores.wall — Phase E.wall.S
        const furnitureStore = window.furnitureStore; // TODO(E.furniture.S): replace with runtime.stores.furniture — Phase E.furniture.S
        const boundingSet    = new Set<string>(room.boundingWallIds ?? []);

        const allDoors   = wallStore?.getAllDoors?.()   ?? [];
        const allWindows = wallStore?.getAllWindows?.() ?? [];

        const containedDoors   = allDoors.filter((d: any) => d.wallId && boundingSet.has(d.wallId));
        const containedWindows = allWindows.filter((w: any) => w.wallId && boundingSet.has(w.wallId));

        let containedFurniture: any[] = [];
        if (furnitureStore && typeof furnitureStore.getAll === 'function') {
            containedFurniture = furnitureStore.getAll().filter((f: any) => {
                const px = f.position?.x ?? 0;
                const pz = f.position?.z ?? 0;
                const ref = RoomRelationshipService.getContainingRoom(px, pz, room.levelId);
                return ref?.id === room.id;
            });
        }

        // Stat grid
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:8px;';

        const addTile = (label: string, count: number, icon: string) => {
            const tile = document.createElement('div');
            tile.style.cssText = [
                'display:flex;align-items:center;gap:7px;',
                `padding:7px 10px;background:${C.purpleSoft};`,
                `border:1px solid ${C.cardBorder};border-radius:8px;`,
            ].join('');
            const ico = document.createElement('span');
            ico.style.cssText = 'font-size:15px;line-height:1;';
            ico.textContent = icon;
            const info = document.createElement('div');
            const num = document.createElement('div');
            num.style.cssText = `font-size:14px;font-weight:700;color:${C.text};line-height:1;`;
            num.textContent = String(count);
            const lbl2 = document.createElement('div');
            lbl2.style.cssText = `font-size:9px;color:${C.textMid};text-transform:uppercase;letter-spacing:0.04em;margin-top:2px;`;
            lbl2.textContent = label;
            info.appendChild(num);
            info.appendChild(lbl2);
            tile.appendChild(ico);
            tile.appendChild(info);
            grid.appendChild(tile);
        };

        addTile('Doors',     containedDoors.length,     '🚪');
        addTile('Windows',   containedWindows.length,   '🪟');
        addTile('Walls',     boundingSet.size,           '🧱');
        addTile('Furniture', containedFurniture.length, '🪑');
        id7.body.appendChild(grid);

        // Select all contents
        {
            const qs = window.roomQueryService; // TODO(E.rooms.S): replace with runtime.stores.rooms (query service) — Phase E.rooms.S
            const selBtn = makeWideBtn('⊕  Select All Contents');
            const sbOrig = selBtn.style.cssText;
            selBtn.addEventListener('click', () => {
                if (!qs?.getElementsInRoom) return;
                try {
                    const els: Array<{ id: string }> = qs.getElementsInRoom(room.id) ?? [];
                    const sm = window.selectionManager; // TODO(D.13): replace with runtime.picking.select — Phase D.13
                    if (!sm || els.length === 0) return;
                    for (const el of els) { if (sm.selectById) sm.selectById(el.id); }
                    showFeedback(selBtn, `✓ ${els.length} selected`, '✗', '⊕  Select All Contents', sbOrig, true);
                } catch { /* not ready */ }
            });
            id7.body.appendChild(selBtn);
        }

        // Pre-compute mark maps (needed for both door and window lists)
        const doorMarkMap   = new Map<string, string>(allDoors.map((d: any, i: number) => [d.id, `D${String(i + 1).padStart(3, '0')}`]));
        const windowMarkMap = new Map<string, string>(allWindows.map((w: any, i: number) => [w.id, `W${String(i + 1).padStart(3, '0')}`]));

        const listHdrStyle = `font-size:9px;font-weight:700;color:${C.textFaint};text-transform:uppercase;letter-spacing:0.06em;margin:10px 0 4px;`;

        // Door list
        if (containedDoors.length > 0) {
            const doorHdr = document.createElement('div');
            doorHdr.style.cssText = listHdrStyle;
            doorHdr.textContent = 'Doors';
            id7.body.appendChild(doorHdr);

            containedDoors.forEach((d: any) => {
                const hostWall = wallStore?.getById?.(d.wallId);
                const rel      = hostWall ? RoomRelationshipService.getDoorRelationships(d, hostWall) : { roomFrom: null, roomTo: null };
                const from     = rel.roomFrom ? (rel.roomFrom.name || rel.roomFrom.roomNumber || 'Room') : 'Exterior';
                const to       = rel.roomTo   ? (rel.roomTo.name   || rel.roomTo.roomNumber   || 'Room') : 'Exterior';
                const mark     = doorMarkMap.get(d.id) ?? '—';

                const row = document.createElement('div');
                row.style.cssText = `display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid ${C.rowSep};`;

                const badge = document.createElement('span');
                badge.style.cssText = `font-size:9px;font-weight:700;color:#fff;background:${C.indigoDk};border-radius:3px;padding:2px 5px;flex-shrink:0;`;
                badge.textContent = mark;

                const typeTag = document.createElement('span');
                typeTag.style.cssText = `font-size:10px;color:${C.textMid};flex-shrink:0;`;
                typeTag.textContent = d.doorType === 'double' ? 'Double' : 'Single';

                const routeSpan = document.createElement('span');
                routeSpan.style.cssText = `font-size:10px;color:${C.textMid};flex:1;text-align:right;`;
                routeSpan.textContent = `${from} → ${to}`;

                const selBtn = makeGhostBtn('Select', { small: true });
                selBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const sm = window.selectionManager; // TODO(D.13): replace with runtime.picking.select — Phase D.13
                    if (sm?.selectById) sm.selectById(d.id);
                });

                row.appendChild(badge);
                row.appendChild(typeTag);
                row.appendChild(routeSpan);
                row.appendChild(selBtn);
                id7.body.appendChild(row);
            });
        }

        // Window list (independent of door list)
        if (containedWindows.length > 0) {
            const winHdr = document.createElement('div');
            winHdr.style.cssText = listHdrStyle;
            winHdr.textContent = 'Windows';
            id7.body.appendChild(winHdr);

            containedWindows.forEach((w: any) => {
                const hostWall = wallStore?.getById?.(w.wallId);
                const rel      = hostWall ? RoomRelationshipService.getWindowRelationships(w, hostWall) : { roomId: null, adjacentRoomId: null };
                const room1    = rel.roomId         ? (rel.roomId.name         || rel.roomId.roomNumber         || 'Room') : '—';
                const room2    = rel.adjacentRoomId ? (rel.adjacentRoomId.name || rel.adjacentRoomId.roomNumber || 'Room') : 'Exterior';
                const mark     = windowMarkMap.get(w.id) ?? '—';
                const dims     = `${(w.width ?? 0).toFixed(2)}×${(w.height ?? 0).toFixed(2)} m`;

                const row = document.createElement('div');
                row.style.cssText = `display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid ${C.rowSep};`;

                const badge = document.createElement('span');
                badge.style.cssText = `font-size:9px;font-weight:700;color:#fff;background:#4a90d9;border-radius:3px;padding:2px 5px;flex-shrink:0;`;
                badge.textContent = mark;

                const dimsSpan = document.createElement('span');
                dimsSpan.style.cssText = `font-size:10px;color:${C.textMid};flex-shrink:0;`;
                dimsSpan.textContent = dims;

                const roomSpan = document.createElement('span');
                roomSpan.style.cssText = `font-size:10px;color:${C.textMid};flex:1;text-align:right;`;
                roomSpan.textContent = `${room1} / ${room2}`;

                const selBtn = makeGhostBtn('Select', { small: true });
                selBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const sm = window.selectionManager; // TODO(D.13): replace with runtime.picking.select — Phase D.13
                    if (sm?.selectById) sm.selectById(w.id);
                });

                row.appendChild(badge);
                row.appendChild(dimsSpan);
                row.appendChild(roomSpan);
                row.appendChild(selBtn);
                id7.body.appendChild(row);
            });
        }
    }

    // ── 8  IFC (conditional) ────────────────────────────────────────────────

    if (room.ifcData) {
        const id8 = makeCard('IFC', true);
        content.appendChild(id8.card);
        id8.body.appendChild(makeRow('Class', makeReadonlyValue(room.ifcData.ifcClass)));
        id8.body.appendChild(makeRow('GUID',  makeReadonlyValue(room.ifcData.guid)));
        if (room.ifcData.predefinedType) {
            id8.body.appendChild(makeRow('Type', makeReadonlyValue(room.ifcData.predefinedType)));
        }
        id8.body.appendChild(makeRow('GFA', makeReadonlyValue(`${mc.area.toFixed(2)} m²`)));
    }

    // ── 9  COMMENTS ─────────────────────────────────────────────────────────

    const id9 = makeCard('Comments', true);
    content.appendChild(id9.card);

    const commentsArea = document.createElement('textarea');
    commentsArea.rows = 3;
    commentsArea.value = room.properties?.comments as string ?? '';
    commentsArea.placeholder = 'Add a comment…';
    commentsArea.style.cssText = [
        'width:100%;box-sizing:border-box;',
        'font-size:11px;padding:6px 8px;',
        `border:1px solid ${C.cardBorder};`,
        'border-radius:6px;background:#f7f6fb;',
        `color:${C.text};`,
        'font-family:inherit;resize:vertical;',
        'transition:border-color 0.15s;',
    ].join('');

    const saveComBtn = makeWideBtn('Save Comment');
    saveComBtn.style.marginTop = '6px';
    const scOrig = saveComBtn.style.cssText;
    saveComBtn.addEventListener('click', () => {
        // Phase C (Task 3.2): bus is primary for comments update (room.update stub).
        window.runtime?.bus?.executeCommand('room.update', { roomId: room.id, updates: { properties: { ...room.properties, comments: commentsArea.value.trim() } } })?.catch(console.error);
        showFeedback(saveComBtn, '✓ Saved', '✗ Error', 'Save Comment', scOrig, true);
    });

    id9.body.appendChild(commentsArea);
    id9.body.appendChild(saveComBtn);

    // ── 10  AI ASSISTANCE ───────────────────────────────────────────────────

    const id10 = makeCard('AI Assistance', true);
    content.appendChild(id10.card);

    const aiNameBtn = makeWideBtn('✨  Suggest Name & Type', {
        bg:     '#faf5ff',
        color:  C.purple,
        border: C.purpleBorder,
    });
    const anOrig = aiNameBtn.style.cssText;
    aiNameBtn.addEventListener('click', async () => {
        aiNameBtn.textContent = 'Thinking…';
        aiNameBtn.disabled = true;
        try {
            const res = await fetch('/api/ai/rooms/suggest-name', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: room.id,
                    occupancy: room.occupancyType,
                    area: room.computed.area,
                    buildingContext: worldModelAdapter.toPromptContext('current'),
                }),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.name) {
                    // Phase C (Task 3.2): bus is primary. SetRoomNameHandler is a real handler.
                    window.runtime?.bus?.executeCommand('room.setName', { roomId: room.id, name: data.name })?.catch(console.error);
                    showFeedback(aiNameBtn, `✓ Named: ${data.name}`, '✗ Error', '✨  Suggest Name & Type', anOrig, true);
                } else { throw new Error('No name returned'); }
            } else { throw new Error(`HTTP ${res.status}`); }
        } catch (err: any) {
            showFeedback(aiNameBtn, `✗ ${err.message ?? 'AI failed'}`, '✗ Error', '✨  Suggest Name & Type', anOrig, false);
        } finally {
            aiNameBtn.disabled = false;
        }
    });

    id10.body.appendChild(aiNameBtn);

    // ── 11  CONTENTS (§6.5 Room ↔ Element Bidirectional Lookup) ─────────────
    // Forward direction of the contract: shows every element associated
    // with the room — bounding shell, hosted openings, things sitting
    // inside, and rooms vertically adjacent. Each row is clickable and
    // re-inspects the element via the standard `pryzm-element-selected`
    // event. Service is queried lazily on render so the card always
    // reflects the current containment state.

    const id11 = makeCard('Contents');
    content.appendChild(id11.card);

    {
        const svc = window.roomContentsService; // TODO(E.rooms.S): replace with runtime.stores.rooms (contents service) — Phase E.rooms.S
        const contents = svc?.getContents?.(room.id);

        if (!contents) {
            const empty = document.createElement('div');
            empty.style.cssText = `font-size:11px;color:${C.textMid};padding:8px 0;`;
            empty.textContent = 'Containment service not available.';
            id11.body.appendChild(empty);
        } else {
            const renderGroup = (label: string, refs: any[]): void => {
                if (!refs || refs.length === 0) return;

                const groupHeader = document.createElement('div');
                groupHeader.style.cssText =
                    `display:flex;justify-content:space-between;align-items:center;` +
                    `padding:6px 0 3px 0;border-bottom:1px solid ${C.rowSep};` +
                    `font-size:10px;font-weight:700;color:${C.textMid};` +
                    `text-transform:uppercase;letter-spacing:0.5px;`;
                const lbl = document.createElement('span');
                lbl.textContent = label;
                const cnt = document.createElement('span');
                cnt.textContent = String(refs.length);
                cnt.style.cssText = `color:${C.text};`;
                groupHeader.appendChild(lbl);
                groupHeader.appendChild(cnt);
                id11.body.appendChild(groupHeader);

                for (const ref of refs) {
                    const row = document.createElement('div');
                    row.style.cssText =
                        `display:flex;justify-content:space-between;align-items:center;` +
                        `padding:4px 0;border-bottom:1px solid ${C.rowSep};` +
                        `cursor:pointer;font-size:11px;`;
                    const rl = document.createElement('span');
                    rl.style.cssText = `color:${C.text};`;
                    rl.textContent = ref.label || ref.id.slice(0, 8);
                    const rt = document.createElement('span');
                    rt.style.cssText = `color:${C.textMid};font-size:10px;`;
                    rt.textContent = ref.type;
                    row.appendChild(rl);
                    row.appendChild(rt);
                    row.title = `${ref.type} · ${ref.id}\n(click to inspect)`;
                    row.addEventListener('mouseenter', () => {
                        row.style.backgroundColor = '#f5f3ff';
                    });
                    row.addEventListener('mouseleave', () => {
                        row.style.backgroundColor = '';
                    });
                    row.addEventListener('click', () => {
                        runtime?.events?.emit('pryzm-element-selected', { elementId: ref.id, elementType: ref.type, source: 'room-contents-card' });
                    });
                    id11.body.appendChild(row);
                }
            };

            // Bounding shell
            renderGroup('Walls',         contents.bounding.walls);
            renderGroup('Slabs',         contents.bounding.slabs);
            renderGroup('Bounding Columns', contents.bounding.columns);
            renderGroup('Curtain Walls', contents.bounding.curtainWalls);

            // Hosted openings
            renderGroup('Doors',    contents.hosted.doors);
            renderGroup('Windows',  contents.hosted.windows);
            renderGroup('Openings', contents.hosted.openings);

            // Free-standing contents
            renderGroup('Furniture',          contents.contained.furniture);
            renderGroup('Free Columns',       contents.contained.columns);
            renderGroup('Plumbing Fixtures',  contents.contained.plumbing);
            renderGroup('Lighting',           contents.contained.lighting);
            renderGroup('Beams',              contents.contained.beams);
            renderGroup('Handrails',          contents.contained.handrails);
            renderGroup('Stairs',             contents.contained.stairs);
            renderGroup('Annotations',        contents.contained.annotations);

            // Vertical neighbours
            renderGroup('Rooms Above', contents.vertical.above);
            renderGroup('Rooms Below', contents.vertical.below);

            // Grand total summary
            const summary = document.createElement('div');
            summary.style.cssText =
                `display:flex;justify-content:space-between;align-items:center;` +
                `padding:8px 0 2px 0;margin-top:6px;border-top:2px solid ${C.rowSep};` +
                `font-size:11px;font-weight:700;color:${C.text};`;
            const sl = document.createElement('span');
            sl.textContent = 'Total elements';
            const sv = document.createElement('span');
            sv.textContent = String(contents.totals.total);
            summary.appendChild(sl);
            summary.appendChild(sv);
            id11.body.appendChild(summary);

            if (contents.totals.total === 0) {
                const empty = document.createElement('div');
                empty.style.cssText = `font-size:11px;color:${C.textMid};padding:8px 0;text-align:center;`;
                empty.textContent = 'This room is empty.';
                id11.body.appendChild(empty);
            }
        }
    }
}
