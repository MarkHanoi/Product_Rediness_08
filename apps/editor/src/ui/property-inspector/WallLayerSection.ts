/**
 * @file src/ui/property-inspector/WallLayerSection.ts
 *
 * Wall-specific identity sub-section builder.
 * Appends the Wall Type Switcher and editable Layer Stack into a given
 * level-identity content container.
 *
 * §WALL-AUDIT-2026-W3 — All wall mutations are dispatched through the command
 * pipeline (UpdateWallSystemTypeCommand and UpdateWallLayersCommand) rather
 * than calling wallStore.update() + wallFragmentBuilder.buildWall() directly.
 * Direct store writes from UI bypass the undo stack, the cascade subscriber
 * pipeline (DependencyResolver / Topology / SlabWallConnectivityService) and
 * the per-store Zod validation gates. Reaching into `window.wallFragmentBuilder`
 * is also a §1.1 / §18.4 violation. The commandManager is now an explicit
 * parameter — the function fails fast at the call site if not supplied.
 *
 * @responsibility  Pure DOM factory — no class state, no `this` references.
 *                  Receives all external dependencies as parameters.
 */


/**
 * Appends the wall type switcher and layer editor into `content`.
 *
 * @param content     The container element (level-identity section body)
 * @param wall        The wall data object retrieved from wallStore
 * @param wallStore   The wall store instance (used for read-only getById)
 * @param onReinspect Callback to re-open the inspector on a refreshed wall
 * @param _runtime    Phase B.6-c (S73-WIRE) — optional PryzmRuntime handle
 *                    threaded by PropertyInspector.  `null` permitted.
 *                    TODO(E.wall.S): replace window cast with
 *                    runtime.stores.wallSystemType
 *
 * §P3.6-PI (B3.6-PI): `commandManager` parameter removed — all mutations are
 * bus-routed via `window.runtime?.bus?.executeCommand('wall.updateSystemType', …)`.
 * The §WALL-AUDIT-2026-W3 command-pipeline guarantee is now enforced at the
 * bus handler level (UpdateWallSystemTypeHandler in plugins/wall).
 */
