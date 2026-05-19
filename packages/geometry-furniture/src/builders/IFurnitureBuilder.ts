import * as THREE from '@pryzm/renderer-three/three';
import { FurnitureData } from '../FurnitureTypes';

export interface IFurnitureBuilder {
    build(data: FurnitureData): THREE.Group;
}
