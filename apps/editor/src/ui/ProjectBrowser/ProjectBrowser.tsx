import React, {
  useReducer,
  useRef,
  useEffect,
  useState,
} from 'react';
import { AppAction, AppStateWithUI, ContextMenuState, IfcFileNode, StoreyNode } from './types';
import { initialState } from './data';

// ─── Reducer ────────────────────────────────────────────────────────────────

let nextStoreyCounter = 1;

function reducer(state: AppStateWithUI, action: AppAction): AppStateWithUI {
  switch (action.type) {
    case 'SET_ACTIVE_STOREY':
      return { ...state, activeStoreyId: action.payload, contextMenu: null };

    case 'TOGGLE_IFC_VISIBLE': {
      const files = state.ifcFiles.map(f =>
        f.id === action.payload ? { ...f, visible: !f.visible } : f
      );
      return { ...state, ifcFiles: files };
    }

    case 'TOGGLE_STOREY_EXPAND': {
      const next = new Set(state.expandedStoreyIds);
      if (next.has(action.payload)) next.delete(action.payload);
      else next.add(action.payload);
      return { ...state, expandedStoreyIds: next };
    }

    case 'RENAME_STOREY': {
      const storeys = state.storeys.map(s =>
        s.id === action.payload.storeyId ? { ...s, localName: action.payload.name } : s
      );
      return { ...state, storeys, renamingStoreyId: null };
    }

    case 'ADD_NATIVE_STOREY': {
      const idx = state.storeys.findIndex(s => s.id === action.payload.afterStoreyId);
      const newId = `storey-new-${nextStoreyCounter++}`;
      const newStorey: StoreyNode = {
        id: newId,
        localName: 'New Level',
        elevation: action.payload.elevation,
        origin: 'native',
        editable: true,
        adoptedLevel: false,
        sourceFileIds: [],
        ifcGUID: null,
        elementCount: 0,
        visible: true,
      };
      const storeys = [
        ...state.storeys.slice(0, idx + 1),
        newStorey,
        ...state.storeys.slice(idx + 1),
      ];
      const next = new Set(state.expandedStoreyIds);
      next.add(newId);
      return {
        ...state,
        storeys,
        activeStoreyId: newId,
        expandedStoreyIds: next,
        renamingStoreyId: newId,
      };
    }

    case 'OPEN_CONTEXT_MENU':
      return { ...state, contextMenu: action.payload };

    case 'CLOSE_CONTEXT_MENU':
      return { ...state, contextMenu: null };

    default:
      return state;
  }
}

// ─── SVG Icons ──────────────────────────────────────────────────────────────

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    width="8" height="8" viewBox="0 0 8 8" fill="none"
    style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms', flexShrink: 0 }}
  >
    <path d="M2 1.5L5.5 4L2 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const StoreyIcon = ({ origin, dashed }: { origin: 'native' | 'ifc'; dashed?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
    <rect
      x="1.5" y="4.5" width="11" height="5" rx="1"
      stroke={origin === 'native' ? '#6B3FD4' : '#B45309'}
      strokeWidth="1.2"
      strokeDasharray={dashed ? '2 1.5' : undefined}
      fill="none"
    />
    <line x1="1.5" y1="7" x2="12.5" y2="7" stroke={origin === 'native' ? '#6B3FD4' : '#B45309'} strokeWidth="1.2" strokeDasharray={dashed ? '2 1.5' : undefined} />
  </svg>
);

const LockIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.35, flexShrink: 0 }}>
    <rect x="2" y="4.5" width="6" height="4.5" rx="0.8" stroke="currentColor" strokeWidth="1" />
    <path d="M3.5 4.5V3a1.5 1.5 0 013 0v1.5" stroke="currentColor" strokeWidth="1" />
  </svg>
);

