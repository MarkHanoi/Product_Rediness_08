/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Generative Design (World Model Layer 4)
 * Phase:             Phase I-1 + Phase 6.2 (command loop closure)
 * Files Modified:    src/ui/generative/BriefInputPanel.ts
 * Classification:    A
 *
 * Two-mode brief input panel.
 *   Mode A — Natural language textarea → AI parses into structured brief.
 *   Mode B — Structured programme table (room type, count, area, adjacency).
 *
 * On "Generate layouts":
 *   1. Emits 'pryzm-generative-generate' CustomEvent so VariantBrowserPanel
 *      can trigger the LayoutGenerator (existing behaviour).
 *   2. [Phase 6.2] Closes the command loop:
 *      - Creates a TemplateDefinition via CreateTemplateCommand for each
 *        unique room type in the brief (deterministic stable ID to avoid
 *        duplicate templates on re-run).
 *      - Assigns each template to matching rooms in RoomStore via
 *        AssignTemplateToNodeCommand (fuzzy name/occupancyType match).
 *      - All mutations go through commandManager — never direct store writes.
 *      - Shows a summary banner: "Created X templates, assigned Y rooms."
 *
 * Advisory cards (from GenerativeDesignAdvisor) appear below the form when
 * layout generation fails.
 *
 * CSS class prefix: dw- (DataWorkbench panel convention)
 */

import type { GenerativeDesignBrief, GenerativeBriefRoom, AdvisorSuggestion } from '@pryzm/ai-host';
import { CreateTemplateCommand } from '@pryzm/command-registry';

interface BriefRoomRow {
    roomType: string;
    count: number;
    minArea_m2: number;
    adjacencyRequirements: string;  // comma-separated string for UI
    circulationRequired: boolean;
}

const DEFAULT_ROWS: BriefRoomRow[] = [
    { roomType: 'Patient Bedroom',   count: 6,  minArea_m2: 12, adjacencyRequirements: 'Staff Base, Treatment Room', circulationRequired: true },
    { roomType: 'Staff Base',        count: 1,  minArea_m2: 20, adjacencyRequirements: 'Patient Bedroom',            circulationRequired: false },
    { roomType: 'Clean Utility',     count: 1,  minArea_m2: 8,  adjacencyRequirements: 'Staff Base',                 circulationRequired: false },
    { roomType: 'Dirty Utility',     count: 1,  minArea_m2: 8,  adjacencyRequirements: 'Staff Base',                 circulationRequired: false },
    { roomType: 'Treatment Room',    count: 1,  minArea_m2: 16, adjacencyRequirements: 'Patient Bedroom',            circulationRequired: true },
    { roomType: 'Patient WC',        count: 6,  minArea_m2: 4,  adjacencyRequirements: 'Patient Bedroom',            circulationRequired: false },
];

const EXAMPLE_NL = `I need a 6-bed HDU with staff base, clean utility, dirty utility, treatment room, and patient toilets adjacent to each bed. Maximum 800m² GIA. NHS HTM template.`;

