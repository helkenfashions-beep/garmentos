import { useState, useRef, useCallback, useEffect } from 'react';
import Toolbar, { TOOLS } from './components/Toolbar';
import PatternCanvas from './components/PatternCanvas';

export default function App() {
  const [activeTool, setActiveTool] = useState(TOOLS.SELECT);
  const [showGrid,   setShowGrid]   = useState(true);
  const [cursor,     setCursor]     = useState({ x: 0, y: 0 });
  const [histState,  setHistState]  = useState({ canUndo: false, canRedo: false });

  // Ref to canvas imperative API (undo/redo)
  const canvasRef = useRef(null);

  const handleToolChange = useCallback((tool) => setActiveTool(tool), []);
  const handleToggleGrid  = useCallback(() => setShowGrid(v => !v), []);
  const handleUndo        = useCallback(() => canvasRef.current?.undo?.(), []);
  const handleRedo        = useCallback(() => canvasRef.current?.redo?.(), []);

  // Global keyboard shortcuts for tool switching
  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case 's': setActiveTool(TOOLS.SELECT); break;
        case 'p': setActiveTool(TOOLS.POINT);  break;
        case 'l': setActiveTool(TOOLS.LINE);   break;
        case 'b': setActiveTool(TOOLS.BEZIER); break;
        case 'g': setShowGrid(v => !v);        break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Tool label for status bar
  const TOOL_LABELS = {
    [TOOLS.SELECT]: 'Select',
    [TOOLS.POINT]:  'Place Point',
    [TOOLS.LINE]:   'Draw Line',
    [TOOLS.BEZIER]: 'Draw Bezier Curve',
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      backgroundColor: 'var(--color-canvas)',
    }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header style={{
        height: 38,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        backgroundColor: 'var(--color-panel)',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
        gap: 16,
      }}>
        <span style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--color-accent)',
          letterSpacing: '0.04em',
          userSelect: 'none',
        }}>
          GarmentOS
        </span>
        <span style={{ color: 'var(--color-border)', fontSize: 11 }}>|</span>
        <span style={{ color: 'var(--color-text-dim)', fontSize: 12 }}>
          Pattern Editor — Stage 1
        </span>
      </header>

      {/* ── Main workspace ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left toolbar */}
        <Toolbar
          activeTool={activeTool}
          onToolChange={handleToolChange}
          showGrid={showGrid}
          onToggleGrid={handleToggleGrid}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={histState.canUndo}
          canRedo={histState.canRedo}
        />

        {/* Canvas area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <PatternCanvas
            ref={canvasRef}
            activeTool={activeTool}
            showGrid={showGrid}
            onCursorMove={setCursor}
            onHistoryChange={setHistState}
          />
        </div>
      </div>

      {/* ── Status bar ──────────────────────────────────────────────────── */}
      <footer style={{
        height: 24,
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 20,
        backgroundColor: 'var(--color-panel)',
        borderTop: '1px solid var(--color-border)',
        flexShrink: 0,
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        color: 'var(--color-text-dim)',
        userSelect: 'none',
      }}>
        <span style={{ color: 'var(--color-accent)' }}>
          {TOOL_LABELS[activeTool]}
        </span>
        <span style={{ color: 'var(--color-border)' }}>|</span>
        <span>
          X: <span style={{ color: 'var(--color-text)' }}>{cursor.x.toFixed(1)}</span>mm
          {' '}
          Y: <span style={{ color: 'var(--color-text)' }}>{cursor.y.toFixed(1)}</span>mm
        </span>
        <span style={{ color: 'var(--color-border)' }}>|</span>
        <span style={{ color: 'var(--color-text-muted)' }}>
          S — Select &nbsp; P — Point &nbsp; L — Line &nbsp; B — Bezier &nbsp; G — Grid &nbsp; Ctrl+Z — Undo &nbsp; Esc — Cancel
        </span>
      </footer>
    </div>
  );
}