const EyeIcon = ({ visible }: { visible: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
    {visible ? (
      <>
        <ellipse cx="6" cy="6" rx="4.5" ry="3" stroke="currentColor" strokeWidth="1" />
        <circle cx="6" cy="6" r="1.5" stroke="currentColor" strokeWidth="1" />
      </>
    ) : (
      <>
        <ellipse cx="6" cy="6" rx="4.5" ry="3" stroke="currentColor" strokeWidth="1" strokeOpacity="0.4" />
        <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1" />
      </>
    )}
  </svg>
);

const SiteIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="7" cy="5.5" r="2.5" stroke="#9CA3AF" strokeWidth="1.1" />
    <path d="M7 8.5c-3 0-4.5 1.2-4.5 2.5h9c0-1.3-1.5-2.5-4.5-2.5z" stroke="#9CA3AF" strokeWidth="1.1" />
  </svg>
);

const BuildingIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
    <rect x="2.5" y="2.5" width="9" height="9" rx="0.8" stroke="#9CA3AF" strokeWidth="1.1" />
    <line x1="2.5" y1="6" x2="11.5" y2="6" stroke="#9CA3AF" strokeWidth="1" />
    <line x1="2.5" y1="9" x2="11.5" y2="9" stroke="#9CA3AF" strokeWidth="1" />
    <line x1="6" y1="2.5" x2="6" y2="11.5" stroke="#9CA3AF" strokeWidth="1" />
  </svg>
);

const SearchIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <circle cx="5" cy="5" r="3.5" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2" />
    <line x1="7.8" y1="7.8" x2="10.5" y2="10.5" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

// ─── Badges ─────────────────────────────────────────────────────────────────

const NativeBadge = () => (
  <span style={{
    fontSize: 10, padding: '1px 5px', borderRadius: 4,
    background: '#E1F5EE', color: '#0F6E56', border: '1px solid #5DCAA5',
    fontWeight: 500, lineHeight: '16px', whiteSpace: 'nowrap'
  }}>native</span>
);

const IfcBadge = ({ count }: { count?: number }) => (
  <span style={{
    fontSize: 10, padding: '1px 5px', borderRadius: 4,
    background: '#FEF3C7', color: '#854F0B', border: '1px solid #EF9F27',
    fontWeight: 500, lineHeight: '16px', whiteSpace: 'nowrap'
  }}>{count && count > 1 ? `${count} files` : 'IFC'}</span>
);

const ActiveBadge = ({ origin }: { origin: 'native' | 'ifc' }) => (
  <span style={{
    fontSize: 10, padding: '1px 7px', borderRadius: 4,
    background: origin === 'native' ? '#6B3FD4' : '#B45309',
    color: '#fff', fontWeight: 600, lineHeight: '16px', whiteSpace: 'nowrap'
  }}>ACTIVE</span>
);

// ─── Toggle Switch ───────────────────────────────────────────────────────────

const ToggleSwitch = ({ on, onChange }: { on: boolean; onChange: () => void }) => (
  <button
    onClick={e => { e.stopPropagation(); onChange(); }}
    style={{
      width: 28, height: 16, borderRadius: 8, border: 'none', cursor: 'pointer',
      background: on ? '#6B3FD4' : '#4B5563',
      position: 'relative', transition: 'background 200ms', padding: 0, flexShrink: 0
    }}
    aria-label="Toggle visibility"
  >
    <span style={{
      position: 'absolute', top: 2,
      left: on ? 14 : 2,
      width: 12, height: 12, borderRadius: '50%', background: '#fff',
      transition: 'left 200ms'
    }} />
  </button>
);

// ─── Section Header ──────────────────────────────────────────────────────────

const SectionHeader = ({ label, count, dot }: { label: string; count: string; dot: 'purple' | 'amber' }) => (
  <div style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', gap: 6 }}>
    <span style={{
      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
      background: dot === 'purple' ? '#6B3FD4' : '#F59E0B'
    }} />
    <span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>{label}</span>
    <span style={{ fontSize: 10, color: '#6B7280' }}>{count}</span>
  </div>
);

// ─── Source Breakdown Panel ──────────────────────────────────────────────────

