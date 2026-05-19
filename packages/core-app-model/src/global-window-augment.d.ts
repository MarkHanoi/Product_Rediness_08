interface LegacyElementStoreGlobal {
    get?(id: string): any;
    getById?(id: string): any;
    getAll?(): any[];
    getAllDoors?(): any[];
    getAllWindows?(): any[];
    getWindow?(id: string): any;
    getDoor?(id: string): any;
    add?(item: unknown): void;
    update?(id: string, updates: unknown): void;
    has?(id: string): boolean;
    remove?(id: string): void;
}

interface Window {
    gridStore?: LegacyElementStoreGlobal;
    wallStore?: LegacyElementStoreGlobal;
    slabStore?: LegacyElementStoreGlobal;
    columnStore?: LegacyElementStoreGlobal;
    beamStore?: LegacyElementStoreGlobal;
    stairStore?: LegacyElementStoreGlobal;
    curtainWallStore?: LegacyElementStoreGlobal;
    plumbingStore?: LegacyElementStoreGlobal;
    furnitureStore?: LegacyElementStoreGlobal;
    lightingStore?: LegacyElementStoreGlobal;
    openingStore?: LegacyElementStoreGlobal;
    handrailStore?: LegacyElementStoreGlobal;
    doorStore?: any;
    windowStore?: any;
    roomStore?: any;
    bimManager?: any;
    projectContext?: any;
    scheduleStore?: LegacyElementStoreGlobal;
    vgGovernanceStore?: any;
    selectionManager?: any;
    toolManager?: any;
    runtime?: any;
    commandManager?: any;
    annotationStore?: any;
    viewDefinitionStore?: any;
    viewTemplateStore?: any;
    templateStore?: any;
    viewIntentInstanceStore?: any;
    floorPlanUnderlayTool?: any;
    __pryzmRemoveUnderlayInternal?: any;
    __pryzmSelectedAnnotationId?: any;
    __PRYZM_DEBUG_ZONES__?: any;
    __viewRenderCache?: any;
    resolverStores?: any;
    semanticIndex?: any;
    visibilityIntentStore?: any;
}