export class BriefInputPanel {
    private _el: HTMLElement;
    private _mode: 'A' | 'B' = 'A';
    private _rows: BriefRoomRow[] = JSON.parse(JSON.stringify(DEFAULT_ROWS));
    private _bbox = { width_m: 20, depth_m: 40 };
    private _templateSetId = 'NHS HTM 04-01';
    private _generating = false;
    private _parsing = false;
    private _advisoryCards: AdvisorSuggestion[] = [];

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._el = container;
        this._render();
        console.log('[BriefInputPanel] Initialized');
    }

    // ── Rendering ─────────────────────────────────────────────────────────────

    private _render(): void {
        this._el.innerHTML = '';
        this._el.className = 'dw-panel dw-panel--active dw-generative-panel';

        const header = document.createElement('div');
        header.className = 'dw-gen-section-header';
        header.innerHTML = `
            <div class="dw-gen-title">GENERATIVE DESIGN BRIEF</div>
            <div class="dw-gen-mode-toggle">
                <button class="dw-gen-mode-btn${this._mode === 'A' ? ' dw-gen-mode-btn--active' : ''}" data-mode="A">Natural Language</button>
                <button class="dw-gen-mode-btn${this._mode === 'B' ? ' dw-gen-mode-btn--active' : ''}" data-mode="B">Structured Entry</button>
            </div>
        `;
        header.querySelectorAll('.dw-gen-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._mode = (btn as HTMLElement).dataset.mode as 'A' | 'B';
                this._render();
            });
        });
        this._el.appendChild(header);

        if (this._mode === 'A') this._renderModeA();
        else this._renderModeB();

        if (this._advisoryCards.length > 0) this._renderAdvisoryCards();
    }

    // ── Mode A — Natural Language ─────────────────────────────────────────────

    private _renderModeA(): void {
        const wrap = document.createElement('div');
        wrap.className = 'dw-gen-mode-content';
        wrap.innerHTML = `
            <div class="dw-gen-field-label">Describe your space programme</div>
            <textarea class="dw-gen-textarea" id="gen-brief-text" placeholder="${EXAMPLE_NL}" rows="6">${EXAMPLE_NL}</textarea>
            <button class="dw-gen-parse-btn" id="gen-parse-btn">${this._parsing ? '⏳ Parsing…' : '✦ Parse brief with AI'}</button>
            <div class="dw-gen-hint">AI will extract a structured programme for you to review before generating layouts.</div>
        `;
        this._el.appendChild(wrap);

        const parseBtn = wrap.querySelector('#gen-parse-btn') as HTMLButtonElement;
        parseBtn.disabled = this._parsing;
        parseBtn.addEventListener('click', () => this._parseBrief());
    }

    private async _parseBrief(): Promise<void> {
        const textarea = this._el.querySelector('#gen-brief-text') as HTMLTextAreaElement;
        const briefText = textarea?.value?.trim() ?? '';
        if (!briefText) return;

        this._parsing = true;
        this._render();

        try {
            const resp = await fetch('/api/ai/brief/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ briefText, templateOptions: ['NHS HTM 04-01', 'UK-RES-2024', 'BB93-EDU', 'Generic'] }),
            });

            const data = await resp.json() as any;
            if (!resp.ok || !data.brief) {
                this._showError(`Parse failed: ${data?.error ?? 'Unknown error'}`);
                return;
            }

            const brief = data.brief as GenerativeDesignBrief;
            this._rows = brief.rooms.map((r: GenerativeBriefRoom) => ({
                roomType: r.roomType,
                count: r.count,
                minArea_m2: r.minArea_m2,
                adjacencyRequirements: r.adjacencyRequirements.join(', '),
                circulationRequired: r.circulationRequired,
            }));
            this._bbox = brief.boundingBox;
            this._templateSetId = brief.templateSetId;
            this._mode = 'B'; // Switch to Mode B for review
        } catch (e: any) {
            this._showError(`Parse error: ${e.message}`);
        } finally {
            this._parsing = false;
            this._render();
        }
    }

    // ── Mode B — Structured Entry ─────────────────────────────────────────────

    private _renderModeB(): void {
        const wrap = document.createElement('div');
        wrap.className = 'dw-gen-mode-content';

        // Table
        const tableWrap = document.createElement('div');
        tableWrap.className = 'dw-gen-table-wrap';
        tableWrap.innerHTML = `
            <table class="dw-gen-table">
                <thead>
                    <tr>
                        <th>Room Type</th>
                        <th>Count</th>
                        <th>Min Area (m²)</th>
                        <th>Adjacent To</th>
                        <th>Circ.</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody id="gen-rows"></tbody>
            </table>
        `;
        wrap.appendChild(tableWrap);

        const tbody = tableWrap.querySelector('#gen-rows') as HTMLTableSectionElement;
        this._rows.forEach((row, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input class="dw-gen-input" data-field="roomType" data-idx="${i}" value="${this._esc(row.roomType)}"></td>
                <td><input class="dw-gen-input dw-gen-input--num" type="number" min="1" data-field="count" data-idx="${i}" value="${row.count}"></td>
                <td><input class="dw-gen-input dw-gen-input--num" type="number" min="1" data-field="minArea_m2" data-idx="${i}" value="${row.minArea_m2}"></td>
                <td><input class="dw-gen-input dw-gen-input--adj" data-field="adjacencyRequirements" data-idx="${i}" value="${this._esc(row.adjacencyRequirements)}" placeholder="Comma-separated types"></td>
                <td style="text-align:center"><input type="checkbox" data-field="circulationRequired" data-idx="${i}" ${row.circulationRequired ? 'checked' : ''}></td>
                <td><button class="dw-gen-remove-btn" data-remove="${i}">✕</button></td>
            `;
            tbody.appendChild(tr);
        });

        // Bind table inputs
        tableWrap.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            const idx = parseInt(target.dataset.idx ?? '-1', 10);
            const field = target.dataset.field;
            if (idx < 0 || !field) return;
            if (field === 'circulationRequired') {
                this._rows[idx].circulationRequired = target.checked;
            } else if (field === 'count' || field === 'minArea_m2') {
                (this._rows[idx] as any)[field] = parseFloat(target.value) || 0;
            } else {
                (this._rows[idx] as any)[field] = target.value;
            }
        });
        tableWrap.addEventListener('click', (e) => {
            const btn = (e.target as HTMLElement).closest('[data-remove]') as HTMLElement;
            if (!btn) return;
            const idx = parseInt(btn.dataset.remove!, 10);
            this._rows.splice(idx, 1);
            this._render();
        });

        // Add row button
        const addBtn = document.createElement('button');
        addBtn.className = 'dw-gen-add-btn';
        addBtn.textContent = '+ Add room type';
        addBtn.addEventListener('click', () => {
            this._rows.push({ roomType: 'New Room', count: 1, minArea_m2: 10, adjacencyRequirements: '', circulationRequired: false });
            this._render();
        });
        wrap.appendChild(addBtn);

        // Bounding box + template
        const settings = document.createElement('div');
        settings.className = 'dw-gen-settings';
        settings.innerHTML = `
            <div class="dw-gen-settings-row">
                <label class="dw-gen-settings-label">Bounding box</label>
                <div class="dw-gen-bbox">
                    <input type="number" class="dw-gen-input dw-gen-input--num" id="gen-bbox-w" value="${this._bbox.width_m}" min="5" max="500"> m
                    <span class="dw-gen-bbox-sep">×</span>
                    <input type="number" class="dw-gen-input dw-gen-input--num" id="gen-bbox-d" value="${this._bbox.depth_m}" min="5" max="500"> m
                </div>
            </div>
            <div class="dw-gen-settings-row">
                <label class="dw-gen-settings-label">Template set</label>
                <select class="dw-gen-select" id="gen-template-set">
                    ${['NHS HTM 04-01','UK-RES-2024','BB93-EDU','Generic'].map(t =>
                        `<option value="${t}"${t === this._templateSetId ? ' selected' : ''}>${t}</option>`
                    ).join('')}
                </select>
            </div>
        `;
        wrap.appendChild(settings);

        // Generate button
        const genBtn = document.createElement('button');
        genBtn.className = 'dw-gen-generate-btn';
        genBtn.disabled = this._generating;
        genBtn.innerHTML = this._generating ? '⏳ Generating…' : '⊛ Generate layouts (up to 10)';
        genBtn.addEventListener('click', () => this._generate());
        wrap.appendChild(genBtn);

        this._el.appendChild(wrap);

        // Wire bbox + template inputs
        (this._el.querySelector('#gen-bbox-w') as HTMLInputElement)?.addEventListener('change', e => {
            this._bbox.width_m = parseFloat((e.target as HTMLInputElement).value) || 20;
        });
        (this._el.querySelector('#gen-bbox-d') as HTMLInputElement)?.addEventListener('change', e => {
            this._bbox.depth_m = parseFloat((e.target as HTMLInputElement).value) || 40;
        });
        (this._el.querySelector('#gen-template-set') as HTMLSelectElement)?.addEventListener('change', e => {
            this._templateSetId = (e.target as HTMLSelectElement).value;
        });
    }

    // ── Generate ──────────────────────────────────────────────────────────────

    private async _generate(): Promise<void> {
        this._advisoryCards = [];
        const brief = this._buildBrief();
        const validation = this._validateBrief(brief);
        if (validation) { this._showError(validation); return; }

        this._generating = true;
        this._render();

        console.log('[BriefInputPanel] Dispatching generate event with brief:', brief);

        try {
            // 1. Trigger layout generation via event (VariantBrowserPanel listens)
            this.runtime?.events?.emit('pryzm-generative-generate', { brief }); // F.events.15

            // F.7.3 Wave 14 — runtime.ai.dispatch wiring.
            // Notifies the AI relay that a generative brief was submitted so the
            // Phase F.7.3 streaming path can intercept and annotate the brief.
            // Phase F stub: streamCompletion throws RuntimeNotWiredError; Phase C.ai wires relay.
            this.runtime?.bus.executeCommand('ai.brief.generate', { brief });

            // 2. [Phase 6.2] Close the command loop: brief → templates → assignments
            await this._applyBriefAsTemplates(brief);
        } finally {
            this._generating = false;
            this._render();
        }
    }

    // ── Phase 6.2: Command loop — brief → CreateTemplateCommand + AssignTemplateToNodeCommand ──

    /**
     * Converts each unique room type in the brief into a TemplateDefinition
     * (via CreateTemplateCommand) and then assigns that template to any
     * rooms in RoomStore that match by name or occupancyType (fuzzy match).
     *
     * All mutations go through commandManager — never direct store writes.
     * Contract: §07-BIM-SECURITY-CONTRACT §1 / Phase A.1 DependencyResolver.
     */
    private async _applyBriefAsTemplates(brief: GenerativeDesignBrief): Promise<void> {
        const commandManager = window.commandManager; // TODO(E.5.x): legacy commandManager — replace with runtime.bus.executeCommand(name, payload)
        const roomStore      = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
        const templateStore  = window.templateStore; // TODO(F.6.x): legacy templateStore — replace with runtime.viewRegistry templates

        if (!commandManager) {
            console.warn('[BriefInputPanel] commandManager not available — skipping template creation');
            return;
        }

        let templatesCreated = 0;
        let roomsAssigned    = 0;

        // ── Step 1: Create one TemplateDefinition per unique room type ────────
        // Use a deterministic stable ID so re-running the same brief doesn't
        // create duplicate templates.
        const templateIdMap = new Map<string, string>(); // roomType → templateId

        for (const briefRoom of brief.rooms) {
            const slug       = this._slugify(briefRoom.roomType);
            const templateId = `gen-brief-${slug}`;
            templateIdMap.set(briefRoom.roomType, templateId);

            // Skip if already exists (idempotent on re-run)
            if (templateStore?.has?.(templateId)) {
                console.log(`[BriefInputPanel] Template already exists, skipping: ${templateId}`);
                continue;
            }

            const adjacencyRequirements = briefRoom.adjacencyRequirements
                ?.filter(Boolean)
                .map(adj => ({ mustBeAdjacentTo: adj })) ?? [];

            const cmd = new CreateTemplateCommand({
                id:   templateId,
                name: briefRoom.roomType,
                code: this._toCode(briefRoom.roomType),
                scope: 'room',
                description: `Auto-generated from design brief (${this._templateSetId})`,
                isShared: false,
                requirements: {
                    targetArea: {
                        minimum:          briefRoom.minArea_m2,
                        maximum:          briefRoom.maxArea_m2,
                        target:           briefRoom.minArea_m2,
                        tolerancePercent: 10,
                    },
                    ...(adjacencyRequirements.length > 0 ? { adjacencyRequirements } : {}),
                },
                createdBy: 'ai-brief',
                tags: ['generated', 'brief', this._templateSetId.toLowerCase()],
            });

            try {
                // [F-1.3] Bus-primary: commandManager exfiltrated to CreateTemplateHandler (plugins/rooms).
                await window.runtime?.bus?.executeCommand('template.create', {
                    id:   (cmd as any).id,
                    name: (cmd as any).name,
                    scope: (cmd as any).scope ?? 'room',
                    ...(cmd as any),
                });
                templatesCreated++;
                console.log(`[BriefInputPanel] Created template: ${templateId} (${briefRoom.roomType})`);
            } catch (e) {
                console.warn(`[BriefInputPanel] Error creating template ${templateId}:`, e);
            }
        }

        // ── Step 2: Assign templates to matching rooms in RoomStore ───────────
        if (roomStore && templateIdMap.size > 0) {
            const allRooms: any[] = roomStore.getAll?.() ?? [];

            for (const room of allRooms) {
                const matchedType = this._matchRoomType(room, brief.rooms);
                if (!matchedType) continue;

                const templateId = templateIdMap.get(matchedType);
                if (!templateId || !templateStore?.has?.(templateId)) continue;

                try {
                    // [F-1.3] Bus-primary: commandManager exfiltrated to AssignTemplateToNodeHandler (plugins/rooms).
                    await window.runtime?.bus?.executeCommand('template.assignToNode', {
                        nodeId:     room.id,
                        nodeType:   'room',
                        templateId,
                        assignedBy: 'ai-brief',
                    });
                    roomsAssigned++;
                    console.log(`[BriefInputPanel] Assigned template ${templateId} to room ${room.id} (${room.name})`);
                } catch (e) {
                    console.warn(`[BriefInputPanel] Error assigning template to room ${room.id}:`, e);
                }
            }
        }

        // ── Step 3: Show summary ──────────────────────────────────────────────
        if (templatesCreated > 0 || roomsAssigned > 0) {
            const parts: string[] = [];
            if (templatesCreated > 0) parts.push(`${templatesCreated} template${templatesCreated !== 1 ? 's' : ''} created`);
            if (roomsAssigned > 0)    parts.push(`${roomsAssigned} room${roomsAssigned !== 1 ? 's' : ''} assigned`);
            const summary = parts.join(', ');
            console.log(`[BriefInputPanel] Command loop complete — ${summary}`);
            this._showSuccess(`Programme applied: ${summary}. Templates are now visible in the template library and hierarchy tree.`);

            // Notify the hierarchy tree and data workbench to refresh
            this.runtime?.events?.emit('pryzm-sync-state-changed', { source: 'brief-programme' }); // F.events.15
        } else {
            console.log('[BriefInputPanel] Command loop: no new templates created (all already existed or no rooms matched).');
        }
    }

    /**
     * Fuzzy-match a room record from RoomStore against the brief's room types.
     * Returns the first matching roomType string from the brief, or null.
     *
     * Match strategy (in order of specificity):
     *   1. room.occupancyType contains any word from the brief room type (e.g., 'patient')
     *   2. room.name contains any word from the brief room type
     */
    private _matchRoomType(room: any, briefRooms: GenerativeBriefRoom[]): string | null {
        const roomName = (room.name ?? '').toLowerCase();
        const roomOccupancy = (room.occupancyType ?? '').toLowerCase().replace(/-/g, ' ');

        for (const briefRoom of briefRooms) {
            const typeWords = briefRoom.roomType.toLowerCase().split(/\s+/).filter(w => w.length > 3);
            for (const word of typeWords) {
                if (roomOccupancy.includes(word) || roomName.includes(word)) {
                    return briefRoom.roomType;
                }
            }
        }
        return null;
    }

    /** Convert a room type name to a short template code (e.g., "Patient Bedroom" → "AI-PAT-BED") */
    private _toCode(roomType: string): string {
        const words = roomType.toUpperCase().split(/\s+/);
        const abbr  = words.map(w => w.slice(0, 3)).join('-');
        return `AI-${abbr}`.slice(0, 16);
    }

    /** Convert a room type to a URL-safe slug for use as a template ID segment */
    private _slugify(roomType: string): string {
        return roomType.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    /** Called by VariantBrowserPanel when generation fails — show advisory cards. */
    showAdvisoryCards(cards: AdvisorSuggestion[]): void {
        this._advisoryCards = cards;
        this._render();
    }

    private _renderAdvisoryCards(): void {
        const section = document.createElement('div');
        section.className = 'dw-gen-advisory';
        section.innerHTML = `<div class="dw-gen-advisory-title">⚠ No compliant layouts found — suggestions:</div>`;

        for (const card of this._advisoryCards) {
            const cardEl = document.createElement('div');
            cardEl.className = 'dw-gen-advisory-card';
            cardEl.innerHTML = `
                <div class="dw-gen-advisory-card-title">${this._esc(card.title)}</div>
                <div class="dw-gen-advisory-card-desc">${this._esc(card.description)}</div>
                ${card.briefPatch ? `<button class="dw-gen-advisory-apply-btn" data-card-id="${card.id}">Apply suggestion ›</button>` : ''}
            `;
            if (card.briefPatch) {
                cardEl.querySelector('button')?.addEventListener('click', () => {
                    this._applyPatch(card.briefPatch!);
                });
            }
            section.appendChild(cardEl);
        }
        this._el.appendChild(section);
    }

    private _applyPatch(patch: Partial<GenerativeDesignBrief>): void {
        if (patch.boundingBox) {
            this._bbox = { ...this._bbox, ...patch.boundingBox };
        }
        this._mode = 'B';
        this._advisoryCards = [];
        this._render();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private _buildBrief(): GenerativeDesignBrief {
        return {
            rooms: this._rows.map(r => ({
                roomType: r.roomType,
                count: r.count || 1,
                minArea_m2: r.minArea_m2 || 4,
                adjacencyRequirements: r.adjacencyRequirements
                    ? r.adjacencyRequirements.split(',').map(s => s.trim()).filter(Boolean)
                    : [],
                circulationRequired: r.circulationRequired,
            })),
            boundingBox: { ...this._bbox },
            templateSetId: this._templateSetId,
            gridSize_m: 1.0,
            targetGIA_m2: this._rows.reduce((s, r) => s + r.count * r.minArea_m2, 0) * 1.25,
            maxVariants: 10,
        };
    }

    private _validateBrief(brief: GenerativeDesignBrief): string | null {
        if (brief.rooms.length === 0) return 'Add at least one room type.';
        const totalArea = brief.rooms.reduce((s, r) => s + r.count * r.minArea_m2, 0);
        const bboxArea = brief.boundingBox.width_m * brief.boundingBox.depth_m;
        if (totalArea > bboxArea) {
            return `Total room area (${totalArea.toFixed(0)}m²) exceeds bounding box (${bboxArea.toFixed(0)}m²). Increase the bounding box dimensions.`;
        }
        return null;
    }

    private _showError(msg: string): void {
        const existing = this._el.querySelector('.dw-gen-error');
        if (existing) existing.remove();
        const err = document.createElement('div');
        err.className = 'dw-gen-error';
        err.textContent = msg;
        this._el.appendChild(err);
    }

    private _showSuccess(msg: string): void {
        const existing = this._el.querySelector('.dw-gen-success');
        if (existing) existing.remove();
        const box = document.createElement('div');
        box.className = 'dw-gen-success';
        box.textContent = msg;
        this._el.appendChild(box);
        // Auto-dismiss after 8 seconds
        setTimeout(() => box.remove(), 8000);
    }

    private _esc(s: string): string {
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

}
