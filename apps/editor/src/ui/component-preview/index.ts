// component-preview — lane U5 (§COMPONENT-PREVIEW). The live 3-D preview for the
// component authoring surfaces: the THREE-free subject builder over the ONE bake
// (`bakeFamilyInstance`), the mountable live widget over the SHARED element-preview
// rig, and the cached static thumbnails for the browser cards.
export {
    buildComponentPreviewSubject,
    type ComponentPreviewBuilt,
    type ComponentPreviewFamily,
    type ComponentPreviewRefusalReason,
    type ComponentPreviewRefused,
    type ComponentPreviewRequest,
    type ComponentPreviewResult,
} from './componentPreviewSubject';
export {
    mountComponentPreview,
    type ComponentPreviewHandle,
    type ComponentPreviewOptions,
} from './ComponentPreview';
export {
    getComponentThumbnail,
    holdComponentThumbnailRig,
    _clearComponentThumbnailCacheForTest,
    type ComponentThumbnailResult,
} from './componentThumbnails';
