# Phase 3B — IFC Element Editing · Revit Bridge · Component Editor Complete
## Q2 of Phase 3 · Months 28–30 · Sprints S55–S60

> **Authority**: `08-VISION.md` → `SUPPLEMENTAL-IMPLEMENTATION-PLAN-2026.md` → `10-MASTER-IMPLEMENTATION-PLAN-36M.md` → this file.  
> Predecessor: `PHASE-3A-Q1-M25-M27-VI-AI-ELEMENT-CREATOR.md`. Successor: `PHASE-3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md`.

> **Bake-worker test (mandatory):**  
> *"Would this code run in `apps/bake-worker/` (Node, no DOM, no THREE, no React)?"*  
> IFC Tier 1 converter → **YES**. IFC Pset editor UI → **NO** (correctly L7).  
> Revit Add-in → **NO** — it is C#/.NET; correctly excluded from this rule.

---

## §0 Phase 3B Strategic Context

### §0.1 Where we start (M28 morning)

- All 11 VI waves migrated; full AI moat on L7.5 (PDF-to-BIM, generative, rules, query, voice)
- Element Creator: sketcher + constraint solver + 3D preview + `.pryzm-family` format complete
- AI API endpoints live with OAuth2 + rate limits
- AI batch undo + audit trail operational
- IFC import exists but discards metadata; no Tier 2 support; no round-trip Pset fidelity

### §0.2 Phase 3B deliverables

| Deliverable | Supplemental SPEC | Sprint |
|---|---|---|
| IFC Tier 1 import with `ifc.*` metadata preserved | SPEC-IFC-EDIT §2.2.3 | S55 |
| IFC Tier 1 export with Pset round-trip | SPEC-IFC-EDIT §2.2.3 | S56 |
| IFC Tier 2 import (transform-only proxy) | SPEC-IFC-EDIT §2.2.4 | S57 |
| Pset editor panel for all tiers | SPEC-IFC-EDIT §2.2.5 | S57 |
| Dimension editing of IFC Tier 1 elements | SPEC-IFC-EDIT §2.2.6 | S57 |
| IFC round-trip CI gate (20 fixtures) | SPEC-IFC-EDIT §2.2.7 | S58 |
| Revit Add-in v0.1: export from Revit → PRYZM | SPEC-REVIT-BRIDGE §2.5.5 | S57 |
| Revit Add-in v0.2: import from PRYZM → Revit | SPEC-REVIT-BRIDGE §2.5.5 | S58 |
| Element Creator: full parameter table + expressions | SPEC-PRYZM-ELEMENT-CREATOR §2.3.5 | S55 |
| Element Creator: `.pryzm-family` in marketplace | SPEC-PRYZM-ELEMENT-CREATOR §2.3.6 | S59 |
| DXF + Rhino plugins | (Phase 3 overview §3.3) | S58 |
| BCF issue round-trip | (Phase 3 overview §3.3) | S59 |
| PropertyPanel + Inspector decomposition | (Phase 3 overview §3.3) | S60 |
| OBC fully removed from editor | SPEC-IFC-EDIT §2.2.7 | S58 |

---

## §1 Sprint S55 — IFC Tier 1 Import with Metadata + Element Creator Parameter Table
**Weeks 109–110, Month 28**

### §1.1 IFC Tier 1 Import — `ifc.*` metadata preservation

**Context**: the existing `plugins/ifc-import/` converts walls/doors/slabs/windows to PRYZM DTOs but discards the original IFC `GlobalId`, `TypeName`, and `Pset` data. This breaks round-trips and prevents Qonic-class editing. This sprint retrofits the import pipeline to attach `ifc.*` metadata to every DTO.

```typescript
// plugins/ifc-import/src/converters/tier1-wall.ts
// Converts IfcWall / IfcWallStandardCase → WallDto with full ifc.* metadata.

import * as WebIFC from 'web-ifc';
import type { WallDto } from '@pryzm/schemas';

export function convertIfcWall(
  model: WebIFC.IfcAPI,
  expressId: number,
): WallDto {
  const wall = model.GetLine(0, expressId);
  if (!wall) throw new Error(`Element ${expressId} not found`);

  // ── Core geometry ─────────────────────────────────────────────────────────
  const placement = resolveLocalPlacement(model, wall.ObjectPlacement);
  const geometry = resolveWallGeometry(model, wall, placement);

  // ── IFC metadata — PRESERVED for round-trip ───────────────────────────────
  const globalId = wall.GlobalId?.value as string;
  const ifcTypeName = model.GetType(0, expressId); // e.g. 'IFCWALLSTANDARDCASE'
  const name = wall.Name?.value as string | undefined;
  const description = wall.Description?.value as string | undefined;
  const objectType = wall.ObjectType?.value as string | undefined;

  // ── Psets — ALL of them, preserved verbatim ───────────────────────────────
  const psets = extractAllPsets(model, expressId);
  const quantities = extractAllQuantities(model, expressId);

  // ── Material layer set ────────────────────────────────────────────────────
  const materialLayers = extractMaterialLayerSet(model, expressId);

  // ── PRYZM type mapping ────────────────────────────────────────────────────
  // If the IFC type name matches a PRYZM type, use it; otherwise create a proxy type
  const typeId = resolvePRYZMTypeFromIFC(
    model, expressId, materialLayers, ifcTypeName,
  );

  return {
    id: `wall-${globalId}`,           // stable PRYZM ID derived from GlobalId
    typeId,
    baseLevelId: resolveLevelFromPlacement(model, placement),
    baseOffset: geometry.baseOffset,
    topReference: { kind: 'unconnected', height: geometry.height },
    centerline: geometry.centerline,
    parameters: {},

    // ── The ifc.* namespace — THE NEW ADDITION ────────────────────────────
    ifc: {
      globalId,                         // preserved through any edit
      typeName: ifcTypeName,            // original IFC class name
      name,
      description,
      objectType,
      psets,                            // ALL Psets, key: PsetName → { propName: value }
      quantities,                       // ALL IfcElementQuantity
      materialLayerSetSource: materialLayers, // original layer set data
    },
  };
}

function extractAllPsets(
  model: WebIFC.IfcAPI,
  expressId: number,
): Record<string, Record<string, string | number | boolean | null>> {
  const result: Record<string, Record<string, string | number | boolean | null>> = {};

  // Walk IfcRelDefinesByProperties to find all Psets
  const relations = model.GetLineIDsWithType(0, WebIFC.IFCRELDEFINESBYPROPERTIES);
  for (let i = 0; i < relations.size(); i++) {
    const relId = relations.get(i);
    const rel = model.GetLine(0, relId);
    if (!rel) continue;

    // Check if this relation references our element
    const relatedObjects = rel.RelatedObjects as { value: number }[];
    if (!relatedObjects?.some(o => o.value === expressId)) continue;

    const propDefId = rel.RelatingPropertyDefinition?.value;
    if (!propDefId) continue;

    const propDef = model.GetLine(0, propDefId);
    if (!propDef) continue;

    const psetName = propDef.Name?.value as string;
    if (!psetName) continue;

    result[psetName] = {};

    const properties = propDef.HasProperties as { value: number }[];
    if (!properties) continue;

    for (const propRef of properties) {
      const prop = model.GetLine(0, propRef.value);
      if (!prop) continue;
      const propName = prop.Name?.value as string;
      if (!propName) continue;
      const nominalValue = prop.NominalValue;
      result[psetName][propName] = extractPropertyValue(nominalValue);
    }
  }

  return result;
}

function extractPropertyValue(value: any): string | number | boolean | null {
  if (!value) return null;
  if (typeof value.value === 'string') return value.value;
  if (typeof value.value === 'number') return value.value;
  if (typeof value.value === 'boolean') return value.value;
  return String(value.value ?? '');
}

function extractAllQuantities(
  model: WebIFC.IfcAPI,
  expressId: number,
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  const relations = model.GetLineIDsWithType(0, WebIFC.IFCRELDEFINESBYPROPERTIES);
  // Similar loop to Psets but filters for IfcElementQuantity
  return result;
}

function resolvePRYZMTypeFromIFC(
  model: WebIFC.IfcAPI,
  expressId: number,
  materialLayers: MaterialLayer[],
  ifcTypeName: string,
): string {
  // Try to find a PRYZM wall type matching the material layer composition
  // If totalThickness matches a known type → use that type
  const totalThickness = materialLayers.reduce((sum, l) => sum + l.thickness, 0);

  const knownThicknesses: Record<number, string> = {
    100: 'Generic-100mm',
    140: 'Generic-140mm',
    175: 'Generic-175mm',
    200: 'Generic-200mm',
    215: 'Generic-215mm-Brick',
    250: 'Generic-250mm',
    300: 'Generic-300mm',
  };

  // Round to nearest 5mm before lookup
  const rounded = Math.round(totalThickness / 5) * 5;
  return knownThicknesses[rounded] ?? `IFC-Wall-${Math.round(totalThickness)}mm`;
}

interface MaterialLayer { name: string; thickness: number; materialId?: string; }

function extractMaterialLayerSet(model: WebIFC.IfcAPI, expressId: number): MaterialLayer[] {
  // Navigate IfcRelAssociatesMaterial → IfcMaterialLayerSetUsage → IfcMaterialLayerSet
  const layers: MaterialLayer[] = [];
  // ... web-ifc traversal ...
  return layers;
}

function resolveLocalPlacement(model: WebIFC.IfcAPI, placementRef: any): Matrix4x4 {
  // Resolve IfcLocalPlacement chain to world matrix
  return identityMatrix();
}

function resolveWallGeometry(model: WebIFC.IfcAPI, wall: any, placement: Matrix4x4): { centerline: [[number,number,number],[number,number,number]]; baseOffset: number; height: number } {
  // Extract wall axis (IfcWallStandardCase uses SWEPTSOLID or AXIS representation)
  return { centerline: [[0,0,0],[1,0,0]], baseOffset: 0, height: 3.0 };
}

function resolveLevelFromPlacement(model: WebIFC.IfcAPI, placement: Matrix4x4): string {
  return 'level-1';
}

// Identity matrix placeholder
function identityMatrix(): Matrix4x4 {
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
}

type Matrix4x4 = [number,number,number,number, number,number,number,number, number,number,number,number, number,number,number,number];
```

