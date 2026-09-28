import { useState, useRef, useCallback, useEffect } from 'react';
import Toolbar, { TOOLS } from './components/Toolbar';
import PatternCanvas from './components/PatternCanvas';
import MannequinViewer from './components/MannequinViewer';
import MeasurementPanel from './components/MeasurementPanel';
import BlockPanel from './components/BlockPanel';
import MenuSheet from './components/MenuSheet';
import { BODY_TYPES } from './lib/options';
import { useMeasurements } from './hooks/useMeasurements';
import { generateTrouserBlock } from './lib/blocks/trouserBlock';
import {
  autosave, loadAutosave, clearAutosave, downloadPattern, readPatternFile,
} from './lib/storage/patternFile';

// ─── Screen size ──────────────────────────────────────────────────────────────
function useScreen() {
  const get = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [s, setS] = useState(get);
  useEffect(() => {
    const on = () => setS(get());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on); };
  }, []);
  return s;
}

// ─── Install prompt (Android Chrome "Add to home screen") ────────────────────
function useInstallPrompt() {
  const [evt, setEvt] = useState(null);
  useEffect(() => {
    const on = (e) => { e.preventDefault(); setEvt(e); };
    window.addEventListener('beforeinstallprompt', on);
    const done = () => setEvt(null);
    window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', on); window.removeEventListener('appinstalled', done); };
  }, []);
  const install = useCallback(async () => {
    if (!evt) return;
    evt.prompt();
    await evt.userChoice.catch(() => null);
    setEvt(null);
  }, [evt]);
  return { canInstall: !!evt, install };
}

/** True when the canvas still holds exactly this generated block (no hand edits). */
function isUneditedBlock(pat, block) {
  const a = pat.points, b = block.points;
  const ids = Object.keys(b);
  if (Object.keys(a).length !== ids.length) return false;
  for (const id of ids) {
    if (!a[id] || Math.abs(a[id].x - b[id].x) > 1e-6 || Math.abs(a[id].y - b[id].y) > 1e-6) return false;
  }
  for (const [id, sg] of Object.entries(block.segments)) {
    const cur = pat.segments[id];
    if (!cur || cur.p1 !== sg.p1 || cur.p2 !== sg.p2) return false;
    if (sg.type === 'bezier' && (Math.abs(cur.c1.x - sg.c1.x) > 1e-6 || Math.abs(cur.c1.y - sg.c1.y) > 1e-6 ||
      Math.abs(cur.c2.x - sg.c2.x) > 1e-6 || Math.abs(cur.c2.y - sg.c2.y) > 1e-6)) return false;
  }
  return Object.keys(pat.segments).length === Object.keys(block.segments).length;
}

const TOOL_LABELS = {
  [TOOLS.SELECT]: 'Select',
  [TOOLS.POINT]:  'Place Point',
  [TOOLS.LINE]:   'Draw Line',
  [TOOLS.BEZIER]: 'Draw Bezier',
  [TOOLS.RECT]:   'Draw Rectangle',
  [TOOLS.CIRCLE]: 'Draw Circle',
};

