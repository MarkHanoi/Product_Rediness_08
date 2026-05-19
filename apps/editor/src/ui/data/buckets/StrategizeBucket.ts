/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — F3 Data Mode, Bucket 1 (Phase 2.2 + Phase 4.1)
 * File:             src/ui/data/buckets/StrategizeBucket.ts
 * Contract:         05-BIM-UI-ARCHITECTURE-CONTRACT §3 (CSS prefix: strat-)
 *                   01-BIM-ENGINE-CORE-CONTRACT §2 (all writes via CommandManager)
 *                   07-AI-INTEGRATION-CONTRACT §1.1 (AI only via /api/anthropic/v1/messages)
 *
 * StrategizeBucket — Define the Brief (RequirementStore write surface).
 * Power Spreadsheet + Template Master Bar + Equipment Catalog + AI Auto-Briefer.
 *
 * CONTRACT RULES:
 *   - Never call requirementStore.set() directly from UI
 *   - Every edit → UpdateRequirementCommand via the legacy command manager
 *   - AI calls → POST /api/anthropic/v1/messages ONLY
 *   - Drag-to-grid → UpdateRequirementCommand (never direct mutation)
 *   - Asset catalog add → AddAssetCatalogEntryCommand (never direct store mutation)
 *
 * Phase 4.1 audit fix: _populateCatalog now reads from assetCatalogStore (not DEMO_CATALOG).
 * "Add to Catalog" button dispatches AddAssetCatalogEntryCommand via the legacy command manager.
 * Catalog list auto-refreshes on StoreEventBus events for 'AssetCatalogEntry'.
 */

import { requirementStore } from '@pryzm/core-app-model';
import { assetCatalogStore } from '@pryzm/core-app-model';
import { UpdateRequirementCommand } from '@pryzm/command-registry';
import { SetRoomRequirementCommand } from '@pryzm/command-registry';
import { AddAssetCatalogEntryCommand } from '@pryzm/command-registry';
import { storeEventBus } from '@pryzm/core-app-model';

// ── Column definitions ─────────────────────────────────────────────────────────

interface ColDef {
  key: string;
  label: string;
  path: (req: any) => any;
  editable: boolean;
  type: 'text' | 'number' | 'dropdown' | 'pills';
  options?: string[];
}

const COLUMNS: ColDef[] = [
  { key: 'roomId',      label: 'Room ID',       path: r => r.roomId,                                  editable: false, type: 'text' },
  { key: 'template',    label: 'Template',      path: r => r.templateId ?? '—',                       editable: true,  type: 'text' },
  { key: 'targetArea',  label: 'Area m²',       path: r => r.parameters.spatial.targetArea_m2,        editable: true,  type: 'number' },
  { key: 'tolerance',   label: 'Tolerance %',   path: r => r.parameters.spatial.areaTolerance_pct,   editable: true,  type: 'number' },
  { key: 'stc',         label: 'STC dB',        path: r => r.parameters.physics.stc_db,              editable: true,  type: 'number' },
  { key: 'lux',         label: 'Lux',           path: r => r.parameters.physics.lux_task,            editable: true,  type: 'number' },
  { key: 'ach',         label: 'ACH',           path: r => r.parameters.physics.ach,                 editable: true,  type: 'number' },
  { key: 'floorFinish', label: 'Floor Finish',  path: r => r.parameters.finishes.floorFinish,        editable: true,  type: 'dropdown', options: ['Vinyl', 'Ceramic Tile', 'Carpet', 'Concrete', 'Hardwood', 'Epoxy', 'Terrazzo'] },
  { key: 'wallFinish',  label: 'Wall Finish',   path: r => r.parameters.finishes.wallFinish,         editable: true,  type: 'dropdown', options: ['Painted GWB', 'Ceramic Tile', 'Vinyl Wall', 'Exposed Concrete', 'ACM Panel'] },
  { key: 'ceiling',     label: 'Ceiling',       path: r => r.parameters.finishes.ceilingType,        editable: true,  type: 'dropdown', options: ['ACT', 'GWB', 'Exposed Structure', 'Metal Panel', 'GRG'] },
  { key: 'power',       label: 'Power Sockets', path: r => r.parameters.assets.powerSockets,        editable: true,  type: 'number' },
  { key: 'data',        label: 'Data Ports',    path: r => r.parameters.assets.dataPorts,           editable: true,  type: 'number' },
  { key: 'assets',      label: 'Required Assets',path: r => r.parameters.assets.requiredAssets,     editable: true,  type: 'pills' },
];

