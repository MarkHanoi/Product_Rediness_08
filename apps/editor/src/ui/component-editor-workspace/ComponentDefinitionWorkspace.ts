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
 * R-n: no shell/thicken/pattern/array.
 *
 * ⭐ **Profile GEOMETRY write-back is CLOSED (lane UCE-FAMILY,
 *    §UCE-PROFILE-WRITE-BACK).** This block used to record it as OWED — *"the
 *    family-migrations ops export NO profile op (`update-profile`) … so the
 *    mounted profile surface states that it cannot persist, BY NAME"*.
 *    `makeUpdateProfileMigrator` now exists in `@pryzm/file-format` (the
 *    SANCTIONED path — no document write was minted here), so the surface
 *    carries a real "Commit geometry" button whose accept goes through
 *    `applyOp` like every other edit. ⛔ The refusing half survives intact:
 *    a profile the ring cannot represent without loss (an `arc`, a `circle`,
 *    an expression-valued coordinate) renders `profileWriteBackDisposition`'s
 *    named refusal INSTEAD of the button — a read-only profile still never
 *    gets an affordance that lies.
 */

import type {
    BoxDimension,
    BoxSolidReading,
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
    profileWriteBackDisposition,
    runtimeUnitLabel,
    type ComponentParameterTableHandle,
    type ComponentProfilePanelHandle,
    type ParameterTableModel,
} from '../component';
// ⭐ Lane U0's ONE catalogue — the same singleton the handlers and the browser read.
import { componentCatalog } from '../../services/componentCatalog';
// ⭐ Lane U6 — the definition-authoring chat strip (the §64 "author a formula by
// sentence" surface). Deterministic, offline; drives THIS workspace's own
// `previewExpression`/`applyExpression` — no bus verb, no second validation.
import { makeComponentExpressionController, mountComponentChat, type ComponentChatHandle } from '../component-chat';
// ⭐ Lane U5 — the live 3-D preview: the ONE bake (`bakeFamilyInstance`) drawn
// through the SHARED element-preview rig. Every accepted op re-evaluates and
// re-renders, so the §64 demo is VISUAL: change FrameWidth, watch the glass
// shrink. A recipe that cannot evaluate shows the evaluator's own sentences and
// tears the canvas down — never a stale or invented shape.
// ⭐ Lane U8 — the family-editor VIEWPORTS (3-D + plan + two elevations) and the
// authored-shape ops. One bake, four cameras, one WebGL context.
import {
    COMPONENT_FAMILY_EDITOR_VIEWS,
    mountComponentPreview,
    type ComponentPreviewHandle,
    type ComponentPreviewResult,
} from '../component-preview';

/* ------------------------------------------------------------------ */
/* §U3-ONE-MUTATION-GATEWAY — the lazy file-format seam                */
/* ------------------------------------------------------------------ */

type FileFormatModule = typeof import('@pryzm/file-format');

let _ffPromise: Promise<FileFormatModule> | null = null;
/** The resolved module, once the gateway has opened. ⛔ Read-ONLY uses (the
 *  §U8-BOX-SPELLING reader); every MUTATION still goes through `applyOp`. */
let _ff: FileFormatModule | null = null;

/** ⛔ THE ONE GATEWAY to `@pryzm/file-format`'s value surface (ops + packer +
 *  schema). Severing this import is the workspace's falsification: every edit
 *  and every save then REFUSES with the load failure rendered in place — the
 *  draft is never mutated by any other route, so nothing can be silently lost. */
