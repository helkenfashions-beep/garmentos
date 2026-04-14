# GarmentOS — Build Progress

## Current Stage: Stage 1 Complete

---

## Stage 1 — 2D Canvas Foundation
Status: COMPLETE
Date: April 14 2026
Commit: 96077e7

### What was built:

**New files:**
- `src/utils/geometry.js` — coordinate math library (distance, snap detection, bezier point sampling, arc length approximation, line/bezier hit testing, viewport coordinate conversion, measurement formatting, grid line generation)
- `src/index.css` — full rewrite with Tailwind v4 `@theme` block, dark professional palette (GitHub Dark base), CSS reset, scrollbar styling
- `src/components/Toolbar.jsx` — left tool panel with Select, Point, Line, Bezier tools, grid toggle, undo/redo buttons. Active tool highlighted with accent border. Disabled state for undo/redo when unavailable.
- `src/components/PatternCanvas.jsx` — SVG drawing canvas (full feature set, see below)
- `src/App.jsx` — full rewrite, shell layout: header bar + toolbar + canvas + status bar with live cursor coordinates

**Canvas capabilities:**
- SVG-based drawing surface — 1 SVG unit = 1mm throughout the entire system
- `Select` tool — click to select points, drag to move, click segments to select both endpoints, drag bezier control handles
- `Point` tool — place anchor points directly on canvas
- `Line` tool — click two points to draw a straight line segment, chains to next segment automatically
- `Bezier` tool — click two points to draw a cubic bezier curve. Default control points at 1/3 and 2/3 of segment length. Draggable handles visible when segment is selected.
- Snap-to-point — 10px snap radius in screen space, scales with zoom. Green indicator ring on snap target.
- Zoom — mouse wheel, zooms toward cursor position. Range 0.2x to 20x.
- Pan — middle mouse button drag, or Alt + left drag
- Grid — toggleable, spacing adapts to zoom level (5mm / 10mm / 20mm / 50mm). Origin lines slightly brighter.
- Undo / Redo — full history stack via `useHistoryReducer`. Ctrl+Z / Ctrl+Shift+Z. History-tracked: add point, add segment, delete, commit move. Non-history (live): drag preview, control handle drag.
- Delete — Delete/Backspace removes selected points and all segments that reference them
- Escape — cancels pending segment, deselects all
- Right-click — cancels pending segment
- Measurement labels — appear on selected segments showing length in mm (and cm for lengths over 100mm). Bezier length calculated by curve sampling (20 samples).
- Bezier control handles — displayed as dashed lines to anchors with purple handle circles when segment is selected
- Preview line — dashed ghost line from the last placed point to the cursor while drawing
- Crosshair — visible cursor crosshair when in any drawing tool mode
- Keyboard shortcuts — S (Select), P (Point), L (Line), B (Bezier), G (Grid toggle), Ctrl+Z (Undo), Ctrl+Shift+Z (Redo), Esc (Cancel), Delete (Delete selected)
- Status bar — live cursor position in mm, active tool name, shortcut reference

**Architecture decisions locked in:**
- Coordinate system: 1 unit = 1mm — carries forward into block engine
- Pattern state shape: `{points, segments, selected}` — ready for Stage 3 block generation to write directly into
- Bezier is a first-class segment type — crotch curve law is built in from day one
- Wheel zoom uses manual `addEventListener` with `passive: false` — React synthetic `onWheel` cannot `preventDefault()`
- React 19 `ref` as plain prop with `useImperativeHandle` — no `forwardRef` wrapper needed

### Known issues or limitations:
- Point drag does not merge onto an existing point when released on snap — currently moves to that position but stays as a separate point. Snapping during drag is visual only.
- Control handle drag for bezier curves is implemented in the reducer but the mousedown detection for handles (in the Select tool flow) needs the handles to be visible — works when both endpoints are selected first.
- No marquee/box selection — can only select one point at a time by clicking. Multi-select via segment click selects both endpoints.
- No measurement input form yet — canvas is hand-drawing only at this stage. Block auto-generation comes in Stage 3.
- No save/load — pattern state lives in component memory only. File persistence is a Stage 1 extension or early Stage 3 item.
- No export (PDF/SVG/DXF) — Stage 5 pattern tools.

### What Stage 2 will build on top of this:
Split view — Three.js mannequin on the right panel, live geometric sync with the 2D canvas on the left. The canvas becomes the left 60% of a split layout. Right 40% is a Three.js scene with a parametric body avatar that updates in real time as pattern pieces are edited. Two-way: dragging a seam point in 3D updates the 2D canvas coordinates. OrbitControls for rotation. Front/back/side camera presets. Draggable divider between panels.

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
