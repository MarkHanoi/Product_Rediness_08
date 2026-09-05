/**
 * restoreComponentDefinitions — the project's component DEFINITIONS travel with the
 * project file: the save leg (`serializeComponentDefinitions`) and the load leg
 * (`restoreComponentDefinitions`) of one snapshot key, `componentDefinitions`.
 *
 * §82.7-DEFINITIONS-TRAVEL-WITH-PROJECT · STR-UCE-MASTER-SPEC §82.7 · C111 §4.3-a/b ·
 * C47 (additive-optional) · C84 EI-6 · UCE-REACHABILITY-AUDIT A14 / rank 2.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE FOUNDER'S 82.7: "Author, reload, the family is still in the catalogue and
 *    its instances still resolve." — the audit's rank-2 gap ("an authored
 *    component dies on F5"), closed here.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ─── THE RULING THIS EXECUTES, AND WHY IT IS NOT A NEW REGISTRY ───────────────
 * `ComponentCatalog.ts` refused to invent a storage location because *"C111 §4.3-a
 * rules the split (definitions in the envelope, instances in the snapshot) but
 * nothing rules how a project references its definition set."* §82.7 is that
 * ruling, from the founder, in his own words: the definition *travels with the
 * project*. This file honours BOTH halves of §4.3-a at once:
 *
 *   • The definition still lives in its content-addressed `.pryzm-family`
 *     ENVELOPE. The snapshot carries the envelope's EXACT BYTES (the
 *     `§UCE-DEFINITION-ESCAPE-HATCH` copy the catalogue keeps on every entry),
 *     base64-encoded, OPAQUE — the snapshot never parses, projects or re-packs a
 *     document. There is no second definition schema and no second registry:
 *     on load the bytes go through `catalog.loadFromBytes` — the ONE loader wrap
 *     every other leg (file-open, marketplace, builtin) funnels through.
 *   • The reference is `(definitionId, schemaHash)` — §4.3-b, never the id alone.
 *     The loader recomputes `schemaHash` from the bytes, and a row whose recorded
 *     hash disagrees with the recomputed one is REFUSED by name, with both hashes,
 *     and NOT registered: a file edited by hand, or an envelope that drifted, does
 *     not silently re-shape every placed instance.
 *
 * ─── WHAT TRAVELS ──────────────────────────────────────────────────────────────
 * EVERY definition the catalogue holds at save time, whatever its provenance. A
 * marketplace definition that is placed in the project must open with the
 * project on a machine that has no marketplace (spec §37 — *"never silently
 * destroy historical meaning"*), and an authored-but-not-yet-placed definition is
 * exactly the one 82.7 names. Provenance rides along as a recorded fact.
 *
 * ─── ORDER ON LOAD, AND WHY IT IS SAFE EITHER WAY ─────────────────────────────
 * `ProjectLoader` awaits this BEFORE `restoreCompoundFamilies()` restores the
 * occurrence records, so the verbs' resolver (`component.setInstanceParameter`
 * refuses an unknown definitionId BY NAME) and the render seam both find the
 * definition. ⭐ And if a future caller runs them the other way round, nothing is
 * lost: `attachComponentRender` subscribes the catalogue and re-bakes every
 * occurrence on every load (§82.6-DEFINITION-INVALIDATION).
 *
 * ─── PROJECT SCOPE ─────────────────────────────────────────────────────────────
 * Opening a project REPLACES the catalogue's contents with the file's definition
 * set (`clear()` first). The catalogue was process-lifetime because nothing ruled
 * its scope; §82.7 rules it project-scoped, and a definition loaded in project A
 * leaking into project B's save would be a definition B never authored.
 *
 * ⚠ WHAT THIS FILE DOES NOT ESTABLISH: that the AUTHORING WORKSPACE writes into the
 * catalogue on every keystroke — it does not; `ComponentDefinitionWorkspace.save()`
 * is what registers the packed bytes, and an unsaved draft is an unsaved draft.
 */

import { componentCatalog, type ComponentCatalog } from '../../services/componentCatalog/index';

/** One row of the `componentDefinitions` snapshot slice. */
export interface ComponentDefinitionSnapshotRow {
    /** `fam_<ULID>` — the manifest id (C111 §1.1-a). */
    readonly definitionId: string;
    /** `sha256:<hex>` — the content address (C111 §4.3-b). */
    readonly schemaHash: string;
    readonly semver: string;
    readonly name: string;
    readonly provenance: 'project' | 'marketplace' | 'builtin';
    /** The `.pryzm-family` envelope bytes, base64. OPAQUE — never parsed here. */
    readonly bytesBase64: string;
}

export interface ComponentDefinitionsRestoreResult {
    /** Rows registered, by definitionId. */
    readonly restored: readonly string[];
    /** One sentence per refused row — surfaced on the LoadResult, never swallowed. */
    readonly errors: readonly string[];
    readonly total: number;
}

/* ── base64, both hosts ────────────────────────────────────────────────────── */

function toBase64(bytes: Uint8Array): string {
    const B = (globalThis as { Buffer?: { from(b: Uint8Array): { toString(enc: string): string } } }).Buffer;
    if (B !== undefined) return B.from(bytes).toString('base64');
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
}

