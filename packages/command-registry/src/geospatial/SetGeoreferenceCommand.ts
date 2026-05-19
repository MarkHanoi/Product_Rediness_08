import { Georeference } from '@pryzm/core-app-model';

export class SetGeoreferenceCommand {
    readonly affectedStores = ["level"] as const;
  private previousGeoreference: Georeference | null = null;

  constructor(
    private store: any, 
    private newGeoreference: Georeference
  ) {}

  public execute(): void {
    this.previousGeoreference = this.store.georeference ? structuredClone(this.store.georeference) : null;
    this.store.georeference = structuredClone(this.newGeoreference);
    console.log('Georeference set:', this.store.georeference);
  }

  public undo(): void {
    this.store.georeference = this.previousGeoreference ? structuredClone(this.previousGeoreference) : null;
    console.log('Georeference undone');
  }

  public redo(): void {
    this.execute();
  }
}
