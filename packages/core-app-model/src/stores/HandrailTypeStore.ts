import { HandrailFillType, HandrailRailProfile } from './HandrailTypes';

export interface HandrailTypeDefinition {
    id: string;
    name: string;
    description: string;
    isBuiltIn: boolean;
    height: number;
    thickness: number;
    baseOffset: number;
    fillType: HandrailFillType;
    railProfile: HandrailRailProfile;
    railDiameter?: number;
    postSpacing?: number;
    materialColor?: string;
}

const BUILT_IN_TYPES: HandrailTypeDefinition[] = [
    {
        id: 'glass-guardrail',
        name: 'Glass Guardrail',
        description: 'Full-height glass panel guardrail, 1100 mm, suitable for balconies and terraces.',
        isBuiltIn: true,
        height: 1.1,
        thickness: 0.012,
        baseOffset: 0.0,
        fillType: 'glass',
        railProfile: 'round',
        railDiameter: 0.04,
        postSpacing: 1.5,
        materialColor: '#aaccee'
    },
    {
        id: 'stainless-handrail',
        name: 'Stainless Steel Handrail',
        description: 'Circular stainless-steel handrail at 900 mm, for stairs and ramps.',
        isBuiltIn: true,
        height: 0.9,
        thickness: 0.04,
        baseOffset: 0.0,
        fillType: 'open',
        railProfile: 'round',
        railDiameter: 0.04,
        postSpacing: 1.2,
        materialColor: '#c0c0c0'
    },
    {
        id: 'timber-baluster',
        name: 'Timber Baluster Railing',
        description: 'Timber posts with rectangular baluster infill at 1000 mm.',
        isBuiltIn: true,
        height: 1.0,
        thickness: 0.05,
        baseOffset: 0.0,
        fillType: 'baluster',
        railProfile: 'rectangular',
        postSpacing: 1.8,
        materialColor: '#8B4513'
    },
    {
        id: 'steel-guardrail',
        name: 'Steel Guardrail',
        description: 'Heavy-duty steel guardrail at 1100 mm for industrial and commercial use.',
        isBuiltIn: true,
        height: 1.1,
        thickness: 0.05,
        baseOffset: 0.0,
        fillType: 'open',
        railProfile: 'rectangular',
        postSpacing: 1.5,
        materialColor: '#888888'
    },
    {
        id: 'stair-handrail',
        name: 'Stair Handrail',
        description: 'Compact handrail for stair landings and stairwells at 900 mm.',
        isBuiltIn: true,
        height: 0.9,
        thickness: 0.04,
        baseOffset: 0.0,
        fillType: 'open',
        railProfile: 'round',
        railDiameter: 0.04,
        postSpacing: 0,
        materialColor: '#888888'
    }
];

export class HandrailTypeStore {
    private types: Map<string, HandrailTypeDefinition> = new Map();

    constructor() {
        BUILT_IN_TYPES.forEach(t => this.types.set(t.id, { ...t }));
    }

    getAll(): HandrailTypeDefinition[] {
        return Array.from(this.types.values());
    }

    getById(id: string): HandrailTypeDefinition | undefined {
        return this.types.get(id);
    }

    getBuiltIn(): HandrailTypeDefinition[] {
        return this.getAll().filter(t => t.isBuiltIn);
    }

    getCustom(): HandrailTypeDefinition[] {
        return this.getAll().filter(t => !t.isBuiltIn);
    }

    add(definition: Omit<HandrailTypeDefinition, 'isBuiltIn'>): void {
        if (this.types.has(definition.id)) {
            throw new Error(`Handrail type ${definition.id} already exists`);
        }
        this.types.set(definition.id, { ...definition, isBuiltIn: false });
    }

    update(id: string, updates: Partial<Omit<HandrailTypeDefinition, 'id' | 'isBuiltIn'>>): void {
        const existing = this.types.get(id);
        if (!existing) throw new Error(`Handrail type ${id} not found`);
        if (existing.isBuiltIn) throw new Error(`Cannot modify built-in handrail type: ${id}`);
        this.types.set(id, { ...existing, ...updates });
    }

    remove(id: string): void {
        const existing = this.types.get(id);
        if (!existing) throw new Error(`Handrail type ${id} not found`);
        if (existing.isBuiltIn) throw new Error(`Cannot remove built-in handrail type: ${id}`);
        this.types.delete(id);
    }

    /** Contract 45 — wipe USER-defined handrail types only. Built-ins preserved. */
    clearCustomTypes(): void {
        for (const [id, t] of [...this.types.entries()]) {
            if (!t.isBuiltIn) {
                this.types.delete(id);
            }
        }
    }
}

export const handrailTypeStore = new HandrailTypeStore();

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'handrailTypeStore',
    clear: () => handrailTypeStore.clearCustomTypes(),
});
