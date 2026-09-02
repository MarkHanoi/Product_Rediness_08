/**
 * ComponentSection — the placed-component instance property section (UI/UX wave, lane U2).
 * §COMPONENT-INSTANCE-SECTION · UIUX-PLAN §U2 · ADR-0376 D4/D5/D9 · C110 §2.2/§2.4/§3.3 ·
 * C111 §4.1 · C16 CA-3/CA-18/CA-21 · C84 EI-9 · audit R1/R14.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THIS FILE MOUNTS WHAT LANE 4F BUILT. IT REBUILDS NOTHING.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Lane 4F's own §7: the parameter table is *"reachable on three of the four axes and
 * not on the build graph — zero production importers."* This section is the production
 * importer. `createComponentParameterTable` renders every row with its C110 §2.2 source
 * badge and its §SUPERSEDED-DEFAULT warning; this file's job is to FEED it honestly and
 * to carry the user's gestures to the two live verbs:
 *
 *   - type dropdown        → `component.swapType`            (CA-21 read-back)
 *   - row edit / clear     → `component.setInstanceParameter` (CA-21 read-back)
 *
 * ─── ⛔ THE FEED IS THE REAL SEAM, NEVER A COPY (C84 EI-9) ─────────────────────
 * The occurrence is read from the COMPOSED `component` store (the one authority,
 * C84 EI-1); the definition document from the ONE catalogue (`componentCatalog`,
 * lane U0 — the same singleton `PluginRegistry` injects into the handlers); values
 * from `resolveParameter` via `buildParameterTableModel` — the ONE resolver. The
 * store deliberately holds no resolved values (spec §66 F-2's whole mechanism), so
 * there is nothing else this section COULD read without minting a rival.
 *
 * Overrides and type values are passed to the resolver exactly as
 * `bakeFamilyInstance` passes them (boolean → 1/0, nothing else touched — its
 * `coerceOverrides` / `numericTypeValues`, mirrored not imported because neither is
 * exported; flagged there as a candidate seam). ⚠ C110 §3.3's mm/metres delta is
 * INHERITED, not resolved here: the resolver's unit is what
 * `RUNTIME_LENGTH_UNITS_PER_METRE` says (mm today), the table and this section's
 * edit affordance label values from that same seam, and no conversion is minted —
 * the D3 flip is lane 4A's, and the day it lands every label here moves untouched.
 *
 * ─── ⭐ EVERY REFUSAL REACHES THE SCREEN (C16 CA-18) ───────────────────────────
 * §OPENING-PROFILE-PANEL-REACHABILITY measured the defect this section refuses to
 * reproduce: *"`dispatch()` returned `void` and sent every refusal to `console.warn`
 * … a user whose change was correctly refused saw a control that appeared to do
 * nothing."* Here a refused type swap renders UNDER THE DROPDOWN with the handler's
 * own text (both ids — U0 wrote them into the refusal for exactly this), a refused
 * row edit renders AGAINST ITS ROW, and a missing wire (runtime not published,
 * profile-editor opener never wired) states itself by name.
 *
 * ─── ⭐ THE HONEST EMPTY STATE, never stale numbers ────────────────────────────
 * A definition that is NOT LOADED renders the refusal naming the id and the escape
 * hatch (load it) — and NO parameter rows, because a number this section cannot
 * currently resolve is a number it must not show ([[context-data-honesty-family]];
 * C110 §2.5's "nothing has been substituted", applied to the whole table).
 *
 * ─── ⛔ NO STORE WRITES, NO NEW VERBS, NO SCHEMA (P6 / audit R1) ───────────────
 * The section dispatches the two Phase-4C verbs through the composed bus and reads
 * back from the authoritative store. It mints no verb, no schema, no resolver, no
 * refusal channel (reasons ride the bus rejection — C16 CA-3).
 *
 * ─── D5 ────────────────────────────────────────────────────────────────────────
 * Every user-facing string says **Component**. `FamilyParameter`/`FamilyType`/
 * `FamilyDocument` below are the FROZEN wire/API spellings of `@pryzm/family-runtime`
 * and `@pryzm/file-format` (D5 freezes wire and identity names) — quoted, not adopted.
 */

