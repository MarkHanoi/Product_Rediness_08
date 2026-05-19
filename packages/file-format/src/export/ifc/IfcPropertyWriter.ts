import * as WEBIFC from 'web-ifc';
import { PropertySet, PropertyValue } from './IntermediateModel';

type EntityRef = WEBIFC.IfcLineObject | number;

export class IfcPropertyWriter {
    private api: WEBIFC.IfcAPI;
    private modelID: number;

    constructor(api: WEBIFC.IfcAPI, modelID: number) {
        this.api     = api;
        this.modelID = modelID;
    }

    private w(entity: WEBIFC.IfcLineObject): WEBIFC.IfcLineObject {
        this.api.WriteLine(this.modelID, entity);
        return entity;
    }

    createPropertySets(propertySets: PropertySet[], elementRef: EntityRef): void {
        for (const pset of propertySets) {
            const psetRef = this.createPropertySet(pset);
            this.createRelDefinesByProperties(elementRef, psetRef);
        }
    }

    private createPropertySet(pset: PropertySet): EntityRef {
        const propertyRefs: EntityRef[] = pset.properties.map(p => this.createPropertySingleValue(p));
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCPROPERTYSET,
            crypto.randomUUID(),
            null,
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

    private createRelDefinesByProperties(elementRef: EntityRef, psetRef: EntityRef): EntityRef {
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCRELDEFINESBYPROPERTIES,
            crypto.randomUUID(),
            null, null, null,
            [elementRef],
            psetRef));
    }
}
