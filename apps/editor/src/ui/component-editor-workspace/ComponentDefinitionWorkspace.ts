/**
 * ComponentDefinitionWorkspace — the definition-editor workspace (UI/UX wave, lane U3).
 * §U3-DEFINITION-WORKSPACE · UIUX-PLAN §U3 · ADR-0376 D2/D4/D5 · C110 §2.2/§2.4/§2.4-a/§3.3/§4.4 ·
 * C111 §4.1/§4.3-b · C84 EI-9 · audit R1 · [[refusing-half-needs-its-escape-hatch]].
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐⭐ AUTHORING A COMPONENT DEFINITION INSIDE THE MAIN EDITOR — the founder's §64
 *     progressive-parametrisation scenario, end to end: open a loaded definition
 *     from the Components browser → add a parameter → author
 *     `GlassWidth = Width - 2*FrameWidth` with LIVE typed diagnostics → save
 *     through the ONE packer → place → the instance resolves the formula.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ─── THE MUTATION SHAPE, STATED BEFORE ANYONE ASKS (UIUX-PLAN §U3, verbatim) ────
 * A definition is a DOCUMENT, not project state. This workspace holds a draft
 * `{manifest, document, events}` and EVERY edit goes through the family-migrations
 * ops of `@pryzm/file-format` (`makeAddParameterMigrator`,
 * `makeIntroduceExpressionMigrator`, `makeRenameParameterMigrator`,
 * `makeChangeParameterTypeMigrator`, `makeDeleteParameterMigrator`) — the ONLY
 * mutation path for documents. ⛔ NO direct document mutation, no new bus verbs
 * (definition editing is document-layer, not bus-layer — the plan says so), no
 * second validation pipeline: the op's own typed error and the Zod schema's
 * refusal are the two voices, both rendered IN PLACE, never a silent no-op.
 * Ops are applied `from === to === document.formatVersion` — the direct-apply
 * convention `family-migration.test.ts` establishes ('1.0' → '1.0').
 *
 * ─── D4 MADE VISIBLE (C110 §2.2/§2.4-a) ────────────────────────────────────────
 * The expression editor previews the post-op state LIVE through `resolveParameter`
 * (via the 4F table's `buildParameterTableModel` — the ONE resolver, never a
 * rival): typed diagnostics — `expression-parse`, `unknown-identifier`, `cycle`,
 * `unit-mismatch`, all of C110 §4.4's closed set — render as the user types, and
 * a defaultValue the new expression will supersede is announced BEFORE the apply
 * ("will be cleared and recorded as supersededDefault") because
 * `introduce-expression` clears it — that clearing is ADR-0376 D4, not a nicety,
 * and the table renders the `supersededDefault` provenance line afterwards.
 *
 * ─── SAVE-VIA-PACK (C111 · U0's bytes pipeline) ────────────────────────────────
 * SAVE = `packFamily` (Zod-validates manifest + document, canonicalises,
 * recomputes `schemaHash`, deterministic ZIP — the signed-format discipline) →
 * `componentCatalog.loadFromBytes` — the ONE loader U0 wrapped, so the saved
 * definition re-enters exactly the way every definition enters, and every
 * subscriber (browser, property sections, the bake seam) sees the reload. There
 * is no second write path and no direct `entries.set` anywhere.
 *
 * ─── ⚠ LAZY `@pryzm/file-format`, deliberately (lane U0 §5-D2's lesson) ────────
 * The file-format barrel eagerly evaluates pdfjs-dist (`DOMMatrix` at module
 * scope); a static value-import here would put that on the graph of every surface
 * that imports the browser panel. Type imports are erased; the ONE value import
 * is `loadFileFormat()` below — which is also this workspace's falsification
 * seam: sever it and every edit REFUSES LOUDLY (the typed message renders in
 * place), never a silently-lost edit.
 *
 * ─── D5 ────────────────────────────────────────────────────────────────────────
 * Every user-facing string says **Component**. `FamilyDocument`/`FamilyParameter`/
 * `.pryzm-family` below are FROZEN wire/API spellings (ADR-0376 D5), quoted never
 * adopted.
 *
 * ─── WHAT THIS WORKSPACE REFUSES TO PROMISE (UIUX-PLAN §4) ─────────────────────
 * R-a: no boolean-solid tooling — a loaded document carrying one shows the
 *      refusal verbatim in the feature list. R-b: no spline/ellipse buttons.
 * R-n: no shell/thicken/pattern/array. Profile GEOMETRY write-back: the
 *      family-migrations ops export NO profile op (`update-profile` — measured:
 *      `ls family-migrations/ops/` → 8 ops, none touches `document.profiles`),
 *      and minting one outside `@pryzm/file-format` is forbidden to this lane —
 *      so the mounted profile surface states that it cannot persist, BY NAME,
 *      instead of shipping a commit affordance that lies (OWED, recorded in
 *      lane-u3-definition-editor.md).
 */

import type {
    FamilyDocument,
    FamilyEvent,
    FamilyManifest,
    FamilyParameter as PersistedFamilyParameter,
    Migrator,
    Profile,
    RawFamily,
    ReferencePlane,
} from '@pryzm/file-format';
import {
    kindOfDataType,
    type FamilyParameter,
    type FamilyParameterDataType,
    type FamilyType,
    type ResolverDiagnostic,
    type ResolverInput,
    type ScopeValue,
} from '@pryzm/family-runtime';
import { createId, parseId } from '@pryzm/schemas';
// ⭐ Lane 4F's surfaces, MOUNTED not rebuilt (audit R1): the parameter table with
// its C110 §2.2 source badges, and the profile panel over the ONE elevation surface.
import {
    buildParameterTableModel,
    createComponentParameterTable,
    createComponentProfilePanel,
    runtimeUnitLabel,
    type ComponentParameterTableHandle,
    type ParameterTableModel,
} from '../component';
// ⭐ Lane U0's ONE catalogue — the same singleton the handlers and the browser read.
import { componentCatalog } from '../../services/componentCatalog';
// ⭐ Lane U6 — the definition-authoring chat strip (the §64 "author a formula by
// sentence" surface). Deterministic, offline; drives THIS workspace's own
// `previewExpression`/`applyExpression` — no bus verb, no second validation.
import { makeComponentExpressionController, mountComponentChat, type ComponentChatHandle } from '../component-chat';

