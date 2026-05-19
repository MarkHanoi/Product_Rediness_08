/**
 * @pryzm/core-app-model — requirements sub-barrel (P9-W6 2026-05-10)
 */

export type {
    RequirementStatus,
    SpatialRequirements,
    PhysicsRequirements,
    FinishRequirements,
    AssetRequirements,
    SafetyRequirements,
    RequirementParameters,
    RequirementMetadata,
    RoomRequirement,
    RequirementParamUpdate,
} from './RequirementTypes.js';

export {
    SpatialRequirementsSchema,
    PhysicsRequirementsSchema,
    FinishRequirementsSchema,
    AssetRequirementsSchema,
    SafetyRequirementsSchema,
    RequirementParametersSchema,
    RequirementMetadataSchema,
    RequirementStatusSchema,
    RoomRequirementAddSchema,
    RoomRequirementUpdateSchema,
    formatRequirementZodError,
} from './RequirementSchema.js';

export { RequirementStore, requirementStore } from './RequirementStore.js';
