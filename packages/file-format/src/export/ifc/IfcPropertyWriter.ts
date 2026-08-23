import * as WEBIFC from 'web-ifc';
import { PropertySet, PropertyValue } from './IntermediateModel';
import { ifcGlobalId, psetKey, relDefinesKey } from './ifcIdentity';

type EntityRef = WEBIFC.IfcLineObject | number;

export class IfcPropertyWriter {
    private api: WEBIFC.IfcAPI;
    private modelID: number;
    private ownerHistoryRef: EntityRef | null;

    constructor(api: WEBIFC.IfcAPI, modelID: number, ownerHistoryRef: EntityRef | null = null) {
        this.api     = api;
        this.modelID = modelID;
        this.ownerHistoryRef = ownerHistoryRef;
    }

    private w(entity: WEBIFC.IfcLineObject): WEBIFC.IfcLineObject {
        this.api.WriteLine(this.modelID, entity);
        return entity;
    }

    /**
     * @param ownerKey Stable key of the element these psets belong to (see
     *                 `ifcIdentity.elementKey`). Used to derive stable GlobalIds
     *                 for the IfcPropertySet and IfcRelDefinesByProperties —
     *                 both were `crypto.randomUUID()` before L-8501, so every
     *                 pset in the file changed identity on every export.
     */
    createPropertySets(propertySets: PropertySet[], elementRef: EntityRef, ownerKey: string): void {
        for (const pset of propertySets) {
            const psetRef = this.createPropertySet(pset, ownerKey);
            this.createRelDefinesByProperties(elementRef, psetRef, ownerKey, pset.name);
        }
    }

    private createPropertySet(pset: PropertySet, ownerKey: string): EntityRef {
        const propertyRefs: EntityRef[] = pset.properties.map(p => this.createPropertySingleValue(p));
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCPROPERTYSET,
            ifcGlobalId(null, psetKey(ownerKey, pset.name)),
            this.ownerHistoryRef,
            pset.name,
            null,
            propertyRefs));
    }

    private createPropertySingleValue(prop: PropertyValue): EntityRef {
        let valueEntity: any;
        switch (prop.type) {
            case 'real':
                valueEntity = this.api.CreateIfcType(this.modelID, WEBIFC.IFCREAL, prop.value as number);
                break;
            case 'integer': {
                const intVal = prop.value as number;
                if (intVal >= -2147483648 && intVal <= 2147483647) {
                    valueEntity = this.api.CreateIfcType(this.modelID, WEBIFC.IFCINTEGER, intVal);
                } else {
                    valueEntity = this.api.CreateIfcType(this.modelID, WEBIFC.IFCLABEL, String(intVal));
                }
                break;
            }
            case 'boolean':
                valueEntity = this.api.CreateIfcType(this.modelID, WEBIFC.IFCBOOLEAN, prop.value as boolean);
                break;
            default:
                valueEntity = this.api.CreateIfcType(this.modelID, WEBIFC.IFCLABEL, String(prop.value));
                break;
        }
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCPROPERTYSINGLEVALUE,
            prop.name,
            null,
            valueEntity,
            null));
    }

    private createRelDefinesByProperties(
        elementRef: EntityRef,
        psetRef: EntityRef,
        ownerKey: string,
        psetName: string,
    ): EntityRef {
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCRELDEFINESBYPROPERTIES,
            ifcGlobalId(null, relDefinesKey(ownerKey, psetName)),
            this.ownerHistoryRef, null, null,
            [elementRef],
            psetRef));
    }
}