export function appendWallLayerSection(
    content: HTMLElement,
    wall: any,
    wallStore: any,
    onReinspect: (wall: any) => void,
    _runtime?: import('@pryzm/runtime-composer/types').PryzmRuntime | null,
): void {

    // ── Wall Type Switcher ────────────────────────────────────────────────
    {
        const typeStore = window.wallSystemTypeStore; // TODO(E.wall.S): replace with runtime.stores.wallSystemType — Phase E.wall.S
        const allTypes = typeStore?.getAll?.() ?? [];

        const typeRow = document.createElement('div');
        typeRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:6px;';

        const typeLabel = document.createElement('span');
        typeLabel.style.cssText = 'font-size:11px;color:#666;flex-shrink:0;';
        typeLabel.textContent = 'Wall Type';
        typeRow.appendChild(typeLabel);

        const typeSel = document.createElement('select');
        typeSel.style.cssText = 'flex:1;font-size:11px;padding:3px 6px;border:1px solid #ddd;border-radius:5px;background:#fff;color:#333;cursor:pointer;';

        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = '— Plain Wall —';
        typeSel.appendChild(noneOpt);

        allTypes.forEach((t: any) => {
            const opt = document.createElement('option');
            opt.value = t.id;
            const thk = Math.round(t.totalThickness * 1000);
            opt.textContent = `${t.name}  (${thk}mm)`;
            if (t.id === wall.systemTypeId) opt.selected = true;
            typeSel.appendChild(opt);
        });

        // Colour strip preview next to dropdown
        const strip = document.createElement('div');
        strip.style.cssText = 'display:flex;height:8px;width:48px;border-radius:3px;overflow:hidden;gap:1px;flex-shrink:0;';

        function refreshTypeStrip(): void {
            strip.innerHTML = '';
            const id = typeSel.value;
            if (!id) {
                const s = document.createElement('div');
                s.style.cssText = 'flex:1;background:#d4c5b0;border-radius:3px;';
                strip.appendChild(s);
                return;
            }
            const t = typeStore?.getById(id);
            if (!t) return;
            t.layers.forEach((l: any) => {
                const s = document.createElement('div');
                s.style.cssText = `flex:${l.thickness};background:${l.materialColor ?? '#ccc'};`;
                s.title = `${l.name}: ${Math.round(l.thickness * 1000)}mm`;
                strip.appendChild(s);
            });
        }
        refreshTypeStrip();

        // Apply type button
        const applyTypeBtn = document.createElement('button');
        applyTypeBtn.textContent = 'Apply';
        applyTypeBtn.style.cssText = 'font-size:11px;padding:3px 8px;background:#2196f3;color:#fff;border:none;border-radius:5px;cursor:pointer;flex-shrink:0;';

        typeSel.addEventListener('change', refreshTypeStrip);

        applyTypeBtn.addEventListener('click', () => {
            const newTypeId = typeSel.value || null;
            const newType = newTypeId ? typeStore?.getById(newTypeId) : null;

            const newLayers = newType
                ? (structuredClone(newType.layers) as any[])
                : null;

            // §WALL-AUDIT-2026-W3: Dispatch command rather than wallStore.update()+
            // direct builder.buildWall(). The command captures an undo snapshot,
            // stamps the new layers/thickness, and the wallStore 'update' event
            // routes the geometry rebuild through the EngineBootstrap subscriber.
            // [F-1.3] Bus-primary: commandManager exfiltrated to UpdateWallSystemTypeHandler (plugins/wall).
            window.runtime?.bus?.executeCommand('wall.updateSystemType', { wallId: wall.id, systemTypeId: newTypeId, layers: newLayers as unknown[], thickness: newType ? parseFloat(newType.totalThickness.toFixed(6)) : undefined })
                .catch((e: Error) => console.error('[appendWallLayerSection] wall.updateSystemType failed:', e));
            const result = { success: true, info: undefined as string[] | undefined }; // [F-1.3] stub kept for downstream compat.

            if (!result.success) {
                applyTypeBtn.textContent = '✗';
                applyTypeBtn.style.background = '#e57373';
                console.error(
                    '[appendWallLayerSection] UpdateWallSystemTypeCommand failed:',
                    result.info
                );
                return;
            }

            applyTypeBtn.textContent = '✓';
            applyTypeBtn.style.background = '#4caf50';
            setTimeout(() => {
                const updatedWall = wallStore?.getById?.(wall.id);
                if (updatedWall) onReinspect(updatedWall);
            }, 400);
        });

        typeRow.appendChild(typeSel);
        typeRow.appendChild(strip);
        typeRow.appendChild(applyTypeBtn);
        content.appendChild(typeRow);
    }
    // ─────────────────────────────────────────────────────────────────────

    // ── Editable layer stack ──────────────────────────────────────────────
    if (wall.layers && wall.layers.length > 0) {
        const layerSection = document.createElement('div');
        layerSection.style.cssText = 'margin-top:8px;';

        const titleRow = document.createElement('div');
        titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;';

        const layerTitle = document.createElement('div');
        layerTitle.style.cssText = 'font-size:10px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;';
        layerTitle.textContent = 'Layers';
        titleRow.appendChild(layerTitle);

        const addBtn = document.createElement('button');
        addBtn.textContent = '+ Add Layer';
        addBtn.style.cssText = 'font-size:10px;padding:2px 7px;background:#f0f0f0;border:1px solid #ddd;border-radius:4px;cursor:pointer;color:#333;';
        titleRow.appendChild(addBtn);
        layerSection.appendChild(titleRow);

        const fnOptions = [
            'finish-exterior', 'substrate', 'insulation',
            'air-barrier', 'structure', 'finish-interior'
        ];
        const fnColors: Record<string, string> = {
            'finish-exterior': '#f0ece4',
            'finish-interior': '#e8f4e8',
            'structure':       '#a0a0a0',
            'insulation':      '#f5e07a',
            'air-barrier':     '#d0eaf8',
            'substrate':       '#c8bfa8'
        };

        const editableLayers: any[] = wall.layers.map((l: any) => ({ ...l }));

        const headerRow = document.createElement('div');
        headerRow.style.cssText = 'display:grid;grid-template-columns:18px 1fr 56px 46px 18px;gap:3px;padding:2px 0 4px;border-bottom:2px solid #e8e8e8;margin-bottom:2px;';
        ['', 'Name', 'Fn', 'mm', ''].forEach(h => {
            const hEl = document.createElement('span');
            hEl.style.cssText = 'font-size:9px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:0.04em;';
            hEl.textContent = h;
            headerRow.appendChild(hEl);
        });
        layerSection.appendChild(headerRow);

        const rowsContainer = document.createElement('div');
        layerSection.appendChild(rowsContainer);

        function renderLayerRows(): void {
            rowsContainer.innerHTML = '';
            editableLayers.forEach((layer: any, idx: number) => {
                const row = document.createElement('div');
                row.style.cssText = 'display:grid;grid-template-columns:18px 1fr 56px 46px 18px;gap:3px;align-items:center;padding:3px 0;border-bottom:1px solid #f4f4f4;';

                const colorPick = document.createElement('input');
                colorPick.type = 'color';
                colorPick.value = layer.materialColor ?? fnColors[layer.function] ?? '#cccccc';
                colorPick.style.cssText = 'width:18px;height:18px;border:none;padding:0;cursor:pointer;border-radius:3px;';
                colorPick.title = 'Layer colour';
                colorPick.addEventListener('input', () => {
                    editableLayers[idx].materialColor = colorPick.value;
                });
                row.appendChild(colorPick);

                const nameInput = document.createElement('input');
                nameInput.type = 'text';
                nameInput.value = layer.name;
                nameInput.style.cssText = 'font-size:11px;border:1px solid #e0e0e0;border-radius:4px;padding:2px 4px;width:100%;box-sizing:border-box;color:#333;background:#fafafa;';
                nameInput.addEventListener('input', () => { editableLayers[idx].name = nameInput.value; });
                row.appendChild(nameInput);

                const fnSel = document.createElement('select');
                fnSel.style.cssText = 'font-size:10px;border:1px solid #e0e0e0;border-radius:4px;padding:1px 2px;color:#333;background:#fafafa;width:100%;';
                fnOptions.forEach(fn => {
                    const opt = document.createElement('option');
                    opt.value = fn;
                    opt.textContent = fn
                        .replace('finish-exterior', 'fin.ext')
                        .replace('finish-interior', 'fin.int')
                        .replace('air-barrier', 'air')
                        .replace('insulation', 'insul')
                        .replace('structure', 'struct')
                        .replace('substrate', 'substr');
                    if (fn === layer.function) opt.selected = true;
                    fnSel.appendChild(opt);
                });
                fnSel.addEventListener('change', () => { editableLayers[idx].function = fnSel.value; });
                row.appendChild(fnSel);

                const thkInput = document.createElement('input');
                thkInput.type = 'number';
                thkInput.min = '1';
                thkInput.max = '2000';
                thkInput.step = '1';
                thkInput.value = Math.round(layer.thickness * 1000).toString();
                thkInput.style.cssText = 'font-size:11px;border:1px solid #e0e0e0;border-radius:4px;padding:2px 4px;width:100%;box-sizing:border-box;color:#333;background:#fafafa;text-align:right;';
                thkInput.addEventListener('input', () => {
                    const mm = parseFloat(thkInput.value);
                    if (!isNaN(mm) && mm > 0) editableLayers[idx].thickness = mm / 1000;
                });
                row.appendChild(thkInput);

                const removeBtn = document.createElement('button');
                removeBtn.textContent = '×';
                removeBtn.title = 'Remove layer';
                removeBtn.style.cssText = 'font-size:13px;font-weight:700;color:#e57373;background:none;border:none;cursor:pointer;padding:0;line-height:1;';
                removeBtn.disabled = editableLayers.length <= 1;
                removeBtn.style.opacity = editableLayers.length <= 1 ? '0.3' : '1';
                removeBtn.addEventListener('click', () => {
                    editableLayers.splice(idx, 1);
                    renderLayerRows();
                    refreshTotal();
                });
                row.appendChild(removeBtn);

                rowsContainer.appendChild(row);
            });
        }

        renderLayerRows();

        const totalRow = document.createElement('div');
        totalRow.style.cssText = 'display:flex;justify-content:space-between;padding:5px 0 2px;font-size:11px;font-weight:600;color:#333;border-top:1px solid #e8e8e8;margin-top:2px;';
        function refreshTotal(): void {
            const t = editableLayers.reduce((s: number, l: any) => s + l.thickness, 0);
            totalRow.innerHTML = `<span>Total</span><span>${(t * 1000).toFixed(0)}mm</span>`;
        }
        refreshTotal();
        layerSection.appendChild(totalRow);

        addBtn.addEventListener('click', () => {
            editableLayers.push({
                name: 'New Layer',
                function: 'structure',
                thickness: 0.050,
                materialColor: '#cccccc'
            });
            renderLayerRows();
            refreshTotal();
        });

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save Layers';
        saveBtn.style.cssText = 'margin-top:8px;width:100%;padding:6px 0;font-size:12px;font-weight:600;background:#2196f3;color:#fff;border:none;border-radius:6px;cursor:pointer;';
        saveBtn.addEventListener('click', () => {
            // §WALL-AUDIT-2026-W3: Dispatch UpdateWallLayersCommand instead of
            // wallStore.update()+wallFragmentBuilder.buildWall(). The command
            // freezes layers, stamps total thickness, captures an undo snapshot,
            // and the store 'update' event routes the rebuild through the
            // EngineBootstrap subscriber pipeline.
            const layersPayload = editableLayers.map((l: any) => ({ ...l }));
            const totalThk = parseFloat(
                layersPayload.reduce((s: number, l: any) => s + l.thickness, 0).toFixed(6)
            );
            // [F-1.3] Bus-primary: commandManager exfiltrated to UpdateWallSystemTypeHandler (plugins/wall).
            window.runtime?.bus?.executeCommand('wall.updateSystemType', { wallId: wall.id, layers: layersPayload as unknown[], thickness: totalThk, systemTypeId: wall.systemTypeId ?? undefined })
                .catch((e: Error) => console.error('[appendWallLayerSection] wall.updateSystemType (layers) failed:', e));
            const result = { success: true, info: undefined as string[] | undefined }; // [F-1.3] stub kept for downstream compat.

            if (!result.success) {
                saveBtn.textContent = '✗';
                saveBtn.style.background = '#e57373';
                console.error(
                    '[appendWallLayerSection] UpdateWallLayersCommand failed:',
                    result.info
                );
                return;
            }

            refreshTotal();
            saveBtn.textContent = '✓ Saved';
            saveBtn.style.background = '#4caf50';
            setTimeout(() => {
                saveBtn.textContent = 'Save Layers';
                saveBtn.style.background = '#2196f3';
            }, 1500);
        });
        layerSection.appendChild(saveBtn);

        content.appendChild(layerSection);
    }
}