### §1.2 `IFCMetaStore` — persists ifc.* metadata

```typescript
// packages/stores/IFCMetaStore.ts
// Stores ifc.* metadata for all IFC-originated elements.
// This is NOT the element store — it is a side-car that rides alongside it.

export interface IFCElementMeta {
  pryzmElementId: string;
  globalId: string;
  typeName: string;
  name?: string;
  description?: string;
  objectType?: string;
  psets: Record<string, Record<string, string | number | boolean | null>>;
  quantities: Record<string, Record<string, number>>;
  tier: 1 | 2 | 3;
}

export interface IFCMetaState {
  elements: Map<string, IFCElementMeta>;
  // Index: globalId → pryzmElementId (for round-trip matching)
  globalIdIndex: Map<string, string>;
}

export class IFCMetaStore {
  private state: IFCMetaState = { elements: new Map(), globalIdIndex: new Map() };

  add(meta: IFCElementMeta): void {
    this.state.elements.set(meta.pryzmElementId, meta);
    this.state.globalIdIndex.set(meta.globalId, meta.pryzmElementId);
  }

  get(pryzmElementId: string): IFCElementMeta | undefined {
    return this.state.elements.get(pryzmElementId);
  }

  getByGlobalId(globalId: string): IFCElementMeta | undefined {
    const id = this.state.globalIdIndex.get(globalId);
    return id ? this.state.elements.get(id) : undefined;
  }

  updatePset(pryzmElementId: string, psetName: string, propertyName: string, value: string | number | boolean | null): void {
    const meta = this.state.elements.get(pryzmElementId);
    if (!meta) return;
    if (!meta.psets[psetName]) meta.psets[psetName] = {};
    meta.psets[psetName][propertyName] = value;
  }

  // Serialize for persistence in .pryzm file format
  serialize(): Record<string, unknown> {
    return {
      version: 1,
      elements: Object.fromEntries(
        Array.from(this.state.elements.entries()).map(([id, meta]) => [id, meta]),
      ),
    };
  }

  static deserialize(data: Record<string, unknown>): IFCMetaStore {
    const store = new IFCMetaStore();
    const elements = (data as any).elements ?? {};
    for (const [id, meta] of Object.entries(elements)) {
      store.add(meta as IFCElementMeta);
    }
    return store;
  }
}
```

### §1.3 Element Creator — Full Parameter Table