/* ------------------------------------------------------------------ */
/* §U3-ONE-MUTATION-GATEWAY — the lazy file-format seam                */
/* ------------------------------------------------------------------ */

type FileFormatModule = typeof import('@pryzm/file-format');

let _ffPromise: Promise<FileFormatModule> | null = null;

/** ⛔ THE ONE GATEWAY to `@pryzm/file-format`'s value surface (ops + packer +
 *  schema). Severing this import is the workspace's falsification: every edit
 *  and every save then REFUSES with the load failure rendered in place — the
 *  draft is never mutated by any other route, so nothing can be silently lost. */
async function loadFileFormat(): Promise<FileFormatModule> {
    return await (_ffPromise ??= import('@pryzm/file-format'));
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface ExpressionPreview {
    /** The value the target parameter WOULD resolve to under the current scope. */
    readonly value: number | string | undefined;
    readonly unit: string;
    /** Diagnostics attributable to the target parameter plus pass-level ones. */
    readonly diagnostics: readonly ResolverDiagnostic[];
    /** True iff zero diagnostics attach to the target or the pass. */
    readonly clean: boolean;
    /** The defaultValue `introduce-expression` will clear (D4), or null. */
    readonly willClearDefault: number | string | null;
}

export interface AddParameterFields {
    readonly name: string;
    readonly dataType: FamilyParameterDataType;
    readonly kind: 'type' | 'instance';
    /** Raw default text — parsed by dataType; empty string means "no default". */
    readonly defaultRaw: string;
}

export interface ComponentDefinitionWorkspaceHandle {
    readonly ok: true;
    readonly root: HTMLElement;
    readonly definitionId: string;
    /** The draft document (read-only view — mutation is ops-only). */
    readonly document: FamilyDocument;
    isDirty(): boolean;
    isOpen(): boolean;
    /** Re-feed the table under a type scope (`null` = definition defaults). */
    setScope(typeId: string | null): void;
    /** Open the add-parameter form (DOM). */
    beginAddParameter(): void;
    submitAddParameter(fields: AddParameterFields): Promise<string | null>;
    /** Open the expression editor with live diagnostics under a row. */
    beginExpressionEdit(parameterId: string): boolean;
    /** Pure preview — renders the live diagnostics; mutates nothing. */
    previewExpression(parameterId: string, text: string): ExpressionPreview | null;
    applyExpression(parameterId: string, text: string): Promise<string | null>;
    applyRename(parameterId: string, newName: string): Promise<string | null>;
    applyDataTypeChange(
        parameterId: string, newDataType: FamilyParameterDataType,
    ): Promise<string | null>;
    applyDeleteParameter(parameterId: string): Promise<string | null>;
    /** Mount the 4F profile panel for one of the definition's profiles. */
    openProfile(profileId: string): boolean;
    /** Pack via `packFamily` and reload through the ONE catalogue/loader. */
    save(): Promise<string | null>;
    close(): void;
    readonly model: ParameterTableModel | null;
    readonly statusText: string;
}

export type OpenComponentDefinitionWorkspaceResult =
    | ComponentDefinitionWorkspaceHandle
    | { readonly ok: false; readonly refusal: string };

/* ------------------------------------------------------------------ */
/* Internals                                                           */
/* ------------------------------------------------------------------ */

const INK = '#1a1a1a';
const MUTED = '#6b6b76';
const LINE = '#d8dce3';
const PURPLE = '#6600FF';
const REFUSAL = '#b3261e';
const WARN = '#8a5a00';

const DATA_TYPES: readonly FamilyParameterDataType[] =
    ['length', 'angle', 'number', 'count', 'boolean', 'string'];

/** The message every op failure wears when the gateway itself failed. */
const OPS_UNAVAILABLE =
    'The family-migrations ops could not be loaded from @pryzm/file-format — the edit was ' +
    'NOT applied and the draft is unchanged';

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K, css: string, text?: string,
): HTMLElementTagNameMap[K] {
    const n = document.createElement(tag);
    n.style.cssText = css;
    if (text !== undefined) n.textContent = text;
    return n;
}

/** boolean → 1/0, nothing else touched — mirrors `bakeFamilyInstance`'s private
 *  `numericTypeValues` at the identical join (U2 §2's flagged candidate export). */
function coerceValues(
    raw: Readonly<Record<string, number | string | boolean>>,
): Readonly<Record<string, number | string>> {
    const out: Record<string, number | string> = {};
    for (const [k, v] of Object.entries(raw)) out[k] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
    return out;
}

/** Mint a `par_<ULID>` through the ONE id factory (`createId`) — the ULID comes
 *  from the sanctioned generator; only the frozen wire prefix differs. */
function mintParameterId(): string {
    const parsed = parseId(createId('component'));
    if (parsed === null) throw new Error('[workspace] createId produced an unparseable id');
    return `par_${parsed.ulid}`;
}

/** Parse an authored default by the DECLARED dataType. Deliberately refuses
 *  nothing itself — a wrong shape reaches the Zod schema, the one voice. */
function parseDefault(dataType: FamilyParameterDataType, raw: string): number | string | null {
    const t = raw.trim();
    if (t === '') return null;
    if (dataType === 'string') return raw;
    if (dataType === 'boolean') {
        if (t === 'true') return 1;
        if (t === 'false') return 0;
    }
    const n = Number(t);
    return Number.isFinite(n) ? n : raw;
}

