export type RecommendedShape = 'I' | 'L' | 'U';

export interface ShapeRecommendation {
    shape: RecommendedShape;
    reason: string;
    requiredRunLength: number;
    requiredWidth: number;
}

export class StairShapeAdvisor {

    recommendShape(
        levelHeight: number,
        targetRiserHeight: number,
        availableLength: number,
        availableWidth: number
    ): ShapeRecommendation {
        const risers = Math.max(2, Math.round(levelHeight / targetRiserHeight));
        const requiredRunLength = (risers - 1) * 0.280;

        if (requiredRunLength <= availableLength) {
            return {
                shape: 'I',
                reason: 'Straight run fits available space',
                requiredRunLength,
                requiredWidth: availableWidth
            };
        }

        const halfRisers = Math.ceil(risers / 2);
        const halfRunLength = (halfRisers - 1) * 0.280;

        if (halfRunLength <= availableLength && availableWidth >= 2.0) {
            return {
                shape: 'L',
                reason: 'L-shape fits within available space; full run too long for straight stair',
                requiredRunLength: halfRunLength,
                requiredWidth: availableWidth
            };
        }

        return {
            shape: 'U',
            reason: 'U-shape (switchback) required due to space constraints; flights run in parallel',
            requiredRunLength: halfRunLength,
            requiredWidth: availableWidth
        };
    }

    calculateRunLength(levelHeight: number, targetRiserHeight: number, minTreadDepth: number = 0.280): number {
        const risers = Math.max(2, Math.round(levelHeight / targetRiserHeight));
        return (risers - 1) * minTreadDepth;
    }
}
