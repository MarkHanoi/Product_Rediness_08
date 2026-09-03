/**
 * ComponentTypeCatalog — the TYPE CATALOG surface (UI/UX wave, lane U4).
 * §U4-TYPE-CATALOG · UIUX-PLAN §U4 + §4 (R-f) · ADR-0376 D4/D5 · C110 §2.2/§3.3 ·
 * C111 §4.1-b/§4.3-b · C84 EI-9 · C16 CA-18/CA-21 · audit R1 · [[refusing-half-needs-its-escape-hatch]].
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐⭐ MANAGING A COMPONENT DEFINITION'S TYPES — the §24 type catalog: list the
 *     definition's Types, CREATE one that overrides a parameter, EDIT its value
 *     set, DELETE it — every mutation a DOCUMENT edit, packed and reloaded through
 *     the ONE catalogue, so a placed instance of a new type resolves the override.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ─── THE MUTATION SHAPE (UIUX-PLAN §U4's model prerequisite, obeyed) ────────────
 * There are NO type-CRUD bus verbs (audit §1.4 · UIUX-PLAN §4 R-f), and this lane
 * may mint none (C69 makes a wire name permanent). A Type is DOCUMENT content
 * (`FamilyTypeSchema`, `types.min(1)`), so — exactly as UIUX-PLAN §U4 recommends
 * option (a) — this surface edits the draft document, never project/bus state, and
 * NEVER mints a verb. It composes with lane U3's draft-save shape (it does not
 * touch `component-editor-workspace/**`, which is U3's — HARD RULE):
 *
 *   • CREATE / DUPLICATE — the DEDICATED `makeSplitTypeMigrator` op of
 *     `@pryzm/file-format` (op #8): clone a source type + apply value overrides,
 *     recompute its checksum, re-validate the produced document. This is the ONE
 *     mutation that rides a real migrator, and it is this surface's FALSIFICATION
 *     seam (sever `loadFileFormat()` → CREATE refuses loudly, the draft untouched).
 *   • EDIT (rename + value set) / DELETE — NO dedicated migrator exists
 *     (`ls family-migrations/ops/` → 8 ops; none is `change-type-value`,
 *     `rename-type` or `delete-type`). Per the brief, these edit the document's
 *     `types` collection through the SAME discipline U3's ops use — an IMMUTABLE
 *     transform, re-validated by `FamilyDocumentSchema`, the typed refusal rendered
 *     in place, the draft untouched on refusal — and each is OWED BY NAME (§Owed),
 *     never minted as a verb and never a second document validator.
 *
 * DELETE never needs a bespoke "last type" guard: filtering the sole type yields
 * `types: []`, and `FamilyDocumentSchema`'s `types.min(1)` is the ONE voice that
 * refuses it — the schema owns that invariant (C84 EI-9), so this surface does not
 * restate it.
 *
 * ─── D4 DISPLAY — OVERRIDES vs THE DEFINITION DEFAULTS (C110 §2.2) ──────────────
 * The selected type's overrides are shown by MOUNTING lane 4F's parameter table
 * scoped to that type (`createComponentParameterTable` — the ONE resolver, audit
 * R1): a parameter the type overrides wears the `Type` source badge; everything
 * else falls to `Default`. The override badge IS C110 §2.2's source column, reused,
 * never a second precedence statement.
 *
 * ─── SAVE-VIA-PACK (C111 · U0's bytes pipeline) ────────────────────────────────
 * SAVE = `packFamily` (Zod-validates, canonicalises, re-stamps `schemaHash`) →
 * `componentCatalog.loadFromBytes` — the SAME loader U3/U2/U1 re-enter through, so
 * a new type re-enters exactly as any definition enters and the browser's type
 * sub-list refreshes on the catalogue's `subscribe()` with no extra wiring here.
 *
 * ─── ⚠ LAZY `@pryzm/file-format` (lane U0 §5-D2 / U3's seam, mirrored) ──────────
 * The barrel eagerly evaluates pdfjs (`DOMMatrix` at module scope); a static value
 * import would put that on the graph of every surface importing this file. Type
 * imports are erased; the ONE value import is `loadFileFormat()` below — also the
 * falsification seam. Sever it and every edit + save REFUSES LOUDLY, never a
 * silently-lost change.
 *
 * ─── D5 ────────────────────────────────────────────────────────────────────────
 * Every user-facing string says **Component** / **Type**, never "Family".
 * `FamilyDocument`/`FamilyType`/`.pryzm-family` are FROZEN wire/API spellings
 * (ADR-0376 D5) — imported type-only and quoted in comments, never rendered.
 */