/* ------------------------------------------------------------------ */
/* The workspace                                                       */
/* ------------------------------------------------------------------ */

let _open: { handle: ComponentDefinitionWorkspaceHandle; overlay: HTMLElement } | null = null;

/**
 * Open the Component definition editor for a LOADED definition. One workspace at
 * a time (reopen replaces). An unloaded definition REFUSES by name — the caller
 * (the Components browser) renders the refusal in its own status line.
 */
export function openComponentDefinitionWorkspace(
    definitionId: string,
): OpenComponentDefinitionWorkspaceResult {
    const entry = componentCatalog.entry(definitionId);
    if (entry === undefined) {
        return {
            ok: false,
            refusal:
                `Definition ${definitionId} is not loaded in this project's component ` +
                'catalogue, so there is no document to edit. Load it first ' +
                `(the catalogue holds ${componentCatalog.size()} definition(s)).`,
        };
    }

    // Replace any open workspace — one draft at a time, never two drafts of one truth.
    _open?.handle.close();

    // Captured after the guard: hoisted closures below (render/save) cannot rely on
    // the narrowing of `entry`, and provenance is the one fact they need from it.
    const provenance = entry.provenance;

    /* ── draft state — moved ONLY by the family-migrations ops ── */
    let draft: { manifest: FamilyManifest; document: FamilyDocument; events: readonly FamilyEvent[] } = {
        manifest: entry.family.manifest,
        document: entry.family.document,
        events: entry.family.events,
    };
    let dirty = false;
    let scopeTypeId: string | null = draft.document.types[0]?.id ?? null;
    let model: ParameterTableModel | null = null;

    /* ── chrome ── */
    const overlay = el('div',
        'position:fixed;inset:0;z-index:10060;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(15,15,30,0.55);font-family:system-ui,sans-serif;');
    overlay.setAttribute('data-cdw-overlay', '');
    const card = el('div',
        'width:min(760px,calc(100% - 48px));max-height:min(720px,calc(100% - 48px));display:flex;' +
        'flex-direction:column;overflow-y:auto;background:#fff;color:' + INK + ';border-radius:12px;' +
        'padding:20px;box-shadow:0 24px 64px rgba(0,0,0,0.35);font:13px/1.45 system-ui,sans-serif;');
    card.setAttribute('data-cdw-root', definitionId);
    overlay.appendChild(card);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    const onKeyDown = (e: KeyboardEvent): void => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKeyDown);

    const status = el('div', `margin-top:8px;min-height:16px;font-size:11.5px;color:${MUTED};white-space:pre-wrap;`);
    status.setAttribute('data-cdw-status', '');
    const setStatus = (msg: string, isRefusal = false): void => {
        status.textContent = msg;
        status.style.color = isRefusal ? REFUSAL : MUTED;
        status.setAttribute('data-cdw-status-kind', isRefusal ? 'refusal' : 'info');
    };

    const table: ComponentParameterTableHandle = createComponentParameterTable({ attrPrefix: 'dcpt' });

    /* ── Lane U6 — the authoring chat strip, mounted ONCE into a persistent host so
     *    its transcript survives the card's full-rebuild render (the same node is
     *    re-appended, never re-created). It drives the workspace's own methods only. */
    const chatHost = el('div', 'margin-top:6px;');
    chatHost.setAttribute('data-cdw-chat-host', '');
    let chatHandle: ComponentChatHandle | null = null;
    const ensureChat = (): void => {
        if (chatHandle !== null) return;
        chatHandle = mountComponentChat(chatHost, makeComponentExpressionController({
            params: () => draft.document.parameters as readonly FamilyParameter[],
            preview: (parameterId, expression) => previewExpression(parameterId, expression),
            apply: (parameterId, expression) => applyExpression(parameterId, expression),
        }));
    };

    /* ── the ops gateway (⛔ the ONLY draft mutation) ─────────────────
     * 1. lazy-load @pryzm/file-format (the falsification seam);
     * 2. build the op from ITS factories;
     * 3. `apply` — the op's own typed throw is the refusal, verbatim;
     * 4. Zod-validate the produced document — an invalid document REFUSES
     *    and the draft is untouched;
     * 5. accept + re-render.                                          */
    async function applyOp(
        build: (ff: FileFormatModule) => Migrator,
    ): Promise<{ ok: true } | { ok: false; refusal: string }> {
        let ff: FileFormatModule;
        try {
            ff = await loadFileFormat();
        } catch (e) {
            return { ok: false, refusal: `${OPS_UNAVAILABLE}: ${e instanceof Error ? e.message : String(e)}.` };
        }
        let op: Migrator;
        try {
            op = build(ff);
        } catch (e) {
            return { ok: false, refusal: e instanceof Error ? e.message : String(e) };
        }
        const input: RawFamily = {
            manifest: draft.manifest,
            document: draft.document,
            events: draft.events,
        };
        let next: RawFamily;
        try {
            next = op.apply(input);
        } catch (e) {
            // ⭐ The migration op's OWN typed error, verbatim — one refusal vocabulary.
            return { ok: false, refusal: e instanceof Error ? e.message : String(e) };
        }
        const parsed = ff.FamilyDocumentSchema.safeParse(next.document);
        if (!parsed.success) {
            const first = parsed.error.issues[0];
            return {
                ok: false,
                refusal:
                    `The edit produced an invalid Component definition document and was refused ` +
                    `(${op.id}): ${first ? `${first.path.join('.')}: ${first.message}` : parsed.error.message}. ` +
                    'The draft is unchanged.',
            };
        }
        draft = { manifest: next.manifest, document: next.document, events: next.events ?? draft.events };
        dirty = true;
        render();
        return { ok: true };
    }

    /* ── helpers ── */
    const params = (): readonly FamilyParameter[] =>
        draft.document.parameters as readonly FamilyParameter[];
    const paramById = (id: string): FamilyParameter | undefined =>
        params().find((p) => p.id === id);

    function scopeType(): FamilyType | null {
        if (scopeTypeId === null) return null;
        const t = draft.document.types.find((x) => x.id === scopeTypeId);
        return t ? { id: t.id, name: t.name, values: coerceValues(t.values) } : null;
    }

    function resolverInput(): ResolverInput {
        return { parameters: params(), type: scopeType(), instanceOverrides: {} };
    }

    function renderRowRefusal(parameterId: string, text: string): void {
        card.querySelector(`[data-cdw-row-refusal="${parameterId}"]`)?.remove();
        const row = table.root.querySelector(`tr[data-dcpt-row="${parameterId}"]`);
        if (!(row instanceof HTMLTableRowElement)) { setStatus(text, true); return; }
        const tr = document.createElement('tr');
        tr.setAttribute('data-cdw-row-refusal', parameterId);
        const td = el('td', `padding:0 8px 8px;font-size:11.5px;color:${REFUSAL};white-space:pre-wrap;`, `⛔ ${text}`);
        td.colSpan = 5;
        tr.appendChild(td);
        row.insertAdjacentElement('afterend', tr);
    }

    /* ── add parameter ── */
    let addForm: HTMLElement | null = null;

    function beginAddParameter(): void {
        if (addForm !== null) { addForm.querySelector('input')?.focus?.(); return; }
        const wrap = el('div',
            `border:1px solid ${LINE};border-radius:8px;padding:10px;margin:8px 0;` +
            'display:flex;gap:6px;align-items:center;flex-wrap:wrap;');
        wrap.setAttribute('data-cdw-add-form', '');

        const nameIn = document.createElement('input');
        nameIn.setAttribute('data-cdw-add-name', '');
        nameIn.placeholder = 'Parameter name (e.g. FrameWidth)';
        nameIn.style.cssText = 'flex:1;min-width:140px;padding:4px 6px;font:12.5px system-ui,sans-serif;';

        const dtSel = document.createElement('select');
        dtSel.setAttribute('data-cdw-add-datatype', '');
        for (const dt of DATA_TYPES) {
            const o = document.createElement('option');
            o.value = dt; o.textContent = dt;
            dtSel.appendChild(o);
        }
        const kindSel = document.createElement('select');
        kindSel.setAttribute('data-cdw-add-kind', '');
        for (const k of ['instance', 'type'] as const) {
            const o = document.createElement('option');
            o.value = k; o.textContent = k === 'instance' ? 'Instance' : 'Type';
            kindSel.appendChild(o);
        }
        const defIn = document.createElement('input');
        defIn.setAttribute('data-cdw-add-default', '');
        defIn.style.cssText = 'width:150px;padding:4px 6px;font:12px ui-monospace,monospace;';
        const syncPlaceholder = (): void => {
            const u = runtimeUnitLabel(dtSel.value as FamilyParameterDataType);
            defIn.placeholder = u ? `Default (${u})` : 'Default (optional)';
        };
        dtSel.addEventListener('change', syncPlaceholder);
        syncPlaceholder();

        const applyBtn = el('button', 'padding:4px 12px;font-weight:600;cursor:pointer;', 'Add');
        applyBtn.setAttribute('data-cdw-add-apply', '');
        applyBtn.addEventListener('click', () => {
            void submitAddParameter({
                name: nameIn.value,
                dataType: dtSel.value as FamilyParameterDataType,
                kind: kindSel.value as 'type' | 'instance',
                defaultRaw: defIn.value,
            });
        });
        const cancelBtn = el('button', 'padding:4px 10px;cursor:pointer;', 'Cancel');
        cancelBtn.addEventListener('click', () => { addForm?.remove(); addForm = null; });

        wrap.append(nameIn, dtSel, kindSel, defIn, applyBtn, cancelBtn);
        addForm = wrap;
        card.querySelector('[data-cdw-toolbar]')?.insertAdjacentElement('afterend', wrap);
        nameIn.focus?.();
    }

    async function submitAddParameter(fields: AddParameterFields): Promise<string | null> {
        const v = draft.document.formatVersion;
        const parameter: PersistedFamilyParameter = {
            id: mintParameterId(),
            name: fields.name,
            kind: fields.kind,
            dataType: fields.dataType,
            defaultValue: parseDefault(fields.dataType, fields.defaultRaw),
            expression: null,
            ifcMapping: null,
            exposed: true,
        };
        const res = await applyOp((ff) =>
            ff.makeAddParameterMigrator(v, v, { parameter }));
        if (!res.ok) { setStatus(res.refusal, true); return res.refusal; }
        addForm = null; // render() rebuilt the card
        setStatus(`Parameter '${fields.name}' added to the draft (not yet saved).`);
        return null;
    }

    /* ── expression editing (LIVE diagnostics — the §64 heart) ── */

    function previewExpression(parameterId: string, text: string): ExpressionPreview | null {
        const p = paramById(parameterId);
        if (p === undefined) return null;
        // Post-op projection: `introduce-expression` sets the expression AND clears
        // the default (ADR-0376 D4) — the preview shows exactly that state. This is
        // a resolver INPUT, never a document write.
        const candidate: ResolverInput = {
            parameters: params().map((q) =>
                q.id === parameterId ? { ...q, expression: text, defaultValue: null } : q),
            type: scopeType(),
            instanceOverrides: {},
        };
        const m = buildParameterTableModel(candidate);
        const row = m.rows.find((r) => r.parameter.id === parameterId);
        const diagnostics = [...(row?.diagnostics ?? []), ...m.passDiagnostics];
        return {
            value: row?.value,
            unit: runtimeUnitLabel(p.dataType),
            diagnostics,
            clean: diagnostics.length === 0,
            willClearDefault: p.defaultValue,
        };
    }

    function renderPreviewInto(host: HTMLElement, parameterId: string, text: string): void {
        host.replaceChildren();
        const pv = previewExpression(parameterId, text);
        if (pv === null) return;
        if (text.trim() === '') {
            host.appendChild(el('div', `font-size:11.5px;color:${MUTED};`, 'Type a formula to preview it.'));
            return;
        }
        if (pv.clean) {
            const val = pv.value === undefined ? '—' : `${String(pv.value)}${pv.unit ? ' ' + pv.unit : ''}`;
            const line = el('div', 'font-size:11.5px;color:#0a6d3c;',
                `✓ Diagnostics clean — resolves to ${val} under this scope.`);
            line.setAttribute('data-cdw-preview-clean', '');
            line.setAttribute('data-cdw-preview-value', pv.value === undefined ? '' : String(pv.value));
            host.appendChild(line);
        }
        for (const d of pv.diagnostics) {
            // ⭐ C110 §4.4's closed set, rendered live — unit-mismatch included.
            const line = el('div',
                `font-size:11.5px;color:${d.severity === 'error' ? REFUSAL : WARN};white-space:pre-wrap;`,
                `${d.severity === 'error' ? '⛔' : '⚠'} ${d.code}: ${d.message}`);
            line.setAttribute('data-cdw-preview-diag', d.code);
            line.setAttribute('data-cdw-preview-diag-severity', d.severity);
            host.appendChild(line);
        }
        if (pv.willClearDefault !== null) {
            // D4 made visible BEFORE the apply (C110 §2.4-a).
            const line = el('div', `font-size:11.5px;color:${MUTED};`,
                `On apply, the current default (${String(pv.willClearDefault)}) is cleared and ` +
                'recorded as supersededDefault — a formula beats a default (ADR-0376 D4).');
            line.setAttribute('data-cdw-preview-supersede', String(pv.willClearDefault));
            host.appendChild(line);
        }
    }

    function beginExpressionEdit(parameterId: string): boolean {
        const p = paramById(parameterId);
        const row = table.root.querySelector(`tr[data-dcpt-row="${parameterId}"]`);
        if (!p || !(row instanceof HTMLTableRowElement)) return false;
        closeInlineEditors();

        const tr = document.createElement('tr');
        tr.setAttribute('data-cdw-expr-editor', parameterId);
        const td = el('td', 'padding:4px 8px 10px;');
        td.colSpan = 5;

        if (p.expression !== null && p.expression.trim() !== '') {
            // Disclosure, not a second validator: the op will speak at apply.
            const note = el('div', `font-size:11.5px;color:${WARN};margin-bottom:4px;`,
                `This parameter already carries the formula '${p.expression}'. The ` +
                'introduce-expression op refuses a second one (a delete-expression op ' +
                'does not exist in @pryzm/file-format yet — OWED).');
            note.setAttribute('data-cdw-expr-existing-note', '');
            td.appendChild(note);
        }

        const wrap = el('div', 'display:flex;gap:6px;align-items:center;');
        const input = document.createElement('input');
        input.setAttribute('data-cdw-expr-input', parameterId);
        input.placeholder = `Formula for ${p.name} (e.g. Width - 2*FrameWidth)`;
        input.style.cssText = 'flex:1;min-width:180px;padding:4px 6px;font:12px ui-monospace,monospace;';
        wrap.appendChild(input);
        const applyBtn = el('button', 'padding:4px 12px;font-weight:600;cursor:pointer;', 'Apply formula');
        applyBtn.setAttribute('data-cdw-expr-apply', parameterId);
        applyBtn.addEventListener('click', () => { void applyExpression(parameterId, input.value); });
        wrap.appendChild(applyBtn);
        td.appendChild(wrap);

        const preview = el('div', 'margin-top:4px;');
        preview.setAttribute('data-cdw-expr-preview', parameterId);
        td.appendChild(preview);

        input.addEventListener('input', () => renderPreviewInto(preview, parameterId, input.value));
        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') void applyExpression(parameterId, input.value);
            if (ev.key === 'Escape') closeInlineEditors();
        });
        renderPreviewInto(preview, parameterId, '');

        tr.appendChild(td);
        row.insertAdjacentElement('afterend', tr);
        input.focus?.();
        return true;
    }

    async function applyExpression(parameterId: string, text: string): Promise<string | null> {
        const v = draft.document.formatVersion;
        const res = await applyOp((ff) =>
            ff.makeIntroduceExpressionMigrator(v, v, { parameterId, expression: text }));
        if (!res.ok) { renderRowRefusal(parameterId, res.refusal); return res.refusal; }
        setStatus('Formula applied to the draft (not yet saved). The superseded default, if any, is recorded as provenance.');
        return null;
    }

    /* ── rename / retype / delete ── */

    async function applyRename(parameterId: string, newName: string): Promise<string | null> {
        const v = draft.document.formatVersion;
        const res = await applyOp((ff) =>
            ff.makeRenameParameterMigrator(v, v, { parameterId, newName }));
        if (!res.ok) { renderRowRefusal(parameterId, res.refusal); return res.refusal; }
        // ⚠ C110 §1.4 / G-7, disclosed not hidden: the op rewrites solids'
        // lengthExpression only — OTHER PARAMETERS' formulas are not rewritten, so a
        // dependent formula now shows `unknown-identifier` in the table. Loud, not silent.
        setStatus(
            `Renamed to '${newName}' in the draft. Formulas on OTHER parameters are not ` +
            'rewritten by rename-parameter (C110 G-7) — any dependent formula now shows ' +
            'its unknown-identifier diagnostic below.');
        return null;
    }

    async function applyDataTypeChange(
        parameterId: string, newDataType: FamilyParameterDataType,
    ): Promise<string | null> {
        const v = draft.document.formatVersion;
        const res = await applyOp((ff) =>
            ff.makeChangeParameterTypeMigrator(v, v, {
                parameterId,
                newDataType,
                // Identity: magnitudes are not rescaled by a dataType change; the unit
                // LABEL follows the declared dataType via the one seam (C110 §3.3).
                valueConverter: (old) => old,
            }));
        if (!res.ok) { renderRowRefusal(parameterId, res.refusal); return res.refusal; }
        setStatus(`dataType changed to '${newDataType}' in the draft (values untouched; the unit label follows the declaration).`);
        return null;
    }

    async function applyDeleteParameter(parameterId: string): Promise<string | null> {
        const v = draft.document.formatVersion;
        const res = await applyOp((ff) =>
            ff.makeDeleteParameterMigrator(v, v, { parameterId }));
        if (!res.ok) { renderRowRefusal(parameterId, res.refusal); return res.refusal; }
        setStatus('Parameter deleted from the draft. A formula referencing it now shows unknown-identifier below — loud, never silent.');
        return null;
    }

    /* ── row action strip ── */
    function closeInlineEditors(): void {
        card.querySelectorAll('[data-cdw-expr-editor],[data-cdw-actions],[data-cdw-rename-form],[data-cdw-retype-form]')
            .forEach((n) => n.remove());
    }

    function beginRowActions(parameterId: string): void {
        const p = paramById(parameterId);
        const row = table.root.querySelector(`tr[data-dcpt-row="${parameterId}"]`);
        if (!p || !(row instanceof HTMLTableRowElement)) return;
        closeInlineEditors();

        const tr = document.createElement('tr');
        tr.setAttribute('data-cdw-actions', parameterId);
        const td = el('td', 'padding:2px 8px 8px;');
        td.colSpan = 5;
        const strip = el('div', 'display:flex;gap:6px;flex-wrap:wrap;');

        const btn = (label: string, attr: string, fn: () => void): HTMLButtonElement => {
            const b = el('button', 'padding:2px 10px;font-size:11.5px;cursor:pointer;', label);
            b.setAttribute(attr, parameterId);
            b.addEventListener('click', fn);
            return b;
        };
        strip.appendChild(btn('Formula…', 'data-cdw-act-expression', () => beginExpressionEdit(parameterId)));
        strip.appendChild(btn('Rename…', 'data-cdw-act-rename', () => {
            closeInlineEditors();
            const form = el('div', 'display:flex;gap:6px;margin-top:4px;');
            form.setAttribute('data-cdw-rename-form', parameterId);
            const input = document.createElement('input');
            input.setAttribute('data-cdw-rename-input', parameterId);
            input.value = p.name;
            input.style.cssText = 'padding:3px 6px;font:12px system-ui,sans-serif;';
            const ok = el('button', 'padding:2px 10px;cursor:pointer;', 'Rename');
            ok.setAttribute('data-cdw-rename-apply', parameterId);
            ok.addEventListener('click', () => { void applyRename(parameterId, input.value); });
            form.append(input, ok);
            const tr2 = document.createElement('tr');
            tr2.setAttribute('data-cdw-rename-form', parameterId);
            const td2 = el('td', 'padding:2px 8px 8px;'); td2.colSpan = 5;
            td2.appendChild(form); tr2.appendChild(td2);
            row.insertAdjacentElement('afterend', tr2);
        }));
        strip.appendChild(btn('Change type…', 'data-cdw-act-retype', () => {
            closeInlineEditors();
            const form = el('div', 'display:flex;gap:6px;margin-top:4px;align-items:center;');
            const sel = document.createElement('select');
            sel.setAttribute('data-cdw-retype-select', parameterId);
            for (const dt of DATA_TYPES) {
                const o = document.createElement('option');
                o.value = dt; o.textContent = dt;
                if (dt === p.dataType) o.selected = true;
                sel.appendChild(o);
            }
            const ok = el('button', 'padding:2px 10px;cursor:pointer;', 'Change');
            ok.setAttribute('data-cdw-retype-apply', parameterId);
            // ⭐ Deliberately no same-type pre-filter: the op's OWN guard ("already has
            // dataType …") is the one voice, rendered against the row.
            ok.addEventListener('click', () => {
                void applyDataTypeChange(parameterId, sel.value as FamilyParameterDataType);
            });
            form.append(sel, ok);
            const tr2 = document.createElement('tr');
            tr2.setAttribute('data-cdw-retype-form', parameterId);
            const td2 = el('td', 'padding:2px 8px 8px;'); td2.colSpan = 5;
            td2.appendChild(form); tr2.appendChild(td2);
            row.insertAdjacentElement('afterend', tr2);
        }));
        strip.appendChild(btn('Delete', 'data-cdw-act-delete', () => { void applyDeleteParameter(parameterId); }));

        td.appendChild(strip);
        tr.appendChild(td);
        row.insertAdjacentElement('afterend', tr);
    }

    /* ── profiles (the 4F surface, mounted; write-back OWED and SAID) ── */

    function openProfile(profileId: string): boolean {
        const doc = draft.document;
        const profile = (doc.profiles as readonly Profile[]).find((pr) => pr.id === profileId);
        if (!profile) {
            setStatus(`Profile ${profileId} is not carried by this definition.`, true);
            return false;
        }
        const plane = (doc.referencePlanes as readonly ReferencePlane[])
            .find((pl) => pl.id === profile.planeId);
        if (!plane) {
            setStatus(
                `Profile '${profile.name}' declares plane ${profile.planeId}, which the ` +
                'definition does not carry — it cannot be drawn on a plane that is not there.',
                true);
            return false;
        }
        const host = card.querySelector('[data-cdw-profile-host]');
        if (!(host instanceof HTMLElement)) return false;
        host.replaceChildren();

        // Scope from the CURRENT resolver pass — kinds from each declaration.
        const scope: Record<string, ScopeValue> = {};
        if (model?.result.ok) {
            for (const r of model.rows) {
                if (typeof r.value === 'number' && Number.isFinite(r.value)) {
                    scope[r.parameter.name] = { value: r.value, kind: kindOfDataType(r.parameter.dataType) };
                }
            }
        }
        const panel = createComponentProfilePanel({ profile, plane, scope, attrPrefix: 'dwp' });
        host.appendChild(panel.root);

        // ⛔ NO commit affordance — and the absence is EXPLAINED, by name
        // ([[refusing-half-needs-its-escape-hatch]] — the escape is named too).
        const owed = el('div', `margin-top:4px;font-size:11.5px;color:${WARN};line-height:1.5;`,
            'Profile geometry edits cannot be persisted from this workspace: ' +
            '@pryzm/file-format\'s family-migrations exports no profile write-back op ' +
            '(an update-profile sibling of introduce-expression) and this lane may not ' +
            'mint one — recorded as OWED in lane-u3-definition-editor.md. Gestures on ' +
            'this surface do not write to the definition document.');
        owed.setAttribute('data-cdw-profile-owed', profileId);
        host.appendChild(owed);
        return true;
    }

    /* ── save-via-pack ── */

    async function save(): Promise<string | null> {
        let ff: FileFormatModule;
        try {
            ff = await loadFileFormat();
        } catch (e) {
            const msg = `The packer could not be loaded from @pryzm/file-format — nothing was saved: ${e instanceof Error ? e.message : String(e)}.`;
            setStatus(msg, true);
            return msg;
        }
        let packed: Awaited<ReturnType<FileFormatModule['packFamily']>>;
        try {
            packed = await ff.packFamily({
                manifest: draft.manifest,
                document: draft.document,
                events: draft.events,
            });
        } catch (e) {
            const msg = `packFamily threw — nothing was saved: ${e instanceof Error ? e.message : String(e)}.`;
            setStatus(msg, true);
            return msg;
        }
        if (!packed.ok) {
            // The packer's own Zod refusal, verbatim (document-invalid / manifest-invalid).
            setStatus(`Not saved — ${packed.message}`, true);
            return packed.message;
        }
        // ⭐ Reload through the ONE catalogue → the ONE loader (unzip → Zod →
        // resolver pre-flight → the (familyId, schemaHash) cache) — the saved
        // definition re-enters exactly as any definition enters; subscribers refresh.
        const res = await componentCatalog.loadFromBytes(packed.bytes, {
            provenance,
            expectId: definitionId,
        });
        if (!res.ok) {
            setStatus(`Packed, but the reload through the catalogue refused — ${res.message}`, true);
            return res.message;
        }
        // Rebase the draft on the RELOADED (loader-validated) document, so the
        // workspace and the catalogue read one truth.
        draft = {
            manifest: res.entry.family.manifest,
            document: res.entry.family.document,
            events: res.entry.family.events,
        };
        dirty = false;
        render();
        setStatus(`Saved — packed and reloaded through the catalogue (${res.entry.family.schemaHash}).`);
        return null;
    }

    /* ── render ── */

    function render(): void {
        addForm = null;
        card.replaceChildren();
        const doc = draft.document;
        const view = componentCatalog.view(definitionId);

        // header
        const head = el('div', 'display:flex;align-items:baseline;gap:10px;margin:0 0 4px;');
        const title = el('h2', `margin:0;font-size:18px;color:${PURPLE};`, 'Edit Component Definition');
        head.appendChild(title);
        const closeBtn = el('button',
            'margin-left:auto;background:none;border:none;font-size:20px;cursor:pointer;color:#555;padding:2px 8px;', '×');
        closeBtn.setAttribute('data-cdw-close', '');
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.addEventListener('click', () => close());
        head.appendChild(closeBtn);
        card.appendChild(head);

        const name = el('div', 'font-size:14px;font-weight:700;', draft.manifest.name);
        name.setAttribute('data-cdw-defname', draft.manifest.name);
        card.appendChild(name);
        const sub = el('div', `font-size:11px;color:${MUTED};margin-bottom:8px;`,
            `${definitionId} · v${draft.manifest.semver} · ${view?.provenance ?? provenance}` +
            ` · ${doc.parameters.length} parameter(s) · ${doc.types.length} type(s)`);
        sub.setAttribute('data-cdw-schemahash', componentCatalog.entry(definitionId)?.family.schemaHash ?? '');
        card.appendChild(sub);

        const dirtyLine = el('div',
            `font-size:11.5px;margin-bottom:6px;color:${dirty ? WARN : MUTED};`,
            dirty
                ? 'Unsaved draft changes — “Save definition” packs the document and reloads it through the catalogue.'
                : 'No unsaved changes.');
        dirtyLine.setAttribute('data-cdw-dirty', dirty ? 'true' : 'false');
        card.appendChild(dirtyLine);

        // scope selector
        const scopeRow = el('div', 'display:flex;gap:8px;align-items:center;margin:0 0 6px;');
        scopeRow.appendChild(el('span', `font-size:11.5px;color:${MUTED};`, 'Preview scope'));
        const scopeSel = document.createElement('select');
        scopeSel.setAttribute('data-cdw-scope', '');
        const defOpt = document.createElement('option');
        defOpt.value = '';
        defOpt.textContent = 'Definition defaults (no type)';
        scopeSel.appendChild(defOpt);
        for (const t of doc.types) {
            const o = document.createElement('option');
            o.value = t.id; o.textContent = t.name;
            if (t.id === scopeTypeId) o.selected = true;
            scopeSel.appendChild(o);
        }
        if (scopeTypeId === null) scopeSel.value = '';
        scopeSel.addEventListener('change', () => setScope(scopeSel.value === '' ? null : scopeSel.value));
        scopeRow.appendChild(scopeSel);
        card.appendChild(scopeRow);

        // toolbar
        const toolbar = el('div', 'display:flex;gap:8px;margin:0 0 4px;');
        toolbar.setAttribute('data-cdw-toolbar', '');
        const addBtn = el('button',
            `background:#fff;color:${PURPLE};border:1px solid ${PURPLE};padding:5px 14px;border-radius:6px;` +
            'font-weight:600;cursor:pointer;font-size:12px;', 'Add parameter…');
        addBtn.setAttribute('data-cdw-add', '');
        addBtn.addEventListener('click', () => beginAddParameter());
        toolbar.appendChild(addBtn);
        const saveBtn = el('button',
            `background:${PURPLE};color:#fff;border:none;padding:5px 16px;border-radius:6px;` +
            'font-weight:600;cursor:pointer;font-size:12px;', 'Save definition');
        saveBtn.setAttribute('data-cdw-save', '');
        saveBtn.addEventListener('click', () => { void save(); });
        toolbar.appendChild(saveBtn);
        card.appendChild(toolbar);

        // the 4F table (definition/type scope; row click → action strip)
        model = table.render(resolverInput());
        card.appendChild(table.root);
        table.root.querySelectorAll('tr[data-dcpt-row]').forEach((tr) => {
            tr.addEventListener('click', () => {
                const pid = tr.getAttribute('data-dcpt-row');
                if (pid !== null) beginRowActions(pid);
            });
        });

        // profiles
        if (doc.profiles.length > 0) {
            card.appendChild(el('div',
                'font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;' +
                `color:${MUTED};margin:10px 0 4px;`, 'Profiles'));
            for (const pr of doc.profiles as readonly Profile[]) {
                const row = el('div', 'display:flex;align-items:center;gap:8px;margin:2px 0;');
                row.setAttribute('data-cdw-profile', pr.id);
                row.appendChild(el('span', 'font-size:12px;', pr.name));
                const open = el('button', 'padding:2px 10px;font-size:11.5px;cursor:pointer;', 'Open profile…');
                open.setAttribute('data-cdw-profile-open', pr.id);
                open.addEventListener('click', () => { void openProfile(pr.id); });
                row.appendChild(open);
                card.appendChild(row);
            }
            const host = el('div', 'margin:4px 0;');
            host.setAttribute('data-cdw-profile-host', '');
            card.appendChild(host);
        }

        // reference planes (read-only list — the plan's §U3 list, no reorient UI minted)
        if (doc.referencePlanes.length > 0) {
            card.appendChild(el('div',
                'font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;' +
                `color:${MUTED};margin:10px 0 4px;`, 'Reference planes'));
            for (const pl of doc.referencePlanes as readonly ReferencePlane[]) {
                const row = el('div', `font-size:12px;color:${INK};margin:1px 0;`,
                    `${pl.name}${pl.isHost ? ' · host' : ''}`);
                row.setAttribute('data-cdw-plane', pl.id);
                card.appendChild(row);
            }
        }

        // solid features (read-only; R-a's honesty for `boolean`)
        if (doc.solids.length > 0) {
            card.appendChild(el('div',
                'font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;' +
                `color:${MUTED};margin:10px 0 4px;`, 'Solid features'));
            for (const s of doc.solids) {
                const isBoolean = (s as { kind: string }).kind === 'boolean';
                const row = el('div',
                    `font-size:12px;margin:1px 0;color:${isBoolean ? REFUSAL : INK};`,
                    isBoolean
                        ? 'boolean — unsupported-feature: persisted by the schema but deliberately ' +
                          'absent from the bake adapter while D7 (feature graph vs undo) is OPEN; ' +
                          'this document\'s feature will not bake.'
                        : (s as { kind: string }).kind);
                row.setAttribute('data-cdw-solid', (s as { id: string }).id);
                card.appendChild(row);
            }
        }

        // material slots (read-only list)
        if (doc.materialSlots.length > 0) {
            card.appendChild(el('div',
                'font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;' +
                `color:${MUTED};margin:10px 0 4px;`, 'Material slots'));
            for (const ms of doc.materialSlots) {
                const row = el('div', `font-size:12px;color:${INK};margin:1px 0;`,
                    (ms as { name: string }).name);
                row.setAttribute('data-cdw-material-slot', (ms as { id: string }).id);
                card.appendChild(row);
            }
        }

        // ── Lane U6 — the authoring chat strip (persistent host, re-appended) ──
        card.appendChild(el('div',
            'font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;' +
            `color:${MUTED};margin:12px 0 2px;`, 'Author by chat'));
        ensureChat();
        card.appendChild(chatHost);

        card.appendChild(status);
    }

    function setScope(typeId: string | null): void {
        scopeTypeId = typeId;
        render();
    }

    function close(): void {
        document.removeEventListener('keydown', onKeyDown);
        chatHandle?.dispose();
        chatHandle = null;
        overlay.remove();
        if (_open?.overlay === overlay) _open = null;
    }

    render();
    setStatus('');
    document.body.appendChild(overlay);

    const handle: ComponentDefinitionWorkspaceHandle = {
        ok: true,
        root: card,
        definitionId,
        get document(): FamilyDocument { return draft.document; },
        isDirty: () => dirty,
        isOpen: () => overlay.isConnected,
        setScope,
        beginAddParameter,
        submitAddParameter,
        beginExpressionEdit,
        previewExpression,
        applyExpression,
        applyRename,
        applyDataTypeChange,
        applyDeleteParameter,
        openProfile,
        save,
        close,
        get model(): ParameterTableModel | null { return model; },
        get statusText(): string { return status.textContent ?? ''; },
    };
    _open = { handle, overlay };
    return handle;
}