async function loadFileFormat(): Promise<FileFormatModule> {
    const mod = await (_ffPromise ??= import('@pryzm/file-format'));
    _ff = mod;
    return mod;
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

/**
 * lane U8 — one dimension as the FORM states it, before it becomes a
 * {@link BoxDimension}. `new-parameter` is the inline-create leg: the number
 * already typed becomes the new parameter's default, so binding costs one
 * extra field and never a trip to another panel.
 */
export interface ShapeDimensionField {
    readonly mode: 'literal' | 'parameter' | 'new-parameter';
    /** Runtime length units (mm today). Used by `literal` and `new-parameter`. */
    readonly value?: number;
    readonly parameterId?: string;
    readonly newParameterName?: string;
}

export interface AddShapeFields {
    /** The profile's name — what the shape list shows. */
    readonly name: string;
    readonly width: ShapeDimensionField;
    readonly depth: ShapeDimensionField;
    readonly height: ShapeDimensionField;
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
    /** §UCE-PROFILE-WRITE-BACK — commit the mounted panel's current ring back onto
     *  the profile through `update-profile`. False when nothing is mounted or the
     *  panel refused; the refusal is on the panel's status line, never swallowed. */
    commitProfile(): boolean;
    /** The mounted profile panel's handle (surface, refusal, status), or null. */
    profilePanel(): ComponentProfilePanelHandle | null;
    /* ── lane U8 — GEOMETRY AUTHORING (§U8-AUTHORED-SHAPE) ────────────────── */
    /** Open the add-shape form (DOM). */
    beginAddShape(): void;
    /** Author one parametric box through the ops. Returns a refusal, or null. */
    submitAddShape(fields: AddShapeFields): Promise<string | null>;
    /** Select a shape (or `null`) — the list highlights it and shows its editor. */
    selectShape(solidId: string | null): void;
    /** The selected shape's id, or null. */
    selectedShape(): string | null;
    /** Re-dimension / re-bind a box. Only the named dimensions change. */
    applyShapeDimensions(
        solidId: string,
        dims: { width?: ShapeDimensionField; depth?: ShapeDimensionField; height?: ShapeDimensionField },
    ): Promise<string | null>;
    /** Delete a shape. Deleting the last one restores the honest no-solids state. */
    applyDeleteShape(solidId: string): Promise<string | null>;
    /** Lane U5 — settles when the LATEST 3-D preview refresh has been applied (or
     *  superseded by a newer edit). The preview's state is on the DOM:
     *  `[data-component-preview-state]` ∈ empty | ok | partial | refused. */
    previewSettled(): Promise<void>;
    /** Lane U5 — the last APPLIED preview evaluation (the bake's own numbers),
     *  or null before the first refresh settles. */
    previewResult(): ComponentPreviewResult | null;
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
    return `par_${mintUlid()}`;
}

/** A BARE ULID — profile entity ids carry no prefix in `ProfileEntitySchema`. */
function mintUlid(): string {
    const parsed = parseId(createId('component'));
    if (parsed === null) throw new Error('[workspace] createId produced an unparseable id');
    return parsed.ulid;
}

/** Runtime length units per metre — for the shape list's metre gloss only.
 *  ⛔ NOT a conversion used to author anything: every dimension this workspace
 *  writes stays in runtime units and crosses `§4D-ONE-LENGTH-SEAM` exactly once,
 *  inside the bake. This is a LABEL. */
const RUNTIME_UNITS_PER_M = 1000;

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
    /** lane U8 — the selected shape, or null. Selection is VIEW state, not
     *  document state: it is never packed and never migrated. */
    let selectedSolidId: string | null = null;
    /** §82.4 — is the "Add work plane…" form open? VIEW state, like the above. */
    let addPlaneOpen = false;

    /* ── chrome ── */
    const overlay = el('div',
        'position:fixed;inset:0;z-index:10060;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(15,15,30,0.55);font-family:system-ui,sans-serif;');
    overlay.setAttribute('data-cdw-overlay', '');
    const card = el('div',
        // lane U8 — wider than U3's 760px: the 2x2 viewport grid puts four cameras
        // where one preview used to be, and each cell must still read.
        'width:min(980px,calc(100% - 48px));max-height:min(860px,calc(100% - 48px));display:flex;' +
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

    /* ── Lane U5 — the LIVE 3-D preview, mounted ONCE into a persistent host (the
     *    chat-host pattern: the same node is re-appended across the card's
     *    full-rebuild renders, so the canvas, its orbit state and the shared-rig
     *    mount all survive). `refreshPreview()` re-evaluates the CURRENT draft
     *    under the CURRENT scope after every render — i.e. after every accepted
     *    op — which is what makes the §64 demo visual. */
    const previewHost = el('div', 'margin:4px 0 2px;');
    previewHost.setAttribute('data-cdw-preview-host', '');
    let previewHandle: ComponentPreviewHandle | null = null;
    /** Settles when the LATEST preview refresh has been applied (or superseded) —
     *  the test seam for the async bake, and honest to await in production too. */
    let previewSettled: Promise<void> = Promise.resolve();
    const ensurePreview = (): void => {
        if (previewHandle !== null) return;
        // ⭐ Lane U8 — FOUR viewports (3-D · plan · front · side) from ONE bake
        // and ONE WebGL context. `views` is the only change from U5's single
        // preview; the honest-state machinery, the newest-wins token and the
        // stale-shape teardown are U5's, unchanged.
        previewHandle = mountComponentPreview(previewHost, {
            heightPx: 150,
            views: COMPONENT_FAMILY_EDITOR_VIEWS,
        });
    };
    function refreshPreview(): void {
        ensurePreview();
        const schemaHash =
            componentCatalog.entry(definitionId)?.family.schemaHash ??
            (draft.manifest as { schemaHash?: string }).schemaHash ??
            'sha256:0000000000000000000000000000000000000000000000000000000000000000';
        previewSettled = previewHandle!.update({
            family: { manifest: draft.manifest, document: draft.document, schemaHash },
            typeId: scopeTypeId,
        });
    }

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
            // ⭐ §UCE-FORMULA-IS-EDITABLE — this used to be a dead end. `introduce-expression`
            //   refuses a second formula and its named pair (`delete-expression`) did not
            //   exist, so a typo in a formula was permanent. Both ops now exist and
            //   `applyExpression` chains them inside ONE `apply` — so a failed replacement
            //   leaves the ORIGINAL formula standing rather than a parameter with none.
            const note = el('div', `font-size:11.5px;color:${MUTED};margin-bottom:4px;`,
                `This parameter carries the formula '${p.expression}'. Applying a new one ` +
                'replaces it (delete-expression + introduce-expression, applied together — ' +
                'if either refuses, the current formula stands). The default it originally ' +
                'superseded is carried through the replacement.');
            note.setAttribute('data-cdw-expr-existing-note', '');
            note.setAttribute('data-cdw-expr-replaces', p.expression);
            td.appendChild(note);

            const clearBtn = el('button',
                'padding:4px 10px;font-size:11.5px;cursor:pointer;margin-bottom:6px;',
                'Remove formula');
            clearBtn.setAttribute('data-cdw-expr-clear', parameterId);
            clearBtn.addEventListener('click', () => { void clearExpression(parameterId); });
            td.appendChild(clearBtn);
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
        const existing = paramById(parameterId)?.expression ?? null;
        const replacing = existing !== null && existing.trim() !== '';
        const res = await applyOp((ff) => {
            const introduce = ff.makeIntroduceExpressionMigrator(v, v, { parameterId, expression: text });
            if (!replacing) return introduce;
            // ⭐ §UCE-FORMULA-IS-EDITABLE — ONE `apply`, so ONE accept/refuse decision.
            //   `applyOp` only commits the draft when the whole `apply` returns and the
            //   document re-validates; running the two ops as two `applyOp` calls would
            //   leave the parameter formula-less whenever the second refused, which is a
            //   worse state than the one the author started in.
            const del = ff.makeDeleteExpressionMigrator(v, v, {
                parameterId,
                // The default the ORIGINAL introduce superseded is restored here and
                // superseded again by the replacement, so the provenance survives the edit.
                restoreSupersededDefault: true,
            });
            return {
                id: `replace-expression:${parameterId}`,
                from: v,
                to: v,
                description: `replace the expression on parameter ${parameterId}`,
                apply: (input: RawFamily): RawFamily => introduce.apply(del.apply(input)),
            };
        });
        if (!res.ok) { renderRowRefusal(parameterId, res.refusal); return res.refusal; }
        setStatus(replacing
            ? 'Formula replaced in the draft (not yet saved). The original superseded default is carried through.'
            : 'Formula applied to the draft (not yet saved). The superseded default, if any, is recorded as provenance.');
        return null;
    }

    /** §UCE-FORMULA-IS-EDITABLE — remove a formula, restoring the default it
     *  superseded. The parameter keeps its identity; only the design intent goes. */
    async function clearExpression(parameterId: string): Promise<string | null> {
        const v = draft.document.formatVersion;
        const res = await applyOp((ff) => ff.makeDeleteExpressionMigrator(v, v, { parameterId }));
        if (!res.ok) { renderRowRefusal(parameterId, res.refusal); return res.refusal; }
        const p = paramById(parameterId);
        setStatus(p && p.defaultValue === null
            ? 'Formula removed. This parameter now has NO value of its own — the table shows it ' +
              'as unresolved until a default, a type value or a new formula supplies one.'
            : `Formula removed; the default it superseded (${String(p?.defaultValue)}) is back in force.`);
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

    /* ── profiles (the 4F surface, mounted; write-back LIVE — §UCE-PROFILE-WRITE-BACK) ── */

    /** The profile whose panel is mounted, so an accepted op — which rebuilds the
     *  whole card — can put it back. ⚠ Without this a commit erases its own surface:
     *  `render()` calls `card.replaceChildren()`, so the panel the author just
     *  committed from would vanish and the moved geometry would read as LOST. */
    let openProfileId: string | null = null;
    let profilePanel: ComponentProfilePanelHandle | null = null;

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
        const panel = createComponentProfilePanel({
            profile, plane, scope, attrPrefix: 'dwp',
            // ⭐ §UCE-PROFILE-WRITE-BACK — the panel hands back an UPDATED `Profile`
            //   and dispatches nothing (P6, its own header); THIS caller turns it into
            //   an op. The panel keeps its own refusal voice for the ring-level checks;
            //   `update-profile` keeps its own for the document-level ones.
            onCommit: (updated) => { void applyProfileUpdate(profileId, updated); },
        });
        openProfileId = profileId;
        profilePanel = panel;
        host.appendChild(panel.root);

        if (panel.surface === null) {
            // The profile did not evaluate and the panel already rendered the reason.
            // A commit button over a surface that never opened would be an affordance
            // for a gesture that cannot exist.
            return true;
        }

        const disposition = profileWriteBackDisposition(profile);
        if (!disposition.writable) {
            // ⛔ THE REFUSING HALF, KEPT. A profile carrying an arc, a circle or an
            //    expression-valued coordinate cannot absorb a flattened ring without
            //    losing the intent that made it parametric — so it gets the NAMED
            //    reason and its live alternative, never a button
            //    ([[refusing-half-needs-its-escape-hatch]]: the escape is named too).
            const ro = el('div', `margin-top:4px;font-size:11.5px;color:${WARN};line-height:1.5;`,
                `Read-only geometry: ${disposition.refusal.reason}. Try: ${disposition.refusal.alternative}.`);
            ro.setAttribute('data-cdw-profile-readonly', profileId);
            ro.setAttribute('data-cdw-profile-readonly-code', disposition.refusal.code);
            host.appendChild(ro);
            return true;
        }

        const commitBtn = el('button',
            `background:${PURPLE};color:#fff;border:none;padding:4px 14px;border-radius:6px;` +
            'font-weight:600;cursor:pointer;font-size:12px;margin-top:4px;', 'Commit geometry');
        commitBtn.setAttribute('data-cdw-profile-commit', profileId);
        commitBtn.addEventListener('click', () => { panel.commit(); });
        host.appendChild(commitBtn);
        host.appendChild(el('div', `margin-top:4px;font-size:11.5px;color:${MUTED};line-height:1.5;`,
            'Drag a vertex, then commit — the move lands in the draft through the ' +
            'update-profile op and is persisted by Save definition. Inserting or deleting a ' +
            'vertex is refused: it would mint or delete the entity ids this profile’s ' +
            'constraints reference.'));
        return true;
    }

    /**
     * §UCE-PROFILE-WRITE-BACK — persist a committed ring through the ONE mutation
     * gateway. The panel already proved the ring corresponds one-to-one with the
     * profile's points; `update-profile` proves it AGAIN inside the document,
     * because a UI guard that is the only voice is one deleted line away from a
     * silent loss (C84 EI-6).
     */
    async function applyProfileUpdate(profileId: string, updated: Profile): Promise<string | null> {
        const v = draft.document.formatVersion;
        const points: { id: string; x: number; z: number }[] = [];
        for (const e of updated.entities) {
            const x = e.data['x'], z = e.data['z'];
            if (typeof x !== 'number' || typeof z !== 'number') {
                // Structurally unreachable — `profileWriteBackDisposition` gated the
                // button on numeric coordinates. Stated rather than cast away: a silent
                // `as number` here is exactly how a frozen formula would get in.
                const msg = `Profile point ${e.id} did not commit as a pair of numbers; ` +
                    'the geometry was NOT written.';
                setStatus(msg, true);
                return msg;
            }
            points.push({ id: e.id, x, z });
        }
        const res = await applyOp((ff) => ff.makeUpdateProfileMigrator(v, v, { profileId, points }));
        if (!res.ok) { setStatus(res.refusal, true); return res.refusal; }
        setStatus(
            `Geometry committed to the draft (not yet saved): ${points.length} point(s) of ` +
            `'${updated.name}' moved. Save definition writes it to the Component.`);
        return null;
    }

    /** §UCE-PROFILE-WRITE-BACK — commit the mounted panel's current ring. False when
     *  no panel is mounted or the panel refused (its status line carries the reason). */
    function commitProfile(): boolean {
        return profilePanel?.commit() ?? false;
    }


    /* ══════════════════════════════════════════════════════════════════════
     * lane U8 (§U8-AUTHORED-SHAPE) — GEOMETRY AUTHORING
     *
     * ⭐⭐ WHAT THIS CLOSES. U3 shipped with a stated, named absence: *"the
     *     family-migrations ops export NO profile op … so the mounted profile
     *     surface states that it cannot persist, BY NAME"*. That absence is why
     *     "New Component" opened on a definition with zero solids and the
     *     preview answered `no-solids`. Lane U8 added the ops
     *     (`add-box-solid`, `set-box-dimensions`, `delete-solid`,
     *     `add-reference-plane`) inside `@pryzm/file-format` — the SANCTIONED
     *     path — so this surface authors geometry the same way it authors
     *     parameters: through an op, never a document write.
     *
     * ⛔ ONE SHAPE KIND: a parametric box (rect profile × extrude height). Not
     *    a simplification for its own sake — `BAKEABLE_SOLID_KINDS` is
     *    `['extrude']` and every other kind REFUSES in `bakeFamilyInstance`
     *    with a sentence naming the persisted fields it lacks. An "Add
     *    sweep" button would author a refusal (spec §75).
     * ══════════════════════════════════════════════════════════════════════ */

    /** Length parameters a dimension may bind to — the ones whose name the
     *  expression grammar can read (a name with a space is two identifiers). */
    function bindableParameters(): readonly FamilyParameter[] {
        return params().filter((p) => p.dataType === 'length' && !/\s/.test(p.name));
    }

    /** The §U8-BOX-SPELLING reading for a solid, or null (not a box / not yet
     *  loaded). ⛔ Read through `@pryzm/file-format`'s OWN reader — parsing the
     *  corner expressions here would be the second authority for the spelling. */
    function boxReading(solidId: string): BoxSolidReading | null {
        return _ff?.readBoxSolid(draft.document, solidId) ?? null;
    }

    /** Render a dimension for a human: the parameter's NAME, or the number. */
    function dimensionLabel(dim: BoxDimension): string {
        if (dim.kind === 'literal') return `${dim.value} (${dim.value / RUNTIME_UNITS_PER_M} m)`;
        const p = paramById(dim.parameterId);
        return p ? `${p.name} (bound)` : `${dim.parameterId} — missing`;
    }

    /** Turn ONE form field into a persisted binding, creating the parameter
     *  first when the author asked for a new one. Refusals come back as text. */
    async function resolveDimension(
        field: ShapeDimensionField,
        label: string,
    ): Promise<{ ok: true; dim: BoxDimension } | { ok: false; refusal: string }> {
        if (field.mode === 'parameter') {
            const id = field.parameterId ?? '';
            if (paramById(id) === undefined) {
                return { ok: false, refusal: `${label} names no parameter of this Component.` };
            }
            return { ok: true, dim: { kind: 'parameter', parameterId: id } };
        }
        const value = field.value;
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
            return {
                ok: false,
                refusal: `${label} needs a positive number (in ${runtimeUnitLabel('length')}); ` +
                    'a zero or negative extent produces a solid the evaluator refuses.',
            };
        }
        if (field.mode === 'literal') return { ok: true, dim: { kind: 'literal', value } };

        // ── inline parameter creation, through the SAME add-parameter op the
        //    table's own "Add parameter…" uses. The number already typed becomes
        //    the default, so nothing is invented behind the author's back.
        const name = (field.newParameterName ?? '').trim();
        if (name === '') {
            return { ok: false, refusal: `${label}: name the new parameter before binding to it.` };
        }
        const parameterId = mintParameterId();
        const v = draft.document.formatVersion;
        const res = await applyOp((ff) => ff.makeAddParameterMigrator(v, v, {
            parameter: {
                id: parameterId,
                name,
                kind: 'instance',
                dataType: 'length',
                defaultValue: value,
                expression: null,
                ifcMapping: null,
                exposed: true,
            } as PersistedFamilyParameter,
        }));
        if (!res.ok) return { ok: false, refusal: res.refusal };
        return { ok: true, dim: { kind: 'parameter', parameterId } };
    }

    /** The plane the next profile is drawn on — the host plane if there is one.
     *  Creates one only when the definition carries NONE (a from-zero mint). */
    async function ensurePlane(): Promise<{ ok: true; planeId: string } | { ok: false; refusal: string }> {
        const planes = draft.document.referencePlanes as readonly ReferencePlane[];
        const existing = planes.find((pl) => pl.isHost) ?? planes[0];
        if (existing) return { ok: true, planeId: existing.id };
        const planeId = `plane_${mintUlid()}`;
        const v = draft.document.formatVersion;
        const res = await applyOp((ff) => ff.makeAddReferencePlaneMigrator(v, v, {
            plane: {
                id: planeId, name: 'Base',
                origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true,
            } as ReferencePlane,
        }));
        return res.ok ? { ok: true, planeId } : { ok: false, refusal: res.refusal };
    }

    async function submitAddShape(fields: AddShapeFields): Promise<string | null> {
        // ⚠ The gateway must be OPEN before the dimension legs run, so a load
        // failure refuses BEFORE any parameter is created rather than half-way
        // through (a partially-applied shape is the state this order avoids).
        try {
            await loadFileFormat();
        } catch (e) {
            const msg = `${OPS_UNAVAILABLE}: ${e instanceof Error ? e.message : String(e)}.`;
            setStatus(msg, true);
            return msg;
        }
        const w = await resolveDimension(fields.width, 'Width');
        if (!w.ok) { setStatus(w.refusal, true); return w.refusal; }
        const d = await resolveDimension(fields.depth, 'Depth');
        if (!d.ok) { setStatus(d.refusal, true); return d.refusal; }
        const h = await resolveDimension(fields.height, 'Height');
        if (!h.ok) { setStatus(h.refusal, true); return h.refusal; }
        const plane = await ensurePlane();
        if (!plane.ok) { setStatus(plane.refusal, true); return plane.refusal; }

        const solidId = `sol_${mintUlid()}`;
        const v = draft.document.formatVersion;
        const res = await applyOp((ff) => ff.makeAddBoxSolidMigrator(v, v, {
            solidId,
            profileId: `prof_${mintUlid()}`,
            profileName: fields.name.trim() === '' ? 'Shape' : fields.name.trim(),
            planeId: plane.planeId,
            entityIds: [mintUlid(), mintUlid(), mintUlid(), mintUlid()],
            width: w.dim,
            depth: d.dim,
            height: h.dim,
        }));
        if (!res.ok) { setStatus(res.refusal, true); return res.refusal; }
        selectedSolidId = solidId;
        addShapeForm = null;
        render();
        setStatus('Shape added to the draft (not yet saved) — the viewports show it immediately.');
        return null;
    }

    async function applyShapeDimensions(
        solidId: string,
        dims: { width?: ShapeDimensionField; depth?: ShapeDimensionField; height?: ShapeDimensionField },
    ): Promise<string | null> {
        try {
            await loadFileFormat();
        } catch (e) {
            const msg = `${OPS_UNAVAILABLE}: ${e instanceof Error ? e.message : String(e)}.`;
            setStatus(msg, true);
            return msg;
        }
        const out: { width?: BoxDimension; depth?: BoxDimension; height?: BoxDimension } = {};
        for (const key of ['width', 'depth', 'height'] as const) {
            const field = dims[key];
            if (field === undefined) continue;
            const r = await resolveDimension(field, key[0]!.toUpperCase() + key.slice(1));
            if (!r.ok) { setStatus(r.refusal, true); return r.refusal; }
            out[key] = r.dim;
        }
        const v = draft.document.formatVersion;
        const res = await applyOp((ff) => ff.makeSetBoxDimensionsMigrator(v, v, { solidId, ...out }));
        if (!res.ok) { setStatus(res.refusal, true); return res.refusal; }
        setStatus('Shape re-dimensioned in the draft — every viewport re-evaluated through the one bake.');
        return null;
    }

    async function applyDeleteShape(solidId: string): Promise<string | null> {
        const v = draft.document.formatVersion;
        const res = await applyOp((ff) => ff.makeDeleteSolidMigrator(v, v, { solidId }));
        if (!res.ok) { setStatus(res.refusal, true); return res.refusal; }
        if (selectedSolidId === solidId) selectedSolidId = null;
        render();
        // ⭐ The honest consequence, said out loud rather than discovered.
        setStatus(
            draft.document.solids.length === 0
                ? 'Shape deleted — this Component now declares no solids, so the preview refuses ' +
                  'with no-solids. That refusal is correct for an empty definition; add a shape to ' +
                  'bring the viewports back.'
                : 'Shape deleted from the draft (not yet saved).');
        return null;
    }

    /* ── §82.4-DIRECTED-EXTRUDE — WORK PLANES ─────────────────────────────────
     * STR-UCE-MASTER-SPEC §82.1 (reference planes) + §82.4 (*"extrusion on ANY
     * work plane (not +Y only)"*).
     *
     * ⭐ Until this lane a reference plane was a datum NOTHING READ: the bake
     *    refused any direction but +Y, so `ensurePlane()` minted one horizontal
     *    'Base' plane and no author had a reason to make a second. The producer
     *    now sweeps along any axis and `set-extrude-work-plane` binds a solid to
     *    a plane, so these two gestures are what turn §82.1 from a persisted
     *    field into something a user can SEE the effect of.
     *
     * ⚠ ORIGIN IS NOT APPLIED, so this UI does not offer one. The bake has no
     *   per-solid transform, and the op REFUSES an offset plane rather than
     *   honouring half of it — offering an origin field here would collect an
     *   intent that is guaranteed to be refused (§75, one refusal, stated once).
     */
    const WORK_PLANE_ORIENTATIONS: readonly (readonly [string, string, { x: number; y: number; z: number }])[] = [
        ['up', 'Horizontal — builds upward (+Y)', { x: 0, y: 1, z: 0 }],
        ['x', 'Vertical — builds along +X', { x: 1, y: 0, z: 0 }],
        ['z', 'Vertical — builds along +Z', { x: 0, y: 0, z: 1 }],
    ];

    async function addWorkPlane(name: string, orientation: string): Promise<string | null> {
        const chosen = WORK_PLANE_ORIENTATIONS.find(([key]) => key === orientation);
        if (chosen === undefined) {
            const msg = `Unknown work-plane orientation '${orientation}' — nothing was added.`;
            setStatus(msg, true);
            return msg;
        }
        const trimmed = name.trim();
        if (trimmed === '') {
            const msg = 'Name the work plane before adding it — an unnamed datum cannot be referred to.';
            setStatus(msg, true);
            return msg;
        }
        const planeId = `plane_${mintUlid()}`;
        const v = draft.document.formatVersion;
        const res = await applyOp((ff) => ff.makeAddReferencePlaneMigrator(v, v, {
            plane: {
                id: planeId,
                name: trimmed,
                origin: { x: 0, y: 0, z: 0 },
                normal: chosen[2],
                // ⛔ Never a second host: `add-reference-plane` refuses one, and a
                //    host plane answers "what does a hosted instance sit on" — a
                //    question this gesture is not asking.
                isHost: false,
            } as ReferencePlane,
        }));
        if (!res.ok) { setStatus(res.refusal, true); return res.refusal; }
        addPlaneOpen = false;
        render();
        setStatus(
            `Work plane “${trimmed}” added to the draft (not yet saved). Select a shape and set its ` +
            'work plane to build along this plane’s normal.');
        return null;
    }

    async function applyWorkPlane(solidId: string, planeId: string): Promise<string | null> {
        const v = draft.document.formatVersion;
        const res = await applyOp((ff) => ff.makeSetExtrudeWorkPlaneMigrator(v, v, { solidId, planeId }));
        if (!res.ok) { setStatus(res.refusal, true); return res.refusal; }
        render();
        const plane = (draft.document.referencePlanes as readonly ReferencePlane[])
            .find((pl) => pl.id === planeId);
        setStatus(
            `Shape re-based onto “${plane?.name ?? planeId}” — it now builds along that plane’s normal, ` +
            'and every viewport re-evaluated through the same bake the placed instance uses.');
        return null;
    }

    function selectShape(solidId: string | null): void {
        selectedSolidId = solidId;
        render();
    }

    /* ── the add-shape form ── */
    let addShapeForm: HTMLElement | null = null;

    /**
     * One dimension control: a mode select + the inputs that mode needs.
     * Returns a reader, so the caller collects the value at SUBMIT time rather
     * than tracking every keystroke.
     */
    function dimensionControl(
        attr: string,
        initial: BoxDimension | null,
        allowNewParameter: boolean,
    ): { root: HTMLElement; read: () => ShapeDimensionField } {
        const wrap = el('div', 'display:flex;gap:4px;align-items:center;flex-wrap:wrap;');
        wrap.setAttribute(`data-cdw-dim-${attr}`, '');

        const mode = document.createElement('select');
        mode.setAttribute(`data-cdw-dim-${attr}-mode`, '');
        const modes: readonly (readonly [string, string])[] = allowNewParameter
            ? [['literal', 'Fixed'], ['parameter', 'Bind to parameter'], ['new-parameter', 'New parameter…']]
            : [['literal', 'Fixed'], ['parameter', 'Bind to parameter']];
        for (const [value, label] of modes) {
            const o = document.createElement('option');
            o.value = value; o.textContent = label;
            mode.appendChild(o);
        }

        const num = document.createElement('input');
        num.setAttribute(`data-cdw-dim-${attr}-value`, '');
        num.type = 'number';
        num.style.cssText = 'width:82px;padding:3px 5px;font:12px ui-monospace,monospace;';
        num.placeholder = runtimeUnitLabel('length');

        const paramSel = document.createElement('select');
        paramSel.setAttribute(`data-cdw-dim-${attr}-param`, '');
        for (const p of bindableParameters()) {
            const o = document.createElement('option');
            o.value = p.id; o.textContent = p.name;
            paramSel.appendChild(o);
        }

        const newName = document.createElement('input');
        newName.setAttribute(`data-cdw-dim-${attr}-newname`, '');
        newName.placeholder = 'New parameter name';
        newName.style.cssText = 'width:130px;padding:3px 5px;font:12px system-ui,sans-serif;';

        // Seed from the CURRENT binding, so an edit form opens on the truth.
        if (initial?.kind === 'parameter') {
            mode.value = 'parameter';
            paramSel.value = initial.parameterId;
            num.value = '';
        } else {
            mode.value = 'literal';
            num.value = initial ? String(initial.value) : '600';
        }

        const sync = (): void => {
            num.style.display = mode.value === 'parameter' ? 'none' : '';
            paramSel.style.display = mode.value === 'parameter' ? '' : 'none';
            newName.style.display = mode.value === 'new-parameter' ? '' : 'none';
        };
        mode.addEventListener('change', sync);

        wrap.append(mode, num, paramSel, newName);
        sync();

        // ⚠ No bindable parameter exists yet? Say so instead of offering an
        // empty select that silently binds to nothing.
        if (bindableParameters().length === 0) {
            const note = el('span', `font-size:11px;color:${MUTED};`,
                'no length parameter to bind to yet');
            note.setAttribute(`data-cdw-dim-${attr}-nobind`, '');
            wrap.appendChild(note);
        }

        return {
            root: wrap,
            read: (): ShapeDimensionField => {
                const m = mode.value as ShapeDimensionField['mode'];
                const raw = Number(num.value);
                return {
                    mode: m,
                    ...(Number.isFinite(raw) ? { value: raw } : {}),
                    ...(paramSel.value !== '' ? { parameterId: paramSel.value } : {}),
                    ...(newName.value.trim() !== '' ? { newParameterName: newName.value.trim() } : {}),
                };
            },
        };
    }

    function beginAddShape(): void {
        if (addShapeForm !== null) { addShapeForm.querySelector('input')?.focus?.(); return; }
        const wrap = el('div',
            `border:1px solid ${LINE};border-radius:8px;padding:10px;margin:6px 0;` +
            'display:flex;flex-direction:column;gap:6px;');
        wrap.setAttribute('data-cdw-add-shape-form', '');

        const nameIn = document.createElement('input');
        nameIn.setAttribute('data-cdw-add-shape-name', '');
        nameIn.placeholder = 'Shape name (e.g. Body)';
        nameIn.value = 'Body';
        nameIn.style.cssText = 'padding:4px 6px;font:12.5px system-ui,sans-serif;max-width:220px;';
        wrap.appendChild(nameIn);

        const row = (label: string, ctl: HTMLElement): HTMLElement => {
            const r = el('div', 'display:flex;gap:8px;align-items:center;');
            const l = el('span', `font-size:11.5px;color:${MUTED};width:52px;`, label);
            r.append(l, ctl);
            return r;
        };
        const w = dimensionControl('width', null, true);
        const d = dimensionControl('depth', null, true);
        const h = dimensionControl('height', null, true);
        wrap.append(row('Width', w.root), row('Depth', d.root), row('Height', h.root));

        const actions = el('div', 'display:flex;gap:6px;');
        const applyBtn = el('button', 'padding:4px 12px;font-weight:600;cursor:pointer;', 'Add shape');
        applyBtn.setAttribute('data-cdw-add-shape-apply', '');
        applyBtn.addEventListener('click', () => {
            void submitAddShape({
                name: nameIn.value, width: w.read(), depth: d.read(), height: h.read(),
            });
        });
        const cancelBtn = el('button', 'padding:4px 10px;cursor:pointer;', 'Cancel');
        cancelBtn.addEventListener('click', () => { addShapeForm?.remove(); addShapeForm = null; });
        actions.append(applyBtn, cancelBtn);
        wrap.appendChild(actions);

        // ⛔ The declared limit, stated where the author is about to hit it.
        const limit = el('div', `font-size:11px;color:${MUTED};line-height:1.45;`,
            'A shape is a box: a rectangle extruded upward. Voids/cuts, sweeps, revolves and ' +
            'lofts are persistable in the format but are REFUSED by the evaluator ' +
            '(bakeFamilyInstance bakes extrude only), so this editor does not offer buttons that ' +
            'would author a refusal.');
        limit.setAttribute('data-cdw-add-shape-limit', '');
        wrap.appendChild(limit);

        addShapeForm = wrap;
        card.querySelector('[data-cdw-shapes-toolbar]')?.insertAdjacentElement('afterend', wrap);
        nameIn.focus?.();
    }

    /** The selected shape's editor — dimensions + bindings + delete. */
    function renderShapeEditor(host: HTMLElement, solidId: string): void {
        const reading = boxReading(solidId);
        const box = el('div',
            `border:1px solid ${LINE};border-radius:8px;padding:10px;margin:4px 0;` +
            'display:flex;flex-direction:column;gap:6px;');
        box.setAttribute('data-cdw-shape-editor', solidId);

        // ── §82.4-DIRECTED-EXTRUDE — WHICH WAY DOES THIS SHAPE BUILD? ─────────
        // Rendered BEFORE the dimension branch, and outside it, on purpose: a
        // shape whose profile this editor did not author (`reading === null`) can
        // still be re-based onto another work plane — the axis is a property of
        // the SOLID, not of the box spelling.
        {
            const solidRec = draft.document.solids.find((s) => s.id === solidId) as
                { readonly kind: string; readonly profileId?: string } | undefined;
            if (solidRec?.kind === 'extrude') {
                const planes = draft.document.referencePlanes as readonly ReferencePlane[];
                const current = (draft.document.profiles as readonly Profile[])
                    .find((pr) => pr.id === solidRec.profileId)?.planeId ?? null;
                const row = el('div', 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;');
                row.append(el('span', `font-size:11.5px;color:${MUTED};width:70px;`, 'Work plane'));
                if (planes.length === 0) {
                    // UNREACHABLE and EMPTY are different facts (C84 EI-6).
                    const none = el('span', `font-size:11.5px;color:${MUTED};`,
                        'this definition carries no work plane to build along');
                    none.setAttribute('data-cdw-shape-plane-none', solidId);
                    row.appendChild(none);
                } else {
                    const sel = document.createElement('select');
                    sel.setAttribute('data-cdw-shape-plane', solidId);
                    for (const pl of planes) {
                        const o = document.createElement('option');
                        o.value = pl.id;
                        o.textContent = `${pl.name}${pl.isHost ? ' · host' : ''}`;
                        sel.appendChild(o);
                    }
                    if (current !== null) sel.value = current;
                    // ⭐ ONE act: the op writes the profile's plane AND the solid's
                    //   sweep axis together, so "profile on the wall plane,
                    //   extrusion still vertical" is not a state this can produce.
                    sel.addEventListener('change', () => { void applyWorkPlane(solidId, sel.value); });
                    row.appendChild(sel);
                }
                box.appendChild(row);
            }
        }

        if (reading === null) {
            // ⭐ HONEST: "not a box this editor wrote" is an ANSWER. Offering
            // dimension fields over a sketched profile would rewrite geometry
            // the reader cannot even see.
            box.appendChild(el('div', `font-size:11.5px;color:${WARN};line-height:1.5;`,
                _ff === null
                    ? 'Reading this shape’s dimensions…'
                    : 'This shape’s profile was not authored as a box by this editor (or one of its ' +
                      'bound parameters is gone), so its dimensions are not editable here. It still ' +
                      'evaluates and still draws; nothing about it is hidden.'));
            const del = el('button', 'padding:3px 10px;font-size:11.5px;cursor:pointer;align-self:flex-start;', 'Delete shape');
            del.setAttribute('data-cdw-shape-delete', solidId);
            del.addEventListener('click', () => { void applyDeleteShape(solidId); });
            box.appendChild(del);
            host.appendChild(box);
            return;
        }

        const controls = {
            width: dimensionControl('edit-width', reading.width, false),
            depth: dimensionControl('edit-depth', reading.depth, false),
            height: dimensionControl('edit-height', reading.height, false),
        };
        for (const [label, key] of [['Width', 'width'], ['Depth', 'depth'], ['Height', 'height']] as const) {
            const r = el('div', 'display:flex;gap:8px;align-items:center;');
            r.append(el('span', `font-size:11.5px;color:${MUTED};width:52px;`, label), controls[key].root);
            box.appendChild(r);
        }

        const actions = el('div', 'display:flex;gap:6px;');
        const apply = el('button', 'padding:4px 12px;font-weight:600;cursor:pointer;', 'Apply dimensions');
        apply.setAttribute('data-cdw-shape-apply', solidId);
        apply.addEventListener('click', () => {
            void applyShapeDimensions(solidId, {
                width: controls.width.read(),
                depth: controls.depth.read(),
                height: controls.height.read(),
            });
        });
        const del = el('button', 'padding:4px 10px;cursor:pointer;', 'Delete shape');
        del.setAttribute('data-cdw-shape-delete', solidId);
        del.addEventListener('click', () => { void applyDeleteShape(solidId); });
        actions.append(apply, del);
        box.appendChild(actions);

        // The §64 sentence, in place: a bound dimension follows the table.
        box.appendChild(el('div', `font-size:11px;color:${MUTED};line-height:1.45;`,
            'A bound dimension follows its parameter: change the parameter in the table above and ' +
            'this shape re-evaluates through the same bake the placed instance uses.'));
        host.appendChild(box);
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
        addShapeForm = null;
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

        // ── Lane U5 — the live 3-D preview (persistent host, re-appended; the bake
        // itself is kicked at the END of render so it reads the fully-assembled
        // draft state exactly once per accepted edit).
        card.appendChild(el('div',
            'font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;' +
            `color:${MUTED};margin:6px 0 2px;`, 'Preview'));
        card.appendChild(previewHost);

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

            // ⭐ §UCE-PROFILE-WRITE-BACK — PUT THE PANEL BACK. `render()` opens with
            //   `card.replaceChildren()`, so an accepted op tears down the surface the
            //   author is drawing on. Committing a vertex and watching the drawing
            //   vanish reads as "the edit was lost" — the opposite of what happened.
            //   Re-mounting from the UPDATED draft is also the only way the moved
            //   geometry is SEEN, which is the layer the user experiences.
            if (openProfileId !== null &&
                (doc.profiles as readonly Profile[]).some((pr) => pr.id === openProfileId)) {
                openProfile(openProfileId);
            } else {
                openProfileId = null;
                profilePanel = null;
            }
        }

        // ── WORK PLANES (§82.1 / §82.4) — the list is no longer read-only: a plane
        //    can be ADDED here, and a shape can be built along its normal (see the
        //    per-shape control in `renderShapeEditor`). ⛔ Still NO reorient and NO
        //    delete: a plane already carrying profiles cannot be moved or removed
        //    without deciding what happens to the geometry bound to it, and
        //    `add-reference-plane`'s header states that decision is not made.
        card.appendChild(el('div',
            'font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;' +
            `color:${MUTED};margin:10px 0 4px;`, 'Work planes'));
        for (const pl of doc.referencePlanes as readonly ReferencePlane[]) {
            const row = el('div', `font-size:12px;color:${INK};margin:1px 0;`,
                `${pl.name}${pl.isHost ? ' · host' : ''} · normal (${pl.normal.x}, ${pl.normal.y}, ${pl.normal.z})`);
            row.setAttribute('data-cdw-plane', pl.id);
            card.appendChild(row);
        }
        if (doc.referencePlanes.length === 0) {
            const none = el('div', `font-size:11.5px;color:${MUTED};margin:1px 0;`,
                'This Component declares no work planes yet. Adding a shape mints the horizontal ' +
                'host plane; add another to build along a different axis.');
            none.setAttribute('data-cdw-planes-empty', '');
            card.appendChild(none);
        }
        if (!addPlaneOpen) {
            const addPlaneBtn = el('button',
                `background:#fff;color:${PURPLE};border:1px solid ${PURPLE};padding:3px 10px;` +
                'border-radius:6px;font-weight:600;cursor:pointer;font-size:11.5px;margin:4px 0 0;',
                'Add work plane…');
            addPlaneBtn.setAttribute('data-cdw-add-plane', '');
            addPlaneBtn.addEventListener('click', () => { addPlaneOpen = true; render(); });
            card.appendChild(addPlaneBtn);
        } else {
            const form = el('div',
                `border:1px solid ${LINE};border-radius:8px;padding:8px;margin:4px 0;` +
                'display:flex;gap:6px;align-items:center;flex-wrap:wrap;');
            form.setAttribute('data-cdw-plane-form', '');

            const nameInput = document.createElement('input');
            nameInput.setAttribute('data-cdw-plane-name', '');
            nameInput.placeholder = 'Plane name';
            nameInput.value = `Plane ${doc.referencePlanes.length + 1}`;
            nameInput.style.cssText = 'width:140px;padding:3px 5px;font:12px system-ui,sans-serif;';

            const orient = document.createElement('select');
            orient.setAttribute('data-cdw-plane-orientation', '');
            for (const [value, label] of WORK_PLANE_ORIENTATIONS) {
                const o = document.createElement('option');
                o.value = value; o.textContent = label;
                orient.appendChild(o);
            }

            const create = el('button',
                `background:${PURPLE};color:#fff;border:none;padding:4px 12px;border-radius:6px;` +
                'font-weight:600;cursor:pointer;font-size:11.5px;', 'Add plane');
            create.setAttribute('data-cdw-plane-create', '');
            create.addEventListener('click', () => { void addWorkPlane(nameInput.value, orient.value); });

            const cancel = el('button', 'padding:4px 10px;font-size:11.5px;cursor:pointer;', 'Cancel');
            cancel.setAttribute('data-cdw-plane-cancel', '');
            cancel.addEventListener('click', () => { addPlaneOpen = false; render(); });

            form.append(nameInput, orient, create, cancel);
            card.appendChild(form);
            // ⚠ The declared limit, said where the author is choosing — not buried.
            const note = el('div', `font-size:11px;color:${MUTED};line-height:1.45;margin:2px 0 0;`,
                'A work plane sets which way a shape BUILDS (its normal). Its ORIGIN is not applied: ' +
                'the evaluator carries no per-solid placement, so an offset plane would move nothing ' +
                'and is refused rather than half-honoured.');
            note.setAttribute('data-cdw-plane-origin-note', '');
            card.appendChild(note);
        }

        // ── SHAPES (lane U8) — the authored-geometry list: select → edit
        //    dimensions/bindings → delete, plus the add-shape entry. Replaces
        //    U3's read-only "Solid features" list, which could name a solid but
        //    could not add, change or remove one.
        card.appendChild(el('div',
            'font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;' +
            `color:${MUTED};margin:10px 0 4px;`, 'Shapes'));

        const shapesToolbar = el('div', 'display:flex;gap:8px;align-items:center;margin:0 0 4px;');
        shapesToolbar.setAttribute('data-cdw-shapes-toolbar', '');
        const addShapeBtn = el('button',
            `background:#fff;color:${PURPLE};border:1px solid ${PURPLE};padding:4px 12px;` +
            'border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;', 'Add shape…');
        addShapeBtn.setAttribute('data-cdw-add-shape', '');
        addShapeBtn.addEventListener('click', () => beginAddShape());
        shapesToolbar.appendChild(addShapeBtn);
        card.appendChild(shapesToolbar);

        if (doc.solids.length === 0) {
            // ⭐ The honest empty state, with the route forward — NOT the bake's
            // refusal wearing chrome. The refusal itself still appears in the
            // viewport, because that is where "cannot be evaluated" belongs.
            const empty = el('div', `font-size:11.5px;color:${MUTED};line-height:1.5;margin:2px 0 6px;`,
                'This Component declares no shapes, so there is nothing to evaluate and the ' +
                'viewports show the evaluator’s no-solids refusal. Add a shape to give it a body.');
            empty.setAttribute('data-cdw-shapes-empty', '');
            card.appendChild(empty);
        }

        for (const s of doc.solids) {
            const solid = s as { id: string; kind: string };
            const isBoolean = solid.kind === 'boolean';
            const selected = selectedSolidId === solid.id;
            const row = el('div',
                'display:flex;align-items:center;gap:8px;margin:1px 0;padding:3px 6px;border-radius:6px;' +
                `cursor:pointer;background:${selected ? '#f3edff' : 'transparent'};` +
                `border:1px solid ${selected ? PURPLE : 'transparent'};`);
            row.setAttribute('data-cdw-solid', solid.id);
            if (selected) row.setAttribute('data-cdw-solid-selected', solid.id);
            row.addEventListener('click', () => selectShape(selected ? null : solid.id));

            const reading = boxReading(solid.id);
            const profile = (doc.profiles as readonly Profile[])
                .find((pr) => 'profileId' in s && pr.id === (s as { profileId?: string }).profileId);
            const title = el('span', `font-size:12px;color:${isBoolean ? REFUSAL : INK};font-weight:600;`,
                profile?.name ?? solid.kind);
            row.appendChild(title);
            row.appendChild(el('span', `font-size:11.5px;color:${MUTED};`,
                reading
                    ? `W ${dimensionLabel(reading.width)} · D ${dimensionLabel(reading.depth)} · ` +
                      `H ${dimensionLabel(reading.height)}`
                    : solid.kind));
            if (isBoolean) {
                // R-a's honesty, preserved verbatim in meaning: persisted, not bakeable.
                row.appendChild(el('span', `font-size:11px;color:${REFUSAL};`,
                    '⛔ unsupported-feature — persisted by the schema but absent from the bake ' +
                    'adapter while D7 (feature graph vs undo) is OPEN; this feature will not bake.'));
            }
            card.appendChild(row);
            if (selected) renderShapeEditor(card, solid.id);
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

        // ── Lane U5 — re-evaluate the CURRENT draft under the CURRENT scope. Runs
        // after every render, i.e. after every accepted op — the §64 visual loop.
        refreshPreview();
    }

    function setScope(typeId: string | null): void {
        scopeTypeId = typeId;
        render();
    }

    function close(): void {
        document.removeEventListener('keydown', onKeyDown);
        chatHandle?.dispose();
        chatHandle = null;
        // Lane U5 — releases this workspace's claim on the SHARED preview rig
        // (the context itself is released only when the LAST mount goes).
        previewHandle?.dispose();
        previewHandle = null;
        overlay.remove();
        if (_open?.overlay === overlay) _open = null;
    }

    render();
    setStatus('');
    document.body.appendChild(overlay);

    // ⭐ lane U8 — WARM the ONE gateway. `readBoxSolid` (the §U8-BOX-SPELLING
    // reader) lives in `@pryzm/file-format`, which is loaded lazily on purpose
    // (the barrel evaluates pdfjs at module scope). Until it lands the shape
    // rows say "reading…" rather than inventing a dimension; when it lands the
    // list re-renders. ⛔ A local parse would be the second authority for the
    // spelling and is exactly what this defers instead.
    void loadFileFormat().then(() => { if (overlay.isConnected) render(); }).catch(() => {
        // Silent here BY DESIGN: the failure is not silent anywhere it matters —
        // the first edit refuses loudly through `applyOp`'s OPS_UNAVAILABLE.
    });

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
        commitProfile,
        profilePanel: () => profilePanel,
        beginAddShape,
        submitAddShape,
        selectShape,
        selectedShape: () => selectedSolidId,
        applyShapeDimensions,
        applyDeleteShape,
        previewSettled: () => previewSettled,
        previewResult: () => previewHandle?.lastResult() ?? null,
        save,
        close,
        get model(): ParameterTableModel | null { return model; },
        get statusText(): string { return status.textContent ?? ''; },
    };
    _open = { handle, overlay };
    return handle;
}
