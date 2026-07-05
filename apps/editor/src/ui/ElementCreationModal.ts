/**
 * ElementCreationModal — Confirmation modal shown when a drawing polygon is committed.
 *
 * CONTRACT COMPLIANCE:
 *   §05-BIM-UI-ARCHITECTURE §2.1  : CSS via AppTheme.ts (ecm- prefix), no independent <style> tags.
 *   §05-BIM-UI-ARCHITECTURE §7.1  : No direct store mutations — callbacks delegate to caller.
 *   §05-BIM-UI-ARCHITECTURE §7.8  : No @thatopen/ui (bim-*) elements — plain native HTML only.
 *   §01-BIM-ENGINE-CORE §1.5      : UI layer only — reads no stores, calls no builders.
 *
 * Appears when the user closes a freeform polygon (double-click, Enter, or click near
 * first point) in any polygon-based drawing tool (Ceiling, Floor, etc.).
 * Displays element parameters that can be adjusted before final creation.
 *
 * Prefix: ecm-
 */

export interface CeilingCreationParams {
  kind: 'ceiling';
  height: number;        // metres above level datum
  thickness: number;     // panel thickness (metres)
  // §FEAT-FLOOR-CREATE-TYPE-PICKER (L-105) — chosen ceiling finish type id (from the
  // shared ceilingSystemTypeStore catalogue). Empty/undefined = "— Plain Ceiling —".
  systemTypeId?: string;
}

export interface FloorCreationParams {
  kind: 'floor';
  thickness: number;     // assembly thickness (metres)
  baseOffset: number;    // Y offset above level datum (metres)
  // §FEAT-FLOOR-CREATE-TYPE-PICKER (L-105) — chosen floor finish type id (from the
  // shared floorSystemTypeStore catalogue — the SAME registry the post-creation FLOOR
  // TYPE dropdown reads). Empty/undefined = "— Plain Floor —".
  systemTypeId?: string;
}

export type ElementCreationParams = CeilingCreationParams | FloorCreationParams;

/** A finish/assembly type surfaced in the creation-panel type picker. Passed IN by
 *  the caller (FloorTool / CeilingTool resolve it from their system-type store) so
 *  the modal stays store-free (§05-BIM-UI §1.5 — UI layer reads no stores). */
export interface CreationTypeOption {
  id: string;
  name: string;
  totalThickness: number;   // metres — used to auto-fill the thickness field on select
}

export interface ElementCreationModalOptions {
  params: ElementCreationParams;
  polygonArea?: number;       // m² — optional, shown as info
  // §FEAT-FLOOR-CREATE-TYPE-PICKER (L-105) — the finish-type catalogue to offer. When
  // provided (and non-empty) a "Finish type" / "Ceiling type" dropdown is rendered at
  // the top of the body; selecting a concrete type auto-fills the thickness field with
  // that type's assembly thickness. Absent/empty → no picker (unchanged behaviour).
  systemTypes?: CreationTypeOption[];
  onConfirm: (params: ElementCreationParams) => void;
  onCancel: () => void;
}

// Phase B.12 (S73-WIRE) — runtime threading per S72 §16.2 row B.12.
export class ElementCreationModal {
  private _el: HTMLElement | null = null;
  private _escHandler: ((e: KeyboardEvent) => void) | null = null;

  /** Phase B.12 (S73-WIRE) — runtime threaded by parent (Layout.ts). */
  public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

  constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
    this.runtime = runtime;
  }

  show(opts: ElementCreationModalOptions): void {
    this.dismiss();
    const { params, polygonArea, systemTypes, onConfirm, onCancel } = opts;
    const isCeiling = params.kind === 'ceiling';
    const elementName = isCeiling ? 'Ceiling' : 'Floor Finish';

    // ── Overlay (backdrop) ────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.className = 'ecm-overlay';

    // ── Card ──────────────────────────────────────────────────────────────────
    const card = document.createElement('div');
    card.className = 'ecm-card';

    // ── Header ────────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'ecm-header';
    header.innerHTML = `
      <span class="ecm-header-icon">${isCeiling ? _svgCeiling() : _svgFloor()}</span>
      <span class="ecm-header-title">${elementName}</span>
      <span class="ecm-header-sep"></span>
      <span class="ecm-header-sub">Set parameters before creating</span>
    `;
    card.appendChild(header);

    // ── Body ──────────────────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'ecm-body';

    // Polygon area info (if provided)
    if (polygonArea != null && polygonArea > 0) {
      const infoRow = document.createElement('div');
      infoRow.className = 'ecm-info-row';
      infoRow.innerHTML = `
        <span class="ecm-info-label">Area</span>
        <span class="ecm-info-value">${polygonArea.toFixed(2)} m²</span>
      `;
      body.appendChild(infoRow);
    }

    // ── Parameter fields ──────────────────────────────────────────────────────
    // Ceiling: height, thickness
    // Floor:   thickness, baseOffset

    let heightInput: HTMLInputElement | null = null;
    let thicknessInput: HTMLInputElement | null = null;
    let baseOffsetInput: HTMLInputElement | null = null;
    let typeSelect: HTMLSelectElement | null = null;

    // §FEAT-FLOOR-CREATE-TYPE-PICKER (L-105) — finish/assembly type selector, sourced
    // from the SAME catalogue the post-creation property-panel dropdown reads. Rendered
    // first so the user picks the finish before dimensions; selecting a concrete type
    // auto-fills the thickness field with that type's assembly thickness.
    if (systemTypes && systemTypes.length > 0) {
      const typeField = _buildTypeField(
        isCeiling ? 'Ceiling type' : 'Finish type',
        isCeiling ? '— Plain Ceiling —' : '— Plain Floor —',
        systemTypes,
        params.systemTypeId,
      );
      typeSelect = typeField.select;
      body.appendChild(typeField.row);
    }

    if (isCeiling) {
      const cParams = params as CeilingCreationParams;

      // Height
      const heightField = _buildField('Height above floor', cParams.height, 'm', 0.1, 10, 0.05);
      heightInput = heightField.input;
      body.appendChild(heightField.row);

      // Thickness
      const thickField = _buildField('Panel thickness', cParams.thickness, 'm', 0.01, 0.5, 0.005);
      thicknessInput = thickField.input;
      body.appendChild(thickField.row);
    } else {
      const fParams = params as FloorCreationParams;

      // Thickness
      const thickField = _buildField('Assembly thickness', fParams.thickness, 'm', 0.01, 0.5, 0.005);
      thicknessInput = thickField.input;
      body.appendChild(thickField.row);

      // Base offset
      const offsetField = _buildField('Base offset', fParams.baseOffset, 'm', 0, 0.5, 0.005);
      baseOffsetInput = offsetField.input;
      body.appendChild(offsetField.row);
    }

    // §FEAT-FLOOR-CREATE-TYPE-PICKER (L-105) — selecting a concrete type auto-fills the
    // assembly/panel thickness with that type's total, so the dimension field always
    // reflects the chosen finish. "Plain" keeps whatever the user typed.
    if (typeSelect && systemTypes) {
      const byId = new Map(systemTypes.map(t => [t.id, t]));
      typeSelect.addEventListener('change', () => {
        const t = byId.get(typeSelect!.value);
        if (t && thicknessInput) thicknessInput.value = t.totalThickness.toFixed(3);
      });
    }

    card.appendChild(body);

    // ── Footer ────────────────────────────────────────────────────────────────
    const footer = document.createElement('div');
    footer.className = 'ecm-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'ecm-btn ecm-btn--cancel';
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => { this.dismiss(); onCancel(); });

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'ecm-btn ecm-btn--confirm';
    confirmBtn.type = 'button';
    confirmBtn.textContent = `Create ${elementName}`;
    confirmBtn.addEventListener('click', () => {
      const result = _collectParams(params, heightInput, thicknessInput, baseOffsetInput, typeSelect);
      this.dismiss();
      onConfirm(result);
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    card.appendChild(footer);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    this._el = overlay;

    // ESC key cancels
    this._escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { this.dismiss(); onCancel(); }
    };
    window.addEventListener('keydown', this._escHandler, { capture: true });

    // Focus confirm button
    setTimeout(() => confirmBtn.focus(), 0);
  }

  dismiss(): void {
    if (this._escHandler) {
      window.removeEventListener('keydown', this._escHandler, { capture: true } as EventListenerOptions);
      this._escHandler = null;
    }
    if (this._el) {
      this._el.remove();
      this._el = null;
    }
  }

  isVisible(): boolean {
    return this._el !== null;
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

interface FieldResult {
  row: HTMLElement;
  input: HTMLInputElement;
}

function _buildField(
  label: string,
  initialValue: number,
  unit: string,
  min: number,
  max: number,
  step: number
): FieldResult {
  const row = document.createElement('div');
  row.className = 'ecm-field';

  const lbl = document.createElement('label');
  lbl.className = 'ecm-field-label';
  lbl.textContent = label;

  const inputRow = document.createElement('div');
  inputRow.className = 'ecm-field-input-row';

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'ecm-field-input';
  input.value = initialValue.toFixed(3);
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);

  const unitSpan = document.createElement('span');
  unitSpan.className = 'ecm-field-unit';
  unitSpan.textContent = unit;

  inputRow.appendChild(input);
  inputRow.appendChild(unitSpan);

  row.appendChild(lbl);
  row.appendChild(inputRow);
  return { row, input };
}