import {
    kindOfDataType,
    type EvalScope,
    type FamilyParameter,
    type FamilyType,
    type ResolverInput,
    type ScopeValue,
} from '@pryzm/family-runtime';
import type { Profile, ReferencePlane } from '@pryzm/file-format';
// ⭐ Lane 4F's deliverable, MOUNTED (its §7 axis 3). The barrel exports surfaces only.
import {
    createComponentParameterTable,
    runtimeUnitLabel,
    type ComponentParameterTableHandle,
    type ParameterTableModel,
} from '../component';
// ⭐ Lane U0's ONE catalogue — the same singleton PluginRegistry injects into the
// handlers, consumed never edited (U2 brief). A catalogue this file built could
// disagree with the one the verbs consult, which is C84 EI-9's two-answers defect.
import { componentCatalog } from '../../services/componentCatalog';
// ⭐ REUSED, not re-implemented: the proven generic picker chrome (label + select +
// Apply, honest-refusal branch) — the U2 plan names it for the type dropdown.
import { buildGenericTypeSelectorWidget } from './GenericTypeSelectorWidget';

/* ------------------------------------------------------------------ */
/* §U2-PROFILE-OPENER-PORT — à la `setWindowOutlineEditorOpener`       */
/* ------------------------------------------------------------------ */

/**
 * The profile-editor opener port (lane 4F's O-1, the seam its §7 names verbatim).
 * This module is a property-panel section and does not own a modal surface; the
 * panel-mounting module (`PropertyPanelBodyRenderer`) wires the L7 dialog in, the
 * same way it wires `openWindowOutlineEditorDialog` into the window section's port.
 *
 * ⚠ A port nobody supplies is a dead feature with an interface attached
 * ([[committed-is-not-reachable]]) — so the BUTTON is honest about it: with no
 * opener wired it renders a named refusal, never a silent no-op (the ARM-B rule).
 */
export interface ComponentProfileEditorRequest {
    /** The definition's display name — for the dialog title. */
    readonly definitionName: string;
    readonly profile: Profile;
    /** The DECLARED plane the profile lives on (§SUBJECT-IS-A-PROFILE-ON-A-DECLARED-PLANE). */
    readonly plane: ReferencePlane;
    /** Resolved parameter scope for expression-valued coordinates. Empty is valid. */
    readonly scope: EvalScope;
}

let _profileEditorOpener: ((req: ComponentProfileEditorRequest) => void) | null = null;
export function setComponentProfileEditorOpener(
    fn: ((req: ComponentProfileEditorRequest) => void) | null,
): void {
    _profileEditorOpener = fn;
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** The narrow occurrence read surface this section needs (the composed store's
 *  `ComponentData` satisfies it; `globals.d.ts` declares the same shape on the
 *  narrow `window.runtime.stores.component` slot). */
interface ComponentOccurrence {
    readonly id: string;
    readonly definitionId: string;
    readonly typeId: string;
    readonly instanceParameters: Readonly<Record<string, number | string | boolean>>;
}

export interface ComponentSectionHandle {
    readonly root: HTMLElement;
    /** Re-read store + catalogue and re-render. */
    refresh(): void;
    /** The panel path for `component.swapType`. Resolves `null` on success, the
     *  handler's refusal text on refusal — and RENDERS that text either way. */
    requestTypeSwap(typeId: string): Promise<string | null>;
    /** Open the inline editor under a parameter row. False when the row is absent. */
    beginEdit(parameterId: string): boolean;
    /** The row path for `component.setInstanceParameter` (SET leg). Raw text is
     *  parsed by the parameter's declared dataType; an unparseable value is sent
     *  AS THE STRING so the handler's `valueShapeRefusal` names the mismatch —
     *  ONE refusal vocabulary, never a second client-side validator (C84 EI-9). */
    submitEdit(parameterId: string, raw: string): Promise<string | null>;
    /** The row path for the CLEAR leg. */
    clearOverride(parameterId: string): Promise<string | null>;
    /** Ask to open a definition profile in the wired profile editor. */
    openProfile(profileId: string): boolean;
    /** The most recently rendered table model, or null. */
    readonly model: ParameterTableModel | null;
    /** The section-level status line — the layer a user reads. */
    readonly statusText: string;
}

/* ------------------------------------------------------------------ */
/* Internals                                                           */
/* ------------------------------------------------------------------ */

const MUTED = '#6b6b76';
const REFUSAL = '#b3261e';

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K, css: string, text?: string,
): HTMLElementTagNameMap[K] {
    const n = document.createElement(tag);
    n.style.cssText = css;
    if (text !== undefined) n.textContent = text;
    return n;
}