```typescript
// apps/component-editor/src/panels/parameters.ts

export interface FamilyParameter {
  id: string;
  name: string;
  kind: 'type' | 'instance';
  dataType: 'length' | 'angle' | 'area' | 'volume' | 'number' | 'text' | 'boolean' | 'material';
  defaultValue: string | number | boolean;
  expression?: string;    // e.g. "Width / 2" — evaluated by ADR-027 evaluator
  isExposed: boolean;     // visible in main editor inspector when element is placed
  unit?: string;          // mm, m, deg, m², m³ — display unit
  ifc?: {
    psetName: string;
    propertyName: string;
  };
}

export class ParameterTable {
  private tableEl: HTMLTableElement;
  private parameters: FamilyParameter[] = [];

  constructor(container: HTMLElement, private onChange: (params: FamilyParameter[]) => void) {
    this.tableEl = document.createElement('table');
    this.tableEl.innerHTML = `
      <thead>
        <tr>
          <th>Name</th>
          <th>Kind</th>
          <th>Type</th>
          <th>Default / Expression</th>
          <th>Exposed</th>
          <th>IFC Pset</th>
          <th></th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    container.appendChild(this.tableEl);

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add Parameter';
    addBtn.addEventListener('click', () => this.addParameter());
    container.appendChild(addBtn);
  }

  mount(params: FamilyParameter[]): void {
    this.parameters = [...params];
    this.rebuild();
  }

  private rebuild(): void {
    const tbody = this.tableEl.querySelector('tbody')!;
    tbody.innerHTML = '';
    for (const [i, param] of this.parameters.entries()) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="text" value="${param.name}" data-i="${i}" data-field="name"></td>
        <td>
          <select data-i="${i}" data-field="kind">
            <option ${param.kind === 'type' ? 'selected' : ''}>type</option>
            <option ${param.kind === 'instance' ? 'selected' : ''}>instance</option>
          </select>
        </td>
        <td>
          <select data-i="${i}" data-field="dataType">
            ${['length','angle','area','volume','number','text','boolean','material']
              .map(t => `<option ${param.dataType === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </td>
        <td>
          <input type="text" value="${param.expression ?? param.defaultValue}" data-i="${i}" data-field="expression"
            placeholder="value or expression (e.g. Width/2)">
        </td>
        <td><input type="checkbox" ${param.isExposed ? 'checked' : ''} data-i="${i}" data-field="isExposed"></td>
        <td>
          <input type="text" value="${param.ifc ? `${param.ifc.psetName}.${param.ifc.propertyName}` : ''}"
            data-i="${i}" data-field="ifc" placeholder="PsetName.PropName">
        </td>
        <td><button data-i="${i}" class="param-delete">✕</button></td>
      `;
      tbody.appendChild(tr);
    }

    tbody.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement | HTMLSelectElement;
      const i = parseInt(input.dataset.i!);
      const field = input.dataset.field!;
      this.updateField(i, field, input.type === 'checkbox' ? (input as HTMLInputElement).checked : input.value);
    });

    tbody.querySelectorAll('.param-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt((btn as HTMLElement).dataset.i!);
        this.parameters.splice(i, 1);
        this.rebuild();
        this.onChange(this.parameters);
      });
    });
  }

  private addParameter(): void {
    this.parameters.push({
      id: `param-${Date.now()}`,
      name: `Parameter${this.parameters.length + 1}`,
      kind: 'instance',
      dataType: 'length',
      defaultValue: 100,
      isExposed: true,
    });
    this.rebuild();
    this.onChange(this.parameters);
  }

  private updateField(i: number, field: string, value: string | boolean): void {
    const param = this.parameters[i];
    if (field === 'name') param.name = value as string;
    else if (field === 'kind') param.kind = value as 'type' | 'instance';
    else if (field === 'dataType') param.dataType = value as any;
    else if (field === 'isExposed') param.isExposed = value as boolean;
    else if (field === 'expression') {
      // Detect if it's an expression or a literal value
      const isExpr = /[A-Za-z\+\-\*\/\(\)]/.test(value as string) && isNaN(Number(value));
      if (isExpr) param.expression = value as string;
      else { delete param.expression; param.defaultValue = isNaN(Number(value)) ? value as string : Number(value); }
    } else if (field === 'ifc') {
      const parts = (value as string).split('.');
      if (parts.length === 2 && parts[0] && parts[1]) {
        param.ifc = { psetName: parts[0], propertyName: parts[1] };
      } else {
        delete param.ifc;
      }
    }
    this.onChange(this.parameters);
  }
}
```

**S55 Exit Criteria:**
- IFC import: all 12 Tier 1 element types import with `ifc.*` metadata preserved
- `IFCMetaStore.get(elementId).globalId` matches the source IFC file
- `IFCMetaStore.get(elementId).psets` contains all Psets from source (verified on 5 fixtures)
- Element Creator: parameter table functional; expressions evaluated correctly via ADR-027 evaluator
- Expression test: `Width / 2` with `Width=900` → evaluates to `450` in 3D preview
- CI Gate G12 lit: IFC round-trip test on 5 fixtures (Pset preservation)

---

## §2 Sprint S56 — IFC Tier 1 Export + Pset Round-Trip
**Weeks 111–112, Month 28–29**

### §2.1 IFC Export Pipeline

The IFC export pipeline uses `web-ifc` in write mode to reconstruct the IFC file from PRYZM DTOs + `IFCMetaStore`.

```typescript
// plugins/ifc-export/src/exporters/tier1-wall.ts

import * as WebIFC from 'web-ifc';
import type { WallDto } from '@pryzm/schemas';
import type { IFCElementMeta } from '@pryzm/stores/IFCMetaStore';

export function writeIfcWall(
  model: WebIFC.IfcAPI,
  wall: WallDto,
  meta: IFCElementMeta | undefined,
  ownerHistoryId: number,
  levelId: number,
): number {
  // If this wall originated from IFC (has meta), preserve the GlobalId.
  // If it's a native PRYZM wall, generate a new GlobalId.
  const globalId = meta?.globalId ?? generateIfcGuid();

  // ── Geometry ─────────────────────────────────────────────────────────────
  const representationId = createWallSweptSolidRepresentation(model, wall);
  const placementId = createLocalPlacement(model, wall, levelId);

  // ── Wall entity ────────────────────────────────────────────────────────
  const wallId = model.CreateIfcEntity(
    WebIFC.IFCWALLSTANDARDCASE,
    /* GlobalId */     new WebIFC.IFCString(globalId),
    /* OwnerHistory */ new WebIFC.IFCInteger(ownerHistoryId),
    /* Name */         meta?.name ? new WebIFC.IFCString(meta.name) : null,
    /* Description */  meta?.description ? new WebIFC.IFCString(meta.description) : null,
    /* ObjectType */   meta?.objectType ? new WebIFC.IFCString(meta.objectType) : null,
    /* Placement */    new WebIFC.IFCInteger(placementId),
    /* Representation */ new WebIFC.IFCInteger(representationId),
    /* Tag */          new WebIFC.IFCString(wall.id),
  );

  // ── Psets — write ALL of them ─────────────────────────────────────────
  if (meta?.psets) {
    for (const [psetName, properties] of Object.entries(meta.psets)) {
      writeIfcPset(model, wallId, ownerHistoryId, psetName, properties);
    }
  } else {
    // Native PRYZM wall — generate standard Psets from type parameters
    writeDefaultWallPsets(model, wallId, ownerHistoryId, wall);
  }

  // ── Quantities ────────────────────────────────────────────────────────
  if (meta?.quantities) {
    for (const [qsetName, quantities] of Object.entries(meta.quantities)) {
      writeIfcQuantitySet(model, wallId, ownerHistoryId, qsetName, quantities);
    }
  }

  return wallId;
}

function writeIfcPset(
  model: WebIFC.IfcAPI,
  elementId: number,
  ownerHistoryId: number,
  psetName: string,
  properties: Record<string, string | number | boolean | null>,
): void {
  const propIds: number[] = [];

  for (const [propName, propValue] of Object.entries(properties)) {
    if (propValue === null) continue;

    let nominalValue: any;
    if (typeof propValue === 'string') {
      nominalValue = new WebIFC.IFCString(propValue);
    } else if (typeof propValue === 'number') {
      nominalValue = new WebIFC.IFCReal(propValue);
    } else {
      nominalValue = new WebIFC.IFCBoolean(propValue);
    }

    const propId = model.CreateIfcEntity(
      WebIFC.IFCPROPERTYSINGLEVALUE,
      new WebIFC.IFCString(propName),
      null,
      nominalValue,
      null,
    );
    propIds.push(propId);
  }

  const psetId = model.CreateIfcEntity(
    WebIFC.IFCPROPERTYSET,
    new WebIFC.IFCString(generateIfcGuid()),
    new WebIFC.IFCInteger(ownerHistoryId),
    new WebIFC.IFCString(psetName),
    null,
    new WebIFC.IFCList(propIds.map(id => new WebIFC.IFCInteger(id))),
  );

  model.CreateIfcEntity(
    WebIFC.IFCRELDEFINESBYPROPERTIES,
    new WebIFC.IFCString(generateIfcGuid()),
    new WebIFC.IFCInteger(ownerHistoryId),
    null, null,
    new WebIFC.IFCList([new WebIFC.IFCInteger(elementId)]),
    new WebIFC.IFCInteger(psetId),
  );
}

