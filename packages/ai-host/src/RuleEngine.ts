import { AIReadModel } from './AIReadModel.js';
import { 
    RuleViolation, RuleSeverity, ValidationReport, 
    AIDoor, AIWindow 
} from './AITypes.js';

interface ValidationRule {
    id: string;
    name: string;
    description: string;
    severity: RuleSeverity;
    category: 'P0-Integrity' | 'P1-Functional' | 'P2-IFC';
    validate: (readModel: AIReadModel) => RuleViolation[];
}

// Unused constants removed as per LSP diagnostic
const MINIMUM_WINDOW_SILL_HEIGHT = 0.3;

export class RuleEngine {
    private readModel: AIReadModel;
    private rules: ValidationRule[] = [];

    constructor(readModel: AIReadModel) {
        this.readModel = readModel;
        this.initializeRules();
        
        // Listen for model updates to re-validate if needed
        window.addEventListener('ai-model-update', () => {
            console.log('[RuleEngine] Model updated, ready for re-validation');
        });
    }

    private initializeRules(): void {
        this.rules = [
            {
                id: 'P0-WALL-NON-PHYSICAL-DIMENSIONS',
                name: 'Wall With Non-Physical Thickness',
                description: 'Wall thickness is below physically constructible limits',
                severity: { level: 'error', code: 'P0-Integrity' },
                category: 'P0-Integrity',
                validate: (rm) => {
                    const walls = rm.getElementsByType('wall');
                    const curtainWalls = rm.getElementsByType('curtain-wall');
                    const allWallTypes = [...walls, ...curtainWalls];
                    
                    return allWallTypes
                        .filter(w => (w as any).thickness !== undefined && (w as any).thickness < 0.05)
                        .map(w => ({
                            ruleId: 'P0-WALL-NON-PHYSICAL-DIMENSIONS',
                            ruleName: 'Wall With Non-Physical Thickness',
                            severity: { level: 'error' as const, code: 'P0-Integrity' },
                            elementId: w.id,
                            elementType: w.type,
                            message: 'Wall thickness is below physically constructible limits',
                            details: 'A thickness below 50mm is physically unrealistic for structural or architectural walls.',
                            levelId: w.levelId,
                            fullExplanation: {
                                title: 'Wall With Non-Physical Thickness',
                                severity: 'P0',
                                condition: 'Wall thickness is below 50mm.',
                                technicalFinding: `Wall ${w.id} has a thickness of ${((w as any).thickness * 1000).toFixed(0)}mm.`,
                                professionalImpact: 'BIM geometry must represent physical reality. Extremely thin walls fail in structural analysis and quantity takeoffs.',
                                downstreamConsequences: [
                                    'Structural analysis models will be invalid',
                                    'Quantity takeoffs will misrepresent material requirements',
                                    'Clash detection will produce false negatives'
                                ],
                                aiActionSafety: {
                                    canSuggestFix: false,
                                    canAutoExecute: false,
                                    notes: 'AI must not guess wall thickness without architectural intent.'
                                }
                            }
                        }));
                }
            },
            {
                id: 'P0-COLUMN-NON-PHYSICAL-SECTION',
                name: 'Column Section Below Structural Minimum',
                description: 'Column cross-section is structurally unrealistic',
                severity: { level: 'error', code: 'P0-Integrity' },
                category: 'P0-Integrity',
                validate: (rm) => {
                    const columns = rm.getElementsByType('column');
                    return columns
                        .filter(c => (c as any).width < 0.20 || (c as any).depth < 0.20)
                        .map(c => ({
                            ruleId: 'P0-COLUMN-NON-PHYSICAL-SECTION',
                            ruleName: 'Column Section Below Structural Minimum',
                            severity: { level: 'error' as const, code: 'P0-Integrity' },
                            elementId: c.id,
                            elementType: 'column',
                            message: 'Column cross-section is structurally unrealistic',
                            details: 'Standard structural columns require at least 200mm in each dimension.',
                            levelId: c.levelId,
                            fullExplanation: {
                                title: 'Column Section Below Structural Minimum',
                                severity: 'P0',
                                condition: 'Column dimensions are below 200mm.',
                                technicalFinding: `Column ${c.id} has dimensions of ${((c as any).width * 1000).toFixed(0)}mm x ${((c as any).depth * 1000).toFixed(0)}mm.`,
                                professionalImpact: 'Standard structural columns require at least 200mm in each dimension to maintain load-bearing integrity and fire resistance.',
                                downstreamConsequences: [
                                    'Structural integrity is compromised',
                                    'Fire resistance ratings cannot be achieved',
                                    'Load paths may be discontinuous'
                                ],
                                aiActionSafety: {
                                    canSuggestFix: false,
                                    canAutoExecute: false,
                                    notes: 'AI must not guess structural column sizes.'
                                }
                            }
                        }));
                }
            },
            {
                id: 'P1-LEVEL-INSUFFICIENT-HEADROOM',
                name: 'Level Height Below Minimum Habitable Clearance',
                description: 'Level height below minimum habitable clearance',
                severity: { level: 'warning', code: 'P1-Functional' },
                category: 'P1-Functional',
                validate: (rm) => {
                    const levels = rm.getModelSummary().levels;
                    return levels
                        .filter(l => l.height !== undefined && l.height < 2.40)
                        .map(l => ({
                            ruleId: 'P1-LEVEL-INSUFFICIENT-HEADROOM',
                            ruleName: 'Level Height Below Minimum Habitable Clearance',
                            severity: { level: 'warning' as const, code: 'P1-Functional' },
                            elementId: l.id,
                            elementType: 'wall', // Using wall as placeholder
                            message: 'Level height below minimum habitable clearance',
                            details: 'Minimum habitable headroom is typically 2.4m.',
                            fullExplanation: {
                                title: 'Level Height Below Minimum Habitable Clearance',
                                severity: 'P1',
                                condition: 'Level height is below 2.4m.',
                                technicalFinding: `Level ${l.name} has a height of ${l.height}m.`,
                                professionalImpact: 'Insufficient level height impacts usability, code compliance, and downstream systems such as MEP coordination.',
                                downstreamConsequences: [
                                    'Doors and windows may violate clearance requirements',
                                    'Mechanical systems may not fit',
                                    'Code compliance checks may fail'
                                ],
                                aiActionSafety: {
                                    canSuggestFix: true,
                                    canAutoExecute: false,
                                    notes: 'AI may suggest a numeric adjustment to 2.4m.'
                                }
                            },
                            suggestedAction: '2.4'
                        }));
                }
            },
            {
                id: 'P1-DOOR-INSUFFICIENT-WIDTH',
                name: 'Door Width Below Accessibility Minimum',
                description: 'Door width below accessibility minimum',
                severity: { level: 'warning', code: 'P1-Functional' },
                category: 'P1-Functional',
                validate: (rm) => {
                    const doors = rm.getAllDoors() as AIDoor[];
                    return doors
                        .filter(d => d.width < 0.80)
                        .map(d => ({
                            ruleId: 'P1-DOOR-INSUFFICIENT-WIDTH',
                            ruleName: 'Door Width Below Accessibility Minimum',
                            severity: { level: 'warning' as const, code: 'P1-Functional' },
                            elementId: d.id,
                            elementType: 'door',
                            message: 'Door width below accessibility minimum',
                            details: 'Standard accessibility guidelines require a minimum clear opening of 800mm.',
                            levelId: d.levelId,
                            fullExplanation: {
                                title: 'Door Width Below Accessibility Minimum',
                                severity: 'P1',
                                condition: 'Door width is below 800mm.',
                                technicalFinding: `Door ${d.id} has a width of ${(d.width * 1000).toFixed(0)}mm.`,
                                professionalImpact: 'Standard accessibility guidelines (like ADA/Part M) require a minimum clear opening of 800mm.',
                                downstreamConsequences: [
                                    'Narrow doors prevent wheelchair access',
                                    'Emergency egress routes may be obstructed',
                                    'Building may fail accessibility audits'
                                ],
                                aiActionSafety: {
                                    canSuggestFix: true,
                                    canAutoExecute: false,
                                    notes: 'AI may suggest increasing width to 0.8m.'
                                }
                            },
                            suggestedAction: '0.8'
                        }));
                }
            },
            {
                id: 'P1-DOOR-INSUFFICIENT-HEIGHT',
                name: 'Door Height Below Standard Clearance',
                description: 'Door height below standard clearance',
                severity: { level: 'warning', code: 'P1-Functional' },
                category: 'P1-Functional',
                validate: (rm) => {
                    const doors = rm.getAllDoors() as AIDoor[];
                    return doors
                        .filter(d => d.height < 1.80)
                        .map(d => ({
                            ruleId: 'P1-DOOR-INSUFFICIENT-HEIGHT',
                            ruleName: 'Door Height Below Standard Clearance',
                            severity: { level: 'warning' as const, code: 'P1-Functional' },
                            elementId: d.id,
                            elementType: 'door',
                            message: 'Door height below standard clearance',
                            details: 'Doors below 1.8m pose a head-strike safety risk.',
                            levelId: d.levelId,
                            fullExplanation: {
                                title: 'Door Height Below Standard Clearance',
                                severity: 'P1',
                                condition: 'Door height is below 1.8m.',
                                technicalFinding: `Door ${d.id} has a height of ${(d.height * 1000).toFixed(0)}mm.`,
                                professionalImpact: 'Standard habitable doors require a minimum height to prevent safety risks and ensure standard usability.',
                                downstreamConsequences: [
                                    'Head-strike safety hazards',
                                    'Standard furniture and equipment may not pass',
                                    'Fail building code inspections'
                                ],
                                aiActionSafety: {
                                    canSuggestFix: true,
                                    canAutoExecute: false,
                                    notes: 'AI may suggest increasing height to 1.8m.'
                                }
                            },
                            suggestedAction: '1.8'
                        }));
                }
            },
            {
                id: 'P1-WINDOW-INSUFFICIENT-WIDTH',
                name: 'Window Width Below Usable Opening',
                description: 'Window width insufficient for daylight or ventilation',
                severity: { level: 'warning', code: 'P1-Functional' },
                category: 'P1-Functional',
                validate: (rm) => {
                    const windows = rm.getAllWindows() as AIWindow[];
                    return windows
                        .filter(w => w.width < 0.50)
                        .map(w => ({
                            ruleId: 'P1-WINDOW-INSUFFICIENT-WIDTH',
                            ruleName: 'Window Width Below Usable Opening',
                            severity: { level: 'warning' as const, code: 'P1-Functional' },
                            elementId: w.id,
                            elementType: 'window',
                            message: 'Window width insufficient for daylight or ventilation',
                            details: 'Windows narrower than 500mm significantly limit performance.',
                            levelId: w.levelId,
                            fullExplanation: {
                                title: 'Window Width Below Usable Opening',
                                severity: 'P1',
                                condition: 'Window width is below 500mm.',
                                technicalFinding: `Window ${w.id} has a width of ${(w.width * 1000).toFixed(0)}mm.`,
                                professionalImpact: 'Windows narrower than 500mm significantly limit natural daylight penetration and effective cross-ventilation.',
                                downstreamConsequences: [
                                    'Poor natural lighting performance',
                                    'Inadequate ventilation rates',
                                    'Reduced occupant comfort'
                                ],
                                aiActionSafety: {
                                    canSuggestFix: true,
                                    canAutoExecute: false,
                                    notes: 'AI may suggest increasing width to 0.5m.'
                                }
                            },
                            suggestedAction: '0.5'
                        }));
                }
            },
            {
                id: 'P1-WINDOW-INSUFFICIENT-HEIGHT',
                name: 'Window Height Below Usable Opening',
                description: 'Window height insufficient for functional opening',
                severity: { level: 'warning', code: 'P1-Functional' },
                category: 'P1-Functional',
                validate: (rm) => {
                    const windows = rm.getAllWindows() as AIWindow[];
                    return windows
                        .filter(w => w.height < 0.50)
                        .map(w => ({
                            ruleId: 'P1-WINDOW-INSUFFICIENT-HEIGHT',
                            ruleName: 'Window Height Below Usable Opening',
                            severity: { level: 'warning' as const, code: 'P1-Functional' },
                            elementId: w.id,
                            elementType: 'window',
                            message: 'Window height insufficient for functional opening',
                            details: 'Functional windows require a minimum height of 500mm.',
                            levelId: w.levelId,
                            fullExplanation: {
                                title: 'Window Height Below Usable Opening',
                                severity: 'P1',
                                condition: 'Window height is below 500mm.',
                                technicalFinding: `Window ${w.id} has a height of ${(w.height * 1000).toFixed(0)}mm.`,
                                professionalImpact: 'Functional windows require a minimum height of 500mm to provide adequate views and usable ventilation.',
                                downstreamConsequences: [
                                    'Obstructed views to exterior',
                                    'Limited functional ventilation',
                                    'Non-compliance with architectural standards'
                                ],
                                aiActionSafety: {
                                    canSuggestFix: true,
                                    canAutoExecute: false,
                                    notes: 'AI may suggest increasing height to 0.5m.'
                                }
                            },
                            suggestedAction: '0.5'
                        }));
                }
            },
            {
                id: 'P2-LOADBEARING-MISSING-FIRE-RATING',
                name: 'Missing Fire Rating on Load-Bearing Elements',
                description: 'Missing fire rating on load-bearing element',
                severity: { level: 'info', code: 'P2-Quality' },
                category: 'P2-IFC',
                validate: (rm) => {
                    const elements = rm.getAllElements();
                    return elements
                        .filter(e => e.properties.core.loadBearing === true && !e.properties.core.fireRating)
                        .map(e => ({
                            ruleId: 'P2-LOADBEARING-MISSING-FIRE-RATING',
                            ruleName: 'Missing Fire Rating on Load-Bearing Element',
                            severity: { level: 'info' as const, code: 'P2-Quality' },
                            elementId: e.id,
                            elementType: e.type,
                            message: 'Missing fire rating on load-bearing element',
                            details: 'Fire resistance information is missing for a structurally critical element.',
                            levelId: e.levelId,
                            fullExplanation: {
                                title: 'Missing Fire Rating on Load-Bearing Element',
                                severity: 'P2',
                                condition: 'Element is load-bearing but lacks fire rating.',
                                technicalFinding: `Element ${e.id} (${e.type}) is marked load-bearing without fireRating metadata.`,
                                professionalImpact: 'Fire rating is mandatory for safety review, simulation, and regulatory approval.',
                                downstreamConsequences: [
                                    'Fire simulations cannot be run',
                                    'IFC exports will be incomplete',
                                    'Permit approval may be blocked'
                                ],
                                aiActionSafety: {
                                    canSuggestFix: false,
                                    canAutoExecute: false,
                                    notes: 'AI may not guess ratings; manual entry required.'
                                }
                            }
                        }));
                }
            },
            {
                id: 'P0-001',
                name: 'Missing Level ID',
                description: 'Elements must have a valid level assignment',
                severity: { level: 'error', code: 'P0-INTEGRITY' },
                category: 'P0-Integrity',
                validate: (rm) => {
                    const elements = rm.findElementsWithoutLevel();
                    return elements.map(e => ({
                        ruleId: 'P0-001',
                        ruleName: 'Missing Level ID',
                        severity: { level: 'error' as const, code: 'P0-INTEGRITY' },
                        elementId: e.id,
                        elementType: e.type,
                        message: `Element ${e.id} has no valid level assignment`,
                        details: `Level ID "${e.levelId}" does not exist in the model.`,
                        levelId: e.levelId,
                        fullExplanation: {
                            title: 'Missing Level ID',
                            severity: 'P0',
                            condition: 'Element lacks a valid level reference.',
                            technicalFinding: `Element ${e.id} references non-existent Level ID "${e.levelId}".`,
                            professionalImpact: 'Every BIM element must be associated with a level for proper spatial organization and scheduling.',
                            downstreamConsequences: [
                                'Spatial coordination is broken',
                                'Schedules will miscount elements',
                                'Quantities cannot be assigned to building zones'
                            ],
                            aiActionSafety: {
                                canSuggestFix: false,
                                canAutoExecute: false,
                                notes: 'Human must manually assign the correct level.'
                            }
                        },
                        suggestedAction: "Assign the element to an existing level via the properties panel."
                    }));
                }
            },
            {
                id: 'P0-005',
                name: 'Undefined Material Specification',
                description: 'Critical structural elements must have a material assigned',
                severity: { level: 'error', code: 'P0-INTEGRITY' },
                category: 'P0-Integrity',
                validate: (rm) => {
                    const elements = rm.getAllElements();
                    return elements
                        .filter(e => (e.type === 'wall' || e.type === 'slab' || e.type === 'column') && !e.properties.core.material)
                        .map(e => ({
                            ruleId: 'P0-005',
                            ruleName: 'Undefined Material Specification',
                            severity: { level: 'error' as const, code: 'P0-INTEGRITY' },
                            elementId: e.id,
                            elementType: e.type,
                            message: `${e.type} ${e.id} has no material assigned`,
                            details: `Structural elements without material definitions create a critical data void.`,
                            levelId: e.levelId,
                            fullExplanation: {
                                title: 'Undefined Material Specification',
                                severity: 'P0',
                                condition: 'Critical structural element lacks a material assignment.',
                                technicalFinding: `${e.type} ${e.id} has null material property.`,
                                professionalImpact: 'Materials dictate physical behavior, cost, and procurement. Undefined materials prevent structural analysis and fire safety verification.',
                                downstreamConsequences: [
                                    'Load-bearing analysis is impossible',
                                    'Fire resistance cannot be certified',
                                    'Material takeoffs and procurement are blocked'
                                ],
                                aiActionSafety: {
                                    canSuggestFix: false,
                                    canAutoExecute: false,
                                    notes: 'Human must select the specific material specification.'
                                }
                            },
                            suggestedAction: "Select a material from the property palette."
                        }));
                }
            },
            {
                id: 'P1-WINDOW-MISSING-FIRE-RATING',
                name: 'Missing Window Fire Rating',
                description: 'Windows in rated walls should have fire rating metadata',
                severity: { level: 'info', code: 'P2-Quality' },
                category: 'P2-IFC',
                validate: (rm) => {
                    const windows = rm.getAllWindows() as AIWindow[];
                    return windows
                        .filter(w => !w.properties.core.fireRating)
                        .map(w => ({
                            ruleId: 'P1-WINDOW-MISSING-FIRE-RATING',
                            ruleName: 'Missing Window Fire Rating',
                            severity: { level: 'info' as const, code: 'P2-Quality' },
                            elementId: w.id,
                            elementType: 'window',
                            message: 'Window missing fire rating metadata',
                            details: 'Fire rating is missing for this window. Defaulting to 0 mins.',
                            fullExplanation: {
                                title: 'Missing Window Fire Rating',
                                severity: 'P2',
                                condition: 'Window lacks fire rating metadata.',
                                technicalFinding: `Window ${w.id} has no fireRating property.`,
                                professionalImpact: 'Fire ratings are required for life safety compliance and code audits.',
                                downstreamConsequences: ['Fire safety documentation incomplete', 'Audit failure'],
                                aiActionSafety: { canSuggestFix: true, canAutoExecute: false, notes: 'AI can suggest a default rating if intent is clear.' }
                            },
                            suggestedAction: '0 mins'
                        }));
                }
            },
            {
                id: 'P1-DOOR-MISSING-ACCESSIBILITY',
                name: 'Missing Door Accessibility Type',
                description: 'Doors require accessibility classification for audit compliance',
                severity: { level: 'info', code: 'P2-Quality' },
                category: 'P2-IFC',
                validate: (rm) => {
                    const doors = rm.getAllDoors() as AIDoor[];
                    return doors
                        .filter(d => !(d as any).accessibilityType)
                        .map(d => ({
                            ruleId: 'P1-DOOR-MISSING-ACCESSIBILITY',
                            ruleName: 'Missing Door Accessibility Type',
                            severity: { level: 'info' as const, code: 'P2-Quality' },
                            elementId: d.id,
                            elementType: 'door',
                            message: 'Missing accessibility classification',
                            details: 'No accessibility type defined for this door.',
                            fullExplanation: {
                                title: 'Missing Door Accessibility Type',
                                severity: 'P2',
                                condition: 'Door lacks accessibility classification.',
                                technicalFinding: `Door ${d.id} has no accessibilityType property.`,
                                professionalImpact: 'Accessibility classification is required for compliance reports.',
                                downstreamConsequences: ['Compliance report gaps'],
                                aiActionSafety: { canSuggestFix: true, canAutoExecute: false, notes: 'AI can suggest "Standard" as default.' }
                            },
                            suggestedAction: 'Standard'
                        }));
                }
            },
            {
                id: 'P0-004',
                name: 'Invalid Slab Dimensions',
                description: 'Slabs must have positive width, depth, and thickness',
                severity: { level: 'error', code: 'P0-INTEGRITY' },
                category: 'P0-Integrity',
                validate: (rm) => {
                    const invalid = rm.findElementsWithInvalidDimensions().filter(e => e.type === 'slab');
                    return invalid.map(e => ({
                        ruleId: 'P0-004',
                        ruleName: 'Invalid Slab Dimensions',
                        severity: { level: 'error' as const, code: 'P0-INTEGRITY' },
                        elementId: e.id,
                        elementType: e.type,
                        message: `Slab ${e.id} has invalid dimensions`,
                        details: "Width, depth, or thickness is zero or negative. This prevents the model from accurately calculating surface area and concrete volume.",
                        levelId: e.levelId,
                        explanation: "Geometry requires positive physical dimensions to be valid for construction and calculation.",
                        suggestedAction: "Check the slab geometry and ensure all dimensions are greater than zero."
                    }));
                }
            },
            {
                id: 'P0-002',
                name: 'Orphaned Openings',
                description: 'Doors and windows must be hosted by a valid wall',
                severity: { level: 'error', code: 'P0-INTEGRITY' },
                category: 'P0-Integrity',
                validate: (rm) => {
                    const orphaned = rm.findOrphanedOpenings();
                    return orphaned.map(e => ({
                        ruleId: 'P0-002',
                        ruleName: 'Orphaned Opening',
                        severity: { level: 'error' as const, code: 'P0-INTEGRITY' },
                        elementId: e.id,
                        elementType: e.type,
                        message: `${e.type === 'door' ? 'Door' : 'Window'} ${e.id} is not hosted by a valid wall`,
                        details: `The parent wall no longer exists in the model. In construction, an opening without a host is a physical impossibility and represents a coordination error.`,
                        levelId: e.levelId,
                        explanation: "Openings like doors and windows require a host wall to provide structural support and spatial context.",
                        suggestedAction: "Re-host the opening to a valid wall or delete it if the wall was intentionally removed."
                    }));
                }
            },
            {
                id: 'P0-003',
                name: 'Invalid Parent Reference',
                description: 'Parent ID must reference a valid element or level',
                severity: { level: 'error', code: 'P0-INTEGRITY' },
                category: 'P0-Integrity',
                validate: (rm) => {
                    const invalid = rm.findElementsWithInvalidParent();
                    return invalid.map(e => ({
                        ruleId: 'P0-003',
                        ruleName: 'Invalid Parent Reference',
                        severity: { level: 'error' as const, code: 'P0-INTEGRITY' },
                        elementId: e.id,
                        elementType: e.type,
                        message: `Element ${e.id} has an invalid parent reference`,
                        details: `Parent ID "${e.parentId}" does not exist. This breaks the spatial hierarchy and prevents proper data inheritance from container elements.`,
                        levelId: e.levelId,
                        explanation: "BIM elements maintain a hierarchy where children must point to valid parents (like a level or a host wall).",
                        suggestedAction: "Update the parent reference of the element to a valid level or host."
                    }));
                }
            },
            {
                id: 'P1-002',
                name: 'Door Sill Height Not Zero',
                description: 'Interior doors should have zero sill height',
                severity: { level: 'warning', code: 'P1-FUNCTIONAL' },
                category: 'P1-Functional',
                validate: (rm) => {
                    const doors = rm.getAllDoors() as AIDoor[];
                    return doors
                        .filter(d => d.sillHeight !== 0 && d.sillHeight > 0.01)
                        .map(d => ({
                            ruleId: 'P1-002',
                            ruleName: 'Door Sill Height Not Zero',
                            severity: { level: 'warning' as const, code: 'P1-FUNCTIONAL' },
                            elementId: d.id,
                            elementType: 'door' as const,
                            message: `Door ${d.id} has sill height of ${(d.sillHeight * 1000).toFixed(0)}mm`,
                            details: 'Doors typically should be at floor level (sill height = 0). Raised door sills create tripping hazards and barriers for mobility-impaired users.',
                            levelId: d.levelId,
                            explanation: "Raised door sills create tripping hazards and barriers for mobility-impaired users.",
                            suggestedAction: "Set the door sill height to 0mm unless it is an exterior threshold."
                        }));
                }
            },
            {
                id: 'P1-003',
                name: 'Window Sill Too Low',
                description: `Window sill should be at least ${MINIMUM_WINDOW_SILL_HEIGHT * 1000}mm from floor`,
                severity: { level: 'info', code: 'P1-FUNCTIONAL' },
                category: 'P1-Functional',
                validate: (rm) => {
                    const windows = rm.getAllWindows() as AIWindow[];
                    return windows
                        .filter(w => w.sillHeight < MINIMUM_WINDOW_SILL_HEIGHT)
                        .map(w => ({
                            ruleId: 'P1-003',
                            ruleName: 'Window Sill Too Low',
                            severity: { level: 'info' as const, code: 'P1-FUNCTIONAL' },
                            elementId: w.id,
                            elementType: 'window' as const,
                            message: `Window ${w.id} has sill height of ${(w.sillHeight * 1000).toFixed(0)}mm`,
                            details: `Consider raising to at least ${MINIMUM_WINDOW_SILL_HEIGHT * 1000}mm for safety. Low window sills may require safety glazing or guardrails to prevent accidental falls.`,
                            levelId: w.levelId,
                            explanation: "Low window sills may require safety glazing or guardrails to prevent accidental falls.",
                            suggestedAction: "Check local safety codes for glazing requirements or raise the sill height."
                        }));
                }
            },
            {
                id: 'P2-003',
                name: 'Missing Pset_WallCommon_LoadBearing',
                description: 'Standard IFC export requires load-bearing property for walls',
                severity: { level: 'info', code: 'P2-IFC' },
                category: 'P2-IFC',
                validate: (rm) => {
                    const walls = rm.getElementsByType('wall');
                    return walls
                        .filter(w => w.properties.core.loadBearing === undefined)
                        .map(w => ({
                            ruleId: 'P2-003',
                            ruleName: 'Missing Pset_WallCommon_LoadBearing',
                            severity: { level: 'info' as const, code: 'P2-IFC' },
                            elementId: w.id,
                            elementType: 'wall',
                            message: `Wall ${w.id} lacks load-bearing status for IFC`,
                            details: `IFC Certification 2.0 requires the LoadBearing property to be explicitly set. Leaving this null often results in elements being incorrectly categorized during import into structural software.`,
                            levelId: w.levelId,
                            explanation: "Explicit load-bearing metadata is a requirement for high-fidelity BIM exchanges and OpenBIM workflows.",
                            suggestedAction: "Update the Load Bearing property to True or False."
                        }));
                }
            },
            {
                id: 'P2-001',
                name: 'Missing IFC GUID',
                description: 'Elements should have an IFC GUID for export',
                severity: { level: 'info', code: 'P2-IFC' },
                category: 'P2-IFC',
                validate: (rm) => {
                    const elements = rm.getAllElements();
                    return elements
                        .filter(e => !e.ifcData?.guid)
                        .map(e => ({
                            ruleId: 'P2-001',
                            ruleName: 'Missing IFC GUID',
                            severity: { level: 'info' as const, code: 'P2-IFC' },
                            elementId: e.id,
                            elementType: e.type,
                            message: `${e.type} ${e.id} is missing IFC GUID`,
                            details: 'IFC GUID is required for proper IFC export. Without a GUID, elements cannot be tracked across different BIM platforms (Round-tripping).',
                            levelId: e.levelId,
                            explanation: "IFC Global Unique Identifiers (GUIDs) are essential for tracking elements across different BIM software and versions.",
                            suggestedAction: "Generate a new GUID for the element or ensure the creation process includes GUID assignment."
                        }));
                }
            },
            {
                id: 'P2-002',
                name: 'Missing Property Set Common',
                description: 'Elements should have Pset_Common for full IFC compliance',
                severity: { level: 'info', code: 'P2-IFC' },
                category: 'P2-IFC',
                validate: (rm) => {
                    const elements = rm.getAllElements();
                    return elements
                        .filter(e => e.ifcData?.guid && (!e.ifcData.psetCommon || Object.keys(e.ifcData.psetCommon).length === 0))
                        .map(e => ({
                            ruleId: 'P2-002',
                            ruleName: 'Missing Property Set Common',
                            severity: { level: 'info' as const, code: 'P2-IFC' },
                            elementId: e.id,
                            elementType: e.type,
                            message: `${e.type} ${e.id} is missing Pset_Common`,
                            details: 'Standardized properties (fire rating, etc.) are missing. Add property set for complete IFC metadata and industry-standard interoperability.',
                            levelId: e.levelId,
                            explanation: "Pset_Common contains standardized properties (like fire rating or load-bearing status) that are vital for BIM interoperability.",
                            suggestedAction: "Initialize the Pset_Common property set with default values or relevant metadata."
                        }));
                }
            },
            {
                id: 'P0-STAIR-NON-ADJACENT-LEVELS',
                name: 'Stair Between Non-Adjacent Levels',
                description: 'Stairs can only connect adjacent levels in sequence',
                severity: { level: 'error', code: 'P0-Integrity' },
                category: 'P0-Integrity',
                validate: (rm) => {
                    const stairStore = window.stairStore; // TODO(TASK-08)
                    if (!stairStore) return [];

                    const stairs = stairStore.getAll();
                    const levels = rm.getModelSummary().levels;
                    const sortedLevels = [...levels].sort((a, b) => a.elevation - b.elevation);

                    return stairs
                        .filter((s: any) => {
                            const baseIdx = sortedLevels.findIndex(l => l.id === s.baseLevelId);
                            const topIdx = sortedLevels.findIndex(l => l.id === s.topLevelId);
                            return Math.abs(topIdx - baseIdx) > 1;
                        })
                        .map((s: any) => ({
                            ruleId: 'P0-STAIR-NON-ADJACENT-LEVELS',
                            ruleName: 'Stair Between Non-Adjacent Levels',
                            severity: { level: 'error' as const, code: 'P0-Integrity' },
                            elementId: s.id,
                            elementType: 'stair',
                            message: `Stair ${s.id} spans non-adjacent levels`,
                            details: 'Building stairs must connect sequential levels. A stair spanning multiple floors creates an illegal egress path and violates fire safety codes.',
                            levelId: s.baseLevelId,
                            fullExplanation: {
                                title: 'Stair Between Non-Adjacent Levels',
                                severity: 'P0',
                                condition: 'Stair connects levels that are not immediately adjacent.',
                                technicalFinding: `Stair ${s.id} connects ${s.baseLevelId} to ${s.topLevelId}, which are not adjacent in the level sequence.`,
                                professionalImpact: 'Fire codes and building regulations require stairs to connect adjacent floors. Egress analysis and occupancy calculations depend on correct stair connectivity.',
                                downstreamConsequences: [
                                    'Fire egress analysis will be invalid',
                                    'Building permit applications will be rejected',
                                    'Occupancy certificates cannot be issued',
                                    'Accessibility compliance fails'
                                ],
                                aiActionSafety: {
                                    canSuggestFix: false,
                                    canAutoExecute: false,
                                    notes: 'AI must not guess stair connectivity. Human must explicitly define intermediate stairs or correct level assignments.'
                                }
                            }
                        }));
                }
            },
            {
                id: 'P1-STAIR-RISER-HEIGHT-OUT-OF-RANGE',
                name: 'Stair Riser Height Outside Code Range',
                description: 'Riser height must be between 150mm and 190mm per building codes',
                severity: { level: 'warning', code: 'P1-Functional' },
                category: 'P1-Functional',
                validate: (_rm) => {
                    const stairStore = window.stairStore; // TODO(TASK-08)
                    if (!stairStore) return [];

                    const stairs = stairStore.getAll();
                    const MIN_RISER = 0.150;
                    const MAX_RISER = 0.190;

                    return stairs
                        .filter((s: any) => s.riserHeight < MIN_RISER || s.riserHeight > MAX_RISER)
                        .map((s: any) => ({
                            ruleId: 'P1-STAIR-RISER-HEIGHT-OUT-OF-RANGE',
                            ruleName: 'Stair Riser Height Outside Code Range',
                            severity: { level: 'warning' as const, code: 'P1-Functional' },
                            elementId: s.id,
                            elementType: 'stair',
                            message: `Stair ${s.id} has riser height of ${(s.riserHeight * 1000).toFixed(0)}mm`,
                            details: `Riser height must be between ${MIN_RISER * 1000}mm and ${MAX_RISER * 1000}mm. Current value is outside this range, creating a trip hazard and code violation.`,
                            levelId: s.baseLevelId,
                            fullExplanation: {
                                title: 'Stair Riser Height Outside Code Range',
                                severity: 'P1',
                                condition: `Riser height is ${s.riserHeight < MIN_RISER ? 'below' : 'above'} the allowed range.`,
                                technicalFinding: `Stair ${s.id} has a riser height of ${(s.riserHeight * 1000).toFixed(0)}mm. Building codes require 150mm-190mm.`,
                                professionalImpact: 'Non-compliant riser heights are a leading cause of stair falls. This creates personal injury liability and fails building inspection.',
                                downstreamConsequences: [
                                    'Building inspection failure',
                                    'Occupancy permit denial',
                                    'Increased liability for slip/trip injuries',
                                    'Insurance coverage issues'
                                ],
                                aiActionSafety: {
                                    canSuggestFix: true,
                                    canAutoExecute: false,
                                    notes: 'AI may suggest a corrected riser height value within the 150-190mm range. Human must approve recalculation of riser count.'
                                }
                            },
                            suggestedAction: s.riserHeight < MIN_RISER ? '0.150' : '0.190'
                        }));
                }
            },
            {
                id: 'P1-STAIR-WIDTH-BELOW-ACCESSIBILITY',
                name: 'Stair Width Below Accessibility Minimum',
                description: 'Stair width must be at least 900mm for egress, 1200mm for accessibility',
                severity: { level: 'warning', code: 'P1-Functional' },
                category: 'P1-Functional',
                validate: (_rm) => {
                    const stairStore = window.stairStore; // TODO(TASK-08)
                    if (!stairStore) return [];

                    const stairs = stairStore.getAll();
                    const MIN_WIDTH = 0.900;
                    const ACCESSIBLE_WIDTH = 1.200;

                    return stairs
                        .filter((s: any) => s.width < MIN_WIDTH || (s.accessibilityType === 'accessible' && s.width < ACCESSIBLE_WIDTH))
                        .map((s: any) => {
                            const isAccessible = s.accessibilityType === 'accessible';
                            const requiredWidth = isAccessible ? ACCESSIBLE_WIDTH : MIN_WIDTH;

                            return {
                                ruleId: 'P1-STAIR-WIDTH-BELOW-ACCESSIBILITY',
                                ruleName: 'Stair Width Below Accessibility Minimum',
                                severity: { level: 'warning' as const, code: 'P1-Functional' },
                                elementId: s.id,
                                elementType: 'stair',
                                message: `Stair ${s.id} has width of ${(s.width * 1000).toFixed(0)}mm (${isAccessible ? 'accessible' : 'standard'})`,
                                details: `${isAccessible ? 'Accessible stairs require' : 'Minimum egress width is'} ${requiredWidth * 1000}mm. Current width fails egress capacity calculations.`,
                                levelId: s.baseLevelId,
                                fullExplanation: {
                                    title: 'Stair Width Below Accessibility Minimum',
                                    severity: 'P1',
                                    condition: `Stair width is below the ${isAccessible ? 'accessibility' : 'egress'} minimum.`,
                                    technicalFinding: `Stair ${s.id} has width ${(s.width * 1000).toFixed(0)}mm. Required: ${requiredWidth * 1000}mm for ${isAccessible ? 'accessibility compliance' : 'egress'}.`,
                                    professionalImpact: 'Insufficient stair width prevents safe evacuation during emergencies and blocks wheelchair/stretcher access.',
                                    downstreamConsequences: [
                                        'Emergency egress routes are under-capacity',
                                        'Wheelchair users cannot evacuate safely',
                                        'ADA/Part M accessibility audits will fail',
                                        'Fire marshal approval will be denied'
                                    ],
                                    aiActionSafety: {
                                        canSuggestFix: true,
                                        canAutoExecute: false,
                                        notes: `AI may suggest increasing width to ${requiredWidth * 1000}mm. Human must confirm space is available.`
                                    }
                                },
                                suggestedAction: `${requiredWidth}`
                            };
                        });
                }
            },
            {
                id: 'P0-BEAM-WITHOUT-SUPPORTS',
                name: 'Beam Without Two Supports',
                description: 'Beams must have at least two valid support references',
                severity: { level: 'error', code: 'P0-Integrity' },
                category: 'P0-Integrity',
                validate: (rm) => {
                    const beams = rm.getElementsByType('beam');
                    return beams
                        .filter(b => (b as any).supportCount < 2)
                        .map(b => ({
                            ruleId: 'P0-BEAM-WITHOUT-SUPPORTS',
                            ruleName: 'Beam Without Two Supports',
                            severity: { level: 'error' as const, code: 'P0-Integrity' },
                            elementId: b.id,
                            elementType: 'beam' as const,
                            message: `Beam ${b.id} has only ${(b as any).supportCount} support(s)`,
                            details: 'Beams are load-transfer elements and require at least two supports (columns, walls, or other beams) to form a valid load path.',
                            levelId: b.levelId,
                            fullExplanation: {
                                title: 'Beam Without Two Supports',
                                severity: 'P0',
                                condition: 'Beam has fewer than 2 valid support references.',
                                technicalFinding: `Beam ${b.id} has ${(b as any).supportCount} support(s). At least 2 are required for structural validity.`,
                                professionalImpact: 'A beam without proper supports is structurally meaningless geometry. Loads cannot transfer to the foundation.',
                                downstreamConsequences: [
                                    'Load path analysis will fail',
                                    'Structural analysis will be invalid',
                                    'IFC export will lack proper relationships'
                                ],
                                aiActionSafety: {
                                    canSuggestFix: false,
                                    canAutoExecute: false,
                                    notes: 'AI must not guess supports. Human must explicitly assign beam to columns or walls.'
                                }
                            }
                        }));
                }
            },
            {
                id: 'P0-BEAM-SPAN-EXCEEDS-MAXIMUM',
                name: 'Beam Span Exceeds Maximum Allowed Ratio',
                description: 'Beam span-to-depth ratio exceeds structural limits',
                severity: { level: 'error', code: 'P0-Integrity' },
                category: 'P0-Integrity',
                validate: (rm) => {
                    const beams = rm.getElementsByType('beam');
                    const MAX_RATIO = 20;
                    return beams
                        .filter(b => (b as any).spanToDepthRatio > MAX_RATIO)
                        .map(b => ({
                            ruleId: 'P0-BEAM-SPAN-EXCEEDS-MAXIMUM',
                            ruleName: 'Beam Span Exceeds Maximum Allowed Ratio',
                            severity: { level: 'error' as const, code: 'P0-Integrity' },
                            elementId: b.id,
                            elementType: 'beam' as const,
                            message: `Beam ${b.id} has span-to-depth ratio of ${(b as any).spanToDepthRatio.toFixed(1)}`,
                            details: `Span-to-depth ratio exceeds ${MAX_RATIO}, indicating unrealistic proportions and excessive deflection risk.`,
                            levelId: b.levelId,
                            fullExplanation: {
                                title: 'Beam Span Exceeds Maximum Allowed Ratio',
                                severity: 'P0',
                                condition: `Span-to-depth ratio exceeds ${MAX_RATIO}.`,
                                technicalFinding: `Beam ${b.id} has span ${(b as any).span?.toFixed(2)}m, depth ${(b as any).depth?.toFixed(2)}m, ratio ${(b as any).spanToDepthRatio.toFixed(1)}.`,
                                professionalImpact: 'Beams with excessive span-to-depth ratios will experience unacceptable deflection and may fail structurally.',
                                downstreamConsequences: [
                                    'Structural failure risk',
                                    'Excessive deflection causing cracks',
                                    'Serviceability limit state violations',
                                    'Professional liability exposure'
                                ],
                                aiActionSafety: {
                                    canSuggestFix: true,
                                    canAutoExecute: false,
                                    notes: 'AI may suggest increasing beam depth. Human must approve structural changes.'
                                }
                            }
                        }));
                }
            },
            {
                id: 'P1-BEAM-DEPTH-TOO-SMALL',
                name: 'Beam Depth Too Small for Span',
                description: 'Beam depth may be insufficient for the given span',
                severity: { level: 'warning', code: 'P1-Functional' },
                category: 'P1-Functional',
                validate: (rm) => {
                    const beams = rm.getElementsByType('beam');
                    const RECOMMENDED_RATIO = 15;
                    const MAX_RATIO = 20;
                    return beams
                        .filter(b => {
                            const ratio = (b as any).spanToDepthRatio;
                            return ratio > RECOMMENDED_RATIO && ratio <= MAX_RATIO;
                        })
                        .map(b => {
                            const recommendedDepth = (b as any).span / RECOMMENDED_RATIO;
                            return {
                                ruleId: 'P1-BEAM-DEPTH-TOO-SMALL',
                                ruleName: 'Beam Depth Too Small for Span',
                                severity: { level: 'warning' as const, code: 'P1-Functional' },
                                elementId: b.id,
                                elementType: 'beam' as const,
                                message: `Beam ${b.id} depth may be insufficient (ratio ${(b as any).spanToDepthRatio.toFixed(1)})`,
                                details: `Span-to-depth ratio exceeds recommended ${RECOMMENDED_RATIO}. Consider increasing depth to ${(recommendedDepth * 1000).toFixed(0)}mm.`,
                                levelId: b.levelId,
                                fullExplanation: {
                                    title: 'Beam Depth Too Small for Span',
                                    severity: 'P1',
                                    condition: `Span-to-depth ratio exceeds recommended ${RECOMMENDED_RATIO}.`,
                                    technicalFinding: `Beam ${b.id} has ratio ${(b as any).spanToDepthRatio.toFixed(1)}. Recommended depth: ${(recommendedDepth * 1000).toFixed(0)}mm.`,
                                    professionalImpact: 'While within limits, this beam may experience noticeable deflection under load.',
                                    downstreamConsequences: [
                                        'Potential deflection issues',
                                        'May require reinforcement review',
                                        'Detailing may be difficult'
                                    ],
                                    aiActionSafety: {
                                        canSuggestFix: true,
                                        canAutoExecute: false,
                                        notes: `AI may suggest increasing depth to ${(recommendedDepth * 1000).toFixed(0)}mm.`
                                    }
                                },
                                suggestedAction: `${recommendedDepth.toFixed(3)}`
                            };
                        });
                }
            },
            {
                id: 'P1-BEAM-NO-LOAD-PATH',
                name: 'Beam Has No Downstream Load Path',
                description: 'Beam does not transfer load to any vertical support',
                severity: { level: 'warning', code: 'P1-Functional' },
                category: 'P1-Functional',
                validate: (rm) => {
                    const beams = rm.getElementsByType('beam');
                    return beams
                        .filter(b => !(b as any).startSupportId && !(b as any).endSupportId)
                        .map(b => ({
                            ruleId: 'P1-BEAM-NO-LOAD-PATH',
                            ruleName: 'Beam Has No Downstream Load Path',
                            severity: { level: 'warning' as const, code: 'P1-Functional' },
                            elementId: b.id,
                            elementType: 'beam' as const,
                            message: `Beam ${b.id} does not transfer load to any vertical support`,
                            details: 'This beam has no connections to columns or walls. Loads have nowhere to go.',
                            levelId: b.levelId,
                            fullExplanation: {
                                title: 'Beam Has No Downstream Load Path',
                                severity: 'P1',
                                condition: 'Beam supportedBy is empty.',
                                technicalFinding: `Beam ${b.id} has no start or end support assignments.`,
                                professionalImpact: 'Load path continuity is essential for structural integrity. Disconnected beams indicate missing columns or walls.',
                                downstreamConsequences: [
                                    'Load path graph is incomplete',
                                    'Structural analysis will flag errors',
                                    'Design intent unclear'
                                ],
                                aiActionSafety: {
                                    canSuggestFix: false,
                                    canAutoExecute: false,
                                    notes: 'AI must not guess supports. Human must check column/wall placement.'
                                }
                            }
                        }));
                }
            },
            {
                id: 'P2-BEAM-MISSING-FIRE-RATING',
                name: 'Load-Bearing Beam Missing Fire Rating',
                description: 'Load-bearing beams should have fire rating for code compliance',
                severity: { level: 'info', code: 'P2-Quality' },
                category: 'P2-IFC',
                validate: (rm) => {
                    const beams = rm.getElementsByType('beam');
                    return beams
                        .filter(b => b.properties.core.loadBearing === true && !b.properties.core.fireRating)
                        .map(b => ({
                            ruleId: 'P2-BEAM-MISSING-FIRE-RATING',
                            ruleName: 'Load-Bearing Beam Missing Fire Rating',
                            severity: { level: 'info' as const, code: 'P2-Quality' },
                            elementId: b.id,
                            elementType: 'beam' as const,
                            message: `Beam ${b.id} is load-bearing but lacks fire rating`,
                            details: 'Fire rating is required for structural elements to meet building code compliance.',
                            levelId: b.levelId,
                            fullExplanation: {
                                title: 'Load-Bearing Beam Missing Fire Rating',
                                severity: 'P2',
                                condition: 'Beam is marked load-bearing but has no fireRating property.',
                                technicalFinding: `Beam ${b.id} is load-bearing with no fire rating specified.`,
                                professionalImpact: 'Fire rating is mandatory for building permit approval and insurance.',
                                downstreamConsequences: [
                                    'IFC export will be incomplete',
                                    'Fire safety review will fail',
                                    'Permit may be denied'
                                ],
                                aiActionSafety: {
                                    canSuggestFix: false,
                                    canAutoExecute: false,
                                    notes: 'AI must not guess fire ratings. Human must specify based on building requirements.'
                                }
                            }
                        }));
                }
            }
        ];
    }

