/**
 * LiftReader.ts — `lift` → `IfcTransportElement` / `ELEVATOR`.
 *
 * §W4B-LIFT-EXPORTS (Wave 4b, 2026-08-31)
 *
 * ─── THE AUDIT ROW WAS RIGHT FOR THE WRONG REASON ──────────────────────────
 * The 2026-08-29 row recorded `exports = NO` with the evidence
 * *"grep -c 'snapshot.lifts' … in IFC4X3Exporter.ts → 0"* — a search of
 * `plugins/ifc-export/`, which is NOT the exporter the Export IFC button runs.
 * That is the same wrong-subtree defect that made the `furniture` and
 * `plumbing` rows false. Re-measured against the LIVE exporter
 * (`packages/file-format/src/export/ifc`, reached from `initUI.ts:997` →
 * `exportIFC`), the verdict survives anyway: there was no LiftReader on disk
 * and no `liftStore` in `ExportIFC.ts`'s stores object. **Right answer, wrong
 * evidence — so it is re-derived here rather than inherited.**
 *
 * ─── WHY THE STORE IS TYPED STRUCTURALLY AND NOT IMPORTED ──────────────────
 * `@pryzm/geometry-lift` is NOT a dependency of `@pryzm/file-format`
 * (`packages/file-format/package.json` lists core-app-model, geometry-slab,
 * geometry-wall, room-topology, … and no geometry-lift). Adding one would edit
 * `package.json` and force a `pnpm-lock.yaml` resync — a shared-tree hazard,
 * and outside this lane's files. The reader therefore consumes the narrowest
 * READ-ONLY projection of `LiftStore` it actually needs.
 *
 * ⚠ A structural type hand-copied from a header can DRIFT from the real one
 * without anyone noticing, so the drift is bounded deliberately: every field
 * below is optional except `id`, and the fields are pinned to
 * `packages/geometry-lift/src/LiftTypes.ts:50-80` (`LiftData`) and `:27-30`
 * (`LiftIfcData`) as of 2026-08-31. If `LiftData` renames `id` or `getAll`,
 * this reader contributes ZERO elements — which the executed test in
 * `__tests__/ifc-export-floor-ceiling-lift.test.ts` fails on, rather than
 * passing quietly.
 *
 * ─── PredefinedType ────────────────────────────────────────────────────────
 * `LiftIfcData` declares `ifcClass: 'IfcTransportElement'` (and `LiftStore.add`
 * stamps it, LiftStore.ts:52-56) but carries NO `predefinedType`. All three
 * `LiftKind` values — `'passenger' | 'accessible' | 'goods'` — are elevators,
 * so `ELEVATOR` is a reading of the family, not an invented value. A future
 * escalator/moving-walkway kind MUST extend the map below rather than inherit
 * `ELEVATOR` by default.
 */

import { ExportElement, PropertySet } from '../IntermediateModel';
import { ReaderContext, buildPropertySet, collectIfcPsets } from './ReaderContext';
import { debug } from '@pryzm/core-app-model';

/** Read-only projection of `LiftData` — see the drift note in the file header. */
export interface LiftRecordLike {
    id: string;
    levelId?: string;
    kind?: string;
    parentId?: string;
    properties?: Record<string, unknown>;
    ifcData?: { guid?: string; ifcClass?: string; predefinedType?: string };
}

/** Read-only projection of `LiftStore` — the only method this reader calls. */
export interface LiftStoreLike {
    getAll(): LiftRecordLike[];
}

/**
 * `LiftKind` → `IfcTransportElementTypeEnum`. Explicit and total over the enum
 * as it stands; an unknown kind yields `ELEVATOR` because every kind PRYZM can
 * currently author is one, and the header records the obligation to revisit
 * this if a non-elevator kind is ever added.
 */
const PREDEFINED_TYPE_BY_KIND: Record<string, string> = {
    passenger: 'ELEVATOR',
    accessible: 'ELEVATOR',
    goods: 'ELEVATOR',
};

export class LiftReader {
    constructor(private store: LiftStoreLike, private ctx: ReaderContext) {}

    read(): ExportElement[] {
        const elements: ExportElement[] = [];
        const lifts = this.store.getAll();
        debug(`LiftReader: ${lifts.length} lifts`);

        for (const lift of lifts) {
            const mesh = this.ctx.findMesh(lift.id);
            if (!mesh) continue;
            const geometry = this.ctx.extractGeometry(mesh);
            if (!geometry) continue;
            const color = this.ctx.extractColor(mesh);

            const propertySets: PropertySet[] = [];
            if (lift.properties && Object.keys(lift.properties).length > 0) {
                const ps = buildPropertySet('Pset_ElementParameters', lift.properties);
                if (ps) propertySets.push(ps);
            }
            propertySets.push(
                ...collectIfcPsets(lift.ifcData, new Set(propertySets.map(p => p.name))),
            );

            const mark = typeof lift.properties?.mark === 'string' ? lift.properties.mark : undefined;

            elements.push({
                id: lift.id,
                guid: lift.ifcData?.guid,
                ifcClass: lift.ifcData?.ifcClass ?? 'IfcTransportElement',
                name: mark ?? `lift-${lift.id}`,
                predefinedType:
                    lift.ifcData?.predefinedType ??
                    PREDEFINED_TYPE_BY_KIND[lift.kind ?? ''] ??
                    'ELEVATOR',
                geometry,
                position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
                rotation: { x: 0, y: 0, z: 0 },
                propertySets,
                levelId: lift.levelId,
                parentId: lift.parentId,
                ...(color ? { color } : {}),
            });
        }

        return elements;
    }
}