function writeDefaultWallPsets(model: WebIFC.IfcAPI, wallId: number, ownerHistoryId: number, wall: WallDto): void {
  writeIfcPset(model, wallId, ownerHistoryId, 'Pset_WallCommon', {
    FireRating: 'None',
    AcousticRating: '',
    LoadBearing: false,
    ExtendToStructure: false,
  });
}

function writeIfcQuantitySet(model: WebIFC.IfcAPI, elementId: number, ownerHistoryId: number, qsetName: string, quantities: Record<string, number>): void {
  // IfcElementQuantity with IfcQuantityLength/Area/Volume per quantity
}

function generateIfcGuid(): string {
  // IFC uses a base64-compressed UUID format
  const uuid = crypto.randomUUID().replace(/-/g, '');
  return compressIfcGuid(uuid);
}

function compressIfcGuid(uuid: string): string {
  // Standard IFC GloballyUniqueId compression (22 chars base64)
  const base64chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  let result = '';
  let num = BigInt('0x' + uuid);
  while (result.length < 22) {
    result = base64chars[Number(num % 64n)] + result;
    num = num / 64n;
  }
  return result;
}

function createWallSweptSolidRepresentation(model: WebIFC.IfcAPI, wall: WallDto): number {
  // Create IfcShapeRepresentation with SWEPTSOLID form
  // Uses wall.centerline + type layer composition
  return 0; // placeholder
}

function createLocalPlacement(model: WebIFC.IfcAPI, wall: WallDto, levelId: number): number {
  // Create IfcLocalPlacement relative to level placement
  return 0; // placeholder
}
```

**Full Export Orchestrator:**

```typescript
// plugins/ifc-export/src/export-orchestrator.ts

import * as WebIFC from 'web-ifc';
import type { StoreRegistry } from '@pryzm/stores';
import type { IFCMetaStore } from '@pryzm/stores/IFCMetaStore';
import { writeIfcWall } from './exporters/tier1-wall';
import { writeIfcSlab } from './exporters/tier1-slab';
import { writeIfcDoor } from './exporters/tier1-door';
import { writeIfcWindow } from './exporters/tier1-window';
import { writeIfcColumn } from './exporters/tier1-column';
import { writeIfcBeam } from './exporters/tier1-beam';
// ... other Tier 1 exporters

export async function exportProjectToIFC(
  stores: StoreRegistry,
  ifcMetaStore: IFCMetaStore,
  projectMeta: ProjectMeta,
): Promise<Uint8Array> {
  const api = new WebIFC.IfcAPI();
  await api.Init();

  const modelId = api.CreateModel({
    schema: WebIFC.Schemas.IFC4,
    name: projectMeta.name,
    description: `Exported from PRYZM 2 on ${new Date().toISOString()}`,
  });

  // Create IfcProject + IfcSite + IfcBuilding structure
  const ownerHistoryId = createOwnerHistory(api, modelId, projectMeta);
  const buildingId = createBuildingHierarchy(api, modelId, ownerHistoryId, projectMeta);

  // Export each level as IfcBuildingStorey
  const levels = stores.get('level').getSnapshot().levels;
  for (const level of levels) {
    const storeyId = createBuildingStorey(api, modelId, ownerHistoryId, buildingId, level);

    // Export Tier 1 elements for this level
    const walls = stores.get('wall').selectors(stores.get('wall').getSnapshot()).byLevel(level.id);
    const relatedIds: number[] = [];

    for (const wall of walls) {
      const meta = ifcMetaStore.get(wall.id);
      const ifcWallId = writeIfcWall(api, wall, meta, ownerHistoryId, storeyId);
      relatedIds.push(ifcWallId);
    }

    // Relate all elements to their storey
    api.CreateIfcEntity(
      WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE,
      /* GlobalId */   new WebIFC.IFCString(generateIfcGuid()),
      /* OwnerHistory */ new WebIFC.IFCInteger(ownerHistoryId),
      null, null,
      new WebIFC.IFCList(relatedIds.map(id => new WebIFC.IFCInteger(id))),
      new WebIFC.IFCInteger(storeyId),
    );
  }

  // Export Tier 2 elements (transform-only proxies) — see §3
  const tier2Elements = Array.from(ifcMetaStore['state'].elements.values()).filter(m => m.tier === 2);
  for (const meta of tier2Elements) {
    writeTier2ProxyElement(api, stores, meta, ownerHistoryId);
  }

  // Tier 3 elements: preserved verbatim (original bytes copied from import source)
  // Handled separately in tier3-passthrough.ts

  const data = api.ExportFileAsIFC();
  api.CloseModel(modelId);

  return data;
}

function createOwnerHistory(api: WebIFC.IfcAPI, modelId: number, meta: ProjectMeta): number {
  // IfcOwnerHistory with PRYZM as the originating application
  const appId = api.CreateIfcEntity(
    WebIFC.IFCAPPLICATION,
    /* organization */ null,
    /* version */ new WebIFC.IFCString('2.0.0'),
    /* applicationFullName */ new WebIFC.IFCString('PRYZM'),
    /* applicationIdentifier */ new WebIFC.IFCString('PRYZM-2'),
  );
  return api.CreateIfcEntity(
    WebIFC.IFCOWNERHISTORY,
    null, new WebIFC.IFCInteger(appId), null,
    new WebIFC.IFCEnum('ADDED'),
    null, null, null,
    new WebIFC.IFCInteger(Math.floor(Date.now() / 1000)),
  );
}

function createBuildingHierarchy(api: WebIFC.IfcAPI, modelId: number, ownerHistoryId: number, meta: ProjectMeta): number {
  return 0; // IfcBuilding creation
}

function createBuildingStorey(api: WebIFC.IfcAPI, modelId: number, ownerHistoryId: number, buildingId: number, level: any): number {
  return 0; // IfcBuildingStorey creation
}

function writeTier2ProxyElement(api: WebIFC.IfcAPI, stores: StoreRegistry, meta: any, ownerHistoryId: number): void {
  // Write IfcBuildingElementProxy or original entity type + updated IfcLocalPlacement
}

function generateIfcGuid(): string {
  return Math.random().toString(36).slice(2, 24);
}
```

**S56 Exit Criteria:**
- IFC Tier 1 export: wall, slab, door, window, column, beam all export correctly
- Round-trip: import IFC file → edit wall length → export → re-import → wall length correct
- Psets preserved verbatim: all Psets from source appear unchanged in export (5-fixture test)
- GlobalId preserved: same GlobalId in export as import
- `web-ifc` write mode operational
- OTel: `pryzm.ifc.export-wall`, `pryzm.ifc.export-pset` spans visible

---

## §3 Sprint S57 — IFC Tier 2 + Pset Editor + Dimension Editing + Revit Add-in v0.1
**Weeks 113–114, Month 29**

### §3.1 IFC Tier 2 Import (Transform-Only Proxy)

```typescript
// plugins/ifc-import/src/converters/tier2-proxy.ts

import * as WebIFC from 'web-ifc';
import type { IFCProxyDTO } from '@pryzm/schemas/ifc-proxy';

export interface IFCProxyDTO {
  id: string;
  globalId: string;
  ifcTypeName: string;
  name?: string;
  transform: Float32Array;         // 4×4 column-major matrix (same as THREE.Matrix4.elements)
  geometryHash: string;            // SHA-256 of the baked geometry chunk
  psets: Record<string, Record<string, string | number | boolean | null>>;
  tier: 2;
}