    private synthesizeViolations(violations: RuleViolation[], rm: AIReadModel): RuleViolation[] {
        const results = [...violations];
        const summary = rm.getModelSummary();

        // Pattern 1: Compound Risk - Habitable Volume
        const lowLevels = summary.levels.filter(l => l.height !== undefined && l.height < 2.4);
        const lowWalls = rm.getElementsByType('wall').filter(w => (w as any).height < 2.1);

        if (lowLevels.length > 0 && lowWalls.length > 0) {
            results.push({
                ruleId: 'SYNTH-HABITABILITY-RISK',
                ruleName: 'Compound Habitability Risk',
                severity: { level: 'error', code: 'P1-Functional' },
                elementId: 'model-context',
                elementType: 'wall',
                message: 'Low level height combined with short walls compounds accessibility and habitability risks.',
                details: 'Multiple low-clearance indicators detected.',
                fullExplanation: {
                    title: 'Compound Habitability Risk',
                    severity: 'P1',
                    condition: 'Simultaneous low level height and low wall height.',
                    technicalFinding: 'Detected levels < 2.4m and walls < 2.1m in the same model context.',
                    professionalImpact: 'This combination suggests a systemic failure to meet habitable space standards, severely impacting occupant safety and building legality.',
                    downstreamConsequences: [
                        'Universal failure of headroom clearance',
                        'Inability to fit standard mechanical systems',
                        'Total non-compliance with building regulations'
                    ],
                    aiActionSafety: {
                        canSuggestFix: false,
                        canAutoExecute: false,
                        notes: 'Requires a fundamental vertical redesign.'
                    }
                }
            });
        }

        return results;
    }

