/**
 * IfcExporter.ts
 *
 * Public API for IFC export functionality.
 * This is the main entry point for exporting BIM data to IFC format.
 *
 * Data Flow:
 * 1. FragmentReader extracts data from stores
 * 2. IntermediateModel holds framework-agnostic representation
 * 3. IfcSpatialStructure creates Project/Site/Building/Storeys
 * 4. IfcModelBuilder creates elements with geometry and properties
 * 5. IfcSemanticWriter (Phase E-3) adds PRYZM psets + SemanticGraph relationships
 * 6. IfcFileWriter serializes to STEP format
 *
 * Phase E-3 additions:
 *   - ExportOptions.semanticData: optional semantic enrichment data
 *   - IfcSemanticWriter called after createElements() to add
 *     Pset_PRYZM_Spatial, Pset_PRYZM_Compliance, Pset_PRYZM_Identifiers,
 *     and IfcRelSpaceBoundary for adjacentTo relationships.
 */

import * as WEBIFC from 'web-ifc';
import { FragmentReader, StoreRegistry, SceneRegistry } from './FragmentReader';
import { IntermediateModel } from './IntermediateModel';
import { IfcSpatialStructure } from './IfcSpatialStructure';
import { IfcGeometryWriter } from './IfcGeometryWriter';
import { IfcPropertyWriter } from './IfcPropertyWriter';
import { IfcModelBuilder } from './IfcModelBuilder';
import { IfcFileWriter } from './IfcFileWriter';
import { IfcSemanticWriter, RoomSemanticData } from './IfcSemanticWriter';
import { Relationship } from '@pryzm/core-app-model';
import { debug } from '@pryzm/core-app-model';

export type IfcExportScope = 'native-only' | 'native-and-imported';

export interface ExportOptions {
    projectName?: string;
    siteName?: string;
    buildingName?: string;
    schema?: 'IFC2X3' | 'IFC4';
    exportScope?: IfcExportScope;
    /** Phase E-3: Optional semantic enrichment data from the live model. */
    semanticData?: {
        rooms?: RoomSemanticData[];
        relationships?: Relationship[];
        schemaVersion?: number;
    };
    /** Progress callback — called at each pipeline stage with (stage, 0-100, detail?) */
    onProgress?: (stage: string, progress: number, detail?: string) => void;
}

export class IfcExporter {
    private stores: StoreRegistry;
    private sceneRegistry: SceneRegistry;
    private api: WEBIFC.IfcAPI;
    private initialized: boolean = false;

    constructor(stores: StoreRegistry, sceneRegistry: SceneRegistry) {
        this.stores = stores;
        this.sceneRegistry = sceneRegistry;
        this.api = new WEBIFC.IfcAPI();
    }