const SourceBreakdownPanel = ({
  storey,
  ifcFiles,
  elements,
}: {
  storey: StoreyNode;
  ifcFiles: IfcFileNode[];
  elements: import('./types').ElementNode[];
}) => {
  const storeyElements = elements.filter(e => e.storeyId === storey.id);

  const columns = [
    ...storey.sourceFileIds.map(fid => {
      const file = ifcFiles.find(f => f.id === fid);
      const els = storeyElements.filter(e => e.sourceFileId === fid);
      const byType: Record<string, number> = {};
      els.forEach(e => { byType[e.type] = (byType[e.type] || 0) + 1; });
      return { fileId: fid, filename: file?.filename ?? fid, count: els.length, byType };
    }),
    {
      fileId: 'native',
      filename: 'authored here',
      count: storeyElements.filter(e => e.origin === 'native').length,
      byType: (() => {
        const byType: Record<string, number> = {};
        storeyElements.filter(e => e.origin === 'native').forEach(e => { byType[e.type] = (byType[e.type] || 0) + 1; });
        return byType;
      })(),
    },
  ];

  const allTypes = Array.from(new Set(storeyElements.map(e => e.type)));

  return (
    <div style={{
      margin: '0 8px 6px 36px', border: '1px solid #374151',
      borderRadius: 6, overflow: 'hidden', fontSize: 11
    }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #374151' }}>
        {columns.map(col => (
          <div key={col.fileId} style={{ flex: 1, padding: '5px 8px', borderRight: '1px solid #374151' }}>
            <div style={{ fontWeight: 600, color: '#E5E7EB', fontSize: 11 }}>
              {col.fileId === 'native' ? 'Native' : `${storey.localName} (${storey.elevation}m)`}
            </div>
            <div style={{ color: '#6B7280', fontSize: 10 }}>
              {col.filename} · {col.count} el.
            </div>
          </div>
        ))}
      </div>
      {allTypes.length > 0 ? (
        <div style={{ display: 'flex' }}>
          {columns.map(col => (
            <div key={col.fileId} style={{ flex: 1, padding: '4px 8px', borderRight: '1px solid #374151' }}>
              {allTypes.map(type => (
                col.byType[type] ? (
                  <div key={type} style={{ display: 'flex', justifyContent: 'space-between', color: '#D1D5DB', fontSize: 11, lineHeight: '20px' }}>
                    <span style={{ textTransform: 'capitalize' }}>{type}</span>
                    <span style={{ color: '#9CA3AF' }}>×{col.byType[type]}</span>
                  </div>
                ) : null
              ))}
              {Object.keys(col.byType).length === 0 && (
                <div style={{ color: '#4B5563', fontStyle: 'italic', fontSize: 11, lineHeight: '20px' }}>no elements yet</div>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

// ─── Element Group List ──────────────────────────────────────────────────────

const ElementGroupList = ({
  storeyId,
  elements,
}: {
  storeyId: string;
  elements: import('./types').ElementNode[];
}) => {
  const storeyEls = elements.filter(e => e.storeyId === storeyId);
  const byType: Record<string, import('./types').ElementNode[]> = {};
  storeyEls.forEach(e => {
    if (!byType[e.type]) byType[e.type] = [];
    byType[e.type].push(e);
  });

  return (
    <>
      {Object.entries(byType).map(([type, els]) => {
        const allNative = els.every(e => e.origin === 'native');
        const allIfc = els.every(e => e.origin === 'ifc');
        const editable = els.every(e => e.editable);
        return (
          <div
            key={type}
            style={{
              display: 'flex', alignItems: 'center', height: 26,
              paddingLeft: 40, paddingRight: 10, gap: 5, cursor: 'default'
            }}
            className="hover:bg-zinc-700/30"
          >
            <span style={{ flex: 1, fontSize: 11, color: '#D1D5DB', textTransform: 'capitalize' }}>
              {type} <span style={{ color: '#6B7280' }}>(×{els.length})</span>
            </span>
            {allNative && <NativeBadge />}
            {allIfc && <IfcBadge />}
            {!editable && <LockIcon />}
          </div>
        );
      })}
      {storeyEls.length === 0 && (
        <div style={{ paddingLeft: 40, fontSize: 11, color: '#4B5563', fontStyle: 'italic', lineHeight: '24px' }}>
          no elements
        </div>
      )}
    </>
  );
};

// ─── Storey Row ──────────────────────────────────────────────────────────────

const StoreyRow = ({
  storey,
  isActive,
  isExpanded,
  isHidden,
  renamingId,
  elements,
  ifcFiles,
  dispatch,
}: {
  storey: StoreyNode;
  isActive: boolean;
  isExpanded: boolean;
  isHidden: boolean;
  renamingId: string | null;
  elements: import('./types').ElementNode[];
  ifcFiles: IfcFileNode[];
  dispatch: React.Dispatch<AppAction>;
}) => {
  const [renameValue, setRenameValue] = useState(storey.localName);
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isUnassigned = storey.id === 'storey-unassigned';
  const isRenaming = renamingId === storey.id;
  const isMerged = storey.sourceFileIds.length > 1;

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  useEffect(() => {
    setRenameValue(storey.localName);
  }, [storey.localName]);

  const elevStr = storey.elevation !== null ? `(${storey.elevation}m)` : '';

  let rowBg = 'transparent';
  let borderColor = 'transparent';
  if (isActive && storey.origin === 'native') { rowBg = 'rgba(107,63,212,0.15)'; borderColor = '#6B3FD4'; }
  if (isActive && storey.origin === 'ifc') { rowBg = 'rgba(254,243,199,0.12)'; borderColor = '#B45309'; }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    dispatch({ type: 'OPEN_CONTEXT_MENU', payload: { storeyId: storey.id, x: e.clientX, y: e.clientY } });
  };

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({ type: 'TOGGLE_STOREY_EXPAND', payload: storey.id });
  };

  const handleRowClick = () => {
    dispatch({ type: 'SET_ACTIVE_STOREY', payload: storey.id });
  };

  const handleDoubleClick = () => {
    setRenameValue(storey.localName);
  };

  const saveRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed) dispatch({ type: 'RENAME_STOREY', payload: { storeyId: storey.id, name: trimmed } });
    else dispatch({ type: 'RENAME_STOREY', payload: { storeyId: storey.id, name: storey.localName } });
  };

  const cancelRename = () => {
    setRenameValue(storey.localName);
    dispatch({ type: 'RENAME_STOREY', payload: { storeyId: storey.id, name: storey.localName } });
  };

  return (
    <>
      <div
        style={{
          display: 'flex', alignItems: 'center', height: 30,
          paddingLeft: 26, paddingRight: 8, gap: 4,
          borderLeft: `3px solid ${borderColor}`,
          background: hovered && !isActive ? 'rgba(255,255,255,0.04)' : rowBg,
          opacity: isHidden ? 0.3 : 1,
          cursor: 'pointer', userSelect: 'none', transition: 'background 100ms',
        }}
        onClick={handleRowClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Chevron */}
        <button
          onClick={handleChevronClick}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#9CA3AF', display: 'flex', alignItems: 'center', flexShrink: 0 }}
        >
          <ChevronIcon open={isExpanded} />
        </button>

        {/* Storey icon */}
        <StoreyIcon origin={storey.origin} dashed={isUnassigned} />

        {/* Name */}
        {isRenaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') saveRename();
              if (e.key === 'Escape') cancelRename();
              e.stopPropagation();
            }}
            onBlur={saveRename}
            onClick={e => e.stopPropagation()}
            style={{
              flex: 1, fontSize: 12, background: 'rgba(107,63,212,0.25)',
              border: '1px solid #6B3FD4', borderRadius: 3, color: '#E5E7EB',
              padding: '1px 4px', outline: 'none'
            }}
          />
        ) : (
          <span
            onDoubleClick={e => { e.stopPropagation(); handleDoubleClick(); }}
            style={{
              flex: 1, fontSize: 12,
              color: isUnassigned ? '#6B7280' : (isActive ? (storey.origin === 'native' ? '#A78BFA' : '#D97706') : '#E5E7EB'),
              fontWeight: isActive ? 600 : 400,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}
          >
            {isUnassigned ? storey.localName : `${storey.localName} ${elevStr}`}
          </span>
        )}

        {/* Element count */}
        {storey.elementCount > 0 && !isActive && (
          <span style={{ fontSize: 10, color: '#6B7280' }}>{storey.elementCount}</span>
        )}

        {/* Origin badge */}
        {storey.origin === 'native' && !isMerged && <NativeBadge />}
        {storey.origin === 'ifc' && !isMerged && <IfcBadge />}
        {isMerged && <IfcBadge count={storey.sourceFileIds.length} />}

        {/* Active badge */}
        {isActive && <ActiveBadge origin={storey.origin} />}

        {/* Lock icon */}
        {!storey.editable && !isUnassigned && <LockIcon />}

        {/* Eye icon - on hover */}
        {hovered && !isRenaming && (
          <button
            onClick={e => { e.stopPropagation(); /* toggle storey visible if wired */ }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1, color: '#9CA3AF', display: 'flex', alignItems: 'center' }}
          >
            <EyeIcon visible={storey.visible} />
          </button>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <>
          <ElementGroupList storeyId={storey.id} elements={elements} />
          {isMerged && (
            <SourceBreakdownPanel storey={storey} ifcFiles={ifcFiles} elements={elements} />
          )}
        </>
      )}
    </>
  );
};

// ─── IFC File Row ────────────────────────────────────────────────────────────

const IfcFileRow = ({
  file,
  dispatch,
}: {
  file: IfcFileNode;
  dispatch: React.Dispatch<AppAction>;
}) => {
  const [hovered, setHovered] = useState(false);

  const statusColor =
    file.status === 'ok' ? '#1D9E75' :
    file.status === 'outdated' ? '#EF9F27' : '#EF4444';

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', height: 30, paddingLeft: 12, paddingRight: 10, gap: 7,
        background: hovered ? 'rgba(255,255,255,0.04)' : 'transparent', cursor: 'default'
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Amber dot */}
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#F59E0B', flexShrink: 0 }} />

      {/* Filename */}
      <span style={{ flex: 1, fontSize: 11, color: file.visible ? '#D1D5DB' : '#4B5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {file.filename}
      </span>

      {/* Status dot */}
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />

      {/* Element count */}
      <span style={{ fontSize: 10, color: '#6B7280', minWidth: 24, textAlign: 'right' }}>{file.elementCount}</span>

      {/* Toggle */}
      <ToggleSwitch
        on={file.visible}
        onChange={() => dispatch({ type: 'TOGGLE_IFC_VISIBLE', payload: file.id })}
      />
    </div>
  );
};

// ─── Context Menu ────────────────────────────────────────────────────────────

const StoreyContextMenu = ({
  menu,
  storey,
  activeStoreyId,
  storeys,
  dispatch,
}: {
  menu: ContextMenuState;
  storey: StoreyNode | undefined;
  activeStoreyId: string;
  storeys: StoreyNode[];
  dispatch: React.Dispatch<AppAction>;
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = () => dispatch({ type: 'CLOSE_CONTEXT_MENU' });
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dispatch({ type: 'CLOSE_CONTEXT_MENU' }); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey); };
  }, [dispatch]);

  if (!storey) return null;

  const isAlreadyActive = storey.id === activeStoreyId;
  const idx = storeys.findIndex(s => s.id === storey.id);

  const MenuItem = ({
    label, onClick, disabled, danger, checked,
  }: { label: string; onClick?: () => void; disabled?: boolean; danger?: boolean; checked?: boolean }) => (
    <button
      onClick={() => { onClick?.(); dispatch({ type: 'CLOSE_CONTEXT_MENU' }); }}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        width: '100%', padding: '5px 12px', textAlign: 'left', border: 'none',
        background: 'none', cursor: disabled ? 'default' : 'pointer', fontSize: 12,
        color: danger ? '#EF4444' : disabled ? '#4B5563' : '#E5E7EB',
      }}
      className={!disabled && !danger ? 'hover:bg-zinc-700' : ''}
    >
      {checked && <span style={{ fontSize: 10, color: '#6B3FD4' }}>✓</span>}
      {!checked && <span style={{ width: 14 }} />}
      {label}
    </button>
  );

  const Divider = () => <div style={{ height: 1, background: '#374151', margin: '3px 0' }} />;

  return (
    <div
      ref={ref}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed', left: menu.x, top: menu.y, zIndex: 50,
        width: 188, background: '#1F2937', border: '1px solid #374151',
        borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        padding: '4px 0', overflow: 'hidden'
      }}
    >
      <MenuItem
        label="Set as active"
        checked={isAlreadyActive}
        disabled={isAlreadyActive}
        onClick={() => dispatch({ type: 'SET_ACTIVE_STOREY', payload: storey.id })}
      />
      <MenuItem
        label="Add level above"
        onClick={() => {
          const prevIdx = Math.max(0, idx - 1);
          const prevStorey = storeys[prevIdx];
          const elevation = (storey.elevation ?? 0) - 3;
          dispatch({ type: 'ADD_NATIVE_STOREY', payload: { afterStoreyId: prevStorey.id, elevation } });
        }}
      />
      <MenuItem
        label="Add level below"
        onClick={() => {
          const elevation = (storey.elevation ?? 0) + 3;
          dispatch({ type: 'ADD_NATIVE_STOREY', payload: { afterStoreyId: storey.id, elevation } });
        }}
      />
      <Divider />
      <MenuItem
        label="Rename"
        onClick={() => {
          dispatch({ type: 'CLOSE_CONTEXT_MENU' });
        }}
      />
      {storey.origin === 'ifc' && (
        <>
          <Divider />
          <MenuItem label="Hide IFC file" onClick={() => {}} />
          <MenuItem label="Re-import IFC file" onClick={() => {}} />
          <MenuItem label="Unlink IFC file…" danger onClick={() => {}} />
        </>
      )}
    </div>
  );
};