function fromBase64(text: string): Uint8Array {
    const B = (globalThis as { Buffer?: { from(s: string, enc: string): Uint8Array } }).Buffer;
    if (B !== undefined) return new Uint8Array(B.from(text, 'base64'));
    const bin = atob(text);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/* ── the ONE catalogue, resolved the way the serializer resolves stores ────── */

/**
 * `window.runtime.auxiliaries.componentCatalog` when the composed handle carries
 * it (the SAME instance `PluginRegistry` injected into the verbs), else the
 * process default it was built from. They are one object; the fallback exists
 * for a host with no published runtime.
 */
export function resolveComponentCatalog(): ComponentCatalog {
    const w = globalThis as {
        window?: { runtime?: { auxiliaries?: Record<string, unknown> } };
        runtime?: { auxiliaries?: Record<string, unknown> };
    };
    const aux = w.window?.runtime?.auxiliaries ?? w.runtime?.auxiliaries;
    const c = aux?.['componentCatalog'] as ComponentCatalog | undefined;
    return c ?? componentCatalog;
}

/* ── save leg ──────────────────────────────────────────────────────────────── */

/**
 * Every loaded definition as a snapshot row. Returns `[]` when the catalogue is
 * empty — the serializer turns that into an OMITTED key (C47), so a project with
 * no definitions produces a snapshot byte-identical to a pre-§82.7 one.
 */
export function serializeComponentDefinitions(
    catalog: ComponentCatalog = resolveComponentCatalog(),
): ComponentDefinitionSnapshotRow[] {
    const rows: ComponentDefinitionSnapshotRow[] = [];
    for (const view of catalog.list()) {
        const entry = catalog.entry(view.definitionId);
        if (entry === undefined) continue;
        rows.push({
            definitionId: view.definitionId,
            schemaHash: entry.family.schemaHash,
            semver: entry.family.manifest.semver,
            name: entry.family.manifest.name,
            provenance: entry.provenance,
            bytesBase64: toBase64(entry.bytes),
        });
    }
    return rows;
}

/* ── load leg ──────────────────────────────────────────────────────────────── */

function readRows(snapshot: unknown): ComponentDefinitionSnapshotRow[] {
    const raw = (snapshot as { componentDefinitions?: unknown } | null | undefined)?.componentDefinitions;
    if (!Array.isArray(raw)) return [];
    return raw.filter((r): r is ComponentDefinitionSnapshotRow =>
        typeof r === 'object' && r !== null
        && typeof (r as { definitionId?: unknown }).definitionId === 'string'
        && typeof (r as { bytesBase64?: unknown }).bytesBase64 === 'string');
}

/**
 * Register every definition the snapshot carries, through the ONE loader.
 *
 * ⛔ Refuses, by name and with both hashes, a row whose recorded `schemaHash`
 *    disagrees with the hash the loader computed from the bytes (C111 §4.3-b);
 *    refuses a row whose bytes decode to a different manifest id (`expectId`);
 *    passes the LOADER's own named error through verbatim for bytes it cannot
 *    load. A refused row is NOT registered — its placed instances stay in the
 *    model (they are the user's data) and render as an absence with the reason.
 *
 * @param opts.clearFirst  default `true` — the file's definition set REPLACES the
 *        catalogue (project scope, header). Pass `false` to merge (tests).
 */
export async function restoreComponentDefinitions(
    snapshot: unknown,
    opts: { readonly catalog?: ComponentCatalog; readonly clearFirst?: boolean } = {},
): Promise<ComponentDefinitionsRestoreResult> {
    const catalog = opts.catalog ?? resolveComponentCatalog();
    const rows = readRows(snapshot);
    const errors: string[] = [];
    const restored: string[] = [];

    if (opts.clearFirst ?? true) catalog.clear();
    if (rows.length === 0) return { restored, errors, total: 0 };

    for (const row of rows) {
        let bytes: Uint8Array;
        try {
            bytes = fromBase64(row.bytesBase64);
        } catch (e) {
            errors.push(
                `[restoreComponentDefinitions] §82.7 definition ${row.definitionId} (${row.name ?? '?'}): ` +
                `its envelope bytes are not valid base64 — NOT registered. ${e instanceof Error ? e.message : String(e)}`,
            );
            continue;
        }
        const res = await catalog.loadFromBytes(bytes, {
            provenance: row.provenance ?? 'project',
            expectId: row.definitionId,
        });
        if (!res.ok) {
            errors.push(
                `[restoreComponentDefinitions] §82.7 definition ${row.definitionId} (${row.name ?? '?'}) ` +
                `could not be loaded from the project file — NOT registered (${res.reason}): ${res.message}`,
            );
            continue;
        }
        // C111 §4.3-b — the reference is (id, schemaHash). The loader recomputed the
        // hash from the bytes; the row recorded the hash at save. Disagreement means
        // the envelope in the file is not the one the instances were placed against.
        const loadedHash = res.entry.family.schemaHash;
        if (typeof row.schemaHash === 'string' && row.schemaHash.length > 0 && row.schemaHash !== loadedHash) {
            catalog.remove(row.definitionId);
            errors.push(
                `[restoreComponentDefinitions] §82.7 definition ${row.definitionId} (${row.name ?? '?'}): ` +
                `the project file recorded schemaHash ${row.schemaHash} but its envelope bytes hash to ` +
                `${loadedHash} — REFUSED and NOT registered (C111 §4.3-b). Its placed instances stay in ` +
                'the model and draw nothing until the matching definition is loaded.',
            );
            continue;
        }
        restored.push(row.definitionId);
    }
    return { restored, errors, total: rows.length };
}