import type {
    FamilyDocument,
    FamilyEvent,
    FamilyManifest,
    RawFamily,
} from '@pryzm/file-format';
import {
    type FamilyParameter,
    type FamilyParameterDataType,
    type FamilyType,
    type ResolverInput,
} from '@pryzm/family-runtime';
import { createId, parseId } from '@pryzm/schemas';
// ⭐ Lane 4F's parameter table, MOUNTED not rebuilt (audit R1): the C110 §2.2
// source badges are the type's override display (D4).
import {
    createComponentParameterTable,
    runtimeUnitLabel,
    type ComponentParameterTableHandle,
} from '../component';
// ⭐ Lane U0's ONE catalogue — the same singleton the handlers, the browser (U1),
// the property section (U2) and the definition workspace (U3) read.
import { componentCatalog } from '../../services/componentCatalog';

/* ------------------------------------------------------------------ */
/* §U4-ONE-MUTATION-GATEWAY — the lazy file-format seam                */
/* ------------------------------------------------------------------ */

type FileFormatModule = typeof import('@pryzm/file-format');

let _ffPromise: Promise<FileFormatModule> | null = null;

/** ⛔ THE ONE GATEWAY to `@pryzm/file-format`'s value surface (the split-type op +
 *  the packer + the schema). Severing this import is this surface's falsification:
 *  CREATE (and every save) then REFUSES with the load failure rendered in place —
 *  the draft is never mutated by any other route, so nothing can be silently lost. */
async function loadFileFormat(): Promise<FileFormatModule> {
    return await (_ffPromise ??= import('@pryzm/file-format'));
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** One override the create/edit forms carry: a parameter id → authored raw text.
 *  Empty text means "no override for this parameter" (inherit the default / base). */
export interface TypeValueEdit {
    readonly parameterId: string;
    readonly raw: string;
}

export interface CreateTypeFields {
    readonly name: string;
    /** The source type to clone (split-type requires one; `types.min(1)` guarantees it). */
    readonly baseTypeId: string;
    readonly overrides: readonly TypeValueEdit[];
}

export interface EditTypeFields {
    readonly newName: string;
    /** The FULL override set for the type — non-empty entries only (an empty raw
     *  clears that parameter's override). Replaces the type's `values` map. */
    readonly overrides: readonly TypeValueEdit[];
}

/** A row of the type list, for read-back and tests. */
export interface TypeCatalogRow {
    readonly id: string;
    readonly name: string;
    /** How many DECLARED parameters this type overrides (C110 §2.2's `type` source). */
    readonly overrideCount: number;
}

export interface ComponentTypeCatalogHandle {
    readonly ok: true;
    readonly root: HTMLElement;
    readonly definitionId: string;
    /** The draft document (read-only view — mutation is ops/transform-only). */
    readonly document: FamilyDocument;
    isDirty(): boolean;
    isOpen(): boolean;
    /** The types as rows (id, name, override count). */
    rows(): readonly TypeCatalogRow[];
    /** Select a type → its scoped 4F override table renders below the list. */
    selectType(typeId: string): void;
    readonly selectedTypeId: string | null;
    /** Open the create form (DOM), optionally pre-seeding the base type. */
    beginCreateType(baseTypeId?: string): void;
    /** CREATE via `makeSplitTypeMigrator`. Resolves null on success, the refusal on refusal. */
    submitCreateType(fields: CreateTypeFields): Promise<string | null>;
    /** Open the edit form for a type (DOM). */
    beginEditType(typeId: string): boolean;
    /** EDIT the type's name + value set via a re-validated document transform. */
    submitEditType(typeId: string, fields: EditTypeFields): Promise<string | null>;
    /** DELETE the type via a re-validated document transform (last type → schema refuses). */
    deleteType(typeId: string): Promise<string | null>;
    /** Pack via `packFamily` and reload through the ONE catalogue/loader. */
    save(): Promise<string | null>;
    close(): void;
    readonly statusText: string;
}

export type OpenComponentTypeCatalogResult =
    | ComponentTypeCatalogHandle
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

/** The message every op/transform failure wears when the gateway itself failed. */
const OPS_UNAVAILABLE =
    'The Component document-migration ops could not be loaded from the file-format package — the ' +
    'edit was NOT applied and the draft is unchanged';

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K, css: string, text?: string,
): HTMLElementTagNameMap[K] {
    const n = document.createElement(tag);
    n.style.cssText = css;
    if (text !== undefined) n.textContent = text;
    return n;
}

/** boolean → 1/0, nothing else touched — mirrors `bakeFamilyInstance`'s private
 *  `numericTypeValues` at the identical join (U2/U3 carry the same mirror; O-5 is
 *  the single-export that would delete all of them). */
function coerceValues(
    raw: Readonly<Record<string, number | string | boolean>>,
): Readonly<Record<string, number | string>> {
    const out: Record<string, number | string> = {};
    for (const [k, v] of Object.entries(raw)) out[k] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
    return out;
}