// ─── Panel Header ────────────────────────────────────────────────────────────

const PanelHeader = ({
  projectName,
  buildingName,
  activeStoreyName,
  search,
  onSearch,
}: {
  projectName: string;
  buildingName: string;
  activeStoreyName: string;
  search: string;
  onSearch: (v: string) => void;
}) => (
  <div style={{ background: '#6B3FD4', padding: '10px 12px', flexShrink: 0 }}>
    <div style={{ fontSize: 13, fontWeight: 500, color: '#fff', letterSpacing: '0.04em' }}>PROJECT BROWSER</div>
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{projectName}</span>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>›</span>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{buildingName}</span>
      {activeStoreyName && (
        <>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>›</span>
          <span style={{ fontSize: 11, color: '#fff', fontWeight: 500 }}>{activeStoreyName}</span>
        </>
      )}
    </div>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
      background: 'rgba(255,255,255,0.15)', borderRadius: 6, padding: '5px 10px'
    }}>
      <SearchIcon />
      <input
        value={search}
        onChange={e => onSearch(e.target.value)}
        placeholder="Search everything..."
        style={{
          flex: 1, background: 'none', border: 'none', outline: 'none',
          fontSize: 12, color: '#fff', caretColor: '#fff'
        }}
      />
    </div>
  </div>
);

