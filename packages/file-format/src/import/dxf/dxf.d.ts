/**
 * Type declarations for the `dxf` npm package (v5.x, MIT).
 * No official @types/dxf exists. Only the interfaces used by DxfParser.ts are declared.
 */
declare module 'dxf' {
    export class Helper {
        constructor(dxfString: string);
        parsed: {
            header?: Record<string, any>;
            tables?: {
                layers?: Record<string, { colorNumber: number; lineType?: string; [k: string]: any }>;
                [k: string]: any;
            };
            blocks?: any[];
            entities?: any[];
        };
        toPolylines(): {
            bbox: { minX: number; minY: number; maxX: number; maxY: number };
            polylines: Array<{
                rgb: [number, number, number];
                layer: { name?: string; [k: string]: any } | null;
                vertices: Array<[number, number]>;
            }>;
        };
    }
    export const colors: Record<number, [number, number, number]>;
    export function parseString(dxfString: string): any;
}