export function convertTier2Element(
  model: WebIFC.IfcAPI,
  expressId: number,
): IFCProxyDTO {
  const element = model.GetLine(0, expressId);
  const globalId = element.GlobalId?.value as string;

  // Extract placement matrix
  const placement = resolveLocalPlacementMatrix(model, element.ObjectPlacement);

  // Bake the element's geometry to a chunk (via bake worker — async)
  const geometryHash = computeGeometryHash(model, expressId);

  const psets = extractAllPsets(model, expressId);

  return {
    id: `proxy-${globalId}`,
    globalId,
    ifcTypeName: String(model.GetType(0, expressId)),
    name: element.Name?.value as string,
    transform: new Float32Array(placement),
    geometryHash,
    psets,
    tier: 2,
  };
}

function resolveLocalPlacementMatrix(model: WebIFC.IfcAPI, placementRef: any): number[] {
  // Returns column-major 4×4 matrix
  // Recursively resolve IfcLocalPlacement chain
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; // identity placeholder
}

function computeGeometryHash(model: WebIFC.IfcAPI, expressId: number): string {
  // Get the raw geometry bytes and hash them
  // This identifies the geometry chunk in the bake worker cache
  const geom = model.GetGeometry(0, expressId);
  return `sha256-${expressId}-${geom?.GetVertexDataSize() ?? 0}`;
}

function extractAllPsets(model: WebIFC.IfcAPI, expressId: number): Record<string, Record<string, any>> {
  // Same implementation as tier1-wall.ts — shared utility
  return {};
}
```

**Tier 2 Move Command:**

```typescript
// packages/command-bus/handlers/ifc-proxy-move.ts

export interface MoveIFCProxyCommand {
  kind: 'ifcProxy.move';
  id: string;           // PRYZM proxy element ID
  translate: [number, number, number];  // delta in world meters
}

export const moveIFCProxyHandler: CommandHandler<MoveIFCProxyCommand> = {
  affectedStores: ['ifcProxy'],
  handle(cmd, draft) {
    const proxy = draft.ifcProxy.elements.get(cmd.id);
    if (!proxy) return;

    // Apply translation to the 4×4 matrix (update column 3: translation column)
    const m = proxy.transform;
    m[12] += cmd.translate[0];
    m[13] += cmd.translate[1];
    m[14] += cmd.translate[2];
  },
};
```

### §3.2 Pset Editor Panel (all tiers)

```typescript
// plugins/ifc-inspector/src/pset-editor.ts
// L7 — DOM. Shows all Psets for selected element; editable.

export class PsetEditorPanel {
  private panel: HTMLElement;

  constructor(container: HTMLElement, private commandBus: CommandBus) {
    this.panel = document.createElement('div');
    this.panel.className = 'pset-editor';
    container.appendChild(this.panel);
  }

