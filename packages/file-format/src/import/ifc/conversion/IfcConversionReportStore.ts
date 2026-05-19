import { IfcConversionReport } from './IfcConversionTypes';

class IfcConversionReportStoreClass {
  private reports: IfcConversionReport[] = [];

  add(report: IfcConversionReport): void {
    this.reports.unshift(report);
    this.reports = this.reports.slice(0, 20);
    _bus.emit('pryzm-ifc-conversion-report-updated', report as unknown as Record<string, unknown>); // F.events.18
  }

  getLatest(): IfcConversionReport | undefined {
    return this.reports[0];
  }

  getAll(): IfcConversionReport[] {
    return [...this.reports];
  }

  clear(): void {
    this.reports = [];
  }
}

export const ifcConversionReportStore = new IfcConversionReportStoreClass();
import { projectScopeRegistry } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();
projectScopeRegistry.register({
    scopeName: 'ifcConversionReportStore',
    clear: () => ifcConversionReportStore.clear(),
});
