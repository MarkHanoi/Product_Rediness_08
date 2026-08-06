export type RailingSide = 'left' | 'right';
export type BalusterShape = 'rectangular' | 'round';
export type RailingType = 'none' | 'flat-bar' | 'glass-panel' | 'circular';

export interface StairRailingConfig {
    id: string;
    stairId: string;
    side: RailingSide;
    topRailHeight: number;
    handrailHeight?: number;
    balusterSpacing: number;
    balusterShape: BalusterShape;
    balusterWidth: number;
    postAtStart: boolean;
    postAtEnd: boolean;
    material: string;
    railingType?: RailingType;
    /**
     * §FIX-STAIR-RAILING-TYPE-PICKER — the `HandrailTypeDefinition.id` this railing
     * was last MATERIALISED from ('glass-guardrail', 'timber-baluster', …).
     *
     * `railingType` is NOT a type in the catalogue sense — it is a CONSTRUCTION FORM
     * (none / flat-bar / glass-panel / circular) that the builder switches on. The
     * user-facing catalogue is `handrailTypeStore`, which is the same five named
     * definitions the draw-time "Handrail Type" picker offers. `resolveStairRailingTypeFields`
     * projects one onto the fields below; this id records WHICH one, so the property
     * panel can show the current selection instead of guessing from geometry, and so
     * an explicitly-typed railing is not silently overwritten by the host stair's
     * `properties.railingType` default on the next stair rebuild.
     *
     * Absent ⇒ the railing has never been individually typed and still follows the
     * stair's default, which is the pre-existing behaviour.
     */
    typeId?: string;
    ifcData?: {
        guid: string;
        ifcClass: 'IfcRailing';
        predefinedType: 'HANDRAIL' | 'GUARDRAIL' | 'BALUSTRADE';
    };
}