// ─── Add Level Button ────────────────────────────────────────────────────────

const AddLevelButton = ({ onAdd }: { onAdd: () => void }) => (
  <button
    onClick={onAdd}
    style={{
      display: 'flex', alignItems: 'center', gap: 6,
      paddingLeft: 36, height: 28, background: 'none', border: 'none',
      cursor: 'pointer', width: '100%', fontSize: 11, color: '#6B7280',
    }}
    className="hover:text-purple-400"
  >
    <span style={{ fontSize: 14, lineHeight: 1 }}>⊕</span>
    <span>Add level</span>
  </button>
);

// ─── Root Component ──────────────────────────────────────────────────────────

export const ProjectBrowser: React.FC = () => {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    expandedStoreyIds: new Set<string>(),
    contextMenu: null,
    renamingStoreyId: null,
  } as AppStateWithUI);

  const [search, setSearch] = useState('');

  const activeStorey = state.storeys.find(s => s.id === state.activeStoreyId);

  const totalElements = state.storeys.reduce((acc, s) => acc + s.elementCount, 0);

  const hiddenFileIds = new Set(state.ifcFiles.filter(f => !f.visible).map(f => f.id));

  const isStoreyHidden = (storey: StoreyNode) =>
    storey.sourceFileIds.length > 0 &&
    storey.sourceFileIds.every(id => hiddenFileIds.has(id));

  const filteredStoreys = search
    ? state.storeys.filter(s => s.localName.toLowerCase().includes(search.toLowerCase()))
    : state.storeys;

  const linkedFiles = state.ifcFiles.length;

  const elementTypes = new Set(state.elements.map(e => e.type));

  const handleAddLevel = () => {
    const lastStorey = state.storeys[state.storeys.length - 2] ?? state.storeys[0];
    const elevation = (lastStorey?.elevation ?? 0) + 3;
    dispatch({ type: 'ADD_NATIVE_STOREY', payload: { afterStoreyId: lastStorey?.id ?? '', elevation } });
  };

  const contextStorey = state.contextMenu
    ? state.storeys.find(s => s.id === state.contextMenu!.storeyId)
    : undefined;

  return (
    <div style={{
      width: 260, height: '100vh', display: 'flex', flexDirection: 'column',
      background: '#111827', borderRight: '1px solid #1F2937',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      color: '#E5E7EB', position: 'relative', overflow: 'hidden'
    }}>
      {/* Header */}
      <PanelHeader
        projectName={state.projectName}
        buildingName={state.building.name}
        activeStoreyName={activeStorey?.localName ?? ''}
        search={search}
        onSearch={setSearch}
      />

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>

        {/* PROJECT section */}
        <SectionHeader
          label="PROJECT"
          count={`${filteredStoreys.length} levels · ${totalElements.toLocaleString()} el.`}
          dot="purple"
        />

        {/* Site */}
        <div style={{ display: 'flex', alignItems: 'center', height: 28, paddingLeft: 16, gap: 6 }}>
          <SiteIcon />
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>{state.site.name}</span>
        </div>

        {/* Building */}
        <div style={{ display: 'flex', alignItems: 'center', height: 28, paddingLeft: 10, gap: 6 }}>
          <button
            onClick={() => {}}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', display: 'flex', padding: 2 }}
          >
            <ChevronIcon open={true} />
          </button>
          <BuildingIcon />
          <span style={{ fontSize: 12, color: '#D1D5DB', fontWeight: 500 }}>{state.building.name}</span>
        </div>

        {/* Storey rows */}
        {filteredStoreys.map(storey => (
          <StoreyRow
            key={storey.id}
            storey={storey}
            isActive={storey.id === state.activeStoreyId}
            isExpanded={state.expandedStoreyIds.has(storey.id)}
            isHidden={isStoreyHidden(storey)}
            renamingId={state.renamingStoreyId}
            elements={state.elements}
            ifcFiles={state.ifcFiles}
            dispatch={dispatch}
          />
        ))}

        {/* Add level */}
        <AddLevelButton onAdd={handleAddLevel} />

        {/* ELEMENTS section */}
        <div style={{ marginTop: 8 }}>
          <SectionHeader
            label="ELEMENTS"
            count={`${elementTypes.size} types`}
            dot="purple"
          />
        </div>

        {/* IFC FILES section */}
        <div style={{ marginTop: 4 }}>
          <SectionHeader
            label="IFC FILES"
            count={`${linkedFiles} linked`}
            dot="amber"
          />
          {state.ifcFiles.map(file => (
            <IfcFileRow key={file.id} file={file} dispatch={dispatch} />
          ))}
        </div>

        <div style={{ height: 16 }} />
      </div>

      {/* Context Menu */}
      {state.contextMenu && (
        <StoreyContextMenu
          menu={state.contextMenu}
          storey={contextStorey}
          activeStoreyId={state.activeStoreyId}
          storeys={state.storeys}
          dispatch={dispatch}
        />
      )}
    </div>
  );
};
