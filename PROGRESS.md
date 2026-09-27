# GarmentOS — Build Progress

## Current Stage: Stage 3b Complete (live drape, two-way sync, Android offline app)

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
Status: COMPLETE
Date: April 15 2026

### What was built:

**New files:**
- `src/lib/blocks/trouserBlock.js` — pure math engine: Winifred Aldrich formula set, generates front + back trouser panel as points/segments in mm. Crotch curves always bezier. Upper thigh used directly for crotch extension, never derived from hip. East African calibration architecture in place.
- `src/components/BlockPanel.jsx` — UI panel: block type selector (Trouser Block), garment fit selector (Trouser/Slacks/Jeans), Generate and Clear buttons

**Modified files:**
- `src/components/PatternCanvas.jsx` — added `LOAD_BLOCK` reducer action; exposed `loadBlock()` and `clearCanvas()` on canvas ref via `useImperativeHandle`; construction lines render as dashed blue-grey with labels (Waist, Hip 1, Hip 2, Rise, Knee, Ankle)
- `src/App.jsx` — wired `BlockPanel` between toolbar and canvas; `handleGenerate` calls `generateTrouserBlock(measurements, garmentType)` and pipes result to `canvasRef.current.loadBlock()`

**Block construction sequence:**
1. Crease line (vertical centre of leg, full length)
2. Horizontal construction lines: Waist, Hip 1, Hip 2, Body Rise, Knee, Ankle — rendered dashed
3. Front panel: waist line, side seam, hem, inseam, fly bezier curve (crotch to CF waist), dart (10cm × 2cm)
4. Back panel: waist line, side seam, hem, inseam, seat bezier curve (fork to CB waist, deep for buttocks), two darts (12cm and 10cm)
5. All widths live-calculated from measurement inputs — block regenerates on demand

**Architecture decisions:**
- Construction lines stored with `construction: true` flag — excluded from 3D sync overlay, rendered separately
- `LOAD_BLOCK` clears canvas and replaces with block — single undo step
- Block lands immediately on canvas as fully editable points and segments
- Crotch curve: both fly (front) and seat (back) use bezier — never arcs
- Upper thigh `m.upperThighGirth` drives crotch fork calculation directly

### Known limitations at this stage:
- Side seam is straight lines between construction points — should be a smooth curve in Stage 5 (pattern tools)
- No ease labels or construction annotations overlaid on canvas yet
- East African calibration coefficients are architecture-ready but not yet populated with data
- Waist-to-knee and waist-to-ankle fall back to height proportions if not measured directly

### What Stage 4 will build on top of this:
Shirt block engine — full Aldrich formula set: back panel, front panel, armscye bezier, button placket, sleeve block. Arm posing controls added to the 3D mannequin for sleeve fit checking.

## Stage 3b — Live Drape, Two-Way Sync, Android (offline app)
Status: COMPLETE
Date: September 27 2026
Branch: mobile-split-view

### What was built:

**Geometric drape engine** (`src/lib/drape/`) — pattern pieces now wrap onto the body instead of floating in front of it.
- `pieces.js` — finds fabric pieces: block panels tagged `seg.piece` (+ `seg.dart` for dart legs) and any hand-drawn closed loop. Construction lines and grainlines are never fabric.
- `drape.js` — each pattern row maps to one body height (1 mm paper = 1 mm body). Front + back panels share the circumference at every height, so side seams and inseams meet. Above the hip the panels wrap half the torso (CF→side→CB); below the crotch they wrap one leg tube; the hand-over between them is where the crotch curve lives, and along the crotch edge it completes exactly at the rise line so front and back forks meet.
- Darts are closed geometrically (the wedge is removed from the row before wrapping) — like sewing them.
- Body collision: fabric can never sit inside the body. Torso push keeps x near CF/CB (so left and right crotch seams stay on the centre line); the two legs are treated as one union where the thighs overlap.
- Both legs are drawn (mirror). Seam lines and dart legs drawn on the fabric.
- `solvePatternPoint()` — Gauss–Newton inverse of the drape map: turns a 3D drag into a 2D pattern move.
- Drape of a full trouser block ≈ 5–15 ms in Node, 60–95 ms in software-rendered headless Chrome.

**Shared body dims** (`src/lib/body/dims.js`) — the mannequin and the drape engine use the same measurements, lathe profiles and radius lookups.

**Two-way sync**
- 2D → 3D: automatic on every edit (80 ms debounce), no button.
- 3D → 2D: orange seam points on the draped garment are draggable (mouse or finger, 30 px touch radius, occlusion-checked). One undo reverts the whole drag.
- Undo fix: a drag used to push the already-moved state onto the undo stack, so undo did nothing. History now records the pre-gesture state (`gestureBase`).

**French-curve trouser seams** (from Benson's drafting notes)
- Outseam hip → knee is an S-curve that flips from the outer to the inner curve at the flip point: `flipY = hip line + (hip to knee length) / 2`. Tangent-continuous through the flip.
- Inseam fork → knee is a French curve hollowed 1 cm toward the crease.
- Knee → hem ruled straight on both seams.
- Grainline on each panel's crease (arrowed, not fabric).

**Phone / Android**
- Pointer events everywhere: one-finger pan on empty canvas, two-finger pinch zoom, tap tools (point/line/bezier) fire on finger-up so a pinch never drops a stray point, bigger snap/hit radius for fingers.
- Phone layout (width < 760 or height < 520): portrait stacks 2D above 3D with a finger-draggable divider; landscape sits side by side; bottom toolbar; menu sheet holds pattern name, New/Open/Save, block + fit, fabric colour, body type, measurements.
- Fit-to-view tool (F), auto-fit after generate/open.
- Fixed a layout bug (also on desktop): split percentages were of the whole row including toolbar + block panel, pushing the 3D view off-screen.
- 3D camera frames the whole body for any panel shape; depth precision fixed (near plane 50 mm, fabric biased toward camera) so the body no longer shows through the fabric.
- 3D-only mode keeps the canvas mounted — switching views never loses work.

**Offline + files**
- Installable PWA (manifest, icons incl. maskable, Workbox precache of all app assets ≈ 840 KB). Works with no network after first visit.
- Autosave to the device on every change; restored on reopen.
- Save/Open `.garmentos.json` files (`src/lib/storage/patternFile.js`) — pattern, piece metadata, measurements, body type, name. Bad files give a clear message and change nothing.
- Fabric colour swatches (incl. kitenge red), extra measurement fields: upper thigh, knee.

### Tests (every feature run 3× before shipping)
- `npm run test:x3` — 56 unit tests (drape geometry, seams meeting, dart closing, no body penetration, crotch closure, length preservation, inverse solve, French-curve seams, files).
- `npm run e2e:x3` — Playwright on emulated Pixel 7 portrait, Pixel 7 landscape and desktop: live sync both ways with real touch events, undo, pinch, pan, tap tools, finger-drawn pieces draping, divider, menu, install/offline, autosave, save/open. Final run: 60/60, 60/60, 33/33 (touch-only specs skipped on desktop).
- In environments without Playwright's own Chromium, set `PW_CHROMIUM=/path/to/chromium`.

### Known limitations
- Drape is geometric, not physics: no gravity folds/wrinkles; on-demand fabric physics is still Stage 11.
- Only trouser panels have placement rules; hand-drawn pieces wrap the torso front as a generic piece.
- A faint centre line shows below the crotch where the two inner-leg faces meet.
- Moving a construction guide does not move its level in the drape (drape levels come from piece metadata).

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
