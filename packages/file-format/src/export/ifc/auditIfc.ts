import * as WEBIFC from 'web-ifc';
import * as THREE from '@pryzm/renderer-three/three';
import { IfcExporter } from './IfcExporter';

export interface AuditResult {
  webIfcInit: boolean;
  modelCreated: boolean;
  fileCreated: boolean;
  elementsExported: string[];
  missingElements: string[];
  errors: string[];
}

export async function auditIfcWorkflow(): Promise<AuditResult> {
    const result: AuditResult = {
        webIfcInit: false,
        modelCreated: false,
        fileCreated: false,
        elementsExported: [],
        missingElements: [],
        errors: []
    };

    console.group("🔍 IFC EXPORT AUDIT");
    
    try {
        // 1. Initialize WebIFC
        const api = new WEBIFC.IfcAPI();
        try {
            api.SetWasmPath("/wasm/", true);
            await api.Init(undefined, true);
            result.webIfcInit = true;
            console.log("✅ WebIFC Initialized");
        } catch (err: any) {
            result.errors.push(`IFC Init Failed: ${err.message || err}`);
            console.error("❌ WebIFC Init Failed", err);
            return result;
        }

        // 2. Programmatically add test elements
        const testElements = [
            { type: 'wall', ifcClass: 'IfcWall', name: 'Test Wall' },
            { type: 'slab', ifcClass: 'IfcSlab', name: 'Test Slab' },
            { type: 'column', ifcClass: 'IfcColumn', name: 'Test Column' },
            { type: 'curtain-wall', ifcClass: 'IfcCurtainWall', name: 'Test Curtain Wall' }
        ];

        const dummyScene = new THREE.Scene();
        const stores: any = {
            wallStore: { getAll: () => [], getLevels: () => [{ id: 'L0', name: 'Ground Floor', elevation: 0, height: 3 }] },
            slabStore: { getAll: () => [] },
            columnStore: { getAll: () => [] },
            curtainWallStore: { getAll: () => [] }
        };

        // Mocking the elements in stores
        testElements.forEach(te => {
            const id = crypto.randomUUID();
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
            mesh.position.set(Math.random() * 10, 0, Math.random() * 10);
            mesh.userData = { id, type: te.type };
            dummyScene.add(mesh);

            const element: any = {
                id,
                type: te.type,
                levelId: 'L0',
                ifcData: {
                    ifcClass: te.ifcClass,
                    guid: crypto.randomUUID()
                },
                properties: { Name: te.name }
            };

            if (te.type === 'wall') stores.wallStore.getAll = () => [element];
            if (te.type === 'slab') stores.slabStore.getAll = () => [element];
            if (te.type === 'column') stores.columnStore.getAll = () => [element];
            if (te.type === 'curtain-wall') stores.curtainWallStore.getAll = () => [element];
        });

        // 3. Trigger export
        const exporter = new IfcExporter(stores, { scene: dummyScene });
        
        // Wrap model creation to verify it
        const originalCreateModel = api.CreateModel.bind(api);
        api.CreateModel = (options: any) => {
            const modelID = originalCreateModel(options);
            if (modelID !== undefined) result.modelCreated = true;
            return modelID;
        };

        const data = await exporter.export({ projectName: "Audit Project" });
        
        if (data && data.length > 0) {
            result.fileCreated = true;
            console.log("✅ IFC File Generated", data.length, "bytes");
        }

        // 4. Validate output (Basic parsing of exported elements)
        const intermediateModel = exporter.getIntermediateModel();
        result.elementsExported = intermediateModel.elements.map(el => el.ifcClass);
        
        const expectedClasses = ["IfcWall", "IfcSlab", "IfcColumn", "IfcCurtainWall"];
        result.missingElements = expectedClasses.filter(cls => !result.elementsExported.includes(cls));

        if (result.missingElements.length > 0) {
            result.errors.push(`Missing elements in export: ${result.missingElements.join(', ')}`);
        }

    } catch (err: any) {
        result.errors.push(`Audit Error: ${err.message || err}`);
        console.error("❌ Audit Failed", err);
    } finally {
        console.groupEnd();
    }

    console.log("📊 Audit Report:", JSON.stringify(result, null, 2));
    return result;
}
