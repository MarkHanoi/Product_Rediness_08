/**
 * @pryzm/picking — ./snapping sub-path re-export shim.
 *
 * Wave 11: implementation moved to @pryzm/snapping. This shim maintains
 * the ./snapping sub-path export for legacy consumers in src/ until those
 * files are migrated in Waves 10–12. New code must import from
 * '@pryzm/snapping' directly.
 *
 * @deprecated src/ consumers — update to `from '@pryzm/snapping'`.
 */
export * from '@pryzm/snapping';
