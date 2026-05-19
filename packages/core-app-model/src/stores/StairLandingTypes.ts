export interface StairLandingEntity {
    id: string;
    stairId: string;
    afterFlightIndex: number;
    elevation: number;
    length: number;
    width: number;
    position?: { x: number; z: number };
    material?: string;
    ifcData: {
        guid: string;
        ifcClass: 'IfcSlab';
        predefinedType: 'LANDING';
    };
}
