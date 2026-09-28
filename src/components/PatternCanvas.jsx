import React, { useRef, useCallback, useEffect, useState, useImperativeHandle, useMemo } from 'react';
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
  circleAsBezierSegments,
  extendLineP2,
  scaleBezierFromP1,
} from '../utils/geometry';
import { TOOLS } from './Toolbar';

// ─── Constants ──────────────────────────────────────────────────────────────

const SNAP_RADIUS_SCREEN = 10;
const SNAP_RADIUS_TOUCH  = 24;   // fingers are wider than cursors
const POINT_RADIUS       = 5;
const HIT_RADIUS_SCREEN  = 8;
const HIT_RADIUS_TOUCH   = 18;
const TAP_SLOP_PX        = 10;   // a touch that moves less than this is a tap
// Tools whose action is a single tap: on touch they fire on finger-up, so a
// two-finger pinch never drops a stray point.
const TAP_TOOLS = new Set(['point', 'line', 'bezier']);
const RECT_DRAG_THRESHOLD = 4; // px — minimum drag distance to commit a shape

// ─── History reducer ─────────────────────────────────────────────────────────

const INITIAL_PATTERN = {
  points:   {},
  segments: {},
  pieces:   {},      // piece metadata from block generators (see lib/drape)
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

    case 'ADD_SHAPE': {
      // Atomically add multiple points and segments (rectangle, circle)
      const pts  = { ...state.points };
      const segs = { ...state.segments };
      for (const pt  of action.points)   pts[pt.id]   = pt;
      for (const seg of action.segments) segs[seg.id] = seg;
      return { ...state, points: pts, segments: segs };
    }

    case 'MOVE_POINT': {
      const { id, x, y } = action;
      return { ...state, points: { ...state.points, [id]: { ...state.points[id], x, y } } };
    }

    case 'COMMIT_MOVE': {
      const { id, x, y } = action;
      return { ...state, points: { ...state.points, [id]: { ...state.points[id], x, y } } };
    }

    case 'MOVE_CONTROL': {
      const { segId, handle, x, y } = action;
      const seg = state.segments[segId];
      return { ...state, segments: { ...state.segments, [segId]: { ...seg, [handle]: { x, y } } } };
    }

    case 'SCALE_BEZIER': {
      const { segId, p2Id, newP2, newC1, newC2 } = action;
      return {
        ...state,
        points:   { ...state.points,   [p2Id]:  { ...state.points[p2Id],   x: newP2.x, y: newP2.y } },
        segments: { ...state.segments, [segId]: { ...state.segments[segId], c1: newC1,  c2: newC2  } },
      };
    }

    case 'MOVE_MULTI': {
      // Non-history: live drag of multiple selected points + their bezier handles
      const pts  = { ...state.points };
      const segs = { ...state.segments };
      for (const [id, pos] of Object.entries(action.positions))        pts[id]  = { ...pts[id],  x: pos.x, y: pos.y };
      for (const [id, cp]  of Object.entries(action.controlPositions)) segs[id] = { ...segs[id], c1: cp.c1, c2: cp.c2 };
      return { ...state, points: pts, segments: segs };
    }

    case 'COMMIT_MULTI': {
      // History-tracked: commit multi-point drag to undo stack
      const pts  = { ...state.points };
      const segs = { ...state.segments };
      for (const [id, pos] of Object.entries(action.positions))        pts[id]  = { ...pts[id],  x: pos.x, y: pos.y };
      for (const [id, cp]  of Object.entries(action.controlPositions)) segs[id] = { ...segs[id], c1: cp.c1, c2: cp.c2 };
      return { ...state, points: pts, segments: segs };
    }

    case 'SET_SELECTED': {
      return { ...state, selected: new Set(action.ids) };
    }

    case 'DELETE_SELECTED': {
      const toDelete = new Set(action.ids);
      const points   = { ...state.points };
      const segments = { ...state.segments };
      for (const id of toDelete) delete points[id];
      for (const [id, seg] of Object.entries(segments)) {
        if (toDelete.has(seg.p1) || toDelete.has(seg.p2)) delete segments[id];
      }
      return { ...state, points, segments, selected: new Set() };
    }

    case 'RESET':
      return { ...INITIAL_PATTERN, selected: new Set() };

    case 'COMMIT_GESTURE':
      // History marker only — the live gesture already changed `present`
      return state;

    case 'LOAD_BLOCK': {
      // Replace canvas with generated block points and segments
      return {
        points:   action.points,
        segments: action.segments,
        pieces:   action.pieces ?? {},
        selected: new Set(),
      };
    }

    default:
      return state;
  }
}

// ─── useHistoryReducer ────────────────────────────────────────────────────────