interface TypeFieldResult {
  row: HTMLElement;
  select: HTMLSelectElement;
}

/** §FEAT-FLOOR-CREATE-TYPE-PICKER (L-105) — a labelled <select> of finish types,
 *  reusing the ecm- field chrome. `plainLabel` is the value-'' "no type" option;
 *  `selectedId` pre-selects the caller's current default. */
function _buildTypeField(
  label: string,
  plainLabel: string,
  types: CreationTypeOption[],
  selectedId: string | undefined
): TypeFieldResult {
  const row = document.createElement('div');
  row.className = 'ecm-field';

  const lbl = document.createElement('label');
  lbl.className = 'ecm-field-label';
  lbl.textContent = label;

  const inputRow = document.createElement('div');
  inputRow.className = 'ecm-field-input-row';

  const select = document.createElement('select');
  select.className = 'ecm-field-input';

  const plainOpt = document.createElement('option');
  plainOpt.value = '';
  plainOpt.textContent = plainLabel;
  select.appendChild(plainOpt);

  for (const t of types) {
    const opt = document.createElement('option');
    opt.value = t.id;
    const thkMm = Math.round(t.totalThickness * 1000);
    opt.textContent = `${t.name}  (${thkMm}mm)`;
    if (t.id === selectedId) opt.selected = true;
    select.appendChild(opt);
  }

  inputRow.appendChild(select);
  row.appendChild(lbl);
  row.appendChild(inputRow);
  return { row, select };
}

function _collectParams(
  base: ElementCreationParams,
  heightInput: HTMLInputElement | null,
  thicknessInput: HTMLInputElement | null,
  baseOffsetInput: HTMLInputElement | null,
  typeSelect: HTMLSelectElement | null
): ElementCreationParams {
  // §FEAT-FLOOR-CREATE-TYPE-PICKER (L-105) — empty option value ('') = "Plain", carried
  // through as undefined so the tool creates a plain finish (its existing default path).
  const systemTypeId = typeSelect && typeSelect.value ? typeSelect.value : undefined;
  if (base.kind === 'ceiling') {
    return {
      kind: 'ceiling',
      height:    _readValue(heightInput,    base.height),
      thickness: _readValue(thicknessInput, base.thickness),
      systemTypeId,
    };
  } else {
    return {
      kind: 'floor',
      thickness:  _readValue(thicknessInput, base.thickness),
      baseOffset: _readValue(baseOffsetInput, base.baseOffset),
      systemTypeId,
    };
  }
}

function _readValue(input: HTMLInputElement | null, fallback: number): number {
  if (!input) return fallback;
  const v = parseFloat(input.value);
  return isFinite(v) ? v : fallback;
}

function _svgCeiling(): string {
  return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="16" height="4" rx="1" fill="currentColor" opacity="0.85"/>
    <rect x="3" y="7" width="12" height="1.5" rx="0.75" fill="currentColor" opacity="0.5"/>
    <rect x="5" y="10" width="8" height="1" rx="0.5" fill="currentColor" opacity="0.3"/>
  </svg>`;
}

function _svgFloor(): string {
  return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="13" width="16" height="4" rx="1" fill="currentColor" opacity="0.85"/>
    <rect x="3" y="9.5" width="12" height="1.5" rx="0.75" fill="currentColor" opacity="0.5"/>
    <rect x="5" y="6" width="8" height="1" rx="0.5" fill="currentColor" opacity="0.3"/>
  </svg>`;
}
