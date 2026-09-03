/**
 * newComponent — Lane U-SEED (§NEW-COMPONENT) · UIUX-PLAN §U1/§U3 ·
 * ADR-0376 D2/D4/D5 · C111 §4.1/§4.3-b · C84 EI-9 · audit R1.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐⭐ THE FROM-ZERO AUTHORING PATH. The starter library answers "I have nothing
 *     to load"; this answers "I want to author my own from a blank sheet." It
 *     mints a MINIMAL VALID Component definition — one type, one parameter added
 *     through the family-migrations op (the ONLY document-mutation path) — packs
 *     it through the ONE packer, loads it through the ONE catalogue, and opens
 *     lane U3's definition workspace on it via that workspace's EXISTING entry
 *     seam. No new bus verb, no second validation pipeline, no rewrite of U3.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ─── ⚠ LAZY `@pryzm/file-format`, deliberately (lane U0 §5-D2 / U3 lesson) ─────
 * The file-format barrel eagerly evaluates pdfjs-dist (`DOMMatrix` at module
 * scope). A static value-import here would drag that onto the graph of every
 * surface that imports the browser panel. Type imports are erased; the ONE value
 * import is `loadFileFormat()`. Sever it and minting REFUSES loudly — the draft
 * is never created by any other route, so nothing is silently produced.
 *
 * ─── ⛔ MUST LAND IN THE SINGLETON CATALOGUE ──────────────────────────────────
 * `openComponentDefinitionWorkspace` resolves the definition out of the process
 * `componentCatalog` singleton. So the mint loads into THAT catalogue (the panel
 * passes its own, which defaults to the singleton) — otherwise the workspace
 * would refuse a definition that exists only in a rival catalogue.
 *
 * ─── D5 ────────────────────────────────────────────────────────────────────────
 * Every user-facing string says Component. `Family*` / `.pryzm-family` below are
 * FROZEN wire/API spellings (ADR-0376 D5), quoted never adopted.
 */

import { createId, parseId } from '@pryzm/schemas';

import {
    componentCatalog as defaultCatalog,
    type ComponentCatalog,
} from '../../services/componentCatalog/index.js';
import {
    openComponentDefinitionWorkspace,
    type OpenComponentDefinitionWorkspaceResult,
} from '../component-editor-workspace/index.js';

/** ⚠ Type-only at module scope; the value surface is loaded LAZILY below. */
type FileFormatModule = typeof import('@pryzm/file-format');

let _ffPromise: Promise<FileFormatModule> | null = null;
/** The ONE gateway to the packer + ops. Severing it makes minting refuse. */
async function loadFileFormat(): Promise<FileFormatModule> {
    return await (_ffPromise ??= import('@pryzm/file-format'));
}

/** sha256 of canonical `{}` — the checksum for a type with no per-type overrides. */
const EMPTY_VALUES_CHECKSUM =
    'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';
/** packFamily re-stamps `manifest.schemaHash`, so a placeholder is correct. */
const PLACEHOLDER_SCHEMA_HASH =
    'sha256:0000000000000000000000000000000000000000000000000000000000000000';

/** Mint a prefixed id through the ONE id factory (`createId`) — the ULID comes
 *  from the sanctioned generator; only the frozen wire prefix differs (the same
 *  convention U3's `mintParameterId` uses). */
function mintId(prefix: string): string {
    const parsed = parseId(createId('component'));
    if (parsed === null) throw new Error('[newComponent] createId produced an unparseable id');
    return `${prefix}_${parsed.ulid}`;
}

export type CreateBlankComponentResult =
    | { readonly ok: true; readonly definitionId: string }
    | { readonly ok: false; readonly refusal: string };

/**
 * Mint a minimal valid Component definition and register it in `catalog`.
 *
 * The document is built with one type, then its single parameter is added
 * through `makeAddParameterMigrator` — the sanctioned document-mutation op — so
 * the from-zero path exercises the same gateway the workspace's edits do. The
 * result is packed and loaded through the ONE catalogue; a Zod refusal from the
 * packer or a loader refusal surfaces verbatim, never a silent empty.
 */
