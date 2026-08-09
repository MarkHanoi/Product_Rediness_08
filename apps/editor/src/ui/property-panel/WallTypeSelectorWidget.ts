/**
 * WallTypeSelectorWidget
 * ----------------------
 * Renders the Wall Type header row for the PropertyPanel.
 *
 * Shows:
 *  - Wall Type label
 *  - Dropdown: Plain Wall + all system types (name + mm)
 *  - Layer colour-strip preview
 *  - [Apply] button — fires the onApply callback immediately
 *
 * Contract compliance:
 *  - §01 CORE: No store writes here — mutations delegated to caller via callback
 *  - §01-1.1: Tool Layer only
 *  - §03: Reads from WallSystemTypeStore (via window), never writes
 *  - §05: All styles via wts- CSS classes in AppTheme.ts
 */

// §FEAT-ELEMENT-TYPE-AUTHORING — authoring is DECLARED per family, and the editor is
// a shared surface. Neither is reached unless the family declares it authorable.
import {
    resolveElementTypeAuthoring,
    type ElementTypeAuthoring,
} from './ElementTypeAuthoringRegistry';
import { openWallTypeEditor } from './WallTypeEditorModal';

export interface WallTypeApplyPayload {
    systemTypeId: string | null;
    layers: any[] | null;
    thickness: number | null;
}

/**
 * Builds the wall-type selector widget for the PropertyPanel header.
 *
 * @param elementData   - current wall's userData/store snapshot
 * @param onApply       - called with WallTypeApplyPayload when user clicks Apply
 * @returns HTMLElement or null when element is not a wall or store is unavailable
 */
