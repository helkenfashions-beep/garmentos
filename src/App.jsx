import { useState, useRef, useCallback, useEffect } from 'react';
import Toolbar, { TOOLS } from './components/Toolbar';
import PatternCanvas from './components/PatternCanvas';
import MannequinViewer from './components/MannequinViewer';
import MeasurementPanel from './components/MeasurementPanel';
import BlockPanel from './components/BlockPanel';
import { useMeasurements } from './hooks/useMeasurements';
import { generateTrouserBlock } from './lib/blocks/trouserBlock';

export default function App() {
  // ── Canvas state ──────────────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState(TOOLS.SELECT);
  const [showGrid,   setShowGrid]   = useState(true);
  const [cursor,     setCursor]     = useState({ x: 0, y: 0 });
  const [histState,  setHistState]  = useState({ canUndo: false, canRedo: false });
  const canvasRef = useRef(null);

  // ── Measurements & 3D sync ────────────────────────────────────────────────
  const { measurements, updateMeasurement } = useMeasurements();
  const [patternState, setPatternState] = useState(null);
  const handlePatternChange = useCallback((ps) => setPatternState(ps), []);
  const [bodyType, setBodyType] = useState('male_adult');

  // ── Layout ────────────────────────────────────────────────────────────────
  // viewMode: 'split' | '2d' | '3d'
  const [viewMode,          setViewMode]          = useState('split');
  const [splitRatio,        setSplitRatio]        = useState(60);   // % for canvas panel
  const [showMeasurements,  setShowMeasurements]  = useState(false);

  // Divider drag
  const dividerDragging = useRef(false);
  const dividerStartX   = useRef(0);
  const dividerStartRatio = useRef(60);
  const workspaceRef    = useRef(null);

  useEffect(() => {
    function onMove(e) {
      if (!dividerDragging.current) return;
      const container = workspaceRef.current;
      if (!container) return;
      const containerW = container.clientWidth;
      const dx    = e.clientX - dividerStartX.current;
      const delta = (dx / containerW) * 100;
      setSplitRatio(Math.max(20, Math.min(80, dividerStartRatio.current + delta)));
    }
    function onUp() { dividerDragging.current = false; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  function onDividerMouseDown(e) {
    e.preventDefault();
    dividerDragging.current   = true;
    dividerStartX.current     = e.clientX;
    dividerStartRatio.current = splitRatio;
  }

  // ── Toolbar actions ───────────────────────────────────────────────────────
  const handleToolChange = useCallback((tool) => setActiveTool(tool), []);
  const handleToggleGrid  = useCallback(() => setShowGrid(v => !v), []);
  const handleUndo        = useCallback(() => canvasRef.current?.undo?.(), []);
  const handleRedo        = useCallback(() => canvasRef.current?.redo?.(), []);

  // ── Block generation ──────────────────────────────────────────────────────
  const handleGenerate = useCallback((blockType, garmentType) => {
    if (blockType === 'trouser') {
      const { points, segments } = generateTrouserBlock(measurements, garmentType);
      canvasRef.current?.loadBlock(points, segments);
    }
  }, [measurements]);
  const handleClearCanvas = useCallback(() => canvasRef.current?.clearCanvas?.(), []);

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
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
        case 'r': setActiveTool(TOOLS.RECT);   break;
        case 'c': setActiveTool(TOOLS.CIRCLE); break;
        case 'g': setShowGrid(v => !v);        break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const TOOL_LABELS = {
    [TOOLS.SELECT]: 'Select',
    [TOOLS.POINT]:  'Place Point',
    [TOOLS.LINE]:   'Draw Line',
    [TOOLS.BEZIER]: 'Draw Bezier',
    [TOOLS.RECT]:   'Draw Rectangle',
    [TOOLS.CIRCLE]: 'Draw Circle',
  };

  // ── Panel visibility ──────────────────────────────────────────────────────
  const showCanvas   = viewMode !== '3d';
  const showMannequin = viewMode !== '2d';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      backgroundColor: 'var(--color-canvas)',
    }}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header style={{
        height: 38,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        backgroundColor: 'var(--color-panel)',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
        gap: 12,
      }}>
        <span style={{
          fontSize: 13, fontWeight: 600,
          color: 'var(--color-accent)',
          letterSpacing: '0.04em', userSelect: 'none',
        }}>
          GarmentOS
        </span>
        <span style={{ color: 'var(--color-border)', fontSize: 11 }}>|</span>
        <span style={{ color: 'var(--color-text-dim)', fontSize: 12 }}>
          Pattern Editor — Stage 2
        </span>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* View mode toggle */}
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {['2d', 'split', '3d'].map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '3px 10px',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                backgroundColor: viewMode === mode ? 'var(--color-accent-dim)' : 'transparent',
                color: viewMode === mode ? 'var(--color-accent)' : 'var(--color-text-dim)',
                border: viewMode === mode ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {mode === 'split' ? '2D | 3D' : mode}
            </button>
          ))}
        </div>

        {/* Body type selector — only when 3D panel is visible */}
        {showMannequin && (
          <>
            <span style={{ color: 'var(--color-border)', fontSize: 11 }}>|</span>
            <select
              value={bodyType}
              onChange={e => setBodyType(e.target.value)}
              style={{
                padding: '3px 6px', fontSize: 10,
                fontFamily: 'var(--font-mono)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-dim)',
                border: '1px solid var(--color-border)',
                borderRadius: 4, cursor: 'pointer',
              }}
            >
              <option value="male_adult">Adult Male</option>
              <option value="female_adult">Adult Female</option>
              <option value="male_child">Child Boy</option>
              <option value="female_child">Child Girl</option>
            </select>
          </>
        )}

        {/* Measurements toggle — only when 3D panel is visible */}
        {showMannequin && (
          <>
            <span style={{ color: 'var(--color-border)', fontSize: 11 }}>|</span>
            <button
              onClick={() => setShowMeasurements(v => !v)}
              style={{
                padding: '3px 10px',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                backgroundColor: showMeasurements ? 'var(--color-accent-dim)' : 'transparent',
                color: showMeasurements ? 'var(--color-accent)' : 'var(--color-text-dim)',
                border: showMeasurements ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Measurements
            </button>
          </>
        )}
      </header>

      {/* ── Main workspace ───────────────────────────────────────────────── */}
      <div ref={workspaceRef} style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left toolbar — only in 2D or split */}
        {showCanvas && (
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
        )}

        {/* Block panel — only in 2D or split */}
        {showCanvas && (
          <BlockPanel
            onGenerate={handleGenerate}
            onClear={handleClearCanvas}
          />
        )}

        {/* ── 2D canvas panel ──────────────────────────────────────────── */}
        {showCanvas && (
          <div style={{
            flex:     viewMode === '2d' ? 1 : `0 0 ${splitRatio}%`,
            position: 'relative',
            overflow: 'hidden',
          }}>
            <PatternCanvas
              ref={canvasRef}
              activeTool={activeTool}
              showGrid={showGrid}
              onCursorMove={setCursor}
              onHistoryChange={setHistState}
              onPatternChange={handlePatternChange}
            />
          </div>
        )}

        {/* ── Draggable divider ─────────────────────────────────────────── */}
        {viewMode === 'split' && (
          <div
            onMouseDown={onDividerMouseDown}
            style={{
              width: 5,
              flexShrink: 0,
              backgroundColor: 'var(--color-border)',
              cursor: 'col-resize',
              transition: 'background-color 120ms',
              position: 'relative',
              zIndex: 1,
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--color-accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--color-border)'; }}
          />
        )}

        {/* ── 3D mannequin panel ────────────────────────────────────────── */}
        {showMannequin && (
          <div style={{
            flex:     viewMode === '3d' ? 1 : `0 0 ${100 - splitRatio}%`,
            position: 'relative',
            overflow: 'hidden',
          }}>
            <MannequinViewer
              measurements={measurements}
              patternState={patternState}
              bodyType={bodyType}
            />

            {/* Measurement panel overlay */}
            {showMeasurements && (
              <MeasurementPanel
                measurements={measurements}
                onChange={updateMeasurement}
                onClose={() => setShowMeasurements(false)}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Status bar ───────────────────────────────────────────────────── */}
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
        {showCanvas && (
          <>
            <span style={{ color: 'var(--color-accent)' }}>{TOOL_LABELS[activeTool]}</span>
            <span style={{ color: 'var(--color-border)' }}>|</span>
            <span>
              X: <span style={{ color: 'var(--color-text)' }}>{cursor.x.toFixed(1)}</span>mm
              {' '}
              Y: <span style={{ color: 'var(--color-text)' }}>{cursor.y.toFixed(1)}</span>mm
            </span>
            <span style={{ color: 'var(--color-border)' }}>|</span>
          </>
        )}
        {showMannequin && (
          <>
            <span style={{ color: 'var(--color-text-muted)' }}>
              3D — drag to rotate · scroll to zoom · click Measurements to adjust body
            </span>
            <span style={{ color: 'var(--color-border)' }}>|</span>
          </>
        )}
        <span style={{ color: 'var(--color-text-muted)' }}>
          S P L B R C — tools &nbsp; G — grid &nbsp; Ctrl+Z — undo &nbsp; Esc — cancel
        </span>
      </footer>
    </div>
  );
}
