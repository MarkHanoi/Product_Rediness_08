import { toolRegistry } from '@pryzm/input-host';

/** Registers all annotation tool descriptors in the ToolRegistry (extracted from engineLauncher.ts Task 5.2). */
export function initAnnotationTools(): void {
    toolRegistry.register({ id: 'linear-dimension',    label: 'Linear Dimension', section: 'ANNOTATION', icon: 'material-symbols:architecture' });
    toolRegistry.register({ id: 'text-note',           label: 'Text Note',        section: 'ANNOTATION', icon: 'material-symbols:sticky-note-2' });
    toolRegistry.register({ id: 'element-tag',         label: 'Tag Element',      section: 'ANNOTATION', icon: 'material-symbols:label' });
    toolRegistry.register({ id: 'angular-dimension',   label: 'Angular Dim',      section: 'ANNOTATION', icon: 'material-symbols:angle' });
    toolRegistry.register({ id: 'spot-elevation',      label: 'Spot Elevation',   section: 'ANNOTATION', icon: 'material-symbols:elevation' });
    toolRegistry.register({ id: 'keynote',             label: 'Keynote',          section: 'ANNOTATION', icon: 'material-symbols:tag' });
    toolRegistry.register({ id: 'radius-dimension',    label: 'Radius Dim',       section: 'ANNOTATION', icon: 'material-symbols:radio-button-unchecked' });
    toolRegistry.register({ id: 'diameter-dimension',  label: 'Diameter Dim',     section: 'ANNOTATION', icon: 'material-symbols:circle' });
    toolRegistry.register({ id: 'slope-dimension',     label: 'Slope Dim',        section: 'ANNOTATION', icon: 'material-symbols:trending-up' });
    toolRegistry.register({ id: 'door-tag',            label: 'Door Tag',         section: 'ANNOTATION', icon: 'material-symbols:door-open' });
    toolRegistry.register({ id: 'window-tag',          label: 'Window Tag',       section: 'ANNOTATION', icon: 'material-symbols:window' });
    toolRegistry.register({ id: 'level-tag',           label: 'Level Tag',        section: 'ANNOTATION', icon: 'material-symbols:height' });
    toolRegistry.register({ id: 'grid-bubble',         label: 'Grid Bubble',      section: 'ANNOTATION', icon: 'material-symbols:grid-on' });
    toolRegistry.register({ id: 'section-mark',        label: 'Section Mark',     section: 'ANNOTATION', icon: 'material-symbols:cut' });
    toolRegistry.register({ id: 'elevation-mark',      label: 'Elevation Mark',   section: 'ANNOTATION', icon: 'material-symbols:arrow-upward' });
    toolRegistry.register({ id: 'callout-detail',      label: 'Callout Detail',   section: 'ANNOTATION', icon: 'material-symbols:open-in-new' });
    toolRegistry.register({ id: 'revision-cloud',      label: 'Revision Cloud',   section: 'ANNOTATION', icon: 'material-symbols:cloud' });
    toolRegistry.register({ id: 'annotation-visibility', label: 'Ann. Visibility', section: 'ANNOTATION', icon: 'material-symbols:visibility' });
    toolRegistry.register({ id: 'annotate-view-ai',    label: 'AI Annotate',      section: 'ANNOTATION', icon: 'material-symbols:auto-awesome' });
}