export function buildWallTypeSelectorWidget(
    elementData: Record<string, any>,
    onApply: (payload: WallTypeApplyPayload) => void,
    opts?: { applyOnChange?: boolean }
): HTMLElement | null {

    const elType = (elementData.elementType ?? elementData.type ?? '').toLowerCase();
    if (elType !== 'wall') return null;

    const typeStore = window.wallSystemTypeStore; // TODO(E.wall.S): legacy wallSystemTypeStore — replace with runtime.stores.wall (system types)
    const allTypes: any[] = typeStore?.getAll?.() ?? [];

    // ── Outer wrapper ────────────────────────────────────────────────────────
    const outer = document.createElement('div');
    outer.className = 'wts-outer';

    // "Wall Type" label row
    const labelEl = document.createElement('div');
    labelEl.className = 'wts-label';
    labelEl.textContent = 'Wall Type';
    outer.appendChild(labelEl);

    // Row: dropdown + strip + apply button
    const row = document.createElement('div');
    row.className = 'wts-row';

    // ── Dropdown ─────────────────────────────────────────────────────────────
    const sel = document.createElement('select');
    sel.className = 'wts-select';

    // Plain wall option
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '— Plain Wall —';
    noneOpt.className = 'wts-opt-dark';
    sel.appendChild(noneOpt);

    // System type options
    allTypes.forEach((t: any) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        const thkMm = Math.round(t.totalThickness * 1000);
        opt.textContent = `${t.name}  (${thkMm}mm)`;
        opt.className = 'wts-opt-dark';
        if (t.id === elementData.systemTypeId) opt.selected = true;
        sel.appendChild(opt);
    });

    // §FEAT-ELEMENT-TYPE-AUTHORING — the authoring entries are rendered ONLY when the
    // family declares authoring (store proven project-scoped AND snapshot-round-tripping;
    // see ElementTypeAuthoringRegistry). A dropdown entry that opens an editor whose
    // result cannot be saved is worse than no entry at all — it is founder complaint #2
    // manufactured on purpose.
    const authoring = resolveElementTypeAuthoring('wall');

    if (authoring) {
        // Separator + action options
        if (allTypes.length > 0) {
            const sep = document.createElement('option');
            sep.disabled = true;
            sep.textContent = '────────────────────';
            sep.className = 'wts-opt-sep';
            sel.appendChild(sep);
        }

        const dupOpt = document.createElement('option');
        dupOpt.value = '__duplicate__';
        dupOpt.textContent = 'Duplicate Type…';
        dupOpt.className = 'wts-opt-action';
        sel.appendChild(dupOpt);

        const newOpt = document.createElement('option');
        newOpt.value = '__new__';
        newOpt.textContent = 'New Type…';
        newOpt.className = 'wts-opt-action';
        sel.appendChild(newOpt);
    }

    // §CONTEXT-DATA-HONESTY — a wall referencing a type that is NOT in the catalogue
    // (deleted, or authored in a project whose snapshot did not carry it) previously
    // fell through every `option.selected` test, so the dropdown displayed
    // "— Plain Wall —" and the wall silently READ as an untyped wall. Failure and
    // "genuinely plain" rendered as the SAME VALUE. The missing id is now shown as
    // itself, selected, so the user can see there is something to fix.
    const currentId = elementData.systemTypeId as string | undefined;
    if (currentId && !typeStore?.getById?.(currentId)) {
        const missing = document.createElement('option');
        missing.value = currentId;
        missing.textContent = `⚠ Missing type (${currentId})`;
        missing.className = 'wts-opt-action';
        missing.selected = true;
        sel.insertBefore(missing, sel.firstChild);
    }

    // ── Colour strip preview ─────────────────────────────────────────────────
    const strip = document.createElement('div');
    strip.className = 'wts-strip';

    function refreshStrip(): void {
        strip.innerHTML = '';
        const id = sel.value;
        if (!id || id.startsWith('__')) {
            const s = document.createElement('div');
            s.style.cssText = 'flex:1;background:#d4c5b0;border-radius:3px;';
            strip.appendChild(s);
            return;
        }
        const t = typeStore?.getById?.(id);
        if (!t) return;
        t.layers.forEach((l: any) => {
            const s = document.createElement('div');
            s.style.cssText = `flex:${l.thickness};background:${l.materialColor ?? '#ccc'};`;
            s.title = `${l.name}: ${Math.round(l.thickness * 1000)}mm`;
            strip.appendChild(s);
        });
    }
    refreshStrip();

    // ── Apply button ─────────────────────────────────────────────────────────
    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.className = 'wts-apply-btn';

    // Build the apply payload for a concrete selected type id ('' = plain wall).
    function buildPayload(selectedId: string): WallTypeApplyPayload {
        const newType = selectedId ? typeStore?.getById?.(selectedId) : null;
        return {
            systemTypeId: selectedId || null,
            layers: newType
                ? (structuredClone(newType.layers) as any[]).map((l: any) => ({ ...l }))
                : null,
            thickness: newType
                ? parseFloat(newType.totalThickness.toFixed(6))
                : null,
        };
    }

    // ── Event handlers ────────────────────────────────────────────────────────
    sel.addEventListener('change', () => {
        const v = sel.value;

        if (v === '__duplicate__' || v === '__new__') {
            // Restore the visible selection immediately: opening the editor must not
            // look like a type change, and Cancel must leave the wall exactly as it was.
            sel.value = elementData.systemTypeId ?? '';
            if (!authoring) return;
            _openTypeEditor(
                v === '__new__' ? 'create' : 'duplicate',
                authoring, elementData, typeStore, allTypes,
                (newType) => {
                    // The dropdown updates ITSELF. The old prompt flow could not — it
                    // wrote straight to the store with nothing listening — which is why
                    // it had to alert the user to "re-select the wall to see it in the
                    // list". A created type is now immediately selectable, and selected.
                    const opt = document.createElement('option');
                    opt.value = newType.id;
                    opt.textContent = `${newType.name}  (${Math.round(newType.totalThickness * 1000)}mm)`;
                    opt.className = 'wts-opt-dark';
                    sel.insertBefore(opt, sel.querySelector('.wts-opt-sep'));
                    sel.value = newType.id;
                    refreshStrip();
                    // Creating a type does not retype the selected wall — that is a
                    // separate, explicit act (Apply). Consistent with the instance-owned
                    // linkage the editor states.
                },
            );
            return;
        }

        refreshStrip();

        // §WALL-TYPE-PLAN-FIX: in the new-wall pre-draw context (applyOnChange),
        // selecting a type from the dropdown applies it immediately — the user no
        // longer has to ALSO click "Apply" (which is the trap that left plan-drawn
        // walls stuck on the default). The existing-wall properties panel leaves
        // applyOnChange off, so browsing its dropdown still does NOT mutate the wall
        // until Apply is pressed.
        if (opts?.applyOnChange && !v.startsWith('__')) {
            onApply(buildPayload(v));
        }
    });

    applyBtn.addEventListener('click', () => {
        const selectedId = sel.value;

        if (selectedId.startsWith('__')) return;

        // §FIX-WALL-TYPE-APPLY-CLOBBERS-LAYER-EDITS (founder 2026-08-06, ADR-0299) —
        // `buildPayload` ALWAYS re-resolves `layers` from the catalogue definition. When the
        // selected type is the one the wall ALREADY has, that turns Apply into a silent reset
        // of any per-layer thickness the user edited in the LAYERS table directly below — two
        // save buttons a metre apart with opposite semantics, and the destructive one gives no
        // indication it discarded anything.
        //
        // Layers are INSTANCE-owned (see the note at the wall layers editor in
        // PropertyPanelBodyRenderer), so re-applying the SAME type is a no-op by definition:
        // there is no type change to perform, and the instance's stack is not the type's to
        // restore. Re-selecting a DIFFERENT type still re-stamps layers — that is what
        // choosing a new assembly means, and the user chose it explicitly.
        //
        // ADR-0299: never discard user work silently. This does not discard it at all.
        const currentTypeId = (elementData.systemTypeId ?? '') as string;
        if (selectedId === currentTypeId) {
            applyBtn.textContent = '✓ No change';
            applyBtn.style.background = 'rgba(100,116,139,0.5)';
            applyBtn.title =
                'This wall already uses that type. Edit the LAYERS table below to change this ' +
                'wall\'s assembly — Apply would otherwise reset it to the type default.';
            setTimeout(() => {
                applyBtn.textContent = 'Apply';
                applyBtn.style.background = '';
            }, 1800);
            return;
        }

        onApply(buildPayload(selectedId));

        // Visual feedback
        applyBtn.textContent = '✓ Applied';
        applyBtn.style.background = 'rgba(22,163,74,0.6)';
        setTimeout(() => {
            applyBtn.textContent = 'Apply';
            applyBtn.style.background = '';
        }, 1800);
    });

    row.appendChild(sel);
    row.appendChild(strip);
    row.appendChild(applyBtn);
    outer.appendChild(row);
    return outer;
}

