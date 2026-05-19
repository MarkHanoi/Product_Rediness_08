import { WardrobeConfig, WardrobeSection, InteriorComponent } from '../WardrobeTypes';

/**
 * WardrobeLayoutEngine (Phase 2)
 * Responsible for rule-based positioning of interior components.
 * 
 * DESIGN PRINCIPLE: Pure functions only. No THREE.js dependencies.
 */
export class WardrobeLayoutEngine {
    /**
     * Calculates the final layout of components within a section based on rules.
     * Currently returns components as-is, providing the hook for future logic.
     */
    static calculateLayout(section: WardrobeSection, config: WardrobeConfig): InteriorComponent[] {
        const components = section.components || [];
        const result: InteriorComponent[] = [];
        
        // 1. Filter shelves with undefined positionY for auto-spacing
        const autoShelves = components.filter(c => c.type === 'shelf' && c.positionY === undefined);
        const otherComponents = components.filter(c => !(c.type === 'shelf' && c.positionY === undefined));

        // 2. Add other components as-is
        result.push(...otherComponents);

        // 3. Process auto-spacing for shelves
        if (autoShelves.length > 0) {
            const margin = 0.1; // 100mm margin
            const availableHeight = config.height - (margin * 2);
            
            // If only 1 shelf, place in middle of available space
            if (autoShelves.length === 1) {
                result.push({
                    ...autoShelves[0],
                    positionY: margin + (availableHeight / 2)
                });
            } else {
                const spacing = availableHeight / (autoShelves.length - 1);
                autoShelves.forEach((shelf, index) => {
                    result.push({
                        ...shelf,
                        positionY: margin + (index * spacing)
                    });
                });
            }
        }
        
        return result;
    }
}
