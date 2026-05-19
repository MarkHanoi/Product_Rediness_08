import { StairData } from './StairTypes';

export interface IfcStairFlightData {
    guid: string;
    name: string;
    numberOfRiser: number;
    numberOfTreads: number;
    riserHeight: number;
    treadLength: number;
    nominalLength: number;
    nominalWidth: number;
    nominalHeight: number;
}

export interface IfcStairExportData {
    stairGuid: string;
    stairName: string;
    predefinedType: 'STRAIGHT_RUN' | 'TWO_STRAIGHT_RUNS' | 'QUARTER_WINDING' | 'HALF_WINDING';
    flights: IfcStairFlightData[];
    propertySet: Record<string, string | boolean | number>;
}

export class StairIfcExporter {

    export(stair: StairData): IfcStairExportData {
        const predefinedType = this.resolveIfcType(stair);

        const flights: IfcStairFlightData[] = stair.flights.map((flight, index) => {
            const flightRun = flight.riserCount * stair.treadDepth;
            const flightRise = flight.riserCount * stair.riserHeight;

            return {
                guid: crypto.randomUUID(),
                name: `${stair.properties.mark ?? stair.id} - Flight ${index + 1}`,
                numberOfRiser: flight.riserCount,
                numberOfTreads: flight.riserCount - (index === stair.flights.length - 1 ? 1 : 0),
                riserHeight: stair.riserHeight,
                treadLength: stair.treadDepth,
                nominalLength: flightRun,
                nominalWidth: stair.width,
                nominalHeight: flightRise
            };
        });

        return {
            stairGuid: stair.ifcData?.guid ?? crypto.randomUUID(),
            stairName: stair.properties.mark ?? `Stair ${stair.id.slice(0, 8)}`,
            predefinedType,
            flights,
            propertySet: this.buildPsetStairCommon(stair)
        };
    }

    buildPsetStairCommon(stair: StairData): Record<string, string | boolean | number> {
        return {
            FireExit: stair.fireRating ? true : false,
            FireRating: stair.fireRating ?? '',
            HandicapAccessible: stair.accessibilityType === 'accessible',
            HasNonSkidSurface: stair.properties.nosingType !== 'none',
            Reference: stair.properties.mark ?? '',
            NumberOfRiser: stair.riserCount,
            NominalWidth: stair.width,
            RiserHeight: stair.riserHeight,
            TreadLength: stair.treadDepth,
        };
    }

    private resolveIfcType(stair: StairData): IfcStairExportData['predefinedType'] {
        switch (stair.shape) {
            case 'I': return 'STRAIGHT_RUN';
            case 'L': return 'QUARTER_WINDING';
            case 'U': return 'TWO_STRAIGHT_RUNS';
            case 'spiral': return 'STRAIGHT_RUN';
            case 'winder': return 'QUARTER_WINDING';
            default:   return 'STRAIGHT_RUN';
        }
    }
}
