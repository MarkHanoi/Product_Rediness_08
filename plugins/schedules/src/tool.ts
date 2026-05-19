// SchedulesTool — schedule panel activation tool (S41 / ADR-0032).
//
// Wave 12 recipe completion: schedules plugin tool.ts (previously missing).
//
// The schedules "tool" is a panel activation action: when the user
// clicks the Schedules button in the toolbar, the tool dispatches
// a command to open the schedule panel and optionally activate a
// specific schedule.

/** Loose CommandBus shape — avoids a direct @pryzm/command-bus import. */
export interface SchedulesCommandBus {
  executeCommand<T>(type: string, payload: T): Promise<unknown>;
}

export interface SchedulesToolOptions {
  readonly commandBus: SchedulesCommandBus;
  readonly onError?: (err: unknown) => void;
}

/**
 * Activation tool for the schedules panel.
 *
 * The host calls openPanel() when the user clicks the toolbar button;
 * calls activateSchedule() when the user picks a schedule from the list.
 */
export class SchedulesTool {
  private readonly commandBus: SchedulesCommandBus;
  private readonly onError: (err: unknown) => void;
  private disposed = false;

  constructor(opts: SchedulesToolOptions) {
    this.commandBus = opts.commandBus;
    this.onError = opts.onError ?? ((err) => {
      // eslint-disable-next-line no-console
      console.error('[SchedulesTool] error:', err);
    });
  }

  /** Create a new schedule and make it active. */
  createSchedule(name: string, elementType: string): void {
    if (this.disposed) return;
    this.commandBus
      .executeCommand('schedule.create', { name, elementType })
      .catch(this.onError);
  }

  /** Activate an existing schedule by id. */
  activateSchedule(scheduleId: string): void {
    if (this.disposed) return;
    this.commandBus
      .executeCommand('schedule.activate', { scheduleId })
      .catch(this.onError);
  }

  dispose(): void {
    this.disposed = true;
  }
}