    async export(options: ExportOptions = {}): Promise<Uint8Array> {
        const prog = options.onProgress ?? (() => {});

        debug("Starting export process...");
        prog('Initializing WASM engine', 5, 'Starting the WebIFC geometry engine.');
        await this.ensureInitialized();
        debug("WebIFC initialized.");

        const schema = options.schema || 'IFC4';
        debug(`Creating model with schema: ${schema}`);
        const modelID = this.api.CreateModel({ schema });
        debug(`Model created with ID: ${modelID}`);

        try {
            prog('Reading BIM model', 15, 'Extracting elements, levels, and geometry from the live model.');
            debug("Reading from fragments...");
            const reader = new FragmentReader(this.stores, this.sceneRegistry);
            const intermediateModel = reader.read();
            if (options.exportScope === 'native-and-imported') {
                prog('Reading imported elements', 22, 'Collecting retained imported IFC geometry from the scene.');
                const imported = reader.readImportedIfcElements();
                const existingLevelIds = new Set(intermediateModel.levels.map(level => level.id));
                for (const level of imported.levels) {
                    if (!existingLevelIds.has(level.id)) {
                        intermediateModel.levels.push(level);
                        existingLevelIds.add(level.id);
                    }
                }
                intermediateModel.elements.push(...imported.elements);
                debug(`Included imported IFC elements: ${imported.elements.length}`);
            }
            const totalElements = intermediateModel.elements.length;
            debug(`Intermediate model ready. Elements found: ${totalElements}`);

            if (options.projectName) intermediateModel.project.name = options.projectName;

            prog('Building spatial structure', 32, `${intermediateModel.levels.length} level${intermediateModel.levels.length !== 1 ? 's' : ''} — creating project, site, building, and storey hierarchy.`);
            debug("Creating spatial structure...");
            const spatialStructure = new IfcSpatialStructure(this.api, modelID);
            const spatialRefs = spatialStructure.create(intermediateModel);
            debug("Spatial structure created.");

            debug("Initializing writers...");
            const geometryWriter = new IfcGeometryWriter(this.api, modelID, spatialRefs.contextRef);
            const propertyWriter = new IfcPropertyWriter(this.api, modelID);

            prog('Writing elements & geometry', 48, `${totalElements.toLocaleString()} element${totalElements !== 1 ? 's' : ''} — triangulating meshes and creating IFC entities.`);
            debug("Building IFC elements...");
            const modelBuilder = new IfcModelBuilder(
                this.api,
                modelID,
                geometryWriter,
                propertyWriter,
                spatialRefs
            );

            // Phase E-3: createElements now returns element→ref map for semantic enrichment.
            const elementRefs = modelBuilder.createElements(intermediateModel.elements);
            debug("Elements created in IFC model.");

            // Phase E-3: Enrich model with PRYZM semantic psets + SemanticGraph relationships.
            if (options.semanticData) {
                const { rooms = [], relationships = [], schemaVersion = 3 } = options.semanticData;
                if (rooms.length > 0 || relationships.length > 0) {
                    prog('Writing semantic data', 68, `${rooms.length} room${rooms.length !== 1 ? 's' : ''} and ${relationships.length} relationship${relationships.length !== 1 ? 's' : ''} — attaching PRYZM property sets.`);
                    debug(`[E-3] Enriching IFC model: ${rooms.length} rooms, ${relationships.length} relationships`);
                    const semanticWriter = new IfcSemanticWriter(this.api, modelID);
                    semanticWriter.enrich(elementRefs, { rooms, relationships, schemaVersion });
                    debug('[E-3] Semantic enrichment complete.');
                }
            }

            prog('Serializing IFC file', 82, 'Writing STEP-format data to binary buffer.');
            debug("Serializing to bytes...");
            const fileWriter = new IfcFileWriter(this.api, modelID);
            const data = fileWriter.saveToBytes();
            debug(`Serialization complete. Byte size: ${data.length} (${(data.length / 1024).toFixed(2)} KB)`);

            prog('Preparing download', 96, `${(data.length / 1024).toFixed(1)} KB — ready to save.`);
            return data;
        } catch (err) {
            debug(`Error during IFC export building: ${err}`);
            console.error("Error during IFC export building:", err);
            throw err;
        } finally {
            debug(`Closing model ${modelID}`);
            this.api.CloseModel(modelID);
        }
    }

    async exportAndDownload(filename: string = 'model.ifc', options: ExportOptions = {}): Promise<void> {
        const data = await this.export(options);
        IfcFileWriter.downloadFile(data, filename);
    }

    getIntermediateModel(): IntermediateModel {
        const reader = new FragmentReader(this.stores, this.sceneRegistry);
        return reader.read();
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.initialized) {
            debug("Loading WebIFC WASM engine...");
            this.api.SetWasmPath("/wasm/", true);
            try {
                await this.api.Init(undefined, true);
                this.initialized = true;
                debug("WebIFC engine ready.");
            } catch (err) {
                debug(`CRITICAL: WebIFC Init Failed - ${err}`);
                throw err;
            }
        }
    }

    dispose(): void {
        if (this.initialized) {
            this.initialized = false;
        }
    }
}

export async function exportIfc(
    stores: StoreRegistry,
    sceneRegistry: SceneRegistry,
    options?: ExportOptions
): Promise<Uint8Array> {
    const exporter = new IfcExporter(stores, sceneRegistry);
    try {
        return await exporter.export(options);
    } finally {
        exporter.dispose();
    }
}