/** boolean → 1/0, nothing else touched — `bakeFamilyInstance.coerceOverrides`,
 *  mirrored (see the header). */
function coerceValues(
    raw: Readonly<Record<string, number | string | boolean>>,
): Readonly<Record<string, number | string>> {
    const out: Record<string, number | string> = {};
    for (const [k, v] of Object.entries(raw)) out[k] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
    return out;
}

/** The runtime read, AT CALL TIME (the panel can outlive a boot race), through the
 *  typed narrow window slot — never `(window as any)` (P4). `null` means the wire
 *  is missing and the caller states that by name. */
function liveRuntime(): {
    bus: { executeCommand(cmd: string, payload?: unknown): Promise<void> };
    store: { get(id: string): ComponentOccurrence | undefined };
} | null {
    const rt = window.runtime;
    const store = rt?.stores?.component;
    if (!rt?.bus || !store) return null;
    return { bus: rt.bus, store };
}

const RUNTIME_MISSING =
    'The composed runtime is not available in this session (window.runtime carries no ' +
    'component store), so this Component section cannot read the occurrence — nothing is ' +
    'shown rather than a stale copy.';

/* ------------------------------------------------------------------ */
/* The section                                                         */
/* ------------------------------------------------------------------ */

export function createComponentSection(
    elementData: Readonly<Record<string, unknown>>,
): ComponentSectionHandle {
    const occurrenceId = String(elementData['id'] ?? '');

    const root = el('div',
        // A light card inside the dark panel: the mounted 4F table paints light-theme
        // inks and is REUSED as built (mount, don't rebuild) — the card keeps it legible.
        'grid-column:1/-1;background:#ffffff;border-radius:6px;padding:10px;margin:8px 0;' +
        'font:13px/1.45 system-ui,sans-serif;color:#1a1a1a;');
    root.setAttribute('data-cs-root', occurrenceId);

    const status = el('div', `margin-top:6px;min-height:14px;font-size:11.5px;color:${MUTED};`);
    status.setAttribute('data-cs-status', '');
    const setStatus = (msg: string, isRefusal = false): void => {
        status.textContent = msg;
        status.style.color = isRefusal ? REFUSAL : MUTED;
        status.setAttribute('data-cs-status-kind', isRefusal ? 'refusal' : 'info');
    };

    const table: ComponentParameterTableHandle = createComponentParameterTable();
    let model: ParameterTableModel | null = null;
    /** Parameters of the loaded definition, by id — the parse table for `submitEdit`. */
    let paramsById = new Map<string, FamilyParameter>();
    let openEditorFor: string | null = null;

    /* ── dispatch — refusals RETURNED and RENDERED, never swallowed ── */
    async function dispatch(cmd: string, payload: unknown): Promise<string | null> {
        const live = liveRuntime();
        if (live === null) return RUNTIME_MISSING;
        try {
            await live.bus.executeCommand(cmd, payload);
            return null;
        } catch (e) {
            return e instanceof Error ? e.message : String(e);
        }
    }

    /** A refusal rendered AGAINST ITS ROW (C110 §2.4's lesson: a message not
     *  attached to its subject is a message the author never finds). */
    function renderRowRefusal(parameterId: string, text: string): void {
        // Clear any previous refusal for the row, then insert directly after it.
        root.querySelector(`[data-cs-row-refusal="${parameterId}"]`)?.remove();
        const row = table.root.querySelector(`tr[data-cpt-row="${parameterId}"]`);
        if (!(row instanceof HTMLTableRowElement)) { setStatus(text, true); return; }
        const tr = document.createElement('tr');
        tr.setAttribute('data-cs-row-refusal', parameterId);
        const td = el('td', `padding:0 8px 8px;font-size:11.5px;color:${REFUSAL};`, `⛔ ${text}`);
        td.colSpan = 5;
        tr.appendChild(td);
        row.insertAdjacentElement('afterend', tr);
    }

    /* ── inline row editor (the section's affordance; the table stays 4F's) ── */
    function closeEditor(): void {
        root.querySelector('[data-cs-edit]')?.remove();
        openEditorFor = null;
    }

    function beginEdit(parameterId: string): boolean {
        const p = paramsById.get(parameterId);
        const row = table.root.querySelector(`tr[data-cpt-row="${parameterId}"]`);
        if (!p || !(row instanceof HTMLTableRowElement)) return false;
        closeEditor();
        openEditorFor = parameterId;

        const tr = document.createElement('tr');
        tr.setAttribute('data-cs-edit', parameterId);
        const td = el('td', 'padding:4px 8px 10px;');
        td.colSpan = 5;

        const wrap = el('div', 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;');
        const unit = runtimeUnitLabel(p.dataType);
        const input = document.createElement('input');
        input.setAttribute('data-cs-edit-input', parameterId);
        input.style.cssText = 'flex:1;min-width:90px;padding:3px 6px;font:12px ui-monospace,monospace;';
        // ⚠ The placeholder names the unit THE SEAM says the number is in (see header —
        // C110 §3.3 inherited, never typed by hand).
        input.placeholder = unit
            ? `Override value (${unit}, canonical — ADR-0376 D3 seam)`
            : `Override value (${p.dataType})`;
        const current = model?.rows.find((r) => r.parameter.id === parameterId)?.value;
        if (current !== undefined) input.value = String(current);
        wrap.appendChild(input);

        const setBtn = el('button', 'padding:3px 10px;', 'Set override');
        setBtn.setAttribute('data-cs-edit-set', parameterId);
        setBtn.addEventListener('click', () => { void submitEdit(parameterId, input.value); });
        wrap.appendChild(setBtn);

        // "Clear" is offered only when an override EXISTS — offering a gesture whose
        // refusal is guaranteed ("nothing to clear") would be a dead control by design.
        const occ = liveRuntime()?.store.get(occurrenceId);
        if (occ && Object.prototype.hasOwnProperty.call(occ.instanceParameters, parameterId)) {
            const clearBtn = el('button', 'padding:3px 10px;', 'Clear override');
            clearBtn.setAttribute('data-cs-edit-clear', parameterId);
            clearBtn.addEventListener('click', () => { void clearOverride(parameterId); });
            wrap.appendChild(clearBtn);
        }

        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') void submitEdit(parameterId, input.value);
            if (ev.key === 'Escape') closeEditor();
        });

        td.appendChild(wrap);
        tr.appendChild(td);
        row.insertAdjacentElement('afterend', tr);
        input.focus?.();
        return true;
    }

    /** Parse by the DECLARED dataType; an unparseable value is sent AS TYPED so the
     *  handler's `valueShapeRefusal` (C110 §3.5-a) is the one voice naming the
     *  mismatch — this function deliberately refuses nothing itself. */
    function parseRaw(p: FamilyParameter, raw: string): number | string | boolean {
        const t = raw.trim();
        if (p.dataType === 'boolean') {
            if (t === 'true') return true;
            if (t === 'false') return false;
            return raw;
        }
        if (p.dataType === 'string') return raw;
        const n = Number(t);
        return t !== '' && Number.isFinite(n) ? n : raw;
    }

    async function submitEdit(parameterId: string, raw: string): Promise<string | null> {
        const p = paramsById.get(parameterId);
        if (!p) {
            const msg =
                `Parameter ${parameterId} is not among the declared parameters of this ` +
                'section\'s current render (no loaded definition declares it here).';
            renderRowRefusal(parameterId, msg);
            return msg;
        }
        const refusal = await dispatch('component.setInstanceParameter', {
            componentId: occurrenceId,
            parameterId,
            value: parseRaw(p, raw),
        });
        if (refusal !== null) { renderRowRefusal(parameterId, refusal); return refusal; }
        render(); // CA-21: the re-render reads back from the authoritative store.
        return null;
    }

    async function clearOverride(parameterId: string): Promise<string | null> {
        const refusal = await dispatch('component.setInstanceParameter', {
            componentId: occurrenceId,
            parameterId,
            clear: true,
        });
        if (refusal !== null) { renderRowRefusal(parameterId, refusal); return refusal; }
        render();
        return null;
    }

    /* ── type swap (the panel path) ── */
    let swapRefusalEl: HTMLElement | null = null;
    async function requestTypeSwap(typeId: string): Promise<string | null> {
        const refusal = await dispatch('component.swapType', {
            componentId: occurrenceId,
            typeId,
        });
        if (refusal !== null) {
            // ⭐ The refusal names BOTH ids (the U0 handler wrote them in) — rendered
            // under the dropdown, not a toast-and-nothing.
            if (swapRefusalEl) {
                swapRefusalEl.textContent = `⛔ ${refusal}`;
                swapRefusalEl.style.display = '';
            } else {
                setStatus(refusal, true);
            }
            return refusal;
        }
        render();
        return null;
    }

    /* ── profiles ── */
    function openProfile(profileId: string): boolean {
        const live = liveRuntime();
        const occ = live?.store.get(occurrenceId);
        const entry = occ ? componentCatalog.entry(occ.definitionId) : undefined;
        if (!occ || !entry) {
            setStatus('The definition is not loaded, so its profiles cannot be opened.', true);
            return false;
        }
        const doc = entry.family.document;
        const profile = doc.profiles.find((pr: Profile) => pr.id === profileId);
        if (!profile) {
            setStatus(`Profile ${profileId} is not carried by definition ${occ.definitionId}.`, true);
            return false;
        }
        if (_profileEditorOpener === null) {
            // The ARM-B rule: a missing wire states itself, by name.
            setStatus(
                'The profile editor is not wired in this session ' +
                '(setComponentProfileEditorOpener was never called) — nothing was opened.',
                true,
            );
            root.setAttribute('data-cs-profile-refusal', profileId);
            return false;
        }
        const plane = doc.referencePlanes.find((pl: ReferencePlane) => pl.id === profile.planeId);
        if (!plane) {
            setStatus(
                `Profile '${profile.name}' declares plane ${profile.planeId}, which the ` +
                'definition does not carry — it cannot be drawn on a plane that is not there.',
                true,
            );
            return false;
        }
        // Scope from the LAST RENDERED resolver pass — kinds from each parameter's
        // declared dataType (`kindOfDataType`), values only where the resolver
        // actually produced one. Mirrors `bakeFamilyInstance.buildEvalScope`
        // (unexported; flagged there as a candidate seam).
        const scope: Record<string, ScopeValue> = {};
        if (model?.result.ok) {
            for (const r of model.rows) {
                if (typeof r.value === 'number' && Number.isFinite(r.value)) {
                    scope[r.parameter.name] = { value: r.value, kind: kindOfDataType(r.parameter.dataType) };
                }
            }
        }
        _profileEditorOpener({
            definitionName: componentCatalog.view(occ.definitionId)?.name ?? occ.definitionId,
            profile,
            plane,
            scope,
        });
        return true;
    }

    /* ── render ── */
    function render(): void {
        openEditorFor = null;
        swapRefusalEl = null;
        root.replaceChildren();

        const title = el('div',
            'font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;' +
            `color:${MUTED};margin-bottom:6px;`, 'Component');
        root.appendChild(title);

        const live = liveRuntime();
        if (live === null) {
            const r = el('div', `color:${REFUSAL};font-size:12px;`, `⛔ ${RUNTIME_MISSING}`);
            r.setAttribute('data-cs-refusal', 'runtime-unavailable');
            root.appendChild(r);
            root.appendChild(status);
            setStatus('');
            return;
        }

        const occ = live.store.get(occurrenceId);
        if (occ === undefined) {
            const r = el('div', `color:${REFUSAL};font-size:12px;`,
                `⛔ This component is no longer in the model (${occurrenceId}) — nothing is shown.`);
            r.setAttribute('data-cs-refusal', 'occurrence-missing');
            root.appendChild(r);
            root.appendChild(status);
            setStatus('');
            return;
        }

        const view = componentCatalog.view(occ.definitionId);
        const entry = componentCatalog.entry(occ.definitionId);

        if (view === undefined || entry === undefined) {
            // ⭐ THE HONEST EMPTY/REFUSAL STATE — no rows, no stale numbers. The facts
            // shown below are the OCCURRENCE's own (store truth), never resolved values.
            paramsById = new Map();
            model = null;
            const r = el('div', `color:${REFUSAL};font-size:12px;line-height:1.5;`,
                `⛔ Definition ${occ.definitionId} is not loaded in this project's component ` +
                'catalogue — its parameters cannot resolve against a document that is not ' +
                'there, so no values are shown. Load the definition, then reopen this panel.');
            r.setAttribute('data-cs-def-refusal', occ.definitionId);
            root.appendChild(r);
            const facts = el('div', `margin-top:6px;font-size:11.5px;color:${MUTED};`,
                `Occurrence ${occ.id} · wears type ${occ.typeId} · ` +
                `${Object.keys(occ.instanceParameters).length} instance override(s) recorded ` +
                '(keys only — values are not shown unresolved).');
            facts.setAttribute('data-cs-def-facts', '');
            root.appendChild(facts);
            root.appendChild(status);
            setStatus('');
            return;
        }

        // ── definition header ──
        const name = el('div', 'font-size:13.5px;font-weight:700;', view.name);
        name.setAttribute('data-cs-defname', view.name);
        root.appendChild(name);
        root.appendChild(el('div', `font-size:11px;color:${MUTED};margin-bottom:6px;`,
            `${view.definitionId} · v${view.semver} · ${view.provenance}`));

        // ── type dropdown (REUSED generic picker) → component.swapType ──
        const picker = buildGenericTypeSelectorWidget(
            {
                family: 'component',
                label: 'Component Type',
                listTypes: () => view.types.map((t) => ({ id: t.id, name: t.name })),
                currentTypeId: () => occ.typeId,
            },
            { id: occ.id },
            ({ typeId }) => { void requestTypeSwap(typeId); },
        );
        if (picker) {
            picker.setAttribute('data-cs-type-picker', '');
            root.appendChild(picker);
        }
        swapRefusalEl = el('div',
            `display:none;margin:4px 0 6px;font-size:11.5px;color:${REFUSAL};line-height:1.45;`);
        swapRefusalEl.setAttribute('data-cs-swap-refusal', '');
        root.appendChild(swapRefusalEl);

        // ── the MOUNTED 4F parameter table, fed from the real seams ──
        const doc = entry.family.document;
        // Same cast `bakeFamilyInstance` makes at the same join: the document's Zod-inferred
        // parameters ARE the resolver's structural FamilyParameter shape.
        const parameters = doc.parameters as readonly FamilyParameter[];
        paramsById = new Map(parameters.map((p) => [p.id, p]));
        const fType = doc.types.find((t: { id: string }) => t.id === occ.typeId);
        const type: FamilyType | null = fType
            ? { id: fType.id, name: fType.name, values: coerceValues(fType.values) }
            : null;
        if (!fType) {
            // Store truth can outrun a reloaded definition (swap allowed while loaded,
            // definition later replaced). Stated, not silently resolved to a default.
            const warn = el('div', `font-size:11.5px;color:${REFUSAL};margin:2px 0;`,
                `⚠ The occurrence wears type ${occ.typeId}, which the loaded definition does ` +
                'not declare — rows below resolve WITHOUT type values.');
            warn.setAttribute('data-cs-type-unknown', occ.typeId);
            root.appendChild(warn);
        }
        const input: ResolverInput = {
            parameters,
            type,
            instanceOverrides: coerceValues(occ.instanceParameters),
        };
        model = table.render(input);
        root.appendChild(table.root);

        // Row click → inline editor (the affordance lives HERE; the table stays 4F's).
        table.root.querySelectorAll('tr[data-cpt-row]').forEach((tr) => {
            tr.addEventListener('click', () => {
                const pid = tr.getAttribute('data-cpt-row');
                if (pid !== null && pid !== openEditorFor) beginEdit(pid);
            });
        });

        // ── profiles carried by the definition ──
        if (doc.profiles.length > 0) {
            const head = el('div',
                'font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;' +
                `color:${MUTED};margin:8px 0 4px;`, 'Profiles');
            root.appendChild(head);
            for (const pr of doc.profiles as readonly Profile[]) {
                const row = el('div', 'display:flex;align-items:center;gap:8px;margin:2px 0;');
                row.setAttribute('data-cs-profile', pr.id);
                row.appendChild(el('span', 'font-size:12px;', pr.name));
                const btn = el('button', 'padding:2px 8px;font-size:11.5px;', 'Edit profile…');
                btn.setAttribute('data-cs-profile-open', pr.id);
                btn.addEventListener('click', () => { void openProfile(pr.id); });
                row.appendChild(btn);
                root.appendChild(row);
            }
        }

        root.appendChild(status);
        setStatus('');
    }

    render();

    return {
        root,
        refresh: render,
        requestTypeSwap,
        beginEdit,
        submitEdit,
        clearOverride,
        openProfile,
        get model(): ParameterTableModel | null { return model; },
        get statusText(): string { return status.textContent ?? ''; },
    };
}

/**
 * The panel mount call (`PropertyPanelBodyRenderer`'s Phase-D ladder). Returns the
 * section element, mirroring `buildWindowSection`'s contract at that mount point.
 */
export function buildComponentSection(
    elementData: Readonly<Record<string, unknown>>,
): HTMLElement | null {
    if (typeof elementData['id'] !== 'string' || elementData['id'] === '') return null;
    return createComponentSection(elementData).root;
}
