import * as THREE from '@pryzm/renderer-three/three';
import { TriangulatedGeometry, PropertySet, PropertyValue, ElementColor } from '../IntermediateModel';

export interface ReaderContext {
    findMesh(id: string): THREE.Object3D | null;
    extractGeometry(obj: THREE.Object3D): TriangulatedGeometry | null;
    extractColor(obj: THREE.Object3D): ElementColor | null;
    getLevelById?(id: string): { elevation: number } | undefined;
}

export function objectToPropertyValues(obj: Record<string, any>): PropertyValue[] {
    const props: PropertyValue[] = [];
    for (const [key, value] of Object.entries(obj)) {
        if (value === undefined || value === null) continue;
        if (typeof value === 'object') continue;

        let type: PropertyValue['type'] = 'label';
        let normalizedValue: string | number | boolean = String(value);

        if (typeof value === 'number') {
            type = Number.isInteger(value) ? 'integer' : 'real';
            normalizedValue = value;
        } else if (typeof value === 'boolean') {
            type = 'boolean';
            normalizedValue = value;
        } else if (typeof value === 'string') {
            type = 'label';
            normalizedValue = value;
        }

        props.push({ name: key, value: normalizedValue, type });
    }
    return props;
}

export function buildPropertySet(name: string, obj: Record<string, any>): PropertySet | null {
    const properties = objectToPropertyValues(obj);
    if (properties.length === 0) return null;
    return { name, properties };
}

/**
 * Phase 4 — Structured Pset support.
 *
 * Converts the `ifcData.psets` array (IFCPset[]) into PropertySet objects
 * ready for IFC writing.  The `existingNames` set is the caller's
 * deduplication guard: any pset whose name is already in that set is skipped
 * so that data from `psetCommon` or hard-coded parameter blocks is never
 * written twice to the output file.
 *
 * Usage (in every reader, after existing psets are collected):
 *
 *   const extra = collectIfcPsets(element.ifcData, new Set(propertySets.map(p => p.name)));
 *   propertySets.push(...extra);
 *
 * @param ifcData   The element's IFCMetadata object (may be undefined).
 * @param existingNames  Set of pset names already added to the result array.
 * @returns Zero or more new PropertySet objects to append.
 */
export function collectIfcPsets(
    // Accepts any ifcData shape: individual stores type ifcData more narrowly than
    // IFCMetadata.psets requires, so we use `any` here and guard with optional
    // chaining. The function is safe even when ifcData or psets is undefined.
    ifcData: any,
    existingNames: Set<string>
): PropertySet[] {
    if (!ifcData?.psets?.length) return [];
    const result: PropertySet[] = [];
    for (const pset of ifcData.psets) {
        if (existingNames.has(pset.name)) continue;
        const ps = buildPropertySet(pset.name, pset.properties);
        if (ps) result.push(ps);
    }
    return result;
}
