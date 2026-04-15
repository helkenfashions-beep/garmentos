# GarmentOS — Build Progress

## Current Stage: Stage 2 Complete

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
Status: COMPLETE
Date: April 15 2026
Commit: e1dfb1a

### What was built:

**New files:**
- `src/hooks/useMeasurements.js` — measurement state hook, ISO 8559 European defaults (all values in mm)
- `src/components/MeasurementPanel.jsx` — 7-field input panel (height, chest, waist, hip, body rise, shoulder width, back waist length), cm display stored internally as mm, close button
- `src/components/MannequinViewer.jsx` — full Three.js 3D scene (see below)

**Modified files:**
- `src/App.jsx` — rewritten as split-view shell
- `src/components/PatternCanvas.jsx` — added `onPatternChange` prop with 80ms debounced sync

**MannequinViewer capabilities:**
- WebGL renderer (Three.js v0.183), antialias, dark background (#0d1117)
- Procedural parametric mannequin body scaled from measurement inputs:
  - Torso: LatheGeometry profile (12-point curve revolved 360° around Y axis), proportional to chest/waist/hip/seat girths and backWaistLength
  - Head: SphereGeometry
  - Shoulder caps: spheres at shoulder junction
  - Legs: tapered CylinderGeometry pairs (upper + lower, with foot stub)
  - Arms: tapered CylinderGeometry pairs (upper arm + forearm)
  - All dimensions derived from measurements — body rescales in real time when measurements change
- Lighting: ambient + directional key + blue-grey fill
- OrbitControls — drag to rotate, scroll to zoom, right-drag to pan
- Camera preset buttons: Front / Back / Left / Right
- Orbit target automatically centres on waist height
- ResizeObserver — camera aspect and renderer size update when panel is resized
- Pattern sync: receives `patternState` from 2D canvas, draws all segments as blue THREE.LineSegments centred at waist height, 80mm in front of mannequin body. Y axis inverted (SVG Y-down → Three.js Y-up). Bezier curves sampled at 20 points.

**App.jsx layout:**
- Header: GarmentOS title + view mode toggle (2D / 2D|3D / 3D) + Measurements button
- View modes: 2D-only (full canvas), Split (60/40 default), 3D-only (full mannequin)
- Draggable divider: hover turns accent colour, drag resizes split ratio (clamped 20–80%)
- Toolbar visible only when canvas panel is shown
- Measurement panel: floating overlay on 3D panel, toggled from header button
- Status bar: adapts to visible panels — shows tool + cursor coords for 2D, rotation hint for 3D

**Architecture decisions:**
- Body dimensions all in mm — same coordinate system as the 2D canvas
- Pattern sync debounced 80ms — live drag does not flood the 3D scene
- Scene teardown fully cleans up: geometry/material disposal, OrbitControls.dispose(), ResizeObserver.disconnect(), animationFrame cancel
- Three.js import path: `three/addons/controls/OrbitControls.js` (v0.155+ path)

### Known limitations at this stage:
- Pattern pieces displayed as flat lines floating in front of mannequin — geometric draping onto body surface is Stage 3
- Mannequin is procedurally built from primitives — will be replaced with MakeHuman/Anny mesh in Stage 2b
- Two-way sync (drag point on 3D → update 2D canvas) not yet implemented — Stage 3 item
- East African body defaults not yet active — European ISO 8559 size 40 loaded on launch

### What Stage 3 will build on top of this:
Trouser block engine — full Winifred Aldrich formula set generating the trouser block directly into the 2D canvas. Construction lines (horizontal guides: waist, hip, rise, knee, ankle), crease line, front panel, back panel, bezier crotch curve, darts. East African calibration layer architecture. The generated block syncs to the 3D panel through the existing pattern sync bridge.

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
