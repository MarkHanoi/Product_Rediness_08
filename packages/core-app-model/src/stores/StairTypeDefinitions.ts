export interface StairTypeDefinition {
    id: string;
    name: string;
    defaults: {
        stringerType: 'closed' | 'open' | 'mono' | 'none';
        riserVisible: boolean;
        nosingType: 'none' | 'standard' | 'extended';
        nosingDepth: number;
        material: string;
    };
    rules: {
        maxRiserHeight: number;
        minTreadDepth: number;
        targetRiserHeight: number;
    };
}

export const BUILT_IN_STAIR_TYPES: StairTypeDefinition[] = [
    {
        id: 'monolithic',
        name: 'Monolithic Concrete',
        defaults: {
            stringerType: 'none',
            riserVisible: true,
            nosingType: 'standard',
            nosingDepth: 0.025,
            material: 'concrete'
        },
        rules: { maxRiserHeight: 0.190, minTreadDepth: 0.250, targetRiserHeight: 0.170 }
    },
    {
        id: 'steel-open',
        name: 'Steel Open Riser',
        defaults: {
            stringerType: 'mono',
            riserVisible: false,
            nosingType: 'none',
            nosingDepth: 0,
            material: 'steel'
        },
        rules: { maxRiserHeight: 0.190, minTreadDepth: 0.250, targetRiserHeight: 0.175 }
    },
    {
        id: 'timber-closed',
        name: 'Timber Closed String',
        defaults: {
            stringerType: 'closed',
            riserVisible: true,
            nosingType: 'extended',
            nosingDepth: 0.040,
            material: 'wood'
        },
        rules: { maxRiserHeight: 0.220, minTreadDepth: 0.220, targetRiserHeight: 0.180 }
    },
    {
        id: 'residential-timber',
        name: 'Residential Timber',
        defaults: {
            stringerType: 'open',
            riserVisible: true,
            nosingType: 'standard',
            nosingDepth: 0.030,
            material: 'wood'
        },
        rules: { maxRiserHeight: 0.220, minTreadDepth: 0.220, targetRiserHeight: 0.185 }
    },
    {
        id: 'marble-luxury',
        name: 'Marble Luxury',
        defaults: {
            stringerType: 'none',
            riserVisible: true,
            nosingType: 'standard',
            nosingDepth: 0.020,
            material: 'marble'
        },
        rules: { maxRiserHeight: 0.190, minTreadDepth: 0.280, targetRiserHeight: 0.165 }
    }
];
