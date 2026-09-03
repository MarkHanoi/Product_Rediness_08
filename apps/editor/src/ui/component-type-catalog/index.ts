// apps/editor/src/ui/component-type-catalog — lane U4's public surface.
// The TYPE CATALOG for a loaded Component definition (§U4-TYPE-CATALOG,
// UIUX-PLAN §U4): list Types, CREATE/DUPLICATE via the split-type op, EDIT/DELETE
// via re-validated document transforms, D4 overrides display (4F table reused),
// SAVE via packFamily → the ONE catalogue. See `ComponentTypeCatalog.ts`.

export {
    openComponentTypeCatalog,
    type ComponentTypeCatalogHandle,
    type OpenComponentTypeCatalogResult,
    type TypeCatalogRow,
    type CreateTypeFields,
    type EditTypeFields,
    type TypeValueEdit,
} from './ComponentTypeCatalog.js';
