/**
 * OpenTelemetry helpers for the IFC inspector (Phase 3-B Sprint S57).
 *
 * Exit criterion (PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md §3 line
 * 1048): `pryzm.ifc.pset-update` span is visible.
 */

import { trace, SpanStatusCode, type Span, type Tracer } from '@opentelemetry/api';

export const PRYZM_IFC_INSPECTOR_TRACER = 'pryzm.ifc.inspector';

export function getTracer(): Tracer {
  return trace.getTracer(PRYZM_IFC_INSPECTOR_TRACER);
}

export function emitPsetUpdateSpan(args: {
  elementId: string;
  psetName: string;
  propertyName: string;
  valueType: 'string' | 'number' | 'boolean' | 'null';
}): void {
  const span: Span = getTracer().startSpan('pryzm.ifc.pset-update');
  span.setAttribute('pryzm.ifc.element_id', args.elementId);
  span.setAttribute('pryzm.ifc.pset_name', args.psetName);
  span.setAttribute('pryzm.ifc.property_name', args.propertyName);
  span.setAttribute('pryzm.ifc.value_type', args.valueType);
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}