function useHistoryReducer() {
  // `gestureBase` is the state before a live drag began. When the drag is
  // committed, that pre-drag state (not the half-dragged one) goes on the
  // undo stack — so one undo puts the point back where it started.
  const [history, setHistory] = useState({
    past:    [],
    present: INITIAL_PATTERN,
    future:  [],
    gestureBase: null,
  });

  const dispatch = useCallback((action) => {
    const LIVE = new Set(['MOVE_POINT', 'MOVE_CONTROL', 'MOVE_MULTI']);
    if (action.type === 'SET_SELECTED') {
      setHistory(h => ({ ...h, present: patternReducer(h.present, action) }));
      return;
    }
    if (LIVE.has(action.type)) {
      setHistory(h => ({ ...h, gestureBase: h.gestureBase ?? h.present, present: patternReducer(h.present, action) }));
      return;
    }
    setHistory(h => ({
      past:    [...h.past, h.gestureBase ?? h.present].slice(-200),
      present: patternReducer(h.present, action),
      future:  [],
      gestureBase: null,
    }));
  }, []);

  const undo = useCallback(() => {
    setHistory(h => {
      if (h.past.length === 0) return h;
      const past    = [...h.past];
      const present = { ...past.pop(), selected: new Set() };
      return { past, present, future: [h.present, ...h.future], gestureBase: null };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory(h => {
      if (h.future.length === 0) return h;
      const future  = [...h.future];
      const present = future.shift();
      return { past: [...h.past, h.present], present, future, gestureBase: null };
    });
  }, []);

  return { state: history.present, dispatch, undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
}

// ─── PatternCanvas ────────────────────────────────────────────────────────────

export default function PatternCanvas({ activeTool, showGrid, onCursorMove, onHistoryChange, onPatternChange, ref }) {
  const svgRef = useRef(null);
  const { state, dispatch, undo, redo, canUndo, canRedo } = useHistoryReducer();

  const fitPendingRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useImperativeHandle(ref, () => ({
    undo, redo, canUndo, canRedo,
    /** Load a generated block. `fit: false` keeps the current zoom (live measurement edits). */
    loadBlock: (points, segments, pieces, { fit = true } = {}) => {
      fitPendingRef.current = fit;
      dispatch({ type: 'LOAD_BLOCK', points, segments, pieces });
    },
    loadPattern: (p) => {
      fitPendingRef.current = true;
      dispatch({ type: 'LOAD_BLOCK', points: p.points ?? {}, segments: p.segments ?? {}, pieces: p.pieces ?? {} });
    },
    getPattern: () => {
      const { points, segments, pieces } = stateRef.current;
      return { points, segments, pieces };
    },
    clearCanvas: () => dispatch({ type: 'RESET' }),
    fitView: () => fitView(),
    /** Called by the 3D view while a seam point is dragged on the body. */
    movePoint: (id, x, y, commit) => {
      if (!stateRef.current.points[id]) return;
      dispatch({ type: commit ? 'COMMIT_MOVE' : 'MOVE_POINT', id, x, y });
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [undo, redo, canUndo, canRedo, dispatch]);

  useEffect(() => {
    onHistoryChange?.({ canUndo, canRedo });
  }, [canUndo, canRedo, onHistoryChange]);

  // Emit pattern state to parent (debounced 80ms so live drag doesn't flood 3D sync)
  const onPatternChangeRef = useRef(onPatternChange);
  useEffect(() => { onPatternChangeRef.current = onPatternChange; }, [onPatternChange]);
  useEffect(() => {
    const timer = setTimeout(() => {
      onPatternChangeRef.current?.({ points: state.points, segments: state.segments, pieces: state.pieces });
    }, 80);
    return () => clearTimeout(timer);
  }, [state]);

  const [viewport,   setViewport]   = useState({ x: -10, y: -10, scale: 2.0 });
  const [cursor,     setCursor]     = useState({ x: 0, y: 0 });
  const [snapTarget, setSnapTarget] = useState(null);
  const [pendingStart, setPendingStart] = useState(null);
  const [svgSize, setSvgSize]       = useState({ w: 800, h: 600 });

  // Shape drag (rect / circle) — ref for the drag origin, state for preview
  const shapeDragRef      = useRef(null);   // { tool, start:{x,y} }
  const [shapeDrag, setShapeDrag] = useState(null); // { tool, start, end } for live preview

  // Right-click drag tracking
  const rightClickWasRect = useRef(false);

  // How the current selection was made — determines whether to show length editor
  const selectionSourceRef = useRef('');

  // Point/control drag
  const dragState = useRef(null);

  // Length editor visibility
  const [lengthEditorVisible, setLengthEditorVisible] = useState(false);
  const lastEditorSegId = useRef(null);

  // ── Derived: which segment (if any) has both endpoints currently selected ──
  const selectedSeg = useMemo(() => {
    if (state.selected.size < 2) return null;
    return Object.values(state.segments).find(
      seg => state.selected.has(seg.p1) && state.selected.has(seg.p2)
    ) ?? null;
  }, [state.segments, state.selected]);

  // Auto-show length editor when user clicks a line/curve; hide when deselected
  useEffect(() => {
    if (selectedSeg) {
      if (selectedSeg.id !== lastEditorSegId.current && selectionSourceRef.current === 'segment') {
        setLengthEditorVisible(true);
        lastEditorSegId.current = selectedSeg.id;
      }
    } else {
      setLengthEditorVisible(false);
      lastEditorSegId.current = null;
    }
  }, [selectedSeg]);

  // ── Resize observer ──────────────────────────────────────────────────────
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setSvgSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  // ── Fit the whole pattern into view ──────────────────────────────────────
  function fitView(pts = stateRef.current.points) {
    const arr = Object.values(pts);
    const svg = svgRef.current;
    if (!svg) return;
    const w = svg.clientWidth || svgSize.w, h = svg.clientHeight || svgSize.h;
    if (!arr.length) { setViewport({ x: -10, y: -10, scale: 2.0 }); return; }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of arr) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const pad = 24;
    const scale = Math.max(0.05, Math.min(20, Math.min((w - pad * 2) / ((maxX - minX) || 1), (h - pad * 2) / ((maxY - minY) || 1))));
    setViewport({
      scale,
      x: (minX + maxX) / 2 - w / 2 / scale,
      y: (minY + maxY) / 2 - h / 2 / scale,
    });
  }

  useEffect(() => {
    if (!fitPendingRef.current) return;
    fitPendingRef.current = false;
    fitView(state.points);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.points]);

  // ── Wheel zoom — non-passive ─────────────────────────────────────────────
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function onWheel(e) {
      e.preventDefault();
      const rect  = svg.getBoundingClientRect();
      const mx    = (e.clientX - rect.left) / viewport.scale + viewport.x;
      const my    = (e.clientY - rect.top)  / viewport.scale + viewport.y;
      const f     = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const scale = Math.max(0.05, Math.min(20, viewport.scale * f));
      setViewport({ scale, x: mx - (e.clientX - rect.left) / scale, y: my - (e.clientY - rect.top) / scale });
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
      if (e.key === 'Escape') { setPendingStart(null); dispatch({ type: 'SET_SELECTED', ids: [] }); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected.size > 0) {
        dispatch({ type: 'DELETE_SELECTED', ids: [...state.selected] });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, dispatch, state.selected]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getSvgRect   = () => svgRef.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 0, height: 0 };
  const isTouchRef   = useRef(false);
  const snapRadiusMm = () => (isTouchRef.current ? SNAP_RADIUS_TOUCH : SNAP_RADIUS_SCREEN) / viewport.scale;
  const hitRadiusMm  = () => (isTouchRef.current ? HIT_RADIUS_TOUCH  : HIT_RADIUS_SCREEN)  / viewport.scale;
  const toCanvas     = (sx, sy) => screenToCanvas(sx, sy, getSvgRect(), viewport);

  // ── Shape creation ────────────────────────────────────────────────────────

  function createRect(start, end) {
    const x1 = Math.min(start.x, end.x), y1 = Math.min(start.y, end.y);
    const x2 = Math.max(start.x, end.x), y2 = Math.max(start.y, end.y);
    if (Math.abs(x2 - x1) < 1 || Math.abs(y2 - y1) < 1) return;
    const tl = { id: newId('pt'), x: x1, y: y1 };
    const tr = { id: newId('pt'), x: x2, y: y1 };
    const br = { id: newId('pt'), x: x2, y: y2 };
    const bl = { id: newId('pt'), x: x1, y: y2 };
    dispatch({
      type: 'ADD_SHAPE',
      points: [tl, tr, br, bl],
      segments: [
        { id: newId('seg'), type: 'line', p1: tl.id, p2: tr.id },
        { id: newId('seg'), type: 'line', p1: tr.id, p2: br.id },
        { id: newId('seg'), type: 'line', p1: br.id, p2: bl.id },
        { id: newId('seg'), type: 'line', p1: bl.id, p2: tl.id },
      ],
    });
  }

  function createCircle(center, edge) {
    const r = dist(center, edge);
    if (r < 1) return;
    const specs = circleAsBezierSegments(center.x, center.y, r);
    const ptTop    = { id: newId('pt'), x: center.x,     y: center.y - r };
    const ptRight  = { id: newId('pt'), x: center.x + r, y: center.y     };
    const ptBottom = { id: newId('pt'), x: center.x,     y: center.y + r };
    const ptLeft   = { id: newId('pt'), x: center.x - r, y: center.y     };
    dispatch({
      type: 'ADD_SHAPE',
      points: [ptTop, ptRight, ptBottom, ptLeft],
      segments: [
        { id: newId('seg'), type: 'bezier', p1: ptTop.id,    p2: ptRight.id,  c1: specs[0].c1, c2: specs[0].c2 },
        { id: newId('seg'), type: 'bezier', p1: ptRight.id,  p2: ptBottom.id, c1: specs[1].c1, c2: specs[1].c2 },
        { id: newId('seg'), type: 'bezier', p1: ptBottom.id, p2: ptLeft.id,   c1: specs[2].c1, c2: specs[2].c2 },
        { id: newId('seg'), type: 'bezier', p1: ptLeft.id,   p2: ptTop.id,    c1: specs[3].c1, c2: specs[3].c2 },
      ],
    });
  }

  // ── Pointer move (mouse, pen, single finger) ─────────────────────────────
  function handleMove(e) {
    const pt = toCanvas(e.clientX, e.clientY);
    setCursor(pt);
    onCursorMove?.(pt);
    const snap = findSnap(pt, snapPoints, snapRadiusMm());
    setSnapTarget(snap.snapped ? snap : null);

    // Shape drag preview (rect or circle)
    if (shapeDragRef.current) {
      setShapeDrag({ ...shapeDragRef.current, end: pt });
      return;
    }

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
      const s2  = findSnap(pt, snapPoints, snapRadiusMm());
      const fin = s2.snapped && s2.id !== ds.pointId ? s2.point : pt;
      dispatch({ type: 'MOVE_POINT', id: ds.pointId, x: fin.x, y: fin.y });
      return;
    }
    if (ds.type === 'control') {
      dispatch({ type: 'MOVE_CONTROL', segId: ds.segId, handle: ds.handle, x: pt.x, y: pt.y });
      return;
    }
    if (ds.type === 'multi') {
      const dx = pt.x - ds.startCanvas.x;
      const dy = pt.y - ds.startCanvas.y;
      const positions = {};
      for (const [id, start] of Object.entries(ds.startPositions)) {
        positions[id] = { x: start.x + dx, y: start.y + dy };
      }
      const controlPositions = {};
      for (const [segId, starts] of Object.entries(ds.startControlPositions)) {
        controlPositions[segId] = {
          c1: { x: starts.c1.x + dx, y: starts.c1.y + dy },
          c2: { x: starts.c2.x + dx, y: starts.c2.y + dy },
        };
      }
      dispatch({ type: 'MOVE_MULTI', positions, controlPositions });
      return;
    }
  }

  // ── Pointer down ──────────────────────────────────────────────────────────
  function handleDown(e) {
    const pt      = toCanvas(e.clientX, e.clientY);
    const snap    = findSnap(pt, snapPoints, snapRadiusMm());
    const finalPt = snap.snapped ? snap.point : pt;

    // ── Right-click drag ────────────────────────────────────────────────────
    // SELECT tool → marquee box selection
    // Any other tool → rectangle creation
    if (e.button === 2) {
      rightClickWasRect.current = false;
      const dragTool = activeTool === TOOLS.SELECT ? 'marquee' : 'rect';
      shapeDragRef.current = { tool: dragTool, start: pt };
      setShapeDrag({ tool: dragTool, start: pt, end: pt });
      return;
    }

    if (e.button !== 0) return;

    // ── Middle mouse or Alt+left → pan ───────────────────────────────────────
    if (e.button === 0 && e.altKey) {
      e.preventDefault();
      dragState.current = { type: 'pan', startScreen: { x: e.clientX, y: e.clientY }, startViewport: { x: viewport.x, y: viewport.y } };
      return;
    }

    // ── RECT tool — left drag ────────────────────────────────────────────────
    if (activeTool === TOOLS.RECT) {
      shapeDragRef.current = { tool: 'rect', start: pt };
      setShapeDrag({ tool: 'rect', start: pt, end: pt });
      return;
    }

    // ── CIRCLE tool — drag to set radius ────────────────────────────────────
    if (activeTool === TOOLS.CIRCLE) {
      shapeDragRef.current = { tool: 'circle', start: pt };
      setShapeDrag({ tool: 'circle', start: pt, end: pt });
      return;
    }

    // ── Control handle drag (any tool, when a bezier has both endpoints selected) ──
    if (pendingStart === null) {
      for (const [segId, seg] of Object.entries(state.segments)) {
        if (seg.type !== 'bezier') continue;
        if (!state.selected.has(seg.p1) && !state.selected.has(seg.p2)) continue;
        for (const handle of ['c1', 'c2']) {
          if (seg[handle] && dist(pt, seg[handle]) <= hitRadiusMm() * 2) {
            dragState.current = { type: 'control', segId, handle };
            return;
          }
        }
      }
    }

    // ── SELECT tool ──────────────────────────────────────────────────────────
    if (activeTool === TOOLS.SELECT) {
      if (snap.snapped) {
        // If clicking a point already inside a multi-selection → drag everything together
        if (state.selected.size > 1 && state.selected.has(snap.id)) {
          const selIds = [...state.selected];
          const startPositions = {};
          for (const id of selIds) {
            if (state.points[id]) startPositions[id] = { x: state.points[id].x, y: state.points[id].y };
          }
          // Snapshot bezier handles for segments with BOTH endpoints selected
          const startControlPositions = {};
          for (const [segId, seg] of Object.entries(state.segments)) {
            if (seg.type === 'bezier' && state.selected.has(seg.p1) && state.selected.has(seg.p2)) {
              startControlPositions[segId] = { c1: { ...seg.c1 }, c2: { ...seg.c2 } };
            }
          }
          dragState.current = { type: 'multi', startCanvas: finalPt, startPositions, startControlPositions };
          return;
        }
        selectionSourceRef.current = 'point';
        dispatch({ type: 'SET_SELECTED', ids: [snap.id] });
        dragState.current = { type: 'point', pointId: snap.id, startCanvas: finalPt };
        return;
      }
      // Hit-test segments
      for (const [segId, seg] of Object.entries(state.segments)) {
        const p1 = state.points[seg.p1];
        const p2 = state.points[seg.p2];
        if (!p1 || !p2) continue;
        const hit = seg.type === 'line'
          ? isNearLine(pt, p1, p2, hitRadiusMm())
          : isNearBezier(pt, p1, seg.c1, seg.c2, p2, hitRadiusMm());
        if (hit) {
          selectionSourceRef.current = 'segment';
          dispatch({ type: 'SET_SELECTED', ids: [seg.p1, seg.p2] });
          return;
        }
      }
      // Touch on empty space pans (one finger) — the phone equivalent of
      // middle-drag. A tap without movement still deselects (see handleUp).
      if (isTouchRef.current) {
        dragState.current = { type: 'pan', touchDeselect: true, startScreen: { x: e.clientX, y: e.clientY }, startViewport: { x: viewport.x, y: viewport.y } };
        return;
      }
      // Clicked empty space — start a left-drag marquee.
      // Decide on mouseUp: if dragged → box select, if short click → deselect.
      shapeDragRef.current = { tool: 'marquee', start: pt };
      setShapeDrag({ tool: 'marquee', start: pt, end: pt });
      return;
    }

    // ── POINT tool ───────────────────────────────────────────────────────────
    if (activeTool === TOOLS.POINT) {
      if (snap.snapped) return;
      const id = newId('pt');
      dispatch({ type: 'ADD_POINT', id, x: pt.x, y: pt.y });
      return;
    }

    // ── LINE / BEZIER tool ───────────────────────────────────────────────────
    if (activeTool === TOOLS.LINE || activeTool === TOOLS.BEZIER) {
      if (pendingStart === null) {
        if (snap.snapped) {
          setPendingStart(snap.id);
        } else {
          const id = newId('pt');
          dispatch({ type: 'ADD_POINT', id, x: pt.x, y: pt.y });
          setPendingStart(id);
        }
        return;
      }
      // Second click — complete the segment
      let endId;
      if (snap.snapped && snap.id !== pendingStart) {
        endId = snap.id;
      } else if (!snap.snapped) {
        endId = newId('pt');
        dispatch({ type: 'ADD_POINT', id: endId, x: pt.x, y: pt.y });
      } else {
        setPendingStart(null);
        return;
      }
      const startPt = state.points[pendingStart];
      const segId   = newId('seg');
      if (activeTool === TOOLS.LINE) {
        dispatch({ type: 'ADD_SEGMENT', segment: { id: segId, type: 'line', p1: pendingStart, p2: endId } });
      } else {
        const { c1, c2 } = defaultControlPoints(startPt, finalPt);
        dispatch({ type: 'ADD_SEGMENT', segment: { id: segId, type: 'bezier', p1: pendingStart, p2: endId, c1, c2 } });
        dispatch({ type: 'SET_SELECTED', ids: [pendingStart, endId] });
      }
      setPendingStart(endId);
      return;
    }
  }

  // ── Pointer up ────────────────────────────────────────────────────────────
  function handleUp(e) {
    // Commit shape drags
    if (shapeDragRef.current) {
      const { tool, start } = shapeDragRef.current;
      const end = toCanvas(e.clientX, e.clientY);
      const screenDist = dist(start, end) * viewport.scale;

      if (e.button === 2) {
        if (screenDist >= RECT_DRAG_THRESHOLD) {
          if (tool === 'marquee') {
            // Box select: find all points inside the rectangle
            const minX = Math.min(start.x, end.x), maxX = Math.max(start.x, end.x);
            const minY = Math.min(start.y, end.y), maxY = Math.max(start.y, end.y);
            const inside = Object.values(state.points)
              .filter(p => !guideOnlyPoints.has(p.id) && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY)
              .map(p => p.id);
            if (inside.length > 0) {
              selectionSourceRef.current = 'marquee';
              dispatch({ type: 'SET_SELECTED', ids: inside });
            }
          } else {
            createRect(start, end);
          }
          rightClickWasRect.current = true;
        }
      } else {
        if (tool === 'marquee') {
          if (screenDist >= RECT_DRAG_THRESHOLD) {
            // Real drag — box select
            const minX = Math.min(start.x, end.x), maxX = Math.max(start.x, end.x);
            const minY = Math.min(start.y, end.y), maxY = Math.max(start.y, end.y);
            const inside = Object.values(state.points)
              .filter(p => !guideOnlyPoints.has(p.id) && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY)
              .map(p => p.id);
            selectionSourceRef.current = inside.length > 0 ? 'marquee' : 'clear';
            dispatch({ type: 'SET_SELECTED', ids: inside });
          } else {
            // Short click on empty space — deselect all
            selectionSourceRef.current = 'clear';
            dispatch({ type: 'SET_SELECTED', ids: [] });
          }
        } else if (screenDist >= RECT_DRAG_THRESHOLD) {
          if (tool === 'rect')   createRect(start, end);
          if (tool === 'circle') createCircle(start, end);
        }
      }
      shapeDragRef.current = null;
      setShapeDrag(null);
      return;
    }

    // Commit point/multi drag to history
    const ds = dragState.current;
    dragState.current = null;
    if (ds?.type === 'pan' && ds.touchDeselect) {
      const moved = Math.hypot(e.clientX - ds.startScreen.x, e.clientY - ds.startScreen.y);
      if (moved < TAP_SLOP_PX) { selectionSourceRef.current = 'clear'; dispatch({ type: 'SET_SELECTED', ids: [] }); }
    }
    if (ds?.type === 'control') dispatch({ type: 'COMMIT_GESTURE' });
    if (ds?.type === 'point') {
      const pt = state.points[ds.pointId];
      if (pt) dispatch({ type: 'COMMIT_MOVE', id: ds.pointId, x: pt.x, y: pt.y });
    }
    if (ds?.type === 'multi') {
      // Compute final positions and commit to history
      const endPt = toCanvas(e.clientX, e.clientY);
      const dx = endPt.x - ds.startCanvas.x;
      const dy = endPt.y - ds.startCanvas.y;
      const positions = {};
      for (const [id, start] of Object.entries(ds.startPositions)) {
        positions[id] = { x: start.x + dx, y: start.y + dy };
      }
      const controlPositions = {};
      for (const [segId, starts] of Object.entries(ds.startControlPositions)) {
        controlPositions[segId] = {
          c1: { x: starts.c1.x + dx, y: starts.c1.y + dy },
          c2: { x: starts.c2.x + dx, y: starts.c2.y + dy },
        };
      }
      dispatch({ type: 'COMMIT_MULTI', positions, controlPositions });
    }
  }

  // ── Pointer routing: pinch-zoom, tap tools, then the single-pointer logic ──
  const pointersRef = useRef(new Map());   // pointerId → {x, y}
  const pinchRef    = useRef(null);
  const tapRef      = useRef(null);

  function endSinglePointerGesture() {
    // A second finger landed: drop whatever the first finger started
    if (shapeDragRef.current) { shapeDragRef.current = null; setShapeDrag(null); }
    const ds = dragState.current;
    dragState.current = null;
    if (ds && ds.type !== 'pan') dispatch({ type: 'COMMIT_GESTURE' });
    tapRef.current = null;
  }

  function onPointerDown(e) {
    isTouchRef.current = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (e.pointerType !== 'mouse') svgRef.current?.setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      endSinglePointerGesture();
      const [a, b] = [...pointersRef.current.values()];
      const rect = getSvgRect();
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      pinchRef.current = {
        d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        vp0: viewport,
        anchor: { x: (mid.x - rect.left) / viewport.scale + viewport.x, y: (mid.y - rect.top) / viewport.scale + viewport.y },
      };
      return;
    }
    if (pointersRef.current.size > 2 || pinchRef.current) return;

    if (e.pointerType !== 'mouse' && TAP_TOOLS.has(activeTool) && e.button === 0) {
      tapRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      const pt = toCanvas(e.clientX, e.clientY);
      setCursor(pt);
      onCursorMove?.(pt);
      return;
    }
    handleDown(e);
  }

  function onPointerMove(e) {
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pinch = pinchRef.current;
    if (pinch) {
      if (pointersRef.current.size < 2) return;
      const [a, b] = [...pointersRef.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const rect = getSvgRect();
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const scale = Math.max(0.05, Math.min(20, pinch.vp0.scale * d / pinch.d0));
      setViewport({
        scale,
        x: pinch.anchor.x - (mid.x - rect.left) / scale,
        y: pinch.anchor.y - (mid.y - rect.top) / scale,
      });
      return;
    }
    if (tapRef.current) {
      const t = tapRef.current;
      if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > TAP_SLOP_PX) {
        // turned into a drag: pan the canvas instead of placing anything
        tapRef.current = null;
        dragState.current = { type: 'pan', startScreen: { x: t.x, y: t.y }, startViewport: { x: viewport.x, y: viewport.y } };
      } else {
        return;
      }
    }
    handleMove(e);
  }

  function onPointerUp(e) {
    pointersRef.current.delete(e.pointerId);
    if (pinchRef.current) {
      if (pointersRef.current.size === 0) pinchRef.current = null;
      return;
    }
    const t = tapRef.current;
    if (t && t.pointerId === e.pointerId) {
      tapRef.current = null;
      // treat as a click at the finger position (snap uses the touch radius)
      handleDown({ clientX: e.clientX, clientY: e.clientY, button: 0, altKey: false, preventDefault() {} });
      return;
    }
    handleUp(e);
  }

  function onPointerCancel(e) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) pinchRef.current = null;
    tapRef.current = null;
    if (dragState.current || shapeDragRef.current) handleUp(e);
  }

  // ── Context menu ─────────────────────────────────────────────────────────
  function onContextMenu(e) {
    e.preventDefault();
    if (rightClickWasRect.current) {
      rightClickWasRect.current = false;
      return; // rect was drawn — don't cancel
    }
    // No drag — treat as cancel
    setPendingStart(null);
    dispatch({ type: 'SET_SELECTED', ids: [] });
  }

  // ── Grid ─────────────────────────────────────────────────────────────────
  function renderGrid() {
    if (!showGrid) return null;
    let spacing = 10;
    if (viewport.scale < 0.5) spacing = 50;
    else if (viewport.scale < 1) spacing = 20;
    else if (viewport.scale > 8) spacing = 5;
    const { xLines, yLines } = visibleGridLines(viewport, svgSize.w, svgSize.h, spacing);
    const sw = 1 / viewport.scale;
    return (
      <g style={{ pointerEvents: 'none' }}>
        {xLines.map(x => (
          <line key={`gx${x}`} x1={x} y1={viewport.y} x2={x} y2={viewport.y + svgSize.h / viewport.scale}
            stroke={x === 0 ? '#3d4450' : '#1e242c'} strokeWidth={sw} />
        ))}
        {yLines.map(y => (
          <line key={`gy${y}`} x1={viewport.x} y1={y} x2={viewport.x + svgSize.w / viewport.scale} y2={y}
            stroke={y === 0 ? '#3d4450' : '#1e242c'} strokeWidth={sw} />
        ))}
      </g>
    );
  }

  // ── Segments ─────────────────────────────────────────────────────────────
  function renderSegments() {
    const sw     = 1.5 / viewport.scale;
    const selIds = state.selected;
    return Object.values(state.segments).map(seg => {
      const p1 = state.points[seg.p1];
      const p2 = state.points[seg.p2];
      if (!p1 || !p2) return null;
      const selected = selIds.has(seg.p1) && selIds.has(seg.p2);

      // Grainline: solid, arrowheads at both ends
      if (seg.grain) {
        const ah = 10 / viewport.scale, aw = 5 / viewport.scale;
        const dx = p2.x - p1.x, dy = p2.y - p1.y, l = Math.hypot(dx, dy) || 1;
        const ux = dx / l, uy = dy / l;
        const head = (tip, dir) => `M${tip.x},${tip.y} L${tip.x - dir * ux * ah - uy * aw},${tip.y - dir * uy * ah + ux * aw} L${tip.x - dir * ux * ah + uy * aw},${tip.y - dir * uy * ah - ux * aw} Z`;
        return (
          <g key={seg.id} data-grain="1" style={{ pointerEvents: 'none' }}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#8b949e" strokeWidth={sw} />
            <path d={head(p2, 1)} fill="#8b949e" />
            <path d={head(p1, -1)} fill="#8b949e" />
            <text x={p1.x + 5 / viewport.scale} y={(p1.y + p2.y) / 2} fontSize={9 / viewport.scale} fill="#8b949e"
              fontFamily="var(--font-mono)" transform={`rotate(90 ${p1.x + 5 / viewport.scale} ${(p1.y + p2.y) / 2})`}
              style={{ userSelect: 'none' }}>GRAIN</text>
          </g>
        );
      }

      // Construction lines: dashed blue-grey guide lines
      if (seg.construction) {
        const dash = `${6/viewport.scale} ${4/viewport.scale}`;
        return (
          <g key={seg.id}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke="#3a5068" strokeWidth={sw * 0.8}
              strokeDasharray={dash} />
            {seg.label && (
              <text
                x={p2.x + 6/viewport.scale} y={p2.y + 4/viewport.scale}
                fontSize={9/viewport.scale}
                fill="#3a7090"
                fontFamily="var(--font-mono)"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >{seg.label}</text>
            )}
          </g>
        );
      }

      const color = seg.type === 'bezier' ? 'var(--color-bezier)' : 'var(--color-line)';

      if (seg.type === 'line') {
        return (
          <g key={seg.id}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth={selected ? sw * 2 : sw} />
            {selected && (
              <MeasurementLabel x={(p1.x+p2.x)/2} y={(p1.y+p2.y)/2}
                label={formatMm(lineLength(p1, p2))} scale={viewport.scale} />
            )}
          </g>
        );
      }

      if (seg.type === 'bezier') {
        return (
          <g key={seg.id}>
            <path d={`M${p1.x},${p1.y} C${seg.c1.x},${seg.c1.y} ${seg.c2.x},${seg.c2.y} ${p2.x},${p2.y}`}
              stroke={color} strokeWidth={selected ? sw * 2 : sw} fill="none" />
            {selected && (
              <>
                <ControlHandle anchor={p1} control={seg.c1} scale={viewport.scale} />
                <ControlHandle anchor={p2} control={seg.c2} scale={viewport.scale} />
                <MeasurementLabel x={(p1.x+p2.x)/2} y={(p1.y+p2.y)/2 - 10/viewport.scale}
                  label={formatMm(bezierLength(p1, seg.c1, seg.c2, p2))} scale={viewport.scale} />
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
    const len   = lineLength(startPt, endPt);
    const midX  = (startPt.x + endPt.x) / 2;
    const midY  = (startPt.y + endPt.y) / 2;
    const dx    = endPt.x - startPt.x;
    const dy    = endPt.y - startPt.y;
    const d     = Math.sqrt(dx * dx + dy * dy) || 1;
    const off   = 8 / viewport.scale;
    return (
      <g style={{ pointerEvents: 'none' }}>
        <line x1={startPt.x} y1={startPt.y} x2={endPt.x} y2={endPt.y}
          stroke="var(--color-text-muted)" strokeWidth={sw}
          strokeDasharray={`${4/viewport.scale} ${3/viewport.scale}`} />
        {len > 0.5 && (
          <MeasurementLabel x={midX + (-dy/d)*off} y={midY + (dx/d)*off}
            label={formatMm(len)} scale={viewport.scale} />
        )}
      </g>
    );
  }

  // ── Shape preview (rect / circle / marquee drag) ─────────────────────────
  function renderShapePreview() {
    if (!shapeDrag) return null;
    const { tool, start, end } = shapeDrag;
    const sw = 1 / viewport.scale;
    const dashArray = `${4/viewport.scale} ${3/viewport.scale}`;
    const sharedProps = {
      fill: 'var(--color-accent-dim)', fillOpacity: 0.08,
      stroke: 'var(--color-accent)', strokeWidth: sw, strokeDasharray: dashArray,
      style: { pointerEvents: 'none' },
    };

    // Marquee selection box — slightly different style to distinguish from rect creation
    if (tool === 'marquee') {
      const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x),  h = Math.abs(end.y - start.y);
      if (w < 0.5 || h < 0.5) return null;
      return (
        <rect x={x} y={y} width={w} height={h}
          fill="var(--color-snap)" fillOpacity={0.05}
          stroke="var(--color-snap)" strokeWidth={sw}
          strokeDasharray={dashArray}
          style={{ pointerEvents: 'none' }}
        />
      );
    }

    if (tool === 'rect') {
      const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x),  h = Math.abs(end.y - start.y);
      if (w < 0.5 || h < 0.5) return null;
      const dimLabel = `${Math.round(w)} × ${Math.round(h)} mm`;
      return (
        <g style={{ pointerEvents: 'none' }}>
          <rect x={x} y={y} width={w} height={h} {...sharedProps} />
          <MeasurementLabel x={x + w/2} y={y - 8/viewport.scale} label={dimLabel} scale={viewport.scale} />
        </g>
      );
    }
    if (tool === 'circle') {
      const r = dist(start, end);
      if (r < 0.5) return null;
      return (
        <g style={{ pointerEvents: 'none' }}>
          <circle cx={start.x} cy={start.y} r={r} {...sharedProps} />
          {/* Centre crosshair */}
          <line x1={start.x - 4/viewport.scale} y1={start.y} x2={start.x + 4/viewport.scale} y2={start.y}
            stroke="var(--color-accent)" strokeWidth={sw} />
          <line x1={start.x} y1={start.y - 4/viewport.scale} x2={start.x} y2={start.y + 4/viewport.scale}
            stroke="var(--color-accent)" strokeWidth={sw} />
          <MeasurementLabel x={start.x} y={start.y - r - 8/viewport.scale}
            label={`r ${formatMm(r)}`} scale={viewport.scale} />
        </g>
      );
    }
    return null;
  }

  // ── Points ────────────────────────────────────────────────────────────────
  // Points that only anchor construction guides are not drawn — they would
  // clutter the block with dots that aren't part of any pattern piece.
  const guideOnlyPoints = useMemo(() => {
    const used = new Set(), guide = new Set();
    for (const sg of Object.values(state.segments)) {
      const bucket = sg.construction ? guide : used;
      bucket.add(sg.p1); bucket.add(sg.p2);
    }
    for (const id of used) guide.delete(id);
    return guide;
  }, [state.segments]);
  const snapPoints = useMemo(() => {
    if (!guideOnlyPoints.size) return state.points;
    const out = {};
    for (const [id, p] of Object.entries(state.points)) if (!guideOnlyPoints.has(id)) out[id] = p;
    return out;
  }, [state.points, guideOnlyPoints]);

  function renderPoints() {
    const r  = POINT_RADIUS / viewport.scale;
    const sw = 1.5 / viewport.scale;
    return Object.values(state.points).filter(pt => !guideOnlyPoints.has(pt.id)).map(pt => (
      <circle key={pt.id} cx={pt.x} cy={pt.y} r={r}
        fill={state.selected.has(pt.id) ? 'var(--color-point-sel)' : 'var(--color-point)'}
        stroke="var(--color-canvas)" strokeWidth={sw}
        style={{ cursor: activeTool === TOOLS.SELECT ? 'move' : 'crosshair' }} />
    ));
  }

  // ── Snap indicator ────────────────────────────────────────────────────────
  function renderSnapIndicator() {
    if (!snapTarget) return null;
    const r  = (POINT_RADIUS + 4) / viewport.scale;
    const sw = 1.5 / viewport.scale;
    return (
      <circle cx={snapTarget.point.x} cy={snapTarget.point.y} r={r}
        fill="none" stroke="var(--color-snap)" strokeWidth={sw}
        style={{ pointerEvents: 'none' }} />
    );
  }

  // ── Crosshair ─────────────────────────────────────────────────────────────
  function renderCrosshair() {
    if (activeTool === TOOLS.SELECT) return null;
    const size = 8 / viewport.scale;
    const sw   = 1 / viewport.scale;
    return (
      <g style={{ pointerEvents: 'none' }}>
        <line x1={cursor.x - size} y1={cursor.y} x2={cursor.x + size} y2={cursor.y}
          stroke="var(--color-text-dim)" strokeWidth={sw} />
        <line x1={cursor.x} y1={cursor.y - size} x2={cursor.x} y2={cursor.y + size}
          stroke="var(--color-text-dim)" strokeWidth={sw} />
      </g>
    );
  }

  // ── SVG cursor style ──────────────────────────────────────────────────────
  const cursorStyle =
    activeTool === TOOLS.SELECT ? 'default' :
    activeTool === TOOLS.RECT   ? 'crosshair' :
    activeTool === TOOLS.CIRCLE ? 'crosshair' : 'crosshair';

  const vbW     = svgSize.w / viewport.scale;
  const vbH     = svgSize.h / viewport.scale;
  const viewBox = `${viewport.x} ${viewport.y} ${vbW} ${vbH}`;

  // ── Length editor: SVG → CSS pixel position ───────────────────────────────
  const lengthEditorPos = useMemo(() => {
    if (!selectedSeg) return null;
    const p1 = state.points[selectedSeg.p1];
    const p2 = state.points[selectedSeg.p2];
    if (!p1 || !p2) return null;
    return {
      x: ((p1.x + p2.x) / 2 - viewport.x) * viewport.scale,
      y: ((p1.y + p2.y) / 2 - viewport.y) * viewport.scale,
    };
  }, [selectedSeg, state.points, viewport]);

  // Automation hook (end-to-end tests): canvas mm → client px
  useEffect(() => {
    window.__garmentos2d = {
      toScreen(x, y) {
        const r = getSvgRect();
        return { x: r.left + (x - viewport.x) * viewport.scale, y: r.top + (y - viewport.y) * viewport.scale };
      },
      pattern() { return stateRef.current; },
    };
    return () => { delete window.__garmentos2d; };
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg
        ref={svgRef}
        viewBox={viewBox}
        data-testid="pattern-canvas"
        data-scale={viewport.scale.toFixed(4)}
        data-vx={viewport.x.toFixed(2)}
        data-vy={viewport.y.toFixed(2)}
        style={{ width: '100%', height: '100%', display: 'block', backgroundColor: 'var(--color-canvas)', cursor: cursorStyle, userSelect: 'none', touchAction: 'none', WebkitUserSelect: 'none' }}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'mouse') return;
          const ds = dragState.current;
          dragState.current = null; shapeDragRef.current = null; setShapeDrag(null);
          if (ds && ds.type !== 'pan') dispatch({ type: 'COMMIT_GESTURE' });
        }}
        onContextMenu={onContextMenu}
      >
        {renderGrid()}
        {renderSegments()}
        {renderPreview()}
        {renderShapePreview()}
        {renderPoints()}
        {renderSnapIndicator()}
        {renderCrosshair()}
      </svg>

      {/* Length editor overlay */}
      {lengthEditorVisible && selectedSeg && lengthEditorPos && (
        <LengthEditor
          seg={selectedSeg}
          points={state.points}
          pos={lengthEditorPos}
          dispatch={dispatch}
          onClose={() => setLengthEditorVisible(false)}
        />
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ControlHandle({ anchor, control, scale }) {
  const sw = 1 / scale;
  const r  = 3.5 / scale;
  return (
    <g style={{ pointerEvents: 'none' }}>
      <line x1={anchor.x} y1={anchor.y} x2={control.x} y2={control.y}
        stroke="var(--color-control)" strokeWidth={sw}
        strokeDasharray={`${3/scale} ${2/scale}`} />
      <circle cx={control.x} cy={control.y} r={r}
        fill="var(--color-control)" stroke="var(--color-canvas)" strokeWidth={sw}
        style={{ pointerEvents: 'all', cursor: 'move' }} />
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
      <rect x={x - tw/2 - pad} y={y - th/2 - pad} width={tw + pad*2} height={th + pad*2}
        rx={3/scale} fill="var(--color-surface)" fillOpacity={0.85} />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="middle"
        fontSize={fontSize} fill="var(--color-measure)" fontFamily="var(--font-mono)">
        {label}
      </text>
    </g>
  );
}

// ─── Length Editor overlay ───────────────────────────────────────────────────

function LengthEditor({ seg, points, pos, dispatch, onClose }) {
  const p1 = points[seg.p1];
  const p2 = points[seg.p2];

  const currentLen = seg.type === 'line'
    ? lineLength(p1, p2)
    : bezierLength(p1, seg.c1, seg.c2, p2);

  const [inputVal, setInputVal] = useState(currentLen.toFixed(1));

  // Reset input when a different segment is targeted
  useEffect(() => {
    setInputVal(currentLen.toFixed(1));
  }, [seg.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyLength(raw) {
    const n = typeof raw === 'number' ? raw : parseFloat(raw);
    if (isNaN(n) || n <= 0) return;
    const clamped = Math.max(0.1, n);
    if (seg.type === 'line') {
      const newP2 = extendLineP2(p1, p2, clamped);
      dispatch({ type: 'COMMIT_MOVE', id: seg.p2, x: newP2.x, y: newP2.y });
    } else {
      const scaled = scaleBezierFromP1(p1, seg.c1, seg.c2, p2, clamped);
      dispatch({ type: 'SCALE_BEZIER', segId: seg.id, p2Id: seg.p2, newP2: scaled.p2, newC1: scaled.c1, newC2: scaled.c2 });
    }
    setInputVal(clamped.toFixed(1));
  }

  function handleKey(e) {
    if (e.key === 'Enter')  { applyLength(inputVal); e.preventDefault(); }
    if (e.key === 'Escape') { onClose(); }
    e.stopPropagation();
  }

  function handleStep(delta) {
    const current = parseFloat(inputVal) || currentLen;
    applyLength(current + delta);
  }

  const topPx = Math.max(8, pos.y - 80);

  return (
    <div
      onMouseDown={e => e.stopPropagation()}
      style={{
        position:    'absolute',
        left:        pos.x,
        top:         topPx,
        transform:   'translateX(-50%)',
        zIndex:      200,
        background:  'var(--color-surface)',
        border:      '1px solid var(--color-border)',
        borderRadius: 8,
        padding:     '8px 10px',
        display:     'flex',
        flexDirection: 'column',
        gap:         6,
        boxShadow:   '0 4px 24px rgba(0,0,0,0.55)',
        minWidth:    170,
        fontFamily:  'var(--font-mono)',
        fontSize:    11,
        color:       'var(--color-text)',
        pointerEvents: 'all',
        userSelect:  'none',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--color-text-dim)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {seg.type === 'line' ? 'Line' : 'Curve'} length
        </span>
        <button onClick={onClose} style={CLOSE_BTN}>×</button>
      </div>

      {/* Input row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button onClick={() => handleStep(-1)} style={STEP_BTN} title="–1mm">−</button>
        <input
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={handleKey}
          onBlur={() => applyLength(inputVal)}
          style={{
            flex:       1,
            background: 'var(--color-canvas)',
            border:     '1px solid var(--color-border)',
            borderRadius: 4,
            color:      'var(--color-text)',
            fontFamily: 'var(--font-mono)',
            fontSize:   12,
            padding:    '4px 6px',
            textAlign:  'center',
            outline:    'none',
            minWidth:   0,
          }}
          autoFocus
        />
        <span style={{ color: 'var(--color-text-dim)', fontSize: 10, flexShrink: 0 }}>mm</span>
        <button onClick={() => handleStep(+1)} style={STEP_BTN} title="+1mm">+</button>
      </div>

      {/* Quick steps */}
      <div style={{ display: 'flex', gap: 3 }}>
        {[-10, -5, +5, +10].map(d => (
          <button key={d} onClick={() => handleStep(d)} style={QUICK_BTN}>
            {d > 0 ? '+' : ''}{d}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Button style constants ───────────────────────────────────────────────────

const STEP_BTN = {
  width: 26, height: 26,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  color: 'var(--color-text)',
  cursor: 'pointer',
  fontSize: 16,
  fontFamily: 'var(--font-sans)',
  flexShrink: 0,
  padding: 0,
};

const QUICK_BTN = {
  flex: 1,
  height: 20,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--color-canvas)',
  border: '1px solid var(--color-border)',
  borderRadius: 3,
  color: 'var(--color-text-dim)',
  cursor: 'pointer',
  fontSize: 10,
  fontFamily: 'var(--font-mono)',
  padding: 0,
};

const CLOSE_BTN = {
  background: 'none',
  border: 'none',
  color: 'var(--color-text-muted)',
  cursor: 'pointer',
  fontSize: 15,
  lineHeight: 1,
  padding: '0 2px',
  fontFamily: 'var(--font-sans)',
};