// ─── Action helpers ──────────────────────────────────────────────────────────

/**
 * §FEAT-ELEMENT-TYPE-AUTHORING — opens the layer editor and, on save, dispatches the
 * authoring COMMAND.
 *
 * This replaces `_handleDuplicate` / `_handleNewType`, which were:
 *   • `prompt()` + `prompt()` + `alert()` (not a project-compliant surface: a wall
 *     type is a LAYER STACK and a text prompt cannot express one, so every type the
 *     old flow produced was a single default-coloured body layer with a custom name —
 *     the founder's "it falls back to default", meant literally), and
 *   • a DIRECT `typeStore.add(...)` from UI code, which is the P6 violation that cost
 *     undo, AI/collaboration reachability, and any way to refresh the dropdown.
 *
 * The mutation now travels `bus.executeCommand('elementType.create' | '…duplicate')`.
 */
function _openTypeEditor(
    mode: 'create' | 'duplicate',
    authoring: ElementTypeAuthoring,
    elementData: Record<string, any>,
    typeStore: any,
    allTypes: any[],
    onCreated: (newType: { id: string; name: string; totalThickness: number }) => void,
): void {
    const currentId = elementData.systemTypeId;
    const source = currentId ? typeStore?.getById?.(currentId) : null;
    const base = source ?? allTypes[0];

    if (mode === 'duplicate' && !base) {
        // Nothing to copy FROM. Previously an `alert()`; now the editor simply is not
        // opened for an impossible action — and the entry is only reachable when a
        // catalogue exists, so this is a guard, not a user-facing path.
        console.warn('[WallTypeSelectorWidget] Duplicate requested with no source type.');
        return;
    }

    const existingNames = allTypes.map((t: any) => String(t.name).toLowerCase());

    const initial =
        mode === 'duplicate'
            ? {
                // Deep copy — a duplicate must not share layer objects with its source,
                // or editing one would silently edit the other.
                name: _uniqueName(`${base.name} (Copy)`, existingNames),
                description: `Duplicated from "${base.name}"`,
                layers: (structuredClone(base.layers) as any[]).map((l: any) => ({ ...l })),
                ...(base.function !== undefined ? { function: base.function } : {}),
            }
            : {
                name: _uniqueName('Custom Wall Type', existingNames),
                description: '',
                // A sensible STARTING stack, presented for editing rather than committed
                // behind a prompt. The user sees and changes every value before saving.
                layers: [
                    { name: 'External Render', thickness: 0.015, function: 'finish-exterior', materialColor: '#c8bfa8' },
                    { name: 'Structure',       thickness: 0.170, function: 'structure',       materialColor: '#a0a0a0' },
                    { name: 'Plaster',         thickness: 0.015, function: 'finish-interior', materialColor: '#f0ece4' },
                ],
            };

    openWallTypeEditor({
        mode,
        authoring,
        initial: initial as any,
        existingNames,
        onSave: (draft) => {
            window.runtime?.bus?.executeCommand(
                mode === 'create' ? 'elementType.create' : 'elementType.duplicate',
                { family: 'wall', draft } as any,
            )
                ?.then(() => {
                    // Resolve the freshly created record from the store — the command
                    // mints the id, so the UI must READ it back rather than guess it.
                    const created = typeStore?.getAll?.()
                        .find((t: any) => t.name === draft.name);
                    if (created) onCreated(created);
                    else console.warn('[WallTypeSelectorWidget] Type created but not found in catalogue:', draft.name);
                })
                ?.catch((e: unknown) =>
                    console.warn(`[WallTypeSelectorWidget] ${mode} wall type failed:`, e));
        },
    });
}

/** Appends " 2", " 3", … until the name is free. Collision is resolved, never ignored. */
function _uniqueName(candidate: string, taken: string[]): string {
    if (!taken.includes(candidate.toLowerCase())) return candidate;
    for (let n = 2; n < 999; n++) {
        const next = `${candidate} ${n}`;
        if (!taken.includes(next.toLowerCase())) return next;
    }
    return `${candidate} ${Date.now()}`;
}