// ── StrategizeBucket ──────────────────────────────────────────────────────────

export class StrategizeBucket {
  private _el!:              HTMLElement;
  private _brieferBar!:      HTMLElement;
  private _brieferInput!:    HTMLInputElement;
  private _brieferVisible    = false;
  private _templateBar!:     HTMLElement;
  private _gridContainer!:   HTMLElement;
  private _catalogSidebar!:  HTMLElement;
  private _catalogVisible    = false;
  private _catalogList!:     HTMLElement;
  private _catalogAddForm!:  HTMLElement;
  private _catalogAddVisible = false;
  private _selectedRooms:    Set<string> = new Set();

  /** Phase B (S73-WIRE) — runtime threaded by parent. */
  public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

  constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
      this.runtime = runtime;
    this._buildDOM();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get element(): HTMLElement { return this._el; }

  setSelectedRooms(roomIds: Set<string>): void {
    this._selectedRooms = roomIds;
    this._renderGrid();
  }

  refresh(): void { this._renderGrid(); }

  // ── DOM construction ───────────────────────────────────────────────────────

  private _buildDOM(): void {
    this._el = document.createElement('div');
    this._el.className = 'strat-shell';
    this._el.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';

    const header = document.createElement('div');
    header.className = 'strat-header';
    header.innerHTML = `
      <span>✏️  STRATEGIZE — Define the Brief</span>
      <div style="display:flex;gap:6px;">
        <button class="strat-briefer-toggle" title="AI Auto-Briefer">🪄 AI Brief</button>
        <button class="strat-catalog-toggle" title="Equipment Catalog">📦 Catalog</button>
      </div>
    `;

    header.querySelector('.strat-briefer-toggle')?.addEventListener('click', () => this._toggleBriefingBar());
    header.querySelector('.strat-catalog-toggle')?.addEventListener('click', () => this._toggleCatalog());
    this._el.appendChild(header);

    this._brieferBar = this._buildBrieferBar();
    this._brieferBar.style.display = 'none';
    this._el.appendChild(this._brieferBar);

    this._templateBar = this._buildTemplateBar();
    this._el.appendChild(this._templateBar);

    const contentRow = document.createElement('div');
    contentRow.style.cssText = 'display:flex;flex:1;overflow:hidden;';

    this._gridContainer = document.createElement('div');
    this._gridContainer.className = 'strat-grid-container';
    contentRow.appendChild(this._gridContainer);

    this._catalogSidebar = this._buildCatalogSidebar();
    this._catalogSidebar.style.display = 'none';
    contentRow.appendChild(this._catalogSidebar);

    this._el.appendChild(contentRow);
    this._renderGrid();
  }

  private _buildBrieferBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'strat-autobriefing-bar';

    this._brieferInput = document.createElement('input');
    this._brieferInput.type        = 'text';
    this._brieferInput.placeholder = '🪄 Describe your project requirements…';

