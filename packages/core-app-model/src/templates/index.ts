/**
 * @pryzm/core-app-model — templates sub-barrel (Wave 10 T4 W10-A)
 */

export type {
    TemplateScope, TemplateDefinition, TemplateRequirements,
    AreaRequirement, CountRequirement, DoorRequirement, WindowRequirement,
    WallRequirement, FinishRequirement, EquipmentRequirement, AdjacencyRequirement,
    ChildNodeRequirement, CustomRequirement, TemplateAssignment,
} from './TemplateTypes.js';

export { BUILTIN_TEMPLATES, BUILTIN_CATEGORIES, getBuiltinsByCategory } from './BuiltinTemplates.js';
export type { BuiltinCategory } from './BuiltinTemplates.js';

export { TemplateStore, templateStore } from './TemplateStore.js';
export { TemplateAssignmentStore, templateAssignmentStore } from './TemplateAssignmentStore.js';
