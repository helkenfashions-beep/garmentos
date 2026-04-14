import React, { useRef, useCallback, useEffect, useReducer, useState, useImperativeHandle } from 'react';
import {
  dist,
  findSnap,
  screenToCanvas,
  formatMm,
  lineLength,
  bezierLength,
  defaultControlPoints,
  isNearLine,
  isNearBezier,
  visibleGridLines,
  newId,
} from '../utils/geometry';
import { TOOLS } from './Toolbar';

// ─── Constants ──────────────────────────────────────────────────────────────

const SNAP_RADIUS_SCREEN = 10;  // px — converted to mm on use
const POINT_RADIUS = 5;         // visual radius of anchor points (px)
const HIT_RADIUS_SCREEN = 8;    // px — for clicking near segments

// ─── History reducer ─────────────────────────────────────────────────────────

const INITIAL_PATTERN = {
  points:   {},
  segments: {},
  selected: new Set(),
};

function patternReducer(state, action) {
  switch (action.type) {
    case 'ADD_POINT': {
      const { id, x, y } = action;
      return { ...state, points: { ...state.points, [id]: { id, x, y } } };
    }
    case 'ADD_SEGMENT': {
      const seg = action.segment;
      return { ...state, segments: { ...state.segments, [seg.id]: seg } };
    }
    case 'MOVE_POINT': {
      // Non-history: live drag preview
      const { id, x, y } = action;
      return { ...state, points: { ...state.points, [id]: { ...state.points[id], x, y } } };
    }
    case 'COMMIT_MOVE': {
      // History-tracked version of MOVE_POINT — used on mouseUp to push to undo stack
      const { id, x, y } = action;
      return { ...state, points: { ...state.points, [id]: { ...state.points[id], x, y } } };
    }
    case 'MOVE_CONTROL': {
      // Non-history: live control handle drag
      const { segId, handle, x, y } = action; // handle: 'c1' | 'c2'
      const seg = state.segments[segId];
      return {
        ...state,
        segments: { ...state.segments, [segId]: { ...seg, [handle]: { x, y } } },
      };
    }
    case 'SET_SELECTED': {
      return { ...state, selected: new Set(action.ids) };
    }
    case 'DELETE_SELECTED': {
      const toDelete = new Set(action.ids);
      const points   = { ...state.points };
      const segments = { ...state.segments };
      // Remove points
      for (const id of toDelete) {
        if (points[id]) delete points[id];
      }
      // Remove segments that reference deleted points
      for (const [id, seg] of Object.entries(segments)) {
        if (toDelete.has(seg.p1) || toDelete.has(seg.p2)) delete segments[id];
      }
      return { ...state, points, segments, selected: new Set() };
    }
    case 'RESET':
      return { ...INITIAL_PATTERN, selected: new Set() };
    default:
      return state;
  }
}

