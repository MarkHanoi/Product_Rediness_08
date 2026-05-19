/**
 * @file JapaneseBedBuilder.ts
 *
 * IFurnitureBuilder shell that delegates to BedEngine.  One class — variant
 * is fixed at construction by FurnitureFactory.
 *
 * Pattern mirrors OrganicSofaBuilder → SofaEngine.
 *
 * Contracts:
 *   - 04-BIM §3.8  Builder is pure: returns a THREE.Group, no store mutations.
 *   - 03-BIM §1.1  No `any` types.
 *   - 07-BIM §7.2  Hard failure on unsupported variant strings.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { BedEngine, BedVariant } from '../engines/BedEngine';
import { buildBedConfig } from './BedFactory';
import { MaterialService } from '../MaterialService';

const VALID: ReadonlySet<BedVariant> = new Set<BedVariant>(['platform', 'float', 'walnut', 'nordic', 'solid_wood']);

export class JapaneseBedBuilder implements IFurnitureBuilder {
    private engine: BedEngine;

    constructor(
        private readonly variant: BedVariant,
        materialService?: MaterialService,
    ) {
        if (!VALID.has(variant)) {
            throw new Error(`[JapaneseBedBuilder] Unknown variant '${variant}'`);
        }
        this.engine = new BedEngine(materialService);
    }

    build(data: FurnitureData): THREE.Group {
        const cfg = buildBedConfig(this.variant, data);
        return this.engine.build(cfg);
    }
}
