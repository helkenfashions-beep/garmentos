import React from 'react';

// Tool IDs — shared with PatternCanvas
export const TOOLS = {
  SELECT:  'select',
  POINT:   'point',
  LINE:    'line',
  BEZIER:  'bezier',
};

const TOOL_DEFS = [
  {
    id: TOOLS.SELECT,
    label: 'Select',
    shortcut: 'S',
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
        <path d="M3 1l10 6.5L9 9l-1.5 4.5L3 1z"/>
      </svg>
    ),
  },
  {
    id: TOOLS.POINT,
    label: 'Point',
    shortcut: 'P',
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
        <circle cx="8" cy="8" r="3"/>
        <line x1="8" y1="1" x2="8" y2="4" stroke="currentColor" strokeWidth="1.5"/>
        <line x1="8" y1="12" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5"/>
        <line x1="1" y1="8" x2="4" y2="8" stroke="currentColor" strokeWidth="1.5"/>
        <line x1="12" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    id: TOOLS.LINE,
    label: 'Line',
    shortcut: 'L',
    icon: (
      <svg viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5" fill="none" width="16" height="16">
        <circle cx="3" cy="13" r="1.5" fill="currentColor" stroke="none"/>
        <circle cx="13" cy="3" r="1.5" fill="currentColor" stroke="none"/>
        <line x1="3" y1="13" x2="13" y2="3"/>
      </svg>
    ),
  },
  {
    id: TOOLS.BEZIER,
    label: 'Bezier',
    shortcut: 'B',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
        <circle cx="2" cy="14" r="1.5" fill="currentColor" stroke="none"/>
        <circle cx="14" cy="2" r="1.5" fill="currentColor" stroke="none"/>
        <path d="M2 14 C2 4, 14 12, 14 2"/>
        <circle cx="2" cy="4" r="1" fill="none" strokeDasharray="2 1"/>
        <circle cx="14" cy="12" r="1" fill="none" strokeDasharray="2 1"/>
      </svg>
    ),
  },
];

export default function Toolbar({ activeTool, onToolChange, showGrid, onToggleGrid, onUndo, onRedo, canUndo, canRedo }) {
  return (
    <aside
      style={{
        width: 48,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        padding: '8px 4px',
        backgroundColor: 'var(--color-panel)',
        borderRight: '1px solid var(--color-border)',
        flexShrink: 0,
      }}
    >
      {/* Drawing tools */}
      {TOOL_DEFS.map(tool => (
        <ToolButton
          key={tool.id}
          active={activeTool === tool.id}
          title={`${tool.label} (${tool.shortcut})`}
          onClick={() => onToolChange(tool.id)}
        >
          {tool.icon}
        </ToolButton>
      ))}

      {/* Divider */}
      <div style={{ width: 28, height: 1, backgroundColor: 'var(--color-border)', margin: '6px 0' }} />

      {/* Grid toggle */}
      <ToolButton
        active={showGrid}
        title="Toggle grid (G)"
        onClick={onToggleGrid}
      >
        <GridIcon />
      </ToolButton>

      {/* Divider */}
      <div style={{ width: 28, height: 1, backgroundColor: 'var(--color-border)', margin: '6px 0' }} />

      {/* Undo */}
      <ToolButton
        active={false}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        onClick={onUndo}
      >
        <UndoIcon />
      </ToolButton>

      {/* Redo */}
      <ToolButton
        active={false}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
        onClick={onRedo}
      >
        <RedoIcon />
      </ToolButton>
    </aside>
  );
}

// ── Internal sub-components ──────────────────────────────────────────────────

function ToolButton({ children, active, disabled, title, onClick }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
        border: active ? '1px solid var(--color-accent)' : '1px solid transparent',
        backgroundColor: active ? 'var(--color-accent-dim)' : 'transparent',
        color: disabled ? 'var(--color-text-muted)' : active ? 'var(--color-accent-fg)' : 'var(--color-text-dim)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 120ms, color 120ms, border-color 120ms',
        flexShrink: 0,
      }}
      onMouseEnter={e => {
        if (!active && !disabled) {
          e.currentTarget.style.backgroundColor = 'var(--color-surface-2)';
          e.currentTarget.style.color = 'var(--color-text)';
        }
      }}
      onMouseLeave={e => {
        if (!active && !disabled) {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = 'var(--color-text-dim)';
        }
      }}
    >
      {children}
    </button>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1" fill="none" width="16" height="16">
      <line x1="5" y1="1" x2="5" y2="15"/>
      <line x1="11" y1="1" x2="11" y2="15"/>
      <line x1="1" y1="5" x2="15" y2="5"/>
      <line x1="1" y1="11" x2="15" y2="11"/>
      <rect x="1" y="1" width="14" height="14" strokeWidth="1.5"/>
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
      <path d="M3.5 4.5L1 7l2.5 2.5V8a5 5 0 1 1 5 5H7v1.5h1.5a6.5 6.5 0 1 0-6.5-6.5v-3.5z"/>
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16" style={{ transform: 'scaleX(-1)' }}>
      <path d="M3.5 4.5L1 7l2.5 2.5V8a5 5 0 1 1 5 5H7v1.5h1.5a6.5 6.5 0 1 0-6.5-6.5v-3.5z"/>
    </svg>
  );
}
