/**
 * @file src/ui/property-inspector/SlabLayerSection.ts
 *
 * Slab-specific identity sub-section builder.
 * Appends the Slab Type Switcher and editable Layer Stack into a given
 * level-identity content container.
 *
 * CONTRACT §05 §2 — all mutations via UpdateSlabLayersCommand (Command system).
 *
 * @responsibility  Pure DOM factory — no class state, no `this` references.
 *                  Receives all external dependencies as parameters.
 */


/**
 * Appends the slab type switcher and layer editor into `content`.
 *
 * @param content     The container element (level-identity section body)
 * @param slab        The slab data object retrieved from slabStore
 * @param onReinspect Callback to re-open the inspector on a new Three.js object
 * @param runtime     Phase B.6-b (S73-WIRE) — optional PryzmRuntime handle threaded by
 *                    PropertyInspector.  All 4 window-global reaches are annotated (typed Window interface)
 *                    with their replacement phase (E.slab.X / E.slab.S / E.5.x).
 *                    Unused until Phase E.slab rewires the stores.
 *                    `null` permitted — behaviour is identical with or without a runtime.
 *                    TODO(E.slab.X/S): replace window casts with runtime.stores.slab.*
 */
export function appendSlabLayerSection(
    content: HTMLElement,
    slab: any,
    onReinspect: (obj: any) => void,
    _runtime?: import('@pryzm/runtime-composer/types').PryzmRuntime | null,
): void {
    // ── Slab Type Switcher ──────────────────────────────────────────────
    {
        const typeStore = window.slabSystemTypeStore; // TODO(E.slab.S): replace with runtime.stores.slabSystemType — Phase E.slab.S
        const allTypes = typeStore?.getAll?.() ?? [];

        const typeRow = document.createElement('div');
        typeRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:6px;';

        const typeLabel = document.createElement('span');
        typeLabel.style.cssText = 'font-size:11px;color:#666;flex-shrink:0;';
        typeLabel.textContent = 'Slab Type';
        typeRow.appendChild(typeLabel);

        const typeSel = document.createElement('select');
        typeSel.style.cssText = 'flex:1;font-size:11px;padding:3px 6px;border:1px solid #ddd;border-radius:5px;background:#fff;color:#333;cursor:pointer;';

        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = '— Plain Slab —';
        typeSel.appendChild(noneOpt);

        allTypes.forEach((t: any) => {
            const opt = document.createElement('option');
            opt.value = t.id;
            const thk = Math.round(t.totalThickness * 1000);
            opt.textContent = `${t.name}  (${thk}mm)`;
            if (t.id === slab.systemTypeId) opt.selected = true;
            typeSel.appendChild(opt);
        });

        // Colour strip preview next to dropdown
        const strip = document.createElement('div');
        strip.style.cssText = 'display:flex;height:8px;width:48px;border-radius:3px;overflow:hidden;gap:1px;flex-shrink:0;';

        function refreshSlabTypeStrip(): void {
            strip.innerHTML = '';
            const id = typeSel.value;
            if (!id) {
                const s = document.createElement('div');
                s.style.cssText = 'flex:1;background:#909090;border-radius:3px;';
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
        refreshSlabTypeStrip();

        // Apply type button
        const applyTypeBtn = document.createElement('button');
        applyTypeBtn.textContent = 'Apply';
        applyTypeBtn.style.cssText = 'font-size:11px;padding:3px 8px;background:#2196f3;color:#fff;border:none;border-radius:5px;cursor:pointer;flex-shrink:0;';

        typeSel.addEventListener('change', refreshSlabTypeStrip);

        applyTypeBtn.addEventListener('click', () => {
            const newTypeId = typeSel.value || null;
            const newType = newTypeId ? typeStore?.getById(newTypeId) : null;

            const newLayers = newType
                ? (structuredClone(newType.layers) as any[]).map((l: any) => Object.freeze({ ...l }))
                : [{ name: 'Concrete', thickness: slab.thickness, function: 'structure', materialColor: '#909090' }];

            const newThickness = newType
                ? parseFloat(newType.totalThickness.toFixed(6))
                : slab.thickness;

            window.runtime?.bus?.executeCommand('slab.update', {
                id: slab.id,
                systemTypeId: newTypeId,
                layers: newLayers,
                thickness: newThickness
            })?.catch((e: Error) => console.error('[SlabLayerSection] slab.update (type) failed:', e));

            applyTypeBtn.textContent = '✓';
            applyTypeBtn.style.background = '#4caf50';
            setTimeout(() => {
                const slabRoot = window.slabBuilder?.getRootById?.(slab.id); // TODO(E.slab.X): replace with runtime.bus.executeCommand(slab.build) — Phase E.slab.X
                if (slabRoot) onReinspect(slabRoot);
            }, 400);
        });

        typeRow.appendChild(typeSel);
        typeRow.appendChild(strip);
        typeRow.appendChild(applyTypeBtn);
        content.appendChild(typeRow);
    }
    // ───────────────────────────────────────────────────────────────────

    // ── Editable layer stack ────────────────────────────────────────────
    if (slab.layers && slab.layers.length > 0) {
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

        const fnOptions: string[] = [
            'finish-surface', 'screed', 'insulation',
            'structure', 'substrate', 'waterproofing'
        ];
        const fnColors: Record<string, string> = {
            'finish-surface': '#e8e0d8',
            'screed':         '#c8bfa8',
            'insulation':     '#f5e07a',
            'structure':      '#909090',
            'substrate':      '#a0a0a0',
            'waterproofing':  '#404040'
        };

        const editableLayers: any[] = slab.layers.map((l: any) => ({ ...l }));

        // Column headers
        const headerRow = document.createElement('div');
        headerRow.style.cssText = 'display:grid;grid-template-columns:18px 1fr 70px 46px 18px;gap:3px;padding:2px 0 4px;border-bottom:2px solid #e8e8e8;margin-bottom:2px;';
        ['', 'Name', 'Fn', 'mm', ''].forEach(h => {
            const hEl = document.createElement('span');
            hEl.style.cssText = 'font-size:9px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:0.04em;';
            hEl.textContent = h;
            headerRow.appendChild(hEl);
        });
        layerSection.appendChild(headerRow);

        const rowsContainer = document.createElement('div');

        const renderLayerRows = () => {
            rowsContainer.innerHTML = '';
            editableLayers.forEach((layer: any, idx: number) => {
                const row = document.createElement('div');
                row.style.cssText = 'display:grid;grid-template-columns:18px 1fr 70px 46px 18px;gap:3px;align-items:center;padding:2px 0;border-bottom:1px solid #f0f0f0;';

                // Colour swatch
                const swatch = document.createElement('div');
                const swatchColor = fnColors[layer.function] ?? layer.materialColor ?? '#ccc';
                swatch.style.cssText = `width:14px;height:14px;border-radius:3px;background:${swatchColor};border:1px solid #ddd;flex-shrink:0;`;
                row.appendChild(swatch);

                // Name input
                const nameInput = document.createElement('input');
                nameInput.type = 'text';
                nameInput.value = layer.name;
                nameInput.style.cssText = 'font-size:11px;padding:2px 4px;border:1px solid #e0e0e0;border-radius:3px;width:100%;box-sizing:border-box;';
                nameInput.addEventListener('input', () => { editableLayers[idx].name = nameInput.value; });
                row.appendChild(nameInput);

                // Function selector
                const fnSel = document.createElement('select');
                fnSel.style.cssText = 'font-size:10px;padding:2px 2px;border:1px solid #e0e0e0;border-radius:3px;width:100%;';
                fnOptions.forEach(fn => {
                    const o = document.createElement('option');
                    o.value = fn;
                    o.textContent = fn.replace('-', ' ');
                    if (fn === layer.function) o.selected = true;
                    fnSel.appendChild(o);
                });
                fnSel.addEventListener('change', () => {
                    editableLayers[idx].function = fnSel.value;
                    const newColor = fnColors[fnSel.value] ?? '#ccc';
                    swatch.style.background = newColor;
                    editableLayers[idx].materialColor = newColor;
                });
                row.appendChild(fnSel);

                // Thickness (mm)
                const thkInput = document.createElement('input');
                thkInput.type = 'number';
                thkInput.min = '1';
                thkInput.step = '1';
                thkInput.value = String(Math.round(layer.thickness * 1000));
                thkInput.style.cssText = 'font-size:11px;padding:2px 4px;border:1px solid #e0e0e0;border-radius:3px;width:100%;box-sizing:border-box;text-align:right;';
                thkInput.addEventListener('input', () => {
                    const mm = parseFloat(thkInput.value);
                    if (!isNaN(mm) && mm > 0) editableLayers[idx].thickness = mm / 1000;
                });
                row.appendChild(thkInput);

                // Remove button
                const removeBtn = document.createElement('button');
                removeBtn.textContent = '×';
                removeBtn.style.cssText = 'font-size:13px;color:#999;background:none;border:none;cursor:pointer;padding:0;line-height:1;';
                removeBtn.title = 'Remove layer';
                removeBtn.addEventListener('click', () => {
                    editableLayers.splice(idx, 1);
                    renderLayerRows();
                    refreshTotal();
                });
                row.appendChild(removeBtn);

                rowsContainer.appendChild(row);
            });
        };

        // Total thickness display
        const totalRow = document.createElement('div');
        totalRow.style.cssText = 'display:flex;justify-content:flex-end;font-size:10px;color:#555;font-weight:600;padding-top:4px;margin-top:2px;border-top:2px solid #e8e8e8;';

        const refreshTotal = () => {
            const total = editableLayers.reduce((s: number, l: any) => s + (l.thickness ?? 0), 0);
            totalRow.textContent = `Total: ${Math.round(total * 1000)}mm`;
        };

        addBtn.addEventListener('click', () => {
            editableLayers.push({ name: 'New Layer', thickness: 0.05, function: 'structure', materialColor: '#909090' });
            renderLayerRows();
            refreshTotal();
        });

        renderLayerRows();
        refreshTotal();
        layerSection.appendChild(rowsContainer);
        layerSection.appendChild(totalRow);

        // Save layers button
        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save Layers';
        saveBtn.style.cssText = 'margin-top:6px;width:100%;font-size:11px;padding:4px 8px;background:#2196f3;color:#fff;border:none;border-radius:5px;cursor:pointer;';
        saveBtn.addEventListener('click', () => {
            const totalThickness = editableLayers.reduce((s: number, l: any) => s + (l.thickness ?? 0), 0);
            window.runtime?.bus?.executeCommand('slab.update', {
                id: slab.id,
                systemTypeId: slab.systemTypeId ?? null,
                layers: editableLayers.map((l: any) => ({ ...l })),
                thickness: parseFloat(totalThickness.toFixed(6))
            })?.catch((e: Error) => console.error('[SlabLayerSection] slab.update (layers) failed:', e));

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
