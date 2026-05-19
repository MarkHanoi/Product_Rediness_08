/**
 * `PsetEditorPanel` — DOM/L7 component (Phase 3-B Sprint S57).
 *
 * Per PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md §3.2 lines 822-895.
 *
 * Renders all psets for the selected IFC element with per-property inputs.
 * Edits emit `PsetUpdateCommand` through an injected command bus and emit
 * an OTel `pryzm.ifc.pset-update` span (exit criterion line 1048).
 *
 * No framework dependency — uses plain DOM APIs so the inspector ships with
 * zero React/Vue/Svelte cost.
 */

import type {
  CommandBusLike,
  IFCInspectorMeta,
  PsetUpdateCommand,
  PsetValue,
} from './types.js';
import { emitPsetUpdateSpan } from './otel.js';
import { valueKind } from './commands.js';

/** Escape user-supplied strings before inserting into innerHTML. */
function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: unknown): string {
  return escapeHtml(s);
}

function inputForValue(
  elementId: string,
  psetName: string,
  propName: string,
  propValue: PsetValue,
): string {
  const eId = escapeAttr(elementId);
  const ps = escapeAttr(psetName);
  const pn = escapeAttr(propName);
  if (typeof propValue === 'boolean') {
    return `<input type="checkbox" ${propValue ? 'checked' : ''} `
      + `data-element="${eId}" data-pset="${ps}" data-prop="${pn}">`;
  }
  if (typeof propValue === 'number') {
    return `<input type="number" value="${escapeAttr(propValue)}" `
      + `data-element="${eId}" data-pset="${ps}" data-prop="${pn}">`;
  }
  return `<input type="text" value="${escapeAttr(propValue ?? '')}" `
    + `data-element="${eId}" data-pset="${ps}" data-prop="${pn}">`;
}

export class PsetEditorPanel {
  private readonly panel: HTMLElement;
  private readonly listener: (e: Event) => void;
  private current: IFCInspectorMeta | null = null;

  constructor(
    container: HTMLElement,
    private readonly commandBus: CommandBusLike,
    private readonly emitSpan: typeof emitPsetUpdateSpan = emitPsetUpdateSpan,
  ) {
    this.panel = container.ownerDocument!.createElement('div');
    this.panel.className = 'pset-editor';
    container.appendChild(this.panel);
    this.listener = this.onChange.bind(this);
    this.panel.addEventListener('change', this.listener);
  }

  /** Render the inspector for `meta`. Replaces any previous content. */
  mount(meta: IFCInspectorMeta): void {
    this.current = meta;
    const psets = Object.entries(meta.psets);
    this.panel.innerHTML = `
      <div class="pset-header">
        <div class="pset-meta">
          <label>IFC Type: <span class="read-only">${escapeHtml(meta.typeName)}</span></label>
          <label>GlobalId: <span class="read-only monospace">${escapeHtml(meta.globalId)}</span></label>
          ${meta.name
            ? `<label>Name: <input type="text" value="${escapeAttr(meta.name)}"
                data-field="name" data-element="${escapeAttr(meta.pryzmElementId)}"></label>`
            : ''}
        </div>
      </div>
      <div class="pset-groups">
        ${psets.map(([psetName, props]) => `
          <details class="pset-group" data-pset="${escapeAttr(psetName)}" open>
            <summary><strong>${escapeHtml(psetName)}</strong></summary>
            <table class="pset-table">
              <thead><tr><th>Property</th><th>Value</th></tr></thead>
              <tbody>
                ${Object.entries(props).map(([propName, propValue]) => `
                  <tr data-prop="${escapeAttr(propName)}">
                    <td class="prop-name">${escapeHtml(propName)}</td>
                    <td>${inputForValue(meta.pryzmElementId, psetName, propName, propValue)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </details>
        `).join('')}
        ${psets.length === 0 ? '<p class="pset-empty">No property sets.</p>' : ''}
      </div>
    `;
  }

  /** Strip the panel + remove the change listener. */
  dispose(): void {
    this.panel.removeEventListener('change', this.listener);
    this.panel.remove();
    this.current = null;
  }

  /** Visible for testing — current rendered meta. */
  getCurrentMeta(): IFCInspectorMeta | null {
    return this.current;
  }

  private onChange(e: Event): void {
    const input = e.target as HTMLInputElement | null;
    if (!input || !input.dataset) return;
    const elementId = input.dataset.element;
    const psetName = input.dataset.pset;
    const propName = input.dataset.prop;
    if (!elementId || !psetName || !propName) return;

    const value: PsetValue =
      input.type === 'checkbox' ? input.checked
      : input.type === 'number' ? (input.value === '' ? 0 : Number(input.value))
      : input.value;

    const cmd: PsetUpdateCommand = {
      kind: 'element.updatePset',
      elementId,
      psetName,
      propertyName: propName,
      value,
    };
    try {
      const result = this.commandBus.execute(cmd);
      if (result && typeof (result as Promise<void>).then === 'function') {
        (result as Promise<void>).catch((err) => {
          console.warn('[ifc-inspector] commandBus.execute rejected:', err);
        });
      }
    } finally {
      this.emitSpan({
        elementId,
        psetName,
        propertyName: propName,
        valueType: valueKind(value),
      });
    }
  }
}