export default function App() {
  const screen  = useScreen();
  // Phone UI (menu sheet, bottom toolbar, no side panels) for narrow screens
  // AND for phones held sideways. Portrait phones stack 2D above 3D.
  const isPhone = screen.w < 760 || screen.h < 520;
  const stacked = isPhone && screen.h > screen.w;
  const compact = isPhone;

  // ── Restore last session from this device ─────────────────────────────────
  const [restored] = useState(() => loadAutosave());

  // ── Canvas state ──────────────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState(TOOLS.SELECT);
  const [showGrid,   setShowGrid]   = useState(true);
  const [cursor,     setCursor]     = useState({ x: 0, y: 0 });
  const [histState,  setHistState]  = useState({ canUndo: false, canRedo: false });
  const canvasRef = useRef(null);

  // ── Measurements, body, fabric ────────────────────────────────────────────
  const { measurements, updateMeasurement, replaceMeasurements } = useMeasurements(restored?.measurements);
  const [measurementsKey, setMeasurementsKey] = useState(0);
  const prevMeasRef = useRef(measurements);          // measurements the canvas block was drawn from
  const [needsApply, setNeedsApply] = useState(false);
  const [bodyType, setBodyType] = useState(restored?.bodyType ?? 'male_adult');
  const [fabricColor, setFabricColor] = useState(null);
  const [patternName, setPatternName] = useState(restored?.name ?? 'Untitled pattern');
  const [patternState, setPatternState] = useState(null);
  const handlePatternChange = useCallback((ps) => setPatternState(ps), []);

  // ── Layout ────────────────────────────────────────────────────────────────
  const [viewMode,         setViewMode]         = useState('split');  // 'split' | '2d' | '3d'
  const [splitRatio,       setSplitRatio]       = useState(stacked ? 52 : 60);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [menuOpen,         setMenuOpen]         = useState(false);
  const [measureOpen,      setMeasureOpen]      = useState(false);   // phone drawer
  const [toast,            setToast]            = useState(null);
  const { canInstall, install } = useInstallPrompt();

  const workspaceRef = useRef(null);
  const fileInputRef = useRef(null);

  const toastTimer = useRef(0);
  const say = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // ── Restore pattern into the canvas once it has mounted ───────────────────
  const restoreDone = useRef(false);
  useEffect(() => {
    if (restoreDone.current) return;
    restoreDone.current = true;
    if (restored?.pattern && Object.keys(restored.pattern.points).length) {
      canvasRef.current?.loadPattern(restored.pattern);
    }
  }, [restored]);

  // ── Autosave on every change (pattern emits debounced) ────────────────────
  useEffect(() => {
    if (!patternState) return;
    autosave({ pattern: patternState, measurements, bodyType, name: patternName });
  }, [patternState, measurements, bodyType, patternName]);

  // ── Split divider (mouse + touch) ─────────────────────────────────────────
  const dividerRef = useRef(null);
  function onDividerPointerDown(e) {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    dividerRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, ratio: splitRatio };
  }
  function onDividerPointerMove(e) {
    const d = dividerRef.current;
    if (!d || d.id !== e.pointerId) return;
    const box = workspaceRef.current?.getBoundingClientRect();
    if (!box) return;
    const delta = stacked ? (e.clientY - d.y) / box.height * 100 : (e.clientX - d.x) / box.width * 100;
    setSplitRatio(Math.max(20, Math.min(80, d.ratio + delta)));
  }
  function onDividerPointerUp(e) {
    if (dividerRef.current?.id === e.pointerId) dividerRef.current = null;
  }

  // ── Toolbar actions ───────────────────────────────────────────────────────
  const handleToolChange = useCallback((tool) => setActiveTool(tool), []);
  const handleToggleGrid = useCallback(() => setShowGrid(v => !v), []);
  const handleUndo       = useCallback(() => canvasRef.current?.undo?.(), []);
  const handleRedo       = useCallback(() => canvasRef.current?.redo?.(), []);
  const handleFit        = useCallback(() => canvasRef.current?.fitView?.(), []);

  // ── Block generation ──────────────────────────────────────────────────────
  const handleGenerate = useCallback((blockType, garmentType) => {
    if (blockType === 'trouser') {
      const { points, segments, pieces } = generateTrouserBlock(measurements, garmentType);
      canvasRef.current?.loadBlock(points, segments, pieces);
      prevMeasRef.current = measurements;
      setNeedsApply(false);
      setMenuOpen(false);
      say('Trouser block generated');
    }
  }, [measurements, say]);
  const handleClearCanvas = useCallback(() => canvasRef.current?.clearCanvas?.(), []);

  // ── Live measurements → 2D block + 3D body ────────────────────────────────
  // The body rebuilds on every change (MannequinViewer). The block is redrawn
  // too, unless the pattern has hand edits: then we offer "Apply to pattern"
  // instead of silently throwing the edits away.
  const firstMeasRun = useRef(true);
  useEffect(() => {
    if (firstMeasRun.current) { firstMeasRun.current = false; return; }
    const timer = setTimeout(() => {
      const prev = prevMeasRef.current;
      prevMeasRef.current = measurements;
      const pat = canvasRef.current?.getPattern();
      const fit = pat?.pieces?.['trouser-front']?.fit;
      if (!pat || !fit) return;                          // no generated block on the canvas
      if (isUneditedBlock(pat, generateTrouserBlock(prev, fit))) {
        const { points, segments, pieces } = generateTrouserBlock(measurements, fit);
        canvasRef.current?.loadBlock(points, segments, pieces, { fit: false });
        setNeedsApply(false);
      } else {
        setNeedsApply(true);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [measurements]);

  // The drawer changes the pattern panel's size (and hides the toolbar's Fit
  // button), so refit the pattern whenever it opens or closes.
  useEffect(() => {
    const t = setTimeout(() => canvasRef.current?.fitView?.(), 80);
    return () => clearTimeout(t);
  }, [measureOpen]);

  const handleApplyMeasurements = useCallback(() => {
    const pat = canvasRef.current?.getPattern();
    const fit = pat?.pieces?.['trouser-front']?.fit ?? 'trouser';
    const { points, segments, pieces } = generateTrouserBlock(measurements, fit);
    canvasRef.current?.loadBlock(points, segments, pieces, { fit: false });
    setNeedsApply(false);
    say('Block redrawn from measurements');
  }, [measurements, say]);

  // ── 3D → 2D: seam point dragged on the body ───────────────────────────────
  const handleHandleDrag = useCallback((pointId, x, y, commit) => {
    canvasRef.current?.movePoint(pointId, x, y, commit);
  }, []);

  // ── Files ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const pattern = canvasRef.current?.getPattern();
    downloadPattern({ pattern, measurements, bodyType, name: patternName });
    say('Saved to your downloads');
  }, [measurements, bodyType, patternName, say]);

  const handleOpen = useCallback(() => fileInputRef.current?.click(), []);

  const onFilePicked = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = await readPatternFile(file);
      if (data.measurements) { replaceMeasurements(data.measurements); setMeasurementsKey(k => k + 1); }
      if (data.bodyType) setBodyType(data.bodyType);
      setPatternName(data.name);
      canvasRef.current?.loadPattern(data.pattern);
      setMenuOpen(false);
      say(`Opened “${data.name}”`);
    } catch (err) {
      say(err.message || 'Could not open that file');
    }
  }, [replaceMeasurements, say]);

  const handleNew = useCallback(() => {
    canvasRef.current?.clearCanvas();
    setPatternName('Untitled pattern');
    clearAutosave();
    setMenuOpen(false);
  }, []);

  const handleMeasurementChange = useCallback((k, v) => updateMeasurement(k, v), [updateMeasurement]);

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); handleSave(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); handleOpen(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case 's': setActiveTool(TOOLS.SELECT); break;
        case 'p': setActiveTool(TOOLS.POINT);  break;
        case 'l': setActiveTool(TOOLS.LINE);   break;
        case 'b': setActiveTool(TOOLS.BEZIER); break;
        case 'r': setActiveTool(TOOLS.RECT);   break;
        case 'c': setActiveTool(TOOLS.CIRCLE); break;
        case 'g': setShowGrid(v => !v);        break;
        case 'f': handleFit();                 break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSave, handleOpen, handleFit]);

  // ── Panel visibility (both stay mounted so no work is ever lost) ──────────
  const showCanvas    = viewMode !== '3d';
  const showMannequin = viewMode !== '2d';
  const isEmpty = !patternState || Object.keys(patternState.points).length === 0;

  const seg = (mode) => ({
    padding: compact ? '0 12px' : '3px 10px',
    height: compact ? 34 : 'auto',
    fontSize: compact ? 12 : 10,
    fontFamily: 'var(--font-mono)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    backgroundColor: viewMode === mode ? 'var(--color-accent-dim)' : 'transparent',
    color: viewMode === mode ? '#fff' : 'var(--color-text-dim)',
    border: viewMode === mode ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
    borderRadius: 6,
    cursor: 'pointer',
  });

  const headerBtn = {
    padding: '3px 10px', fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
    letterSpacing: '0.06em', backgroundColor: 'transparent', color: 'var(--color-text-dim)',
    border: '1px solid var(--color-border)', borderRadius: 4, cursor: 'pointer',
  };

  const panelFlex = (mine) => (viewMode === 'split' ? `${mine} 1 0` : '1 1 auto');

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: '100%', height: '100%', overflow: 'hidden',
      backgroundColor: 'var(--color-canvas)',
    }}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header style={{
        height: compact ? 50 : 38,
        paddingTop: 'env(safe-area-inset-top)',
        display: 'flex', alignItems: 'center',
        padding: compact ? '0 10px' : '0 16px',
        backgroundColor: 'var(--color-panel)',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0, gap: compact ? 8 : 12,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-accent)', letterSpacing: '0.04em', userSelect: 'none' }}>
          GarmentOS
        </span>
        {!isPhone && (
          <>
            <span style={{ color: 'var(--color-border)', fontSize: 11 }}>|</span>
            <span style={{ color: 'var(--color-text-dim)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {patternName}
            </span>
          </>
        )}

        <div style={{ flex: 1 }} />

        <div role="group" aria-label="View" style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {['2d', 'split', '3d'].map(mode => (
            <button key={mode} data-testid={`view-${mode}`} onClick={() => setViewMode(mode)} style={seg(mode)}>
              {mode === 'split' ? (isPhone ? '2D+3D' : '2D | 3D') : mode}
            </button>
          ))}
        </div>

        {!isPhone && (
          <>
            <span style={{ color: 'var(--color-border)', fontSize: 11 }}>|</span>
            <select
              value={bodyType}
              onChange={e => setBodyType(e.target.value)}
              style={{ ...headerBtn, backgroundColor: 'var(--color-surface)', textTransform: 'none' }}
            >
              {BODY_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
            <button data-testid="measure-toggle" onClick={() => setShowMeasurements(v => !v)} style={{
              ...headerBtn,
              backgroundColor: showMeasurements ? 'var(--color-accent-dim)' : 'transparent',
              color: showMeasurements ? 'var(--color-accent)' : 'var(--color-text-dim)',
              borderColor: showMeasurements ? 'var(--color-accent)' : 'var(--color-border)',
            }}>Measurements</button>
            <button onClick={handleOpen} style={headerBtn}>Open</button>
            <button onClick={handleSave} style={headerBtn}>Save</button>
          </>
        )}

        {isPhone && (
          <button
            data-testid="measure-open"
            aria-label="Measurements"
            aria-pressed={measureOpen}
            onClick={() => setMeasureOpen(v => !v)}
            style={{
              width: 42, height: 38, borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${measureOpen ? 'var(--color-accent)' : 'var(--color-border)'}`,
              background: measureOpen ? 'var(--color-accent-dim)' : 'var(--color-surface-2)',
              color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <rect x="2" y="6" width="16" height="8" rx="1.5" />
              <path d="M5 6v3M8 6v4M11 6v3M14 6v4" />
            </svg>
          </button>
        )}

        <button
          data-testid="menu-open"
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
          style={{
            width: compact ? 42 : 30, height: compact ? 38 : 26, borderRadius: 6,
            border: '1px solid var(--color-border)', background: 'var(--color-surface-2)',
            color: 'var(--color-text)', cursor: 'pointer', fontSize: compact ? 18 : 14,
          }}
        >☰</button>
      </header>

      {/* ── Main workspace ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'row', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {!isPhone && showCanvas && (
          <Toolbar
            activeTool={activeTool} onToolChange={handleToolChange}
            showGrid={showGrid} onToggleGrid={handleToggleGrid}
            onUndo={handleUndo} onRedo={handleRedo} onFit={handleFit}
            canUndo={histState.canUndo} canRedo={histState.canRedo}
          />
        )}
        {!isPhone && showCanvas && <BlockPanel onGenerate={handleGenerate} onClear={handleClearCanvas} />}

      {/* Split area: percentages are of THIS box, not the whole row */}
      <div
        ref={workspaceRef}
        style={{ display: 'flex', flexDirection: stacked ? 'column' : 'row', flex: 1, overflow: 'hidden', minHeight: 0, minWidth: 0 }}
      >

        {/* ── 2D canvas panel (kept mounted in 3D mode so edits are never lost) */}
        <div style={{
          flex: panelFlex(splitRatio),
          display: showCanvas ? 'block' : 'none',
          position: 'relative', overflow: 'hidden', minWidth: 0, minHeight: 0,
        }}>
          <PatternCanvas
            ref={canvasRef}
            activeTool={activeTool}
            showGrid={showGrid}
            onCursorMove={setCursor}
            onHistoryChange={setHistState}
            onPatternChange={handlePatternChange}
          />
          {isEmpty && (
            <div data-testid="empty-hint" style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none', padding: 24,
            }}>
              <div style={{
                maxWidth: 300, textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 13, lineHeight: 1.5,
                background: 'rgba(22,27,34,0.85)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '14px 16px',
              }}>
                Start a pattern: open the menu <span style={{ color: 'var(--color-text)' }}>☰</span> and generate a trouser block,
                or draw a closed shape with the tools. It wraps onto the body on the {stacked ? 'bottom' : 'right'} as you draw.
                <div style={{ marginTop: 10, pointerEvents: 'auto' }}>
                  <button
                    data-testid="quick-generate"
                    onClick={() => handleGenerate('trouser', 'trouser')}
                    style={{
                      minHeight: 40, padding: '0 14px', borderRadius: 8, border: '1px solid var(--color-accent)',
                      background: 'var(--color-accent-dim)', color: '#fff', fontSize: 13, cursor: 'pointer',
                    }}
                  >Generate trouser block</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Draggable divider ─────────────────────────────────────────── */}
        {viewMode === 'split' && (
          <div
            data-testid="divider"
            role="separator"
            aria-orientation={stacked ? 'horizontal' : 'vertical'}
            onPointerDown={onDividerPointerDown}
            onPointerMove={onDividerPointerMove}
            onPointerUp={onDividerPointerUp}
            onPointerCancel={onDividerPointerUp}
            style={{
              [stacked ? 'height' : 'width']: stacked ? 14 : (isPhone ? 14 : 6),
              flexShrink: 0,
              backgroundColor: 'var(--color-panel)',
              borderTop: stacked ? '1px solid var(--color-border)' : 'none',
              borderBottom: stacked ? '1px solid var(--color-border)' : 'none',
              borderLeft: stacked ? 'none' : '1px solid var(--color-border)',
              borderRight: stacked || !isPhone ? 'none' : '1px solid var(--color-border)',
              cursor: stacked ? 'row-resize' : 'col-resize',
              touchAction: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 1,
            }}
          >
            <div style={{
              [stacked ? 'width' : 'height']: 36, [stacked ? 'height' : 'width']: 3,
              borderRadius: 2, background: 'var(--color-text-muted)',
            }} />
          </div>
        )}

        {/* ── 3D mannequin panel ────────────────────────────────────────── */}
        <div style={{
          flex: panelFlex(100 - splitRatio),
          display: showMannequin ? 'block' : 'none',
          position: 'relative', overflow: 'hidden', minWidth: 0, minHeight: 0,
        }}>
          <MannequinViewer
            measurements={measurements}
            patternState={patternState}
            bodyType={bodyType}
            fabricColor={fabricColor}
            onHandleDrag={handleHandleDrag}
            compact={compact}
          />
          {!isPhone && showMeasurements && (
            <MeasurementPanel
              key={measurementsKey}
              measurements={measurements}
              onChange={handleMeasurementChange}
              onClose={() => setShowMeasurements(false)}
              needsApply={needsApply}
              onApply={handleApplyMeasurements}
            />
          )}
        </div>
      </div>
      </div>

      {/* ── Measurements drawer (phone): sits BELOW the views, so the 2D and 3D
           stay visible and update while you type ─────────────────────────── */}
      {isPhone && measureOpen && (
        <div style={{ flex: stacked ? '0 0 40%' : '0 0 48%', minHeight: 0 }}>
          <MeasurementPanel
            key={measurementsKey}
            drawer
            measurements={measurements}
            onChange={handleMeasurementChange}
            onClose={() => setMeasureOpen(false)}
            needsApply={needsApply}
            onApply={handleApplyMeasurements}
          />
        </div>
      )}

      {/* ── Bottom toolbar (phone) ───────────────────────────────────────── */}
      {isPhone && showCanvas && !measureOpen && (
        <Toolbar
          horizontal
          activeTool={activeTool} onToolChange={handleToolChange}
          showGrid={showGrid} onToggleGrid={handleToggleGrid}
          onUndo={handleUndo} onRedo={handleRedo} onFit={handleFit}
          canUndo={histState.canUndo} canRedo={histState.canRedo}
        />
      )}

      {/* ── Status bar (desktop) ─────────────────────────────────────────── */}
      {!isPhone && (
        <footer style={{
          height: 24, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 20,
          backgroundColor: 'var(--color-panel)', borderTop: '1px solid var(--color-border)',
          flexShrink: 0, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-dim)', userSelect: 'none',
        }}>
          {showCanvas && (
            <>
              <span style={{ color: 'var(--color-accent)' }}>{TOOL_LABELS[activeTool]}</span>
              <span style={{ color: 'var(--color-border)' }}>|</span>
              <span>
                X: <span style={{ color: 'var(--color-text)' }}>{cursor.x.toFixed(1)}</span>mm{' '}
                Y: <span style={{ color: 'var(--color-text)' }}>{cursor.y.toFixed(1)}</span>mm
              </span>
              <span style={{ color: 'var(--color-border)' }}>|</span>
            </>
          )}
          {showMannequin && (
            <>
              <span style={{ color: 'var(--color-text-muted)' }}>3D — drag body to rotate · drag orange points to edit the pattern</span>
              <span style={{ color: 'var(--color-border)' }}>|</span>
            </>
          )}
          <span style={{ color: 'var(--color-text-muted)' }}>S P L B R C — tools &nbsp; G grid &nbsp; F fit &nbsp; Ctrl+Z undo</span>
        </footer>
      )}

      <input
        ref={fileInputRef} type="file" accept=".json,application/json" data-testid="file-input"
        onChange={onFilePicked} style={{ display: 'none' }}
      />

      <MenuSheet
        open={menuOpen}
        side={stacked ? 'bottom' : 'right'}
        onClose={() => setMenuOpen(false)}
        patternName={patternName} onRename={setPatternName}
        onNew={handleNew} onOpen={handleOpen} onSave={handleSave}
        onGenerate={handleGenerate}
        measurements={measurements} onMeasurementChange={handleMeasurementChange} measurementsKey={measurementsKey}
        needsApply={needsApply} onApply={handleApplyMeasurements}
        bodyType={bodyType} onBodyType={setBodyType}
        fabricColor={fabricColor} onFabric={setFabricColor}
        canInstall={canInstall} onInstall={install}
      />

      {toast && (
        <div role="status" data-testid="toast" style={{
          position: 'fixed', left: '50%', bottom: isPhone ? 76 : 40, transform: 'translateX(-50%)',
          background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)',
          borderRadius: 8, padding: '10px 14px', fontSize: 13, zIndex: 60, boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
          maxWidth: '90vw',
        }}>{toast}</div>
      )}
    </div>
  );
}