/** Mint a `typ_<ULID>` through the ONE id factory (`createId`) — the ULID comes
 *  from the sanctioned generator; only the frozen wire prefix differs (U3's
 *  `mintParameterId`, re-prefixed for a type). */
function mintTypeId(): string {
    const parsed = parseId(createId('component'));
    if (parsed === null) throw new Error('[type-catalog] createId produced an unparseable id');
    return `typ_${parsed.ulid}`;
}

/** Parse an authored override by the DECLARED dataType. Refuses nothing itself —
 *  a wrong shape reaches the Zod schema, the one voice. Empty → `null` (no override). */
function parseTypeValue(
    dataType: FamilyParameterDataType, raw: string,
): number | string | boolean | null {
    const t = raw.trim();
    if (t === '') return null;
    if (dataType === 'string') return raw;
    if (dataType === 'boolean') {
        if (t === 'true') return true;
        if (t === 'false') return false;
    }
    const n = Number(t);
    return Number.isFinite(n) ? n : raw;
}

/** Collect a form's non-empty overrides into a `{ [parameterId]: value }` map. */
function overridesToMap(
    overrides: readonly TypeValueEdit[],
    paramById: Map<string, FamilyParameter>,
): Record<string, number | string | boolean> {
    const out: Record<string, number | string | boolean> = {};
    for (const e of overrides) {
        const p = paramById.get(e.parameterId);
        if (p === undefined) continue;
        const v = parseTypeValue(p.dataType, e.raw);
        if (v !== null) out[e.parameterId] = v;
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* The surface                                                         */
/* ------------------------------------------------------------------ */

let _open: { handle: ComponentTypeCatalogHandle; overlay: HTMLElement } | null = null;

/**
 * Open the Type Catalog for a LOADED definition. One catalog at a time (reopen
 * replaces). An unloaded definition REFUSES by name — the caller renders the
 * refusal ([[refusing-half-needs-its-escape-hatch]]).
 */
export function openComponentTypeCatalog(
    definitionId: string,
): OpenComponentTypeCatalogResult {
    const entry = componentCatalog.entry(definitionId);
    if (entry === undefined) {
        return {
            ok: false,
            refusal:
                `Definition ${definitionId} is not loaded in this project's component ` +
                'catalogue, so there are no types to manage. Load it first ' +
                `(the catalogue holds ${componentCatalog.size()} definition(s)).`,
        };
    }

    // Replace any open catalog — one draft at a time, never two drafts of one truth.
    _open?.handle.close();

    const provenance = entry.provenance;

    /* ── draft state — moved ONLY by the split-type op or a re-validated transform ── */
    let draft: { manifest: FamilyManifest; document: FamilyDocument; events: readonly FamilyEvent[] } = {
        manifest: entry.family.manifest,
        document: entry.family.document,
        events: entry.family.events,
    };
    let dirty = false;
    let selectedTypeId: string | null = draft.document.types[0]?.id ?? null;
    let createForm: HTMLElement | null = null;

    /* ── chrome ── */
    const overlay = el('div',
        'position:fixed;inset:0;z-index:10061;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(15,15,30,0.55);font-family:system-ui,sans-serif;');
    overlay.setAttribute('data-ctc-overlay', '');
    const card = el('div',
        'width:min(760px,calc(100% - 48px));max-height:min(720px,calc(100% - 48px));display:flex;' +
        'flex-direction:column;overflow-y:auto;background:#fff;color:' + INK + ';border-radius:12px;' +
        'padding:20px;box-shadow:0 24px 64px rgba(0,0,0,0.35);font:13px/1.45 system-ui,sans-serif;');
    card.setAttribute('data-ctc-root', definitionId);
    overlay.appendChild(card);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    const onKeyDown = (e: KeyboardEvent): void => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKeyDown);

    const status = el('div', `margin-top:8px;min-height:16px;font-size:11.5px;color:${MUTED};white-space:pre-wrap;`);
    status.setAttribute('data-ctc-status', '');
    const setStatus = (msg: string, isRefusal = false): void => {
        status.textContent = msg;
        status.style.color = isRefusal ? REFUSAL : MUTED;
        status.setAttribute('data-ctc-status-kind', isRefusal ? 'refusal' : 'info');
    };

    const table: ComponentParameterTableHandle = createComponentParameterTable({ attrPrefix: 'ctct' });

    /* ── helpers ── */
    const params = (): readonly FamilyParameter[] =>
        draft.document.parameters as unknown as readonly FamilyParameter[];
    const paramById = (): Map<string, FamilyParameter> =>
        new Map(params().map((p) => [p.id, p]));

    /** Overrides a type carries that correspond to a DECLARED parameter (C110 §2.2). */
    function overrideCount(values: Readonly<Record<string, number | string | boolean>>): number {
        const known = new Set(params().map((p) => p.id));
        return Object.keys(values).filter((k) => known.has(k)).length;
    }

    function rows(): readonly TypeCatalogRow[] {
        return draft.document.types.map((t) => ({
            id: t.id, name: t.name, overrideCount: overrideCount(t.values),
        }));
    }

    /** The resolver input scoped to one type — feeds the 4F table (D4 display). */
    function resolverInputFor(typeId: string | null): ResolverInput {
        const t = typeId === null ? null : draft.document.types.find((x) => x.id === typeId);
        const type: FamilyType | null = t
            ? { id: t.id, name: t.name, values: coerceValues(t.values) }
            : null;
        return { parameters: params(), type, instanceOverrides: {} };
    }

    /* ── the ONE draft gateway (⛔ the ONLY draft mutation) ────────────────
     * 1. lazy-load @pryzm/file-format (the falsification seam);
     * 2. build the next RawFamily — CREATE via `makeSplitTypeMigrator(...).apply`,
     *    EDIT/DELETE via a pure immutable `types` transform (typed guards throw);
     * 3. the op's / guard's typed throw is the refusal, verbatim;
     * 4. Zod-validate the produced document via `FamilyDocumentSchema` — an invalid
     *    document (e.g. `types.min(1)` on the last delete) REFUSES, draft untouched;
     * 5. accept + re-render.                                             */
    async function applyDraft(
        opLabel: string,
        build: (ff: FileFormatModule) => RawFamily,
    ): Promise<{ ok: true } | { ok: false; refusal: string }> {
        let ff: FileFormatModule;
        try {
            ff = await loadFileFormat();
        } catch (e) {
            return { ok: false, refusal: `${OPS_UNAVAILABLE}: ${e instanceof Error ? e.message : String(e)}.` };
        }
        let next: RawFamily;
        try {
            next = build(ff);
        } catch (e) {
            // ⭐ The op's / guard's OWN typed error, verbatim — one refusal vocabulary.
            return { ok: false, refusal: e instanceof Error ? e.message : String(e) };
        }
        const parsed = ff.FamilyDocumentSchema.safeParse(next.document);
        if (!parsed.success) {
            const first = parsed.error.issues[0];
            return {
                ok: false,
                refusal:
                    `The edit produced an invalid Component definition document and was refused ` +
                    `(${opLabel}): ${first ? `${first.path.join('.')}: ${first.message}` : parsed.error.message}. ` +
                    'The draft is unchanged.',
            };
        }
        draft = { manifest: next.manifest, document: next.document, events: next.events ?? draft.events };
        dirty = true;
        render();
        return { ok: true };
    }

    /** The immutable RawFamily built from the draft — the input every op/transform reads. */
    function rawInput(): RawFamily {
        return { manifest: draft.manifest, document: draft.document, events: draft.events };
    }

    /* ── CREATE / DUPLICATE (the dedicated split-type op) ── */

    async function submitCreateType(fields: CreateTypeFields): Promise<string | null> {
        const v = draft.document.formatVersion;
        const name = fields.name.trim();
        const map = overridesToMap(fields.overrides, paramById());
        const newTypeId = mintTypeId();
        const res = await applyDraft('create-type', (ff) => {
            // ⚠ NAME-UNIQUENESS is enforced by NEITHER `FamilyTypeSchema` NOR
            // `makeSplitTypeMigrator` (which guards only the id). This surface guards it
            // — a genuine gap, not a rival validator (nothing else validates names, so
            // nothing can drift). OWED: a uniqueness refinement on the schema's `types`
            // array, or a guard inside split-type (§Owed O-1).
            const clash = draft.document.types.find(
                (t) => t.name.trim().toLowerCase() === name.toLowerCase(),
            );
            if (clash) {
                throw new Error(
                    `A type named "${name}" already exists in this Component definition ` +
                    `(${clash.id}). Type names must be unique — nothing was created, and the ` +
                    'draft is unchanged.',
                );
            }
            return ff.makeSplitTypeMigrator(v, v, {
                sourceTypeId: fields.baseTypeId,
                newTypeId,
                newTypeName: name,
                valueOverrides: map,
            }).apply(rawInput());
        });
        if (!res.ok) { renderCreateRefusal(res.refusal); return res.refusal; }
        createForm = null;
        selectedTypeId = newTypeId;
        render();
        setStatus(`Type '${name}' created in the draft (not yet saved).`);
        return null;
    }

    /* ── EDIT (rename + value set) — re-validated document transform (OWED op) ── */

    async function submitEditType(typeId: string, fields: EditTypeFields): Promise<string | null> {
        const newName = fields.newName.trim();
        const map = overridesToMap(fields.overrides, paramById());
        const res = await applyDraft('edit-type', () => {
            const target = draft.document.types.find((t) => t.id === typeId);
            if (!target) throw new Error(`Type ${typeId} is not carried by this definition.`);
            // ⚠ EDIT has NO dedicated migrator (OWED §Owed O-2). The transform is
            // IMMUTABLE and follows U3's ops discipline: build a new `types` array and a
            // new document, re-validated by `FamilyDocumentSchema`. The per-type
            // `checksum` is carried UNCHANGED — no op recomputes it and the loader does
            // not verify it (U3 O-4), so recomputing here would be a rival writer; OWED.
            const clash = draft.document.types.find(
                (t) => t.id !== typeId && t.name.trim().toLowerCase() === newName.toLowerCase(),
            );
            if (clash) {
                throw new Error(
                    `A type named "${newName}" already exists in this Component definition ` +
                    `(${clash.id}). Type names must be unique — the draft is unchanged.`,
                );
            }
            const nextTypes = draft.document.types.map((t) =>
                t.id === typeId ? { ...t, name: newName, values: map } : t);
            return { ...rawInput(), document: { ...draft.document, types: nextTypes } };
        });
        if (!res.ok) { renderTypeRefusal(typeId, res.refusal); return res.refusal; }
        setStatus(`Type renamed to '${newName}' and its overrides updated in the draft (not yet saved).`);
        return null;
    }

    /* ── DELETE — re-validated document transform; last type → schema refuses ── */

    async function deleteType(typeId: string): Promise<string | null> {
        const res = await applyDraft('delete-type', () => {
            const target = draft.document.types.find((t) => t.id === typeId);
            if (!target) throw new Error(`Type ${typeId} is not carried by this definition.`);
            // ⚠ DELETE has NO dedicated migrator (OWED §Owed O-3). Filter immutably; if
            // this is the sole type, the produced `types: []` fails `FamilyDocumentSchema`'s
            // `types.min(1)` — the schema is the ONE voice for that invariant (C84 EI-9),
            // so this surface does not restate it.
            const nextTypes = draft.document.types.filter((t) => t.id !== typeId);
            return { ...rawInput(), document: { ...draft.document, types: nextTypes } };
        });
        if (!res.ok) { renderTypeRefusal(typeId, res.refusal); return res.refusal; }
        if (selectedTypeId === typeId) selectedTypeId = draft.document.types[0]?.id ?? null;
        render();
        setStatus('Type deleted from the draft (not yet saved).');
        return null;
    }

    /* ── save-via-pack (mirrors U3 — the ONE packer + the ONE loader) ── */

    async function save(): Promise<string | null> {
        let ff: FileFormatModule;
        try {
            ff = await loadFileFormat();
        } catch (e) {
            const msg = `The packer could not be loaded from the file-format package — nothing was saved: ${e instanceof Error ? e.message : String(e)}.`;
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
            setStatus(`Not saved — ${packed.message}`, true);
            return packed.message;
        }
        const res = await componentCatalog.loadFromBytes(packed.bytes, {
            provenance,
            expectId: definitionId,
        });
        if (!res.ok) {
            setStatus(`Packed, but the reload through the catalogue refused — ${res.message}`, true);
            return res.message;
        }
        // Rebase the draft on the RELOADED (loader-validated) document — one truth.
        draft = {
            manifest: res.entry.family.manifest,
            document: res.entry.family.document,
            events: res.entry.family.events,
        };
        dirty = false;
        if (selectedTypeId !== null && !draft.document.types.some((t) => t.id === selectedTypeId)) {
            selectedTypeId = draft.document.types[0]?.id ?? null;
        }
        render();
        setStatus(`Saved — packed and reloaded through the catalogue (${res.entry.family.schemaHash}).`);
        return null;
    }

    /* ── refusals rendered IN PLACE (C16 CA-18) ── */
    function renderCreateRefusal(text: string): void {
        const host = card.querySelector('[data-ctc-create-refusal]');
        if (host instanceof HTMLElement) { host.textContent = `⛔ ${text}`; host.style.display = ''; return; }
        setStatus(text, true);
    }
    function renderTypeRefusal(typeId: string, text: string): void {
        card.querySelector(`[data-ctc-type-refusal="${typeId}"]`)?.remove();
        const row = card.querySelector(`[data-ctc-type="${typeId}"]`);
        if (!(row instanceof HTMLElement)) { setStatus(text, true); return; }
        const line = el('div', `margin:2px 0 6px;font-size:11.5px;color:${REFUSAL};white-space:pre-wrap;`, `⛔ ${text}`);
        line.setAttribute('data-ctc-type-refusal', typeId);
        row.insertAdjacentElement('afterend', line);
    }

    /* ── create/duplicate form ── */
    function beginCreateType(baseTypeId?: string): void {
        const base = baseTypeId ?? selectedTypeId ?? draft.document.types[0]?.id ?? '';
        render();
        const anchor = card.querySelector('[data-ctc-toolbar]');
        if (!(anchor instanceof HTMLElement)) return;

        const wrap = el('div',
            `border:1px solid ${LINE};border-radius:8px;padding:12px;margin:8px 0;`);
        wrap.setAttribute('data-ctc-create-form', '');

        wrap.appendChild(el('div', 'font-weight:700;font-size:12px;margin-bottom:6px;', 'New type'));

        const nameRow = el('div', 'display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;');
        const nameIn = document.createElement('input');
        nameIn.setAttribute('data-ctc-create-name', '');
        nameIn.placeholder = 'Type name (e.g. Wide)';
        nameIn.style.cssText = 'flex:1;min-width:160px;padding:4px 6px;font:12.5px system-ui,sans-serif;';
        nameRow.appendChild(el('span', `font-size:11.5px;color:${MUTED};`, 'Name'));
        nameRow.appendChild(nameIn);
        nameRow.appendChild(el('span', `font-size:11.5px;color:${MUTED};`, 'Duplicate from'));
        const baseSel = document.createElement('select');
        baseSel.setAttribute('data-ctc-create-base', '');
        for (const t of draft.document.types) {
            const o = document.createElement('option');
            o.value = t.id; o.textContent = t.name;
            if (t.id === base) o.selected = true;
            baseSel.appendChild(o);
        }
        nameRow.appendChild(baseSel);
        wrap.appendChild(nameRow);

        // Per-parameter override inputs — empty = inherit the base value / default;
        // a value here overrides it (C110 §2.2's `type` source). Keyed by parameter id.
        wrap.appendChild(el('div', `font-size:11px;color:${MUTED};margin:2px 0 4px;`,
            'Overrides — leave blank to inherit the base value:'));
        const ovHost = el('div', 'display:flex;flex-direction:column;gap:4px;margin-bottom:8px;');
        const baseType = draft.document.types.find((t) => t.id === base);
        for (const p of params()) {
            const rowEl = el('div', 'display:flex;gap:6px;align-items:center;');
            rowEl.appendChild(el('span', `flex:0 0 160px;font-size:12px;color:${INK};`, `${p.name} (${p.dataType})`));
            const inp = document.createElement('input');
            inp.setAttribute('data-ctc-create-override', p.id);
            const baseVal = baseType && Object.prototype.hasOwnProperty.call(baseType.values, p.id)
                ? baseType.values[p.id]
                : p.defaultValue;
            const unit = runtimeUnitLabel(p.dataType);
            inp.placeholder = baseVal === null || baseVal === undefined
                ? (unit ? `inherit (${unit})` : 'inherit')
                : `inherit ${String(baseVal)}${unit ? ' ' + unit : ''}`;
            inp.style.cssText = 'width:170px;padding:3px 6px;font:12px ui-monospace,monospace;';
            rowEl.appendChild(inp);
            ovHost.appendChild(rowEl);
        }
        wrap.appendChild(ovHost);

        const refusal = el('div', `display:none;margin:2px 0 6px;font-size:11.5px;color:${REFUSAL};white-space:pre-wrap;`);
        refusal.setAttribute('data-ctc-create-refusal', '');
        wrap.appendChild(refusal);

        const btnRow = el('div', 'display:flex;gap:6px;');
        const applyBtn = el('button',
            `background:${PURPLE};color:#fff;border:none;padding:5px 14px;border-radius:6px;font-weight:600;cursor:pointer;`,
            'Create type');
        applyBtn.setAttribute('data-ctc-create-apply', '');
        applyBtn.addEventListener('click', () => {
            refusal.style.display = 'none';
            const overrides: TypeValueEdit[] = params().map((p) => ({
                parameterId: p.id,
                raw: (ovHost.querySelector(`[data-ctc-create-override="${p.id}"]`) as HTMLInputElement | null)?.value ?? '',
            }));
            void submitCreateType({ name: nameIn.value, baseTypeId: baseSel.value, overrides });
        });
        const cancelBtn = el('button', 'padding:5px 12px;cursor:pointer;', 'Cancel');
        cancelBtn.addEventListener('click', () => { createForm?.remove(); createForm = null; });
        btnRow.append(applyBtn, cancelBtn);
        wrap.appendChild(btnRow);

        anchor.insertAdjacentElement('afterend', wrap);
        createForm = wrap;
        nameIn.focus?.();
    }

    /* ── edit form ── */
    function beginEditType(typeId: string): boolean {
        const t = draft.document.types.find((x) => x.id === typeId);
        const row = card.querySelector(`[data-ctc-type="${typeId}"]`);
        if (!t || !(row instanceof HTMLElement)) return false;
        card.querySelectorAll('[data-ctc-edit-form]').forEach((n) => n.remove());

        const wrap = el('div', `border:1px solid ${LINE};border-radius:8px;padding:12px;margin:4px 0 8px;`);
        wrap.setAttribute('data-ctc-edit-form', typeId);

        wrap.appendChild(el('div', 'font-weight:700;font-size:12px;margin-bottom:6px;', `Edit type '${t.name}'`));

        const nameRow = el('div', 'display:flex;gap:8px;align-items:center;margin-bottom:8px;');
        nameRow.appendChild(el('span', `font-size:11.5px;color:${MUTED};`, 'Name'));
        const nameIn = document.createElement('input');
        nameIn.setAttribute('data-ctc-edit-name', typeId);
        nameIn.value = t.name;
        nameIn.style.cssText = 'flex:1;min-width:160px;padding:4px 6px;font:12.5px system-ui,sans-serif;';
        nameRow.appendChild(nameIn);
        wrap.appendChild(nameRow);

        wrap.appendChild(el('div', `font-size:11px;color:${MUTED};margin:2px 0 4px;`,
            'Overrides — blank clears the override (the parameter falls back to its default):'));
        const ovHost = el('div', 'display:flex;flex-direction:column;gap:4px;margin-bottom:8px;');
        for (const p of params()) {
            const rowEl = el('div', 'display:flex;gap:6px;align-items:center;');
            rowEl.appendChild(el('span', `flex:0 0 160px;font-size:12px;color:${INK};`, `${p.name} (${p.dataType})`));
            const inp = document.createElement('input');
            inp.setAttribute('data-ctc-edit-value', p.id);
            const cur = Object.prototype.hasOwnProperty.call(t.values, p.id) ? t.values[p.id] : null;
            if (cur !== null) inp.value = String(cur);
            const unit = runtimeUnitLabel(p.dataType);
            inp.placeholder = unit ? `default (${unit})` : 'default';
            inp.style.cssText = 'width:170px;padding:3px 6px;font:12px ui-monospace,monospace;';
            rowEl.appendChild(inp);
            ovHost.appendChild(rowEl);
        }
        wrap.appendChild(ovHost);

        const btnRow = el('div', 'display:flex;gap:6px;');
        const applyBtn = el('button',
            `background:${PURPLE};color:#fff;border:none;padding:5px 14px;border-radius:6px;font-weight:600;cursor:pointer;`,
            'Apply changes');
        applyBtn.setAttribute('data-ctc-edit-apply', typeId);
        applyBtn.addEventListener('click', () => {
            const overrides: TypeValueEdit[] = params().map((p) => ({
                parameterId: p.id,
                raw: (ovHost.querySelector(`[data-ctc-edit-value="${p.id}"]`) as HTMLInputElement | null)?.value ?? '',
            }));
            void submitEditType(typeId, { newName: nameIn.value, overrides });
        });
        const cancelBtn = el('button', 'padding:5px 12px;cursor:pointer;', 'Cancel');
        cancelBtn.addEventListener('click', () => { wrap.remove(); });
        btnRow.append(applyBtn, cancelBtn);
        wrap.appendChild(btnRow);

        row.insertAdjacentElement('afterend', wrap);
        nameIn.focus?.();
        return true;
    }

    /* ── render ── */
    function render(): void {
        createForm = null;
        card.replaceChildren();
        const doc = draft.document;

        // header
        const head = el('div', 'display:flex;align-items:baseline;gap:10px;margin:0 0 4px;');
        head.appendChild(el('h2', `margin:0;font-size:18px;color:${PURPLE};`, 'Component Types'));
        const closeBtn = el('button',
            'margin-left:auto;background:none;border:none;font-size:20px;cursor:pointer;color:#555;padding:2px 8px;', '×');
        closeBtn.setAttribute('data-ctc-close', '');
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.addEventListener('click', () => close());
        head.appendChild(closeBtn);
        card.appendChild(head);

        const name = el('div', 'font-size:14px;font-weight:700;', draft.manifest.name);
        name.setAttribute('data-ctc-defname', draft.manifest.name);
        card.appendChild(name);
        const sub = el('div', `font-size:11px;color:${MUTED};margin-bottom:8px;`,
            `${definitionId} · v${draft.manifest.semver} · ${provenance}` +
            ` · ${doc.types.length} type(s) · ${doc.parameters.length} parameter(s)`);
        sub.setAttribute('data-ctc-schemahash', componentCatalog.entry(definitionId)?.family.schemaHash ?? '');
        card.appendChild(sub);

        const dirtyLine = el('div',
            `font-size:11.5px;margin-bottom:6px;color:${dirty ? WARN : MUTED};`,
            dirty
                ? 'Unsaved draft changes — “Save definition” packs the document and reloads it through the catalogue.'
                : 'No unsaved changes.');
        dirtyLine.setAttribute('data-ctc-dirty', dirty ? 'true' : 'false');
        card.appendChild(dirtyLine);

        // toolbar
        const toolbar = el('div', 'display:flex;gap:8px;margin:0 0 6px;');
        toolbar.setAttribute('data-ctc-toolbar', '');
        const newBtn = el('button',
            `background:#fff;color:${PURPLE};border:1px solid ${PURPLE};padding:5px 14px;border-radius:6px;` +
            'font-weight:600;cursor:pointer;font-size:12px;', 'New type…');
        newBtn.setAttribute('data-ctc-new', '');
        newBtn.addEventListener('click', () => beginCreateType());
        toolbar.appendChild(newBtn);
        const saveBtn = el('button',
            `background:${PURPLE};color:#fff;border:none;padding:5px 16px;border-radius:6px;` +
            'font-weight:600;cursor:pointer;font-size:12px;', 'Save definition');
        saveBtn.setAttribute('data-ctc-save', '');
        saveBtn.addEventListener('click', () => { void save(); });
        toolbar.appendChild(saveBtn);
        card.appendChild(toolbar);

        // type list
        card.appendChild(el('div',
            'font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;' +
            `color:${MUTED};margin:8px 0 4px;`, 'Types'));
        for (const r of rows()) {
            const row = el('div',
                'display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;cursor:pointer;' +
                (r.id === selectedTypeId ? `background:rgba(102,0,255,0.06);` : ''));
            row.setAttribute('data-ctc-type', r.id);
            row.setAttribute('data-ctc-type-selected', r.id === selectedTypeId ? 'true' : 'false');

            const label = el('span', 'font-size:13px;font-weight:600;', r.name);
            label.setAttribute('data-ctc-type-name', r.name);
            row.appendChild(label);

            const ov = el('span',
                'display:inline-block;padding:1px 8px;border-radius:999px;font-size:10.5px;font-weight:700;' +
                (r.overrideCount > 0
                    ? `color:#fff;background:${PURPLE};`
                    : `color:${MUTED};border:1px solid ${LINE};`),
                r.overrideCount > 0
                    ? `${r.overrideCount} override${r.overrideCount === 1 ? '' : 's'}`
                    : 'no overrides');
            ov.setAttribute('data-ctc-type-overrides', String(r.overrideCount));
            row.appendChild(ov);

            const spacer = el('span', 'margin-left:auto;');
            row.appendChild(spacer);

            const editBtn = el('button', 'padding:2px 10px;font-size:11.5px;cursor:pointer;', 'Edit…');
            editBtn.setAttribute('data-ctc-type-edit', r.id);
            editBtn.addEventListener('click', (e) => { e.stopPropagation(); beginEditType(r.id); });
            row.appendChild(editBtn);

            const dupBtn = el('button', 'padding:2px 10px;font-size:11.5px;cursor:pointer;', 'Duplicate…');
            dupBtn.setAttribute('data-ctc-type-duplicate', r.id);
            dupBtn.addEventListener('click', (e) => { e.stopPropagation(); beginCreateType(r.id); });
            row.appendChild(dupBtn);

            const delBtn = el('button', `padding:2px 10px;font-size:11.5px;cursor:pointer;color:${REFUSAL};`, 'Delete');
            delBtn.setAttribute('data-ctc-type-delete', r.id);
            delBtn.addEventListener('click', (e) => { e.stopPropagation(); void deleteType(r.id); });
            row.appendChild(delBtn);

            row.addEventListener('click', () => selectType(r.id));
            card.appendChild(row);
        }

        // selected-type override table (the 4F table, D4 display)
        if (selectedTypeId !== null) {
            const t = doc.types.find((x) => x.id === selectedTypeId);
            if (t) {
                const detail = el('div', 'margin-top:8px;');
                detail.setAttribute('data-ctc-detail', selectedTypeId);
                detail.appendChild(el('div',
                    `font-size:11.5px;color:${MUTED};margin-bottom:4px;`,
                    `Overrides for '${t.name}' vs the definition defaults — a “Type” badge marks each override (C110 §2.2):`));
                table.render(resolverInputFor(selectedTypeId));
                detail.appendChild(table.root);
                card.appendChild(detail);
            }
        }

        card.appendChild(status);
    }

    function selectType(typeId: string): void {
        selectedTypeId = typeId;
        render();
    }

    function close(): void {
        document.removeEventListener('keydown', onKeyDown);
        overlay.remove();
        if (_open?.overlay === overlay) _open = null;
    }

    render();
    setStatus('');
    document.body.appendChild(overlay);

    const handle: ComponentTypeCatalogHandle = {
        ok: true,
        root: card,
        definitionId,
        get document(): FamilyDocument { return draft.document; },
        isDirty: () => dirty,
        isOpen: () => overlay.isConnected,
        rows,
        selectType,
        get selectedTypeId(): string | null { return selectedTypeId; },
        beginCreateType,
        submitCreateType,
        beginEditType,
        submitEditType,
        deleteType,
        save,
        close,
        get statusText(): string { return status.textContent ?? ''; },
    };
    _open = { handle, overlay };
    return handle;
}
