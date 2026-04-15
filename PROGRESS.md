# GarmentOS — Build Progress

## Current Stage: Stage 1 Complete

---

## Stage 1 — 2D Canvas Foundation
Status: COMPLETE
Date: April 14 2026
Commits: 96077e7 → acb90c5

### What was built:

**Files created/rewritten:**
- `src/utils/geometry.js` — coordinate math library (distance, snap, bezier sampling, arc length, hit testing, viewport conversion, measurement formatting, grid lines, circle-as-bezier, line/bezier scaling)
- `src/index.css` — Tailwind v4 `@theme` block, GitHub Dark palette, CSS reset
- `src/components/Toolbar.jsx` — tool panel: Select, Point, Line, Bezier, Rectangle, Circle, grid toggle, undo/redo
- `src/components/PatternCanvas.jsx` — SVG drawing canvas (full feature set below)
- `src/App.jsx` — shell layout: header + toolbar + canvas + status bar with live cursor coords

**Canvas capabilities:**
- SVG-based drawing surface — 1 SVG unit = 1mm throughout the entire system
- `Select` tool — click to select points or segments, drag to move, drag bezier control handles
- `Point` tool — place anchor points
- `Line` tool — click two points to draw straight segment, chains automatically
- `Bezier` tool — click two points to draw cubic bezier. Handles auto-selected after placement so they're immediately draggable. Default control points at 1/3 and 2/3 of segment length.
- `Rectangle` tool (R) — click and drag to draw rectangle as 4 line segments. Also available as right-click drag from any tool (quick rect shortcut).
- `Circle` tool (C) — click center, drag to radius. Drawn as 4 cubic bezier segments using kappa=0.5523 approximation.
- Marquee box selection — left-click drag on empty space in Select mode draws selection rectangle; releases select all points inside. Drag distance threshold distinguishes from a plain deselect click.
- Right-click drag in Select mode — same marquee box selection behavior
- Multi-object drag — when multiple points are selected, dragging any one of them moves all selected points together. Bezier control handles for segments with both endpoints selected also move by the same delta.
- Snap-to-point — 10px snap radius in screen space, scales with zoom. Green ring indicator.
- Zoom — mouse wheel toward cursor. Range 0.2x to 20x.
- Pan — middle mouse button or Alt + left drag
- Grid — toggleable, spacing adapts to zoom (5 / 10 / 20 / 50mm). Origin lines slightly brighter.
- Undo / Redo — full history stack. Ctrl+Z / Ctrl+Shift+Z. History-tracked: add point, add segment, add shape, delete, commit move, commit multi-move, bezier scale. Non-history: live drag preview, control handle drag in progress.
- Delete — Delete/Backspace removes selected points and all segments referencing them
- Escape — cancels pending segment, deselects all
- Live measurement during drawing — ghost line from last point to cursor shows length label in real time
- Measurement labels — on selected segments, showing mm (and cm for >100mm). Bezier length by 20-sample curve integration.
- Length editor popup — click any segment in Select mode to show a floating panel with the segment's length. Editable number input plus −10/−5/−1/+1/+5/+10 quick buttons. Line: extends p2 along direction. Bezier: scales all moving points proportionally from p1.
- Bezier control handles — dashed lines with purple circles when segment is selected
- Crosshair cursor — in all drawing tool modes
- Keyboard shortcuts — S, P, L, B, R, C, G, Ctrl+Z, Ctrl+Shift+Z, Esc, Delete
- Status bar — live mm coordinates, active tool name, full shortcut reference

**Architecture decisions locked in:**
- Coordinate system: 1 unit = 1mm — carries forward into block engine
- Pattern state: `{points, segments, selected}` — ready for Stage 3 block generation
- Bezier is first-class — crotch curve law built in from day one
- Wheel zoom uses manual `addEventListener` with `passive: false` (React onWheel can't preventDefault)
- React 19 `ref` as plain prop + `useImperativeHandle` — no forwardRef needed
- PatternCanvas wrapped in positioned div to allow DOM overlay panels (LengthEditor)
- Right-click drag uses `rightClickWasRect` ref to avoid context-menu cancel conflict

### Known issues or limitations:
- Point drag does not merge onto an existing point on snap — moves to that position but stays as a separate point. Snapping during drag is visual only.
- No measurement input form — canvas is hand-drawing only. Block auto-generation in Stage 3.
- No save/load — pattern state in memory only. File persistence in Stage 1 extension or early Stage 3.
- No export (PDF/SVG/DXF) — Stage 5.

### What Stage 2 will build on top of this:
Split view — Three.js mannequin on the right panel, live geometric sync with the 2D canvas on the left. Canvas becomes left 60% of a split layout. Right 40% is a Three.js scene with a parametric body avatar that updates in real time as pattern pieces are edited. Two-way: dragging a seam point in 3D updates the 2D canvas. OrbitControls rotation. Front/back/side camera presets. Draggable divider between panels.

---

## Stage 2 — Split View with Live 3D Sync
Status: NOT STARTED

## Stage 3 — Trouser Block Engine
Status: NOT STARTED

## Stage 4 — Shirt Block Engine
Status: NOT STARTED

## Stage 5 — Pattern Tools
Status: NOT STARTED

## Stage 6 — Grading
Status: NOT STARTED

## Stage 7 — Technical Flats
Status: NOT STARTED

## Stage 8 — Tech Pack Generator
Status: NOT STARTED

## Stage 9 — Fabric Physics
Status: NOT STARTED

## Stage 10 — GARMENTTRACK Bridge
Status: NOT STARTED
