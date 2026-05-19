/**
 * @file TreeBuilder.ts
 *
 * IFurnitureBuilder for the parametric outdoor tree library (25 species).
 * The species is encoded directly in `data.furnitureType` (`arbol_t_NN`);
 * this builder forwards to `ParametricTreeEngine.create(speciesId)`.
 *
 * Contract: §01 §4 — builder never mutates store; returns a THREE.Group.
 */
import * as THREE from '@pryzm/renderer-three/three';
import { MaterialService } from '../MaterialService';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { ParametricTreeEngine } from '../engines/ParametricTreeEngine';
import { isTreeSpeciesId } from '../TreeTypes';

export class TreeBuilder implements IFurnitureBuilder {
    private _engine = new ParametricTreeEngine();

    constructor(_ms: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        if (!isTreeSpeciesId(data.furnitureType)) {
            // Unknown / stale species id — fail closed with empty group rather
            // than silently substituting (07-BIM-SECURITY §7.2 fail-explicitly,
            // but 03 §1.4 also forbids breaking saved projects).
            return new THREE.Group();
        }
        return this._engine.create(data.furnitureType);
    }
}
