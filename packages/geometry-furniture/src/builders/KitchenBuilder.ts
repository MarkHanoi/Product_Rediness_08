/**
 * @file KitchenBuilder.ts
 *
 * IFurnitureBuilder implementation for parametric kitchen cabinet runs.
 * Delegates all geometry to KitchenCabinetEngine.
 *
 * Contract: §01 §4 — builder never mutates store; returns Group.
 */
import * as THREE from '@pryzm/renderer-three/three';
import { MaterialService } from '../MaterialService';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { KitchenCabinetEngine } from '../engines/KitchenCabinetEngine';
import { KITCHEN_DEFAULTS, buildDefaultUnits } from '../KitchenTypes';

export class KitchenBuilder implements IFurnitureBuilder {
    private _engine = new KitchenCabinetEngine();

    constructor(_ms: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const cfg = data.kitchenConfig;
        if (!cfg) {
            const numUnits = Math.max(1, Math.round((data.width ?? KITCHEN_DEFAULTS.length) / KITCHEN_DEFAULTS.unitWidth));
            return this._engine.create({
                layoutType: 'kitchen_straight',
                depth:    data.length  ?? KITCHEN_DEFAULTS.depth,
                length:   data.width   ?? KITCHEN_DEFAULTS.length,
                height:   data.height  ?? KITCHEN_DEFAULTS.height,
                numUnits,
                units:    buildDefaultUnits(numUnits, 'main'),
            });
        }
        return this._engine.create(cfg);
    }
}