  mount(elementId: string, meta: IFCElementMeta): void {
    this.panel.innerHTML = `
      <div class="pset-header">
        <div class="pset-meta">
          <label>IFC Type: <span class="read-only">${meta.typeName}</span></label>
          <label>GlobalId: <span class="read-only monospace">${meta.globalId}</span></label>
          ${meta.name ? `<label>Name: <input type="text" value="${meta.name}" data-field="name" data-element="${elementId}"></label>` : ''}
        </div>
      </div>
      <div class="pset-groups">
        ${Object.entries(meta.psets).map(([psetName, props]) => `
          <details class="pset-group" open>
            <summary><strong>${psetName}</strong></summary>
            <table class="pset-table">
              <thead><tr><th>Property</th><th>Value</th></tr></thead>
              <tbody>
                ${Object.entries(props).map(([propName, propValue]) => `
                  <tr>
                    <td class="prop-name">${propName}</td>
                    <td>
                      ${typeof propValue === 'boolean'
                        ? `<input type="checkbox" ${propValue ? 'checked' : ''} data-element="${elementId}" data-pset="${psetName}" data-prop="${propName}">`
                        : `<input type="${typeof propValue === 'number' ? 'number' : 'text'}"
                            value="${propValue ?? ''}"
                            data-element="${elementId}" data-pset="${psetName}" data-prop="${propName}">`
                      }
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <button class="add-prop-btn" data-pset="${psetName}" data-element="${elementId}">+ Add property</button>
          </details>
        `).join('')}
        <button class="add-pset-btn" data-element="${elementId}">+ Add property set</button>
      </div>
    `;

    this.panel.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      const elementId2 = input.dataset.element;
      const psetName = input.dataset.pset;
      const propName = input.dataset.prop;
      if (!elementId2 || !psetName || !propName) return;

      const value = input.type === 'checkbox' ? input.checked
        : input.type === 'number' ? Number(input.value)
        : input.value;

      this.commandBus.execute({
        kind: 'element.updatePset',
        elementId: elementId2,
        psetName,
        propertyName: propName,
        value,
      });
    });
  }

  dispose(): void { this.panel.remove(); }
}
```

### §3.3 Dimension Editing of IFC Tier 1 Elements

No new code needed here — IFC Tier 1 elements are converted to standard PRYZM DTOs (WallDto, SlabDto, etc.) by the import pipeline. The dimension editing UI that was built for native elements in Phase 2B works identically for Tier 1 IFC elements.

**The key requirement**: `wall.ifc.globalId` is present on the DTO, so the export pipeline can identify and round-trip the element. The dimension editing path is:

```
User clicks on IFC wall in plan view
  → Same selection as native wall (wall.id in WallStore)
  → Dimension string created (DimensionProducer)
  → User edits dimension → DimensionOverrideCommand OR direct WallUpdateCommand
  → WallStore updated
  → Scene Committer updates THREE mesh
  → On IFC export: wall written back with updated centerline + preserved ifc.* metadata
```

### §3.4 Revit Add-in v0.1 (C# — separate `revit-addin/` repo)

The Revit Add-in is a separate C# .NET 4.8 project. It is included in the PRYZM monorepo as `revit-addin/` but published separately (not in the npm workspace). Here is the export command:

```csharp
// revit-addin/PRYZM.Revit.Bridge/Commands/ExportToPRYZM.cs

using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

[Transaction(TransactionMode.ReadOnly)]
[Regeneration(RegenerationOption.Manual)]
public class ExportToPRYZMCommand : IExternalCommand
{
    private static readonly HttpClient httpClient = new HttpClient();

    public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
    {
        var uiDoc = commandData.Application.ActiveUIDocument;
        var doc = uiDoc.Document;

        try
        {
            // 1. Export to IFC using Revit's built-in IFC exporter
            var ifcPath = Path.Combine(Path.GetTempPath(), $"pryzm-export-{Guid.NewGuid():N}.ifc");
            ExportToIFC(doc, ifcPath);

            // 2. Read the exported file
            var ifcBytes = File.ReadAllBytes(ifcPath);
            File.Delete(ifcPath);

            // 3. Show project selection dialog (which PRYZM project to upload to)
            var dialog = new ExportDialog();
            if (dialog.ShowDialog() != true) return Result.Cancelled;

            // 4. Upload to PRYZM API
            var projectId = dialog.SelectedProjectId;
            UploadToPRYZM(projectId, ifcBytes, dialog.PRYZMToken).GetAwaiter().GetResult();

            TaskDialog.Show("PRYZM Export", $"Successfully exported to PRYZM project {projectId}.\nOpen your browser to review the import.");
            return Result.Succeeded;
        }
        catch (Exception ex)
        {
            message = ex.Message;
            TaskDialog.Show("PRYZM Export Error", ex.Message);
            return Result.Failed;
        }
    }

    private static void ExportToIFC(Document doc, string ifcPath)
    {
        // Use Revit's IFC export API (IFCExportOptions)
        var options = new IFCExportOptions
        {
            FileVersion = IFCVersion.IFC4,
            SpaceBoundaryLevel = 2,
            ExportInternalRevitPropertySets = true,
            ExportIFCCommonPropertySets = true,
            Export2DElements = false,
        };

        // Export entire model
        using (var transaction = new Transaction(doc, "Export to IFC"))
        {
            transaction.Start();
            doc.Export(
                Path.GetDirectoryName(ifcPath),
                Path.GetFileNameWithoutExtension(ifcPath),
                options
            );
            transaction.Commit();
        }
    }

    private static async Task UploadToPRYZM(string projectId, byte[] ifcData, string token)
    {
        using var content = new MultipartFormDataContent();
        content.Add(new ByteArrayContent(ifcData), "file", "export.ifc");
        content.Add(new StringContent("{\"autoImport\": true}", Encoding.UTF8, "application/json"), "options");

        httpClient.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

        var response = await httpClient.PostAsync(
            $"https://api.pryzm.com/v1/projects/{projectId}/import",
            content
        );

        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync();
            throw new Exception($"PRYZM API error {response.StatusCode}: {errorBody}");
        }
    }
}
```

**Revit Add-in GlobalId preservation:**

```csharp
// revit-addin/PRYZM.Revit.Bridge/Exporters/ElementExporter.cs

public static class ElementExporter
{
    /// <summary>
    /// Revit elements exported via the built-in IFC exporter automatically
    /// use their IfcGuid as the GloballyUniqueId. PRYZM preserves this in
    /// ifc.globalId on every imported element, enabling round-trip matching.
    ///
    /// The mapping between Revit ElementId and IFC GlobalId is:
    ///   RevitExporter produces GlobalId = IfcGuid.ConvertToIfcGuid(element.UniqueId)
    /// PRYZM stores this and returns it on export.
    /// The Add-in re-imports by matching GlobalId → Revit element and updating in-place.
    /// </summary>
    public static string GetIfcGuidForElement(Element element)
    {
        return IfcGuid.ConvertToIfcGuid(element.UniqueId);
    }
}
```

**S57 Exit Criteria:**
- IFC Tier 2: furniture, structural proxy, MEP equipment import with transform editing
- Transform gizmo shows for Tier 2 elements in 3D view; move works
- Pset editor: all Psets editable in-place; `PsetUpdateCommand` persists via event log
- Dimension editing of IFC walls: drag endpoint in plan view; export preserves edit
- Revit Add-in v0.1: compiles on Revit 2024; exports IFC to PRYZM API (integration tested)
- OTel: `pryzm.ifc.tier2-move`, `pryzm.ifc.pset-update` spans visible

---

## §4 Sprint S58 — IFC Round-Trip CI Gate + Revit Add-in v0.2 + DXF + OBC Removal
**Weeks 115–116, Month 29–30**

### §4.1 IFC Round-Trip CI Gate (20 fixtures)

```typescript
// tests/ifc/round-trip/index.test.ts
// Runs in Node. Measures Pset round-trip fidelity on 20 IFC fixture files.

import { describe, it, expect } from 'vitest';
import { importIFC } from '@pryzm/ifc-import';
import { exportProjectToIFC } from '@pryzm/ifc-export';
import * as WebIFC from 'web-ifc';
import { fixtures } from './fixtures'; // 20 IFC fixture files

describe('IFC round-trip fidelity', () => {
  for (const fixture of fixtures) {
    it(`${fixture.name}: Pset round-trip`, async () => {
      // Step 1: import
      const { stores, metaStore } = await importIFC(fixture.buffer);

      // Step 2: export
      const exportedIFC = await exportProjectToIFC(stores, metaStore, { name: fixture.name });

      // Step 3: re-import and compare Psets
      const reImported = await importIFC(exportedIFC);

      // Compare element count
      expect(reImported.stores.get('wall').getSnapshot().walls.length)
        .toBe(stores.get('wall').getSnapshot().walls.length);

      // Compare Psets for each wall
      const originalWalls = stores.get('wall').getSnapshot().walls;
      for (const originalWall of originalWalls) {
        const originalMeta = metaStore.get(originalWall.id);
        const reImportedWall = reImported.stores.get('wall').getSnapshot().walls
          .find(w => reImported.metaStore.get(w.id)?.globalId === originalMeta?.globalId);

        expect(reImportedWall).toBeDefined();
        if (!originalMeta || !reImportedWall) continue;

        const reImportedMeta = reImported.metaStore.get(reImportedWall.id);
        expect(reImportedMeta?.globalId).toBe(originalMeta.globalId);

        // All Psets must be preserved
        for (const [psetName, props] of Object.entries(originalMeta.psets)) {
          for (const [propName, propValue] of Object.entries(props)) {
            const reImportedValue = reImportedMeta?.psets?.[psetName]?.[propName];
            expect(reImportedValue).toBe(propValue);
          }
        }
      }
    });
  }
});
```

### §4.2 DXF Plugin

```typescript
// plugins/dxf/src/import.ts
// Lazily loaded. Uses 'dxf-parser' npm package.

import DxfParser from 'dxf-parser';
import type { CommandBus } from '@pryzm/command-bus';

export async function importDXF(buffer: Buffer, projectId: string, levelId: string, commandBus: CommandBus): Promise<void> {
  const parser = new DxfParser();
  const dxf = parser.parseSync(buffer.toString('utf8'));

  if (!dxf) throw new Error('Failed to parse DXF file');

  const commands: unknown[] = [];

  // Process LINE entities → wall candidates or annotation lines
  for (const entity of dxf.entities ?? []) {
    if (entity.type === 'LINE') {
      const line = entity as any;
      const start: [number, number, number] = [line.start.x / 1000, 0, line.start.y / 1000]; // mm → m
      const end: [number, number, number] = [line.end.x / 1000, 0, line.end.y / 1000];
      const length = Math.hypot(end[0] - start[0], end[2] - start[2]) * 1000;

      // Lines > 100mm are treated as potential walls
      if (length > 100) {
        commands.push({
          kind: 'wall.create',
          id: `dxf-wall-${commands.length}`,
          typeId: 'Generic-200mm',
          baseLevelId: levelId,
          baseOffset: 0,
          topReference: { kind: 'unconnected', height: 3000 },
          centerline: [start, end],
          parameters: {},
        });
      }
    }

    if (entity.type === 'CIRCLE') {
      const circle = entity as any;
      // Circles: treat as column bases
      commands.push({
        kind: 'column.create',
        id: `dxf-col-${commands.length}`,
        typeId: 'Generic-Column-Round',
        baseLevelId: levelId,
        topLevelId: levelId,
        position: [circle.center.x / 1000, 0, circle.center.y / 1000],
        width: circle.radius * 2 / 1000,
        depth: circle.radius * 2 / 1000,
      });
    }

    if (entity.type === 'TEXT' || entity.type === 'MTEXT') {
      const text = entity as any;
      commands.push({
        kind: 'annotation.create',
        id: `dxf-text-${commands.length}`,
        type: 'text',
        levelId,
        position: [text.startPoint?.x / 1000, 0, text.startPoint?.y / 1000],
        content: text.text ?? text.string ?? '',
        height: text.textHeight ?? 2.5,
      });
    }
  }

  // Execute as a batch (undo as one)
  await commandBus.executeBatch(commands as any[]);
}

export async function exportDXF(stores: StoreRegistry, levelId: string): Promise<Buffer> {
  // Generate DXF entities from PRYZM element stores
  const walls = stores.get('wall').selectors(stores.get('wall').getSnapshot()).byLevel(levelId);

  let dxfContent = `0\nSECTION\n2\nENTITIES\n`;

  for (const wall of walls) {
    const [start, end] = wall.centerline as [number,number,number][];
    dxfContent += `0\nLINE\n8\n0\n`;
    dxfContent += `10\n${start[0] * 1000}\n20\n${start[2] * 1000}\n30\n0\n`;
    dxfContent += `11\n${end[0] * 1000}\n21\n${end[2] * 1000}\n31\n0\n`;
  }

  dxfContent += `0\nENDSEC\n0\nEOF\n`;
  return Buffer.from(dxfContent, 'ascii');
}
```

### §4.3 OBC Complete Removal from Editor Core

After this sprint, `@thatopen/components` is imported ONLY in `plugins/ifc-import/` and ONLY loaded when the IFC import dialog is opened. All other usages are removed.

```typescript
// scripts/verify-obc-isolation.ts
// Runs in CI: confirms no OBC import outside plugins/ifc-import/

import { execSync } from 'child_process';

const result = execSync(
  'grep -r "@thatopen/components" --include="*.ts" --exclude-dir="plugins/ifc-import" packages/ apps/editor/ apps/viewer/ apps/sync-server/',
  { encoding: 'utf8', stdio: 'pipe' },
);

if (result.trim()) {
  console.error('OBC import found outside plugins/ifc-import:\n', result);
  process.exit(1);
}

console.log('OBC isolation verified: @thatopen/components only in plugins/ifc-import/');
```

**S58 Exit Criteria:**
- CI Gate G12: 20-fixture IFC round-trip all pass (Pset preservation + GlobalId + element count)
- DXF import: LINE + CIRCLE + TEXT entities import correctly; Playwright e2e passes
- DXF export: walls export to DXF; re-import matches original
- OBC removed from all paths except `plugins/ifc-import/`; `verify-obc-isolation.ts` passes in CI
- Revit Add-in v0.2: diff engine shows changed/added/deleted elements; user accepts/rejects
- Revit Add-in compiled and smoke-tested on Revit 2024

---

## §5 Sprint S59 — BCF + Element Creator Marketplace + Revit Add-in v1.0
**Weeks 117–118, Month 30**

### §5.1 BCF Issue Round-Trip

```typescript
// plugins/bcf/src/bcf-3-writer.ts
// Writes BCF 3.0 format (ZIP with .bcf extension)

import JSZip from 'jszip';

export interface BCFIssue {
  guid: string;
  title: string;
  description?: string;
  status: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
  priority: 'Critical' | 'Major' | 'Normal' | 'Minor';
  assignedTo?: string;
  dueDate?: string;
  labels: string[];
  comments: BCFComment[];
  viewpoints: BCFViewpoint[];
  relatedElements: string[];  // PRYZM element IDs (mapped to IFC GlobalIds on export)
}

export interface BCFComment {
  guid: string;
  date: string;
  author: string;
  comment: string;
}

export interface BCFViewpoint {
  guid: string;
  perspectiveCamera?: {
    cameraViewPoint: { x: number; y: number; z: number };
    cameraDirection: { x: number; y: number; z: number };
    cameraUpVector: { x: number; y: number; z: number };
    fieldOfView: number;
  };
  selectedComponents: string[];   // IFC GlobalIds of selected elements
  hiddenComponents: string[];     // IFC GlobalIds of hidden elements
  snapshot?: string;              // base64 PNG thumbnail
}

export async function exportBCF(issues: BCFIssue[], ifcMetaStore: IFCMetaStore): Promise<Buffer> {
  const zip = new JSZip();

  // BCF 3.0 root manifest
  zip.file('bcf.version', JSON.stringify({ VersionId: '3.0', DetailedVersion: '3.0' }));

  for (const issue of issues) {
    const issueDir = zip.folder(issue.guid)!;

    // markup.bcf — the issue data
    issueDir.file('markup.bcf', JSON.stringify({
      Topic: {
        Guid: issue.guid,
        Title: issue.title,
        Description: issue.description,
        TopicStatus: issue.status,
        Priority: issue.priority,
        AssignedTo: issue.assignedTo,
        DueDate: issue.dueDate,
        Labels: issue.labels,
        Comments: issue.comments.map(c => ({
          Guid: c.guid,
          Date: c.date,
          Author: c.author,
          Comment: c.comment,
        })),
        Viewpoints: issue.viewpoints.map(vp => ({
          Guid: vp.guid,
          Viewpoint: `${vp.guid}.bcfv`,
          Snapshot: vp.snapshot ? `${vp.guid}.png` : undefined,
        })),
        // RelatedElements: map PRYZM IDs → IFC GlobalIds
        RelatedTopics: [],
      },
    }, null, 2));

    // Viewpoint files
    for (const vp of issue.viewpoints) {
      const vpData: any = { Guid: vp.guid };

      if (vp.perspectiveCamera) {
        vpData.PerspectiveCamera = {
          CameraViewPoint: vp.perspectiveCamera.cameraViewPoint,
          CameraDirection: vp.perspectiveCamera.cameraDirection,
          CameraUpVector: vp.perspectiveCamera.cameraUpVector,
          FieldOfView: vp.perspectiveCamera.fieldOfView,
        };
      }

      // Map PRYZM element IDs to IFC GlobalIds for BCF
      const mapToGlobalIds = (ids: string[]) =>
        ids.map(id => ({
          IfcGuid: ifcMetaStore.get(id)?.globalId ?? id,
        }));

      vpData.Components = {
        Selection: { Component: mapToGlobalIds(vp.selectedComponents) },
        Visibility: { Exceptions: { Component: mapToGlobalIds(vp.hiddenComponents) }, DefaultVisibility: true },
      };

      issueDir.file(`${vp.guid}.bcfv`, JSON.stringify(vpData, null, 2));

      if (vp.snapshot) {
        const snapshotBuf = Buffer.from(vp.snapshot.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        issueDir.file(`${vp.guid}.png`, snapshotBuf);
      }
    }
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export async function importBCF(buffer: Buffer): Promise<BCFIssue[]> {
  const zip = await JSZip.loadAsync(buffer);
  const issues: BCFIssue[] = [];

  for (const [path, file] of Object.entries(zip.files)) {
    if (!path.endsWith('/markup.bcf')) continue;
    const text = await file.async('text');
    const markup = JSON.parse(text);
    const topic = markup.Topic;

    issues.push({
      guid: topic.Guid,
      title: topic.Title,
      description: topic.Description,
      status: topic.TopicStatus ?? 'Open',
      priority: topic.Priority ?? 'Normal',
      assignedTo: topic.AssignedTo,
      dueDate: topic.DueDate,
      labels: topic.Labels ?? [],
      comments: (topic.Comments ?? []).map((c: any) => ({
        guid: c.Guid, date: c.Date, author: c.Author, comment: c.Comment,
      })),
      viewpoints: [], // resolved separately
      relatedElements: [],
    });
  }

  return issues;
}
```

**S59 Exit Criteria:**
- BCF 3.0 export: issues + viewpoints + snapshots round-trip with Solibri
- BCF import: issues appear in issue store with correct status/priority/assignedTo
- Viewpoint restore: clicking issue navigates camera to captured viewpoint
- @mentions in comments: notification appears in connected user's UI
- Element Creator: `.pryzm-family` publishable to marketplace (stub flow; marketplace landing in 3C)
- Revit Add-in v1.0: full parameter round-trip + GlobalId matching + signed with developer cert

---

## §6 Sprint S60 — PropertyPanel/Inspector Decomposition
**Weeks 119–120, Month 30**

### §6.1 PropertyPanel decomposition

`PropertyPanel.ts` (3,339 LOC) → `packages/ui/PanelHost.ts` (~200 LOC) + per-plugin panel.

The architecture uses the **same plugin contribution pattern** as the wall inspector:

```typescript
// packages/ui/PanelHost.ts
// A generic panel that accepts contributions from plugins.

export interface PanelContribution {
  id: string;
  category: string;    // 'Parameters' | 'Constraints' | 'IFC' | 'Analysis' | 'AI'
  priority: number;    // lower = shown first
  render(container: HTMLElement, context: PanelContext): void;
  unmount?(container: HTMLElement): void;
}

export class PanelHost {
  private contributions: PanelContribution[] = [];
  private mounted: Map<string, { container: HTMLElement }> = new Map();

  register(contribution: PanelContribution): void {
    this.contributions.push(contribution);
    this.contributions.sort((a, b) => a.priority - b.priority);
  }

  mount(elementId: string, elementType: string, parentContainer: HTMLElement): void {
    this.unmountAll();
    const context: PanelContext = { elementId, elementType };

    for (const contrib of this.contributions) {
      if (!this.shouldShow(contrib, context)) continue;
      const container = document.createElement('div');
      container.className = 'panel-contribution';
      parentContainer.appendChild(container);
      contrib.render(container, context);
      this.mounted.set(contrib.id, { container });
    }
  }

  private unmountAll(): void {
    for (const [id, { container }] of this.mounted) {
      const contrib = this.contributions.find(c => c.id === id);
      contrib?.unmount?.(container);
      container.remove();
    }
    this.mounted.clear();
  }

  private shouldShow(contrib: PanelContribution, context: PanelContext): boolean {
    // Category filtering — later: user-configurable panel order
    return true;
  }
}

export interface PanelContext {
  elementId: string;
  elementType: string; // 'wall' | 'door' | 'window' | etc.
}
```

```typescript
// plugins/wall/inspector/Panel.ts — per-element panel contribution
// Replaces ~220 LOC of PropertyPanel.ts inline wall handling

export const wallPanelContribution: PanelContribution = {
  id: 'wall-parameters',
  category: 'Parameters',
  priority: 1,

  render(container: HTMLElement, context: PanelContext): void {
    const wall = stores.get('wall').getSnapshot().walls.find(w => w.id === context.elementId);
    if (!wall) return;

    container.innerHTML = `
      <fieldset>
        <legend>Wall Parameters</legend>
        <label>Type: <span>${wall.typeId}</span></label>
        <label>Length: <span>${computeWallLength(wall).toFixed(0)} mm</span></label>
        <label>Height: ${wall.topReference.kind === 'unconnected'
          ? `<input type="number" class="wall-height" value="${wall.topReference.height}" step="50">` + ' mm'
          : `<span>${wall.topReference.kind}</span>`
        }</label>
        <label>Base Offset: <input type="number" class="wall-base-offset" value="${wall.baseOffset}" step="1"> mm</label>
      </fieldset>
    `;

    container.querySelector('.wall-height')?.addEventListener('change', (e) => {
      commandBus.execute({
        kind: 'wall.setHeight',
        id: wall.id,
        height: Number((e.target as HTMLInputElement).value),
      });
    });
  },
};

// plugins/ifc-inspector/Panel.ts — IFC metadata panel (shown for any IFC element)
export const ifcPanelContribution: PanelContribution = {
  id: 'ifc-metadata',
  category: 'IFC',
  priority: 90, // shown after element-specific params

  render(container: HTMLElement, context: PanelContext): void {
    const meta = ifcMetaStore.get(context.elementId);
    if (!meta) return; // not an IFC element — panel not shown

    const psetEditor = new PsetEditorPanel(container, commandBus);
    psetEditor.mount(context.elementId, meta);
  },
};
```

**S60 Exit Criteria (= Phase 3B gate):**
- `PropertyPanel.ts` deleted; `PanelHost.ts` + 12 per-element panel contributions replace it
- `PropertyInspector.ts` deleted; `InspectorHost.ts` + per-plugin contributions replace it
- Visual regression: inspector visual diff < 2 px on 30-case fixture
- LOC reduction: from 6,147 to ≤ 3,200 across ~25 files (confirmed with `wc -l`)
- All M28 Phase 3A capabilities still working

---

## §7 Phase 3B Cross-Cutting Deliverables

### §7.1 CI Gates Added in 3B

| Gate | Sprint | Condition |
|---|---|---|
| **G12: IFC round-trip** | S58 | 20-fixture Pset preservation + GlobalId + element count |
| **G16: Revit GlobalId preserved** | S58 | GlobalId unchanged through PRYZM edit cycle |
| **G17: OBC isolation** | S58 | No `@thatopen/components` import outside `plugins/ifc-import/` |
| **G18: BCF round-trip** | S59 | Import → export → re-import → same issue count + Psets |
| **G19: Inspector visual regression** | S60 | Visual diff < 2 px vs golden renders |

### §7.2 OTel Spans Added

| Span | Description | Sprint |
|---|---|---|
| `pryzm.ifc.import-tier1` | Tier 1 element import (with metadata) | S55 |
| `pryzm.ifc.import-tier2` | Tier 2 proxy import + geometry bake | S57 |
| `pryzm.ifc.export` | Full project IFC export | S56 |
| `pryzm.ifc.pset-update` | Single Pset property update | S57 |
| `pryzm.ifc.round-trip-verify` | Round-trip CI gate measurement | S58 |
| `pryzm.bcf.export` | BCF file export | S59 |
| `pryzm.bcf.import` | BCF file import | S59 |
| `pryzm.dxf.import` | DXF import pipeline | S58 |
| `pryzm.revit.export` | Revit Add-in export trigger | S57 |
| `pryzm.revit.import` | Revit Add-in import trigger | S58 |

### §7.3 Revit Add-in Release Checklist

- [ ] Compiled against Revit 2021, 2022, 2023, 2024, 2025 (multi-target)
- [ ] Code-signed with EV certificate (required for Autodesk App Store)
- [ ] No PII logged; telemetry opt-in only
- [ ] README: install instructions for each Revit version
- [ ] Published to GitHub Releases + Autodesk App Store submission
- [ ] Tested on Windows 10/11 + Revit 2024 (primary test platform)

---

*Last updated: 2026-04-27. Owner: Founder + Architecture lead.*  
*Predecessor: `PHASE-3A-Q1-M25-M27-VI-AI-ELEMENT-CREATOR.md`.*  
*Successor: `PHASE-3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md`.*