    const btn = document.createElement('button');
    btn.className   = 'strat-autobriefing-btn';
    btn.textContent = 'Generate';
    btn.addEventListener('click', () => this._onAIGenerate());
    this._brieferInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._onAIGenerate();
    });

    bar.appendChild(this._brieferInput);
    bar.appendChild(btn);
    return bar;
  }

  private _buildTemplateBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'strat-template-bar';
    bar.innerHTML = `
      <span>📋 Template: <strong>Default</strong></span>
      <span style="color:var(--app-text-muted);font-size:10px;">Overrides shown in dark text</span>
      <button class="strat-propagate-btn" title="Apply template to all rooms">🔄 Propagate All</button>
    `;

    bar.querySelector('.strat-propagate-btn')?.addEventListener('click', () => this._onPropagateAll());
    return bar;
  }

  private _buildCatalogSidebar(): HTMLElement {
    const sidebar = document.createElement('div');
    sidebar.className = 'strat-catalog-sidebar';

    // Header with "+" add button
    const header = document.createElement('div');
    header.className = 'strat-catalog-header';
    const headerLabel = document.createElement('span');
    headerLabel.textContent = '📦 Equipment Catalog';
    const addBtn = document.createElement('button');
    addBtn.className = 'strat-catalog-add-btn';
    addBtn.title = 'Add new equipment type';
    addBtn.textContent = '+';
    header.appendChild(headerLabel);
    header.appendChild(addBtn);

    // Add-item form (hidden until "+" clicked)
    this._catalogAddForm = this._buildCatalogAddForm();
    this._catalogAddForm.style.display = 'none';

    const search = document.createElement('div');
    search.className = 'strat-catalog-search';
    const searchInput = document.createElement('input');
    searchInput.type        = 'text';
    searchInput.placeholder = 'Search equipment…';
    search.appendChild(searchInput);

    this._catalogList = document.createElement('div');
    this._catalogList.className = 'strat-catalog-list';
    this._catalogList.id = 'strat-catalog-list';

    sidebar.appendChild(header);
    sidebar.appendChild(this._catalogAddForm);
    sidebar.appendChild(search);
    sidebar.appendChild(this._catalogList);

    this._refreshCatalogList();

    // Toggle "+" form
    addBtn.addEventListener('click', () => {
      this._catalogAddVisible = !this._catalogAddVisible;
      this._catalogAddForm.style.display = this._catalogAddVisible ? 'block' : 'none';
      addBtn.classList.toggle('strat-catalog-add-btn--active', this._catalogAddVisible);
    });

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase();
      this._catalogList.querySelectorAll<HTMLElement>('.strat-catalog-card').forEach(card => {
        card.style.display = card.textContent!.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    // Subscribe to AssetCatalogStore changes — long-lived singleton, no teardown needed
    storeEventBus.subscribe((ev) => {
      if (ev.elementType === 'AssetCatalogEntry') {
        this._refreshCatalogList();
      }
    });

    return sidebar;
  }

  /**
   * Builds the inline "Add new equipment type" form.
   * On submit dispatches AddAssetCatalogEntryCommand via the legacy command manager.
   */
  private _buildCatalogAddForm(): HTMLElement {
    const form = document.createElement('div');
    form.className = 'strat-catalog-add-form';

    const CATEGORIES = [
      'medical-imaging', 'patient-care', 'diagnostic', 'sterilization',
      'laboratory', 'it-infrastructure', 'furniture', 'hvac', 'other',
    ] as const;

    form.innerHTML = `
      <div class="strat-catalog-add-row">
        <label class="strat-catalog-add-label">Name</label>
        <input class="strat-catalog-add-input" id="scat-name" type="text" placeholder="e.g. CT Scanner" />
      </div>
      <div class="strat-catalog-add-row">
        <label class="strat-catalog-add-label">Category</label>
        <select class="strat-catalog-add-select" id="scat-cat">
          ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div class="strat-catalog-add-row strat-catalog-add-dims">
        <div>
          <label class="strat-catalog-add-label">W (mm)</label>
          <input class="strat-catalog-add-input strat-catalog-add-dim" id="scat-w" type="number" min="1" placeholder="Width" />
        </div>
        <div>
          <label class="strat-catalog-add-label">D (mm)</label>
          <input class="strat-catalog-add-input strat-catalog-add-dim" id="scat-d" type="number" min="1" placeholder="Depth" />
        </div>
        <div>
          <label class="strat-catalog-add-label">H (mm)</label>
          <input class="strat-catalog-add-input strat-catalog-add-dim" id="scat-h" type="number" min="1" placeholder="Height" />
        </div>
      </div>
      <div class="strat-catalog-add-actions">
        <button class="strat-catalog-add-cancel">Cancel</button>
        <button class="strat-catalog-add-submit">Add</button>
      </div>
      <div class="strat-catalog-add-error" id="scat-error" style="display:none"></div>
    `;

    const nameInput   = form.querySelector<HTMLInputElement>('#scat-name')!;
    const catSelect   = form.querySelector<HTMLSelectElement>('#scat-cat')!;
    const wInput      = form.querySelector<HTMLInputElement>('#scat-w')!;
    const dInput      = form.querySelector<HTMLInputElement>('#scat-d')!;
    const hInput      = form.querySelector<HTMLInputElement>('#scat-h')!;
    const errorEl     = form.querySelector<HTMLElement>('#scat-error')!;
    const submitBtn   = form.querySelector<HTMLButtonElement>('.strat-catalog-add-submit')!;
    const cancelBtn   = form.querySelector<HTMLButtonElement>('.strat-catalog-add-cancel')!;

    const showError = (msg: string) => {
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    };
    const clearError = () => { errorEl.style.display = 'none'; };

    cancelBtn.addEventListener('click', () => {
      this._catalogAddVisible = false;
      this._catalogAddForm.style.display = 'none';
      nameInput.value = '';
      wInput.value = '';
      dInput.value = '';
      hInput.value = '';
      clearError();
    });

    submitBtn.addEventListener('click', () => {
      clearError();
      const name      = nameInput.value.trim();
      const category  = catSelect.value as typeof CATEGORIES[number];
      const w         = parseFloat(wInput.value);
      const d         = parseFloat(dInput.value);
      const h         = parseFloat(hInput.value);

      if (!name)             { showError('Name is required.');              return; }
      if (!(w > 0))          { showError('Width must be a positive number.'); return; }
      if (!(d > 0))          { showError('Depth must be a positive number.'); return; }
      if (!(h > 0))          { showError('Height must be a positive number.'); return; }

      const id = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const cmd = new AddAssetCatalogEntryCommand({
        id,
        name,
        category,
        width_mm:  w,
        depth_mm:  d,
        height_mm: h,
      });

      const cmdManager = window.commandManager; // TODO(E.5.x): legacy commandManager — replace with runtime.bus.executeCommand(name, payload)
      if (!cmdManager) {
        showError('Command manager not ready — please try again.');
        return;
      }

      const result = cmdManager.execute(cmd, { source: 'HUMAN_DIRECT' });
      if (result && result.success === false) {
        showError(result.error ?? 'Failed to add equipment.');
        return;
      }

      console.log(`[StrategizeBucket] AddAssetCatalogEntryCommand dispatched for "${name}" (${id})`);

      // Reset and close form
      nameInput.value = '';
      wInput.value    = '';
      dInput.value    = '';
      hInput.value    = '';
      this._catalogAddVisible = false;
      this._catalogAddForm.style.display = 'none';
    });

    return form;
  }

  /**
   * Re-renders the catalog list from assetCatalogStore.getAll().
   * Called on construction and on every AssetCatalogEntry StoreEventBus event.
   */
  private _refreshCatalogList(): void {
    const list = this._catalogList;
    if (!list) return;
    list.innerHTML = '';

    const entries = assetCatalogStore.getAll();

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'strat-catalog-empty';
      empty.textContent = 'No equipment in catalog. Click + to add.';
      list.appendChild(empty);
      return;
    }

    for (const entry of entries) {
      const p   = entry.parameters;
      const card = document.createElement('div');
      card.className = 'strat-catalog-card';
      card.draggable = true;
      card.dataset.assetId = entry.id;

      card.innerHTML = `
        <span class="strat-catalog-icon">🔧</span>
        <div>
          <div class="strat-catalog-name">${p.name}</div>
          <div class="strat-catalog-meta">${p.category}  ·  ${p.width_mm}×${p.depth_mm} mm</div>
        </div>
      `;

      card.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData('text/plain', entry.id);
        e.dataTransfer!.effectAllowed = 'copy';
      });

      list.appendChild(card);
    }
  }

  // ── Grid rendering ─────────────────────────────────────────────────────────

  private _renderGrid(): void {
    const requirements = requirementStore.getAll();
    const filtered = this._selectedRooms.size > 0
      ? requirements.filter(r => this._selectedRooms.has(r.roomId))
      : requirements;

    if (filtered.length === 0) {
      this._gridContainer.innerHTML = `
        <div style="padding:32px;text-align:center;color:var(--app-text-muted);font-size:13px;">
          No requirements defined.<br>
          <span style="font-size:11px;margin-top:8px;display:block;">
            Select rooms from the Filter Tree, or use the AI Auto-Briefer to generate requirements.
          </span>
        </div>
      `;
      return;
    }

    const table = document.createElement('table');
    table.className = 'strat-grid';

    const thead = document.createElement('thead');
    thead.innerHTML = `<tr>${COLUMNS.map(c => `<th>${c.label}</th>`).join('')}</tr>`;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const req of filtered) {
      const tr = document.createElement('tr');

      for (const col of COLUMNS) {
        const td = document.createElement('td');
        const val = col.path(req);

        if (col.type === 'pills') {
          const pills = Array.isArray(val) ? val : [];
          for (const pid of pills) {
            const pill = document.createElement('span');
            pill.className = 'strat-asset-pill';
            pill.textContent = pid;

            const rm = document.createElement('button');
            rm.className    = 'strat-asset-pill-remove';
            rm.textContent  = '×';
            rm.title        = `Remove ${pid}`;
            rm.addEventListener('click', (e) => {
              e.stopPropagation();
              this._removeAsset(req.id, pid, pills);
            });
            pill.appendChild(rm);
            td.appendChild(pill);
          }

          td.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer!.dropEffect = 'copy'; });
          td.addEventListener('drop', (e) => {
            e.preventDefault();
            const assetId = e.dataTransfer?.getData('text/plain');
            if (assetId) this._addAsset(req.id, assetId, pills);
          });
        } else if (col.editable) {
          td.textContent = val ?? '—';
          td.title = 'Double-click to edit';
          td.addEventListener('dblclick', () => {
            this._inlineEdit(td, req.id, col, val);
          });
        } else {
          td.textContent = val ?? '—';
        }

        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    this._gridContainer.innerHTML = '';
    this._gridContainer.appendChild(table);
  }

  // ── Inline editing ─────────────────────────────────────────────────────────

  private _inlineEdit(td: HTMLElement, reqId: string, col: ColDef, currentVal: any): void {
    const original = td.textContent;
    td.textContent = '';

    let input: HTMLInputElement | HTMLSelectElement;

    if (col.type === 'dropdown' && col.options) {
      const sel = document.createElement('select');
      sel.style.cssText = 'width:100%;font-size:11px;background:var(--app-bg);border:1px solid var(--app-accent);border-radius:3px;padding:2px;color:var(--app-text);';
      for (const opt of col.options) {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        if (opt === currentVal) o.selected = true;
        sel.appendChild(o);
      }
      input = sel;
    } else {
      const inp = document.createElement('input');
      inp.type  = col.type === 'number' ? 'number' : 'text';
      inp.value = String(currentVal ?? '');
      inp.style.cssText = 'width:100%;font-size:11px;background:var(--app-bg);border:1px solid var(--app-accent);border-radius:3px;padding:2px 4px;color:var(--app-text);';
      input = inp;
    }

    td.appendChild(input);
    (input as HTMLInputElement).focus?.();

    const commit = () => {
      const newVal = col.type === 'number' ? parseFloat((input as HTMLInputElement).value) : input.value;
      if (newVal !== currentVal) {
        this._dispatchUpdate(reqId, col.key, newVal);
        td.textContent = String(newVal);
      } else {
        td.textContent = original;
      }
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter') { commit(); input.blur(); }
      if (ke.key === 'Escape') { td.textContent = original; input.blur(); }
    });
  }

  // ── Dispatch helpers ───────────────────────────────────────────────────────

  private _dispatchUpdate(reqId: string, colKey: string, newVal: any): void {
    const cmdManager = window.commandManager; // TODO(E.5.x): legacy commandManager — replace with runtime.bus.executeCommand(name, payload)
    if (!cmdManager) {
      console.warn('[StrategizeBucket] commandManager not available');
      return;
    }

    const patch = this._buildPatch(colKey, newVal);
    if (!patch) return;

    const cmd = new UpdateRequirementCommand({ id: reqId, patch });
    const v   = cmd.canExecute(cmdManager.getContext?.() ?? {});
    if (!v.ok) {
      console.warn(`[StrategizeBucket] UpdateRequirementCommand canExecute failed: ${v.reason}`);
      return;
    }

    cmdManager.execute(cmd, { source: 'HUMAN_DIRECT' });
    console.log(`[StrategizeBucket] UpdateRequirementCommand dispatched — ${colKey} = ${newVal}`);
  }

  private _buildPatch(colKey: string, val: any): any {
    const map: Record<string, any> = {
      template:    { templateId: val },
      targetArea:  { parameters: { spatial: { targetArea_m2: val } } },
      tolerance:   { parameters: { spatial: { areaTolerance_pct: val } } },
      stc:         { parameters: { physics: { stc_db: val } } },
      lux:         { parameters: { physics: { lux_task: val } } },
      ach:         { parameters: { physics: { ach: val } } },
      floorFinish: { parameters: { finishes: { floorFinish: val } } },
      wallFinish:  { parameters: { finishes: { wallFinish: val } } },
      ceiling:     { parameters: { finishes: { ceilingType: val } } },
      power:       { parameters: { assets: { powerSockets: val } } },
      data:        { parameters: { assets: { dataPorts: val } } },
    };
    return map[colKey] ?? null;
  }

  private _addAsset(reqId: string, assetId: string, currentList: string[]): void {
    if (currentList.includes(assetId)) return;
    this._dispatchUpdate(reqId, 'assets', [...currentList, assetId]);
    this._renderGrid();
  }

  private _removeAsset(reqId: string, assetId: string, currentList: string[]): void {
    this._dispatchUpdate(reqId, 'assets', currentList.filter(a => a !== assetId));
    this._renderGrid();
  }

  // ── Template propagation ────────────────────────────────────────────────────

  private _onPropagateAll(): void {
    const cmdManager = window.commandManager; // TODO(E.5.x): legacy commandManager — replace with runtime.bus.executeCommand(name, payload)
    if (!cmdManager) return;

    const requirements = requirementStore.getAll();
    const cmds = requirements.map(req => new UpdateRequirementCommand({
      id: req.id,
      patch: { templateId: req.templateId },
    }));

    if (cmds.length === 0) return;

    const impact = `"This will affect ${cmds.length} rooms."`;
    if (!confirm(`Propagate template to all rooms? ${impact}`)) return;

    if (cmdManager.executeBatch) {
      cmdManager.executeBatch(cmds, { source: 'HUMAN_DIRECT' });
    } else {
      for (const cmd of cmds) cmdManager.execute(cmd, { source: 'HUMAN_DIRECT' });
    }

    console.log(`[StrategizeBucket] Propagated template to ${cmds.length} rooms`);
  }

  // ── AI Auto-Briefer ────────────────────────────────────────────────────────

  private async _onAIGenerate(): Promise<void> {
    const text = this._brieferInput.value.trim();
    if (!text) return;

    const btn = this._brieferBar.querySelector('button')!;
    btn.textContent = '⏳ Generating…';
    btn.setAttribute('disabled', 'true');

    try {
      const res = await fetch('/api/anthropic/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: `You are a BIM requirement specialist. Parse this brief and return a JSON array of RoomRequirement objects.

Brief: "${text}"

Return ONLY a JSON array. Each object must have:
- roomId: string (generate a unique ID like "room-01")
- roomName: string
- templateId: "default"
- parameters.spatial.targetArea_m2: number
- parameters.spatial.areaTolerance_pct: number (5)
- parameters.spatial.clearHeight_mm: number (2700)
- parameters.physics.stc_db: number
- parameters.physics.lux_task: number
- parameters.physics.ach: number (6)
- parameters.finishes.floorFinish: string
- parameters.finishes.wallFinish: string
- parameters.finishes.ceilingType: string
- parameters.assets.requiredAssets: []
- parameters.assets.powerSockets: number
- parameters.assets.dataPorts: number
- parameters.assets.plumbingFixtures: number
- parameters.safety.maxEgressDist_m: number (30)
- parameters.safety.turningCircle_mm: number (1500)
- parameters.safety.sprinklerCount: number

Return valid JSON only, no explanations.`,
          }],
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`AI API error: ${res.status} — ${err}`);
      }

      const data = await res.json();
      const content = data.content?.[0]?.text ?? '';

      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('No JSON array found in response');

      const rooms = JSON.parse(jsonMatch[0]) as any[];
      this._dispatchSetRequirements(rooms);

      this._brieferInput.value = '';
      console.log(`[StrategizeBucket] AI generated ${rooms.length} requirements`);
    } catch (err) {
      console.error('[StrategizeBucket] AI briefer error:', err);
      alert(`AI Briefer error: ${(err as Error).message}`);
    } finally {
      btn.textContent = 'Generate';
      btn.removeAttribute('disabled');
    }
  }

  private _dispatchSetRequirements(rooms: any[]): void {
    const cmdManager = window.commandManager; // TODO(E.5.x): legacy commandManager — replace with runtime.bus.executeCommand(name, payload)
    if (!cmdManager) return;

    const cmds: SetRoomRequirementCommand[] = [];
    for (const room of rooms) {
      const id = `req-${room.roomId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const req = {
        id,
        type: 'RoomRequirement' as const,
        roomId:     room.roomId,
        levelId:    'L01',
        templateId: room.templateId ?? 'default',
        status:     'active' as const,
        parameters: room.parameters,
        overriddenFields: [],
        metadata: {
          createdAt:  Date.now(),
          modifiedAt: Date.now(),
          createdBy:  'ai-briefer',
          version:    1,
        },
      };

      const cmd = new SetRoomRequirementCommand({
        id:         req.id,
        roomId:     req.roomId,
        levelId:    req.levelId,
        name:       (room.name as string | undefined) ?? req.roomId,
        templateId: req.templateId,
        parameters: req.parameters,
      });
      const v   = cmd.canExecute(cmdManager.getContext?.() ?? {});
      if (v.ok) cmds.push(cmd);
    }

    if (cmds.length === 0) return;

    if (cmdManager.executeBatch) {
      cmdManager.executeBatch(cmds, { source: 'HUMAN_DIRECT' });
    } else {
      for (const cmd of cmds) cmdManager.execute(cmd, { source: 'HUMAN_DIRECT' });
    }

    this._renderGrid();
    console.log(`[StrategizeBucket] ${cmds.length} SetRoomRequirementCommand(s) dispatched`);
  }

  // ── Toggle helpers ─────────────────────────────────────────────────────────

  private _toggleBriefingBar(): void {
    this._brieferVisible = !this._brieferVisible;
    this._brieferBar.style.display = this._brieferVisible ? 'flex' : 'none';
    if (this._brieferVisible) this._brieferInput.focus();
  }

  private _toggleCatalog(): void {
    this._catalogVisible = !this._catalogVisible;
    this._catalogSidebar.style.display = this._catalogVisible ? 'flex' : 'none';
  }
}