export async function createBlankComponentDefinition(
    catalog: ComponentCatalog = defaultCatalog,
): Promise<CreateBlankComponentResult> {
    let ff: FileFormatModule;
    try {
        ff = await loadFileFormat();
    } catch (e) {
        return {
            ok: false,
            refusal:
                '@pryzm/file-format could not be loaded, so no Component could be created — ' +
                `${e instanceof Error ? e.message : String(e)}.`,
        };
    }

    const famId = mintId('fam');
    const typeId = mintId('typ');
    const paramId = mintId('par');
    const now = new Date().toISOString();

    // A minimal valid document: one type, zero parameters (the op adds the one).
    const baseDocument = {
        formatVersion: '1.1',
        referencePlanes: [],
        parameters: [],
        profiles: [],
        solids: [],
        materialSlots: [],
        types: [{ id: typeId, name: 'Standard', values: {}, checksum: EMPTY_VALUES_CHECKSUM }],
        representations: [],
        connectors: [],
        propertySets: [],
        featureEdges: [],
    } as unknown as import('@pryzm/file-format').FamilyDocument;

    const manifest = {
        formatVersion: '1.1',
        id: famId,
        name: 'New Component',
        semver: '1.0.0',
        author: { id: 'usr_local', displayName: 'You' },
        description: '',
        ifcEntity: 'IfcBuildingElementProxy',
        category: 'Generic',
        tags: [],
        minPRYZMVersion: '2.0.0',
        schemaHash: PLACEHOLDER_SCHEMA_HASH,
        createdAt: now,
        lastModifiedAt: now,
    } as unknown as import('@pryzm/file-format').FamilyManifest;

    // ⛔ THE ONE MUTATION PATH — the first parameter is ADDED via the op, not
    // hand-spliced into the array. Ops are applied `from === to === formatVersion`.
    const addParam = ff.makeAddParameterMigrator('1.1', '1.1', {
        parameter: {
            id: paramId,
            name: 'Width',
            kind: 'instance',
            dataType: 'length',
            defaultValue: 1000,
            expression: null,
            supersededDefault: undefined,
            ifcMapping: null,
            exposed: true,
        } as unknown as import('@pryzm/file-format').FamilyParameter,
    });

    let raw: import('@pryzm/file-format').RawFamily;
    try {
        // ⚠ `ifcMapping` is OPTIONAL on RawFamily and unused here: packFamily
        // PROJECTS the ifc binding from `document.parameters` itself, so a blank
        // component with no ifc-mapped parameters needs none.
        raw = addParam.apply({
            manifest,
            document: baseDocument,
            events: [],
        });
    } catch (e) {
        return {
            ok: false,
            refusal: `The initial parameter could not be added — ${e instanceof Error ? e.message : String(e)}.`,
        };
    }

    const packed = await ff.packFamily({ manifest: raw.manifest, document: raw.document });
    if (!packed.ok) {
        return { ok: false, refusal: `The new Component failed validation: ${packed.message}` };
    }

    const loaded = await catalog.loadFromBytes(packed.bytes, { provenance: 'project' });
    if (!loaded.ok) {
        return { ok: false, refusal: loaded.message };
    }
    return { ok: true, definitionId: loaded.definitionId };
}

export type OpenNewComponentResult =
    | OpenComponentDefinitionWorkspaceResult
    | { readonly ok: false; readonly refusal: string };

/**
 * Mint a blank Component (above) and open lane U3's definition workspace on it.
 * On any mint/pack/load refusal, returns the refusal for the caller to render in
 * place — never a silent no-op.
 */
export async function openNewComponentWorkspace(
    catalog: ComponentCatalog = defaultCatalog,
): Promise<OpenNewComponentResult> {
    const created = await createBlankComponentDefinition(catalog);
    if (!created.ok) return created;
    return openComponentDefinitionWorkspace(created.definitionId);
}
