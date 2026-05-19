// FIXTURE: this file is intentionally valid.
// `pryzm/affected-stores-required` MUST NOT flag it.

interface CommandHandler<T> {
  type: string;
  readonly affectedStores: readonly string[];
  execute(payload: T): Promise<{ forward: unknown[]; inverse: unknown[] }>;
}

export class GoodHandler implements CommandHandler<{ x: number }> {
  type = 'good.cmd';
  readonly affectedStores = ['wall'] as const;

  async execute(_p: { x: number }) {
    return { forward: [], inverse: [] };
  }
}
