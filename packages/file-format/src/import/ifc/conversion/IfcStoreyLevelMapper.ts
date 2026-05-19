import { AddLevelCommand } from '@pryzm/command-registry';
import { executeHumanDirect, getCommandContext, makeUuid } from './IfcConversionContext';
import { IfcConversionCandidate, IfcConversionIssue } from './IfcConversionTypes';

export class IfcStoreyLevelMapper {
  private cache = new Map<string, string>();

  constructor(private commandManager: any, private bimManager: any, private issues: IfcConversionIssue[]) {}

  resolve(candidate: IfcConversionCandidate, elevation: number, dryRun = false): string | undefined {
    const storeyName = candidate.trace.storeyName || 'Unassigned';
    if (this.cache.has(storeyName)) return this.cache.get(storeyName);

    const levels = this.getLevels();
    const byName = levels.find((level: any) => String(level.name ?? '').trim().toLowerCase() === storeyName.trim().toLowerCase());
    if (byName) {
      this.cache.set(storeyName, byName.id);
      return byName.id;
    }

    const byElevation = levels.find((level: any) => Math.abs(Number(level.elevation) - elevation) < 0.05);
    if (byElevation) {
      this.cache.set(storeyName, byElevation.id);
      return byElevation.id;
    }

    const levelId = makeUuid('level-ifc');
    if (dryRun) {
      this.cache.set(storeyName, levelId);
      this.issues.push({ severity: 'info', sourceId: candidate.sourceId, message: `Would create level "${storeyName}" at ${elevation.toFixed(3)}m.` });
      return levelId;
    }

    const result = executeHumanDirect(this.commandManager, new AddLevelCommand({
      levelId,
      name: storeyName,
      elevation,
      height: 3,
    }));

    if (!result?.success) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: `Could not create level "${storeyName}": ${result?.error ?? result?.info?.join(', ') ?? 'unknown error'}` });
      return undefined;
    }

    this.cache.set(storeyName, levelId);
    return levelId;
  }

  private getLevels(): any[] {
    const context = getCommandContext(this.commandManager);
    if (context?.bimManager?.getLevels) return context.bimManager.getLevels();
    if (this.bimManager?.getLevels) return this.bimManager.getLevels();
    return [];
  }
}