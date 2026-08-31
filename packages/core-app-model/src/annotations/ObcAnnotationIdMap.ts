/**
 * §ANN-OBC-ID-MAP — the OBC-uuid → annotation-id map, split OUT of
 * `plugins/annotations/src/OBCAnnotationAdapter.ts` (F-P5-04 inversion, LANE A).
 *
 * This is the PERSISTED half of the old adapter: `ProjectSerializer` /
 * `ProjectLoader` need only `serialize()` / `deserialize()` of this map and
 * never touch OBC. The `@thatopen/components` subscription machinery STAYS in
 * the plugin (`RESTRICTED_MODULES` allows that module only from
 * `plugins/ifc-import/`; relocating the importer would not shrink the
 * banned-3p arm and would make an L2 domain package a restricted-import
 * holder). The plugin's `OBCAnnotationAdapter` delegates every map operation
 * to the singleton below — ONE map, one owner, no rival.
 *
 * Serialized shape is UNCHANGED on disk: `{ version: 1, entries: [[uuid, annotationId], …] }`.
 */

export class ObcAnnotationIdMap {
    private _uuidToAnnotationId = new Map<string, string>();

    set(uuid: string, annotationId: string): void {
        this._uuidToAnnotationId.set(uuid, annotationId);
    }

    get(uuid: string): string | undefined {
        return this._uuidToAnnotationId.get(uuid);
    }

    delete(uuid: string): void {
        this._uuidToAnnotationId.delete(uuid);
    }

    clear(): void {
        this._uuidToAnnotationId.clear();
    }

    serialize(): { version: 1; entries: Array<[string, string]> } {
        return { version: 1, entries: Array.from(this._uuidToAnnotationId.entries()) };
    }

    deserialize(payload: any): void {
        this._uuidToAnnotationId.clear();
        if (!payload || typeof payload !== 'object') return;
        if (payload.version !== 1) return;
        const list = Array.isArray(payload.entries) ? payload.entries : [];
        for (const e of list) {
            if (Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string') {
                this._uuidToAnnotationId.set(e[0], e[1]);
            }
        }
    }
}

/** Module-level singleton — mirrors the `annotationStore` pattern one file over. */
export const obcAnnotationIdMap = new ObcAnnotationIdMap();