// useHistoryReducer wraps patternReducer with undo/redo
function useHistoryReducer() {
  const [history, setHistory] = useState({
    past:    [],
    present: INITIAL_PATTERN,
    future:  [],
  });

  const dispatch = useCallback((action) => {
    // Non-history actions update present only
    const NON_HISTORY = new Set(['MOVE_POINT', 'MOVE_CONTROL', 'SET_SELECTED']);
    if (NON_HISTORY.has(action.type)) {
      setHistory(h => ({
        ...h,
        present: patternReducer(h.present, action),
      }));
      return;
    }
    // History-pushing actions
    setHistory(h => ({
      past:    [...h.past, h.present],
      present: patternReducer(h.present, action),
      future:  [],
    }));
  }, []);

  const undo = useCallback(() => {
    setHistory(h => {
      if (h.past.length === 0) return h;
      const past    = [...h.past];
      const present = past.pop();
      return { past, present, future: [h.present, ...h.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory(h => {
      if (h.future.length === 0) return h;
      const future  = [...h.future];
      const present = future.shift();
      return { past: [...h.past, h.present], present, future };
    });
  }, []);

  return {
    state:    history.present,
    dispatch,
    undo,
    redo,
    canUndo:  history.past.length > 0,
    canRedo:  history.future.length > 0,
  };
}

// ─── PatternCanvas ────────────────────────────────────────────────────────────

export default function PatternCanvas({
  activeTool,
  showGrid,
  onCursorMove,
  onHistoryChange,
  ref,
}) {
  const svgRef         = useRef(null);
  const { state, dispatch, undo, redo, canUndo, canRedo } = useHistoryReducer();

  // Expose undo/redo to parent via ref (React 19 — ref as plain prop, useImperativeHandle)
  useImperativeHandle(ref, () => ({ undo, redo, canUndo, canRedo }), [undo, redo, canUndo, canRedo]);

  // Report history state up for toolbar buttons
  useEffect(() => {
    onHistoryChange?.({ canUndo, canRedo });
  }, [canUndo, canRedo, onHistoryChange]);

  // Viewport: x,y = top-left corner in mm, scale = px per mm
  const [viewport, setViewport] = useState({ x: -10, y: -10, scale: 2.0 });

  // Live cursor in mm
  const [cursor, setCursor] = useState({ x: 0, y: 0 });

  // Snap state
  const [snapTarget, setSnapTarget] = useState(null); // { point, id } | null

  // First click when drawing a segment (point id)
  const [pendingStart, setPendingStart] = useState(null);

  // Drag state — refs to avoid stale closures
  const dragState = useRef(null);
  // dragState shape:
  //   { type: 'pan', startScreen, startViewport }
  //   { type: 'point', pointId, startCanvas }
  //   { type: 'control', segId, handle, startCanvas }

  // Dimensions of the SVG element
  const [svgSize, setSvgSize] = useState({ w: 800, h: 600 });

  // ── Resize observer ──────────────────────────────────────────────────────
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSvgSize({ w: width, h: height });
      }
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  // ── Wheel zoom — must be non-passive ─────────────────────────────────────
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    function onWheel(e) {
      e.preventDefault();
      const rect   = svg.getBoundingClientRect();
      // Point under cursor in mm before zoom
      const mx = (e.clientX - rect.left) / viewport.scale + viewport.x;
      const my = (e.clientY - rect.top)  / viewport.scale + viewport.y;

      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newScale = Math.max(0.2, Math.min(20, viewport.scale * factor));

      // Adjust origin so the point under cursor stays fixed
      setViewport({
        scale: newScale,
        x: mx - (e.clientX - rect.left) / newScale,
        y: my - (e.clientY - rect.top)  / newScale,
      });
    }

    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [viewport]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }

      if (e.key === 'Escape') {
        setPendingStart(null);
        dispatch({ type: 'SET_SELECTED', ids: [] });
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selected.size > 0) {
          dispatch({ type: 'DELETE_SELECTED', ids: [...state.selected] });
        }
        return;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, dispatch, state.selected]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getSvgRect  = () => svgRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
  const snapRadiusMm = () => SNAP_RADIUS_SCREEN / viewport.scale;
  const hitRadiusMm  = () => HIT_RADIUS_SCREEN  / viewport.scale;

  function toCanvas(screenX, screenY) {
    return screenToCanvas(screenX, screenY, getSvgRect(), viewport);
  }

  // ── Mouse handlers ────────────────────────────────────────────────────────

  function onMouseMove(e) {
    const pt = toCanvas(e.clientX, e.clientY);
    setCursor(pt);
    onCursorMove?.(pt);

    // Update snap indicator
    const snap = findSnap(pt, state.points, snapRadiusMm());
    setSnapTarget(snap.snapped ? snap : null);

    // Handle active drags
    const ds = dragState.current;
    if (!ds) return;

    if (ds.type === 'pan') {
      setViewport(v => ({
        ...v,
        x: ds.startViewport.x - (e.clientX - ds.startScreen.x) / v.scale,
        y: ds.startViewport.y - (e.clientY - ds.startScreen.y) / v.scale,
      }));
      return;
    }

    if (ds.type === 'point') {
      const snap2 = findSnap(pt, state.points, snapRadiusMm());
      const final  = snap2.snapped && snap2.id !== ds.pointId ? snap2.point : pt;
      dispatch({ type: 'MOVE_POINT', id: ds.pointId, x: final.x, y: final.y });
      return;
    }

    if (ds.type === 'control') {
      dispatch({ type: 'MOVE_CONTROL', segId: ds.segId, handle: ds.handle, x: pt.x, y: pt.y });
      return;
    }
  }

  function onMouseDown(e) {
    const pt = toCanvas(e.clientX, e.clientY);

    // Middle mouse or Alt+left = pan
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      dragState.current = {
        type: 'pan',
        startScreen: { x: e.clientX, y: e.clientY },
        startViewport: { x: viewport.x, y: viewport.y },
      };
      return;
    }

    if (e.button !== 0) return;

    const snap = findSnap(pt, state.points, snapRadiusMm());
    const finalPt = snap.snapped ? snap.point : pt;

    // ── Select tool ─────────────────────────────────────────────────────────
    if (activeTool === TOOLS.SELECT) {
      // Check if we clicked a point
      if (snap.snapped) {
        dispatch({ type: 'SET_SELECTED', ids: [snap.id] });
        dragState.current = {
          type: 'point',
          pointId: snap.id,
          startCanvas: finalPt,
        };
        return;
      }

      // Check if we clicked a control handle
      for (const [segId, seg] of Object.entries(state.segments)) {
        if (seg.type !== 'bezier') continue;
        const selIds = [...state.selected];
        if (!selIds.includes(seg.p1) && !selIds.includes(seg.p2)) continue;
        for (const handle of ['c1', 'c2']) {
          if (seg[handle] && dist(pt, seg[handle]) <= hitRadiusMm()) {
            dragState.current = { type: 'control', segId, handle };
            return;
          }
        }
      }

      // Check if we clicked a segment
      for (const [segId, seg] of Object.entries(state.segments)) {
        const p1 = state.points[seg.p1];
        const p2 = state.points[seg.p2];
        if (!p1 || !p2) continue;
        let hit = false;
        if (seg.type === 'line') {
          hit = isNearLine(pt, p1, p2, hitRadiusMm());
        } else if (seg.type === 'bezier') {
          hit = isNearBezier(pt, p1, seg.c1, seg.c2, p2, hitRadiusMm());
        }
        if (hit) {
          dispatch({ type: 'SET_SELECTED', ids: [seg.p1, seg.p2] });
          return;
        }
      }

      // Clicked empty space
      dispatch({ type: 'SET_SELECTED', ids: [] });
      return;
    }

    // ── Point tool ──────────────────────────────────────────────────────────
    if (activeTool === TOOLS.POINT) {
      if (snap.snapped) return; // don't create on top of existing
      const id = newId('pt');
      dispatch({ type: 'ADD_POINT', id, x: pt.x, y: pt.y });
      return;
    }

    // ── Line tool ───────────────────────────────────────────────────────────
    if (activeTool === TOOLS.LINE || activeTool === TOOLS.BEZIER) {
      if (pendingStart === null) {
        // First click — set start point
        if (snap.snapped) {
          setPendingStart(snap.id);
        } else {
          const id = newId('pt');
          dispatch({ type: 'ADD_POINT', id, x: pt.x, y: pt.y });
          setPendingStart(id);
        }
        return;
      }

      // Second click — create segment
      let endId;
      if (snap.snapped && snap.id !== pendingStart) {
        endId = snap.id;
      } else if (!snap.snapped) {
        endId = newId('pt');
        dispatch({ type: 'ADD_POINT', id: endId, x: pt.x, y: pt.y });
      } else {
        // Clicked same point — cancel
        setPendingStart(null);
        return;
      }

      const startPt = state.points[pendingStart];
      const endPt   = finalPt;

      const segId = newId('seg');
      if (activeTool === TOOLS.LINE) {
        dispatch({ type: 'ADD_SEGMENT', segment: { id: segId, type: 'line', p1: pendingStart, p2: endId } });
      } else {
        const { c1, c2 } = defaultControlPoints(startPt, endPt);
        dispatch({ type: 'ADD_SEGMENT', segment: { id: segId, type: 'bezier', p1: pendingStart, p2: endId, c1, c2 } });
      }

      // Chain: new start is the end point of this segment
      setPendingStart(endId);
      return;
    }
  }

  function onMouseUp(e) {
    const ds = dragState.current;
    dragState.current = null;
    if (ds?.type === 'point') {
      // Commit the drag into history by re-dispatching with history action
      const pt = state.points[ds.pointId];
      if (pt) {
        dispatch({ type: 'COMMIT_MOVE', id: ds.pointId, x: pt.x, y: pt.y });
      }
    }
  }

  function onContextMenu(e) {
    e.preventDefault();
    // Right click cancels pending segment
    setPendingStart(null);
    dispatch({ type: 'SET_SELECTED', ids: [] });
  }

  // ── Grid rendering ────────────────────────────────────────────────────────

  function renderGrid() {
    if (!showGrid) return null;

    // Choose grid spacing based on scale
    let spacing = 10; // 10mm = 1cm default
    if (viewport.scale < 0.5) spacing = 50;
    else if (viewport.scale < 1)  spacing = 20;
    else if (viewport.scale > 8)  spacing = 5;

    const { xLines, yLines } = visibleGridLines(viewport, svgSize.w, svgSize.h, spacing);
    const sw = 1 / viewport.scale; // consistent visual weight regardless of zoom

    return (
      <g style={{ pointerEvents: 'none' }}>
        {xLines.map(x => (
          <line
            key={`gx${x}`}
            x1={x} y1={viewport.y}
            x2={x} y2={viewport.y + svgSize.h / viewport.scale}
            stroke={x === 0 ? '#3d4450' : '#1e242c'}
            strokeWidth={sw}
          />
        ))}
        {yLines.map(y => (
          <line
            key={`gy${y}`}
            x1={viewport.x} y1={y}
            x2={viewport.x + svgSize.w / viewport.scale} y2={y}
            stroke={y === 0 ? '#3d4450' : '#1e242c'}
            strokeWidth={sw}
          />
        ))}
      </g>
    );
  }

  // ── Segment rendering ─────────────────────────────────────────────────────

  function renderSegments() {
    const sw = 1.5 / viewport.scale;
    const segs = Object.values(state.segments);
    const selIds = state.selected;

    return segs.map(seg => {
      const p1 = state.points[seg.p1];
      const p2 = state.points[seg.p2];
      if (!p1 || !p2) return null;

      const selected = selIds.has(seg.p1) && selIds.has(seg.p2);
      const color    = seg.type === 'bezier' ? 'var(--color-bezier)' : 'var(--color-line)';

      if (seg.type === 'line') {
        return (
          <g key={seg.id}>
            <line
              x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke={color}
              strokeWidth={selected ? sw * 2 : sw}
            />
            {selected && (
              <MeasurementLabel
                x={(p1.x + p2.x) / 2}
                y={(p1.y + p2.y) / 2}
                label={formatMm(lineLength(p1, p2))}
                scale={viewport.scale}
              />
            )}
          </g>
        );
      }

      if (seg.type === 'bezier') {
        return (
          <g key={seg.id}>
            <path
              d={`M${p1.x},${p1.y} C${seg.c1.x},${seg.c1.y} ${seg.c2.x},${seg.c2.y} ${p2.x},${p2.y}`}
              stroke={color}
              strokeWidth={selected ? sw * 2 : sw}
              fill="none"
            />
            {selected && (
              <>
                {/* Control handles */}
                <ControlHandle
                  anchor={p1} control={seg.c1}
                  scale={viewport.scale}
                />
                <ControlHandle
                  anchor={p2} control={seg.c2}
                  scale={viewport.scale}
                />
                <MeasurementLabel
                  x={(p1.x + p2.x) / 2}
                  y={(p1.y + p2.y) / 2 - 10 / viewport.scale}
                  label={formatMm(bezierLength(p1, seg.c1, seg.c2, p2))}
                  scale={viewport.scale}
                />
              </>
            )}
          </g>
        );
      }

      return null;
    });
  }

  // ── Preview line while drawing ────────────────────────────────────────────

  function renderPreview() {
    if (!pendingStart) return null;
    const startPt = state.points[pendingStart];
    if (!startPt) return null;

    const endPt = snapTarget?.point ?? cursor;
    const sw    = 1 / viewport.scale;

    return (
      <line
        x1={startPt.x} y1={startPt.y}
        x2={endPt.x}   y2={endPt.y}
        stroke="var(--color-text-muted)"
        strokeWidth={sw}
        strokeDasharray={`${4 / viewport.scale} ${3 / viewport.scale}`}
        style={{ pointerEvents: 'none' }}
      />
    );
  }

  // ── Point rendering ───────────────────────────────────────────────────────

  function renderPoints() {
    const r  = POINT_RADIUS / viewport.scale;
    const sw = 1.5 / viewport.scale;

    return Object.values(state.points).map(pt => {
      const selected = state.selected.has(pt.id);
      return (
        <circle
          key={pt.id}
          cx={pt.x} cy={pt.y}
          r={r}
          fill={selected ? 'var(--color-point-sel)' : 'var(--color-point)'}
          stroke="var(--color-canvas)"
          strokeWidth={sw}
          style={{ cursor: activeTool === TOOLS.SELECT ? 'move' : 'crosshair' }}
        />
      );
    });
  }

  // ── Snap indicator ────────────────────────────────────────────────────────

  function renderSnapIndicator() {
    if (!snapTarget) return null;
    const r  = (POINT_RADIUS + 4) / viewport.scale;
    const sw = 1.5 / viewport.scale;
    return (
      <circle
        cx={snapTarget.point.x} cy={snapTarget.point.y}
        r={r}
        fill="none"
        stroke="var(--color-snap)"
        strokeWidth={sw}
        style={{ pointerEvents: 'none' }}
      />
    );
  }

  // ── Cursor crosshair (only when drawing) ─────────────────────────────────

  function renderCrosshair() {
    if (activeTool === TOOLS.SELECT) return null;
    const size = 8 / viewport.scale;
    const sw   = 1 / viewport.scale;
    return (
      <g style={{ pointerEvents: 'none' }}>
        <line
          x1={cursor.x - size} y1={cursor.y}
          x2={cursor.x + size} y2={cursor.y}
          stroke="var(--color-text-dim)" strokeWidth={sw}
        />
        <line
          x1={cursor.x} y1={cursor.y - size}
          x2={cursor.x} y2={cursor.y + size}
          stroke="var(--color-text-dim)" strokeWidth={sw}
        />
      </g>
    );
  }

  // ── Determine SVG cursor style ────────────────────────────────────────────

  const cursorStyle = activeTool === TOOLS.SELECT
    ? (dragState.current?.type === 'pan' ? 'grabbing' : 'default')
    : 'crosshair';

  // ── Compute viewBox ───────────────────────────────────────────────────────

  const vbW  = svgSize.w / viewport.scale;
  const vbH  = svgSize.h / viewport.scale;
  const viewBox = `${viewport.x} ${viewport.y} ${vbW} ${vbH}`;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        backgroundColor: 'var(--color-canvas)',
        cursor: cursorStyle,
        userSelect: 'none',
      }}
      onMouseMove={onMouseMove}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseLeave={() => { dragState.current = null; }}
      onContextMenu={onContextMenu}
    >
      {renderGrid()}
      {renderSegments()}
      {renderPreview()}
      {renderPoints()}
      {renderSnapIndicator()}
      {renderCrosshair()}
    </svg>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ControlHandle({ anchor, control, scale }) {
  const sw = 1 / scale;
  const r  = 3.5 / scale;
  return (
    <g style={{ pointerEvents: 'none' }}>
      <line
        x1={anchor.x} y1={anchor.y}
        x2={control.x} y2={control.y}
        stroke="var(--color-control)"
        strokeWidth={sw}
        strokeDasharray={`${3 / scale} ${2 / scale}`}
      />
      <circle
        cx={control.x} cy={control.y}
        r={r}
        fill="var(--color-control)"
        stroke="var(--color-canvas)"
        strokeWidth={sw}
        style={{ pointerEvents: 'all', cursor: 'move' }}
      />
    </g>
  );
}

function MeasurementLabel({ x, y, label, scale }) {
  const fontSize = 10 / scale;
  const pad      = 3  / scale;
  const tw       = label.length * 6 / scale;
  const th       = fontSize * 1.4;

  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect
        x={x - tw / 2 - pad} y={y - th / 2 - pad}
        width={tw + pad * 2}  height={th + pad * 2}
        rx={3 / scale}
        fill="var(--color-surface)"
        fillOpacity={0.85}
      />
      <text
        x={x} y={y}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fill="var(--color-measure)"
        fontFamily="var(--font-mono)"
      >
        {label}
      </text>
    </g>
  );
}