    validateAll(): ValidationReport {
        const rawViolations: RuleViolation[] = [];

        this.rules.forEach(rule => {
            const ruleViolations = rule.validate(this.readModel);
            rawViolations.push(...ruleViolations);
        });

        const violations = this.synthesizeViolations(rawViolations, this.readModel);

        const summary = {
            errors: violations.filter(v => v.severity.level === 'error').length,
            warnings: violations.filter(v => v.severity.level === 'warning').length,
            info: violations.filter(v => v.severity.level === 'info').length
        };

        return {
            timestamp: new Date(),
            totalElements: this.readModel.getAllElements().length,
            violations,
            summary
        };
    }

    validateByCategory(category: 'P0-Integrity' | 'P1-Functional' | 'P2-IFC'): RuleViolation[] {
        const violations: RuleViolation[] = [];
        
        this.rules
            .filter(r => r.category === category)
            .forEach(rule => {
                violations.push(...rule.validate(this.readModel));
            });

        return violations;
    }

    validateElement(elementId: string): RuleViolation[] {
        const allViolations = this.validateAll().violations;
        return allViolations.filter(v => v.elementId === elementId);
    }

    getRules(): { id: string; name: string; description: string; category: string }[] {
        return this.rules.map(r => ({
            id: r.id,
            name: r.name,
            description: r.description,
            category: r.category
        }));
    }

    // ── Phase A: Semantic Tag Evaluation ──────────────────────────────────────

    /**
     * Returns true if the element carries the given semantic tag.
     * Delegates to SemanticIndex via window global.
     *
     * Used by VisibilityRuleEngine (Phase C) and AI validation rules that
     * need to reason about semantic meaning rather than raw properties.
     */
    evaluateHasTag(elementId: string, tag: string): boolean {
        const idx = window.semanticIndex;
        if (!idx) return false;
        return idx.hasTag(elementId, tag) as boolean;
    }

    /**
     * Returns all AI elements that carry the given semantic tag.
     * Combines SemanticIndex lookup with AIReadModel element data.
     *
     * Example: `ruleEngine.getElementsWithTag('load-bearing')` returns all
     * walls, columns, beams etc. that have been tagged as load-bearing.
     */
    getElementsWithTag(tag: string): import('./AITypes.js').AIElement[] {
        return this.readModel.getTaggedElements(tag);
    }
}
