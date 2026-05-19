export type Origin = 'native' | 'ifc';
export type FileStatus = 'ok' | 'outdated' | 'unlinked';

export interface StoreyNode {
  id: string;
  localName: string;
  elevation: number | null;
  origin: Origin;
  editable: boolean;
  adoptedLevel: boolean;
  sourceFileIds: string[];
  ifcGUID: string | null;
  elementCount: number;
  visible: boolean;
}

export interface ElementNode {
  id: string;
  type: string;
  storeyId: string;
  origin: Origin;
  editable: boolean;
  sourceFileId: string | null;
  ifcGUID: string | null;
  ifcType: string | null;
}

export interface IfcFileNode {
  id: string;
  filename: string;
  schema: 'IFC2X3' | 'IFC4' | 'IFC4X3';
  importedAt: string;
  elementCount: number;
  status: FileStatus;
  visible: boolean;
  adoptedStoreyIds: string[];
}

export interface ProjectState {
  projectName: string;
  site: { id: string; name: string };
  building: { id: string; name: string };
  activeStoreyId: string;
  storeys: StoreyNode[];
  elements: ElementNode[];
  ifcFiles: IfcFileNode[];
}

export interface ContextMenuState {
  storeyId: string;
  x: number;
  y: number;
}

export type AppAction =
  | { type: 'SET_ACTIVE_STOREY'; payload: string }
  | { type: 'TOGGLE_IFC_VISIBLE'; payload: string }
  | { type: 'TOGGLE_STOREY_EXPAND'; payload: string }
  | { type: 'RENAME_STOREY'; payload: { storeyId: string; name: string } }
  | { type: 'ADD_NATIVE_STOREY'; payload: { afterStoreyId: string; elevation: number } }
  | { type: 'OPEN_CONTEXT_MENU'; payload: ContextMenuState }
  | { type: 'CLOSE_CONTEXT_MENU' };

export interface AppStateWithUI extends ProjectState {
  expandedStoreyIds: Set<string>;
  contextMenu: ContextMenuState | null;
  renamingStoreyId: string | null;
}
